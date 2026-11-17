import { randomUUID } from 'node:crypto';
import {
  ServiceError,
  computeKeyState,
  formatHourInLibraryTz,
  formatMovementItem,
} from './domain.js';

export function createRepository(pool) {
  async function transaction(operation) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await client.query("SET LOCAL lock_timeout = '5s'");
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function lockKeyResources(client, reservationId, roomId) {
    const resources = [`chave:reserva:${reservationId}`];
    if (roomId) resources.push(`chave:sala:${roomId}`);
    for (const resource of [...new Set(resources)].sort()) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [resource]);
    }
  }

  async function readByReservation(reservationId, client = pool) {
    const { rows: [delivery] } = await client.query(`
      SELECT * FROM chaves.entregas WHERE reserva_id = $1
    `, [reservationId]);
    const { rows: movements } = await client.query(`
      SELECT * FROM chaves.movimentacoes
      WHERE reserva_id = $1
      ORDER BY ocorrida_em ASC, movimentacao_id ASC
    `, [reservationId]);
    return { delivery: delivery || null, movements };
  }

  return {
    readByReservation,

    async getStatusForReservation(reservationId, reservation = null, now = new Date()) {
      const { delivery, movements } = await readByReservation(reservationId);
      const fimPrevisto = reservation?.fim || delivery?.fim_previsto;
      const inicioPrevisto = reservation?.inicio || delivery?.inicio_previsto;
      const state = computeKeyState(delivery, fimPrevisto, now);
      const baseHistory = inicioPrevisto
        ? [{
            acao: 'Chave na recepção (Aguardando retirada)',
            horario: formatHourInLibraryTz(inicioPrevisto),
            operador: 'Sistema',
          }]
        : [];
      return {
        reserva_id: reservationId,
        sala_id: delivery?.sala_id || reservation?.sala_id || null,
        responsavel_id: delivery?.responsavel_id || reservation?.responsavel_id || null,
        status: state.status,
        atraso_minutos: state.atrasoMinutos,
        atrasoMinutos: state.atrasoMinutos,
        retirada_em: delivery?.retirada_em || null,
        devolvida_em: delivery?.devolvida_em || null,
        devolvida_com_atraso: delivery?.devolvida_com_atraso || false,
        historico: [...baseHistory, ...movements.map(formatMovementItem)],
      };
    },

    async listDeliveriesForReservations(reservationIds) {
      if (!reservationIds.length) return { deliveries: new Map(), movementsByReservation: new Map() };
      const { rows: deliveries } = await pool.query(`
        SELECT * FROM chaves.entregas WHERE reserva_id = ANY($1::uuid[])
      `, [reservationIds]);
      const { rows: movements } = await pool.query(`
        SELECT * FROM chaves.movimentacoes
        WHERE reserva_id = ANY($1::uuid[])
        ORDER BY ocorrida_em ASC, movimentacao_id ASC
      `, [reservationIds]);
      const deliveriesMap = new Map(deliveries.map((d) => [d.reserva_id, d]));
      const movementsMap = new Map();
      for (const mov of movements) {
        const list = movementsMap.get(mov.reserva_id) || [];
        list.push(mov);
        movementsMap.set(mov.reserva_id, list);
      }
      return { deliveries: deliveriesMap, movementsByReservation: movementsMap };
    },

    withdraw({ reservation, actor, operadorNome }) {
      return transaction(async (client) => {
        if (reservation.status !== 'confirmada') {
          throw new ServiceError(422, 'RESERVA_NAO_CONFIRMADA', 'Só é possível retirar a chave de uma reserva confirmada.');
        }
        await lockKeyResources(client, reservation.reserva_id, reservation.sala_id);

        const { rows: [existing] } = await client.query(
          'SELECT status FROM chaves.entregas WHERE reserva_id = $1 FOR UPDATE',
          [reservation.reserva_id],
        );
        if (existing) {
          throw new ServiceError(
            409,
            'CONFLITO_CHAVE',
            existing.status === 'retirada'
              ? 'A chave desta reserva já foi retirada.'
              : 'A chave desta reserva já foi devolvida e encerrada.',
          );
        }

        // Impede retirar a chave se outra reserva da mesma sala ainda estiver com a chave retida.
        const { rows: [unreturned] } = await client.query(`
          SELECT reserva_id FROM chaves.entregas
          WHERE sala_id = $1 AND status = 'retirada'
          LIMIT 1
        `, [reservation.sala_id]);
        if (unreturned) {
          throw new ServiceError(409, 'CHAVE_INDISPONIVEL', 'A chave desta sala ainda não foi devolvida pela reserva anterior.');
        }

        const operatorLabel = (operadorNome || actor.nome || 'Recepção').trim();
        await client.query(`
          INSERT INTO chaves.entregas
            (reserva_id, sala_id, responsavel_id, inicio_previsto, fim_previsto, status)
          VALUES ($1, $2, $3, $4, $5, 'retirada')
        `, [
          reservation.reserva_id,
          reservation.sala_id,
          reservation.responsavel_id,
          reservation.inicio,
          reservation.fim,
        ]);

        await client.query(`
          INSERT INTO chaves.movimentacoes
            (movimentacao_id, reserva_id, sala_id, responsavel_id, tipo, acao, operador_id, operador_nome, observacao)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          randomUUID(),
          reservation.reserva_id,
          reservation.sala_id,
          reservation.responsavel_id,
          'retirada',
          'Retirada da chave realizada',
          actor.id,
          operatorLabel,
          null,
        ]);

        return this.getStatusForReservation(reservation.reserva_id, reservation);
      });
    },

    returnKey({ reservationId, actor, operadorNome, comAtrasoForcado = false, observacao = null, now = new Date() }) {
      return transaction(async (client) => {
        await lockKeyResources(client, reservationId, null);
        const { rows: [existing] } = await client.query(
          'SELECT * FROM chaves.entregas WHERE reserva_id = $1 FOR UPDATE',
          [reservationId],
        );
        if (!existing) {
          throw new ServiceError(409, 'CHAVE_NAO_RETIRADA', 'Não há registro de retirada de chave para esta reserva.');
        }
        await lockKeyResources(client, reservationId, existing.sala_id);
        if (existing.status === 'devolvida') {
          throw new ServiceError(409, 'CHAVE_JA_DEVOLVIDA', 'A devolução da chave desta reserva já foi registrada.');
        }

        const endMs = Date.parse(existing.fim_previsto);
        const nowMs = now.getTime();
        const calculatedDelay = Number.isFinite(endMs) && nowMs > endMs
          ? Math.max(1, Math.floor((nowMs - endMs) / 60_000))
          : 0;
        const devolvidaComAtraso = Boolean(comAtrasoForcado) || calculatedDelay > 0;
        const atrasoMinutos = devolvidaComAtraso ? Math.max(1, calculatedDelay) : 0;
        const operatorLabel = (operadorNome || actor.nome || 'Recepção').trim();
        const note = observacao?.trim() || (devolvidaComAtraso ? 'Devolução registrada com atraso.' : null);

        await client.query(`
          UPDATE chaves.entregas
          SET status = 'devolvida',
              devolvida_em = now(),
              devolvida_com_atraso = $2,
              atraso_minutos = $3
          WHERE reserva_id = $1
        `, [reservationId, devolvidaComAtraso, atrasoMinutos]);

        await client.query(`
          INSERT INTO chaves.movimentacoes
            (movimentacao_id, reserva_id, sala_id, responsavel_id, tipo, acao, operador_id, operador_nome, observacao)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          randomUUID(),
          reservationId,
          existing.sala_id,
          existing.responsavel_id,
          'devolucao',
          'Devolução da chave concluída',
          actor.id,
          operatorLabel,
          note,
        ]);

        const { delivery, movements } = await readByReservation(reservationId, client);
        const baseHistory = [{
          acao: 'Chave na recepção (Aguardando retirada)',
          horario: formatHourInLibraryTz(delivery.inicio_previsto),
          operador: 'Sistema',
        }];
        return {
          reserva_id: reservationId,
          sala_id: delivery.sala_id,
          responsavel_id: delivery.responsavel_id,
          status: 'devolvida',
          atraso_minutos: delivery.atraso_minutos,
          atrasoMinutos: delivery.atraso_minutos,
          devolvida_com_atraso: delivery.devolvida_com_atraso,
          retirada_em: delivery.retirada_em,
          devolvida_em: delivery.devolvida_em,
          historico: [...baseHistory, ...movements.map(formatMovementItem)],
        };
      });
    },
  };
}


import { randomUUID } from 'node:crypto';
import { ServiceError } from './domain.js';

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
    } finally { client.release(); }
  }

  async function lockResources(client, roomId, participantIds) {
    const resources = [`sala:${roomId}`, ...participantIds.map((id) => `discente:${id}`)];
    for (const resource of [...new Set(resources)].sort()) {
      // Bloqueio no banco, compartilhado por processos/réplicas e liberado na transação.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [resource]);
    }
  }

  async function read(id, client = pool) {
    const { rows: [reservation] } = await client.query(`
      SELECT r.*, ARRAY(SELECT p.discente_id FROM reservas.reserva_participantes p
                        WHERE p.reserva_id = r.reserva_id ORDER BY p.discente_id) AS participante_ids
      FROM reservas.reservas r WHERE r.reserva_id = $1
    `, [id]);
    if (!reservation) throw new ServiceError(404, 'RESERVA_NAO_ENCONTRADA', 'Reserva não encontrada.');
    return reservation;
  }

  async function event(client, type, reservation, correlationId) {
    const id = randomUUID();
    const payload = {
      event_id: id, event_type: type, schema_version: 1,
      reservation_id: reservation.reserva_id, occurred_at: new Date().toISOString(),
      correlation_id: correlationId, responsavel_id: reservation.responsavel_id,
      room_id: reservation.sala_id, inicio: reservation.inicio, fim: reservation.fim,
      simulated: true,
    };
    // Identidades/salas são fictícias; a operação e a persistência são reais na demo.
    await client.query(`INSERT INTO reservas.outbox (event_id, reservation_id, event_type, payload)
      VALUES ($1, $2, $3, $4::jsonb)`, [id, reservation.reserva_id, type, JSON.stringify(payload)]);
  }

  return {
    read,
    async available(roomId, inicio, fim) {
      const { rows: [row] } = await pool.query(`SELECT NOT EXISTS (
        SELECT 1 FROM reservas.reservas WHERE sala_id = $1 AND status = 'confirmada'
          AND inicio < $3::timestamptz AND $2::timestamptz < fim
      ) AS disponivel`, [roomId, inicio, fim]);
      return row.disponivel;
    },
    async list(actor, roomId, limit = 50, offset = 0) {
      const { rows } = await pool.query(`
        SELECT r.* FROM reservas.reservas r
        WHERE ($1::boolean OR EXISTS (SELECT 1 FROM reservas.reserva_participantes p
                                      WHERE p.reserva_id = r.reserva_id AND p.discente_id = $2))
          AND ($3::uuid IS NULL OR r.sala_id = $3)
        ORDER BY r.inicio, r.reserva_id LIMIT $4 OFFSET $5
      `, [actor.perfil === 'funcionario', actor.id, roomId || null, limit, offset]);
      return rows;
    },
    create(input, actorId, correlationId) {
      return transaction(async (client) => {
        await lockResources(client, input.sala_id, input.participante_ids);
        const { rows: conflicts } = await client.query(`
          SELECT r.reserva_id FROM reservas.reservas r
          WHERE r.status = 'confirmada' AND r.inicio < $3::timestamptz AND $2::timestamptz < r.fim
            AND (r.sala_id = $1 OR EXISTS (
              SELECT 1 FROM reservas.reserva_participantes p
              WHERE p.reserva_id = r.reserva_id AND p.discente_id = ANY($4::uuid[])))
          LIMIT 1
        `, [input.sala_id, input.inicio, input.fim, input.participante_ids]);
        if (conflicts.length) throw new ServiceError(409, 'CONFLITO_HORARIO', 'Sala ou participante já possui reserva nesse intervalo.');
        const id = randomUUID();
        await client.query(`INSERT INTO reservas.reservas
          (reserva_id, sala_id, responsavel_id, inicio, fim) VALUES ($1, $2, $3, $4, $5)`,
        [id, input.sala_id, actorId, input.inicio, input.fim]);
        await client.query(`INSERT INTO reservas.reserva_participantes (reserva_id, discente_id)
          SELECT $1, unnest($2::uuid[])`, [id, input.participante_ids]);
        const reservation = await read(id, client);
        await event(client, 'reserva.confirmada', reservation, correlationId);
        return reservation;
      });
    },
    cancel(id, actor, correlationId) {
      return transaction(async (client) => {
        const previous = await read(id, client);
        if (actor.perfil !== 'funcionario' && previous.responsavel_id !== actor.id) {
          throw new ServiceError(403, 'CANCELAMENTO_NAO_AUTORIZADO', 'Somente o responsável ou funcionário pode cancelar.');
        }
        await lockResources(client, previous.sala_id, previous.participante_ids);
        await client.query('SELECT reserva_id FROM reservas.reservas WHERE reserva_id = $1 FOR UPDATE', [id]);
        const current = await read(id, client);
        if (current.status === 'cancelada') return current;
        await client.query(`UPDATE reservas.reservas SET status = 'cancelada', cancelada_em = now()
          WHERE reserva_id = $1`, [id]);
        const cancelled = await read(id, client);
        await event(client, 'reserva.cancelada', cancelled, correlationId);
        return cancelled;
      });
    },
  };
}

import { randomUUID } from 'node:crypto';
import {
  ServiceError,
  formatNotificationRow,
  validateReservationEvent,
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

  return {
    // Registra o aviso de forma idempotente: se o mesmo event_id for reentregue pelo broker,
    // ON CONFLICT (event_id) DO NOTHING evita duplicar o aviso e permite enviar ACK seguro.
    recordEvent(rawEvent, messageId = null) {
      const event = validateReservationEvent(rawEvent, messageId);
      return transaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`notificacao:evento:${event.event_id}`]);
        const { rows: [inserted] } = await client.query(`
          INSERT INTO notificacoes.avisos
            (aviso_id, event_id, reservation_id, usuario_id, room_id, event_type, texto, inicio, fim, ocorreu_em)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (event_id) DO NOTHING
          RETURNING *
        `, [
          randomUUID(),
          event.event_id,
          event.reservation_id,
          event.responsavel_id,
          event.room_id,
          event.event_type,
          event.texto,
          event.inicio,
          event.fim,
          event.occurred_at,
        ]);

        if (inserted) {
          return { duplicado: false, aviso: formatNotificationRow(inserted) };
        }
        const { rows: [existing] } = await client.query(
          'SELECT * FROM notificacoes.avisos WHERE event_id = $1',
          [event.event_id],
        );
        return { duplicado: true, aviso: formatNotificationRow(existing) };
      });
    },

    async listForUser(usuarioId, { apenasNaoLidos = false, limit = 50, offset = 0 } = {}) {
      const { rows } = await pool.query(`
        SELECT * FROM notificacoes.avisos
        WHERE usuario_id = $1
          AND ($2::boolean = false OR lido = false)
        ORDER BY criado_em DESC, aviso_id DESC
        LIMIT $3 OFFSET $4
      `, [usuarioId, Boolean(apenasNaoLidos), limit, offset]);
      return rows.map(formatNotificationRow);
    },

    async countUnread(usuarioId) {
      const { rows: [row] } = await pool.query(`
        SELECT count(*)::integer AS total
        FROM notificacoes.avisos
        WHERE usuario_id = $1 AND lido = false
      `, [usuarioId]);
      return row.total;
    },

    markAsRead(avisoId, actor) {
      return transaction(async (client) => {
        const { rows: [current] } = await client.query(
          'SELECT * FROM notificacoes.avisos WHERE aviso_id = $1 FOR UPDATE',
          [avisoId],
        );
        if (!current) {
          throw new ServiceError(404, 'AVISO_NAO_ENCONTRADO', 'Aviso não encontrado.');
        }
        if (current.usuario_id !== actor.id) {
          throw new ServiceError(403, 'LEITURA_NAO_AUTORIZADA', 'Somente o destinatário pode marcar o aviso como lido.');
        }
        if (current.lido) return formatNotificationRow(current);

        const { rows: [updated] } = await client.query(`
          UPDATE notificacoes.avisos
          SET lido = true, lido_em = now()
          WHERE aviso_id = $1
          RETURNING *
        `, [avisoId]);
        return formatNotificationRow(updated);
      });
    },

    async markAllAsRead(usuarioId) {
      const { rowCount } = await pool.query(`
        UPDATE notificacoes.avisos
        SET lido = true, lido_em = now()
        WHERE usuario_id = $1 AND lido = false
      `, [usuarioId]);
      return { atualizados: rowCount };
    },
  };
}


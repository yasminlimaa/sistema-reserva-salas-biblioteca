import { randomUUID } from 'node:crypto';
import { ServiceError } from './domain.js';

// Repositório do serviço de Salas (schema salas).
// Escreve exclusivamente nas tabelas próprias de Salas e usa bloqueios transacionais
// determinísticos para serializar alterações concorrentes na mesma sala.
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
      if (error?.code === '23505') {
        throw new ServiceError(409, 'CONFLITO_SALA', 'Já existe uma sala cadastrada com este identificador ou nome.');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function lockRoom(client, roomId, roomName = null) {
    const resources = [`sala:${roomId}`];
    if (roomName) resources.push(`sala:nome:${roomName.toLowerCase()}`);
    for (const resource of [...new Set(resources)].sort()) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [resource]);
    }
  }

  async function read(id, client = pool) {
    const { rows: [room] } = await client.query(`
      SELECT sala_id, nome, capacidade, bloco, equipamentos, ativa, criada_em, atualizada_em
      FROM salas.salas
      WHERE sala_id = $1
    `, [id]);
    if (!room) throw new ServiceError(404, 'SALA_NAO_ENCONTRADA', 'Sala não encontrada.');
    return room;
  }

  return {
    read,

    async list({ ativa = null, capacidadeMinima = null, limit = 50, offset = 0 } = {}) {
      const { rows } = await pool.query(`
        SELECT sala_id, nome, capacidade, bloco, equipamentos, ativa, criada_em, atualizada_em
        FROM salas.salas
        WHERE ($1::boolean IS NULL OR ativa = $1)
          AND ($2::integer IS NULL OR capacidade >= $2)
        ORDER BY nome, sala_id
        LIMIT $3 OFFSET $4
      `, [ativa ?? null, capacidadeMinima ?? null, limit, offset]);
      return rows;
    },

    create(input) {
      return transaction(async (client) => {
        const id = input.sala_id || randomUUID();
        await lockRoom(client, id, input.nome);
        const { rows: [created] } = await client.query(`
          INSERT INTO salas.salas (sala_id, nome, capacidade, bloco, equipamentos, ativa)
          VALUES ($1, $2, $3, $4, $5::text[], $6)
          RETURNING sala_id, nome, capacidade, bloco, equipamentos, ativa, criada_em, atualizada_em
        `, [id, input.nome, input.capacidade, input.bloco, input.equipamentos, input.ativa]);
        return created;
      });
    },

    update(id, patch) {
      return transaction(async (client) => {
        await lockRoom(client, id, patch.nome);
        const current = await read(id, client);
        const next = {
          nome: patch.nome !== undefined ? patch.nome : current.nome,
          capacidade: patch.capacidade !== undefined ? patch.capacidade : current.capacidade,
          bloco: patch.bloco !== undefined ? patch.bloco : current.bloco,
          equipamentos: patch.equipamentos !== undefined ? patch.equipamentos : current.equipamentos,
        };
        const { rows: [updated] } = await client.query(`
          UPDATE salas.salas
          SET nome = $2,
              capacidade = $3,
              bloco = $4,
              equipamentos = $5::text[],
              atualizada_em = now()
          WHERE sala_id = $1
          RETURNING sala_id, nome, capacidade, bloco, equipamentos, ativa, criada_em, atualizada_em
        `, [id, next.nome, next.capacidade, next.bloco, next.equipamentos]);
        return updated;
      });
    },

    setActive(id, ativa) {
      return transaction(async (client) => {
        await lockRoom(client, id);
        await client.query('SELECT sala_id FROM salas.salas WHERE sala_id = $1 FOR UPDATE', [id]);
        const current = await read(id, client);
        // Operação idempotente: repetir ativação ou desativação retorna o estado atual sem erro.
        if (current.ativa === ativa) return current;
        const { rows: [updated] } = await client.query(`
          UPDATE salas.salas
          SET ativa = $2, atualizada_em = now()
          WHERE sala_id = $1
          RETURNING sala_id, nome, capacidade, bloco, equipamentos, ativa, criada_em, atualizada_em
        `, [id, ativa]);
        return updated;
      });
    },
  };
}


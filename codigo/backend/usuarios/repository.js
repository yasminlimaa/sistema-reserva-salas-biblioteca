import { randomBytes, randomUUID } from 'node:crypto';
import {
  ServiceError,
  formatPublicUser,
  hashToken,
  verifyPassword,
} from './domain.js';

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

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
        throw new ServiceError(409, 'USUARIO_JA_CADASTRADO', 'Já existe uma conta cadastrada com este e-mail ou matrícula.');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function createSession(client, usuarioId) {
    const rawToken = randomBytes(32).toString('hex');
    const tokenSha256 = hashToken(rawToken);
    const expiraEm = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
    await client.query(`
      INSERT INTO usuarios.sessoes (sessao_id, usuario_id, token_sha256, expira_em)
      VALUES ($1, $2, $3, $4)
    `, [randomUUID(), usuarioId, tokenSha256, expiraEm]);
    return rawToken;
  }

  return {
    async register(input) {
      return transaction(async (client) => {
        const id = input.usuario_id || randomUUID();
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`usuario:email:${input.email}`]);
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`usuario:matricula:${input.matricula}`]);
        const { rows: [created] } = await client.query(`
          INSERT INTO usuarios.usuarios
            (usuario_id, nome, email, matricula, unidade, telefone, perfil, senha_hash, ativo)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
          RETURNING usuario_id, nome, email, matricula, unidade, telefone, perfil, ativo, criado_em
        `, [
          id,
          input.nome,
          input.email,
          input.matricula,
          input.unidade,
          input.telefone,
          input.perfil,
          input.senha_hash,
        ]);
        const token = await createSession(client, created.usuario_id);
        return { usuario: formatPublicUser(created), token };
      });
    },

    async login({ email, senha, perfil }) {
      return transaction(async (client) => {
        const { rows: [user] } = await client.query(`
          SELECT usuario_id, nome, email, matricula, unidade, telefone, perfil, senha_hash, ativo, criado_em
          FROM usuarios.usuarios
          WHERE email = $1
        `, [email]);
        if (!user || !verifyPassword(senha, user.senha_hash)) {
          throw new ServiceError(401, 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha incorretos.');
        }
        if (!user.ativo) {
          throw new ServiceError(403, 'USUARIO_INATIVO', 'Esta conta encontra-se desativada.');
        }
        if (perfil && user.perfil !== perfil) {
          throw new ServiceError(403, 'PERFIL_INCOMPATIVEL', 'O e-mail informado pertence a outro perfil de acesso.');
        }
        const token = await createSession(client, user.usuario_id);
        return { usuario: formatPublicUser(user), token };
      });
    },

    async findBySessionToken(rawToken) {
      const tokenSha256 = hashToken(rawToken);
      const { rows: [user] } = await pool.query(`
        SELECT u.usuario_id, u.nome, u.email, u.matricula, u.unidade, u.telefone, u.perfil, u.ativo, u.criado_em
        FROM usuarios.sessoes s
        JOIN usuarios.usuarios u ON u.usuario_id = s.usuario_id
        WHERE s.token_sha256 = $1
          AND s.revogada_em IS NULL
          AND s.expira_em > now()
          AND u.ativo = true
      `, [tokenSha256]);
      return user ? formatPublicUser(user) : null;
    },

    async revokeSessionToken(rawToken) {
      const tokenSha256 = hashToken(rawToken);
      await pool.query(`
        UPDATE usuarios.sessoes
        SET revogada_em = now()
        WHERE token_sha256 = $1 AND revogada_em IS NULL
      `, [tokenSha256]);
    },

    async read(id) {
      const { rows: [user] } = await pool.query(`
        SELECT usuario_id, nome, email, matricula, unidade, telefone, perfil, ativo, criado_em
        FROM usuarios.usuarios
        WHERE usuario_id = $1
      `, [id]);
      if (!user) throw new ServiceError(404, 'USUARIO_NAO_ENCONTRADO', 'Usuário não encontrado.');
      return formatPublicUser(user);
    },

    async searchStudents({ termo = '', limit = 50, offset = 0 } = {}) {
      const cleanTerm = termo.trim();
      const { rows } = await pool.query(`
        SELECT usuario_id, nome, email, matricula, unidade, telefone, perfil, ativo, criado_em
        FROM usuarios.usuarios
        WHERE perfil = 'discente'
          AND ativo = true
          AND ($1::text = '' OR nome ILIKE '%' || $1 || '%' OR matricula LIKE '%' || $1 || '%')
        ORDER BY nome, usuario_id
        LIMIT $2 OFFSET $3
      `, [cleanTerm, limit, offset]);
      return rows.map(formatPublicUser);
    },

    async validateStudents(ids) {
      const uniqueIds = [...new Set(ids.map((id) => id.toLowerCase()))];
      const { rows } = await pool.query(`
        SELECT usuario_id, nome, email, matricula, unidade, telefone, perfil, ativo, criado_em
        FROM usuarios.usuarios
        WHERE usuario_id = ANY($1::uuid[])
          AND perfil = 'discente'
          AND ativo = true
      `, [uniqueIds]);
      if (rows.length !== uniqueIds.length) {
        throw new ServiceError(422, 'DISCENTE_INVALIDO', 'Todos os participantes devem ser discentes ativos cadastrados.');
      }
      return rows.map(formatPublicUser);
    },
  };
}


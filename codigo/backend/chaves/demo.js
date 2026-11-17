import { timingSafeEqual } from 'node:crypto';
import { ServiceError } from './domain.js';

export const students = [
  { id: '10000000-0000-4000-8000-000000000001', nome: 'Gabriel André Barreto', matricula: '2024001301', perfil: 'discente', ativo: true },
  { id: '10000000-0000-4000-8000-000000000002', nome: 'Gabriela Lopes', matricula: '2024008812', perfil: 'discente', ativo: true },
  { id: '10000000-0000-4000-8000-000000000003', nome: 'Yasmin Serejo', matricula: '2025007136', perfil: 'discente', ativo: true },
  { id: '10000000-0000-4000-8000-000000000004', nome: 'Ana Clara Martins', matricula: '2024012408', perfil: 'discente', ativo: true },
  { id: '10000000-0000-4000-8000-000000000005', nome: 'Lucas Oliveira', matricula: '2024021917', perfil: 'discente', ativo: true },
  { id: '10000000-0000-4000-8000-000000000006', nome: 'Mariana Costa', matricula: '2024005540', perfil: 'discente', ativo: true },
];

export const employee = {
  id: '10000000-0000-4000-8000-000000000099',
  nome: 'Funcionário fictício',
  matricula: '1234567',
  perfil: 'funcionario',
  ativo: true,
};

export const fallbackRooms = [
  { sala_id: '20000000-0000-4000-8000-000000000001', nome: 'Sala 01', capacidade: 6, ativa: true },
  { sala_id: '20000000-0000-4000-8000-000000000002', nome: 'Sala 02', capacidade: 8, ativa: true },
  { sala_id: '20000000-0000-4000-8000-000000000003', nome: 'Sala 03', capacidade: 10, ativa: false },
];

const tokenDefinitions = [
  ['DEMO_TOKEN_DISCENTE_A', students[0]],
  ['DEMO_TOKEN_DISCENTE_D', students[3]],
  ['DEMO_TOKEN_FUNCIONARIO', employee],
];

export function createDemoAdapter(env = process.env, { fetchImpl = fetch, timeoutMs = 5_000 } = {}) {
  if (env.DEMO_MODE !== 'true' || env.NODE_ENV === 'production') {
    throw new Error('Esta versão exige DEMO_MODE=true e recusa NODE_ENV=production.');
  }
  const identities = tokenDefinitions.map(([name, user]) => {
    const token = env[name];
    if (!token || token.length < 32) {
      throw new Error(`Configure ${name} com um token local de ao menos 32 caracteres.`);
    }
    return [Buffer.from(token), user];
  });
  if (new Set(identities.map(([token]) => token.toString())).size !== identities.length) {
    throw new Error('Os tokens da demo devem ser distintos.');
  }

  const reservasBase = (env.RESERVAS_API_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');
  const salasBase = env.SALAS_API_URL ? env.SALAS_API_URL.replace(/\/+$/, '') : null;
  const usuariosBase = env.USUARIOS_API_URL ? env.USUARIOS_API_URL.replace(/\/+$/, '') : null;
  const serviceHeader = { authorization: `Bearer ${env.DEMO_TOKEN_FUNCIONARIO}` };

  return {
    authenticate(header) {
      const match = /^Bearer (\S+)$/.exec(header || '');
      if (match) {
        const supplied = Buffer.from(match[1]);
        for (const [token, user] of identities) {
          if (token.length === supplied.length && timingSafeEqual(token, supplied)) return user;
        }
      }
      throw new ServiceError(401, 'NAO_AUTENTICADO', 'Token de demonstração ausente ou inválido.');
    },

    async getReservation(reservaId) {
      let response;
      try {
        response = await fetchImpl(`${reservasBase}/reservas/${encodeURIComponent(reservaId)}`, {
          method: 'GET',
          headers: serviceHeader,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new ServiceError(503, 'DEPENDENCIA_INDISPONIVEL', 'Serviço de Reservas indisponível.');
      }
      if (response.status === 404) {
        throw new ServiceError(404, 'RESERVA_NAO_ENCONTRADA', 'Reserva não encontrada no serviço de Reservas.');
      }
      if (response.status !== 200) {
        throw new ServiceError(503, 'DEPENDENCIA_INDISPONIVEL', 'Não foi possível consultar a reserva.');
      }
      return response.json();
    },

    async listReservationsByDate(data) {
      let response;
      try {
        response = await fetchImpl(`${reservasBase}/reservas?limite=100&offset=0&data=${encodeURIComponent(data)}`, {
          method: 'GET',
          headers: serviceHeader,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new ServiceError(503, 'DEPENDENCIA_INDISPONIVEL', 'Serviço de Reservas indisponível.');
      }
      if (response.status !== 200) {
        throw new ServiceError(503, 'DEPENDENCIA_INDISPONIVEL', 'Não foi possível listar as reservas do dia.');
      }
      const body = await response.json();
      return (body.reservas || []).filter(
        (r) => r.status === 'confirmada' && String(r.inicio).slice(0, 10) === data,
      );
    },

    async listRooms() {
      if (!salasBase) return fallbackRooms;
      let response;
      try {
        response = await fetchImpl(`${salasBase}/salas?limite=100&offset=0`, {
          method: 'GET',
          headers: serviceHeader,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new ServiceError(503, 'DEPENDENCIA_INDISPONIVEL', 'Serviço de Salas indisponível.');
      }
      if (response.status !== 200) {
        throw new ServiceError(503, 'DEPENDENCIA_INDISPONIVEL', 'Não foi possível listar as salas.');
      }
      const body = await response.json();
      return body.salas || [];
    },

    async resolveResponsible(userId) {
      const local = students.find((s) => s.id === userId);
      if (!usuariosBase) {
        return local || { id: userId, nome: 'Discente Responsável', matricula: '---' };
      }
      try {
        const response = await fetchImpl(`${usuariosBase}/usuarios/${encodeURIComponent(userId)}`, {
          method: 'GET',
          headers: serviceHeader,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.status === 200) return response.json();
      } catch {
        // Fallback para catálogo local em modo demo se Usuários não estiver ativo.
      }
      return local || { id: userId, nome: 'Discente Responsável', matricula: '---' };
    },
  };
}


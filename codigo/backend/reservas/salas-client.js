import { ServiceError } from './domain.js';

function indisponivel() {
  return new ServiceError(503, 'DEPENDENCIA_INDISPONIVEL', 'Serviço de Salas indisponível para validar a sala.');
}

// Adaptador HTTP para validar existência e estado (ativa) da sala no serviço de Salas.
export function createSalasClient(baseUrl, { fetchImpl = fetch, timeoutMs = 5_000, serviceToken = null } = {}) {
  if (!baseUrl?.trim()) throw new Error('Defina a URL base do serviço de Salas (SALAS_API_URL).');
  const normalizedBase = baseUrl.replace(/\/+$/, '');

  return {
    async validateRoom(id, authorization) {
      const authHeader = authorization || (serviceToken ? `Bearer ${serviceToken}` : undefined);
      let response;
      try {
        response = await fetchImpl(`${normalizedBase}/salas/${encodeURIComponent(id)}`, {
          method: 'GET', headers: authHeader ? { authorization: authHeader } : {}, signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw indisponivel();
      }
      if (response.status === 401) throw new ServiceError(401, 'NAO_AUTENTICADO', 'Sessão expirada ou token inválido.');
      if (response.status === 403) throw new ServiceError(403, 'ACESSO_NAO_AUTORIZADO', 'A identidade autenticada não tem autorização para consultar a sala.');
      if (response.status === 404 || response.status === 422) throw new ServiceError(422, 'SALA_INVALIDA', 'Sala inexistente ou inativa.');
      if (response.status !== 200) throw indisponivel();
      let room;
      try { room = await response.json(); } catch { throw indisponivel(); }
      if (!room || (room.sala_id ?? room.id) !== id || room.ativa !== true) {
        throw new ServiceError(422, 'SALA_INVALIDA', 'Sala inexistente ou inativa.');
      }
      return room;
    },
  };
}

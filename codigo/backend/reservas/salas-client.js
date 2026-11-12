import { ServiceError } from './domain.js';

// Adaptador HTTP para validar existência e estado (ativa) da sala no serviço de Salas.
// Quando SALAS_API_URL está configurada, substitui a validação fictícia em memória,
// respeitando timeout e falhando explicitamente com 503 sem fallback silencioso.
export function createSalasClient(baseUrl, { fetchImpl = fetch, timeoutMs = 5_000, serviceToken = null } = {}) {
  if (!baseUrl?.trim()) {
    throw new Error('Defina a URL base do serviço de Salas (SALAS_API_URL).');
  }
  const normalizedBase = baseUrl.replace(/\/+$/, '');

  return {
    async validateRoom(id, authorization) {
      const authHeader = authorization || (serviceToken ? `Bearer ${serviceToken}` : undefined);
      let response;
      try {
        response = await fetchImpl(`${normalizedBase}/salas/${encodeURIComponent(id)}`, {
          method: 'GET',
          headers: authHeader ? { authorization: authHeader } : {},
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new ServiceError(503, 'DEPENDENCIA_INDISPONIVEL', 'Serviço de Salas indisponível para validar a sala.');
      }

      if (response.status === 404) {
        throw new ServiceError(422, 'SALA_INVALIDA', 'Sala inexistente ou inativa.');
      }
      if (response.status === 200) {
        const room = await response.json().catch(() => null);
        if (!room || !room.ativa) {
          throw new ServiceError(422, 'SALA_INVALIDA', 'Sala inexistente ou inativa.');
        }
        return room;
      }
      throw new ServiceError(503, 'DEPENDENCIA_INDISPONIVEL', 'Serviço de Salas indisponível para validar a sala.');
    },
  };
}


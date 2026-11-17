import { ServiceError } from './domain.js';

// Adaptador HTTP para autenticar sessões e validar participantes junto ao serviço de Usuários.
export function createUsuariosClient(baseUrl, { fetchImpl = fetch, timeoutMs = 5_000, serviceToken = null } = {}) {
  if (!baseUrl?.trim()) {
    throw new Error('Defina a URL base do serviço de Usuários (USUARIOS_API_URL).');
  }
  const normalizedBase = baseUrl.replace(/\/+$/, '');

  return {
    async authenticate(authorization) {
      if (!authorization) {
        throw new ServiceError(401, 'NAO_AUTENTICADO', 'Token de autenticação ausente ou inválido.');
      }
      let response;
      try {
        response = await fetchImpl(`${normalizedBase}/auth/me`, {
          method: 'GET',
          headers: { authorization },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new ServiceError(503, 'DEPENDENCIA_INDISPONIVEL', 'Serviço de Usuários indisponível para verificar autenticação.');
      }
      if (response.status === 401) {
        throw new ServiceError(401, 'NAO_AUTENTICADO', 'Sessão expirada ou token inválido.');
      }
      if (response.status === 200) {
        return response.json();
      }
      throw new ServiceError(503, 'DEPENDENCIA_INDISPONIVEL', 'Serviço de Usuários indisponível para verificar autenticação.');
    },

    async validateStudents(ids, authorization) {
      const authHeader = authorization || (serviceToken ? `Bearer ${serviceToken}` : undefined);
      let response;
      try {
        response = await fetchImpl(`${normalizedBase}/discentes/validacao`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(authHeader ? { authorization: authHeader } : {}),
          },
          body: JSON.stringify({ discente_ids: ids }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new ServiceError(503, 'DEPENDENCIA_INDISPONIVEL', 'Serviço de Usuários indisponível para validar participantes.');
      }
      if (response.status === 422 || response.status === 400) {
        throw new ServiceError(422, 'DISCENTE_INVALIDO', 'Todos os participantes devem ser discentes ativos cadastrados.');
      }
      if (response.status === 200) {
        return response.json();
      }
      throw new ServiceError(503, 'DEPENDENCIA_INDISPONIVEL', 'Serviço de Usuários indisponível para validar participantes.');
    },
  };
}


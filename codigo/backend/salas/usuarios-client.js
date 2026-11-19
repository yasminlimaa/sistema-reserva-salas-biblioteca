import { ServiceError } from './domain.js';

function normalizarIdentidade(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.id !== 'string' || !data.id.trim()
    || typeof data.usuario_id !== 'string' || data.usuario_id !== data.id
    || !['discente', 'funcionario'].includes(data.perfil)
    || data.ativo !== true) return null;

  return { id: data.id, usuario_id: data.usuario_id, perfil: data.perfil, ativo: true };
}

// Autoridade de identidade: o token é verificado exclusivamente pelo serviço de Usuários.
export function createUsuariosClient(baseUrl, { fetchImpl = fetch, timeoutMs = 5_000 } = {}) {
  if (!baseUrl?.trim()) throw new Error('Defina a URL base do serviço de Usuários (USUARIOS_API_URL).');
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
      if (response.status !== 200) {
        throw new ServiceError(503, 'DEPENDENCIA_INDISPONIVEL', 'Serviço de Usuários indisponível para verificar autenticação.');
      }

      let data;
      try {
        data = await response.json();
      } catch {
        throw new ServiceError(503, 'DEPENDENCIA_INDISPONIVEL', 'Serviço de Usuários retornou uma identidade inválida.');
      }
      const identity = normalizarIdentidade(data);
      if (!identity) {
        throw new ServiceError(503, 'DEPENDENCIA_INDISPONIVEL', 'Serviço de Usuários retornou uma identidade inválida.');
      }
      return identity;
    },
  };
}

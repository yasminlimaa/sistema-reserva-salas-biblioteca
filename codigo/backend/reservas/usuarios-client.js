import { ServiceError } from './domain.js';

function indisponivel(mensagem) {
  return new ServiceError(503, 'DEPENDENCIA_INDISPONIVEL', mensagem);
}

function identidadeValida(data) {
  return data && typeof data === 'object'
    && typeof data.id === 'string' && data.id.trim()
    && data.usuario_id === data.id
    && ['discente', 'funcionario'].includes(data.perfil)
    && data.ativo === true;
}

function discentesValidos(data, ids) {
  if (!data || data.validos !== true || !Array.isArray(data.discentes) || data.discentes.length !== ids.length) return false;
  const esperados = new Set(ids);
  return data.discentes.every((discente) => (
    discente && esperados.has(discente.id ?? discente.usuario_id)
      && discente.perfil === 'discente' && discente.ativo === true
  ));
}

// Adaptador HTTP para autenticar sessões e validar participantes junto ao serviço de Usuários.
export function createUsuariosClient(baseUrl, { fetchImpl = fetch, timeoutMs = 5_000, serviceToken = null } = {}) {
  if (!baseUrl?.trim()) throw new Error('Defina a URL base do serviço de Usuários (USUARIOS_API_URL).');
  const normalizedBase = baseUrl.replace(/\/+$/, '');

  async function requisitar(caminho, options, mensagemIndisponivel) {
    try {
      return await fetchImpl(`${normalizedBase}${caminho}`, { ...options, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw indisponivel(mensagemIndisponivel);
    }
  }

  return {
    async authenticate(authorization) {
      if (!authorization) throw new ServiceError(401, 'NAO_AUTENTICADO', 'Token de autenticação ausente ou inválido.');
      const response = await requisitar('/auth/me', { method: 'GET', headers: { authorization } }, 'Serviço de Usuários indisponível para verificar autenticação.');
      if (response.status === 401) throw new ServiceError(401, 'NAO_AUTENTICADO', 'Sessão expirada ou token inválido.');
      if (response.status === 403) throw new ServiceError(403, 'ACESSO_NAO_AUTORIZADO', 'A identidade autenticada não tem autorização para esta operação.');
      if (response.status !== 200) throw indisponivel('Serviço de Usuários indisponível para verificar autenticação.');
      let data;
      try { data = await response.json(); } catch { throw indisponivel('Serviço de Usuários retornou uma identidade inválida.'); }
      if (!identidadeValida(data)) throw indisponivel('Serviço de Usuários retornou uma identidade inválida.');
      return { id: data.id, usuario_id: data.usuario_id, perfil: data.perfil, ativo: true };
    },

    async validateStudents(ids, authorization) {
      const authHeader = authorization || (serviceToken ? `Bearer ${serviceToken}` : undefined);
      const response = await requisitar('/discentes/validacao', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(authHeader ? { authorization: authHeader } : {}) },
        body: JSON.stringify({ discente_ids: ids }),
      }, 'Serviço de Usuários indisponível para validar participantes.');
      if (response.status === 401) throw new ServiceError(401, 'NAO_AUTENTICADO', 'Sessão expirada ou token inválido.');
      if (response.status === 403) throw new ServiceError(403, 'ACESSO_NAO_AUTORIZADO', 'A identidade autenticada não tem autorização para validar participantes.');
      if (response.status === 400 || response.status === 422) throw new ServiceError(422, 'DISCENTE_INVALIDO', 'Todos os participantes devem ser discentes ativos cadastrados.');
      if (response.status !== 200) throw indisponivel('Serviço de Usuários indisponível para validar participantes.');
      let data;
      try { data = await response.json(); } catch { throw indisponivel('Serviço de Usuários retornou uma validação inválida.'); }
      if (!discentesValidos(data, ids)) throw indisponivel('Serviço de Usuários retornou uma validação inválida.');
      return data;
    },
  };
}

import { ServiceError } from './domain.js';

function indisponivel() {
  return new ServiceError(503, 'DEPENDENCIA_INDISPONIVEL', 'Serviço de Reservas indisponível para consultar a disponibilidade do horário.');
}

// Adaptador HTTP para consultar a autoridade de ocupação no serviço de Reservas.
export function createReservasClient(baseUrl, { fetchImpl = fetch, timeoutMs = 5_000, serviceToken = null } = {}) {
  if (!baseUrl?.trim()) throw new Error('Defina a URL base do serviço de Reservas (RESERVAS_API_URL).');
  const normalizedBase = baseUrl.replace(/\/+$/, '');

  return {
    async checkAvailability({ salaId, inicio, fim, authorization }) {
      const authHeader = authorization || (serviceToken ? `Bearer ${serviceToken}` : undefined);
      const query = new URLSearchParams({ sala_id: salaId, inicio, fim });
      let response;
      try {
        response = await fetchImpl(`${normalizedBase}/disponibilidade?${query}`, {
          method: 'GET', headers: authHeader ? { authorization: authHeader } : {}, signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw indisponivel();
      }
      if (response.status === 401) throw new ServiceError(401, 'NAO_AUTENTICADO', 'Sessão expirada ou token inválido.');
      if (response.status === 403) throw new ServiceError(403, 'ACESSO_NAO_AUTORIZADO', 'A identidade autenticada não tem autorização para consultar a disponibilidade.');
      let data;
      try { data = await response.json(); } catch { throw indisponivel(); }
      if (response.status === 200 && typeof data?.disponivel === 'boolean') {
        return { disponivel: data.disponivel, aviso: data.aviso || 'Consulta de sala não garante criação nem valida conflitos dos participantes.' };
      }
      if (response.status === 400) throw new ServiceError(400, data?.codigo || 'INTERVALO_INVALIDO', data?.mensagem || 'Intervalo inválido.');
      if (response.status === 422) throw new ServiceError(422, data?.codigo || 'SALA_INVALIDA', data?.mensagem || 'Sala inválida para consulta.');
      throw indisponivel();
    },
  };
}

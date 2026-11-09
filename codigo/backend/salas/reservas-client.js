import { ServiceError } from './domain.js';

// Adaptador HTTP para consultar a autoridade de ocupação no serviço de Reservas.
// Conforme a arquitetura do projeto, Salas não mantém algoritmo próprio de conflitos
// nem consulta diretamente o schema privado reservas.
export function createReservasClient(baseUrl, { fetchImpl = fetch, timeoutMs = 5_000, serviceToken = null } = {}) {
  if (!baseUrl?.trim()) {
    throw new Error('Defina a URL base do serviço de Reservas (RESERVAS_API_URL).');
  }
  const normalizedBase = baseUrl.replace(/\/+$/, '');

  return {
    async checkAvailability({ salaId, inicio, fim, authorization }) {
      const authHeader = authorization || (serviceToken ? `Bearer ${serviceToken}` : undefined);
      const query = new URLSearchParams({ sala_id: salaId, inicio, fim });
      let response;
      try {
        response = await fetchImpl(`${normalizedBase}/disponibilidade?${query}`, {
          method: 'GET',
          headers: authHeader ? { authorization: authHeader } : {},
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new ServiceError(
          503,
          'DEPENDENCIA_INDISPONIVEL',
          'Serviço de Reservas indisponível para consultar a disponibilidade do horário.',
        );
      }

      const data = await response.json().catch(() => ({}));
      if (response.status === 200 && typeof data.disponivel === 'boolean') {
        return {
          disponivel: data.disponivel,
          aviso: data.aviso || 'Consulta de sala não garante criação nem valida conflitos dos participantes.',
        };
      }
      if (response.status === 400) {
        throw new ServiceError(400, data.codigo || 'INTERVALO_INVALIDO', data.mensagem || 'Intervalo inválido.');
      }
      if (response.status === 401 || response.status === 403) {
        throw new ServiceError(503, 'DEPENDENCIA_INDISPONIVEL', 'Falha de autenticação ao consultar o serviço de Reservas.');
      }
      throw new ServiceError(
        503,
        'DEPENDENCIA_INDISPONIVEL',
        'Serviço de Reservas indisponível para consultar a disponibilidade do horário.',
      );
    },
  };
}


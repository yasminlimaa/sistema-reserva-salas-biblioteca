export class ServiceError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function validateInterval(inicio, fim) {
  const offset = /(?:Z|[+-]\d{2}:\d{2})$/i;
  const start = Date.parse(inicio);
  const end = Date.parse(fim);
  if (!offset.test(inicio) || !offset.test(fim) || !Number.isFinite(start)
      || !Number.isFinite(end) || end <= start || end - start > 7_200_000) {
    throw new ServiceError(400, 'INTERVALO_INVALIDO', 'Informe início e fim com fuso e duração positiva de até duas horas.');
  }
}

export function validateParticipants(ids, actorId) {
  if (new Set(ids).size !== ids.length || ids.length < 3) {
    throw new ServiceError(400, 'PARTICIPANTES_INVALIDOS', 'Informe ao menos três discentes distintos.');
  }
  if (!ids.includes(actorId)) {
    throw new ServiceError(400, 'RESPONSAVEL_AUSENTE', 'O responsável deve estar entre os participantes.');
  }
}

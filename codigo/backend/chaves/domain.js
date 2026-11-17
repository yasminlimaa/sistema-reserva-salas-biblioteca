// Regras de domínio do serviço de Chaves (RF10, RF11 e RF12).
// Calcula situação da chave ('na-recepcao', 'retirada', 'atrasada', 'devolvida'),
// minutos de atraso e formatação do histórico para a tela ServicoChaves.jsx e HistoricoChavesModal.jsx.

export class ServiceError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const FUSO_BIBLIOTECA = 'America/Fortaleza';

export function formatHourInLibraryTz(isoOrDate) {
  const date = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_BIBLIOTECA,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

export function todayInLibraryTz(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_BIBLIOTECA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function validateDateParam(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) {
    throw new ServiceError(400, 'DATA_INVALIDA', 'Informe a data no formato AAAA-MM-DD.');
  }
  return data;
}

export function computeKeyState(delivery, fimPrevistoIso, now = new Date()) {
  if (!delivery) {
    return { status: 'na-recepcao', atrasoMinutos: 0 };
  }
  if (delivery.status === 'devolvida') {
    return {
      status: 'devolvida',
      atrasoMinutos: Number(delivery.atraso_minutos || 0),
      devolvidaComAtraso: Boolean(delivery.devolvida_com_atraso),
    };
  }
  const endMs = Date.parse(fimPrevistoIso || delivery.fim_previsto);
  const nowMs = now.getTime();
  if (Number.isFinite(endMs) && nowMs > endMs) {
    const atrasoMinutos = Math.max(1, Math.floor((nowMs - endMs) / 60_000));
    return { status: 'atrasada', atrasoMinutos };
  }
  return { status: 'retirada', atrasoMinutos: 0 };
}

export function formatMovementItem(movement) {
  return {
    movimentacao_id: movement.movimentacao_id,
    tipo: movement.tipo,
    acao: movement.acao,
    horario: formatHourInLibraryTz(movement.ocorrida_em),
    ocorrida_em: new Date(movement.ocorrida_em).toISOString(),
    operador: movement.operador_nome,
    operador_id: movement.operador_id,
    ...(movement.observacao ? { observacao: movement.observacao } : {}),
  };
}


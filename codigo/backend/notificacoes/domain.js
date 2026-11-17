// Regras de domínio do serviço de Notificações (RF09).
// Valida o envelope de evento publicado pelo serviço de Reservas e formata o texto do aviso ao responsável.

export class ServiceError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class InvalidEventError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_TYPES = new Set(['reserva.confirmada', 'reserva.cancelada', 'reserva.alterada']);
const FUSO_BIBLIOTECA = 'America/Fortaleza';

const ROOM_LABELS = {
  '20000000-0000-4000-8000-000000000001': 'Sala 01',
  '20000000-0000-4000-8000-000000000002': 'Sala 02',
  '20000000-0000-4000-8000-000000000003': 'Sala 03',
};

function formatShortPeriod(inicioIso, fimIso) {
  const start = new Date(inicioIso);
  const end = new Date(fimIso);
  const dateFmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_BIBLIOTECA,
    day: '2-digit',
    month: '2-digit',
  });
  const hourFmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_BIBLIOTECA,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return `${dateFmt.format(start)} das ${hourFmt.format(start)} às ${hourFmt.format(end)}`;
}

export function buildNotificationMessage(event) {
  const roomName = ROOM_LABELS[event.room_id] || `sala ${event.room_id.slice(0, 8)}`;
  const period = formatShortPeriod(event.inicio, event.fim);
  if (event.event_type === 'reserva.confirmada') {
    return `Sua reserva na ${roomName} (${period}) foi confirmada.`;
  }
  if (event.event_type === 'reserva.cancelada') {
    return `Sua reserva na ${roomName} (${period}) foi cancelada.`;
  }
  return `Sua reserva na ${roomName} (${period}) foi alterada.`;
}

export function validateReservationEvent(raw, messageId = null) {
  if (!raw || typeof raw !== 'object') {
    throw new InvalidEventError('Envelope de evento ausente ou inválido.');
  }
  const {
    event_id,
    event_type,
    schema_version,
    reservation_id,
    occurred_at,
    responsavel_id,
    room_id,
    inicio,
    fim,
  } = raw;

  if (!UUID_RE.test(event_id || '')
      || !UUID_RE.test(reservation_id || '')
      || !UUID_RE.test(responsavel_id || '')
      || !UUID_RE.test(room_id || '')) {
    throw new InvalidEventError('Identificadores UUID inválidos no evento.');
  }
  if (messageId && messageId !== event_id) {
    throw new InvalidEventError('O messageId AMQP diverge do event_id do payload.');
  }
  if (!EVENT_TYPES.has(event_type) || schema_version !== 1) {
    throw new InvalidEventError('Tipo de evento ou versão de schema incompatível.');
  }
  const startMs = Date.parse(inicio);
  const endMs = Date.parse(fim);
  const occurredMs = Date.parse(occurred_at);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || !Number.isFinite(occurredMs)) {
    throw new InvalidEventError('Datas de intervalo ou ocorrência inválidas no evento.');
  }

  return {
    event_id: event_id.toLowerCase(),
    event_type,
    schema_version,
    reservation_id: reservation_id.toLowerCase(),
    responsavel_id: responsavel_id.toLowerCase(),
    room_id: room_id.toLowerCase(),
    inicio: new Date(startMs).toISOString(),
    fim: new Date(endMs).toISOString(),
    occurred_at: new Date(occurredMs).toISOString(),
    texto: buildNotificationMessage({
      event_type,
      room_id: room_id.toLowerCase(),
      inicio,
      fim,
    }),
  };
}

export function formatNotificationRow(row) {
  const criadoEmIso = new Date(row.criado_em).toISOString();
  return {
    id: row.aviso_id,
    aviso_id: row.aviso_id,
    event_id: row.event_id,
    reservation_id: row.reservation_id,
    usuarioId: row.usuario_id,
    usuario_id: row.usuario_id,
    room_id: row.room_id,
    event_type: row.event_type,
    texto: row.texto,
    inicio: new Date(row.inicio).toISOString(),
    fim: new Date(row.fim).toISOString(),
    lido: row.lido,
    lido_em: row.lido_em ? new Date(row.lido_em).toISOString() : null,
    criadoEm: criadoEmIso,
    criado_em: criadoEmIso,
  };
}


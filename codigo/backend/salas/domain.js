// Regras de domínio do serviço de Salas (RF02 e RF03).
// Valida nome, capacidade, bloco, equipamentos e intervalos de consulta de disponibilidade.

export class ServiceError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

// Mesma convenção de intervalo [inicio, fim) acordada com o serviço de Reservas:
// ISO 8601 com fuso explícito (Z ou ±HH:MM) e duração positiva de até duas horas.
export function validateInterval(inicio, fim) {
  const offset = /(?:Z|[+-]\d{2}:\d{2})$/i;
  const start = Date.parse(inicio);
  const end = Date.parse(fim);
  if (!offset.test(inicio) || !offset.test(fim) || !Number.isFinite(start)
      || !Number.isFinite(end) || end <= start || end - start > 7_200_000) {
    throw new ServiceError(400, 'INTERVALO_INVALIDO', 'Informe início e fim com fuso e duração positiva de até duas horas.');
  }
}

function normalizeName(nome) {
  const trimmed = typeof nome === 'string' ? nome.trim() : '';
  if (!trimmed || trimmed.length > 80) {
    throw new ServiceError(400, 'NOME_SALA_INVALIDO', 'Informe um nome de sala não vazio com até 80 caracteres.');
  }
  return trimmed;
}

function normalizeCapacity(capacidade) {
  // RF05 exige no mínimo 3 discentes por reserva; portanto uma sala deve comportar ao menos 3 pessoas.
  if (!Number.isInteger(capacidade) || capacidade < 3 || capacidade > 50) {
    throw new ServiceError(400, 'CAPACIDADE_INVALIDA', 'A capacidade da sala deve ser um inteiro entre 3 e 50 pessoas.');
  }
  return capacidade;
}

function normalizeBlock(bloco) {
  if (bloco === undefined || bloco === null) return null;
  const trimmed = typeof bloco === 'string' ? bloco.trim() : '';
  if (!trimmed || trimmed.length > 60) {
    throw new ServiceError(400, 'BLOCO_INVALIDO', 'Quando informado, o bloco deve conter entre 1 e 60 caracteres.');
  }
  return trimmed;
}

function normalizeEquipment(equipamentos) {
  if (equipamentos === undefined) return [];
  if (!Array.isArray(equipamentos) || equipamentos.length > 20) {
    throw new ServiceError(400, 'EQUIPAMENTOS_INVALIDOS', 'A lista de equipamentos deve conter até 20 itens.');
  }
  const normalized = equipamentos.map((item) => {
    const trimmed = typeof item === 'string' ? item.trim() : '';
    if (!trimmed || trimmed.length > 60) {
      throw new ServiceError(400, 'EQUIPAMENTOS_INVALIDOS', 'Cada equipamento deve ser um texto não vazio de até 60 caracteres.');
    }
    return trimmed;
  });
  if (new Set(normalized.map((item) => item.toLowerCase())).size !== normalized.length) {
    throw new ServiceError(400, 'EQUIPAMENTOS_DUPLICADOS', 'Não repita equipamentos na mesma sala.');
  }
  return normalized;
}

export function normalizeRoomInput(body) {
  return {
    sala_id: body.sala_id ? body.sala_id.toLowerCase() : null,
    nome: normalizeName(body.nome),
    capacidade: normalizeCapacity(body.capacidade),
    bloco: normalizeBlock(body.bloco),
    equipamentos: normalizeEquipment(body.equipamentos),
    ativa: body.ativa === undefined ? true : Boolean(body.ativa),
  };
}

export function normalizeRoomPatch(body) {
  const patch = {};
  if (body.nome !== undefined) patch.nome = normalizeName(body.nome);
  if (body.capacidade !== undefined) patch.capacidade = normalizeCapacity(body.capacidade);
  if (body.bloco !== undefined) patch.bloco = normalizeBlock(body.bloco);
  if (body.equipamentos !== undefined) patch.equipamentos = normalizeEquipment(body.equipamentos);

  if (Object.keys(patch).length === 0) {
    throw new ServiceError(400, 'ATUALIZACAO_VAZIA', 'Informe ao menos um campo para atualizar a sala.');
  }
  return patch;
}


import { isoParaDataHoraFortaleza } from './fortaleza.js'

export function normalizarSala(sala) {
  return {
    id: sala.sala_id ?? sala.id,
    nome: sala.nome,
    capacidade: sala.capacidade,
    bloco: sala.bloco ?? null,
    equipamentos: sala.equipamentos ?? [],
    ativa: sala.ativa !== false,
    desativada: sala.ativa === false,
    indisponivel: sala.ativa === false,
    emManutencao: sala.em_manutencao === true,
  }
}

export function normalizarDiscente(discente) {
  return {
    id: discente.usuario_id ?? discente.id,
    nome: discente.nome,
    matricula: discente.matricula ?? '',
  }
}

export function normalizarOcupacao(ocupacao) {
  return {
    salaId: ocupacao.sala_id ?? ocupacao.salaId,
    inicio: isoParaDataHoraFortaleza(ocupacao.inicio),
    fim: isoParaDataHoraFortaleza(ocupacao.fim),
  }
}

export function normalizarReserva(reserva, { salasPorId = {}, participantesPorId = {} } = {}) {
  const participanteIds = reserva.participante_ids ?? reserva.participantes?.map((item) => item.id ?? item) ?? []
  const salaId = reserva.sala_id ?? reserva.salaId
  return {
    id: reserva.reserva_id ?? reserva.id,
    salaId,
    salaNome: reserva.sala_nome ?? salasPorId[salaId]?.nome ?? '',
    inicio: isoParaDataHoraFortaleza(reserva.inicio),
    fim: isoParaDataHoraFortaleza(reserva.fim),
    status: reserva.status,
    responsavelId: reserva.responsavel_id ?? reserva.responsavelId,
    participantes: participanteIds.map((id) => participantesPorId[id] ?? { id }),
    criadaEm: reserva.criada_em ? isoParaDataHoraFortaleza(reserva.criada_em) : undefined,
    canceladaEm: reserva.cancelada_em ? isoParaDataHoraFortaleza(reserva.cancelada_em) : undefined,
  }
}

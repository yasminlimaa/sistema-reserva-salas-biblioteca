// Provedor de demonstração das reservas: lê reservas e avisos guardados no navegador (localStorage).
// Quando o backend ou o Supabase existir, criar um arquivo com as mesmas funções e trocar o export em index.js.
import { motivoReservaIndisponivel } from '../../lib/datas.js'

const CHAVE = 'demo-reservas'

export const SALAS = [
  { id: 's1', nome: 'Sala 01', capacidade: 6, bloco: 'Bloco A', equipamentos: ['Quadro branco'] },
  { id: 's2', nome: 'Sala 02', capacidade: 8, bloco: 'Bloco A', equipamentos: ['Quadro branco', 'TV'] },
  { id: 's3', nome: 'Sala 03', capacidade: 10, bloco: 'Bloco B', equipamentos: ['Projetor', 'Quadro branco'] },
  { id: 's4', nome: 'Sala 04', capacidade: 4, bloco: 'Bloco B' },
  { id: 's5', nome: 'Sala 05', capacidade: 12, bloco: 'Bloco A', equipamentos: ['TV', 'Ar-condicionado'] },
  { id: 's6', nome: 'Sala 06', capacidade: 8, bloco: 'Bloco B', equipamentos: ['Quadro branco'], emManutencao: true },
]

// Catálogo exclusivo da demonstração local. A integração real dependerá do serviço de Usuários.
export const DISCENTES_DEMO = [
  { id: 'demo-discente-01', nome: 'Gabriel André Barreto', matricula: '2024001301' },
  { id: 'demo-discente-02', nome: 'Gabriela Lopes', matricula: '2024008812' },
  { id: 'demo-discente-03', nome: 'Yasmin Serejo', matricula: '2025007136' },
  { id: 'demo-discente-04', nome: 'Ana Clara Martins', matricula: '2024012408' },
  { id: 'demo-discente-05', nome: 'Lucas Oliveira', matricula: '2024021917' },
  { id: 'demo-discente-06', nome: 'Mariana Costa', matricula: '2024005540' },
]

function ler() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE)) ?? { reservas: [], avisos: [] }
  } catch {
    return { reservas: [], avisos: [] }
  }
}

function salvar(dados) {
  localStorage.setItem(CHAVE, JSON.stringify(dados))
}

const nomeDaSala = (salaId) => SALAS.find((s) => s.id === salaId)?.nome ?? ''

export async function listarReservas(usuarioId) {
  return ler()
    .reservas.filter((r) => r.participantes.some((p) => p.id === usuarioId))
    .map((r) => ({ ...r, salaNome: nomeDaSala(r.salaId) }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
}

// Ocupação de todas as salas num dia. Não expõe participantes: a tela só mostra que o horário está ocupado.
export async function listarOcupacao(data) {
  return ler()
    .reservas.filter((r) => r.status === 'confirmada' && r.inicio.slice(0, 10) === data)
    .map((r) => ({ salaId: r.salaId, inicio: r.inicio, fim: r.fim }))
}

// Todas as reservas (de qualquer participante), opcionalmente de um dia. Usado pela gestão de reservas.
export async function listarTodasReservas(data = '') {
  return ler()
    .reservas.filter((r) => !data || r.inicio.slice(0, 10) === data)
    .map((r) => ({ ...r, salaNome: nomeDaSala(r.salaId) }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
}

export async function buscarDiscentes(termo = '') {
  const busca = termo.trim().toLocaleLowerCase('pt-BR')
  if (!busca) return DISCENTES_DEMO
  return DISCENTES_DEMO.filter((discente) => (
    discente.nome.toLocaleLowerCase('pt-BR').includes(busca) || discente.matricula.includes(busca)
  ))
}

export async function criarReservaDemo({ salaId, data, inicio, fim, participantes, responsavel }) {
  const sala = SALAS.find((item) => item.id === salaId)
  const inicioDataHora = `${data}T${inicio}`
  const fimDataHora = `${data}T${fim}`
  const ids = participantes.map((participante) => participante.id)
  const duracao = new Date(fimDataHora) - new Date(inicioDataHora)

  const motivoIndisponibilidade = motivoReservaIndisponivel(data, inicio, fim)

  if (responsavel.perfil !== 'discente') throw new Error('A reserva de demonstração deve ser criada por um discente.')
  if (motivoIndisponibilidade) throw new Error(motivoIndisponibilidade)
  if (!sala || sala.emManutencao) throw new Error('Esta sala está em manutenção e não pode ser reservada.')
  if (new Set(ids).size !== ids.length) throw new Error('Não é permitido repetir participantes no grupo.')
  if (!ids.includes(responsavel.id)) throw new Error('O responsável deve participar da reserva.')
  if (participantes.length < 3) throw new Error('Inclua ao menos três discentes para confirmar a reserva.')
  if (participantes.length > sala.capacidade) throw new Error('O grupo excede a capacidade da sala.')
  if (!Number.isFinite(duracao) || duracao <= 0 || duracao > 2 * 60 * 60 * 1000) {
    throw new Error('Escolha um intervalo positivo de no máximo duas horas.')
  }

  const dados = ler()
  const conflito = dados.reservas.some((reserva) => (
    reserva.status === 'confirmada'
    && inicioDataHora < reserva.fim
    && reserva.inicio < fimDataHora
    && (reserva.salaId === salaId || reserva.participantes.some((participante) => ids.includes(participante.id)))
  ))
  if (conflito) throw new Error('A sala ou um participante já possui reserva nesse horário de demonstração.')

  const reserva = {
    id: `demo-reserva-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    salaId,
    inicio: inicioDataHora,
    fim: fimDataHora,
    status: 'confirmada',
    responsavelId: responsavel.id,
    participantes,
    criadaEm: new Date().toISOString(),
  }
  dados.reservas.push(reserva)
  salvar(dados)
  return { ...reserva, salaNome: sala.nome }
}

export async function cancelarReservaDemo(reservaId, solicitante) {
  const dados = ler()
  const reserva = dados.reservas.find((item) => item.id === reservaId)
  if (!reserva) throw new Error('Reserva de demonstração não encontrada.')
  if (solicitante.id !== reserva.responsavelId && !['funcionario', 'adm'].includes(solicitante.perfil)) {
    throw new Error('Somente o responsável pode cancelar esta reserva.')
  }
  if (reserva.status === 'cancelada') return { ...reserva, salaNome: nomeDaSala(reserva.salaId) }

  reserva.status = 'cancelada'
  reserva.canceladaEm = new Date().toISOString()
  salvar(dados)
  return { ...reserva, salaNome: nomeDaSala(reserva.salaId) }
}

export async function listarAvisos(usuarioId) {
  return ler()
    .avisos.filter((a) => a.usuarioId === usuarioId)
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
}

export async function contarAvisosNaoLidos(usuarioId) {
  return ler().avisos.filter((a) => a.usuarioId === usuarioId && !a.lido).length
}

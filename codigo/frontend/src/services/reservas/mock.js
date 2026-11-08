// Provedor de demonstração das reservas: lê reservas e avisos guardados no navegador (localStorage).
// Quando o backend ou o Supabase existir, criar um arquivo com as mesmas funções e trocar o export em index.js.
const CHAVE = 'demo-reservas'

export const SALAS = [
  { id: 's1', nome: 'Sala 01', capacidade: 6 },
  { id: 's2', nome: 'Sala 02', capacidade: 8 },
  { id: 's3', nome: 'Sala 03', capacidade: 10 },
  { id: 's4', nome: 'Sala 04', capacidade: 4 },
  { id: 's5', nome: 'Sala 05', capacidade: 12 },
  { id: 's6', nome: 'Sala 06', capacidade: 8, emManutencao: true },
]

function ler() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE)) ?? { reservas: [], avisos: [] }
  } catch {
    return { reservas: [], avisos: [] }
  }
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

export async function listarAvisos(usuarioId) {
  return ler()
    .avisos.filter((a) => a.usuarioId === usuarioId)
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
}

export async function contarAvisosNaoLidos(usuarioId) {
  return ler().avisos.filter((a) => a.usuarioId === usuarioId && !a.lido).length
}

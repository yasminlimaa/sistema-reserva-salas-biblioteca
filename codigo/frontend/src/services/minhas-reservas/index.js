import { listarReservas as listarMock, cancelarReservaDemo } from '../reservas/mock.js'
import { listarReservas as listarApi, cancelarReserva as cancelarApi } from '../api/reservas.js'
import { listarSalas } from '../api/salas.js'
import { disponibilidadeProvider } from '../disponibilidade/index.js'

const LIMITE = 100

async function paginas(listar, opcoes) {
  const itens = []
  for (let offset = 0; offset < 10_000; offset += LIMITE) {
    const pagina = await listar({ ...opcoes, limite: LIMITE, offset })
    const lista = pagina?.reservas ?? pagina?.salas ?? []
    itens.push(...lista)
    if (lista.length < LIMITE) return itens
  }
  throw new Error('A listagem excedeu o limite de paginas permitido.')
}

export function criarProvedorMinhasReservas(nome = disponibilidadeProvider.nome, deps = {}) {
  const reservas = deps.listarReservas ?? listarApi
  const salas = deps.listarSalas ?? listarSalas
  const cancelar = deps.cancelarReserva ?? cancelarApi
  if (nome === 'mock') return {
    nome,
    listar: ({ usuario }) => listarMock(usuario.id),
    cancelar: ({ reservaId, usuario }) => cancelarReservaDemo(reservaId, usuario),
  }
  if (nome !== 'api') throw new Error(`Provedor de Minhas Reservas invalido: "${nome}".`)
  return {
    nome,
    async listar({ token, sinal }) {
      if (!token) throw new Error('A consulta real exige uma sessao autenticada.')
      const [lista, ativas, inativas] = await Promise.all([
        paginas(reservas, { token, sinal }),
        paginas((opcoes) => salas({ ...opcoes, ativa: true }), { token, sinal }),
        paginas((opcoes) => salas({ ...opcoes, ativa: false }), { token, sinal }),
      ])
      const nomes = Object.fromEntries([...ativas, ...inativas].map((sala) => [sala.id, sala.nome]))
      return lista.map((reserva) => ({ ...reserva, salaNome: reserva.salaNome || nomes[reserva.salaId] || 'Sala sem nome' }))
    },
    cancelar: ({ token, reservaId, sinal }) => {
      if (!token) throw new Error('A consulta real exige uma sessao autenticada.')
      return cancelar({ token, reservaId, sinal })
    },
  }
}

export const minhasReservasProvider = criarProvedorMinhasReservas()

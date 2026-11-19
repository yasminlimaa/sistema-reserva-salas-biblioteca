import { buscarDiscentes as buscarDiscentesMock, criarReservaDemo } from '../reservas/mock.js'
import { buscarDiscentes as buscarDiscentesApi } from '../api/usuarios.js'
import { criarReserva as criarReservaApi } from '../api/reservas.js'
import { disponibilidadeProvider } from '../disponibilidade/index.js'

function erroSemSessao() {
  return new Error('A reserva real exige uma sessao autenticada. Entre novamente para continuar.')
}

export function criarProvedorParticipantes(nome = disponibilidadeProvider.nome, dependencias = {}) {
  const buscarDiscentes = dependencias.buscarDiscentes ?? buscarDiscentesApi
  const criarReserva = dependencias.criarReserva ?? criarReservaApi

  if (nome === 'mock') {
    return {
      nome,
      buscarDiscentes: ({ termo = '' } = {}) => buscarDiscentesMock(termo),
      criarReserva: ({ reserva, participantes, responsavel }) => criarReservaDemo({
        salaId: reserva.sala.id,
        data: reserva.data,
        inicio: reserva.inicio,
        fim: reserva.fim,
        participantes,
        responsavel,
      }),
    }
  }

  if (nome !== 'api') {
    throw new Error(`Provedor de Participantes invalido: "${nome}".`)
  }

  return {
    nome,
    async buscarDiscentes({ token, termo = '', sinal } = {}) {
      if (!token) throw erroSemSessao()
      return buscarDiscentes({ token, termo, sinal })
    },
    async criarReserva({ token, reserva, participantes } = {}) {
      if (!token) throw erroSemSessao()
      return criarReserva({
        token,
        salaId: reserva.sala.id,
        data: reserva.data,
        inicio: reserva.inicio,
        fim: reserva.fim,
        participanteIds: participantes.map((participante) => participante.id),
      })
    },
  }
}

// Participantes compartilha obrigatoriamente o modo da tela Disponibilidade.
export const participantesProvider = criarProvedorParticipantes()

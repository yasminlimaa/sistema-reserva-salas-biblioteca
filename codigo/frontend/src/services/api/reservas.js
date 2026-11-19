import { criarClienteHttp } from './client.js'
import { apiUrls } from './config.js'
import { dataHoraFortalezaParaIso } from './fortaleza.js'
import { normalizarOcupacao, normalizarReserva } from './normalizers.js'

const cliente = criarClienteHttp(apiUrls.reservas)

export async function listarOcupacao({ token, data, sinal } = {}) {
  const resposta = await cliente.get('/ocupacao', { token, sinal, query: { data } })
  return (resposta.ocupacoes || []).map(normalizarOcupacao)
}

export async function listarReservas({ token, salaId, data, limite = 50, offset = 0, sinal, contexto } = {}) {
  const resposta = await cliente.get('/reservas', {
    token, sinal, query: { sala_id: salaId, data, limite, offset },
  })
  return { ...resposta, reservas: (resposta.reservas || []).map((reserva) => normalizarReserva(reserva, contexto)) }
}

export async function criarReserva({ token, salaId, data, inicio, fim, participanteIds, sinal, contexto } = {}) {
  const resposta = await cliente.post('/reservas', {
    sala_id: salaId,
    inicio: dataHoraFortalezaParaIso(data, inicio),
    fim: dataHoraFortalezaParaIso(data, fim),
    participante_ids: participanteIds,
  }, { token, sinal })
  return normalizarReserva(resposta, contexto)
}

export async function cancelarReserva({ token, reservaId, sinal, contexto } = {}) {
  const resposta = await cliente.post(`/reservas/${encodeURIComponent(reservaId)}/cancelamento`, undefined, { token, sinal })
  return normalizarReserva(resposta, contexto)
}

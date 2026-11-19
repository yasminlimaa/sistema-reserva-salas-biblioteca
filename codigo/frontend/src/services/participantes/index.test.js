import assert from 'node:assert/strict'
import test from 'node:test'
import { criarControleDeConsulta } from '../disponibilidade/index.js'
import { buscarDiscentes } from '../api/usuarios.js'
import { criarReserva } from '../api/reservas.js'
import { criarProvedorParticipantes } from './index.js'

const responsavel = { id: '10000000-0000-4000-8000-000000000001', nome: 'Responsavel', matricula: '2024000001' }
const colegaA = { id: '10000000-0000-4000-8000-000000000002', nome: 'Colega A', matricula: '2024000002' }
const colegaB = { id: '10000000-0000-4000-8000-000000000003', nome: 'Colega B', matricula: '2024000003' }
const reserva = { sala: { id: '20000000-0000-4000-8000-000000000001', capacidade: 6 }, data: '2070-01-01', inicio: '08:00', fim: '10:00' }

test('provedor de Participantes preserva a busca mock', async () => {
  const provider = criarProvedorParticipantes('mock')
  const discentes = await provider.buscarDiscentes({ termo: 'Gabriel' })

  assert.equal(provider.nome, 'mock')
  assert.ok(discentes.some((discente) => discente.nome.includes('Gabriel')))
})

test('provedor API encaminha token, busca discentes e cria reserva sem responsavel no corpo', async () => {
  const chamadas = []
  const provider = criarProvedorParticipantes('api', {
    async buscarDiscentes(opcoes) {
      chamadas.push({ tipo: 'busca', opcoes })
      return { discentes: [colegaA] }
    },
    async criarReserva(opcoes) {
      chamadas.push({ tipo: 'reserva', opcoes })
      return { id: 'reserva-criada' }
    },
  })

  const encontrados = await provider.buscarDiscentes({ token: 'token-em-memoria', termo: 'Colega' })
  const criada = await provider.criarReserva({ token: 'token-em-memoria', reserva, participantes: [responsavel, colegaA, colegaB] })

  assert.deepEqual(encontrados.discentes, [colegaA])
  assert.equal(criada.id, 'reserva-criada')
  assert.equal(chamadas[0].opcoes.token, 'token-em-memoria')
  assert.deepEqual(chamadas[1].opcoes.participanteIds, [responsavel.id, colegaA.id, colegaB.id])
  assert.equal('responsavelId' in chamadas[1].opcoes, false)
})

test('controle de busca descarta resultado de termo antigo', () => {
  const controle = criarControleDeConsulta()
  const primeiraBusca = controle.proxima()
  const segundaBusca = controle.proxima()

  assert.equal(controle.ehAtual(primeiraBusca), false)
  assert.equal(controle.ehAtual(segundaBusca), true)
})

test('adaptadores simulados enviam Bearer, normalizam discentes e convertem Fortaleza para UTC', async (t) => {
  const fetchOriginal = globalThis.fetch
  const chamadas = []
  globalThis.fetch = async (url, opcoes) => {
    chamadas.push({ url: String(url), opcoes })
    if (String(url).startsWith('/api/usuarios/discentes')) {
      return new Response(JSON.stringify({ discentes: [{ usuario_id: colegaA.id, nome: colegaA.nome, matricula: colegaA.matricula }] }), { status: 200 })
    }
    return new Response(JSON.stringify({ reserva_id: '30000000-0000-4000-8000-000000000001', sala_id: reserva.sala.id, responsavel_id: responsavel.id, participante_ids: [responsavel.id, colegaA.id, colegaB.id], inicio: '2070-01-01T11:00:00.000Z', fim: '2070-01-01T13:00:00.000Z', status: 'confirmada' }), { status: 201 })
  }
  t.after(() => { globalThis.fetch = fetchOriginal })

  const encontrados = await buscarDiscentes({ token: 'token-em-memoria', termo: 'Colega' })
  const criada = await criarReserva({ token: 'token-em-memoria', salaId: reserva.sala.id, data: reserva.data, inicio: reserva.inicio, fim: reserva.fim, participanteIds: [responsavel.id, colegaA.id, colegaB.id] })
  const corpo = JSON.parse(chamadas[1].opcoes.body)

  assert.equal(encontrados.discentes[0].id, colegaA.id)
  assert.equal(criada.id, '30000000-0000-4000-8000-000000000001')
  assert.equal(corpo.inicio, '2070-01-01T11:00:00.000Z')
  assert.equal(corpo.fim, '2070-01-01T13:00:00.000Z')
  assert.deepEqual(corpo.participante_ids, [responsavel.id, colegaA.id, colegaB.id])
  assert.ok(chamadas.every(({ opcoes }) => opcoes.headers.Authorization === 'Bearer token-em-memoria'))
})

test('adaptadores propagam erros HTTP de busca e criacao sem fallback mock', async (t) => {
  const fetchOriginal = globalThis.fetch
  const respostas = [
    [400, { mensagem: 'Entrada invalida.' }],
    [401, { mensagem: 'Sessao expirada.' }],
    [403, { mensagem: 'Acesso negado.' }],
    [409, { codigo: 'CONFLITO_HORARIO', mensagem: 'Conflito de horario.' }],
    [422, { mensagem: 'Participante invalido.' }],
    [503, { mensagem: 'Dependencia indisponivel.' }],
  ]
  globalThis.fetch = async () => {
    const [status, corpo] = respostas.shift()
    return new Response(JSON.stringify(corpo), { status })
  }
  t.after(() => { globalThis.fetch = fetchOriginal })

  await assert.rejects(buscarDiscentes({ token: 'token-em-memoria' }), (erro) => erro.status === 400)
  await assert.rejects(buscarDiscentes({ token: 'token-em-memoria' }), (erro) => erro.status === 401)
  await assert.rejects(buscarDiscentes({ token: 'token-em-memoria' }), (erro) => erro.status === 403)
  await assert.rejects(criarReserva({ token: 'token-em-memoria', salaId: reserva.sala.id, data: reserva.data, inicio: reserva.inicio, fim: reserva.fim, participanteIds: [responsavel.id, colegaA.id, colegaB.id] }), (erro) => erro.status === 409 && erro.codigo === 'CONFLITO_HORARIO')
  await assert.rejects(criarReserva({ token: 'token-em-memoria', salaId: reserva.sala.id, data: reserva.data, inicio: reserva.inicio, fim: reserva.fim, participanteIds: [responsavel.id, colegaA.id, colegaB.id] }), (erro) => erro.status === 422)
  await assert.rejects(criarReserva({ token: 'token-em-memoria', salaId: reserva.sala.id, data: reserva.data, inicio: reserva.inicio, fim: reserva.fim, participanteIds: [responsavel.id, colegaA.id, colegaB.id] }), (erro) => erro.status === 503)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { criarProvedorMinhasReservas } from './index.js'

const token = 'token-em-memoria'
const reserva = { id: 'r1', salaId: 's1', responsavelId: 'u1', participantes: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }], inicio: '2070-01-02T00:30:00', fim: '2070-01-02T01:30:00', status: 'confirmada' }

test('preserva o provedor mock', async () => {
  const provider = criarProvedorMinhasReservas('mock')
  assert.equal(provider.nome, 'mock')
  assert.deepEqual(await provider.listar({ usuario: { id: 'inexistente' } }), [])
})

test('modo API pagina, enriquece sala e encaminha Bearer', async () => {
  const chamadas = []
  const provider = criarProvedorMinhasReservas('api', {
    async listarReservas(opcoes) { chamadas.push(['reservas', opcoes]); return { reservas: opcoes.offset ? [] : [reserva] } },
    async listarSalas(opcoes) { chamadas.push(['salas', opcoes]); return { salas: opcoes.offset ? [] : opcoes.ativa ? [{ id: 's1', nome: 'Sala Real' }] : [] } },
  })
  const lista = await provider.listar({ token })
  assert.equal(lista[0].salaNome, 'Sala Real')
  assert.equal(lista[0].participantes.length, 3)
  assert.ok(chamadas.every(([, opcoes]) => opcoes.token === token))
})

test('cancelamento API usa UUID e token, e nao usa mock', async () => {
  let opcoes
  const provider = criarProvedorMinhasReservas('api', { cancelarReserva: async (entrada) => { opcoes = entrada; return { ...reserva, status: 'cancelada' } } })
  const cancelada = await provider.cancelar({ token, reservaId: 'r1' })
  assert.equal(cancelada.status, 'cancelada')
  assert.equal(opcoes.reservaId, 'r1')
  assert.equal(opcoes.token, token)
})

test('modo API recusa sessao ausente sem fallback', async () => {
  const provider = criarProvedorMinhasReservas('api')
  await assert.rejects(provider.listar({}), /sessao autenticada/i)
  assert.throws(() => provider.cancelar({ reservaId: 'r1' }), /sessao autenticada/i)
})

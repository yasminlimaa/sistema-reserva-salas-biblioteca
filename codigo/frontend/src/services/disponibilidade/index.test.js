import assert from 'node:assert/strict'
import test from 'node:test'
import { criarControleDeConsulta, criarProvedorDisponibilidade } from './index.js'
import { listarSalas } from '../api/salas.js'
import { listarOcupacao } from '../api/reservas.js'

const salaAtiva = { id: 'sala-ativa', ativa: true, capacidade: 6 }
const salaDesativada = { id: 'sala-desativada', ativa: false, desativada: true, indisponivel: true, capacidade: 10 }

test('provedor de disponibilidade preserva o catalogo mock como padrao', async () => {
  const provider = criarProvedorDisponibilidade('mock')
  const salas = await provider.listarSalas()

  assert.equal(provider.nome, 'mock')
  assert.equal(salas, provider.salasIniciais)
  assert.ok(salas.length > 0)
})

test('provedor API pagina salas, descarta desativadas e encaminha token', async () => {
  const chamadas = []
  const provider = criarProvedorDisponibilidade('api', {
    async listarSalas(opcoes) {
      chamadas.push(opcoes)
      return opcoes.offset === 0
        ? { salas: Array.from({ length: 100 }, (_, indice) => ({ ...salaAtiva, id: `sala-${indice}` })) }
        : { salas: [salaAtiva, salaDesativada] }
    },
  })

  const salas = await provider.listarSalas({ token: 'token-em-memoria' })

  assert.equal(chamadas.length, 2)
  assert.deepEqual(chamadas.map((chamada) => chamada.offset), [0, 100])
  assert.ok(chamadas.every((chamada) => chamada.token === 'token-em-memoria'))
  assert.equal(salas.length, 101)
  assert.ok(salas.every((sala) => sala.ativa === true && sala.indisponivel !== true))
})

test('provedor API recusa consulta sem uma sessao real', async () => {
  const provider = criarProvedorDisponibilidade('api')

  await assert.rejects(provider.listarSalas(), /sessao autenticada/i)
  await assert.rejects(provider.listarOcupacao({ data: '2070-01-01' }), /sessao autenticada/i)
})

test('provedor API interrompe catalogo com paginas repetidas em vez de exibir dados incompletos', async () => {
  const provider = criarProvedorDisponibilidade('api', {
    async listarSalas() {
      return { salas: Array.from({ length: 100 }, () => salaAtiva) }
    },
  })

  await assert.rejects(
    provider.listarSalas({ token: 'token-em-memoria' }),
    /paginacao inconsistente/i,
  )
})

test('controle de consulta descarta a resposta atrasada apos troca rapida de data', () => {
  const controle = criarControleDeConsulta()
  const consultaDaPrimeiraData = controle.proxima()
  const consultaDaSegundaData = controle.proxima()

  assert.equal(controle.ehAtual(consultaDaPrimeiraData), false)
  assert.equal(controle.ehAtual(consultaDaSegundaData), true)
})

test('adaptadores usam respostas HTTP simuladas para salas e ocupacao', async (t) => {
  const fetchOriginal = globalThis.fetch
  const chamadas = []
  globalThis.fetch = async (url, opcoes) => {
    chamadas.push({ url: String(url), opcoes })
    if (String(url).startsWith('/api/salas/salas')) {
      return new Response(JSON.stringify({ salas: [{ sala_id: 'sala-api', nome: 'Sala API', capacidade: 8, ativa: true }], limite: 50, offset: 0 }), { status: 200 })
    }
    return new Response(JSON.stringify({ ocupacoes: [{ sala_id: 'sala-api', inicio: '2070-01-01T11:00:00.000Z', fim: '2070-01-01T12:00:00.000Z' }] }), { status: 200 })
  }
  t.after(() => { globalThis.fetch = fetchOriginal })

  const salas = await listarSalas({ token: 'token-em-memoria' })
  const ocupacoes = await listarOcupacao({ token: 'token-em-memoria', data: '2070-01-01' })

  assert.equal(salas.salas[0].id, 'sala-api')
  assert.equal(ocupacoes[0].salaId, 'sala-api')
  assert.match(ocupacoes[0].inicio, /^2070-01-01T08:00/)
  assert.ok(chamadas.every(({ opcoes }) => opcoes.headers.Authorization === 'Bearer token-em-memoria'))
})

test('adaptadores propagam indisponibilidade sem retornar dados mock', async (t) => {
  const fetchOriginal = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('ECONNREFUSED') }
  t.after(() => { globalThis.fetch = fetchOriginal })

  await assert.rejects(listarSalas({ token: 'token-em-memoria' }), /conectar/i)
  await assert.rejects(listarOcupacao({ token: 'token-em-memoria', data: '2070-01-01' }), /conectar/i)
})

test('adaptadores propagam 401 e 403 sem retornar dados mock ou expor token', async (t) => {
  const fetchOriginal = globalThis.fetch
  const chamadas = []
  globalThis.fetch = async (url, opcoes) => {
    chamadas.push({ url: String(url), opcoes })
    if (String(url).startsWith('/api/salas')) {
      return new Response(JSON.stringify({ codigo: 'NAO_AUTENTICADO', mensagem: 'Sessao expirada.' }), { status: 401 })
    }
    return new Response(JSON.stringify({ codigo: 'ACESSO_NAO_AUTORIZADO', mensagem: 'Acesso negado.' }), { status: 403 })
  }
  t.after(() => { globalThis.fetch = fetchOriginal })

  await assert.rejects(
    listarSalas({ token: 'token-em-memoria' }),
    (erro) => erro.status === 401 && erro.message === 'Sessao expirada.',
  )
  await assert.rejects(
    listarOcupacao({ token: 'token-em-memoria', data: '2070-01-01' }),
    (erro) => erro.status === 403 && erro.message === 'Acesso negado.',
  )
  assert.equal(chamadas.length, 2)
  assert.ok(chamadas.every(({ opcoes }) => opcoes.headers.Authorization === 'Bearer token-em-memoria'))
  assert.ok(chamadas.every(({ opcoes }) => !String(opcoes.body ?? '').includes('token-em-memoria')))
})

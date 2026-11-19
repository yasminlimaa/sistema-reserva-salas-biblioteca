import { SALAS, listarOcupacao as listarOcupacaoMock } from '../reservas/mock.js'
import { listarSalas as listarSalasApi } from '../api/salas.js'
import { listarOcupacao as listarOcupacaoApi } from '../api/reservas.js'

const env = import.meta.env ?? {}
const LIMITE_PAGINA = 100
const MAXIMO_PAGINAS = 100

function erroSemSessao() {
  return new Error('A disponibilidade real exige uma sessao autenticada. Entre novamente para consultar as salas.')
}

async function carregarTodasAsSalas(listarSalas, { token, sinal }) {
  const salas = []
  const ids = new Set()
  let offset = 0

  for (let paginaAtual = 0; paginaAtual < MAXIMO_PAGINAS; paginaAtual += 1) {
    const pagina = await listarSalas({ token, ativa: true, limite: LIMITE_PAGINA, offset, sinal })
    const itens = Array.isArray(pagina?.salas) ? pagina.salas : []
    for (const sala of itens) {
      if (!sala?.id || ids.has(sala.id)) {
        throw new Error('O catalogo de salas retornou uma paginacao inconsistente. Tente novamente.')
      }
      ids.add(sala.id)
      salas.push(sala)
    }
    if (itens.length < LIMITE_PAGINA) return salas
    offset += itens.length
  }

  throw new Error('O catalogo de salas excedeu o limite de paginas permitido. Tente novamente.')
}

export function criarProvedorDisponibilidade(nome = 'mock', dependencias = {}) {
  const listarSalas = dependencias.listarSalas ?? listarSalasApi
  const listarOcupacao = dependencias.listarOcupacao ?? listarOcupacaoApi

  if (nome === 'mock') {
    return {
      nome,
      salasIniciais: SALAS,
      listarSalas: async () => SALAS,
      listarOcupacao: ({ data }) => listarOcupacaoMock(data),
    }
  }

  if (nome !== 'api') {
    throw new Error(`VITE_DISPONIBILIDADE_PROVIDER invalido: "${nome}". Use mock ou api.`)
  }

  return {
    nome,
    salasIniciais: [],
    async listarSalas({ token, sinal } = {}) {
      if (!token) throw erroSemSessao()
      const salas = await carregarTodasAsSalas(listarSalas, { token, sinal })
      return salas.filter((sala) => sala.ativa === true && sala.indisponivel !== true)
    },
    async listarOcupacao({ token, data, sinal } = {}) {
      if (!token) throw erroSemSessao()
      return listarOcupacao({ token, data, sinal })
    },
  }
}

export function criarControleDeConsulta() {
  let versao = 0
  return {
    proxima() {
      versao += 1
      return versao
    },
    ehAtual(consulta) {
      return consulta === versao
    },
  }
}

export const disponibilidadeProvider = criarProvedorDisponibilidade(env.VITE_DISPONIBILIDADE_PROVIDER || 'mock')

import { criarClienteHttp } from './client.js'
import { apiUrls } from './config.js'
import { normalizarSala } from './normalizers.js'

const cliente = criarClienteHttp(apiUrls.salas)

export async function listarSalas({ token, ativa = true, capacidadeMinima, limite = 50, offset = 0, sinal } = {}) {
  const resposta = await cliente.get('/salas', {
    token, sinal, query: { ativa, capacidade_minima: capacidadeMinima, limite, offset },
  })
  return { ...resposta, salas: (resposta.salas || []).map(normalizarSala) }
}

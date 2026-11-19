import { criarClienteHttp } from './client.js'
import { apiUrls } from './config.js'
import { normalizarDiscente } from './normalizers.js'

const cliente = criarClienteHttp(apiUrls.usuarios)

export async function buscarDiscentes({ token, termo = '', limite = 50, offset = 0, sinal } = {}) {
  const resposta = await cliente.get('/discentes', { token, sinal, query: { termo, limite, offset } })
  return { ...resposta, discentes: (resposta.discentes || []).map(normalizarDiscente) }
}

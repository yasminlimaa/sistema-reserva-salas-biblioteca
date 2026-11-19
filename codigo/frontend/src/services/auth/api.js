// Provedor para o backend REST do grupo (codigo/backend).
// Contrato assumido — ajustar quando o backend estiver definido:
//   POST /auth/login                                    { perfil, email, senha }                       -> { usuario }
//   POST /auth/cadastro                                 { perfil, nome, matricula, unidade, email, telefone, senha }
//                                                       -> { usuario?, precisaConfirmarEmail? }
//   GET  /matriculas/:numero                            -> { ativa, curso }
//   POST /auth/logout                                   -> 204
// Erros: resposta não-2xx com { mensagem } no corpo.
import { criarClienteHttp } from '../api/client.js'
import { apiUrls } from '../api/config.js'

const cliente = criarClienteHttp(apiUrls.usuarios)

function validarRespostaDeSessao(resposta) {
  if (!resposta?.usuario || typeof resposta.usuario !== 'object' || !resposta.usuario.id) {
    throw new Error('O serviço de Usuários retornou uma sessão sem usuário válido.')
  }
  if (typeof resposta.token !== 'string' || !resposta.token.trim()) {
    throw new Error('O serviço de Usuários retornou uma sessão sem token válido.')
  }
  return resposta
}

export async function login(corpo) {
  return validarRespostaDeSessao(await cliente.post('/auth/login', corpo))
}

export async function cadastrar(corpo) {
  return validarRespostaDeSessao(await cliente.post('/auth/cadastro', corpo))
}

export const buscarMatricula = (numero) => cliente.get(`/matriculas/${encodeURIComponent(numero)}`)

export const logout = (token) => cliente.post('/auth/logout', undefined, { token })

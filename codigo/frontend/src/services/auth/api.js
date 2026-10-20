// Provedor para o backend REST do grupo (codigo/backend).
// Contrato assumido — ajustar quando o backend estiver definido:
//   POST /auth/login                                    { perfil, email, senha }                       -> { usuario }
//   POST /auth/cadastro                                 { perfil, nome, matricula, unidade, email, telefone, senha }
//                                                       -> { usuario?, precisaConfirmarEmail? }
//   GET  /matriculas/:numero                            -> { ativa, curso }
//   POST /auth/logout                                   -> 204
// Erros: resposta não-2xx com { mensagem } no corpo.
const base = import.meta.env.VITE_API_URL || ''

async function chamar(caminho, { metodo = 'POST', corpo } = {}) {
  let resposta
  try {
    resposta = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: corpo ? { 'Content-Type': 'application/json' } : {},
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
  } catch {
    throw new Error('Não foi possível conectar ao servidor. Tente novamente.')
  }

  const dados = await resposta.json().catch(() => ({}))
  if (!resposta.ok) {
    throw new Error(dados.mensagem || 'Não foi possível concluir a operação.')
  }
  return dados
}

export const login = (corpo) => chamar('/auth/login', { corpo })

export const cadastrar = (corpo) => chamar('/auth/cadastro', { corpo })

export const buscarMatricula = (numero) =>
  chamar(`/matriculas/${encodeURIComponent(numero)}`, { metodo: 'GET' })

export const logout = () => chamar('/auth/logout')

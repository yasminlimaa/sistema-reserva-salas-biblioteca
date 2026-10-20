// Provedor de demonstração: não fala com backend nem com banco.
// Guarda os cadastros feitos no navegador (localStorage) para o login devolver o nome e o perfil de quem se cadastrou.
const CHAVE = 'demo-usuarios'

const atraso = (ms = 600) => new Promise((resolver) => setTimeout(resolver, ms))

function lerUsuarios() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE)) ?? {}
  } catch {
    return {}
  }
}

function salvarUsuarios(usuarios) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(usuarios))
  } catch {
    // Sem armazenamento disponível, o login ainda funciona, só sem o nome salvo.
  }
}

export async function login({ perfil, email }) {
  await atraso()
  const emailNormalizado = email.trim().toLowerCase()
  const cadastrado = lerUsuarios()[emailNormalizado]
  return {
    usuario: {
      id: emailNormalizado,
      nome: cadastrado?.nome ?? '',
      email: emailNormalizado,
      perfil: cadastrado?.perfil ?? perfil,
    },
  }
}

export async function cadastrar({ perfil, nome, email }) {
  await atraso()
  const usuarios = lerUsuarios()
  usuarios[email.trim().toLowerCase()] = { nome, perfil }
  salvarUsuarios(usuarios)
  return { usuario: null, precisaConfirmarEmail: true }
}

export async function buscarMatricula() {
  await atraso(400)
  return { ativa: true, curso: 'Engenharia de Computação' }
}

export async function logout() {}

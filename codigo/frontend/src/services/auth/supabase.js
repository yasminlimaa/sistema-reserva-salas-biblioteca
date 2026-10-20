import { supabase } from '../supabaseClient.js'

// Provedor Supabase Auth.
// Os dados extras do cadastro (perfil, nome, matrícula, unidade, telefone) vão em user_metadata.
// Para gravá-los numa tabela própria, use um trigger no banco sobre auth.users.

function cliente() {
  if (!supabase) {
    throw new Error('Supabase não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  }
  return supabase
}

function normalizarUsuario(user) {
  return {
    id: user.id,
    email: user.email,
    nome: user.user_metadata?.nome ?? '',
    perfil: user.user_metadata?.perfil ?? 'discente',
  }
}

function traduzirErro(error) {
  const mensagem = error.message ?? ''
  if (/invalid login credentials/i.test(mensagem)) return 'E-mail ou senha incorretos.'
  if (/email not confirmed/i.test(mensagem)) return 'Confirme seu e-mail institucional antes de entrar.'
  if (/already (registered|been registered)/i.test(mensagem)) return 'Já existe uma conta com este e-mail.'
  return mensagem || 'Não foi possível concluir a operação.'
}

export async function login({ email, senha }) {
  const { data, error } = await cliente().auth.signInWithPassword({ email, password: senha })
  if (error) throw new Error(traduzirErro(error))
  return { usuario: normalizarUsuario(data.user) }
}

export async function cadastrar({ perfil, nome, matricula, unidade, email, telefone, senha }) {
  const { data, error } = await cliente().auth.signUp({
    email,
    password: senha,
    options: {
      data: { perfil, nome, matricula, unidade, telefone },
    },
  })
  if (error) throw new Error(traduzirErro(error))

  // Com confirmação de e-mail ligada no Supabase, data.session vem vazio até o link ser clicado.
  return {
    usuario: data.session ? normalizarUsuario(data.user) : null,
    precisaConfirmarEmail: !data.session,
  }
}

// A consulta de matrícula ativa depende da fonte oficial (SIGAA) e ainda não existe no Supabase.
// Retornar null faz o formulário seguir com preenchimento manual.
export async function buscarMatricula() {
  return null
}

export async function logout() {
  const { error } = await cliente().auth.signOut()
  if (error) throw new Error(traduzirErro(error))
}

import { CONFIG_CADASTRO } from './perfis.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validarLogin({ email, senha }) {
  const erros = {}
  if (!EMAIL_RE.test(email.trim())) erros.email = 'Informe um e-mail válido.'
  if (!senha) erros.senha = 'Informe sua senha.'
  return erros
}

export function validarCadastro(dados, perfil) {
  const config = CONFIG_CADASTRO[perfil]
  const erros = {}
  const email = dados.email.trim().toLowerCase()
  const telefone = dados.telefone.replace(/\D/g, '')

  if (dados.nome.trim().length < 3) erros.nome = 'Informe seu nome completo.'
  if (!config.regexMatricula.test(dados.matricula)) erros.matricula = config.mensagemMatricula
  if (!dados.unidade.trim()) erros.unidade = config.mensagemUnidade
  if (!EMAIL_RE.test(email) || !email.endsWith(config.dominio)) {
    erros.email = `Use seu e-mail institucional (${config.dominio}).`
  }
  if (telefone && telefone.length !== 10 && telefone.length !== 11) {
    erros.telefone = 'Informe DDD e número válidos.'
  }
  if (dados.senha.length < 8) erros.senha = 'A senha deve ter no mínimo 8 caracteres.'
  if (dados.confirmarSenha !== dados.senha) erros.confirmarSenha = 'As senhas não coincidem.'
  if (!dados.aceite) erros.aceite = 'Você precisa aceitar as regras de uso das salas.'

  return erros
}

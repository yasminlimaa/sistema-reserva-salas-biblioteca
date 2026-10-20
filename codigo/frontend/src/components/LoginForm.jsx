import { useState } from 'react'
import AuthLayout from './AuthLayout.jsx'
import Field, { classeInput } from './Field.jsx'
import { authService } from '../services/auth/index.js'
import { validarLogin } from '../lib/validators.js'

const PERFIS = [
  {
    valor: 'discente',
    rotulo: 'Discente',
    placeholder: 'aluno@discente.ufma.br',
    rotuloCadastro: 'Criar cadastro de discente',
  },
  {
    valor: 'funcionario',
    rotulo: 'Funcionário',
    placeholder: 'nome@ufma.br',
    rotuloCadastro: 'Criar cadastro de funcionário',
  },
]

export default function LoginForm({ onSuccess, onIrParaCadastro }) {
  const [perfil, setPerfil] = useState('discente')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erros, setErros] = useState({})
  const [erroGeral, setErroGeral] = useState('')
  const [enviando, setEnviando] = useState(false)

  const placeholder = PERFIS.find((p) => p.valor === perfil).placeholder

  async function handleSubmit(evento) {
    evento.preventDefault()
    const novosErros = validarLogin({ email, senha })
    setErros(novosErros)
    setErroGeral('')
    if (Object.keys(novosErros).length > 0) return

    setEnviando(true)
    try {
      const { usuario } = await authService.login({
        perfil,
        email: email.trim().toLowerCase(),
        senha,
      })
      onSuccess(usuario)
    } catch (err) {
      setErroGeral(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AuthLayout
      destaque={
        <>
          <h1>Sua sala de estudo, sem fila e sem papel.</h1>
          <p>
            Consulte horários livres, monte seu grupo de no mínimo 3 discentes e retire a chave na
            recepção só se identificando.
          </p>
        </>
      }
    >
      <div className="form-card">
        <h2>Entrar</h2>
        <p className="subtitulo">Use seu e-mail institucional.</p>

        <div className="tabs" role="tablist" aria-label="Tipo de usuário">
          {PERFIS.map((p) => (
            <button
              key={p.valor}
              type="button"
              role="tab"
              aria-selected={perfil === p.valor}
              className={perfil === p.valor ? 'tab tab-ativa' : 'tab'}
              onClick={() => setPerfil(p.valor)}
            >
              {p.rotulo}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <Field label="E-mail institucional" htmlFor="login-email" erro={erros.email}>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              className={classeInput(erros.email)}
              aria-invalid={Boolean(erros.email)}
              placeholder={placeholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field
            label="Senha"
            htmlFor="login-senha"
            erro={erros.senha}
            acao={
              <a href="#" className="link-discreto" onClick={(e) => e.preventDefault()}>
                Esqueceu a senha?
              </a>
            }
          >
            <input
              id="login-senha"
              type="password"
              autoComplete="current-password"
              className={classeInput(erros.senha)}
              aria-invalid={Boolean(erros.senha)}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </Field>

          {erroGeral && <p className="erro-geral" role="alert">{erroGeral}</p>}

          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar →'}
          </button>
        </form>

        <p className="rodape-form">
          Primeiro acesso?{' '}
          <button type="button" className="link" onClick={() => onIrParaCadastro(perfil)}>
            {PERFIS.find((p) => p.valor === perfil).rotuloCadastro}
          </button>
        </p>
      </div>
    </AuthLayout>
  )
}

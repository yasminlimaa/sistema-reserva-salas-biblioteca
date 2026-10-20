import { useState } from 'react'
import AuthLayout from './AuthLayout.jsx'
import Field, { classeInput } from './Field.jsx'
import { authService } from '../services/auth/index.js'
import { validarCadastro } from '../lib/validators.js'
import { CONFIG_CADASTRO } from '../lib/perfis.js'

const VAZIO = {
  nome: '',
  matricula: '',
  unidade: '',
  email: '',
  telefone: '',
  senha: '',
  confirmarSenha: '',
  aceite: false,
}

function destaqueDe(perfil) {
  if (perfil === 'funcionario') {
    return (
      <>
        <h1>Crie sua conta de servidor em menos de um minuto.</h1>
        <ol className="passos">
          <li>
            <span className="numero">1</span>
            <div>
              <strong>Cadastre-se com sua matrícula SIAPE.</strong>
              Ela identifica você nas reservas e na recepção.
            </div>
          </li>
          <li>
            <span className="numero">2</span>
            <div>
              <strong>Confirme o e-mail institucional.</strong>
              Use seu endereço @ufma.br para receber as notificações.
            </div>
          </li>
          <li>
            <span className="numero">3</span>
            <div>
              <strong>Gerencie reservas e chaves.</strong>
              Você acessa as funções permitidas ao seu perfil.
            </div>
          </li>
        </ol>
      </>
    )
  }

  return (
    <>
      <h1>Crie sua conta em menos de um minuto.</h1>
      <ol className="passos">
        <li>
          <span className="numero">1</span>
          <div>
            <strong>Cadastre-se com sua matrícula.</strong>
            Ela identifica você nas reservas e no balcão.
          </div>
        </li>
        <li>
          <span className="numero">2</span>
          <div>
            <strong>Confirme o e-mail institucional.</strong>
            É por ele que chegam as notificações das reservas.
          </div>
        </li>
        <li>
          <span className="numero">3</span>
          <div>
            <strong>Reserve com seu grupo.</strong>
            Colegas cadastrados podem ser adicionados pela matrícula.
          </div>
        </li>
      </ol>
    </>
  )
}

export default function CadastroForm({ perfil = 'discente', onSuccess, onIrParaLogin }) {
  const config = CONFIG_CADASTRO[perfil]
  const [dados, setDados] = useState(VAZIO)
  const [erros, setErros] = useState({})
  const [erroGeral, setErroGeral] = useState('')
  const [matriculaVerificada, setMatriculaVerificada] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [confirmacaoPendente, setConfirmacaoPendente] = useState(false)

  function atualizar(campo, valor) {
    setDados((d) => ({ ...d, [campo]: valor }))
    setErros((e) => ({ ...e, [campo]: undefined }))
  }

  function alterarMatricula(valor) {
    atualizar('matricula', valor.replace(/\D/g, ''))
    setMatriculaVerificada(false)
  }

  // Consulta a matrícula ao sair do campo (só discente). Se o provedor não verifica (retorna null), vale o preenchimento manual.
  async function verificarMatricula() {
    if (!config.buscaMatricula || !config.regexMatricula.test(dados.matricula)) return
    try {
      const resultado = await authService.buscarMatricula(dados.matricula)
      if (!resultado) return
      if (!resultado.ativa) {
        setErros((e) => ({ ...e, matricula: 'Matrícula inativa ou não encontrada.' }))
        return
      }
      setMatriculaVerificada(true)
      if (resultado.curso) setDados((d) => ({ ...d, unidade: resultado.curso }))
    } catch {
      setErros((e) => ({ ...e, matricula: 'Não foi possível verificar a matrícula agora.' }))
    }
  }

  async function handleSubmit(evento) {
    evento.preventDefault()
    const novosErros = validarCadastro(dados, perfil)
    setErros(novosErros)
    setErroGeral('')
    if (Object.keys(novosErros).length > 0) return

    setEnviando(true)
    try {
      const { usuario, precisaConfirmarEmail } = await authService.cadastrar({
        perfil,
        nome: dados.nome.trim(),
        matricula: dados.matricula,
        unidade: dados.unidade.trim(),
        email: dados.email.trim().toLowerCase(),
        telefone: dados.telefone.replace(/\D/g, '') || null,
        senha: dados.senha,
      })
      if (precisaConfirmarEmail) setConfirmacaoPendente(true)
      else if (usuario) onSuccess(usuario)
    } catch (err) {
      setErroGeral(err.message)
    } finally {
      setEnviando(false)
    }
  }

  if (confirmacaoPendente) {
    return (
      <AuthLayout destaque={destaqueDe(perfil)}>
        <div className="form-card">
          <h2>Confira seu e-mail</h2>
          <p className="subtitulo">
            Enviamos um link de confirmação para <strong>{dados.email.trim().toLowerCase()}</strong>.
            Depois de confirmar, volte aqui para entrar.
          </p>
          <button type="button" className="btn-primary" onClick={onIrParaLogin}>
            Ir para entrar
          </button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout destaque={destaqueDe(perfil)}>
      <div className="form-card largo">
        <p className="rotulo-secao">{config.titulo}</p>
        <h2>Seus dados</h2>

        <form onSubmit={handleSubmit} noValidate>
          <Field label="Nome completo" htmlFor="cad-nome" erro={erros.nome}>
            <input
              id="cad-nome"
              className={classeInput(erros.nome)}
              autoComplete="name"
              value={dados.nome}
              onChange={(e) => atualizar('nome', e.target.value)}
            />
          </Field>

          <div className="grid-2">
            <Field
              label={config.rotuloMatricula}
              htmlFor="cad-matricula"
              erro={erros.matricula}
              dica={matriculaVerificada ? 'Matrícula ativa encontrada no SIGAA.' : undefined}
            >
              <input
                id="cad-matricula"
                inputMode="numeric"
                className={classeInput(erros.matricula)}
                value={dados.matricula}
                onChange={(e) => alterarMatricula(e.target.value)}
                onBlur={verificarMatricula}
              />
            </Field>

            <Field label={config.rotuloUnidade} htmlFor="cad-unidade" erro={erros.unidade}>
              <input
                id="cad-unidade"
                className={classeInput(erros.unidade)}
                value={dados.unidade}
                onChange={(e) => atualizar('unidade', e.target.value)}
              />
            </Field>
          </div>

          <div className="grid-2">
            <Field label="E-mail institucional" htmlFor="cad-email" erro={erros.email}>
              <input
                id="cad-email"
                type="email"
                autoComplete="email"
                className={classeInput(erros.email)}
                placeholder={`nome${config.dominio}`}
                value={dados.email}
                onChange={(e) => atualizar('email', e.target.value)}
              />
            </Field>

            <Field label="Telefone (opcional)" htmlFor="cad-telefone" erro={erros.telefone}>
              <input
                id="cad-telefone"
                type="tel"
                autoComplete="tel"
                className={classeInput(erros.telefone)}
                placeholder="(98) 90000-0000"
                value={dados.telefone}
                onChange={(e) => atualizar('telefone', e.target.value)}
              />
            </Field>
          </div>

          <div className="grid-2">
            <Field label="Senha" htmlFor="cad-senha" erro={erros.senha}>
              <input
                id="cad-senha"
                type="password"
                autoComplete="new-password"
                placeholder="Mínimo de 8 caracteres"
                className={classeInput(erros.senha)}
                value={dados.senha}
                onChange={(e) => atualizar('senha', e.target.value)}
              />
            </Field>

            <Field label="Confirmar senha" htmlFor="cad-confirmar" erro={erros.confirmarSenha}>
              <input
                id="cad-confirmar"
                type="password"
                autoComplete="new-password"
                placeholder="Repita a senha"
                className={classeInput(erros.confirmarSenha)}
                value={dados.confirmarSenha}
                onChange={(e) => atualizar('confirmarSenha', e.target.value)}
              />
            </Field>
          </div>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={dados.aceite}
              onChange={(e) => atualizar('aceite', e.target.checked)}
            />
            <span>{config.aceite}</span>
          </label>
          {erros.aceite && <p className="field-erro" role="alert">{erros.aceite}</p>}

          {erroGeral && <p className="erro-geral" role="alert">{erroGeral}</p>}

          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Criando conta…' : 'Criar minha conta'}
          </button>
        </form>

        <p className="rodape-form">
          Já tem cadastro?{' '}
          <button type="button" className="link" onClick={onIrParaLogin}>
            Entrar
          </button>
        </p>
      </div>
    </AuthLayout>
  )
}

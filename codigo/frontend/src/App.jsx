import { useEffect, useState } from 'react'
import LoginForm from './components/LoginForm.jsx'
import CadastroForm from './components/CadastroForm.jsx'
import MenuLateral from './components/MenuLateral.jsx'
import Inicio from './pages/Inicio.jsx'
import Disponibilidade from './pages/Disponibilidade.jsx'
import Participantes from './pages/Participantes.jsx'
import MinhasReservas from './pages/MinhasReservas.jsx'
import { authService } from './services/auth/index.js'
import { contarAvisosNaoLidos } from './services/reservas/index.js'
import './layout.css'
import ServicoChaves from './pages/ServicoChaves.jsx'
import GestaoReservas from './pages/GestaoReservas.jsx'

export default function App() {
  const [tela, setTela] = useState('login')
  // A sessão existe apenas enquanto a aplicação está aberta. Não persistimos o token no navegador.
  const [sessao, setSessao] = useState(null)
  const usuario = sessao?.usuario ?? null
  const token = sessao?.token ?? null
  const [perfilCadastro, setPerfilCadastro] = useState('discente')
  const [pagina, setPagina] = useState('inicio')
  const [naoLidos, setNaoLidos] = useState(0)
  const [rascunhoReserva, setRascunhoReserva] = useState(null)
  const [mensagemSucesso, setMensagemSucesso] = useState('')

  useEffect(() => {
    if (!usuario) return
    contarAvisosNaoLidos(usuario.id).then(setNaoLidos)
  }, [usuario, pagina])

  function iniciarSessao(resultado) {
    if (!resultado?.usuario) throw new Error('Não foi possível iniciar uma sessão sem usuário.')
    setSessao({
      usuario: resultado.usuario,
      token: typeof resultado.token === 'string' && resultado.token.trim() ? resultado.token : null,
    })
  }

  async function sair() {
    try {
      await authService.logout(token)
    } catch (err) {
      console.error(err)
    } finally {
      setSessao(null)
      setTela('login')
      setPagina('inicio')
      setRascunhoReserva(null)
      setMensagemSucesso('')
    }
  }

  if (usuario) {
    return (
      <div className="layout">
        <MenuLateral
          usuario={usuario}
          pagina={pagina}
          irPara={setPagina}
          naoLidos={naoLidos}
          sair={sair}
        />
        <main className="layout-conteudo">
          {pagina === 'disponibilidade' && (
            <Disponibilidade
              token={token}
              selecaoInicial={rascunhoReserva}
              onAvancar={(selecao) => {
                setRascunhoReserva(selecao)
                setPagina('participantes')
              }}
            />
          )}

          {pagina === 'participantes' && rascunhoReserva && (
            <Participantes
              usuario={usuario}
              token={token}
              reserva={rascunhoReserva}
              onVoltar={() => setPagina('disponibilidade')}
              onConfirmar={() => {
                setRascunhoReserva(null)
                setMensagemSucesso('Reserva confirmada.')
                setPagina('inicio')
              }}
            />
          )}

          {pagina === 'minhas' && <MinhasReservas usuario={usuario} token={token} irPara={setPagina} />}

          {/* Renderiza o Serviço de Chaves */}
          {pagina === 'chaves' && <ServicoChaves usuario={usuario} />}

          {pagina === 'gestao' && <GestaoReservas usuario={usuario} />}

          {/*Adicionado 'pagina !== "chaves"' para evitar sobreposição */}
          {pagina !== 'disponibilidade' && 
           pagina !== 'participantes' && 
           pagina !== 'minhas' && 
           pagina !== 'chaves' &&
           pagina !== 'gestao' && (
            <Inicio
              usuario={usuario}
              irPara={(destino) => {
                setMensagemSucesso('')
                setPagina(destino)
              }}
              mensagemSucesso={mensagemSucesso}
            />
          )}
        </main>
      </div>
    )
  }

  if (tela === 'cadastro') {
    return (
      <CadastroForm
        perfil={perfilCadastro}
        onSuccess={iniciarSessao}
        onIrParaLogin={() => setTela('login')}
      />
    )
  }

  return (
    <LoginForm
      onSuccess={iniciarSessao}
      onIrParaCadastro={(perfil) => {
        setPerfilCadastro(perfil)
        setTela('cadastro')
      }}
    />
  )
}

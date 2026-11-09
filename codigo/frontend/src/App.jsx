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
  const [usuario, setUsuario] = useState(null)
  const [perfilCadastro, setPerfilCadastro] = useState('discente')
  const [pagina, setPagina] = useState('inicio')
  const [naoLidos, setNaoLidos] = useState(0)
  const [rascunhoReserva, setRascunhoReserva] = useState(null)
  const [mensagemSucesso, setMensagemSucesso] = useState('')

  useEffect(() => {
    if (!usuario) return
    contarAvisosNaoLidos(usuario.id).then(setNaoLidos)
  }, [usuario, pagina])

  async function sair() {
    try {
      await authService.logout()
    } catch (err) {
      console.error(err)
    } finally {
      setUsuario(null)
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
              reserva={rascunhoReserva}
              onVoltar={() => setPagina('disponibilidade')}
              onConfirmar={() => {
                setRascunhoReserva(null)
                setMensagemSucesso('Reserva de demonstração local confirmada. Ela foi salva somente neste navegador.')
                setPagina('inicio')
              }}
            />
          )}

          {pagina === 'minhas' && <MinhasReservas usuario={usuario} irPara={setPagina} />}

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
        onSuccess={setUsuario}
        onIrParaLogin={() => setTela('login')}
      />
    )
  }

  return (
    <LoginForm
      onSuccess={setUsuario}
      onIrParaCadastro={(perfil) => {
        setPerfilCadastro(perfil)
        setTela('cadastro')
      }}
    />
  )
}
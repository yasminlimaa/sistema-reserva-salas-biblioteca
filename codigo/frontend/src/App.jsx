import { useEffect, useState } from 'react'
import LoginForm from './components/LoginForm.jsx'
import CadastroForm from './components/CadastroForm.jsx'
import MenuLateral from './components/MenuLateral.jsx'
import Inicio from './pages/Inicio.jsx'
import Disponibilidade from './pages/Disponibilidade.jsx'
import { authService } from './services/auth/index.js'
import { contarAvisosNaoLidos } from './services/reservas/index.js'
import './layout.css'

export default function App() {
  const [tela, setTela] = useState('login')
  const [usuario, setUsuario] = useState(null)
  const [perfilCadastro, setPerfilCadastro] = useState('discente')
  const [pagina, setPagina] = useState('inicio')
  const [naoLidos, setNaoLidos] = useState(0)

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
          {pagina === 'disponibilidade'
            ? <Disponibilidade />
            : <Inicio usuario={usuario} irPara={setPagina} />}
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

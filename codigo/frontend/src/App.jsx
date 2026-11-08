import { useState } from 'react'
import LoginForm from './components/LoginForm.jsx'
import CadastroForm from './components/CadastroForm.jsx'
import Inicio from './pages/Inicio.jsx'
import { authService } from './services/auth/index.js'

export default function App() {
  const [tela, setTela] = useState('login')
  const [usuario, setUsuario] = useState(null)
  const [perfilCadastro, setPerfilCadastro] = useState('discente')

  async function sair() {
    try {
      await authService.logout()
    } catch (err) {
      console.error(err)
    } finally {
      setUsuario(null)
      setTela('login')
    }
  }

  if (usuario) {
    return <Inicio usuario={usuario} sair={sair} />
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

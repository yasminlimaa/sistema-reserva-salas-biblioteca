import { useState } from 'react'
import LoginForm from './components/LoginForm.jsx'
import CadastroForm from './components/CadastroForm.jsx'
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
    return (
      <main className="sessao">
        <h1>{usuario.nome ? `Olá, ${usuario.nome}` : 'Olá!'}</h1>
        <p>Sessão iniciada. Tela em construção.</p>
        <button type="button" className="btn-primary" onClick={sair}>Sair</button>
      </main>
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

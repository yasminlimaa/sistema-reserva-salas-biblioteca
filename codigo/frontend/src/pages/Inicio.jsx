import './Inicio.css'

export default function Inicio({ usuario, sair }) {
  const tipo = usuario.perfil === 'funcionario' ? 'Funcionário' : 'Discente'

  return (
    <div className="inicio">
      <header className="inicio-topo">
        <div className="inicio-marca">
          <strong>Salaa BU</strong>
          <small>Biblioteca Universitária · UFMA</small>
        </div>
        <button type="button" className="inicio-sair" onClick={sair}>
          Sair
        </button>
      </header>

      <main className="inicio-conteudo">
        <span className="inicio-tipo">{tipo}</span>
        <h1>{usuario.nome ? `Olá, ${usuario.nome}` : 'Olá!'}</h1>
        <p>Bem-vindo à Salaa BU. As reservas de salas ainda estão em construção.</p>
      </main>
    </div>
  )
}

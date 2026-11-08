import React from 'react'

const SECOES = [
  {
    titulo: 'Reservas',
    itens: [
      { id: 'inicio', rotulo: 'Início', icone: 'casa' },
      { id: 'disponibilidade', rotulo: 'Disponibilidade', icone: 'calendario' },
      { id: 'nova', rotulo: 'Nova reserva', icone: 'mais', ir: 'disponibilidade' },
      { id: 'minhas', rotulo: 'Minhas reservas', icone: 'lista' },
    ],
  },
  {
    titulo: 'Biblioteca',
    itens: [
      /* NOVO: Item visível exclusivamente para funcionários */
      { id: 'chaves', rotulo: 'Serviço de Chaves', icone: 'chave', apenasFuncionario: true },
      { id: 'salas', rotulo: 'Salas', icone: 'porta', emBreve: true },
      { id: 'discentes', rotulo: 'Discentes', icone: 'pessoas', emBreve: true },
    ],
  },
  {
    titulo: 'Conta',
    itens: [
      { id: 'notificacoes', rotulo: 'Notificações', icone: 'sino', emBreve: true, badge: true },
      { id: 'sair', rotulo: 'Sair', icone: 'sair', acao: 'sair' },
    ],
  },
]

const ICONES = {
  casa: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  calendario: 'M4 5h16v15H4z M4 9h16 M8 3v4 M16 3v4',
  mais: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8v8 M8 12h8',
  lista: 'M9 6h11 M9 12h11 M9 18h11 M4 6h.01 M4 12h.01 M4 18h.01',
  porta: 'M5 3h14v18H5z M15 12h.01',
  pessoas:
    'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1 M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M21 19v-1a4 4 0 0 0-3-3.9 M16 4.1a3.5 3.5 0 0 1 0 6.8',
  sino: 'M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8 M10 21h4',
  sair: 'M15 4h4v16h-4 M10 17l5-5-5-5 M15 12H4',
  /* NOVO: Ícone SVG de chave */
  chave: 'M21 2l-6 6M15.5 7.5l2.5 2.5M13 10l2.5 2.5M10 14a5 5 0 1 1-7-7 5 5 0 0 1 7 7z',
}

function Icone({ nome }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONES[nome]} />
    </svg>
  )
}

export default function MenuLateral({ usuario, pagina, irPara, naoLidos, sair }) {
  const tipo = usuario.perfil === 'funcionario' ? 'Funcionário' : 'Discente'
  const iniciais = (usuario.nome || usuario.email)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')

  function acionar(item) {
    if (item.acao === 'sair') sair()
    else irPara(item.ir ?? item.id)
  }

  return (
    <aside className="menu-lateral">
      <div className="menu-marca">
        <span className="logo-icone" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="14" height="14">
            <rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M6 8h4" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </span>
        <div>
          <strong>Salas BU</strong>
          <small>Biblioteca Universitária · UFMA</small>
        </div>
      </div>

      <nav className="menu-secoes" aria-label="Principal">
        {SECOES.map((secao) => (
          <div className="menu-secao" key={secao.titulo}>
            <h3>{secao.titulo}</h3>
            <div className="menu-itens">
              {/* ATUALIZADO: Filtra os itens ignorando itens de funcionário caso seja discente */}
              {secao.itens
                .filter((item) => !item.apenasFuncionario || usuario.perfil === 'funcionario')
                .map((item) => {
                  const ativo = pagina === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={ativo ? 'menu-item ativo' : 'menu-item'}
                      disabled={item.emBreve}
                      title={item.emBreve ? 'Em breve' : undefined}
                      aria-current={ativo ? 'page' : undefined}
                      onClick={() => acionar(item)}
                    >
                      <Icone nome={item.icone} />
                      <span>{item.rotulo}</span>
                      {item.badge && naoLidos > 0 && <span className="menu-badge">{naoLidos}</span>}
                    </button>
                  )
                })}
            </div>
          </div>
        ))}
      </nav>

      <div className="menu-rodape">
        <span className="menu-avatar" aria-hidden="true">{iniciais}</span>
        <div>
          <strong>{usuario.nome || usuario.email}</strong>
          <small>{tipo}</small>
        </div>
      </div>
    </aside>
  )
}
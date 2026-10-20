export default function AuthLayout({ destaque, children }) {
  return (
    <div className="auth-page">
      <aside className="auth-destaque">
        <Logo />
        <div className="auth-destaque-texto">{destaque}</div>
      </aside>
      <section className="auth-conteudo">{children}</section>
    </div>
  )
}

function Logo() {
  return (
    <div className="logo">
      <span className="logo-icone" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="14" height="14">
          <rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M6 8h4" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </span>
      <div>
        <strong>Sala Biblioteca Universitária · UFMA</strong>
      </div>
    </div>
  )
}

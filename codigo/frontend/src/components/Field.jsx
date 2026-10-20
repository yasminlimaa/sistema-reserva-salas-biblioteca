export function classeInput(erro) {
  return erro ? 'input input-erro' : 'input'
}

export default function Field({ label, htmlFor, erro, dica, acao, children }) {
  return (
    <div className="field">
      <div className="field-label">
        <label htmlFor={htmlFor}>{label}</label>
        {acao}
      </div>
      {children}
      {erro ? (
        <p className="field-erro" role="alert">{erro}</p>
      ) : dica ? (
        <p className="field-dica">{dica}</p>
      ) : null}
    </div>
  )
}

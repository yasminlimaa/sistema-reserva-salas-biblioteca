import { useEffect, useRef } from 'react'
import './Dialogo.css'

// Diálogo de confirmação no visual do app. Fecha com Esc ou clicando fora; o botão de voltar recebe o foco.
export default function Dialogo({ titulo, mensagem, textoConfirmar, textoVoltar = 'Voltar', aoConfirmar, aoFechar }) {
  const botaoVoltar = useRef(null)
  const fecharRef = useRef(aoFechar)
  fecharRef.current = aoFechar

  useEffect(() => {
    botaoVoltar.current?.focus()
    const tecla = (evento) => {
      if (evento.key === 'Escape') fecharRef.current()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  return (
    <div
      className="dialogo-fundo"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar()
      }}
    >
      <div className="dialogo" role="alertdialog" aria-modal="true" aria-labelledby="dialogo-titulo" aria-describedby="dialogo-mensagem">
        <span className="dialogo-icone" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l10 18H2z M12 10v4 M12 17.5v.01" />
          </svg>
        </span>
        <h2 id="dialogo-titulo">{titulo}</h2>
        <p id="dialogo-mensagem">{mensagem}</p>
        <div className="dialogo-acoes">
          <button ref={botaoVoltar} type="button" className="dialogo-secundario" onClick={aoFechar}>
            {textoVoltar}
          </button>
          <button type="button" className="dialogo-perigo" onClick={aoConfirmar}>
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}

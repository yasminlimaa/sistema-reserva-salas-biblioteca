import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatarData, horaDe, situacaoReserva } from '../lib/datas.js'
import Dialogo from '../components/Dialogo.jsx'
import { cancelarReservaDemo, listarReservas } from '../services/reservas/index.js'
import './MinhasReservas.css'

const ROTULOS = {
  confirmada: 'Confirmada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
}

function CartaoReserva({ reserva, usuario, onCancelar, cancelando }) {
  const situacao = situacaoReserva(reserva)
  const podeCancelar = reserva.status === 'confirmada' && reserva.responsavelId === usuario.id

  return (
    <article className="reserva-item">
      <div className="reserva-item-cabecalho">
        <div>
          <h3>{reserva.salaNome}</h3>
          <p>{formatarData(reserva.inicio.slice(0, 10))}</p>
        </div>
        <span className={`situacao-reserva ${situacao.chave}`}>{ROTULOS[situacao.chave]}</span>
      </div>
      <dl className="reserva-dados">
        <div><dt>Horário</dt><dd>{horaDe(reserva.inicio)} – {horaDe(reserva.fim)}</dd></div>
        <div><dt>Participantes</dt><dd>{reserva.participantes?.length ?? 0}</dd></div>
        {reserva.status === 'cancelada' && reserva.canceladaEm && (
          <div><dt>Cancelada em</dt><dd>{formatarData(reserva.canceladaEm.slice(0, 10))}, {horaDe(reserva.canceladaEm)}</dd></div>
        )}
      </dl>
      {podeCancelar && (
        <button type="button" className="botao-cancelar" disabled={cancelando} onClick={() => onCancelar(reserva)}>
          {cancelando ? 'Cancelando…' : 'Cancelar reserva'}
        </button>
      )}
    </article>
  )
}

export default function MinhasReservas({ usuario }) {
  const [reservas, setReservas] = useState(null)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [cancelando, setCancelando] = useState(null)
  const [paraCancelar, setParaCancelar] = useState(null)

  const carregar = useCallback(async () => {
    setReservas(await listarReservas(usuario.id))
  }, [usuario.id])

  useEffect(() => {
    carregar().catch(() => setErro('Não foi possível carregar suas reservas de demonstração.'))
  }, [carregar])

  const grupos = useMemo(() => {
    const lista = reservas ?? []
    return {
      proximas: lista.filter((reserva) => situacaoReserva(reserva).chave === 'confirmada'),
      historico: lista.filter((reserva) => situacaoReserva(reserva).chave === 'concluida'),
      canceladas: lista.filter((reserva) => situacaoReserva(reserva).chave === 'cancelada'),
    }
  }, [reservas])

  async function cancelar(reserva) {
    setCancelando(reserva.id)
    setMensagem('')
    setErro('')
    try {
      await cancelarReservaDemo(reserva.id, usuario)
      await carregar()
      setMensagem('Reserva de demonstração local cancelada. O horário foi liberado.')
    } catch (err) {
      setErro(err.message || 'Não foi possível cancelar a reserva.')
    } finally {
      setCancelando(null)
    }
  }

  function secao(titulo, lista, vazia) {
    return (
      <section className="reservas-secao">
        <h2>{titulo}</h2>
        {lista.length === 0 ? <p className="reservas-vazia">{vazia}</p> : (
          <div className="reservas-lista">
            {lista.map((reserva) => (
              <CartaoReserva
                key={reserva.id}
                reserva={reserva}
                usuario={usuario}
                onCancelar={setParaCancelar}
                cancelando={cancelando === reserva.id}
              />
            ))}
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="minhas-reservas">
      <header className="minhas-reservas-cabecalho">
        <div>
          <span>Modo de demonstração local</span>
          <h1>Minhas reservas</h1>
          <p>Acompanhe suas reservas e consulte o histórico.</p>
        </div>
      </header>

      {mensagem && <p className="reservas-sucesso" role="status">{mensagem}</p>}
      {erro && <p className="reservas-erro" role="alert">{erro}</p>}
      {reservas === null ? <p className="reservas-carregando">Carregando reservas…</p> : (
        <>
          {secao('Próximas reservas', grupos.proximas, 'Você não possui próximas reservas.')}
          {secao('Histórico', grupos.historico, 'Nenhuma reserva concluída até o momento.')}
          {secao('Canceladas', grupos.canceladas, 'Nenhuma reserva cancelada.')}
        </>
      )}

      {paraCancelar && (
        <Dialogo
          titulo="Cancelar reserva?"
          mensagem={
            <>
              <strong>{paraCancelar.salaNome}</strong>, {formatarData(paraCancelar.inicio.slice(0, 10))}, das{' '}
              {horaDe(paraCancelar.inicio)} às {horaDe(paraCancelar.fim)}. O horário será liberado.
            </>
          }
          textoConfirmar="Sim, cancelar"
          textoVoltar="Manter reserva"
          aoFechar={() => setParaCancelar(null)}
          aoConfirmar={() => {
            const reserva = paraCancelar
            setParaCancelar(null)
            cancelar(reserva)
          }}
        />
      )}
    </div>
  )
}

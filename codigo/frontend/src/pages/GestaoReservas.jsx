import { useCallback, useEffect, useState } from 'react'
import Dialogo from '../components/Dialogo.jsx'
import { formatarData, horaDe } from '../lib/datas.js'
import { cancelarReservaDemo, listarTodasReservas, statusChaveDaReserva } from '../services/reservas/index.js'
import './GestaoReservas.css'

const ROTULO_CHAVE = {
  'na-recepcao': 'Na recepção',
  retirada: 'Retirada',
  atrasada: 'Atrasada',
  devolvida: 'Devolvida',
}

const p = (n) => String(n).padStart(2, '0')

function hojeLocal(d = new Date()) {
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Soma dias a uma data 'AAAA-MM-DD' sem depender de fuso horário.
function somarDias(iso, dias) {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return hojeLocal(new Date(ano, mes - 1, dia + dias))
}

function agoraLocal(d = new Date()) {
  return `${hojeLocal(d)}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function GestaoReservas({ usuario }) {
  const [data, setData] = useState(hojeLocal)
  const [reservas, setReservas] = useState(null)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [cancelando, setCancelando] = useState(null)
  const [paraCancelar, setParaCancelar] = useState(null)

  const carregar = useCallback(async () => {
    const lista = await listarTodasReservas(data)
    setReservas(
      lista.map((r) => ({
        ...r,
        responsavelNome: r.participantes.find((x) => x.id === r.responsavelId)?.nome ?? 'Responsável',
        chave: statusChaveDaReserva(r),
      })),
    )
  }, [data])

  useEffect(() => {
    setReservas(null)
    carregar().catch(() => setErro('Não foi possível carregar as reservas.'))
  }, [carregar])

  async function cancelar(reserva) {
    setCancelando(reserva.id)
    setMensagem('')
    setErro('')
    try {
      await cancelarReservaDemo(reserva.id, usuario)
      await carregar()
      setMensagem('Reserva cancelada. O horário foi liberado.')
    } catch (err) {
      setErro(err.message || 'Não foi possível cancelar a reserva.')
    } finally {
      setCancelando(null)
    }
  }

  if (reservas === null) return <p className="gestao-carregando">Carregando reservas…</p>

  const agora = agoraLocal()

  return (
    <div className="gestao">
      <header className="gestao-cabecalho">
        <div>
          <span>{formatarData(data)}</span>
          <h1>Gestão de reservas</h1>
          <p>Cancele reservas e acompanhe a situação das chaves.</p>
        </div>
        <div className="gestao-data">
          <span className="gestao-data-rotulo">Data</span>
          <div className="gestao-data-controle">
            <button
              type="button"
              className="gestao-seta"
              aria-label="Dia anterior"
              onClick={() => setData((atual) => somarDias(atual, -1))}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 5l-7 7 7 7 M7 12h11" />
              </svg>
            </button>
            <input
              id="gestao-data"
              type="date"
              className="input"
              value={data}
              onChange={(e) => setData(e.target.value)}
              aria-label="Data das reservas"
            />
            <button
              type="button"
              className="gestao-seta"
              aria-label="Próximo dia"
              onClick={() => setData((atual) => somarDias(atual, 1))}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 5l7 7-7 7 M6 12h11" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {mensagem && <p className="gestao-sucesso" role="status">{mensagem}</p>}
      {erro && <p className="gestao-erro" role="alert">{erro}</p>}

      {reservas.length === 0 ? (
        <p className="gestao-vazio">Nenhuma reserva nesta data.</p>
      ) : (
        <div className="gestao-tabela-wrap">
          <table className="gestao-tabela">
            <thead>
              <tr>
                <th>Sala</th>
                <th>Horário</th>
                <th>Responsável</th>
                <th>Grupo</th>
                <th>Reserva</th>
                <th>Chave</th>
                <th><span className="sr-only">Ação</span></th>
              </tr>
            </thead>
            <tbody>
              {reservas.map((r) => {
                const podeCancelar = r.status === 'confirmada' && r.fim > agora
                return (
                  <tr key={r.id}>
                    <td><strong>{r.salaNome}</strong></td>
                    <td>{horaDe(r.inicio)} – {horaDe(r.fim)}</td>
                    <td>{r.responsavelNome}</td>
                    <td>{r.participantes.length} discentes</td>
                    <td>
                      <span className={`gestao-situacao ${r.status}`}>
                        {r.status === 'cancelada' ? 'Cancelada' : 'Confirmada'}
                      </span>
                    </td>
                    <td>
                      {r.status === 'confirmada'
                        ? <span className={`gestao-chave chave-${r.chave}`}>{ROTULO_CHAVE[r.chave]}</span>
                        : '—'}
                    </td>
                    <td className="gestao-acao">
                      {podeCancelar && (
                        <button
                          type="button"
                          className="gestao-cancelar"
                          disabled={cancelando === r.id}
                          onClick={() => setParaCancelar(r)}
                        >
                          {cancelando === r.id ? 'Cancelando…' : 'Cancelar'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
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

import { useCallback, useEffect, useState } from 'react'
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

function agoraLocal(d = new Date()) {
  return `${hojeLocal(d)}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function GestaoReservas({ usuario }) {
  const [data, setData] = useState(hojeLocal)
  const [reservas, setReservas] = useState(null)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [cancelando, setCancelando] = useState(null)

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
    const texto = `${reserva.salaNome}, ${formatarData(reserva.inicio.slice(0, 10))}, ${horaDe(reserva.inicio)} – ${horaDe(reserva.fim)}`
    if (!window.confirm(`Cancelar a reserva de ${texto}? O horário será liberado.`)) return

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
        <label className="gestao-data">
          Data
          <input
            type="date"
            className="input"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </label>
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
                          onClick={() => cancelar(r)}
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
    </div>
  )
}

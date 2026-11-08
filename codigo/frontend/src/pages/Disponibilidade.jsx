import { useEffect, useRef, useState } from 'react'
import Field from '../components/Field.jsx'
import { formatarData, hojeISO } from '../lib/datas.js'
import { SALAS, listarOcupacao } from '../services/reservas/index.js'
import './Disponibilidade.css'

// Grade de 08h às 23h: cada coluna é uma hora.
const PRIMEIRA_HORA = 8
const HORAS = Array.from({ length: 16 }, (_, i) => PRIMEIRA_HORA + i)
const TOTAL_COLUNAS = HORAS.length

const FAIXAS = [
  { valor: '3-6', rotulo: '3 a 6', minimo: 3 },
  { valor: '7-10', rotulo: '7 a 10', minimo: 7 },
  { valor: '11-12', rotulo: '11 a 12', minimo: 11 },
]

const pad = (n) => String(n).padStart(2, '0')
const horaDeDT = (dataHora) => Number(dataHora.slice(11, 13))
const posicao = (hora) => `${((hora - PRIMEIRA_HORA) / TOTAL_COLUNAS) * 100}%`
const largura = (inicio, fim) => `${((fim - inicio) / TOTAL_COLUNAS) * 100}%`

export default function Disponibilidade() {
  const [data, setData] = useState(hojeISO())
  const [faixa, setFaixa] = useState('3-6')
  const [ocupacao, setOcupacao] = useState([])
  const [selecao, setSelecao] = useState(null)
  const arrastando = useRef(null)

  useEffect(() => {
    setSelecao(null)
    listarOcupacao(data).then((lista) =>
      setOcupacao(
        lista.map((r) => ({ salaId: r.salaId, ini: horaDeDT(r.inicio), fim: horaDeDT(r.fim) })),
      ),
    )
  }, [data])

  // Soltar o mouse em qualquer lugar encerra a seleção.
  useEffect(() => {
    const soltar = () => {
      arrastando.current = null
    }
    window.addEventListener('pointerup', soltar)
    return () => window.removeEventListener('pointerup', soltar)
  }, [])

  const faixaAtual = FAIXAS.find((f) => f.valor === faixa)
  const salasVisiveis = SALAS.filter((s) => s.capacidade >= faixaAtual.minimo)

  function livre(salaId, hora) {
    return ocupacao.every((o) => !(o.salaId === salaId && o.ini <= hora && hora < o.fim))
  }

  function iniciarSelecao(sala, hora) {
    if (sala.emManutencao || !livre(sala.id, hora)) return
    arrastando.current = { salaId: sala.id, origem: hora }
    setSelecao({ salaId: sala.id, ini: hora, fim: hora + 1 })
  }

  function estenderSelecao(sala, hora) {
    const arraste = arrastando.current
    if (!arraste || arraste.salaId !== sala.id) return
    const ini = Math.min(arraste.origem, hora)
    const fim = Math.max(arraste.origem, hora) + 1
    // Não deixa a seleção atravessar um horário ocupado.
    for (let h = ini; h < fim; h++) {
      if (!livre(sala.id, h)) return
    }
    setSelecao({ salaId: sala.id, ini, fim })
  }

  const salaSelecionada = selecao && SALAS.find((s) => s.id === selecao.salaId)

  return (
    <div className="disp">
      <header className="disp-cabecalho">
        <div>
          <span className="disp-data">{formatarData(data)}</span>
          <h1>Quando você quer estudar?</h1>
        </div>

        <div className="disp-filtros">
          <Field label="Data" htmlFor="disp-data">
            <input
              id="disp-data"
              type="date"
              className="input"
              min={hojeISO()}
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </Field>

          <Field label="Pessoas" htmlFor="disp-pessoas">
            <select
              id="disp-pessoas"
              className="input"
              value={faixa}
              onChange={(e) => setFaixa(e.target.value)}
            >
              {FAIXAS.map((f) => (
                <option key={f.valor} value={f.valor}>{f.rotulo}</option>
              ))}
            </select>
          </Field>
        </div>
      </header>

      <section className="disp-grade">
        <div className="grade-linha grade-cabecalho">
          <span />
          <div className="trilha">
            {HORAS.map((h) => (
              <span key={h}>{pad(h)}h</span>
            ))}
          </div>
        </div>

        {salasVisiveis.map((sala) => {
          const ocupadas = ocupacao.filter((o) => o.salaId === sala.id)
          const selecaoDaSala = selecao?.salaId === sala.id ? selecao : null

          return (
            <div className="grade-linha" key={sala.id}>
              <div className="sala-rotulo">
                <strong>{sala.nome}</strong>
                <small>Até {sala.capacidade} pessoas</small>
              </div>

              <div className="trilha">
                {HORAS.map((h) => {
                  const bloqueada = sala.emManutencao || !livre(sala.id, h)
                  return (
                    <div
                      key={h}
                      className={bloqueada ? 'celula celula-bloqueada' : 'celula'}
                      onPointerDown={() => iniciarSelecao(sala, h)}
                      onPointerEnter={() => estenderSelecao(sala, h)}
                    />
                  )
                })}

                {ocupadas.map((o, i) => (
                  <div
                    key={i}
                    className="bloco bloco-reservado"
                    style={{ left: posicao(o.ini), width: largura(o.ini, o.fim) }}
                  >
                    Reservada
                  </div>
                ))}

                {selecaoDaSala && (
                  <div
                    className="bloco bloco-selecao"
                    style={{ left: posicao(selecaoDaSala.ini), width: largura(selecaoDaSala.ini, selecaoDaSala.fim) }}
                  >
                    {pad(selecaoDaSala.ini)}:00 – {pad(selecaoDaSala.fim)}:00
                  </div>
                )}

                {sala.emManutencao && <div className="bloco bloco-manutencao">Em manutenção</div>}
              </div>
            </div>
          )
        })}

        <div className="legenda">
          <span><i className="lg-reservada" /> Reservada</span>
          <span><i className="lg-selecao" /> Sua seleção</span>
          <span><i className="lg-manutencao" /> Em manutenção</span>
          <span><i className="lg-livre" /> Livre — clique e arraste</span>
        </div>
      </section>

      {salaSelecionada ? (
        <section className="card-selecao">
          <span className="card-rotulo">Sua seleção</span>
          <h2>{salaSelecionada.nome}</h2>
          <p>Até {salaSelecionada.capacidade} pessoas</p>

          <div className="horarios">
            <div>
              <small>Início</small>
              <strong>{pad(selecao.ini)}:00</strong>
            </div>
            <div>
              <small>Fim</small>
              <strong>{pad(selecao.fim)}:00</strong>
            </div>
          </div>

          <ul className="checks">
            <li>✓ Sem conflito com outras reservas</li>
            <li className="alerta">! Precisa de 3 discentes ou mais</li>
          </ul>

          <button type="button" className="btn-primary" disabled>
            Reservar este horário →
          </button>
          <p className="nota">A escolha do grupo e a confirmação entram na próxima etapa.</p>
        </section>
      ) : (
        <section className="card-selecao vazio">
          <p>Clique e arraste em um horário livre para escolher sua sala.</p>
        </section>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import Field from '../components/Field.jsx'
import { diaUtilAnteriorBiblioteca, formatarData, motivoReservaIndisponivel, normalizarDataReserva, proximoDiaUtilApos, proximoDiaUtilBiblioteca } from '../lib/datas.js'
import { SALAS, listarOcupacao } from '../services/reservas/index.js'
import './Disponibilidade.css'

// Grade de 08h às 23h: cada coluna é uma hora.
const PRIMEIRA_HORA = 8
const HORAS = Array.from({ length: 11 }, (_, i) => PRIMEIRA_HORA + i)
const TOTAL_COLUNAS = HORAS.length
const DURACAO_MAXIMA = 2

const FAIXAS = [
  { valor: '3-6', rotulo: '3 a 6', minimo: 3 },
  { valor: '7-10', rotulo: '7 a 10', minimo: 7 },
  { valor: '11-12', rotulo: '11 a 12', minimo: 11 },
]

const pad = (n) => String(n).padStart(2, '0')
const horaDeDT = (dataHora) => Number(dataHora.slice(11, 13))
const posicao = (hora) => `${((hora - PRIMEIRA_HORA) / TOTAL_COLUNAS) * 100}%`
const largura = (inicio, fim) => `${((fim - inicio) / TOTAL_COLUNAS) * 100}%`

function Seta({ direcao }) {
  const caminho = direcao === 'anterior' ? 'M14 5l-7 7 7 7 M7 12h11' : 'M10 5l7 7-7 7 M6 12h11'
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={caminho} />
    </svg>
  )
}

export default function Disponibilidade({ onAvancar, selecaoInicial }) {
  const dataInicial = normalizarDataReserva(selecaoInicial?.data)
  const selecaoInicialValida = selecaoInicial?.data === dataInicial
    && !motivoReservaIndisponivel(dataInicial, selecaoInicial.inicio, selecaoInicial.fim)
  const [data, setData] = useState(dataInicial)
  const [faixa, setFaixa] = useState('3-6')
  const [piso, setPiso] = useState('todos')
  const [ocupacao, setOcupacao] = useState([])
  const [agora, setAgora] = useState(() => new Date())
  const [avisoData, setAvisoData] = useState('')
  const [selecao, setSelecao] = useState(() => (
    selecaoInicialValida
      ? {
          salaId: selecaoInicial.sala.id,
          ini: Number(selecaoInicial.inicio.slice(0, 2)),
          fim: Number(selecaoInicial.fim.slice(0, 2)),
        }
      : null
  ))
  const arrastando = useRef(null)
  const toqueInicial = useRef(null)
  const toquePendente = useRef(null)
  const primeiraConsulta = useRef(true)

  useEffect(() => {
    if (primeiraConsulta.current) primeiraConsulta.current = false
    else setSelecao(null)
    toqueInicial.current = null
    toquePendente.current = null
    listarOcupacao(data).then((lista) =>
      setOcupacao(
        lista.map((r) => ({ salaId: r.salaId, ini: horaDeDT(r.inicio), fim: horaDeDT(r.fim) })),
      ),
    )
  }, [data])

  useEffect(() => {
    const intervalo = window.setInterval(() => setAgora(new Date()), 60_000)
    return () => window.clearInterval(intervalo)
  }, [])

  useEffect(() => {
    const normalizada = normalizarDataReserva(data, agora)
    if (normalizada !== data) {
      setData(normalizada)
      setSelecao(null)
      toqueInicial.current = null
      toquePendente.current = null
    }
  }, [agora, data])

  // Soltar o mouse em qualquer lugar encerra a seleção.
  useEffect(() => {
    const soltar = () => {
      arrastando.current = null
    }
    window.addEventListener('pointerup', soltar)
    return () => window.removeEventListener('pointerup', soltar)
  }, [])

  const faixaAtual = FAIXAS.find((f) => f.valor === faixa)
  const salasVisiveis = SALAS.filter((sala) => (
    sala.capacidade >= faixaAtual.minimo && (piso === 'todos' || sala.piso === Number(piso))
  ))

  function livre(salaId, hora) {
    return !motivoReservaIndisponivel(data, `${pad(hora)}:00`, `${pad(hora + 1)}:00`, agora)
      && ocupacao.every((o) => !(o.salaId === salaId && o.ini <= hora && hora < o.fim))
  }

  function aplicarToque(sala, hora) {
    const toque = toqueInicial.current
    if (toque?.salaId === sala.id) {
      const ini = Math.min(toque.hora, hora)
      const fim = Math.max(toque.hora, hora) + 1
      if (fim - ini <= DURACAO_MAXIMA && Array.from({ length: fim - ini }, (_, i) => livre(sala.id, ini + i)).every(Boolean)) {
        setSelecao({ salaId: sala.id, ini, fim })
        toqueInicial.current = null
        return
      }
    }
    toqueInicial.current = { salaId: sala.id, hora }
    setSelecao({ salaId: sala.id, ini: hora, fim: hora + 1 })
  }

  function iniciarSelecao(sala, hora, tipoPonteiro, event) {
    if (sala.emManutencao || !livre(sala.id, hora)) return
    if (tipoPonteiro === 'touch') {
      toquePendente.current = { salaId: sala.id, hora, x: event.clientX, y: event.clientY, moveu: false }
      return
    }
    arrastando.current = { salaId: sala.id, origem: hora }
    setSelecao({ salaId: sala.id, ini: hora, fim: hora + 1 })
  }

  function acompanharToque(event) {
    const toque = toquePendente.current
    if (event.pointerType !== 'touch' || !toque) return
    if (Math.abs(event.clientX - toque.x) > 8 || Math.abs(event.clientY - toque.y) > 8) toque.moveu = true
  }

  function finalizarToque(event) {
    const toque = toquePendente.current
    toquePendente.current = null
    if (event.pointerType === 'touch' && toque && !toque.moveu) aplicarToque({ id: toque.salaId }, toque.hora)
  }

  function estenderSelecao(sala, hora) {
    const arraste = arrastando.current
    if (!arraste || arraste.salaId !== sala.id) return
    const ini = Math.min(arraste.origem, hora)
    const fim = Math.max(arraste.origem, hora) + 1
    if (fim - ini > DURACAO_MAXIMA) return
    // Não deixa a seleção atravessar um horário ocupado.
    for (let h = ini; h < fim; h++) {
      if (!livre(sala.id, h)) return
    }
    setSelecao({ salaId: sala.id, ini, fim })
  }

  const salaSelecionada = selecao && SALAS.find((s) => s.id === selecao.salaId)

  function atualizarFaixa(valor) {
    setFaixa(valor)
    setSelecao(null)
    toqueInicial.current = null
    toquePendente.current = null
  }

  function atualizarData(valor) {
    const normalizada = normalizarDataReserva(valor, agora)
    setAvisoData(normalizada !== valor ? 'A Biblioteca Central aceita reservas somente de segunda a sexta-feira. A data foi ajustada para o próximo dia útil.' : '')
    if (normalizada === data) return
    setData(normalizada)
    setSelecao(null)
    toqueInicial.current = null
    toquePendente.current = null
  }

  function atualizarPiso(valor) {
    setPiso(valor)
    setSelecao(null)
    toqueInicial.current = null
    toquePendente.current = null
  }

  function avancar() {
    if (!salaSelecionada || !selecao || !onAvancar) return
    onAvancar({
      sala: salaSelecionada,
      data,
      inicio: `${pad(selecao.ini)}:00`,
      fim: `${pad(selecao.fim)}:00`,
    })
  }

  const dataMinima = proximoDiaUtilBiblioteca(agora)
  const dataAnterior = diaUtilAnteriorBiblioteca(data, dataMinima)

  return (
    <div className="disp">
      <header className="disp-cabecalho">
        <div>
          <span className="disp-data">{formatarData(data)}</span>
          <h1>Quando você quer estudar?</h1>
        </div>

        <div className="disp-filtros">
          <Field label="Data" htmlFor="disp-data">
            <div className="controle-data">
              <button
                type="button"
                className="botao-data"
                disabled={!dataAnterior}
                aria-label="Ir para o dia útil anterior"
                onClick={() => atualizarData(dataAnterior)}
              >
                <Seta direcao="anterior" />
              </button>
              <input
                id="disp-data"
                type="date"
                className="input"
                min={dataMinima}
                value={data}
                onChange={(e) => atualizarData(e.target.value)}
                aria-describedby={avisoData ? 'disp-aviso-data' : undefined}
              />
              <button
                type="button"
                className="botao-data"
                aria-label="Ir para o próximo dia útil"
                onClick={() => atualizarData(proximoDiaUtilApos(data))}
              >
                <Seta direcao="proximo" />
              </button>
            </div>
          </Field>

          <Field label="Pessoas" htmlFor="disp-pessoas">
            <select
              id="disp-pessoas"
              className="input"
              value={faixa}
              onChange={(e) => atualizarFaixa(e.target.value)}
            >
              {FAIXAS.map((f) => (
                <option key={f.valor} value={f.valor}>{f.rotulo}</option>
              ))}
            </select>
          </Field>

          <div className="disp-pisos" role="group" aria-label="Filtrar por piso">
            {[
              { valor: 'todos', rotulo: 'Todos' },
              { valor: '1', rotulo: 'Piso 1' },
              { valor: '2', rotulo: 'Piso 2' },
            ].map((opcao) => (
              <button
                key={opcao.valor}
                type="button"
                className={piso === opcao.valor ? 'filtro-piso ativo' : 'filtro-piso'}
                aria-pressed={piso === opcao.valor}
                onClick={() => atualizarPiso(opcao.valor)}
              >
                {opcao.rotulo}
              </button>
            ))}
          </div>
        </div>
      </header>

      {avisoData && <p id="disp-aviso-data" className="disp-aviso-data" role="status">{avisoData}</p>}

      <section className="disp-grade">
        <div className="grade-linha grade-cabecalho">
          <span />
          <div className="trilha">
            {HORAS.map((h) => (
              <span key={h}>{h === 18 ? '18h–19h' : `${pad(h)}h`}</span>
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
                <small>Piso {sala.piso}{sala.bloco ? ` · ${sala.bloco}` : ''} · Até {sala.capacidade} pessoas</small>
                {sala.equipamentos?.length > 0 && <small>{sala.equipamentos.join(' e ')}</small>}
              </div>

              <div className="linha-do-tempo" onPointerMove={acompanharToque} onPointerUp={finalizarToque} onPointerCancel={() => { toquePendente.current = null }}>
                <span className="dica-deslize">Deslize para ver outros horários →</span>
                <div className="linha-do-tempo-conteudo">
                  <div className="trilha-cabecalho-mobile" aria-hidden="true">
                    {HORAS.map((h) => <span key={h}>{h === 18 ? '18h–19h' : `${pad(h)}h`}</span>)}
                  </div>
                  <div className="trilha">
                    {HORAS.map((h) => {
                      const motivo = motivoReservaIndisponivel(data, `${pad(h)}:00`, `${pad(h + 1)}:00`, agora)
                      const passada = motivo?.startsWith('O horário')
                      const foraFuncionamento = Boolean(motivo && !passada)
                      const bloqueada = sala.emManutencao || passada || foraFuncionamento || !livre(sala.id, h)
                      return (
                        <div
                          key={h}
                          className={passada ? 'celula celula-bloqueada celula-passada' : foraFuncionamento ? 'celula celula-bloqueada celula-fechada' : bloqueada ? 'celula celula-bloqueada' : 'celula'}
                          onPointerDown={(event) => iniciarSelecao(sala, h, event.pointerType, event)}
                          onPointerEnter={() => estenderSelecao(sala, h)}
                        />
                      )
                    })}

                    {ocupadas.map((o, i) => (
                  <div
                    key={i}
                    className="bloco bloco-reservado"
                    style={{ left: posicao(o.ini), width: largura(o.ini, o.fim) }}
                    role="img"
                    aria-label={`${sala.nome} reservada das ${pad(o.ini)}h às ${pad(o.fim)}h`}
                    title={`${sala.nome} reservada das ${pad(o.ini)}h às ${pad(o.fim)}h`}
                  >
                    <span className="bloco-intervalo">{pad(o.ini)}h–{pad(o.fim)}h</span>
                  </div>
                    ))}

                    {selecaoDaSala && (
                  <div
                    className="bloco bloco-selecao"
                    style={{ left: posicao(selecaoDaSala.ini), width: largura(selecaoDaSala.ini, selecaoDaSala.fim) }}
                    role="img"
                    aria-label={`${sala.nome}, sua seleção das ${pad(selecaoDaSala.ini)}h às ${pad(selecaoDaSala.fim)}h`}
                    title={`${sala.nome}, sua seleção das ${pad(selecaoDaSala.ini)}h às ${pad(selecaoDaSala.fim)}h`}
                  >
                    <span className="bloco-intervalo">{pad(selecaoDaSala.ini)}h–{pad(selecaoDaSala.fim)}h</span>
                  </div>
                    )}

                    {sala.emManutencao && <div className="bloco bloco-manutencao">Em manutenção</div>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {salasVisiveis.length === 0 && (
          <p className="grade-vazia">Nenhuma sala corresponde aos filtros selecionados.</p>
        )}

        <div className="legenda">
          <span><i className="lg-reservada" /> Reservada</span>
          <span><i className="lg-selecao" /> Sua seleção</span>
          <span><i className="lg-manutencao" /> Em manutenção</span>
          <span><i className="lg-passada" /> Horário já passou</span>
          <span><i className="lg-livre" /> Livre — clique e arraste</span>
        </div>
      </section>

      {salaSelecionada ? (
        <section className="card-selecao">
          <span className="card-rotulo">Sua seleção</span>
          <h2>{salaSelecionada.nome}</h2>
          <p>Piso {salaSelecionada.piso}{salaSelecionada.bloco ? ` · ${salaSelecionada.bloco}` : ''} · Até {salaSelecionada.capacidade} pessoas</p>
          {salaSelecionada.equipamentos?.length > 0 && (
            <p className="recursos">Recursos: {salaSelecionada.equipamentos.join(' e ')}</p>
          )}

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
            <li>✓ Não há conflito conhecido na disponibilidade exibida</li>
            <li className="alerta">
              <span className="icone-informacao" aria-hidden="true">i</span>
              <span>Na próxima etapa, adicione pelo menos 3 discentes para confirmar a reserva.</span>
            </li>
          </ul>

          <button type="button" className="btn-primary" disabled={!onAvancar} onClick={avancar}>
            Reservar este horário →
          </button>
          <p className="nota">A disponibilidade é informativa; a reserva será validada definitivamente na confirmação.</p>
        </section>
      ) : (
        <section className="card-selecao vazio">
          <p>Clique e arraste em um horário livre para escolher sua sala.</p>
        </section>
      )}
    </div>
  )
}

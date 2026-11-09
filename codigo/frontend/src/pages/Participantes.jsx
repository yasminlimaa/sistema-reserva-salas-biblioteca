import { useEffect, useMemo, useState } from 'react'
import { buscarDiscentes, criarReservaDemo } from '../services/reservas/index.js'
import { formatarData } from '../lib/datas.js'
import './Participantes.css'

const iniciais = (nome) => nome.split(' ').filter(Boolean).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase()

function participanteResponsavel(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome || usuario.email,
    matricula: usuario.matricula || 'Responsável da reserva',
  }
}

export default function Participantes({ usuario, reserva, onVoltar, onConfirmar }) {
  const responsavel = useMemo(() => participanteResponsavel(usuario), [usuario])
  const [participantes, setParticipantes] = useState([responsavel])
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState([])
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    buscarDiscentes(termo).then(setResultados)
  }, [termo])

  const capacidade = reserva.sala.capacidade
  const grupoCompleto = participantes.length >= 3 && participantes.length <= capacidade
  const resultadosVisiveis = resultados.filter((discente) => !participantes.some((item) => item.id === discente.id))

  function adicionar(discente) {
    if (participantes.length >= capacidade) {
      setErro(`Esta sala comporta no máximo ${capacidade} pessoas.`)
      return
    }
    setParticipantes((grupo) => [...grupo, discente])
    setErro('')
  }

  function remover(id) {
    if (id === responsavel.id) return
    setParticipantes((grupo) => grupo.filter((participante) => participante.id !== id))
    setErro('')
  }

  async function confirmar() {
    if (!grupoCompleto || salvando) return
    setSalvando(true)
    setErro('')
    try {
      const criada = await criarReservaDemo({
        salaId: reserva.sala.id,
        data: reserva.data,
        inicio: reserva.inicio,
        fim: reserva.fim,
        participantes,
        responsavel: usuario,
      })
      onConfirmar(criada)
    } catch (err) {
      setErro(err.message || 'Não foi possível confirmar a reserva de demonstração.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="participantes-pagina">
      <ol className="reserva-etapas" aria-label="Etapas da reserva">
        <li className="concluida">✓ Sala e horário</li>
        <li className="atual">2. Participantes</li>
        <li>3. Confirmar</li>
      </ol>

      <header className="participantes-cabecalho">
        <h1>Quem vai estudar com você?</h1>
        <p>A reserva será confirmada com pelo menos 3 discentes, contando você.</p>
      </header>

      <section className="participantes-card" aria-labelledby="grupo-titulo">
        <div className="card-linha-titulo">
          <strong id="grupo-titulo">Grupo</strong>
          <span className={grupoCompleto ? 'grupo-status completo' : 'grupo-status'}>
            {participantes.length} de 3 mínimos · {capacidade - participantes.length} vaga{capacidade - participantes.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="progresso-grupo" aria-label={`${participantes.length} participantes de 3 necessários`}>
          {Array.from({ length: 3 }, (_, indice) => <i key={indice} className={indice < participantes.length ? 'preenchido' : ''} />)}
        </div>

        <div className="lista-participantes">
          {participantes.map((participante) => {
            const eResponsavel = participante.id === responsavel.id
            return (
              <div className="participante" key={participante.id}>
                <span className="participante-avatar">{iniciais(participante.nome)}</span>
                <div>
                  <strong>{participante.nome}</strong>
                  <small>{participante.matricula}</small>
                </div>
                {eResponsavel ? <span className="selo-responsavel">Responsável</span> : (
                  <button type="button" className="botao-texto" onClick={() => remover(participante.id)}>Remover</button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="participantes-card adicionar-card">
        <label htmlFor="busca-discente">Adicionar discente</label>
        <div className="campo-busca">
          <span aria-hidden="true">⌕</span>
          <input
            id="busca-discente"
            type="search"
            value={termo}
            onChange={(event) => setTermo(event.target.value)}
            placeholder="Buscar por nome ou matrícula"
          />
        </div>
        <div className="resultados-busca">
          {resultadosVisiveis.map((discente) => (
            <div className="resultado-discente" key={discente.id}>
              <span className="participante-avatar">{iniciais(discente.nome)}</span>
              <div>
                <strong>{discente.nome}</strong>
                <small>{discente.matricula}</small>
              </div>
              <button type="button" className="botao-contorno" onClick={() => adicionar(discente)}>Adicionar</button>
            </div>
          ))}
          {resultadosVisiveis.length === 0 && <p className="busca-vazia">Nenhum discente disponível para adicionar.</p>}
        </div>
      </section>

      <section className="resumo-reserva">
        <span className="resumo-rotulo">Resumo da reserva</span>
        <h2>{reserva.sala.nome}</h2>
        {reserva.sala.bloco && <p>{reserva.sala.bloco}</p>}
        <dl>
          <div><dt>Data</dt><dd>{formatarData(reserva.data)}</dd></div>
          <div><dt>Horário</dt><dd>{reserva.inicio} – {reserva.fim}</dd></div>
          <div><dt>Responsável</dt><dd>{responsavel.nome}</dd></div>
          <div><dt>Participantes</dt><dd>{participantes.length} / {capacidade}</dd></div>
        </dl>
        {!grupoCompleto && <p className="aviso-grupo">Adicione mais {Math.max(0, 3 - participantes.length)} discente{3 - participantes.length === 1 ? '' : 's'} para liberar a confirmação.</p>}
        {erro && <p className="erro-reserva" role="alert">{erro}</p>}
        <button type="button" className="btn-primary" disabled={!grupoCompleto || salvando || usuario.perfil !== 'discente'} onClick={confirmar}>
          {salvando ? 'Confirmando…' : 'Confirmar reserva'}
        </button>
        <button type="button" className="link trocar-reserva" onClick={onVoltar}>Trocar sala ou horário</button>
      </section>
    </div>
  )
}

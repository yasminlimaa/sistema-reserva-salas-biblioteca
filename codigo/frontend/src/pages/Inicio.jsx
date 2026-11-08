import { useEffect, useState } from 'react'
import './Inicio.css'
import { dataDe, formatarData, formatarDataHora, horaDe, situacaoReserva } from '../lib/datas.js'
import { listarAvisos, listarReservas } from '../services/reservas/index.js'

export default function Inicio({ usuario, irPara }) {
  const tipo = usuario.perfil === 'funcionario' ? 'Funcionário' : 'Discente'
  const [reservas, setReservas] = useState(null)
  const [avisos, setAvisos] = useState(null)

  useEffect(() => {
    listarReservas(usuario.id).then((lista) =>
      setReservas(lista.filter((r) => situacaoReserva(r).chave === 'confirmada')),
    )
    listarAvisos(usuario.id).then(setAvisos)
  }, [usuario.id])

  return (
    <div className="inicio">
      <span className="inicio-tipo">{tipo}</span>
      <h1>{usuario.nome ? `Olá, ${usuario.nome}` : 'Olá!'}</h1>
      <p>O que você quer fazer hoje?</p>

      <div className="inicio-atalhos">
        <button type="button" className="inicio-atalho" onClick={() => irPara('disponibilidade')}>
          <strong>Nova reserva</strong>
          <span>Veja os horários livres e escolha sua sala</span>
        </button>
      </div>

      <section className="inicio-bloco">
        <h2>Próximas reservas</h2>
        {reservas === null && <p className="inicio-vazio">Carregando…</p>}
        {reservas?.length === 0 && <p className="inicio-vazio">Você não tem reservas futuras.</p>}
        {reservas?.slice(0, 3).map((r) => (
          <div key={r.id} className="inicio-item">
            <div>
              <strong>{r.salaNome}</strong>
              <span>
                {formatarData(dataDe(r.inicio))} · {horaDe(r.inicio)} – {horaDe(r.fim)}
              </span>
            </div>
          </div>
        ))}
      </section>

      <section className="inicio-bloco">
        <h2>Avisos recentes</h2>
        {avisos === null && <p className="inicio-vazio">Carregando…</p>}
        {avisos?.length === 0 && <p className="inicio-vazio">Nenhum aviso.</p>}
        {avisos?.slice(0, 3).map((a) => (
          <div key={a.id} className={a.lido ? 'inicio-item' : 'inicio-item nao-lido'}>
            {!a.lido && <span className="inicio-ponto" aria-label="Não lido" />}
            <div>
              <p>{a.texto}</p>
              <small>{formatarDataHora(a.criadoEm)}</small>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

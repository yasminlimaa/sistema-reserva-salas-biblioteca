import React, { useState, useEffect } from 'react'
import HistoricoChavesModal from '../components/HistoricoChavesModal'
import { 
  listarServicoChavesDoDia, 
  registrarRetiradaChave, 
  registrarDevolucaoChave 
} from '../services/reservas/index.js'
import './ServicoChaves.css'
import './ServicoChavesData.css'

const p = (n) => String(n).padStart(2, '0')
const hojeLocal = (d = new Date()) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
const somarDias = (iso, dias) => {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return hojeLocal(new Date(ano, mes - 1, dia + dias))
}

export default function ServicoChaves({ usuario }) {
  const perfilAtual = usuario?.perfil || localStorage.getItem('user_perfil') || 'funcionario'
  const isFuncionario = perfilAtual === 'funcionario'

  const [chaves, setChaves] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [buscaMatricula, setBuscaMatricula] = useState('')
  const [modalItem, setModalItem] = useState(null)
  const [data, setData] = useState(hojeLocal)

  const carregarChaves = async () => {
    setCarregando(true)
    try {
      const lista = await listarServicoChavesDoDia(data)
      setChaves(lista)
    } catch (err) {
      console.error('Erro ao carregar claviculário:', err)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarChaves()
    const interval = setInterval(carregarChaves, 60000)
    return () => clearInterval(interval)
  }, [data])

  const handleRegistrarRetirada = async (reservaId) => {
    if (!reservaId) return
    const operador = usuario?.nome || usuario?.email || 'Funcionário Balcão'
    await registrarRetiradaChave(reservaId, operador)
    await carregarChaves()
  }

  const handleRegistrarDevolucao = async (item) => {
    if (!item.reservaId) return
    const operador = usuario?.nome || usuario?.email || 'Funcionário Balcão'
    const comAtraso = item.status === 'atrasada'
    await registrarDevolucaoChave(item.reservaId, operador, comAtraso)
    await carregarChaves()
  }

  const chavesFiltradas = chaves.filter(
    (item) =>
      item.matricula.toLowerCase().includes(buscaMatricula.toLowerCase().trim()) ||
      item.responsavel.toLowerCase().includes(buscaMatricula.toLowerCase().trim()) ||
      item.sala.toLowerCase().includes(buscaMatricula.toLowerCase().trim())
  )

  // Totais calculados considerando a presença física no claviculário da recepção:
  // Chaves na recepção = Sem reserva + Aguardando retirada + Devolvidas
  const totalNaRecepcao = chaves.filter((c) => c.status === 'na-recepcao' || c.status === 'devolvida').length
  const totalRetiradas = chaves.filter((c) => c.status === 'retirada').length
  const totalAtrasadas = chaves.filter((c) => c.status === 'atrasada').length
  const totalReservasDia = chaves.filter((c) => c.temReserva).length

  if (!isFuncionario) {
    return (
      <div className="servico-chaves-page">
        <div className="acesso-negado-card">
          <div className="acesso-negado-title">Acesso Restrito</div>
          <div className="acesso-negado-text">
            A tela de <strong>Serviço de Chaves</strong> é de uso exclusivo para funcionários da recepção.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="servico-chaves-page">
      {/* Topo / Header */}
      <div className="chaves-header">
        <div className="chaves-title-group">
          <h1 className="chaves-heading">{data === hojeLocal() ? 'Chaves de hoje' : 'Chaves do dia'}</h1>
        </div>

        <div className="chaves-data-controle">
          <span className="chaves-data-rotulo">Data</span>
          <div className="chaves-data-linha">
            <button
              type="button"
              className="chaves-data-seta"
              aria-label="Dia anterior"
              onClick={() => setData((atual) => somarDias(atual, -1))}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 5l-7 7 7 7 M7 12h11" />
              </svg>
            </button>
            <input
              type="date"
              className="chaves-data-input"
              value={data}
              onChange={(e) => e.target.value && setData(e.target.value)}
              aria-label="Data do claviculário"
            />
            <button
              type="button"
              className="chaves-data-seta"
              aria-label="Próximo dia"
              onClick={() => setData((atual) => somarDias(atual, 1))}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 5l7 7-7 7 M6 12h11" />
              </svg>
            </button>
          </div>
          {data !== hojeLocal() && (
            <button type="button" className="chaves-data-hoje" onClick={() => setData(hojeLocal())}>
              Voltar para hoje
            </button>
          )}
        </div>

        <div className="chaves-search-box">
          <label className="chaves-search-label">Identificar discente no balcão</label>
          <div className="chaves-search-form">
            <input
              type="text"
              className="chaves-search-input"
              placeholder="Matrícula, nome ou sala"
              value={buscaMatricula}
              onChange={(e) => setBuscaMatricula(e.target.value)}
            />
            <button className="chaves-search-button" type="button" onClick={carregarChaves}>
              Buscar
            </button>
          </div>
        </div>
      </div>

      {/* Cards do Claviculário (Visão Global de 6 Chaves) */}
      <div className="chaves-summary-grid">
        <div className="summary-card">
          <span className="summary-card-label">Na recepção</span>
          <span className="summary-card-value">{totalNaRecepcao}</span>
        </div>

        <div className="summary-card">
          <span className="summary-card-label">Retiradas agora</span>
          <span className="summary-card-value">{totalRetiradas}</span>
        </div>

        <div className="summary-card alert">
          <span className="summary-card-label">Devolução atrasada</span>
          <span className="summary-card-value">{totalAtrasadas}</span>
        </div>

        <div className="summary-card">
          <span className="summary-card-label">Reservas no dia</span>
          <span className="summary-card-value">{totalReservasDia}</span>
        </div>
      </div>

      {/* Tabela do Claviculário Completo (Salas 01 a 06) */}
      <div className="chaves-table-section">
        <div className="chaves-table-wrapper">
          <table className="chaves-table">
            <thead>
              <tr>
                <th>Sala</th>
                <th>Horário</th>
                <th>Responsável</th>
                <th>Grupo</th>
                <th>Status da Chave</th>
                <th style={{ textAlign: 'right' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: '#757575' }}>
                    Sincronizando claviculário...
                  </td>
                </tr>
              ) : (
                chavesFiltradas.map((item) => (
                  <tr key={item.id}>
                    <td className="cell-sala">{item.sala}</td>
                    <td className="cell-horario">{item.horario}</td>
                    <td>
                      <div className="cell-responsavel">
                        <span className="responsavel-nome">{item.responsavel}</span>
                        {item.matricula !== '—' && (
                          <span className="responsavel-matricula">{item.matricula}</span>
                        )}
                      </div>
                    </td>
                    <td className="cell-grupo">{item.grupo}</td>
                    <td>
                      {item.status === 'atrasada' && (
                        <span className="badge-status atrasada">
                          <span className="badge-dot"></span>
                          Atrasada · {item.atrasoMinutos} min
                        </span>
                      )}
                      {item.status === 'devolvida' && (
                        <span className="badge-status devolvida">
                          <span className="badge-dot"></span>
                          Devolvida
                        </span>
                      )}
                      {item.status === 'retirada' && (
                        <span className="badge-status retirada">
                          <span className="badge-dot"></span>
                          Retirada
                        </span>
                      )}
                      {item.status === 'na-recepcao' && (
                        <span className="badge-status na-recepcao">
                          <span className="badge-dot"></span>
                          Na recepção
                        </span>
                      )}
                    </td>
                    <td className="action-cell">
                      {item.status === 'atrasada' && (
                        <button
                          className="btn-action danger"
                          onClick={() => handleRegistrarDevolucao(item)}
                        >
                          Registrar devolução
                        </button>
                      )}
                      {item.status === 'retirada' && (
                        <button
                          className="btn-action secondary"
                          onClick={() => handleRegistrarDevolucao(item)}
                        >
                          Registrar devolução
                        </button>
                      )}
                      {item.status === 'na-recepcao' && item.temReserva && (
                        <button
                          className="btn-action primary"
                          onClick={() => handleRegistrarRetirada(item.reservaId)}
                        >
                          Registrar retirada
                        </button>
                      )}
                      {(item.status === 'devolvida' || (!item.temReserva && item.status === 'na-recepcao')) && (
                        <button
                          className="btn-action secondary"
                          onClick={() => setModalItem(item)}
                        >
                          Ver histórico
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <HistoricoChavesModal
        chaveData={modalItem}
        onClose={() => setModalItem(null)}
      />
    </div>
  )
}
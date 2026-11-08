import { SALAS } from './mock.js'

const CHAVE_RESERVAS = 'demo-reservas'
const CHAVE_SERVICO_CHAVES = 'demo-chaves-status'

function lerReservas() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_RESERVAS)) ?? { reservas: [], avisos: [] }
  } catch {
    return { reservas: [], avisos: [] }
  }
}

function lerStatusChaves() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_SERVICO_CHAVES)) ?? {}
  } catch {
    return {}
  }
}

function salvarStatusChaves(dados) {
  localStorage.setItem(CHAVE_SERVICO_CHAVES, JSON.stringify(dados))
}

export async function listarServicoChavesDoDia(dataFiltro) {
  const dados = lerReservas()
  const statusChaves = lerStatusChaves()
  const dataAlvo = dataFiltro || new Date().toISOString().slice(0, 10)
  const agora = new Date()
  const horaAtualMinutos = agora.getHours() * 60 + agora.getMinutes()

  const reservasDoDia = dados.reservas.filter((r) => {
    const dataReserva = r.inicio.slice(0, 10)
    return r.status === 'confirmada' && dataReserva === dataAlvo
  })

  return SALAS.map((sala) => {
    const reserva = reservasDoDia.find((r) => r.salaId === sala.id)

    if (reserva) {
      const responsavelObj = reserva.participantes?.[0] || { nome: 'Discente Responsável', matricula: '---' }
      const inicioHora = reserva.inicio.slice(11, 16)
      const fimHora = reserva.fim.slice(11, 16)

      const registroChave = statusChaves[reserva.id] || {
        status: 'na-recepcao',
        historico: [
          { acao: 'Chave na recepção (Aguardando retirada)', horario: inicioHora, operador: 'Sistema' }
        ]
      }

      let statusFinal = registroChave.status
      let atrasoMinutos = 0

      if (statusFinal === 'retirada') {
        const [hFim, mFim] = fimHora.split(':').map(Number)
        const minutosFim = hFim * 60 + mFim
        if (horaAtualMinutos > minutosFim) {
          statusFinal = 'atrasada'
          atrasoMinutos = horaAtualMinutos - minutosFim
        }
      }

      return {
        id: reserva.id,
        reservaId: reserva.id,
        salaId: sala.id,
        sala: sala.nome,
        horario: `${inicioHora} – ${fimHora}`,
        horarioFim: fimHora,
        responsavel: responsavelObj.nome,
        matricula: responsavelObj.matricula || '---',
        grupo: `${reserva.participantes?.length || 1} discentes`,
        status: statusFinal,
        atrasoMinutos,
        historico: registroChave.historico || [],
        temReserva: true,
        emManutencao: Boolean(sala.emManutencao)
      }
    }

    return {
      id: `livre-${sala.id}`,
      reservaId: null,
      salaId: sala.id,
      sala: sala.nome,
      horario: 'Sem reserva hoje',
      horarioFim: null,
      responsavel: sala.emManutencao ? 'Em manutenção' : 'Disponível no claviculário',
      matricula: '—',
      grupo: '—',
      status: 'na-recepcao',
      atrasoMinutos: 0,
      historico: [
        { acao: 'Chave disponível na recepção', horario: '08:00', operador: 'Sistema' }
      ],
      temReserva: false,
      emManutencao: Boolean(sala.emManutencao)
    }
  })
}

export async function registrarRetiradaChave(reservaId, operadorNome = 'Recepção') {
  const statusChaves = lerStatusChaves()
  const horaAtual = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const registroAtual = statusChaves[reservaId] || { historico: [] }

  statusChaves[reservaId] = {
    status: 'retirada',
    historico: [
      ...registroAtual.historico,
      { acao: 'Retirada da chave realizada', horario: horaAtual, operador: operadorNome }
    ]
  }

  salvarStatusChaves(statusChaves)
  return statusChaves[reservaId]
}

export async function registrarDevolucaoChave(reservaId, operadorNome = 'Recepção', comAtraso = false) {
  const statusChaves = lerStatusChaves()
  const horaAtual = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const registroAtual = statusChaves[reservaId] || { historico: [] }

  statusChaves[reservaId] = {
    status: 'devolvida',
    historico: [
      ...registroAtual.historico,
      {
        acao: 'Devolução da chave concluída',
        horario: horaAtual,
        operador: operadorNome,
        observacao: comAtraso ? 'Devolução registrada com atraso.' : undefined
      }
    ]
  }

  salvarStatusChaves(statusChaves)
  return statusChaves[reservaId]
}
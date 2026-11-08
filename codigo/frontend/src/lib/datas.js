// Datas são strings 'AAAA-MM-DD' e data-hora 'AAAA-MM-DDTHH:MM' (horário local).
// Essas strings se comparam corretamente em ordem alfabética.
const pad = (n) => String(n).padStart(2, '0')

export function agoraISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function hojeISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const dataDe = (dataHoraISO) => dataHoraISO.slice(0, 10)
export const horaDe = (dataHoraISO) => dataHoraISO.slice(11, 16)

export function formatarData(data) {
  return new Date(`${data}T00:00`).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  })
}

export function formatarDataHora(dataHoraISO) {
  return `${formatarData(dataDe(dataHoraISO))}, ${horaDe(dataHoraISO)}`
}

export function situacaoReserva(reserva, agora = agoraISO()) {
  if (reserva.status === 'cancelada') return { chave: 'cancelada', rotulo: 'Cancelada' }
  if (reserva.fim <= agora) return { chave: 'concluida', rotulo: 'Concluída' }
  return { chave: 'confirmada', rotulo: 'Confirmada' }
}

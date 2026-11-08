// Datas são strings 'AAAA-MM-DD' e data-hora 'AAAA-MM-DDTHH:MM' (horário local).
// Essas strings se comparam corretamente em ordem alfabética.
const pad = (n) => String(n).padStart(2, '0')
const FUSO_BIBLIOTECA = 'America/Fortaleza'
export const HORA_ABERTURA_BIBLIOTECA = '08:00'
export const HORA_FECHAMENTO_BIBLIOTECA = '19:00'

function partesNoFusoBiblioteca(data) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_BIBLIOTECA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(data)
  return Object.fromEntries(partes.filter((parte) => parte.type !== 'literal').map((parte) => [parte.type, parte.value]))
}

// São Luís usa UTC−03:00; esta função não depende do fuso configurado no navegador.
export function agoraBibliotecaISO(data = new Date()) {
  const partes = partesNoFusoBiblioteca(data)
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`
}

export function hojeBibliotecaISO(data = new Date()) {
  return agoraBibliotecaISO(data).slice(0, 10)
}

export function inicioDaReservaJaPassou(data, hora, agora = new Date()) {
  return `${data}T${hora}` <= agoraBibliotecaISO(agora)
}

function partesDaData(data) {
  const [ano, mes, dia] = data.split('-').map(Number)
  return { ano, mes, dia }
}

function dataISOComDeslocamento(data, dias) {
  const { ano, mes, dia } = partesDaData(data)
  const resultado = new Date(Date.UTC(ano, mes - 1, dia + dias))
  return `${resultado.getUTCFullYear()}-${pad(resultado.getUTCMonth() + 1)}-${pad(resultado.getUTCDate())}`
}

export function ehDiaUtilBiblioteca(data) {
  const { ano, mes, dia } = partesDaData(data)
  const diaDaSemana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()
  return diaDaSemana >= 1 && diaDaSemana <= 5
}

export function proximoDiaUtilBiblioteca(agora = new Date()) {
  let data = hojeBibliotecaISO(agora)
  while (!ehDiaUtilBiblioteca(data)) data = dataISOComDeslocamento(data, 1)
  return data
}

export function normalizarDataReserva(data, agora = new Date()) {
  const primeiraDataPermitida = proximoDiaUtilBiblioteca(agora)
  let resultado = data && data >= primeiraDataPermitida ? data : primeiraDataPermitida
  while (!ehDiaUtilBiblioteca(resultado)) resultado = dataISOComDeslocamento(resultado, 1)
  return resultado
}

export function proximoDiaUtilApos(data) {
  let resultado = dataISOComDeslocamento(data, 1)
  while (!ehDiaUtilBiblioteca(resultado)) resultado = dataISOComDeslocamento(resultado, 1)
  return resultado
}

export function diaUtilAnteriorBiblioteca(data, limite) {
  let resultado = dataISOComDeslocamento(data, -1)
  while (!ehDiaUtilBiblioteca(resultado)) resultado = dataISOComDeslocamento(resultado, -1)
  return resultado >= limite ? resultado : null
}

export function motivoReservaIndisponivel(data, inicio, fim, agora = new Date()) {
  if (!ehDiaUtilBiblioteca(data)) return 'A Biblioteca Central funciona para reservas somente de segunda a sexta-feira.'
  if (inicio < HORA_ABERTURA_BIBLIOTECA || fim > HORA_FECHAMENTO_BIBLIOTECA || inicio >= fim) {
    return 'Escolha um horário entre 08:00 e 19:00; 19:00 é apenas o limite de término.'
  }
  if (inicioDaReservaJaPassou(data, inicio, agora)) return 'O horário selecionado já passou. Escolha outro horário para confirmar a reserva.'
  return null
}

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

export function situacaoReserva(reserva, agora = agoraBibliotecaISO()) {
  if (reserva.status === 'cancelada') return { chave: 'cancelada', rotulo: 'Cancelada' }
  if (reserva.fim <= agora) return { chave: 'concluida', rotulo: 'Concluída' }
  return { chave: 'confirmada', rotulo: 'Confirmada' }
}

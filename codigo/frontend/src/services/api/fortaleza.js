export const FUSO_FORTALEZA = 'America/Fortaleza'

const formatador = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_FORTALEZA,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

function partes(data) {
  return Object.fromEntries(formatador.formatToParts(data)
    .filter(({ type }) => type !== 'literal')
    .map(({ type, value }) => [type, value]))
}

// Converte um instante ISO (inclusive UTC/Z) para o formato sem offset usado pelas telas.
export function isoParaDataHoraFortaleza(iso) {
  if (!iso) return ''
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return ''
  const p = partes(data)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`
}

// A entrada da tela é uma data/hora civil de Fortaleza, não do fuso do computador.
// Fortaleza usa UTC−03:00; manter o offset explícito evita que Date interprete no fuso local.
export function dataHoraFortalezaParaIso(data, horario) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}(:\d{2})?$/.test(horario)) {
    throw new Error('Data ou horário inválido para America/Fortaleza.')
  }
  const segundos = horario.length === 5 ? `${horario}:00` : horario
  return new Date(`${data}T${segundos}-03:00`).toISOString()
}

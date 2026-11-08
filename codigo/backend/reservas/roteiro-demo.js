import { students, rooms } from './demo.js';

const base = `http://127.0.0.1:${Number(process.env.PORT || 3001)}`;
const createdIds = [];
async function request(label, method, path, who, payload, expected) {
  const key = who === 'F' ? 'DEMO_TOKEN_FUNCIONARIO' : `DEMO_TOKEN_DISCENTE_${who}`;
  if (!process.env[key]) throw new Error('Configure a demo antes de executar.');
  const response = await fetch(`${base}${path}`, {
    method, headers: { authorization: `Bearer ${process.env[key]}`,
      ...(payload ? { 'content-type': 'application/json' } : {}) },
    body: payload ? JSON.stringify(payload) : undefined, signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  console.log(`${label}: HTTP ${response.status}`);
  if (response.status !== expected) throw new Error(`Resultado inesperado na etapa: ${label}.`);
  return data;
}

try {
  if (process.env.DEMO_MODE !== 'true') throw new Error('Ative apenas o modo demo.');
  const start = Math.ceil((Date.now() + 86_400_000) / 3_600_000) * 3_600_000;
  const payload = { sala_id: rooms[0].id, inicio: new Date(start).toISOString(),
    fim: new Date(start + 3_600_000).toISOString(), participante_ids: students.slice(0, 3).map((s) => s.id) };
  await request('Grupo insuficiente rejeitado', 'POST', '/reservas', 'A', {
    ...payload, participante_ids: payload.participante_ids.slice(0, 2),
  }, 400);
  const reservation = await request('Reserva criada', 'POST', '/reservas', 'A', payload, 201);
  createdIds.push(reservation.reserva_id);
  console.log('Reserva fictícia:', reservation.reserva_id);
  await request('Conflito na mesma sala rejeitado', 'POST', '/reservas', 'D', {
    ...payload, participante_ids: students.slice(3, 6).map((s) => s.id),
  }, 409);
  await request('Conflito de participante em outra sala rejeitado', 'POST', '/reservas', 'D', {
    ...payload, sala_id: rooms[1].id, participante_ids: [students[3].id, students[4].id, students[0].id],
  }, 409);
  await request('Consulta persistida', 'GET', `/reservas/${reservation.reserva_id}`, 'A', undefined, 200);
  await request('Cancelamento por funcionário', 'POST', `/reservas/${reservation.reserva_id}/cancelamento`, 'F', undefined, 200);
  const replacement = await request('Horário liberado para nova reserva', 'POST', '/reservas', 'A', payload, 201);
  createdIds.push(replacement.reserva_id);
  console.log('Reposição fictícia:', replacement.reserva_id);
  console.log('Fluxo HTTP concluído. A outbox fica pendente até o worker publicar.');
} catch {
  console.error('Roteiro interrompido. Confira se a API está ativa, se os tokens correspondem e se o horário já está ocupado.');
  process.exitCode = 1;
} finally {
  for (const id of createdIds) {
    try { await request('Finalização: cancelar registro fictício', 'POST', `/reservas/${id}/cancelamento`, 'A', undefined, 200); }
    catch { console.error('Não foi possível cancelar o registro criado pelo roteiro:', id); process.exitCode = 1; }
  }
  if (createdIds.length) console.log('O histórico e os eventos fictícios foram mantidos no banco; não são dados reais.');
}

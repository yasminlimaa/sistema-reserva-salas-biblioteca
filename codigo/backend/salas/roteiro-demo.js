import { randomUUID } from 'node:crypto';

const base = `http://127.0.0.1:${Number(process.env.PORT || 3002)}`;

async function request(label, method, path, who, payload, expected) {
  const key = who === 'F' ? 'DEMO_TOKEN_FUNCIONARIO' : `DEMO_TOKEN_DISCENTE_${who}`;
  if (!process.env[key]) throw new Error('Configure a demo antes de executar.');
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env[key]}`,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  console.log(`${label}: HTTP ${response.status}`);
  if (response.status !== expected) throw new Error(`Resultado inesperado na etapa: ${label}.`);
  return data;
}

try {
  if (process.env.DEMO_MODE !== 'true') throw new Error('Ative apenas o modo demo.');
  const suffix = randomUUID().slice(0, 8);
  const roomPayload = {
    nome: `Sala Demo ${suffix}`,
    capacidade: 6,
    bloco: 'Bloco A',
    equipamentos: ['Quadro branco', 'TV'],
  };

  await request('Cadastro por discente rejeitado', 'POST', '/salas', 'A', roomPayload, 403);
  const created = await request('Sala cadastrada por funcionário', 'POST', '/salas', 'F', roomPayload, 201);
  console.log('Sala criada:', created.sala_id);

  await request('Consulta individual da sala', 'GET', `/salas/${created.sala_id}`, 'A', undefined, 200);
  await request('Gerenciamento/atualização da sala', 'PATCH', `/salas/${created.sala_id}`, 'F', {
    capacidade: 8,
    bloco: 'Bloco B',
  }, 200);

  await request('Desativação da sala', 'POST', `/salas/${created.sala_id}/desativacao`, 'F', undefined, 200);

  const start = Math.ceil((Date.now() + 86_400_000) / 3_600_000) * 3_600_000;
  const inicio = new Date(start).toISOString();
  const fim = new Date(start + 3_600_000).toISOString();
  const query = new URLSearchParams({ inicio, fim });
  const inactiveCheck = await request(
    'Disponibilidade de sala desativada',
    'GET',
    `/salas/${created.sala_id}/disponibilidade?${query}`,
    'A',
    undefined,
    200,
  );
  console.log('Disponível enquanto inativa:', inactiveCheck.disponivel, `(${inactiveCheck.motivo})`);

  await request('Reativação da sala', 'POST', `/salas/${created.sala_id}/ativacao`, 'F', undefined, 200);
  console.log('Fluxo HTTP de Salas concluído.');
} catch {
  console.error('Roteiro interrompido. Confira se a API de Salas está ativa e se os tokens correspondem.');
  process.exitCode = 1;
}


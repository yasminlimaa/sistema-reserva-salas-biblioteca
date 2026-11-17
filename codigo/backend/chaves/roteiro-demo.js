const base = `http://127.0.0.1:${Number(process.env.PORT || 3004)}`;

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
  await request('Acesso ao claviculário por discente rejeitado', 'GET', '/chaves/dia', 'A', undefined, 403);
  const painel = await request('Painel do claviculário por funcionário', 'GET', '/chaves/dia', 'F', undefined, 200);
  console.log('Resumo do claviculário:', painel.resumo);
} catch {
  console.error('Roteiro interrompido. Confira se as APIs de Chaves, Salas e Reservas estão ativas.');
  process.exitCode = 1;
}


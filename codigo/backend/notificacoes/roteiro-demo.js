const base = `http://127.0.0.1:${Number(process.env.PORT || 3005)}`;

async function request(label, method, path, who, expected) {
  const key = who === 'F' ? 'DEMO_TOKEN_FUNCIONARIO' : `DEMO_TOKEN_DISCENTE_${who}`;
  if (!process.env[key]) throw new Error('Configure a demo antes de executar.');
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${process.env[key]}` },
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  console.log(`${label}: HTTP ${response.status}`);
  if (response.status !== expected) throw new Error(`Resultado inesperado na etapa: ${label}.`);
  return data;
}

try {
  if (process.env.DEMO_MODE !== 'true') throw new Error('Ative apenas o modo demo.');
  const contagem = await request('Contagem de avisos não lidos (Discente A)', 'GET', '/avisos/nao-lidos/contagem', 'A', 200);
  console.log('Não lidos:', contagem.nao_lidos);
  const lista = await request('Listagem de avisos recentes (Discente A)', 'GET', '/avisos', 'A', 200);
  console.log('Total listado:', lista.avisos.length);
} catch {
  console.error('Roteiro interrompido. Confira se a API de Notificações está ativa.');
  process.exitCode = 1;
}


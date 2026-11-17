import { randomUUID } from 'node:crypto';

const base = `http://127.0.0.1:${Number(process.env.PORT || 3003)}`;

async function request(label, method, path, token, payload, expected) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = response.status === 204 ? null : await response.json();
  console.log(`${label}: HTTP ${response.status}`);
  if (response.status !== expected) throw new Error(`Resultado inesperado na etapa: ${label}.`);
  return data;
}

try {
  if (process.env.DEMO_MODE !== 'true') throw new Error('Ative apenas o modo demo.');
  const suffix = randomUUID().slice(0, 6);
  const matricula = String(Math.floor(2024000000 + Math.random() * 900000));
  const email = `aluno.${suffix}@discente.ufma.br`;

  await request('Consulta de matrícula ativa no SIGAA', 'GET', `/matriculas/${matricula}`, null, undefined, 200);
  const cadastro = await request('Cadastro de discente', 'POST', '/auth/cadastro', null, {
    perfil: 'discente',
    nome: `Discente Demo ${suffix}`,
    matricula,
    unidade: 'Engenharia da Computação',
    email,
    telefone: '98988887777',
    senha: 'senhaSegura123',
  }, 201);

  const login = await request('Login com e-mail e senha', 'POST', '/auth/login', null, {
    perfil: 'discente',
    email,
    senha: 'senhaSegura123',
  }, 200);

  await request('Identidade da sessão (GET /auth/me)', 'GET', '/auth/me', login.token, undefined, 200);
  await request('Busca de discentes (GET /discentes)', 'GET', `/discentes?termo=${encodeURIComponent(matricula)}`, login.token, undefined, 200);
  await request('Validação de discentes', 'POST', '/discentes/validacao', login.token, {
    discente_ids: [cadastro.usuario.id],
  }, 200);
  await request('Logout da sessão', 'POST', '/auth/logout', login.token, undefined, 204);
  console.log('Fluxo HTTP de Usuários concluído.');
} catch {
  console.error('Roteiro interrompido. Confira se a API de Usuários está ativa.');
  process.exitCode = 1;
}


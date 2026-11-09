import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../app.js';
import { createDemoAdapter, students, rooms } from '../demo.js';

const env = { DEMO_MODE: 'true', NODE_ENV: 'test',
  DEMO_TOKEN_DISCENTE_A: 'a'.repeat(64), DEMO_TOKEN_DISCENTE_D: 'd'.repeat(64),
  DEMO_TOKEN_FUNCIONARIO: 'f'.repeat(64) };
const directory = createDemoAdapter(env);
const body = { sala_id: rooms[0].id, inicio: '2070-01-01T15:00:00-03:00',
  fim: '2070-01-01T16:00:00-03:00', participante_ids: students.slice(0, 3).map((s) => s.id) };

test('demo não pode ser ativada em produção ou com tokens repetidos', () => {
  assert.throws(() => createDemoAdapter({ ...env, NODE_ENV: 'production' }));
  assert.throws(() => createDemoAdapter({ ...env, DEMO_TOKEN_DISCENTE_D: env.DEMO_TOKEN_DISCENTE_A }));
});

test('API rejeita entradas e acesso inválidos antes de tocar no banco', async (t) => {
  const pool = { query() { throw new Error('Não deveria consultar o banco'); },
    connect() { throw new Error('Não deveria abrir transação'); } };
  const app = buildApp({ pool, directory });
  t.after(() => app.close());
  const headers = { authorization: `Bearer ${env.DEMO_TOKEN_DISCENTE_A}` };
  const cases = [
    ['sem token', body, {}, 401],
    ['menos de três', { ...body, participante_ids: body.participante_ids.slice(0, 2) }, headers, 400],
    ['repetido', { ...body, participante_ids: [students[0].id, students[0].id, students[1].id] }, headers, 400],
    ['responsável ausente', { ...body, participante_ids: students.slice(1, 4).map((s) => s.id) }, headers, 400],
    ['duração longa', { ...body, fim: '2070-01-01T18:00:00-03:00' }, headers, 400],
    ['sala inativa', { ...body, sala_id: rooms[2].id }, headers, 422],
    ['discente desconhecido', { ...body, participante_ids: [students[0].id, students[1].id, rooms[0].id] }, headers, 422],
    ['responsável forjado no corpo', { ...body, responsavel_id: students[3].id }, headers, 400],
    ['funcionário criando reserva', body, { authorization: `Bearer ${env.DEMO_TOKEN_FUNCIONARIO}` }, 403],
  ];
  for (const [name, payload, auth, status] of cases) {
    await t.test(name, async () => {
      const response = await app.inject({ method: 'POST', url: '/reservas', headers: auth, payload });
      assert.equal(response.statusCode, status);
      assert.ok(response.json().correlation_id);
    });
  }
});

test('readiness indica indisponibilidade sem expor erro do driver', async (t) => {
  const app = buildApp({ directory, pool: { async query() { throw new Error('senha-ficticia'); } } });
  t.after(() => app.close());
  const response = await app.inject('/ready');
  assert.equal(response.statusCode, 503);
  assert.doesNotMatch(response.body, /senha-ficticia/);
});

test('integração HTTP com o serviço de Salas valida sala ativa, recusa inativa e retorna 503 em falha', async (t) => {
  const pool = {
    query() { throw new Error('Não deveria consultar o banco quando a sala é recusada ou Salas falha'); },
    connect() { throw new Error('Não deveria abrir transação'); },
  };
  let remoteStatus = 200;
  let remoteBody = { sala_id: rooms[0].id, nome: 'Sala 01', ativa: false };
  let networkFailure = false;

  const remoteDirectory = createDemoAdapter(
    { ...env, SALAS_API_URL: 'http://salas.local' },
    {
      async fetchImpl() {
        if (networkFailure) throw new Error('ECONNREFUSED');
        return {
          status: remoteStatus,
          ok: remoteStatus >= 200 && remoteStatus < 300,
          async json() { return remoteBody; },
        };
      },
    },
  );
  const app = buildApp({ pool, directory: remoteDirectory });
  t.after(() => app.close());
  const headers = { authorization: `Bearer ${env.DEMO_TOKEN_DISCENTE_A}` };

  // Sala desativada no serviço de Salas -> 422 SALA_INVALIDA
  const inactiveRes = await app.inject({ method: 'POST', url: '/reservas', headers, payload: body });
  assert.equal(inactiveRes.statusCode, 422);
  assert.equal(inactiveRes.json().codigo, 'SALA_INVALIDA');

  // Sala inexistente (404) no serviço de Salas -> 422 SALA_INVALIDA
  remoteStatus = 404;
  const missingRes = await app.inject({ method: 'POST', url: '/reservas', headers, payload: body });
  assert.equal(missingRes.statusCode, 422);

  // Falha de rede/timeout no serviço de Salas -> 503 DEPENDENCIA_INDISPONIVEL (sem fallback silencioso)
  networkFailure = true;
  const unavailableRes = await app.inject({ method: 'POST', url: '/reservas', headers, payload: body });
  assert.equal(unavailableRes.statusCode, 503);
  assert.equal(unavailableRes.json().codigo, 'DEPENDENCIA_INDISPONIVEL');
});

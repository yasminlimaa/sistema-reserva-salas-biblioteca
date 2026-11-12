import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { buildApp } from '../app.js';
import { createDemoAdapter, initialRooms } from '../demo.js';
import { buildApp as buildReservasApp } from '../../reservas/app.js';
import { createDemoAdapter as createReservasDemoAdapter, students } from '../../reservas/demo.js';

const env = {
  DEMO_MODE: 'true',
  NODE_ENV: 'test',
  RESERVAS_API_URL: 'http://reservas.local',
  DEMO_TOKEN_DISCENTE_A: 'a'.repeat(64),
  DEMO_TOKEN_DISCENTE_D: 'd'.repeat(64),
  DEMO_TOKEN_FUNCIONARIO: 'f'.repeat(64),
};

// Simula o pool PostgreSQL em memória para testes unitários rápidos da API de Salas.
function createMemoryPool(seed = []) {
  const store = new Map(seed.map((room) => [room.sala_id, {
    ...room,
    equipamentos: [...(room.equipamentos || [])],
    criada_em: new Date().toISOString(),
    atualizada_em: new Date().toISOString(),
  }]));

  async function execute(sql, values = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized === 'SELECT 1' || normalized.startsWith('BEGIN')
        || normalized.startsWith('SET LOCAL') || normalized === 'COMMIT'
        || normalized === 'ROLLBACK' || normalized.startsWith('SELECT pg_advisory_xact_lock')) {
      return { rows: [{ '?column?': 1 }] };
    }
    if (normalized.startsWith('SELECT sala_id FROM salas.salas WHERE sala_id = $1 FOR UPDATE')) {
      const found = store.get(values[0]);
      return { rows: found ? [{ sala_id: found.sala_id }] : [] };
    }
    if (normalized.includes('FROM salas.salas WHERE sala_id = $1')) {
      const found = store.get(values[0]);
      return { rows: found ? [{ ...found, equipamentos: [...found.equipamentos] }] : [] };
    }
    if (normalized.includes('FROM salas.salas WHERE ($1::boolean IS NULL')) {
      const [ativa, capacidadeMinima, limit, offset] = values;
      const filtered = [...store.values()]
        .filter((room) => (ativa === null || room.ativa === ativa)
          && (capacidadeMinima === null || room.capacidade >= capacidadeMinima))
        .sort((a, b) => a.nome.localeCompare(b.nome) || a.sala_id.localeCompare(b.sala_id))
        .slice(offset, offset + limit);
      return { rows: filtered };
    }
    if (normalized.startsWith('INSERT INTO salas.salas')) {
      const [sala_id, nome, capacidade, bloco, equipamentos, ativa] = values;
      if (store.has(sala_id) || [...store.values()].some((r) => r.nome === nome)) {
        const duplicate = new Error('duplicate key value violates unique constraint');
        duplicate.code = '23505';
        throw duplicate;
      }
      const now = new Date().toISOString();
      const created = {
        sala_id,
        nome,
        capacidade,
        bloco,
        equipamentos: [...equipamentos],
        ativa,
        criada_em: now,
        atualizada_em: now,
      };
      store.set(sala_id, created);
      return { rows: [created] };
    }
    if (normalized.startsWith('UPDATE salas.salas SET nome = $2')) {
      const [sala_id, nome, capacidade, bloco, equipamentos] = values;
      if ([...store.values()].some((r) => r.sala_id !== sala_id && r.nome === nome)) {
        const duplicate = new Error('duplicate key value violates unique constraint');
        duplicate.code = '23505';
        throw duplicate;
      }
      const current = store.get(sala_id);
      const updated = {
        ...current,
        nome,
        capacidade,
        bloco,
        equipamentos: [...equipamentos],
        atualizada_em: new Date().toISOString(),
      };
      store.set(sala_id, updated);
      return { rows: [updated] };
    }
    if (normalized.startsWith('UPDATE salas.salas SET ativa = $2')) {
      const [sala_id, ativa] = values;
      const current = store.get(sala_id);
      const updated = { ...current, ativa, atualizada_em: new Date().toISOString() };
      store.set(sala_id, updated);
      return { rows: [updated] };
    }
    throw new Error(`SQL não suportado no mock de teste: ${normalized}`);
  }

  return {
    query: execute,
    async connect() {
      return { query: execute, release() {} };
    },
  };
}

test('demo de Salas não pode ser ativada em produção ou com tokens repetidos', () => {
  assert.throws(() => createDemoAdapter({ ...env, NODE_ENV: 'production' }));
  assert.throws(() => createDemoAdapter({ ...env, DEMO_TOKEN_DISCENTE_D: env.DEMO_TOKEN_DISCENTE_A }));
});

test('API de Salas valida autorização e parâmetros de entrada antes de tocar no banco', async (t) => {
  const pool = {
    query() { throw new Error('Não deveria consultar o banco'); },
    connect() { throw new Error('Não deveria abrir transação'); },
  };
  const directory = createDemoAdapter(env);
  const app = buildApp({ pool, directory });
  t.after(() => app.close());

  const headersDiscente = { authorization: `Bearer ${env.DEMO_TOKEN_DISCENTE_A}` };
  const headersFuncionario = { authorization: `Bearer ${env.DEMO_TOKEN_FUNCIONARIO}` };
  const validPayload = {
    nome: 'Sala 01',
    capacidade: 6,
    bloco: 'Bloco A',
    equipamentos: ['Quadro branco', 'TV'],
  };

  const cases = [
    ['sem token', 'POST', '/salas', {}, validPayload, 401],
    ['discente tentando cadastrar sala', 'POST', '/salas', headersDiscente, validPayload, 403],
    ['discente tentando editar sala', 'PATCH', `/salas/${initialRooms[0].sala_id}`, headersDiscente, { capacidade: 8 }, 403],
    ['discente tentando desativar sala', 'POST', `/salas/${initialRooms[0].sala_id}/desativacao`, headersDiscente, undefined, 403],
    ['discente tentando ativar sala', 'POST', `/salas/${initialRooms[0].sala_id}/ativacao`, headersDiscente, undefined, 403],
    ['capacidade menor que 3', 'POST', '/salas', headersFuncionario, { ...validPayload, capacidade: 2 }, 400],
    ['capacidade maior que 50', 'POST', '/salas', headersFuncionario, { ...validPayload, capacidade: 51 }, 400],
    ['nome somente com espaços', 'POST', '/salas', headersFuncionario, { ...validPayload, nome: '   ' }, 400],
    ['equipamentos duplicados', 'POST', '/salas', headersFuncionario, { ...validPayload, equipamentos: ['TV', 'tv'] }, 400],
    ['atualização sem campos', 'PATCH', `/salas/${initialRooms[0].sala_id}`, headersFuncionario, {}, 400],
    ['intervalo de disponibilidade inválido', 'GET', `/salas/${initialRooms[0].sala_id}/disponibilidade?inicio=2070-01-01T15:00:00-03:00&fim=2070-01-01T18:00:00-03:00`, headersDiscente, undefined, 400],
  ];

  for (const [label, method, url, headers, payload, status] of cases) {
    await t.test(label, async () => {
      const response = await app.inject({ method, url, headers, payload });
      assert.equal(response.statusCode, status);
      assert.ok(response.json().correlation_id);
    });
  }
});

test('cadastro, gerenciamento, listagem e ativação/desativação funcionam com idempotência', async (t) => {
  const pool = createMemoryPool();
  const directory = createDemoAdapter(env);
  const app = buildApp({ pool, directory });
  t.after(() => app.close());

  const headersDiscente = { authorization: `Bearer ${env.DEMO_TOKEN_DISCENTE_A}` };
  const headersFuncionario = { authorization: `Bearer ${env.DEMO_TOKEN_FUNCIONARIO}` };

  // 1. Cadastrar sala
  const createdRes = await app.inject({
    method: 'POST',
    url: '/salas',
    headers: headersFuncionario,
    payload: {
      sala_id: initialRooms[0].sala_id,
      nome: '  Sala 01  ',
      capacidade: 6,
      bloco: ' Bloco A ',
      equipamentos: [' Quadro branco ', 'TV'],
    },
  });
  assert.equal(createdRes.statusCode, 201);
  assert.equal(createdRes.headers.location, `/salas/${initialRooms[0].sala_id}`);
  const created = createdRes.json();
  assert.equal(created.nome, 'Sala 01');
  assert.equal(created.bloco, 'Bloco A');
  assert.deepEqual(created.equipamentos, ['Quadro branco', 'TV']);
  assert.equal(created.ativa, true);

  // 2. Nome duplicado retorna 409
  const duplicateRes = await app.inject({
    method: 'POST',
    url: '/salas',
    headers: headersFuncionario,
    payload: { nome: 'Sala 01', capacidade: 8 },
  });
  assert.equal(duplicateRes.statusCode, 409);
  assert.equal(duplicateRes.json().codigo, 'CONFLITO_SALA');

  // 3. Gerenciar/atualizar sala (PATCH)
  const updatedRes = await app.inject({
    method: 'PATCH',
    url: `/salas/${created.sala_id}`,
    headers: headersFuncionario,
    payload: { capacidade: 10, bloco: 'Bloco B', equipamentos: ['Projetor'] },
  });
  assert.equal(updatedRes.statusCode, 200);
  assert.equal(updatedRes.json().capacidade, 10);
  assert.equal(updatedRes.json().bloco, 'Bloco B');
  assert.deepEqual(updatedRes.json().equipamentos, ['Projetor']);

  // 4. Desativar sala (idempotente)
  const deact1 = await app.inject({
    method: 'POST',
    url: `/salas/${created.sala_id}/desativacao`,
    headers: headersFuncionario,
  });
  assert.equal(deact1.statusCode, 200);
  assert.equal(deact1.json().ativa, false);

  const deact2 = await app.inject({
    method: 'POST',
    url: `/salas/${created.sala_id}/desativacao`,
    headers: headersFuncionario,
  });
  assert.equal(deact2.statusCode, 200);
  assert.equal(deact2.json().ativa, false);

  // 5. Filtrar listagem por ativa e capacidade_minima
  const activeList = await app.inject({
    method: 'GET',
    url: '/salas?ativa=true',
    headers: headersDiscente,
  });
  assert.equal(activeList.statusCode, 200);
  assert.equal(activeList.json().salas.length, 0);

  const inactiveList = await app.inject({
    method: 'GET',
    url: '/salas?ativa=false&capacidade_minima=8',
    headers: headersDiscente,
  });
  assert.equal(inactiveList.statusCode, 200);
  assert.equal(inactiveList.json().salas.length, 1);

  // 6. Reativar sala
  const act = await app.inject({
    method: 'POST',
    url: `/salas/${created.sala_id}/ativacao`,
    headers: headersFuncionario,
  });
  assert.equal(act.statusCode, 200);
  assert.equal(act.json().ativa, true);
});

test('integração bidirecional entre Salas e Reservas: validação de sala e consulta de disponibilidade', async (t) => {
  const salasPool = createMemoryPool(initialRooms);
  let occupied = false;

  // Simula o banco de Reservas para responder à consulta de ocupação.
  const reservasPool = {
    async query(sql) {
      if (sql.includes('SELECT NOT EXISTS')) return { rows: [{ disponivel: !occupied }] };
      return { rows: [{ '?column?': 1 }] };
    },
  };

  let salasApp;
  let reservasApp;

  // Roteador HTTP em memória conectando os dois serviços Fastify sem abrir portas de rede.
  const fetchBetweenServices = async (url, options = {}) => {
    const parsed = new URL(url);
    const target = parsed.hostname === 'salas.local' ? salasApp : reservasApp;
    const res = await target.inject({
      method: options.method || 'GET',
      url: `${parsed.pathname}${parsed.search}`,
      headers: options.headers,
    });
    return {
      status: res.statusCode,
      ok: res.statusCode >= 200 && res.statusCode < 300,
      async json() { return res.json(); },
    };
  };

  const salasDirectory = createDemoAdapter(
    { ...env, RESERVAS_API_URL: 'http://reservas.local' },
    { fetchImpl: fetchBetweenServices },
  );
  const reservasDirectory = createReservasDemoAdapter(
    { ...env, SALAS_API_URL: 'http://salas.local' },
    { fetchImpl: fetchBetweenServices },
  );

  salasApp = buildApp({ pool: salasPool, directory: salasDirectory });
  reservasApp = buildReservasApp({ pool: reservasPool, directory: reservasDirectory });
  t.after(async () => {
    await salasApp.close();
    await reservasApp.close();
  });

  const headersDiscente = { authorization: `Bearer ${env.DEMO_TOKEN_DISCENTE_A}` };
  const headersFuncionario = { authorization: `Bearer ${env.DEMO_TOKEN_FUNCIONARIO}` };
  const inicio = '2070-01-01T15:00:00-03:00';
  const fim = '2070-01-01T16:00:00-03:00';

  // 1. Consulta de disponibilidade em Salas para sala ativa e livre em Reservas -> disponivel: true
  const dispLivre = await salasApp.inject({
    method: 'GET',
    url: `/salas/${initialRooms[0].sala_id}/disponibilidade?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`,
    headers: headersDiscente,
  });
  assert.equal(dispLivre.statusCode, 200);
  assert.equal(dispLivre.json().disponivel, true);
  assert.equal(dispLivre.json().ativa, true);

  // 2. Quando Reservas indica ocupação, Salas reflete disponivel: false
  occupied = true;
  const dispOcupada = await salasApp.inject({
    method: 'GET',
    url: `/disponibilidade?sala_id=${initialRooms[0].sala_id}&inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`,
    headers: headersDiscente,
  });
  assert.equal(dispOcupada.statusCode, 200);
  assert.equal(dispOcupada.json().disponivel, false);
  occupied = false;

  // 3. Se o funcionário desativa a sala no serviço de Salas, tanto Salas quanto Reservas passam a recusá-la!
  await salasApp.inject({
    method: 'POST',
    url: `/salas/${initialRooms[0].sala_id}/desativacao`,
    headers: headersFuncionario,
  });

  const dispDesativada = await salasApp.inject({
    method: 'GET',
    url: `/salas/${initialRooms[0].sala_id}/disponibilidade?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`,
    headers: headersDiscente,
  });
  assert.equal(dispDesativada.statusCode, 200);
  assert.equal(dispDesativada.json().disponivel, false);
  assert.equal(dispDesativada.json().motivo, 'SALA_INATIVA');

  // Reservas consulta Salas via HTTP e rejeita com 422 SALA_INVALIDA a sala recém-desativada
  const reservaEmSalaDesativada = await reservasApp.inject({
    method: 'POST',
    url: '/reservas',
    headers: headersDiscente,
    payload: {
      sala_id: initialRooms[0].sala_id,
      inicio,
      fim,
      participante_ids: students.slice(0, 3).map((s) => s.id),
    },
  });
  assert.equal(reservaEmSalaDesativada.statusCode, 422);
  assert.equal(reservaEmSalaDesativada.json().codigo, 'SALA_INVALIDA');

  // 4. Sala inexistente retorna 404 em Salas e 422 em Reservas
  const unknownId = randomUUID();
  const notFound = await salasApp.inject({
    method: 'GET',
    url: `/salas/${unknownId}`,
    headers: headersDiscente,
  });
  assert.equal(notFound.statusCode, 404);
});

test('falha de comunicação com Reservas ou banco retorna 503 sem expor segredos', async (t) => {
  const pool = createMemoryPool(initialRooms);
  const directory = createDemoAdapter(env, {
    async fetchImpl() {
      throw new Error('ECONNREFUSED');
    },
  });
  const app = buildApp({ pool, directory });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: `/salas/${initialRooms[0].sala_id}/disponibilidade?inicio=2070-01-01T15:00:00-03:00&fim=2070-01-01T16:00:00-03:00`,
    headers: { authorization: `Bearer ${env.DEMO_TOKEN_DISCENTE_A}` },
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().codigo, 'DEPENDENCIA_INDISPONIVEL');

  const brokenApp = buildApp({
    directory,
    pool: { async query() { throw new Error('senha-super-secreta'); } },
  });
  t.after(() => brokenApp.close());
  const readyRes = await brokenApp.inject('/ready');
  assert.equal(readyRes.statusCode, 503);
  assert.doesNotMatch(readyRes.body, /senha-super-secreta/);
});


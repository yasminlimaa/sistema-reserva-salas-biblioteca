import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { buildApp } from '../app.js';
import { createDemoAdapter, fallbackRooms, students } from '../demo.js';

const env = {
  DEMO_MODE: 'true',
  NODE_ENV: 'test',
  RESERVAS_API_URL: 'http://reservas.local',
  DEMO_TOKEN_DISCENTE_A: 'a'.repeat(64),
  DEMO_TOKEN_DISCENTE_D: 'd'.repeat(64),
  DEMO_TOKEN_FUNCIONARIO: 'f'.repeat(64),
};

// Simula o pool PostgreSQL de Chaves em memória para testes rápidos da API.
function createMemoryPool() {
  const deliveries = new Map();
  const movements = [];

  async function execute(sql, values = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized === 'SELECT 1' || normalized.startsWith('BEGIN')
        || normalized.startsWith('SET LOCAL') || normalized === 'COMMIT'
        || normalized === 'ROLLBACK' || normalized.startsWith('SELECT pg_advisory_xact_lock')) {
      return { rows: [{ '?column?': 1 }] };
    }
    if (normalized.startsWith('SELECT status FROM chaves.entregas WHERE reserva_id = $1')) {
      const d = deliveries.get(values[0]);
      return { rows: d ? [{ status: d.status }] : [] };
    }
    if (normalized.startsWith('SELECT * FROM chaves.entregas WHERE reserva_id = $1')) {
      const d = deliveries.get(values[0]);
      return { rows: d ? [{ ...d }] : [] };
    }
    if (normalized.includes('FROM chaves.entregas WHERE sala_id = $1 AND status = \'retirada\'')) {
      const found = [...deliveries.values()].find(
        (d) => d.sala_id === values[0] && d.status === 'retirada',
      );
      return { rows: found ? [{ reserva_id: found.reserva_id }] : [] };
    }
    if (normalized.startsWith('INSERT INTO chaves.entregas')) {
      const [reserva_id, sala_id, responsavel_id, inicio_previsto, fim_previsto] = values;
      const created = {
        reserva_id,
        sala_id,
        responsavel_id,
        inicio_previsto,
        fim_previsto,
        status: 'retirada',
        retirada_em: new Date().toISOString(),
        devolvida_em: null,
        devolvida_com_atraso: false,
        atraso_minutos: 0,
      };
      deliveries.set(reserva_id, created);
      return { rows: [created] };
    }
    if (normalized.startsWith('UPDATE chaves.entregas SET status = \'devolvida\'')) {
      const [reserva_id, devolvida_com_atraso, atraso_minutos] = values;
      const current = deliveries.get(reserva_id);
      const updated = {
        ...current,
        status: 'devolvida',
        devolvida_em: new Date().toISOString(),
        devolvida_com_atraso,
        atraso_minutos,
      };
      deliveries.set(reserva_id, updated);
      return { rows: [updated] };
    }
    if (normalized.startsWith('INSERT INTO chaves.movimentacoes')) {
      const [movimentacao_id, reserva_id, sala_id, responsavel_id, tipo, acao, operador_id, operador_nome, observacao] = values;
      const created = {
        movimentacao_id,
        reserva_id,
        sala_id,
        responsavel_id,
        tipo,
        acao,
        operador_id,
        operador_nome,
        observacao: observacao || null,
        ocorrida_em: new Date().toISOString(),
      };
      movements.push(created);
      return { rows: [created] };
    }
    if (normalized.startsWith('SELECT * FROM chaves.movimentacoes WHERE reserva_id = $1')) {
      return { rows: movements.filter((m) => m.reserva_id === values[0]) };
    }
    if (normalized.startsWith('SELECT * FROM chaves.entregas WHERE reserva_id = ANY($1::uuid[])')) {
      const [ids] = values;
      return { rows: [...deliveries.values()].filter((d) => ids.includes(d.reserva_id)) };
    }
    if (normalized.startsWith('SELECT * FROM chaves.movimentacoes WHERE reserva_id = ANY($1::uuid[])')) {
      const [ids] = values;
      return { rows: movements.filter((m) => ids.includes(m.reserva_id)) };
    }
    throw new Error(`SQL não suportado no mock de Chaves: ${normalized}`);
  }

  return {
    query: execute,
    async connect() {
      return { query: execute, release() {} };
    },
  };
}

test('Serviço de Chaves: autorização, retirada, devolução, detecção de atraso e claviculário do dia', async (t) => {
  const pool = createMemoryPool();
  const reservationId = randomUUID();
  const reservation = {
    reserva_id: reservationId,
    sala_id: fallbackRooms[0].sala_id,
    responsavel_id: students[0].id,
    participante_ids: students.slice(0, 3).map((s) => s.id),
    inicio: '2026-11-17T10:00:00-03:00',
    fim: '2026-11-17T11:00:00-03:00',
    status: 'confirmada',
  };

  const directory = createDemoAdapter(env, {
    async fetchImpl(url) {
      if (url.includes(`/reservas/${reservationId}`)) {
        return { status: 200, ok: true, async json() { return reservation; } };
      }
      if (url.includes('/reservas?')) {
        return { status: 200, ok: true, async json() { return { reservas: [reservation] }; } };
      }
      return { status: 404, ok: false, async json() { return {}; } };
    },
  });

  const app = buildApp({ pool, directory });
  t.after(() => app.close());

  const headersDiscente = { authorization: `Bearer ${env.DEMO_TOKEN_DISCENTE_A}` };
  const headersFuncionario = { authorization: `Bearer ${env.DEMO_TOKEN_FUNCIONARIO}` };

  // 1. Discente é bloqueado de operar ou ver o painel do claviculário
  assert.equal((await app.inject({ method: 'GET', url: '/chaves/dia?data=2026-11-17', headers: headersDiscente })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: `/chaves/reservas/${reservationId}/retirada`, headers: headersDiscente })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: `/chaves/reservas/${reservationId}/devolucao`, headers: headersDiscente })).statusCode, 403);

  // 2. Antes da retirada, a chave está 'na-recepcao'
  const statusInicial = await app.inject({
    method: 'GET',
    url: `/chaves/reservas/${reservationId}`,
    headers: headersFuncionario,
  });
  assert.equal(statusInicial.statusCode, 200);
  assert.equal(statusInicial.json().status, 'na-recepcao');

  // 3. Devolução sem retirada prévia é rejeitada com 409
  const devolucaoSemRetirada = await app.inject({
    method: 'POST',
    url: `/chaves/reservas/${reservationId}/devolucao`,
    headers: headersFuncionario,
  });
  assert.equal(devolucaoSemRetirada.statusCode, 409);

  // 4. Funcionário registra retirada da chave
  const retirada = await app.inject({
    method: 'POST',
    url: `/chaves/reservas/${reservationId}/retirada`,
    headers: headersFuncionario,
    payload: { operador: 'Recepção Turno Manhã' },
  });
  assert.equal(retirada.statusCode, 201);
  // Como o fim (2026-11-17T11:00:00-03:00) já passou ou está em andamento, historico tem a retirada registrada
  assert.equal(retirada.json().historico.length, 2);
  assert.equal(retirada.json().historico[1].acao, 'Retirada da chave realizada');
  assert.equal(retirada.json().historico[1].operador, 'Recepção Turno Manhã');

  // 5. Duplicar retirada da mesma reserva retorna 409
  const retiradaDuplicada = await app.inject({
    method: 'POST',
    url: `/chaves/reservas/${reservationId}/retirada`,
    headers: headersFuncionario,
  });
  assert.equal(retiradaDuplicada.statusCode, 409);

  // 6. Painel do claviculário do dia reflete a reserva e o responsável
  const painel = await app.inject({
    method: 'GET',
    url: '/chaves/dia?data=2026-11-17',
    headers: headersFuncionario,
  });
  assert.equal(painel.statusCode, 200);
  const dadosPainel = painel.json();
  assert.equal(dadosPainel.resumo.reservas_dia, 1);
  const itemSala1 = dadosPainel.chaves.find((c) => c.reservaId === reservationId);
  assert.ok(itemSala1);
  assert.equal(itemSala1.responsavel, 'Gabriel André Barreto');
  assert.equal(itemSala1.matricula, '2024001301');

  // 7. Funcionário registra devolução com atraso e histórico preserva ambas as movimentações (RF11/RF12)
  const devolucao = await app.inject({
    method: 'POST',
    url: `/chaves/reservas/${reservationId}/devolucao`,
    headers: headersFuncionario,
    payload: { operador: 'Recepção Turno Tarde', com_atraso: true },
  });
  assert.equal(devolucao.statusCode, 200);
  const devJson = devolucao.json();
  assert.equal(devJson.status, 'devolvida');
  assert.equal(devJson.devolvida_com_atraso, true);
  assert.equal(devJson.historico.length, 3);
  assert.equal(devJson.historico[2].observacao, 'Devolução registrada com atraso.');

  // 8. Segunda devolução é rejeitada com 409
  const devolucaoDuplicada = await app.inject({
    method: 'POST',
    url: `/chaves/reservas/${reservationId}/devolucao`,
    headers: headersFuncionario,
  });
  assert.equal(devolucaoDuplicada.statusCode, 409);
});


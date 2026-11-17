import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { buildApp } from '../app.js';
import { createRepository } from '../repository.js';
import { processDelivery, errorQueue } from '../consumer.js';
import { createDemoAdapter, students } from '../demo.js';

const env = {
  DEMO_MODE: 'true',
  NODE_ENV: 'test',
  DEMO_TOKEN_DISCENTE_A: 'a'.repeat(64),
  DEMO_TOKEN_DISCENTE_D: 'd'.repeat(64),
  DEMO_TOKEN_FUNCIONARIO: 'f'.repeat(64),
};

// Simula o pool PostgreSQL de Notificações em memória para testes rápidos da API e do consumidor.
function createMemoryPool() {
  const notices = new Map();

  async function execute(sql, values = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized === 'SELECT 1' || normalized.startsWith('BEGIN')
        || normalized.startsWith('SET LOCAL') || normalized === 'COMMIT'
        || normalized === 'ROLLBACK' || normalized.startsWith('SELECT pg_advisory_xact_lock')) {
      return { rows: [{ '?column?': 1 }] };
    }
    if (normalized.startsWith('INSERT INTO notificacoes.avisos')) {
      const [
        aviso_id,
        event_id,
        reservation_id,
        usuario_id,
        room_id,
        event_type,
        texto,
        inicio,
        fim,
        ocorreu_em,
      ] = values;
      const existing = [...notices.values()].find((n) => n.event_id === event_id);
      if (existing) return { rows: [] };
      const created = {
        aviso_id,
        event_id,
        reservation_id,
        usuario_id,
        room_id,
        event_type,
        texto,
        inicio,
        fim,
        lido: false,
        lido_em: null,
        ocorreu_em,
        criado_em: new Date().toISOString(),
      };
      notices.set(aviso_id, created);
      return { rows: [created] };
    }
    if (normalized.startsWith('SELECT * FROM notificacoes.avisos WHERE event_id = $1')) {
      const existing = [...notices.values()].find((n) => n.event_id === values[0]);
      return { rows: existing ? [existing] : [] };
    }
    if (normalized.startsWith('SELECT * FROM notificacoes.avisos WHERE usuario_id = $1')) {
      const [usuarioId, apenasNaoLidos, limit, offset] = values;
      const filtered = [...notices.values()]
        .filter((n) => n.usuario_id === usuarioId && (!apenasNaoLidos || !n.lido))
        .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
        .slice(offset, offset + limit);
      return { rows: filtered };
    }
    if (normalized.startsWith('SELECT count(*)::integer AS total FROM notificacoes.avisos')) {
      const [usuarioId] = values;
      const total = [...notices.values()].filter((n) => n.usuario_id === usuarioId && !n.lido).length;
      return { rows: [{ total }] };
    }
    if (normalized.startsWith('SELECT * FROM notificacoes.avisos WHERE aviso_id = $1 FOR UPDATE')) {
      const found = notices.get(values[0]);
      return { rows: found ? [{ ...found }] : [] };
    }
    if (normalized.startsWith('UPDATE notificacoes.avisos SET lido = true, lido_em = now() WHERE aviso_id = $1')) {
      const found = notices.get(values[0]);
      const updated = { ...found, lido: true, lido_em: new Date().toISOString() };
      notices.set(values[0], updated);
      return { rows: [updated] };
    }
    if (normalized.startsWith('UPDATE notificacoes.avisos SET lido = true, lido_em = now() WHERE usuario_id = $1')) {
      let rowCount = 0;
      for (const [id, notice] of notices.entries()) {
        if (notice.usuario_id === values[0] && !notice.lido) {
          notices.set(id, { ...notice, lido: true, lido_em: new Date().toISOString() });
          rowCount++;
        }
      }
      return { rowCount, rows: [] };
    }
    throw new Error(`SQL não suportado no mock de Notificações: ${normalized}`);
  }

  return {
    query: execute,
    async connect() {
      return { query: execute, release() {} };
    },
  };
}

test('consumidor AMQP persiste aviso, deduplica event_id repetido, dá ACK após commit e envia inválidos para fila de erro', async (t) => {
  const pool = createMemoryPool();
  const repository = createRepository(pool);
  const directory = createDemoAdapter(env);
  const app = buildApp({ pool, directory });
  t.after(() => app.close());

  const acked = [];
  const nacked = [];
  const quarantined = [];
  const channel = {
    ack(msg) { acked.push(msg); },
    nack(msg, all, requeue) { nacked.push({ msg, all, requeue }); },
    sendToQueue(queue, content, options) { quarantined.push({ queue, content, options }); },
  };

  const eventId = randomUUID();
  const validPayload = {
    event_id: eventId,
    event_type: 'reserva.confirmada',
    schema_version: 1,
    reservation_id: randomUUID(),
    occurred_at: '2026-11-17T12:00:00-03:00',
    correlation_id: randomUUID(),
    responsavel_id: students[0].id,
    room_id: '20000000-0000-4000-8000-000000000001',
    inicio: '2026-11-18T14:00:00-03:00',
    fim: '2026-11-18T16:00:00-03:00',
    simulated: true,
  };

  const message = {
    content: Buffer.from(JSON.stringify(validPayload)),
    properties: { messageId: eventId },
  };

  // 1. Primeira entrega do evento grava aviso e envia ACK
  const first = await processDelivery(channel, message, repository);
  assert.equal(first.status, 'processado');
  assert.equal(acked.length, 1);

  // 2. Reentrega duplicada do mesmo event_id é ignorada de forma idempotente e recebe ACK
  const second = await processDelivery(channel, message, repository);
  assert.equal(second.status, 'duplicado_ignorado');
  assert.equal(acked.length, 2);

  // 3. Mensagem inválida vai para a fila durável de erros (notificacoes.reservas.erros), sem requeue infinito
  const invalidMsg = {
    content: Buffer.from('{"invalido":true}'),
    properties: { messageId: 'id-invalido' },
  };
  const quarantinedOutcome = await processDelivery(channel, invalidMsg, repository);
  assert.equal(quarantinedOutcome.status, 'quarentena');
  assert.equal(quarantined.length, 1);
  assert.equal(quarantined[0].queue, errorQueue);
  assert.equal(acked.length, 3);

  // 4. API HTTP de Notificações lista o aviso único para o Discente A (Inicio.jsx e MenuLateral.jsx)
  const headersA = { authorization: `Bearer ${env.DEMO_TOKEN_DISCENTE_A}` };
  const headersD = { authorization: `Bearer ${env.DEMO_TOKEN_DISCENTE_D}` };

  const countBefore = await app.inject({
    method: 'GET',
    url: '/avisos/nao-lidos/contagem',
    headers: headersA,
  });
  assert.equal(countBefore.statusCode, 200);
  assert.equal(countBefore.json().nao_lidos, 1);
  assert.equal(countBefore.json().naoLidos, 1);

  const listA = await app.inject({
    method: 'GET',
    url: '/avisos',
    headers: headersA,
  });
  assert.equal(listA.statusCode, 200);
  assert.equal(listA.json().avisos.length, 1);
  const aviso = listA.json().avisos[0];
  assert.match(aviso.texto, /Sala 01/);
  assert.equal(aviso.lido, false);

  // Discente D não pode marcar aviso do Discente A como lido
  const forbiddenRead = await app.inject({
    method: 'POST',
    url: `/avisos/${aviso.id}/leitura`,
    headers: headersD,
  });
  assert.equal(forbiddenRead.statusCode, 403);

  // Discente A marca seu aviso como lido
  const readRes = await app.inject({
    method: 'POST',
    url: `/avisos/${aviso.id}/leitura`,
    headers: headersA,
  });
  assert.equal(readRes.statusCode, 200);
  assert.equal(readRes.json().lido, true);

  const countAfter = await app.inject({
    method: 'GET',
    url: '/avisos/nao-lidos/contagem',
    headers: headersA,
  });
  assert.equal(countAfter.json().nao_lidos, 0);
});


import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import test from 'node:test';
import { createPool } from '../db.js';
import { createDemoAdapter, students, rooms } from '../demo.js';
import { buildApp } from '../app.js';
import { dispatchOne } from '../outbox.js';
import { createRepository } from '../repository.js';

// Executar explicitamente em banco de desenvolvimento após db:migrate/db:setup/demo:setup.
test('API com PostgreSQL real e credencial própria', async (t) => {
  const admin = createPool();
  const appEnv = parseEnv(await readFile('.env.app', 'utf8'));
  const runtime = createPool({ ...process.env, ...appEnv });
  const app = buildApp({ pool: runtime, directory: createDemoAdapter() });
  const ids = [];
  const base = Date.UTC(2070, 0, 1) + randomInt(0, 100_000) * 86_400_000;
  let slot = 0;
  const headers = (who = 'A') => ({ authorization: `Bearer ${process.env[who === 'F'
    ? 'DEMO_TOKEN_FUNCIONARIO' : `DEMO_TOKEN_DISCENTE_${who}`]}` });
  const input = (room = rooms[0].id, group = students.slice(0, 3), start = base + (slot++) * 14_400_000) => ({
    sala_id: room, participante_ids: group.map((s) => s.id),
    inicio: new Date(start).toISOString(), fim: new Date(start + 3_600_000).toISOString(),
  });
  async function create(payload, who = 'A') {
    const response = await app.inject({ method: 'POST', url: '/reservas', headers: headers(who), payload });
    if (response.statusCode === 201) ids.push(response.json().reserva_id);
    return response;
  }
  const cancel = (id, who = 'A') => app.inject({ method: 'POST', url: `/reservas/${id}/cancelamento`, headers: headers(who) });

  t.after(async () => {
    try {
      // Limpa somente IDs que este teste criou; não apaga reservas preexistentes.
      if (ids.length) {
        const client = await admin.connect();
        try {
          await client.query('BEGIN');
          await client.query('DELETE FROM reservas.outbox WHERE reservation_id = ANY($1::uuid[])', [ids]);
          await client.query('DELETE FROM reservas.reserva_participantes WHERE reserva_id = ANY($1::uuid[])', [ids]);
          await client.query('DELETE FROM reservas.reservas WHERE reserva_id = ANY($1::uuid[])', [ids]);
          await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
      }
    } finally { await app.close(); await runtime.end(); await admin.end(); }
  });

  await t.test('usuário da aplicação tem DML limitado e não cria tabelas', async () => {
    const { rows: [row] } = await runtime.query(`SELECT current_user AS usuario,
      has_schema_privilege(current_user, 'reservas', 'CREATE') AS criar,
      has_table_privilege(current_user, 'reservas.reservas', 'DELETE') AS apagar,
      has_table_privilege(current_user, 'reservas.reservas', 'TRUNCATE') AS truncar`);
    assert.equal(row.usuario, 'reservas_app');
    assert.equal(row.criar, false); assert.equal(row.apagar, false); assert.equal(row.truncar, false);
  });

  await t.test('criação persiste três participantes e outbox na mesma operação', async () => {
    const response = await create(input());
    assert.equal(response.statusCode, 201);
    const row = response.json();
    assert.equal(row.responsavel_id, students[0].id);
    assert.equal(row.participante_ids.length, 3);
    const { rows: [event] } = await admin.query('SELECT payload FROM reservas.outbox WHERE reservation_id = $1', [row.reserva_id]);
    assert.equal(event.payload.event_type, 'reserva.confirmada');
    assert.equal(event.payload.reservation_id, row.reserva_id);
  });

  await t.test('duas tentativas simultâneas na mesma sala confirmam somente uma', async () => {
    const a = input();
    const b = { ...a, participante_ids: students.slice(3, 6).map((s) => s.id) };
    const responses = await Promise.all([create(a), create(b, 'D')]);
    assert.deepEqual(responses.map((r) => r.statusCode).sort(), [201, 409]);
  });

  await t.test('salas diferentes com participante comum também bloqueiam concorrência', async () => {
    const a = input();
    const b = { ...a, sala_id: rooms[1].id, participante_ids: [students[3].id, students[4].id, students[0].id] };
    const responses = await Promise.all([create(a), create(b, 'D')]);
    assert.deepEqual(responses.map((r) => r.statusCode).sort(), [201, 409]);
  });

  await t.test('horários adjacentes são permitidos', async () => {
    const a = input();
    assert.equal((await create(a)).statusCode, 201);
    const start = Date.parse(a.fim);
    assert.equal((await create({ ...a, inicio: a.fim, fim: new Date(start + 3_600_000).toISOString() })).statusCode, 201);
  });

  await t.test('duas salas sem participante comum podem ser reservadas simultaneamente', async () => {
    const a = input();
    const b = { ...a, sala_id: rooms[1].id, participante_ids: students.slice(3, 6).map((s) => s.id) };
    const responses = await Promise.all([create(a), create(b, 'D')]);
    assert.deepEqual(responses.map((r) => r.statusCode), [201, 201]);
  });

  await t.test('cancelamento autorizado é idempotente, preserva vínculos e libera horário', async () => {
    const payload = input();
    const created = await create(payload);
    assert.equal(created.statusCode, 201);
    const id = created.json().reserva_id;
    assert.equal((await cancel(id, 'D')).statusCode, 403);
    assert.equal((await cancel(id, 'F')).json().status, 'cancelada');
    assert.equal((await cancel(id, 'A')).json().status, 'cancelada');
    const { rows: [count] } = await admin.query(`SELECT count(*)::integer AS total
      FROM reservas.outbox WHERE reservation_id = $1 AND event_type = 'reserva.cancelada'`, [id]);
    assert.equal(count.total, 1);
    const original = await app.inject({ method: 'GET', url: `/reservas/${id}`, headers: headers() });
    assert.equal(original.json().participante_ids.length, 3);
    assert.equal((await create(payload)).statusCode, 201);
  });

  await t.test('participante pode consultar, estranho não pode', async () => {
    const created = await create(input(rooms[0].id, [students[0], students[1], students[3]]));
    const id = created.json().reserva_id;
    assert.equal((await app.inject({ method: 'GET', url: `/reservas/${id}`, headers: headers('D') })).statusCode, 200);
    const other = await create(input());
    assert.equal((await app.inject({ method: 'GET', url: `/reservas/${other.json().reserva_id}`, headers: headers('D') })).statusCode, 403);
  });

  await t.test('dois cancelamentos simultâneos geram somente um evento de cancelamento', async () => {
    const created = await create(input());
    assert.equal(created.statusCode, 201);
    const id = created.json().reserva_id;
    const responses = await Promise.all([cancel(id), cancel(id, 'F')]);
    assert.deepEqual(responses.map((r) => r.statusCode), [200, 200]);
    const { rows: [count] } = await admin.query(`SELECT count(*)::integer AS total FROM reservas.outbox
      WHERE reservation_id = $1 AND event_type = 'reserva.cancelada'`, [id]);
    assert.equal(count.total, 1);
  });

  await t.test('consulta de disponibilidade reflete ocupação e cancelamento', async () => {
    const payload = input();
    const query = new URLSearchParams({ sala_id: payload.sala_id, inicio: payload.inicio, fim: payload.fim });
    const available = () => app.inject({ method: 'GET', url: `/disponibilidade?${query}`, headers: headers() });
    assert.equal((await available()).json().disponivel, true);
    const created = await create(payload);
    assert.equal(created.statusCode, 201);
    assert.equal((await available()).json().disponivel, false);
    await cancel(created.json().reserva_id);
    assert.equal((await available()).json().disponivel, true);
  });

  await t.test('listagem respeita participação e permite consulta do funcionário', async () => {
    // Histórico suficiente para que a reserva nova fique fora da primeira página.
    const historyIds = Array.from({ length: 101 }, () => randomUUID());
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO reservas.reservas
        (reserva_id, sala_id, responsavel_id, inicio, fim, status, cancelada_em)
        SELECT id, $2, $3, '2040-01-01T10:00:00Z', '2040-01-01T11:00:00Z', 'cancelada', now()
        FROM unnest($1::uuid[]) AS fixture(id)`, [historyIds, rooms[0].id, students[0].id]);
      await client.query(`INSERT INTO reservas.reserva_participantes (reserva_id, discente_id)
        SELECT r.id, p.id FROM unnest($1::uuid[]) AS r(id)
        CROSS JOIN unnest($2::uuid[]) AS p(id)`, [historyIds, students.slice(0, 3).map((s) => s.id)]);
      await client.query('COMMIT');
      ids.push(...historyIds);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    const a = await create(input());
    const d = await create(input(rooms[1].id, students.slice(3, 6)), 'D');
    assert.equal(a.statusCode, 201); assert.equal(d.statusCode, 201);
    async function listPages(who = 'A') {
      const reservations = [];
      for (let offset = 0; ; offset += 100) {
        const response = await app.inject({ method: 'GET', url: `/reservas?limite=100&offset=${offset}`, headers: headers(who) });
        assert.equal(response.statusCode, 200);
        const page = response.json().reservas;
        reservations.push(...page);
        if (page.length < 100) return reservations;
      }
    }
    const mine = await listPages();
    assert.ok(mine.some((r) => r.reserva_id === a.json().reserva_id));
    assert.ok(!mine.some((r) => r.reserva_id === d.json().reserva_id));
    const staff = await listPages('F');
    assert.ok(staff.some((r) => r.reserva_id === d.json().reserva_id));
  });

  await t.test('falha ao registrar outbox desfaz também reserva e participantes', async () => {
    let capturedId;
    const faultyPool = { async connect() {
      const client = await runtime.connect();
      return {
        query(sql, values) {
          if (typeof sql === 'string' && sql.startsWith('INSERT INTO reservas.outbox')) throw new Error('FALHA_OUTBOX_SIMULADA');
          if (typeof sql === 'string' && sql.startsWith('INSERT INTO reservas.reservas')) capturedId = values[0];
          return client.query(sql, values);
        }, release: () => client.release(),
      };
    } };
    await assert.rejects(() => createRepository(faultyPool).create(input(), students[0].id, randomUUID()), /FALHA_OUTBOX_SIMULADA/);
    assert.ok(capturedId); ids.push(capturedId);
    const { rowCount } = await admin.query('SELECT 1 FROM reservas.reservas WHERE reserva_id = $1', [capturedId]);
    assert.equal(rowCount, 0);
  });

  await t.test('outbox mantém evento pendente na falha, limita retries e permite publicação confirmada', async () => {
    const created = await create(input());
    assert.equal(created.statusCode, 201);
    const id = created.json().reserva_id;
    const { rows: [event] } = await admin.query('SELECT event_id FROM reservas.outbox WHERE reservation_id = $1', [id]);
    const failing = { async publish() { throw new Error('falha fictícia do broker'); } };
    for (let attempt = 1; attempt <= 5; attempt++) {
      await admin.query('UPDATE reservas.outbox SET proxima_tentativa_em = now() WHERE event_id = $1', [event.event_id]);
      assert.equal((await dispatchOne(runtime, failing, event.event_id)).publicado, false);
      const { rows: [state] } = await admin.query('SELECT tentativas,publicada_em,falhou_em FROM reservas.outbox WHERE event_id = $1', [event.event_id]);
      assert.equal(state.tentativas, attempt); assert.equal(state.publicada_em, null);
      assert.equal(Boolean(state.falhou_em), attempt === 5);
    }
    assert.equal(await dispatchOne(runtime, failing, event.event_id), null);

    const another = await create(input());
    const { rows: [pending] } = await admin.query('SELECT event_id FROM reservas.outbox WHERE reservation_id = $1', [another.json().reserva_id]);
    let deliveries = 0;
    const publisher = { async publish(payload) {
      assert.equal(payload.event_id, pending.event_id); deliveries++;
      await new Promise((resolve) => setTimeout(resolve, 50));
    } };
    const results = await Promise.all([dispatchOne(runtime, publisher, pending.event_id), dispatchOne(runtime, publisher, pending.event_id)]);
    assert.equal(results.filter(Boolean).length, 1); assert.equal(deliveries, 1);
    const { rows: [published] } = await admin.query('SELECT publicada_em FROM reservas.outbox WHERE event_id = $1', [pending.event_id]);
    assert.ok(published.publicada_em);
  });

  await t.test('cancelamento aguarda confirmação em retry/quarentena sem bloquear outras reservas', async () => {
    const created = await create(input());
    assert.equal(created.statusCode, 201);
    const reservationId = created.json().reserva_id;
    assert.equal((await cancel(reservationId)).statusCode, 200);
    const { rows: events } = await admin.query(`SELECT event_id, event_type FROM reservas.outbox
      WHERE reservation_id = $1`, [reservationId]);
    const confirmed = events.find((event) => event.event_type === 'reserva.confirmada').event_id;
    const cancelled = events.find((event) => event.event_type === 'reserva.cancelada').event_id;
    const deliveries = [];
    const publisher = { async publish(payload) { deliveries.push(payload); } };
    assert.equal((await dispatchOne(runtime, { async publish() { throw new Error('BROKER_FICTICIO'); } }, confirmed)).publicado, false);
    assert.equal(await dispatchOne(runtime, publisher, cancelled), null);

    const other = await create(input());
    assert.equal(other.statusCode, 201);
    const { rows: [otherEvent] } = await admin.query('SELECT event_id FROM reservas.outbox WHERE reservation_id = $1', [other.json().reserva_id]);
    assert.equal((await dispatchOne(runtime, publisher, otherEvent.event_id)).publicado, true);
    await admin.query('UPDATE reservas.outbox SET falhou_em = now(), tentativas = 5 WHERE event_id = $1', [confirmed]);
    assert.equal(await dispatchOne(runtime, publisher, cancelled), null);

    // Recuperação administrativa explícita somente do evento fictício deste teste.
    await admin.query(`UPDATE reservas.outbox SET falhou_em = NULL, tentativas = 0,
      proxima_tentativa_em = now() WHERE event_id = $1`, [confirmed]);
    assert.equal((await dispatchOne(runtime, publisher, confirmed)).publicado, true);
    assert.equal((await dispatchOne(runtime, publisher, cancelled)).publicado, true);
    assert.deepEqual(deliveries.filter((event) => event.reservation_id === reservationId)
      .map((event) => event.event_type), ['reserva.confirmada', 'reserva.cancelada']);
  });

  await t.test('segundo worker não ultrapassa uma confirmação ainda sendo publicada', async () => {
    const created = await create(input());
    assert.equal(created.statusCode, 201);
    const reservationId = created.json().reserva_id;
    await cancel(reservationId);
    const { rows: events } = await admin.query('SELECT event_id,event_type FROM reservas.outbox WHERE reservation_id = $1', [reservationId]);
    const confirmed = events.find((event) => event.event_type === 'reserva.confirmada').event_id;
    const cancelled = events.find((event) => event.event_type === 'reserva.cancelada').event_id;
    let release;
    let started;
    const waiting = new Promise((resolve) => { started = resolve; });
    const hold = new Promise((resolve) => { release = resolve; });
    const first = dispatchOne(runtime, { async publish() { started(); await hold; } }, confirmed);
    await Promise.race([waiting, first.then(() => { throw new Error('Confirmação não selecionada'); })]);
    let second;
    try { second = await dispatchOne(runtime, { async publish() {} }, cancelled); }
    finally { release(); await first; }
    assert.equal(second, null);
  });

  for (const [name, count, includeOwner, expected] of [
    ['mínimo de três', 2, true, '23514'], ['responsável participante', 3, false, '23503'],
  ]) {
    await t.test(`banco rejeita violação direta de ${name} ao finalizar a transação`, async () => {
      const client = await admin.connect();
      const id = randomUUID();
      try {
        await client.query('BEGIN');
        const data = input();
        await client.query(`INSERT INTO reservas.reservas (reserva_id,sala_id,responsavel_id,inicio,fim)
          VALUES ($1,$2,$3,$4,$5)`, [id, data.sala_id, students[0].id, data.inicio, data.fim]);
        const participants = (includeOwner ? students.slice(0, count) : students.slice(1, count + 1)).map((s) => s.id);
        await client.query('INSERT INTO reservas.reserva_participantes SELECT $1, unnest($2::uuid[])', [id, participants]);
        await assert.rejects(() => client.query('SET CONSTRAINTS ALL IMMEDIATE'), (error) => error.code === expected);
      } finally { await client.query('ROLLBACK'); client.release(); }
      const { rowCount } = await admin.query('SELECT 1 FROM reservas.reservas WHERE reserva_id = $1', [id]);
      assert.equal(rowCount, 0);
    });
  }
});

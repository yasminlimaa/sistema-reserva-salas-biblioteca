import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import test from 'node:test';
import { createPool } from '../db.js';
import { createDemoAdapter, students } from '../demo.js';
import { buildApp } from '../app.js';
import { createRepository } from '../repository.js';

test('API de Notificações com PostgreSQL real e credencial própria', async (t) => {
  const admin = createPool();
  const appEnv = parseEnv(await readFile('.env.app', 'utf8'));
  const runtime = createPool({ ...process.env, ...appEnv });
  const app = buildApp({ pool: runtime, directory: createDemoAdapter() });
  const repository = createRepository(runtime);
  const eventId = randomUUID();

  t.after(async () => {
    try {
      await admin.query('DELETE FROM notificacoes.avisos WHERE event_id = $1', [eventId]);
    } finally {
      await app.close();
      await runtime.end();
      await admin.end();
    }
  });

  await t.test('deduplicação persistente de event_id e leitura de aviso em banco real', async () => {
    const payload = {
      event_id: eventId,
      event_type: 'reserva.confirmada',
      schema_version: 1,
      reservation_id: randomUUID(),
      occurred_at: '2030-01-15T10:00:00-03:00',
      responsavel_id: students[0].id,
      room_id: '20000000-0000-4000-8000-000000000001',
      inicio: '2030-01-15T14:00:00-03:00',
      fim: '2030-01-15T16:00:00-03:00',
    };
    const first = await repository.recordEvent(payload, eventId);
    assert.equal(first.duplicado, false);
    const second = await repository.recordEvent(payload, eventId);
    assert.equal(second.duplicado, true);

    const headers = { authorization: `Bearer ${process.env.DEMO_TOKEN_DISCENTE_A}` };
    const read = await app.inject({
      method: 'POST',
      url: `/avisos/${first.aviso.id}/leitura`,
      headers,
    });
    assert.equal(read.statusCode, 200);
    assert.equal(read.json().lido, true);
  });
});


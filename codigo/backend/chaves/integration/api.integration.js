import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import test from 'node:test';
import { createPool } from '../db.js';
import { createDemoAdapter, fallbackRooms, students } from '../demo.js';
import { buildApp } from '../app.js';

test('API de Chaves com PostgreSQL real e credencial própria', async (t) => {
  const admin = createPool();
  const appEnv = parseEnv(await readFile('.env.app', 'utf8'));
  const runtime = createPool({ ...process.env, ...appEnv });
  const reservationId = randomUUID();
  const reservation = {
    reserva_id: reservationId,
    sala_id: fallbackRooms[0].sala_id,
    responsavel_id: students[0].id,
    participante_ids: students.slice(0, 3).map((s) => s.id),
    inicio: '2030-01-15T14:00:00-03:00',
    fim: '2030-01-15T16:00:00-03:00',
    status: 'confirmada',
  };
  const directory = createDemoAdapter(process.env, {
    async fetchImpl() {
      return { status: 200, ok: true, async json() { return reservation; } };
    },
  });
  const app = buildApp({ pool: runtime, directory });

  t.after(async () => {
    try {
      const client = await admin.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM chaves.movimentacoes WHERE reserva_id = $1', [reservationId]);
        await client.query('DELETE FROM chaves.entregas WHERE reserva_id = $1', [reservationId]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } finally {
      await app.close();
      await runtime.end();
      await admin.end();
    }
  });

  await t.test('retirada, devolução e histórico persistidos em banco real', async () => {
    const headers = { authorization: `Bearer ${process.env.DEMO_TOKEN_FUNCIONARIO}` };
    const w = await app.inject({
      method: 'POST',
      url: `/chaves/reservas/${reservationId}/retirada`,
      headers,
      payload: { operador: 'Balcão Central' },
    });
    assert.equal(w.statusCode, 201);

    const r = await app.inject({
      method: 'POST',
      url: `/chaves/reservas/${reservationId}/devolucao`,
      headers,
      payload: { operador: 'Balcão Central' },
    });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().status, 'devolvida');
    assert.equal(r.json().historico.length, 3);
  });
});


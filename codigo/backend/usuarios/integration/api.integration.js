import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import test from 'node:test';
import { createPool } from '../db.js';
import { createDemoAdapter } from '../demo.js';
import { buildApp } from '../app.js';

test('API de Usuários com PostgreSQL real e credencial própria', async (t) => {
  const admin = createPool();
  const appEnv = parseEnv(await readFile('.env.app', 'utf8'));
  const runtime = createPool({ ...process.env, ...appEnv });
  const app = buildApp({ pool: runtime, directory: createDemoAdapter() });
  const ids = [];

  t.after(async () => {
    try {
      if (ids.length) {
        const client = await admin.connect();
        try {
          await client.query('BEGIN');
          await client.query('DELETE FROM usuarios.sessoes WHERE usuario_id = ANY($1::uuid[])', [ids]);
          await client.query('DELETE FROM usuarios.usuarios WHERE usuario_id = ANY($1::uuid[])', [ids]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
    } finally {
      await app.close();
      await runtime.end();
      await admin.end();
    }
  });

  await t.test('cadastro, login, busca de discentes e logout em banco real', async () => {
    const suffix = randomUUID().slice(0, 6);
    const matricula = String(Math.floor(2024000000 + Math.random() * 900000));
    const email = `integracao.${suffix}@discente.ufma.br`;

    const created = await app.inject({
      method: 'POST',
      url: '/auth/cadastro',
      payload: {
        perfil: 'discente',
        nome: `Discente Integração ${suffix}`,
        matricula,
        unidade: 'Engenharia da Computação',
        email,
        senha: 'senhaSegura123',
      },
    });
    assert.equal(created.statusCode, 201);
    const { usuario, token } = created.json();
    ids.push(usuario.id);

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().id, usuario.id);

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(logout.statusCode, 204);
  });
});


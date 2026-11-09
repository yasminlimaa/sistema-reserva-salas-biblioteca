import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import test from 'node:test';
import { createPool } from '../db.js';
import { createDemoAdapter } from '../demo.js';
import { buildApp } from '../app.js';

// Executar explicitamente em banco de desenvolvimento após db:migrate/db:setup/demo:setup.
test('API de Salas com PostgreSQL real e credencial própria', async (t) => {
  const admin = createPool();
  const appEnv = parseEnv(await readFile('.env.app', 'utf8'));
  const runtime = createPool({ ...process.env, ...appEnv });
  let availableInReservas = true;
  const directory = createDemoAdapter(process.env, {
    async fetchImpl() {
      return {
        status: 200,
        ok: true,
        async json() {
          return {
            disponivel: availableInReservas,
            aviso: 'Consulta de sala não garante criação nem valida conflitos dos participantes.',
          };
        },
      };
    },
  });
  const app = buildApp({ pool: runtime, directory });
  const ids = [];

  const headers = (who = 'A') => ({
    authorization: `Bearer ${process.env[who === 'F' ? 'DEMO_TOKEN_FUNCIONARIO' : `DEMO_TOKEN_DISCENTE_${who}`]}`,
  });

  t.after(async () => {
    try {
      // Limpa somente os IDs criados por este teste.
      if (ids.length) {
        await admin.query('DELETE FROM salas.salas WHERE sala_id = ANY($1::uuid[])', [ids]);
      }
    } finally {
      await app.close();
      await runtime.end();
      await admin.end();
    }
  });

  await t.test('usuário da aplicação tem DML limitado e não apaga registros', async () => {
    const { rows: [row] } = await runtime.query(`
      SELECT current_user AS usuario,
             has_schema_privilege(current_user, 'salas', 'CREATE') AS criar,
             has_table_privilege(current_user, 'salas.salas', 'DELETE') AS apagar,
             has_table_privilege(current_user, 'salas.salas', 'TRUNCATE') AS truncar
    `);
    assert.equal(row.usuario, 'salas_app');
    assert.equal(row.criar, false);
    assert.equal(row.apagar, false);
    assert.equal(row.truncar, false);
  });

  await t.test('cadastro, edição, ativação/desativação e disponibilidade integrada', async () => {
    const nome = `Sala Integração ${randomUUID().slice(0, 8)}`;
    const created = await app.inject({
      method: 'POST',
      url: '/salas',
      headers: headers('F'),
      payload: { nome, capacidade: 6, bloco: 'Bloco A', equipamentos: ['Quadro branco'] },
    });
    assert.equal(created.statusCode, 201);
    const room = created.json();
    ids.push(room.sala_id);

    // Tentativa concorrente com o mesmo nome deve confirmar apenas uma
    const duplicate = await app.inject({
      method: 'POST',
      url: '/salas',
      headers: headers('F'),
      payload: { nome, capacidade: 8 },
    });
    assert.equal(duplicate.statusCode, 409);

    // Atualização cadastral
    const updated = await app.inject({
      method: 'PATCH',
      url: `/salas/${room.sala_id}`,
      headers: headers('F'),
      payload: { capacidade: 10, equipamentos: ['Quadro branco', 'Projetor'] },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().capacidade, 10);

    // Disponibilidade com sala ativa
    const query = new URLSearchParams({
      inicio: '2070-01-15T14:00:00-03:00',
      fim: '2070-01-15T16:00:00-03:00',
    });
    availableInReservas = true;
    const avail1 = await app.inject({
      method: 'GET',
      url: `/salas/${room.sala_id}/disponibilidade?${query}`,
      headers: headers('A'),
    });
    assert.equal(avail1.statusCode, 200);
    assert.equal(avail1.json().disponivel, true);

    availableInReservas = false;
    const avail2 = await app.inject({
      method: 'GET',
      url: `/salas/${room.sala_id}/disponibilidade?${query}`,
      headers: headers('A'),
    });
    assert.equal(avail2.statusCode, 200);
    assert.equal(avail2.json().disponivel, false);

    // Desativar sala bloqueia disponibilidade imediatamente
    const deactivated = await app.inject({
      method: 'POST',
      url: `/salas/${room.sala_id}/desativacao`,
      headers: headers('F'),
    });
    assert.equal(deactivated.statusCode, 200);
    assert.equal(deactivated.json().ativa, false);

    availableInReservas = true;
    const availInactive = await app.inject({
      method: 'GET',
      url: `/salas/${room.sala_id}/disponibilidade?${query}`,
      headers: headers('A'),
    });
    assert.equal(availInactive.statusCode, 200);
    assert.equal(availInactive.json().disponivel, false);
    assert.equal(availInactive.json().motivo, 'SALA_INATIVA');
  });
});


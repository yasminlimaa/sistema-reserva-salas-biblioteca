import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool, describeDatabaseError } from './db.js';

// Exclusivo para o banco de desenvolvimento: usa dados sintéticos e nunca executa COMMIT.
async function main() {
  const pool = createPool();
  pool.on('error', (error) => {
    console.error('Erro de conexão:', describeDatabaseError(error));
    process.exitCode = 1;
  });
  let client;
  let transactionStarted = false;
  const generatedIds = [];

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query("SET LOCAL lock_timeout = '2s'");

    async function insertRoom(overrides = {}) {
      const data = {
        sala_id: randomUUID(),
        nome: `Sala sintética ${randomUUID().slice(0, 8)}`,
        capacidade: 6,
        bloco: 'Bloco A',
        equipamentos: ['Quadro branco'],
        ativa: true,
        ...overrides,
      };
      generatedIds.push(data.sala_id);
      const { rows: [row] } = await client.query(`
        INSERT INTO salas.salas (sala_id, nome, capacidade, bloco, equipamentos, ativa)
        VALUES ($1, $2, $3, $4, $5::text[], $6)
        RETURNING *
      `, [data.sala_id, data.nome, data.capacidade, data.bloco, data.equipamentos, data.ativa]);
      return row;
    }

    async function expectViolation(operation, code, constraint) {
      await assert.rejects(operation, (error) => error.code === code
        && (!constraint || error.constraint === constraint));
    }

    const cases = [
      ['aceita sala válida com capacidade mínima de 3 pessoas', async () => {
        const row = await insertRoom({ capacidade: 3 });
        assert.equal(row.ativa, true);
        assert.equal(row.capacidade, 3);
      }],
      ['rejeita capacidade abaixo de 3 pessoas', () => expectViolation(
        () => insertRoom({ capacidade: 2 }),
        '23514', 'salas_capacidade_valida')],
      ['rejeita capacidade acima de 50 pessoas', () => expectViolation(
        () => insertRoom({ capacidade: 51 }),
        '23514', 'salas_capacidade_valida')],
      ['rejeita nome vazio ou só com espaços', () => expectViolation(
        () => insertRoom({ nome: '   ' }),
        '23514', 'salas_nome_preenchido')],
      ['rejeita nome duplicado', async () => {
        const row = await insertRoom();
        await expectViolation(() => insertRoom({ nome: row.nome }), '23505', 'salas_nome_unico');
      }],
      ['rejeita bloco vazio quando informado como string', () => expectViolation(
        () => insertRoom({ bloco: '  ' }),
        '23514', 'salas_bloco_valido')],
      ['permite desativar e reativar sala preservando o registro', async () => {
        const row = await insertRoom();
        const { rows: [deactivated] } = await client.query(
          'UPDATE salas.salas SET ativa = false, atualizada_em = now() WHERE sala_id = $1 RETURNING ativa',
          [row.sala_id],
        );
        assert.equal(deactivated.ativa, false);
        const { rows: [reactivated] } = await client.query(
          'UPDATE salas.salas SET ativa = true, atualizada_em = now() WHERE sala_id = $1 RETURNING ativa',
          [row.sala_id],
        );
        assert.equal(reactivated.ativa, true);
      }],
    ];

    let failures = 0;
    for (const [label, check] of cases) {
      await client.query('SAVEPOINT caso');
      try {
        await check();
        console.log('OK:', label);
      } catch {
        failures++;
        console.error('FALHOU:', label);
      } finally {
        await client.query('ROLLBACK TO SAVEPOINT caso');
        await client.query('RELEASE SAVEPOINT caso');
      }
    }

    await client.query('ROLLBACK');
    transactionStarted = false;
    const { rows: [remaining] } = await client.query(
      'SELECT count(*)::integer AS total FROM salas.salas WHERE sala_id = ANY($1::uuid[])',
      [generatedIds],
    );
    assert.equal(remaining.total, 0);
    console.log(`Resultado: ${cases.length - failures}/${cases.length} cenários passaram. Dados fictícios revertidos.`);
    if (failures) process.exitCode = 1;
  } finally {
    try {
      if (transactionStarted) await client.query('ROLLBACK');
    } finally {
      client?.release();
      await pool.end();
    }
  }
}

main().catch((error) => {
  console.error('Falha na verificação:', describeDatabaseError(error));
  process.exitCode = 1;
});


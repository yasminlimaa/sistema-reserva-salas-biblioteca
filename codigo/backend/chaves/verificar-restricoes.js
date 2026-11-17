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

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query("SET LOCAL lock_timeout = '2s'");

    async function insertDelivery(overrides = {}) {
      const data = {
        reserva_id: randomUUID(),
        sala_id: randomUUID(),
        responsavel_id: randomUUID(),
        inicio_previsto: '2030-01-15T14:00:00-03:00',
        fim_previsto: '2030-01-15T16:00:00-03:00',
        status: 'retirada',
        devolvida_em: null,
        devolvida_com_atraso: false,
        atraso_minutos: 0,
        ...overrides,
      };
      const { rows: [row] } = await client.query(`
        INSERT INTO chaves.entregas
          (reserva_id, sala_id, responsavel_id, inicio_previsto, fim_previsto, status, devolvida_em, devolvida_com_atraso, atraso_minutos)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        data.reserva_id,
        data.sala_id,
        data.responsavel_id,
        data.inicio_previsto,
        data.fim_previsto,
        data.status,
        data.devolvida_em,
        data.devolvida_com_atraso,
        data.atraso_minutos,
      ]);
      return row;
    }

    async function expectViolation(operation, code, constraint) {
      await assert.rejects(operation, (error) => error.code === code
        && (!constraint || error.constraint === constraint));
    }

    const cases = [
      ['aceita registro de retirada válido', async () => {
        const row = await insertDelivery();
        assert.equal(row.status, 'retirada');
      }],
      ['rejeita status devolvida sem instante devolvida_em', () => expectViolation(
        () => insertDelivery({ status: 'devolvida', devolvida_em: null }),
        '23514',
        'entregas_coerencia_devolucao',
      )],
      ['rejeita atraso_minutos negativo', () => expectViolation(
        () => insertDelivery({ atraso_minutos: -5 }),
        '23514',
        'entregas_atraso_nao_negativo',
      )],
      ['rejeita fim_previsto anterior ao inicio_previsto', () => expectViolation(
        () => insertDelivery({ fim_previsto: '2030-01-15T13:00:00-03:00' }),
        '23514',
        'entregas_intervalo_valido',
      )],
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


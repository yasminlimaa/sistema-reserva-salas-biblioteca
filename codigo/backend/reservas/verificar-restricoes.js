import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool, describeDatabaseError } from './db.js';

// Exclusivo para o banco de desenvolvimento: usa dados sintéticos e nunca COMMIT.
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

    async function insertReservation(overrides = {}) {
      const data = {
        reserva_id: randomUUID(),
        sala_id: randomUUID(),
        responsavel_id: randomUUID(),
        inicio: '2030-01-15T15:00:00-03:00',
        fim: '2030-01-15T17:00:00-03:00',
        status: 'confirmada',
        cancelada_em: null,
        ...overrides,
      };
      generatedIds.push(data.reserva_id);
      const { rows: [row] } = await client.query(`
        INSERT INTO reservas.reservas
          (reserva_id, sala_id, responsavel_id, inicio, fim, status, cancelada_em)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [data.reserva_id, data.sala_id, data.responsavel_id,
        data.inicio, data.fim, data.status, data.cancelada_em]);
      return row;
    }

    const insertParticipant = (reservationId, studentId) => client.query(`
      INSERT INTO reservas.reserva_participantes (reserva_id, discente_id)
      VALUES ($1, $2)
    `, [reservationId, studentId]);

    async function expectViolation(operation, code, constraint) {
      await assert.rejects(operation, (error) => error.code === code
        && (!constraint || error.constraint === constraint));
    }

    const cases = [
      ['aceita duração de exatamente duas horas', async () => {
        const row = await insertReservation();
        assert.equal(row.status, 'confirmada');
        assert.equal(row.cancelada_em, null);
        assert.ok(row.criada_em);
      }],
      ['aceita duração menor que duas horas', async () => {
        await insertReservation({ fim: '2030-01-15T16:00:00-03:00' });
      }],
      ['rejeita duração acima de duas horas', () => expectViolation(
        () => insertReservation({ fim: '2030-01-15T17:01:00-03:00' }),
        '23514', 'reservas_duracao_maxima')],
      ['rejeita duração zero', () => expectViolation(
        () => insertReservation({ fim: '2030-01-15T15:00:00-03:00' }),
        '23514', 'reservas_intervalo_positivo')],
      ['rejeita fim anterior ao início', () => expectViolation(
        () => insertReservation({ fim: '2030-01-15T14:00:00-03:00' }),
        '23514', 'reservas_intervalo_positivo')],
      ['rejeita sala ausente', () => expectViolation(
        () => insertReservation({ sala_id: null }), '23502')],
      ['rejeita status desconhecido', () => expectViolation(
        // O status desconhecido viola também o CHECK de coerência do cancelamento.
        // O teste deve aceitar a rejeição por qualquer um dos dois CHECKs.
        () => insertReservation({ status: 'inexistente' }), '23514')],
      ['rejeita confirmada com instante de cancelamento', () => expectViolation(
        () => insertReservation({ cancelada_em: '2029-12-01T10:00:00-03:00' }),
        '23514', 'reservas_status_cancelada_em')],
      ['rejeita cancelada sem instante de cancelamento', () => expectViolation(
        () => insertReservation({ status: 'cancelada' }),
        '23514', 'reservas_status_cancelada_em')],
      ['rejeita reserva_id repetido', async () => {
        const row = await insertReservation();
        await expectViolation(() => insertReservation({ reserva_id: row.reserva_id }), '23505');
      }],
      ['rejeita discente repetido na mesma reserva', async () => {
        const row = await insertReservation();
        await insertParticipant(row.reserva_id, row.responsavel_id);
        await expectViolation(() => insertParticipant(row.reserva_id, row.responsavel_id),
          '23505', 'reserva_participantes_pk');
      }],
      ['rejeita participante sem reserva existente', () => expectViolation(
        () => insertParticipant(randomUUID(), randomUUID()),
        '23503', 'reserva_participantes_reserva_fk')],
      ['bloqueia exclusão de reserva com participantes', async () => {
        const row = await insertReservation();
        await insertParticipant(row.reserva_id, row.responsavel_id);
        await expectViolation(() => client.query(
          'DELETE FROM reservas.reservas WHERE reserva_id = $1', [row.reserva_id]),
        '23503', 'reserva_participantes_reserva_fk');
      }],
      ['cancelamento preserva reserva e três participações', async () => {
        const row = await insertReservation();
        for (const studentId of [row.responsavel_id, randomUUID(), randomUUID()]) {
          await insertParticipant(row.reserva_id, studentId);
        }
        const { rows: [cancelled] } = await client.query(`
          UPDATE reservas.reservas SET status = 'cancelada', cancelada_em = now()
          WHERE reserva_id = $1 RETURNING status, cancelada_em
        `, [row.reserva_id]);
        assert.equal(cancelled.status, 'cancelada');
        assert.ok(cancelled.cancelada_em);
        const { rows: [count] } = await client.query(`
          SELECT count(*)::integer AS total FROM reservas.reserva_participantes
          WHERE reserva_id = $1
        `, [row.reserva_id]);
        assert.equal(count.total, 3);
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
        // Não imprimir objetos de erro do driver nem dados da conexão.
        console.error('FALHOU:', label);
      } finally {
        // Recupera também a transação abortada por uma violação esperada.
        await client.query('ROLLBACK TO SAVEPOINT caso');
        await client.query('RELEASE SAVEPOINT caso');
      }
    }

    await client.query('ROLLBACK');
    transactionStarted = false;
    const { rows: [remaining] } = await client.query(`
      SELECT count(*)::integer AS total FROM reservas.reservas
      WHERE reserva_id = ANY($1::uuid[])
    `, [generatedIds]);
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

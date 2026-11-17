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

    async function insertNotice(overrides = {}) {
      const data = {
        aviso_id: randomUUID(),
        event_id: randomUUID(),
        reservation_id: randomUUID(),
        usuario_id: randomUUID(),
        room_id: randomUUID(),
        event_type: 'reserva.confirmada',
        texto: 'Sua reserva foi confirmada.',
        inicio: '2030-01-15T14:00:00-03:00',
        fim: '2030-01-15T16:00:00-03:00',
        lido: false,
        lido_em: null,
        ocorreu_em: '2030-01-15T10:00:00-03:00',
        ...overrides,
      };
      const { rows: [row] } = await client.query(`
        INSERT INTO notificacoes.avisos
          (aviso_id, event_id, reservation_id, usuario_id, room_id, event_type, texto, inicio, fim, lido, lido_em, ocorreu_em)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [
        data.aviso_id,
        data.event_id,
        data.reservation_id,
        data.usuario_id,
        data.room_id,
        data.event_type,
        data.texto,
        data.inicio,
        data.fim,
        data.lido,
        data.lido_em,
        data.ocorreu_em,
      ]);
      return row;
    }

    async function expectViolation(operation, code, constraint) {
      await assert.rejects(operation, (error) => error.code === code
        && (!constraint || error.constraint === constraint));
    }

    const cases = [
      ['aceita aviso válido com event_id único', async () => {
        const row = await insertNotice();
        assert.equal(row.lido, false);
      }],
      ['rejeita event_id duplicado (garantia de deduplicação)', async () => {
        const row = await insertNotice();
        await expectViolation(() => insertNotice({ event_id: row.event_id }), '23505', 'avisos_event_id_unico');
      }],
      ['rejeita lido=true sem instante lido_em', () => expectViolation(
        () => insertNotice({ lido: true, lido_em: null }),
        '23514',
        'avisos_leitura_coerente',
      )],
      ['rejeita event_type desconhecido', () => expectViolation(
        () => insertNotice({ event_type: 'reserva.desconhecida' }),
        '23514',
        'avisos_event_type_valido',
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


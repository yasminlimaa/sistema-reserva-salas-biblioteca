import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createPool, describeDatabaseError } from './db.js';

const files = ['001_criar_reservas.sql', '002_integridade_outbox.sql', '003_acesso_app.sql', '004_rls_servico.sql'];
const baseConstraints = ['reservas_intervalo_positivo', 'reservas_duracao_maxima', 'reservas_status_valido',
  'reservas_status_cancelada_em', 'reserva_participantes_pk', 'reserva_participantes_reserva_fk'];

async function main() {
  const pool = createPool();
  let client;
  let begun = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN'); begun = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('reservas:migracoes', 0))");
    const { rows: [existing] } = await client.query(`SELECT to_regclass('reservas.reservas') AS reservas,
      to_regclass('reservas.reserva_participantes') AS participantes`);
    const sources = await Promise.all(files.map(async (name) => {
      const sql = await readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8');
      return { name, sql, hash: createHash('sha256').update(sql).digest('hex') };
    }));
    if (!!existing.reservas !== !!existing.participantes) throw new Error('BASE_INCOMPLETA');
    if (!existing.reservas) await client.query(sources[0].sql);
    else {
      const { rows } = await client.query(`SELECT conname FROM pg_constraint
        WHERE connamespace = 'reservas'::regnamespace AND conname = ANY($1::text[])`, [baseConstraints]);
      if (new Set(rows.map((row) => row.conname)).size !== baseConstraints.length) throw new Error('BASE_INCOMPATIVEL');
    }
    await client.query(`CREATE TABLE IF NOT EXISTS reservas.migracoes (
      arquivo text PRIMARY KEY, sha256 text NOT NULL, aplicada_em timestamptz NOT NULL DEFAULT now())`);
    for (const source of sources) {
      const { rows: [applied] } = await client.query('SELECT sha256 FROM reservas.migracoes WHERE arquivo = $1', [source.name]);
      if (applied) {
        if (applied.sha256 !== source.hash) throw new Error('MIGRACAO_ALTERADA');
        continue;
      }
      // A base 001 já pode ter sido aplicada pelo SQL Editor; foi conferida acima.
      if (source.name !== files[0]) await client.query(source.sql);
      await client.query('INSERT INTO reservas.migracoes (arquivo, sha256) VALUES ($1, $2)', [source.name, source.hash]);
    }
    await client.query('COMMIT'); begun = false;
    console.log('Migrações 001–004 conferidas/aplicadas. Nenhuma senha foi gravada nas migrações.');
  } finally {
    try { if (begun) await client.query('ROLLBACK'); }
    finally { client?.release(); await pool.end(); }
  }
}

main().catch((error) => {
  console.error('Falha nas migrações:', error.code ? describeDatabaseError(error)
    : 'Base incompatível, arquivo alterado ou dados antigos inválidos. Nenhuma migração desta execução foi confirmada; revise o estado antes de repetir.');
  process.exitCode = 1;
});

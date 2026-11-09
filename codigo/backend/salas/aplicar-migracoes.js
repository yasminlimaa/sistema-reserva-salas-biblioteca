import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createPool, describeDatabaseError } from './db.js';

const files = ['001_criar_salas.sql', '002_acesso_app.sql', '003_rls_servico.sql'];
const baseConstraints = ['salas_nome_preenchido', 'salas_nome_unico', 'salas_capacidade_valida', 'salas_bloco_valido'];

async function main() {
  const pool = createPool();
  let client;
  let begun = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    begun = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('salas:migracoes', 0))");
    const { rows: [existing] } = await client.query("SELECT to_regclass('salas.salas') AS salas");
    const sources = await Promise.all(files.map(async (name) => {
      const sql = await readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8');
      return { name, sql, hash: createHash('sha256').update(sql).digest('hex') };
    }));
    if (!existing.salas) {
      await client.query(sources[0].sql);
    } else {
      const { rows } = await client.query(`
        SELECT conname FROM pg_constraint
        WHERE connamespace = 'salas'::regnamespace AND conname = ANY($1::text[])
      `, [baseConstraints]);
      if (new Set(rows.map((row) => row.conname)).size !== baseConstraints.length) {
        throw new Error('BASE_INCOMPATIVEL');
      }
    }
    await client.query(`
      CREATE TABLE IF NOT EXISTS salas.migracoes (
        arquivo text PRIMARY KEY,
        sha256 text NOT NULL,
        aplicada_em timestamptz NOT NULL DEFAULT now()
      )
    `);
    for (const source of sources) {
      const { rows: [applied] } = await client.query('SELECT sha256 FROM salas.migracoes WHERE arquivo = $1', [source.name]);
      if (applied) {
        if (applied.sha256 !== source.hash) throw new Error('MIGRACAO_ALTERADA');
        continue;
      }
      if (source.name !== files[0]) await client.query(source.sql);
      await client.query('INSERT INTO salas.migracoes (arquivo, sha256) VALUES ($1, $2)', [source.name, source.hash]);
    }
    await client.query('COMMIT');
    begun = false;
    console.log('Migrações 001–003 de Salas conferidas/aplicadas. Nenhuma senha foi gravada nas migrações.');
  } finally {
    try {
      if (begun) await client.query('ROLLBACK');
    } finally {
      client?.release();
      await pool.end();
    }
  }
}

main().catch((error) => {
  console.error('Falha nas migrações de Salas:', error.code ? describeDatabaseError(error)
    : 'Base incompatível ou arquivo alterado. Nenhuma migração desta execução foi confirmada; revise o estado antes de repetir.');
  process.exitCode = 1;
});


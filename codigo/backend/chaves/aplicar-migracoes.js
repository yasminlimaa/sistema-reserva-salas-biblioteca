import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createPool, describeDatabaseError } from './db.js';

const files = ['001_criar_chaves.sql', '002_acesso_app.sql', '003_rls_servico.sql'];
const baseConstraints = [
  'entregas_intervalo_valido',
  'entregas_status_valido',
  'entregas_atraso_nao_negativo',
  'entregas_coerencia_devolucao',
  'movimentacoes_tipo_valido',
  'movimentacoes_acao_preenchida',
  'movimentacoes_operador_preenchido',
];

async function main() {
  const pool = createPool();
  let client;
  let begun = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    begun = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('chaves:migracoes', 0))");
    const { rows: [existing] } = await client.query(`
      SELECT to_regclass('chaves.entregas') AS entregas,
             to_regclass('chaves.movimentacoes') AS movimentacoes
    `);
    const sources = await Promise.all(files.map(async (name) => {
      const sql = await readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8');
      return { name, sql, hash: createHash('sha256').update(sql).digest('hex') };
    }));
    if (!!existing.entregas !== !!existing.movimentacoes) throw new Error('BASE_INCOMPLETA');
    if (!existing.entregas) {
      await client.query(sources[0].sql);
    } else {
      const { rows } = await client.query(`
        SELECT conname FROM pg_constraint
        WHERE connamespace = 'chaves'::regnamespace AND conname = ANY($1::text[])
      `, [baseConstraints]);
      if (new Set(rows.map((row) => row.conname)).size !== baseConstraints.length) {
        throw new Error('BASE_INCOMPATIVEL');
      }
    }
    await client.query(`
      CREATE TABLE IF NOT EXISTS chaves.migracoes (
        arquivo text PRIMARY KEY,
        sha256 text NOT NULL,
        aplicada_em timestamptz NOT NULL DEFAULT now()
      )
    `);
    for (const source of sources) {
      const { rows: [applied] } = await client.query('SELECT sha256 FROM chaves.migracoes WHERE arquivo = $1', [source.name]);
      if (applied) {
        if (applied.sha256 !== source.hash) throw new Error('MIGRACAO_ALTERADA');
        continue;
      }
      if (source.name !== files[0]) await client.query(source.sql);
      await client.query('INSERT INTO chaves.migracoes (arquivo, sha256) VALUES ($1, $2)', [source.name, source.hash]);
    }
    await client.query('COMMIT');
    begun = false;
    console.log('Migrações 001–003 de Chaves conferidas/aplicadas. Nenhuma senha foi gravada nas migrações.');
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
  console.error('Falha nas migrações de Chaves:', error.code ? describeDatabaseError(error)
    : 'Base incompatível ou arquivo alterado. Nenhuma migração desta execução foi confirmada; revise o estado antes de repetir.');
  process.exitCode = 1;
});


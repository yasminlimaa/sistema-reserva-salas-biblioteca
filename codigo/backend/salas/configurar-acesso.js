import { randomBytes } from 'node:crypto';
import { open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { createPool, describeDatabaseError } from './db.js';

// Usa .env administrativo; grava nova credencial apenas em .env.app ignorado pelo Git.
async function main() {
  const pool = createPool();
  let client;
  let fileCreated = false;
  let begun = false;
  let commitAttempted = false;
  const destination = resolve('.env.app');
  try {
    const url = new URL(process.env.DATABASE_URL);
    const originalUser = decodeURIComponent(url.username);
    const suffix = originalUser.startsWith('postgres.') ? originalUser.slice('postgres'.length) : '';
    if (!['postgres', `postgres${suffix}`].includes(originalUser)) throw new Error('USAR_ADMIN');
    const password = randomBytes(32).toString('hex');
    url.username = `salas_app${suffix}`;
    url.password = password;
    // O_EXCL: nunca substituir arquivo local nem rotacionar senha silenciosamente.
    const file = await open(destination, 'wx', 0o600);
    fileCreated = true;
    try {
      await file.writeFile(`DATABASE_URL=${url.toString()}\nPG_CA_CERT_PATH=${JSON.stringify(process.env.PG_CA_CERT_PATH || '')}\n`);
    } finally {
      await file.close();
    }
    client = await pool.connect();
    await client.query('BEGIN');
    begun = true;
    const { rows: [role] } = await client.query("SELECT rolcanlogin FROM pg_roles WHERE rolname = 'salas_app'");
    if (!role || role.rolcanlogin) throw new Error('ROLE_NAO_PREPARADO_OU_JA_ATIVO');
    await client.query(`ALTER ROLE salas_app LOGIN PASSWORD ${pg.escapeLiteral(password)}`);
    commitAttempted = true;
    await client.query('COMMIT');
    begun = false;
    console.log('Credencial própria de Salas criada em .env.app (permissão 0600). O .env administrativo foi preservado.');
  } finally {
    try {
      if (begun) await client.query('ROLLBACK');
    } finally {
      client?.release();
      await pool.end();
      if (fileCreated && !commitAttempted) await unlink(destination);
    }
  }
}

main().catch((error) => {
  console.error('Não foi possível configurar acesso de Salas:', error.code === 'EEXIST'
    ? '.env.app já existe; foi preservado, sem rotacionar a senha.'
    : error.code ? describeDatabaseError(error) : 'Confira migrações, credencial administrativa e estado de salas_app.');
  process.exitCode = 1;
});


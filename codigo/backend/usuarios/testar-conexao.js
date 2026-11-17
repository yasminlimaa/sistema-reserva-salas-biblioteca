import { createPool, describeDatabaseError } from './db.js';

async function main() {
  const pool = createPool();
  pool.on('error', (error) => {
    console.error('Erro em conexão ociosa:', describeDatabaseError(error));
    process.exitCode = 1;
  });

  try {
    const { rows: [info] } = await pool.query(`
      SELECT current_database() AS banco,
             current_user AS usuario,
             to_regclass('usuarios.usuarios')::text AS tabela_usuarios,
             to_regclass('usuarios.sessoes')::text AS tabela_sessoes
    `);

    console.log('Conexão PostgreSQL estabelecida com verificação TLS.');
    console.table([info]);
    if (!info.tabela_usuarios || !info.tabela_sessoes) {
      console.error('Diagnóstico incompleto: uma ou mais tabelas da migração 001 não foram encontradas.');
      process.exitCode = 1;
    } else {
      console.log('As tabelas de Usuários foram encontradas.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Falha no diagnóstico:', describeDatabaseError(error));
  process.exitCode = 1;
});


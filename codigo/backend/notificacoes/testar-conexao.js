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
             to_regclass('notificacoes.avisos')::text AS tabela_avisos
    `);

    console.log('Conexão PostgreSQL estabelecida com verificação TLS.');
    console.table([info]);
    if (!info.tabela_avisos) {
      console.error('Diagnóstico incompleto: a tabela notificacoes.avisos não foi encontrada.');
      process.exitCode = 1;
    } else {
      console.log('A tabela notificacoes.avisos foi encontrada.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Falha no diagnóstico:', describeDatabaseError(error));
  process.exitCode = 1;
});


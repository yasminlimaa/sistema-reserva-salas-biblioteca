import { createPool, describeDatabaseError } from './db.js';

async function main() {
  const pool = createPool();
  pool.on('error', (error) => {
    console.error('Erro em conexão ociosa:', describeDatabaseError(error));
    process.exitCode = 1;
  });

  try {
    // Diagnóstico somente de leitura: não aplica migrações nem altera registros.
    const { rows: [info] } = await pool.query(`
      SELECT current_database() AS banco,
             current_user AS usuario,
             to_regclass('salas.salas')::text AS tabela_salas
    `);

    console.log('Conexão PostgreSQL estabelecida com verificação TLS.');
    console.table([info]);
    if (!info.tabela_salas) {
      console.error('Diagnóstico incompleto: a tabela da migração 001 (salas.salas) não foi encontrada.');
      process.exitCode = 1;
    } else {
      console.log('A tabela salas.salas foi encontrada. As regras de negócio ainda precisam de testes próprios.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Falha no diagnóstico:', describeDatabaseError(error));
  process.exitCode = 1;
});


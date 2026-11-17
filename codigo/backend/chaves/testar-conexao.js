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
             to_regclass('chaves.entregas')::text AS tabela_entregas,
             to_regclass('chaves.movimentacoes')::text AS tabela_movimentacoes
    `);

    console.log('Conexão PostgreSQL estabelecida com verificação TLS.');
    console.table([info]);
    if (!info.tabela_entregas || !info.tabela_movimentacoes) {
      console.error('Diagnóstico incompleto: uma ou mais tabelas da migração 001 não foram encontradas.');
      process.exitCode = 1;
    } else {
      console.log('As tabelas de Chaves foram encontradas.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Falha no diagnóstico:', describeDatabaseError(error));
  process.exitCode = 1;
});


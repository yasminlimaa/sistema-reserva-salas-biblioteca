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
             to_regclass('reservas.reservas')::text AS tabela_reservas,
             to_regclass('reservas.reserva_participantes')::text AS tabela_participantes
    `);

    console.log('Conexão PostgreSQL estabelecida com verificação TLS.');
    console.table([info]);
    if (!info.tabela_reservas || !info.tabela_participantes) {
      console.error('Diagnóstico incompleto: uma ou mais tabelas da migração 001 não foram encontradas.');
      process.exitCode = 1;
    } else {
      console.log('As duas tabelas foram encontradas. As regras de negócio ainda precisam de testes próprios.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Falha no diagnóstico:', describeDatabaseError(error));
  process.exitCode = 1;
});

import { createPool, describeDatabaseError } from './db.js';
import { createDemoAdapter } from './demo.js';
import { buildApp } from './app.js';

let pool;
let app;
try {
  const directory = createDemoAdapter();
  if (process.env.HOST && process.env.HOST !== '127.0.0.1') {
    throw new Error('A demo aceita somente HOST=127.0.0.1.');
  }
  const port = Number(process.env.PORT || 3004);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT inválida.');
  }
  pool = createPool();
  pool.on('error', (error) => {
    console.error(describeDatabaseError(error));
  });
  const { rows: [identity] } = await pool.query('SELECT current_user AS usuario');
  if (identity.usuario !== 'chaves_app') {
    throw new Error('Execute a API com a credencial chaves_app em .env.app.');
  }
  const { rows: [schema] } = await pool.query("SELECT to_regclass('chaves.entregas') AS tabela_entregas");
  if (!schema.tabela_entregas) {
    throw new Error('Aplique as migrações de Chaves antes de iniciar.');
  }
  app = buildApp({ pool, directory, logger: { redact: ['req.headers.authorization'] } });
  await app.listen({ host: '127.0.0.1', port });
  console.log(`DEMO LOCAL (Chaves): API ativa em http://127.0.0.1:${port}. Movimentações de chave persistidas no banco.`);
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    try { await app.close(); } finally { await pool.end(); }
  }
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
} catch (error) {
  console.error('Não foi possível iniciar o serviço de Chaves:', error.code ? describeDatabaseError(error) : 'Confira os pré-requisitos no README (modo demo, tokens, migrações, usuário e porta).');
  await app?.close();
  await pool?.end();
  process.exitCode = 1;
}


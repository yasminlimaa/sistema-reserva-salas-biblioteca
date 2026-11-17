import { createPool, describeDatabaseError } from './db.js';
import { createRepository } from './repository.js';
import { startConsumer } from './consumer.js';

let pool;
let consumer;
try {
  if (process.env.DEMO_MODE !== 'true' || process.env.NODE_ENV === 'production') {
    throw new Error('MODO_INVALIDO');
  }
  if (!process.env.AMQP_URL) {
    throw new Error('CONFIGURAR_AMQP_URL');
  }
  pool = createPool();
  pool.on('error', (error) => console.error(describeDatabaseError(error)));
  const { rows: [identity] } = await pool.query('SELECT current_user AS usuario');
  if (identity.usuario !== 'notificacoes_app') {
    throw new Error('USAR_CREDENCIAL_APP');
  }
  const repository = createRepository(pool);
  consumer = await startConsumer({
    amqpUrl: process.env.AMQP_URL,
    repository,
    onEvent(outcome) {
      console.log(JSON.stringify(outcome));
    },
  });
  console.log('Consumidor de Notificações ativo. Deduplicação persistente por event_id e ACK após gravação no banco.');
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    try { await consumer.close(); } finally { await pool.end(); }
  }
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
} catch (error) {
  console.error('Worker de Notificações interrompido:', error.code ? describeDatabaseError(error) : 'Confira modo demo, AMQP_URL, migrações e credencial notificacoes_app.');
  await consumer?.close();
  await pool?.end();
  process.exitCode = 1;
}


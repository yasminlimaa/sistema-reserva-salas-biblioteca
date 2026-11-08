import { setTimeout as delay } from 'node:timers/promises';
import { createPool, describeDatabaseError } from './db.js';
import { createPublisher } from './messaging.js';
import { dispatchOne } from './outbox.js';

async function main() {
  if (process.env.DEMO_MODE !== 'true' || process.env.NODE_ENV === 'production') throw new Error('MODO_INVALIDO');
  if (!process.env.AMQP_URL) throw new Error('CONFIGURAR_AMQP_URL');
  const pool = createPool();
  pool.on('error', (error) => console.error(describeDatabaseError(error)));
  const publisher = createPublisher(process.env.AMQP_URL);
  let running = true;
  process.once('SIGINT', () => { running = false; });
  process.once('SIGTERM', () => { running = false; });
  try {
    const { rows: [identity] } = await pool.query('SELECT current_user AS usuario');
    if (identity.usuario !== 'reservas_app') throw new Error('USAR_CREDENCIAL_APP');
    do {
      let count = 0;
      for (; running && count < 100; count++) {
        const result = await dispatchOne(pool, publisher);
        if (!result) break;
        console.log(JSON.stringify(result));
        if (!result.publicado && process.argv.includes('--once')) process.exitCode = 1;
      }
      if (process.argv.includes('--once')) break;
      if (running) await delay(2000);
    } while (running);
  } finally { await publisher.close(); await pool.end(); }
}
main().catch((error) => {
  console.error('Worker interrompido:', error.code ? describeDatabaseError(error) : 'Confira modo demo, AMQP_URL, migrações e credencial própria.');
  process.exitCode = 1;
});

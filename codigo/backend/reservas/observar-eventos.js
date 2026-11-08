import amqp from 'amqplib';
import { exchange, notificationQueue } from './messaging.js';

let connection;
let channel;
try {
  if (process.env.DEMO_MODE !== 'true' || process.env.NODE_ENV === 'production') throw new Error('MODO_INVALIDO');
  connection = await amqp.connect(process.env.AMQP_URL, { timeout: 10_000 });
  connection.on('error', () => { console.error('Conexão AMQP interrompida.'); process.exitCode = 1; });
  channel = await connection.createChannel();
  channel.on('error', () => { console.error('Canal AMQP interrompido.'); process.exitCode = 1; });
  await channel.assertExchange(exchange, 'topic', { durable: true });
  await channel.assertQueue(notificationQueue, { durable: true });
  for (const key of ['reserva.confirmada', 'reserva.cancelada', 'reserva.alterada']) {
    await channel.bindQueue(notificationQueue, exchange, key);
  }
  await channel.prefetch(1);
  await channel.consume(notificationQueue, (message) => {
    if (!message) return;
    // Observador técnico da demo, não é o serviço de Notificações e não envia avisos reais.
    try {
      const event = JSON.parse(message.content.toString());
      if (event.simulated !== true || event.event_id !== message.properties.messageId) {
        channel.nack(message, false, true);
        console.error('Evento não identificado como demo; interrompendo sem consumir eventos reais.');
        void channel.close().catch(() => {});
        void connection.close().catch(() => {});
        process.exitCode = 1;
        return;
      }
      console.log(JSON.stringify({ event_id: event.event_id, event_type: event.event_type, reservation_id: event.reservation_id }));
      channel.ack(message);
    } catch {
      channel.nack(message, false, true);
      console.error('Payload inválido; interrompendo sem descartar a mensagem.');
      void channel.close().catch(() => {}); void connection.close().catch(() => {}); process.exitCode = 1;
    }
  }, { noAck: false });
  console.log('Observador técnico pronto. ACK após exibição; sem notificação persistida ou deduplicação.');
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    await channel.close().catch(() => {});
    await connection.close().catch(() => {});
  }
  process.once('SIGINT', close); process.once('SIGTERM', close);
} catch {
  console.error('Não foi possível iniciar o observador. Confira o broker e AMQP_URL.');
  await channel?.close().catch(() => {}); await connection?.close().catch(() => {});
  process.exitCode = 1;
}

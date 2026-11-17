import amqp from 'amqplib';
import { InvalidEventError } from './domain.js';

export const exchange = 'reservas.eventos';
export const notificationQueue = 'notificacoes.reservas';
export const errorQueue = 'notificacoes.reservas.erros';
export const routingKeys = ['reserva.confirmada', 'reserva.cancelada', 'reserva.alterada'];

// Processa uma única mensagem recebida do RabbitMQ:
// - Se válida: grava com deduplicação persistente (event_id) e envia ACK somente após o commit.
// - Se permanentemente inválida (JSON corrompido ou contrato violado): encaminha para a fila durável
//   de erros (notificacoes.reservas.erros) e envia ACK na fila principal para evitar loop infinito.
// - Se falha transitória de banco: faz NACK com requeue=true para reentrega posterior.
export async function processDelivery(channel, message, repository) {
  if (!message) return null;
  let parsed;
  try {
    parsed = JSON.parse(message.content.toString('utf8'));
  } catch {
    channel.sendToQueue(errorQueue, message.content, {
      persistent: true,
      contentType: 'application/octet-stream',
      headers: { reason: 'JSON_INVALIDO', rejected_at: new Date().toISOString() },
    });
    channel.ack(message);
    return { status: 'quarentena', motivo: 'JSON_INVALIDO' };
  }

  try {
    const result = await repository.recordEvent(parsed, message.properties?.messageId || null);
    channel.ack(message);
    return {
      status: result.duplicado ? 'duplicado_ignorado' : 'processado',
      event_id: result.aviso.event_id,
      aviso_id: result.aviso.aviso_id,
    };
  } catch (error) {
    if (error instanceof InvalidEventError) {
      channel.sendToQueue(errorQueue, message.content, {
        persistent: true,
        contentType: 'application/json',
        messageId: message.properties?.messageId,
        headers: { reason: error.message, rejected_at: new Date().toISOString() },
      });
      channel.ack(message);
      return { status: 'quarentena', motivo: error.message };
    }
    // Falha transitória (ex.: indisponibilidade temporária do PostgreSQL): devolve para a fila.
    channel.nack(message, false, true);
    throw error;
  }
}

export async function startConsumer({ amqpUrl, repository, onEvent = () => {} }) {
  const connection = await amqp.connect(amqpUrl, { timeout: 10_000 });
  const channel = await connection.createChannel();
  await channel.assertExchange(exchange, 'topic', { durable: true });
  await channel.assertQueue(notificationQueue, { durable: true });
  await channel.assertQueue(errorQueue, { durable: true });
  for (const key of routingKeys) {
    await channel.bindQueue(notificationQueue, exchange, key);
  }
  await channel.prefetch(1);
  await channel.consume(notificationQueue, async (message) => {
    if (!message) return;
    try {
      const outcome = await processDelivery(channel, message, repository);
      if (outcome) onEvent(outcome);
    } catch (error) {
      onEvent({ status: 'erro_transitorio', code: error?.code || 'ERRO_CONSUMO' });
    }
  }, { noAck: false });

  return {
    connection,
    channel,
    async close() {
      await channel.close().catch(() => {});
      await connection.close().catch(() => {});
    },
  };
}


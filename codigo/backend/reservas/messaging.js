import { once } from 'node:events';
import amqp from 'amqplib';

export const exchange = 'reservas.eventos';
export const notificationQueue = 'notificacoes.reservas';

export function createPublisher(url) {
  let connection;
  let channel;
  let generation = 0;

  async function closeConnection(opened) {
    let timer;
    try {
      await Promise.race([
        Promise.resolve().then(() => opened.close()),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('FECHAMENTO_AMQP_EXPIRADO')), 1000);
        }),
      ]);
    } catch {
      // shortcut: socket interno do amqplib 2.2.1; validar este acesso ao atualizar a dependência.
      opened.connection.stream.destroy(new Error('FECHAMENTO_AMQP_FORCADO'));
    } finally { clearTimeout(timer); }
  }

  async function close() {
    generation++;
    const currentConnection = connection;
    channel = undefined; connection = undefined;
    if (currentConnection) await closeConnection(currentConnection);
  }

  async function publish(payload) {
    const ownGeneration = generation;
    let timer;
    let onReturn;
    let usedChannel;
    // O timeout inclui conexão, declaração da topologia, buffer e confirmação.
    const operation = async () => {
      if (!channel) {
        const opened = await amqp.connect(url, { timeout: 10_000 });
        opened.on('error', () => {});
        if (ownGeneration !== generation) {
          await closeConnection(opened);
          throw new Error('PUBLICACAO_ABORTADA');
        }
        connection = opened;
        const openedChannel = await opened.createConfirmChannel();
        openedChannel.on('error', () => {});
        await openedChannel.assertExchange(exchange, 'topic', { durable: true });
        await openedChannel.assertQueue(notificationQueue, { durable: true });
        for (const key of ['reserva.confirmada', 'reserva.cancelada', 'reserva.alterada']) {
          await openedChannel.bindQueue(notificationQueue, exchange, key);
        }
        if (ownGeneration !== generation) {
          await closeConnection(opened);
          throw new Error('PUBLICACAO_ABORTADA');
        }
        channel = openedChannel;
      }
      if (ownGeneration !== generation) throw new Error('PUBLICACAO_ABORTADA');
      usedChannel = channel;
      let returned = false;
      onReturn = (message) => {
        if (message.properties.messageId === payload.event_id) returned = true;
      };
      usedChannel.on('return', onReturn);
      let accepted;
      const confirmed = new Promise((resolve, reject) => {
        accepted = usedChannel.publish(exchange, payload.event_type, Buffer.from(JSON.stringify(payload)), {
          persistent: true, mandatory: true, contentType: 'application/json', messageId: payload.event_id,
        }, (error) => {
          if (error || returned) reject(new Error('PUBLICACAO_NAO_CONFIRMADA'));
          else resolve();
        });
      });
      // O booleano indica apenas capacidade do buffer; o callback acima é o confirm.
      await Promise.all([confirmed, accepted ? Promise.resolve() : once(usedChannel, 'drain')]);
    };
    try {
      await Promise.race([operation(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('TEMPO_LIMITE_AMQP')), 10_000);
      })]);
    } catch {
      await close();
      throw new Error('BROKER_INDISPONIVEL_OU_SEM_CONFIRMACAO');
    } finally {
      clearTimeout(timer);
      if (usedChannel && onReturn) usedChannel.off('return', onReturn);
    }
  }
  return { publish, close };
}

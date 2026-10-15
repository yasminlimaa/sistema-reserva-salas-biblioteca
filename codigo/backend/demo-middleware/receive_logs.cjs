/** @format */

const amqp = require("amqplib");

async function main() {
  const connection = await amqp.connect("amqp://localhost");

  const channel = await connection.createChannel();

  console.log("Conexão e canal abertos");

  const exchange = "logs";

  await channel.assertExchange(exchange, "fanout", { durable: false });

  const queueInfo = await channel.assertQueue("", { exclusive: true });

  await channel.bindQueue(queueInfo.queue, exchange, "");

  await channel.consume(
    queueInfo.queue,
    function (msg) {
      if (msg === null) {
        return;
      }
      console.log(msg.content.toString());
    },
    { noAck: true },
  );

  console.log("Aguardando mensagens na fila:", queueInfo.queue); // nome da queue está em queueInfo.queue
}

main().catch((error) => {
  console.error("Ocorreu um erro:", error);
  process.exitCode = 1;
});

/** @format */

const amqp = require("amqplib");

// Este arquivo representa o serviço de reservas onde irá publicar um evento dizendo "reserva confirmada"

async function main() {
  const connection = await amqp.connect("amqp://localhost");
  const channel = await connection.createChannel();

  const exchange = "logs";
  await channel.assertExchange(exchange, "fanout", { durable: false });

  const event = {
    event_id: "demo-001",
    event_type: "reserva.confirmada",
    reservation_id: "reserva-demo",
    simulated: true,
  };

  const eventText = JSON.stringify(event);
  const buffer = Buffer.from(eventText);

  channel.publish(exchange, "", buffer);
  console.log("Publicação solicitada: ", eventText);

  setTimeout(() => {
    connection.close().catch((error) => {
      console.error("Erro ao fechar conexão: ", error);
      process.exitCode = 1;
    });
  }, 500);
}

main().catch((error) => {
  console.error("Ocorreu um erro: ", error);
  process.exitCode = 1;
});

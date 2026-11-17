# Serviço de Notificações — demo funcional local

Consumidor RabbitMQ (`notificacoes.reservas`) e API REST em Node.js 24/Fastify com PostgreSQL no Supabase. Atende a seção **Avisos recentes** da tela inicial (`Inicio.jsx`) e o indicador de **Notificações não lidas** do menu lateral (`App.jsx` e `MenuLateral.jsx`).

## Comandos para iniciar e testar

```bash
cd codigo/backend/notificacoes
nvm use
npm install
npm test
```

Porta padrão da API: `http://127.0.0.1:3005`.
Consumidor AMQP: `npm run worker`.

## Documentação

- `../../../documentos/contrato-notificacoes.md`: consumo idempotente de eventos, fila de quarentena e endpoints HTTP.


# Serviço de Salas — demo funcional local

API REST em Node.js 24/Fastify com PostgreSQL no Supabase. Cadastro de salas, consulta/listagem, gerenciamento de dados cadastrais (`nome`, `capacidade`, `bloco`, `equipamentos`), ativação/desativação idempotente e consulta de disponibilidade integrada ao serviço de Reservas estão implementados.

## Comandos para iniciar e testar

```bash
cd codigo/backend/salas
nvm use
npm install
npm test
```

Para preparar o banco de desenvolvimento:

1. Copiar `.env.example` para `.env` (ou usar o mesmo banco de desenvolvimento de Reservas) e preencher `DATABASE_URL` administrativa e `PG_CA_CERT_PATH`.
2. Executar `npm run db:migrate`: cria o schema `salas`, a tabela `salas.salas`, a role restrita `salas_app` e as políticas RLS (migrações 001–003).
3. Executar `npm run db:setup`: gera senha aleatória para `salas_app` e grava `.env.app` com permissão `0600`, sem alterar `.env`.
4. Executar `npm run demo:setup`: cria `.env.demo` (sincronizando automaticamente os tokens de `../reservas/.env.demo` caso já exista, para que os dois serviços compartilhem os mesmos tokens na demo local).
5. Executar `npm run db:check:app`, `npm run db:test` e `npm run test:integration`.
6. Iniciar a API em `http://127.0.0.1:3002`: `npm start`.

## Responsabilidades e integração com Reservas

- **Propriedade dos dados**: o serviço de Salas é dono exclusivo do schema `salas` (`salas.salas`). Nenhum outro serviço escreve diretamente nessa tabela.
- **Autoridade de disponibilidade**: conforme definido na arquitetura (`AGENTS.md` e `documentos/modelagem-reservas.md`), Salas **não mantém algoritmo paralelo de ocupação**. Ao receber `GET /salas/:id/disponibilidade` (ou `GET /disponibilidade`), Salas verifica se a sala existe e está ativa no seu banco e delega a verificação de conflito de horário ao serviço de Reservas (`GET /disponibilidade` em `RESERVAS_API_URL`).
- **Validação de sala em Reservas**: quando `SALAS_API_URL=http://127.0.0.1:3002` é configurada no serviço de Reservas, o adaptador `validateRoom(id)` consulta `GET /salas/:id` no serviço de Salas com timeout de 5 segundos, recusando salas inativas ou inexistentes com HTTP `422 SALA_INVALIDA` e falhando explicitamente com `503 DEPENDENCIA_INDISPONIVEL` se o serviço de Salas estiver indisponível.

## Documentação

- `../../../documentos/contrato-salas.md`: rotas, payloads JSON, códigos de erro e contrato de integração entre Salas e Reservas.


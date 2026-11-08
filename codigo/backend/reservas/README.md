# Serviço de Reservas — demo funcional local

API REST em Node.js 24/Fastify com PostgreSQL no Supabase. Criação, consulta, disponibilidade de sala, cancelamento, conflitos concorrentes e outbox estão implementados. Usuários, Salas e autenticação são dados fictícios explícitos; não é uma implantação de produção nem o sistema completo.

## Neste checkout já configurado

```bash
cd codigo/backend/reservas
nvm use
npm ci
npm start
```

Em outros terminais na mesma pasta, também com `nvm use`:

```bash
# RabbitMQ local já criado na demo anterior:
docker start reserva-rabbitmq
docker exec reserva-rabbitmq rabbitmq-diagnostics -q ping
npm run demo:events
```

```bash
npm run demo:run
```

```bash
npm run worker:once
# Alternativa contínua: npm run worker
```

API: http://127.0.0.1:3001. O roteiro usa HTTP real e mostra rejeição de grupo insuficiente, criação, conflito de sala, conflito de participante entre salas, consulta, cancelamento e reutilização do horário. Ao final mantém os registros fictícios cancelados e seus eventos para demonstrar histórico. O observador imprime os IDs e dá ACK técnico, sem persistir notificação ou deduplicar.

## Preparar outro banco de desenvolvimento

1. Node 24: `nvm install` e `nvm use` nesta pasta; depois `npm ci`.
2. Copiar .env.example para .env somente se ele ainda não existir. Preencher DATABASE_URL administrativa do banco de desenvolvimento. Não sobrescrever arquivo configurado ou usar credenciais no código.
3. Baixar a CA do próprio projeto em Database Settings → SSL Configuration. Salvar em certs/prod-supabase.cer e preencher PG_CA_CERT_PATH=./certs/prod-supabase.cer no .env.
4. Executar `npm run db:check` se a base já existir; `npm run db:migrate` cria/concilia a base e aplica 001–004 numa transação. A migração 001 aplicada pelo painel é reconhecida após conferência das constraints básicas. Um estado parcial ou arquivo previamente registrado com hash diferente é recusado.
5. Executar uma vez `npm run db:setup`: gera senha aleatória para reservas_app e grava .env.app com permissão 0600, preservando .env. Recusa sobrescrever .env.app ou rotacionar role ativa; se outro computador já usa esse mesmo banco, obter sua credencial por canal privado ou usar outro banco de desenvolvimento.
6. Executar uma vez `npm run demo:setup`: gera tokens locais distintos em .env.demo. Arquivo existente é preservado. .env.demo.example documenta as variáveis sem tokens.
7. Executar `npm run db:check:app`, `npm test` e `npm run test:integration`; então iniciar API e worker.

A migração 002 interrompe se encontrar reservas antigas sem três participantes ou sem responsável participante: revisar os registros antes de repetir, sem excluí-los automaticamente. Não editar migrações aplicadas; acrescentar uma nova migração e incluí-la no runner.

## Credenciais e limites

- .env: administração e migrações; não usado pelo processo HTTP/worker.
- .env.app: reservas_app, com SELECT/INSERT/UPDATE nas tabelas do serviço, sem DELETE/TRUNCATE/CREATE/ALTER. RLS habilitado e políticas exclusivas do backend; anon/authenticated não recebem acesso ao schema.
- .env.demo: DEMO_MODE=true, tokens de discente A, discente D e funcionário; não são usuários reais do Supabase.
- TLS verifica CA e hostname. Não colocar parâmetros ssl* na URI, pois no pg podem substituir a configuração ssl do código. Certificados e arquivos privados ficam fora do Git.
- API recusa NODE_ENV=production, usuário administrativo e HOST diferente de 127.0.0.1. Não alterar esses guardas para publicar a demo.

O perfil usado para autorização vem do adaptador de identidade, nunca do corpo do pedido nem de user_metadata editável pelo cliente. Os colegas devem substituir o adaptador fictício por contratos reais, mantendo esse princípio.

## Integridade e mensageria

Criação usa uma transação com o mesmo client e bloqueia sala e todos os discentes no banco, em ordem determinística. Depois dos bloqueios, revalida conflitos e grava reserva, participantes e outbox. Intervalos [inicio,fim), duração positiva de até duas horas. Banco também exige três participantes e responsável incluído ao finalizar a transação.

Cancelamento é permitido ao responsável ou funcionário, sem prazo de antecedência. É idempotente, mantém os vínculos e libera a ocupação. Não há edição nem exclusão física na API; novos caminhos de escrita devem preservar o protocolo de bloqueios. Escrita administrativa direta pode ignorar a proteção de sobreposição feita pelo serviço.

Worker lê outbox com FOR UPDATE SKIP LOCKED, publica mensagem persistente em reservas.eventos/topic com mandatory e publisher confirm, respeita backpressure e registra publicada_em. Falhas têm backoff e até cinco tentativas; falhou_em mantém o evento em quarentena para investigação. Não há retry infinito. Uma falha após o confirm e antes do commit pode repetir event_id: Notificações precisa de deduplicação persistente e ACK após processamento.

Para os tipos atuais, o cancelamento só é selecionado depois que as confirmações da mesma reserva estiverem publicadas. Uma confirmação em retry, em publicação por outro worker ou em quarentena bloqueia seu cancelamento, sem bloquear outras reservas. A quarentena precisa ser resolvida administrativamente antes de liberar os eventos dependentes. Essa regra garante ordem de publicação; consumidores paralelos ainda precisam tratar a ordem do próprio processamento. Ao implementar eventos de alteração, ampliar o sequenciamento para os novos tipos.

Publicação tem timeout de dez segundos, seguido de até um segundo para fechar a conexão. Se o fechamento não responder, o transporte é destruído para liberar a operação e permitir retry. Conexões que chegam depois do timeout recebem o mesmo tratamento. O encerramento forçado usa o socket interno do amqplib 2.2.1; revisar esse acesso ao atualizar a dependência.

Fila durável: notificacoes.reservas; eventos reserva.confirmada e reserva.cancelada v1. Binding reserva.alterada está reservado, sem endpoint de edição nesta versão. Publicada_em comprova aceitação pelo broker, não aviso entregue ao aluno.

## Verificações

Com banco de desenvolvimento e **worker parado**:

```bash
npm test
npm run db:test
npm run test:integration
```

- npm test: testes locais de validação, autorização inicial, readiness, configuração sem vazamento de credenciais e encerramento/reconexão AMQP com falhas simuladas; não acessa banco ou broker.
- db:test: 14 checks básicos da migração 001, com SAVEPOINT/ROLLBACK; não força validação de constraints adiadas e não substitui a integração.
- test:integration: fastify.inject, PostgreSQL real, credencial restrita, conflitos concorrentes, integridade adiada, autorização, ordem de publicação durante retries/quarentena e dois workers. O teste de listagem percorre todas as páginas e cria 101 registros fictícios anteriores para reproduzir o limite da primeira página. Remove somente os próprios IDs com o admin; não executar com worker ativo, para não publicar eventos transitórios de teste.
- demo:run: porta HTTP real; mantém histórico fictício cancelado para apresentação.

Não há testes de carga/1000 clientes nem medição de SLA. Uma reserva correta não comprova integração com Usuários/Salas reais ou envio de notificação ao aluno.

## Documentação

- ../../../documentos/contrato-reservas.md: endpoints, JSON, erros, eventos e interfaces para os colegas.
- ../../../documentos/roteiro-apresentacao-reservas.md: terminais e fala para apresentar.
- ../../../documentos/status-reservas.md: resultados reais e pendências.

Referências: [transações pg](https://node-postgres.com/features/transactions), [SSL pg](https://node-postgres.com/features/ssl), [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

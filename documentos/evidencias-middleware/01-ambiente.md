# Ambiente da demo — 14/10/2026

Verificado às 19:05, America/Fortaleza (22:05 UTC).
Commit de referência: `76d554453757770f48fc55cf69f90a64c206929e`.
Os documentos locais AGENTS.md e plano-middleware.md ainda não estavam versionados.

## Versões e configuração

- Node.js: `v24.16.0`.
- npm: `11.13.0`.
- Docker CLI: `29.1.5`; Compose: `v5.0.1`.
- RabbitMQ efetivo: `4.3.6`.
- Imagem utilizada: `rabbitmq:4-management`.
- Digest obtido no pull: `sha256:8dd6e3570ddaa2ef82a6c3a8950e79c1f73893adfbdddbc374fc1f1ac8a0f5dd`.
- Contêiner criado: `reserva-rabbitmq`.
- Portas publicadas somente em `127.0.0.1`: AMQP `5672`, painel `15672`.

## Comandos executados e resultados

Docker Desktop iniciado com `open -a Docker`. Nenhum contêiner com o nome da demo existia na inspeção inicial.

```bash
docker run -d --name reserva-rabbitmq \
  -p 127.0.0.1:5672:5672 \
  -p 127.0.0.1:15672:15672 \
  rabbitmq:4-management
docker exec reserva-rabbitmq rabbitmq-diagnostics -q ping
# Ping succeeded
docker exec reserva-rabbitmq rabbitmq-diagnostics -q server_version
# 4.3.6
curl --fail --silent --show-error -o /dev/null \
  -w 'Painel HTTP: %{http_code}\n' http://127.0.0.1:15672
# Painel HTTP: 200
```

O acesso ao socket Docker e ao HTTP local exigiu execução fora do sandbox do agente. A verificação HTTP confirmou disponibilidade da página; login e inspeção visual da topologia ainda estão pendentes.

## Uso no próximo encontro

Abrir http://127.0.0.1:15672 e usar guest/guest, credenciais padrão deste exercício local. Se o contêiner estiver parado, usar `docker start reserva-rabbitmq`; não repetir o comando de criação com o mesmo nome.

Fluxo a estudar: publicador → exchange `logs` (fanout) → uma fila temporária por consumidor → consumidor.

Próximo incremento: preparar a pasta da demo e a dependência amqplib; explicar conexão, canal, exchange, fila e binding; orientar a implementação do consumidor pelo aluno.

## Limitações atuais

Ainda não há publicador, consumidor, mensagem enviada, integração de reservas ou teste de carga. O diagnóstico do broker e a resposta HTTP não comprovam entrega de eventos. Nenhum contêiner preexistente foi removido ou reconfigurado por estes comandos.

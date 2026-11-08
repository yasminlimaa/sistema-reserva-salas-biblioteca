# Status para a equipe — 07/11/2026

## Entrega atual

Serviço de Reservas demonstrável localmente: API Fastify, persistência PostgreSQL/Supabase, integridade transacional, autorização com identidades fictícias e publicação de eventos via outbox/RabbitMQ. Usuários e Salas ainda são adaptadores de demo. Não é o sistema completo nem uma implantação de produção.

## Implementado

- Migração 001: reserva e participantes, UUIDs, intervalo positivo de até duas horas, status/cancelamento e participante único por reserva.
- Migração 002: responsável obrigatoriamente participante, mínimo de três verificado ao finalizar a transação, índices e outbox transacional. Dados antigos inválidos interrompem a migração em vez de serem apagados/corrigidos silenciosamente.
- Migrações 003/004: role própria reservas_app, sem privilégios administrativos ou DELETE/TRUNCATE/CREATE, RLS e políticas exclusivas do backend. Sem concessão a anon/authenticated.
- Runner de migrações versionadas com hash e reconhecimento da base aplicada anteriormente no painel; scripts de credenciais e tokens não sobrescrevem arquivos nem rotacionam senhas existentes.
- POST /reservas; GET /reservas e /reservas/:id; GET /disponibilidade; POST /reservas/:id/cancelamento; health/readiness e catálogo fictício.
- Responsável obtido da identidade autenticada, três discentes distintos ativos e sala ativa no catálogo de demonstração. Campo de responsável forjado no corpo é rejeitado.
- Transação com bloqueios por sala e todos os participantes, em ordem determinística, seguida de revalidação. Cancela de forma idempotente, mantém participantes/histórico e libera a ocupação.
- Outbox gravada na mesma transação; worker separado publica mensagens persistentes com mandatory, confirm channel e backpressure; retry com backoff limitado a cinco, quarentena persistida em falhou_em. Pode haver reenvio do mesmo event_id após crash.
- Roteiro HTTP de apresentação e observador técnico AMQP. O observador não é Notificações: imprime e dá ACK técnico, sem aviso persistido ou deduplicação.

## Decisões confirmadas pelo aluno

- Responsável é discente participante e conta uma vez no mínimo de três.
- Duração máxima de duas horas, permitindo intervalos menores.
- Intervalos [inicio,fim): horários adjacentes não conflitam.
- Responsável e funcionário podem cancelar sem prazo de antecedência.
- Usuários/Salas fictícios explícitos para a apresentação, com interfaces separadas para integração real.
- Cancelamento automático após dez minutos de ausência e espera de uma hora entre reservas seguem pendentes, sem implementação.

## Verificações reais

Ambiente: Node 24.16.0; Fastify 5.12.8, pg 8.23.1, amqplib 2.2.1, conforme package-lock. PostgreSQL de desenvolvimento no Supabase com TLS verificado e runtime usando reservas_app.

- 18 testes locais passaram: validação de entrada, autorização inicial, modo de demonstração, readiness, proteção das credenciais e três regressões de fechamento AMQP limitado/reconexão/conexão tardia. As três regressões falharam antes da correção do problema 1 e passaram depois, com relógio simulado e sem broker externo.
- 18 verificações de integração passaram (17 cenários mais o teste agrupador) em cerca de 73 segundos: DML restrito, criação/outbox, conflito simultâneo por sala, conflito entre salas com participante compartilhado, horários adjacentes, reservas independentes, cancelamento idempotente e concorrente, autorização de consulta/listagem paginada, disponibilidade e liberação de horário, rollback de criação quando a outbox falha, retry/quarentena, ordem de publicação com dois workers e restrições adiadas de grupo/responsável.
- Falhas do publicador foram injetadas na integração para verificar estados da outbox; isso é diferente do ensaio com RabbitMQ real. Os testes de integração removem somente seus próprios registros, incluindo outbox, e não publicam no broker.
- Migrações 001–004 aplicadas/conferidas no ambiente. A primeira tentativa de escrita pela role restrita identificou RLS já ativo nas tabelas antigas e nenhuma política; a correção foi registrada na migração 004, mantendo RLS.
- Ensaio HTTP real na porta 3001 passou com 400 para grupo insuficiente, 201 para criação, 409 para conflitos, 200 para consulta/cancelamento e 201 para reutilização do horário. Corrigido um cabeçalho JSON indevido no roteiro de cancelamento sem corpo.
- Os 14 testes básicos anteriores também passaram após as novas migrações, com rollback. Não verificam constraints adiadas; essas são exercitadas explicitamente na integração.
- RabbitMQ real: seis eventos de três reservas fictícias (incluindo o ensaio inicial corrigido) foram confirmados pelo broker e observados com os mesmos event_id e reservation_id. O worker encerrou com código 0. Todos os registros do ensaio ficaram cancelados, preservados no histórico.

Os testes com PostgreSQL usam dados sintéticos; a integração apaga somente seus próprios IDs. O roteiro de apresentação mantém registros fictícios cancelados para mostrar o histórico. Não houve medição de carga, teste de 1000 clientes ou comprovação de SLA.

Revisão Ponytail: corrigido o problema 1 (timeout que travava aguardando fechamento), com limite adicional de um segundo e destruição do transporte se necessário. Nessa correção isolada foram usados testes locais simulados.

Corrigidos também os problemas 2 e 3: cancelamento não ultrapassa confirmação pendente da mesma reserva, inclusive em retry/quarentena ou em publicação por outro worker; o teste de listagem percorre as páginas e semeia 101 reservas fictícias anteriores para reproduzir o limite. Os três cenários de regressão (paginação, retry e dois workers) falharam antes e passaram depois no PostgreSQL real. A limpeza removeu somente os IDs criados pelos testes. Não houve nova migração ou publicação AMQP nessa correção; a quarentena da confirmação precisa de recuperação administrativa antes de liberar seu cancelamento.

## Próximas entregas e responsáveis

1. Yasmin/Usuários: autenticação real, identidade/perfil verificados pelo backend, IDs e contrato para validar participantes; não autorizar funcionário por perfil editável no navegador/user_metadata.
2. Liah/Salas: IDs e contrato de cadastro/atividade. Disponibilidade deve continuar sob a autoridade de Reservas, sem algoritmo independente concorrente.
3. Wanderson/Notificações: consumir notificacoes.reservas, deduplicar event_id persistentemente, persistir aviso e dar ACK após processamento; publisher confirm não comprova aviso entregue.
4. Euderlan/Chaves: integrar reservation_id, retirada/devolução, autorização e histórico. Acordar efeito de cancelamento com chave retirada antes da integração correspondente.
5. Gabriel/Reservas: substituir adaptadores fictícios, testar falhas das dependências reais, acordar edição/alteração de reservas e só então acrescentar esse endpoint/evento com o mesmo protocolo de concorrência.
6. Equipe: tela de reservas, integração com login existente, Docker Compose completo e implantação posterior. Esta API local não foi publicada na AWS e não substitui os outros serviços.

## Como apresentar e compartilhar

Ver contrato-reservas.md para endpoints, JSON e envelope dos eventos. Ver roteiro-apresentacao-reservas.md para os comandos dos terminais e o roteiro de fala. Instruções de instalação/credenciais estão no README do serviço.

Mensagem sugerida: “Reservas já cria, consulta e cancela com banco real; bloqueia conflitos concorrentes por sala/participante; preserva histórico e registra eventos na outbox. Os testes de API e integração passaram. A demo usa usuários/salas fictícios; os contratos estão documentados para integrar Usuários, Salas, Notificações e Chaves. A confirmação do broker ainda não representa notificação entregue ao aluno.”

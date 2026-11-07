# Status para a equipe — 07/11/2026

## Implementado no checkout

- Demo RabbitMQ isolada: evento sintético em logs/fanout e uma fila temporária por consumidor. Evidência anterior de entrega está em evidencias-middleware/06-entrega-e-fanout.md; o broker não foi retestado nesta etapa.
- Modelo de Reservas e migração SQL inicial com duas tabelas: reservas e reserva_participantes.
- Duração positiva de no máximo duas horas, estado de cancelamento coerente e participante único por reserva definidos no SQL.
- Diagnóstico Node.js 24/pg com configuração por ambiente, TLS verificado, timeout, pool limitado, consulta de existência das tabelas e encerramento das conexões.
- Scripts npm, exemplo de ambiente sem segredos, instruções reproduzíveis e testes locais de falhas de configuração sem exposição de credenciais.
- Script db:test com 14 cenários de restrições no banco real, dados sintéticos, SAVEPOINT por cenário e rollback de todas as operações.

## Verificado nesta etapa

Três testes automatizados locais passaram com Node 24.16.0: configuração ausente, URI inválida contendo segredo fictício e tentativa de substituir TLS pela URI. Executar os comandos dentro de codigo/backend/reservas.

Na etapa anterior, a validação TLS não confiava no certificado. Após a configuração pelo aluno, o agente repetiu db:check e confirmou conexão TLS, banco postgres e as tabelas reservas.reservas e reservas.reserva_participantes. A execução exigiu saída do sandbox por restrição de rede. Credenciais não foram impressas.

db:test passou em 14/14 cenários no Supabase: limites de duração, intervalo inválido, obrigatoriedade de sala, status e cancelamento, reserva_id repetido, participante duplicado, referência inválida, exclusão bloqueada por participantes e cancelamento preservando os vínculos. O teste de status desconhecido inicialmente exigia uma constraint específica; foi corrigido para aceitar a rejeição CHECK, pois a entrada viola também a coerência do cancelamento. A segunda execução passou integralmente, com código 0.

Os cenários usaram dados sintéticos dentro de uma transação com SAVEPOINT e ROLLBACK, sem COMMIT. A consulta final confirmou ausência dos IDs de reserva gerados. Nenhum dado de demonstração foi mantido e nenhuma migração nova foi aplicada.

## Próximas entregas para Reservas funcional

1. Criar credencial de aplicação com permissões limitadas ao schema de Reservas antes de operar a API.
2. Manter db:test como verificação reproduzível das restrições básicas e ampliar os cenários conforme as próximas regras forem implementadas.
3. Implementar criação atômica de reserva e participantes: mínimo de três discentes válidos e responsável incluído. A migração atual permite uma reserva com menos de três e não garante responsável participante.
4. Impedir sobreposição por sala e por qualquer participante, inclusive em salas diferentes; definir convenção de intervalos antes da implementação e testar requisições simultâneas. Criação, edição e cancelamento devem seguir a mesma estratégia transacional.
5. Criar API Fastify e integrar identidade/permissões de Usuários e estado de Salas pelos contratos acordados. Formatos dos IDs ainda precisam de alinhamento com a equipe.
6. Integrar os fatos persistidos com Notificações/RabbitMQ, evoluindo para confirms, ACK após processamento, deduplicação e outbox. A demo atual não oferece essas garantias.

Chaves, frontend e Docker Compose continuam sendo incrementos posteriores para a apresentação integrada. Não há teste de carga ou implantação AWS nesta entrega.

## Decisões já tomadas

- Responsável é discente participante e conta uma vez no mínimo de três.
- Duração máxima de duas horas; durações menores permitidas.
- Cancelamento após dez minutos de ausência e espera de uma hora entre reservas seguem como propostas pendentes, sem implementação.

## Mensagem sugerida para compartilhar

“A conexão TLS com Supabase e as tabelas básicas de Reservas estão verificadas. Os 14 testes de restrições passaram no banco real, sem deixar dados fictícios. Ainda faltam permissões próprias, regras de três participantes/responsável, proteção de conflitos concorrentes e API integrada a Usuários e Salas. A demo RabbitMQ continua isolada, sem publicação a partir de reservas persistidas.”

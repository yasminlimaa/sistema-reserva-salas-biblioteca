# Entrega e fanout — 15/10/2026

## Ambiente e método

Executados os arquivos do aluno emit_logs.cjs e receive_logs.cjs com Node 24.16.0 e amqplib 2.2.0, contra o contêiner local reserva-rabbitmq. Nenhum código do aluno foi alterado.

A primeira tentativa no sandbox foi bloqueada por EPERM. Fora dele, a conexão recebeu ECONNREFUSED. `docker ps -a --filter name=reserva-rabbitmq` mostrou o contêiner parado com status Exited (137). Esse status, isoladamente, não determina a causa da parada. Executado `docker start reserva-rabbitmq`; `docker exec reserva-rabbitmq rabbitmq-diagnostics -q check_port_connectivity` confirmou as portas, incluindo 5672 e 15672.

O teste automatizado abriu um consumidor A, aguardou a mensagem de prontidão, executou o publicador e aguardou uma entrega. Depois abriu o consumidor B, aguardou prontidão e executou o publicador outra vez. Cada cenário teve timeout de espera de 8 segundos. Ambos os processos publicadores encerraram com código 0. Ao final foram encerrados somente os processos criados pelo teste. O broker foi mantido em execução.

## Resultados reais

- Uma publicação com um consumidor: A recebeu o evento.
- Outra publicação com dois consumidores: A e B receberam o evento.
- Fila A: `amq.gen-9xOMOhGVqJynzVIJa7rz2w`.
- Fila B: `amq.gen-LgrfPyZ3AAtZhB6mWBnGxA`.
- Contagens finais: A recebeu duas mensagens e B recebeu uma.
- Nenhuma saída de erro dos programas no teste bem-sucedido.

Payload recebido:

```json
{"event_id":"demo-001","event_type":"reserva.confirmada","reservation_id":"reserva-demo","simulated":true}
```

As duas execuções reutilizaram o ID fixo do código didático. Portanto, as contagens foram verificadas por execução/fase; elas não representam dois eventos com identidades distintas. Em uma implementação real, cada novo evento precisa de ID próprio.

## Reprodução manual e roteiro

Se necessário, iniciar o contêiner existente com `docker start reserva-rabbitmq` e confirmar sua prontidão com o diagnóstico acima. Em cada terminal, a partir da raiz do repositório:

```bash
cd codigo/backend/demo-middleware
nvm use
```

1. Terminal A: `node receive_logs.cjs`. Esperar “Aguardando mensagens”.
2. Terminal B: `node emit_logs.cjs`. Conferir o JSON no terminal A.
3. Terminal C: `node receive_logs.cjs`. Esperar prontidão e observar nome diferente de fila.
4. Terminal B: repetir `node emit_logs.cjs`. Conferir o mesmo evento em A e C.
5. Enquanto os consumidores estiverem ativos, abrir http://127.0.0.1:15672 com guest/guest. Mostrar exchange logs/fanout, duas filas, seus bindings e consumidores.
6. Encerrar os consumidores com Ctrl+C após capturar as evidências.

Fala sugerida: “Este publicador representa Reservas e envia um evento sintético de reserva confirmada. O RabbitMQ encaminha uma cópia para cada fila vinculada ao exchange fanout. Estes dois processos recebem independentemente porque cada um tem uma fila. No sistema integrado, um consumidor representará Notificações; outro serviço interessado terá sua própria fila.”

## Limites

Sem reserva validada/persistida, notificação real ao aluno, durabilidade, publisher confirms ou teste de carga. noAck: true não confirma processamento pela aplicação. O atraso de 500 ms não é confirmação do broker; neste teste, a evidência de entrega é o JSON observado nos consumidores. Não foram capturadas telas do painel nesta execução. Filas exclusivas são removidas ao fechar suas conexões, portanto executar os consumidores durante a apresentação do painel.

Pequeno ajuste visual recomendado ao aluno: imprimir eventText em vez de buffer no log do publicador para tornar o event_id legível durante a apresentação. Próximo exercício: reproduzir a demo manualmente e explicar a diferença entre duas filas e dois consumidores em uma fila compartilhada.

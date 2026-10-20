# Plano de arquitetura, evidência e evolução

Análise em 14/10/2026. A demonstração “amanhã” corresponde a 15/10/2026, no fuso America/Fortaleza. Este documento é um plano: nenhuma demonstração ou carga foi executada nesta análise.

## 1. O que foi verificado

O PDF de sete páginas é um relatório da primeira etapa, não uma descrição de implementação concluída. Define RF01–RF13 e RNF01–RNF08, cinco serviços e responsáveis. A passagem sobre tecnologias diz que houve definição preliminar, mas não informa linguagem, framework ou banco. RabbitMQ aparece como opção na responsabilidade de Notificações/Middleware, acompanhado de “ou outro middleware de mensageria”. InterSCity não é exigido pelo PDF; sua sugestão pelo professor vem do contexto da conversa.

Foi consultada a árvore pública completa da branch `main` do [repositório](https://github.com/yasminlimaa/sistema-reserva-salas-biblioteca), commit `76d554453757770f48fc55cf69f90a64c206929e`. Ela contém README, `codigo/backend/.gitkeep`, `codigo/frontend/.gitkeep` e `documentos/.gitkeep`. O README apenas descreve o objetivo do sistema. Não há código, manifestos ou Docker Compose nessa árvore. Isso não exclui trabalho local, outras branches ou alterações posteriores. Reinspecionar antes de implementar. Nenhum arquivo do GitHub foi alterado.

## 2. Comparação e recomendação

| Critério | InterSCity | RabbitMQ |
|---|---|---|
| Papel | Plataforma de recursos e dados de cidades inteligentes/IoT | Broker de mensagens entre processos |
| Modelo principal | Recursos, capacidades, dados de contexto e APIs REST | Exchanges, filas, bindings, publicadores e consumidores |
| Aderência ao domínio | Sala como recurso; disponibilidade e chave como capacidades/contexto | Reserva confirmada/cancelada/alterada como eventos entre serviços |
| Regras de reserva | Precisam continuar na aplicação | Precisam continuar na aplicação |
| Esforço para amanhã | Pequeno se a instância do professor já estiver acessível; implantação própria envolve vários serviços | Um broker local e dois programas bastam para demonstrar comunicação |
| Evidência | Cadastro, publicação de contexto e consulta posterior pela API | Publicação, entrega ao consumidor e painel do broker |
| Carga | Depende da instância, autorização, API e versão implantada | Pode ser exercitado isoladamente e depois integrado à aplicação |

Recomendo **RabbitMQ como middleware principal**, usando AMQP 0-9-1 para o primeiro exercício. O relatório pede mensageria e eventos assíncronos; o tutorial oficial mostra precisamente publicador, exchange, filas e consumidores. Uma fila compartilhada distribui trabalho entre consumidores; filas distintas permitem que serviços independentes recebam o mesmo evento. [Tutorial oficial de publish/subscribe em JavaScript](https://www.rabbitmq.com/tutorials/tutorial-three-javascript).

InterSCity atende uma necessidade mais ampla: catálogo/descoberta de recursos, dados atuais e históricos e integração com dispositivos. Para este projeto, essas abstrações podem ser úteis, mas acrescentam modelagem e adaptação que a reserva acadêmica não exige inicialmente. A documentação oficial descreve seis microserviços e APIs REST. A recomendação de maior simplicidade é uma inferência dessa arquitetura e do prazo, não um benchmark comparativo. [Visão oficial da plataforma](https://interscity.org/software/interscity-platform/).

As alternativas não são mutuamente exclusivas: a publicação técnica oficial descreve RabbitMQ na comunicação interna do InterSCity. Usar a API REST do InterSCity não significa que o grupo implementou acesso direto a esse broker interno. [Artigo dos autores sobre a arquitetura](https://interscity.org/assets/smartgreens2017-1.pdf).

Se o professor exigir especificamente InterSCity, a integração proposta é: sala → recurso UUID; capacidades → `room_availability`, `room_reservation`, `key_status`; um adaptador do sistema publica contexto sanitizado após uma mudança confirmada; outra aplicação consulta o dado pelo Data Collector. O banco de Reservas continua sendo a autoridade transacional. Disponibilidade de contexto pode estar atrasada e não deve autorizar uma reserva sozinha.

Nesse caminho, confirmar base URL, autenticação, versão, contratos de payload, endpoints e painel da instância fornecida; os links de documentação detalhada do GitLab acessados nesta análise não expuseram os contratos completos. Por isso não forneço rotas ou payloads InterSCity supostamente verificados. Para amanhã, capturar cadastro, publicação aceita e consulta retornando o valor/horário identificável. Consulta periódica deve ser chamada de consulta, não de assinatura push. Se só funcionar cadastro/listagem, relatar exatamente essa limitação. Não executar carga de 1000 clientes em playground compartilhado sem autorização.

## 3. Arquitetura e tecnologias propostas

```text
Interface web → APIs REST de Usuários, Salas, Reservas e Chaves
                     │
             persistência por serviço
                     │
Reservas/Chaves → RabbitMQ → Notificações → notificação persistida ao responsável
                     └────→ adaptador InterSCity (opcional, posterior)
```

O PDF já define cinco serviços. JavaScript é a escolha posterior da equipe, informada nesta conversa; os frameworks, bibliotecas e contratos a seguir são recomendações, não definições do relatório. Implementar primeiro dois processos independentes para evidenciar o broker e evoluir até os cinco serviços, sem chamar o MVP inicial de sistema completo.

| Camada | Recomendação | Motivo para este projeto |
|---|---|---|
| Linguagem e execução | JavaScript com Node.js 24 LTS | Uma linguagem para equipe, APIs e consumidores; linha LTS confirmada na consulta de 14/10/2026 |
| APIs REST | Fastify | Rotas pequenas, validação por JSON Schema, logger integrado e testes com injeção de requisições |
| Mensageria | RabbitMQ + `amqplib` | Cliente Node.js usado nos exemplos oficiais; permite aprender exchanges, filas e acknowledgements diretamente |
| Persistência | PostgreSQL + `pg` (node-postgres) | SQL explícito e controle das transações necessárias para reservas concorrentes |
| Interface | React + Vite, template JavaScript | Componentes para salas, reservas, chaves e avisos; adicionar depois da prova do middleware |
| Testes do backend | `node:test` + `node:assert/strict` + `fastify.inject()` | Runner do Node e testes HTTP sem precisar abrir uma porta; integração usa banco/broker reais de teste |
| Ambiente e dependências | Docker Compose + npm | Inicialização dos serviços e instalações reproduzíveis com `package-lock.json` e `npm ci` |
| Carga posterior | k6 para HTTP; Node.js + `amqplib` para AMQP | Scripts JavaScript com ferramentas adequadas a cada protocolo |

Fastify é minha recomendação por reunir recursos úteis às APIs em um conjunto pequeno. Caso a equipe já domine e tenha começado com Express, a familiaridade pode justificar mantê-lo; não há motivo para migrar código funcional apenas por essa recomendação. NestJS e TypeScript acrescentariam conceitos ao primeiro incremento, portanto não são requisitos. Começar com JavaScript, funções pequenas, async/await e ES Modules nos serviços novos. A demo oficial fica isolada em CommonJS com extensão `.cjs`.

Usar `pg` inicialmente torna visíveis as consultas e as transações estudadas na disciplina. Empregar parâmetros SQL, um pool limitado por serviço e um único client para BEGIN/COMMIT/ROLLBACK; devolver o client ao pool em finally. Manter migrações SQL versionadas e registrar quais foram aplicadas. Um ORM pode ser avaliado mais tarde se a equipe precisar, sem pressupor que ele resolva concorrência.

Para validação, usar os schemas do Fastify; para logs, ativar seu logger integrado. Para chamadas REST entre serviços, o `fetch` do Node evita uma biblioteca adicional no começo; definir timeouts e tratar respostas de erro. Documentar a API com OpenAPI no incremento de integração. A escolha de bibliotecas de autenticação deve ser feita na fase de Usuários, preservando hash de senha e autorização por perfil; não criar criptografia própria.

Referências oficiais: [versões do Node.js](https://nodejs.org/en/about/previous-releases), [Fastify](https://fastify.dev/docs/latest/Guides/Getting-Started/), [testes com Fastify](https://fastify.dev/docs/latest/Guides/Testing/), [transações com pg](https://node-postgres.com/features/transactions) e [templates do Vite](https://vite.dev/guide/). Fixar versões compatíveis no início da implementação. Nenhuma dessas escolhas representa medição de desempenho já realizada.

- Para amanhã, instalar somente Node.js, `amqplib` e RabbitMQ. Fastify, PostgreSQL e React entram nas fases de integração e interface.
- Uma instância PostgreSQL inicialmente, com schemas e credenciais por serviço. Isso reduz operação, mas ainda compartilha uma dependência e não oferece alta disponibilidade. Cada serviço escreve apenas seus dados.
- Interface inicialmente simples em React/Vite, usando `fetch` para as APIs. A evidência de amanhã não depende de frontend pronto; se ninguém conhecer React, HTML/CSS/JavaScript com Vite também atende a primeira interface e evita atrasar o backend.
- Reservas decide ocupação e conflitos. Salas fornece cadastro/estado e pode apresentar disponibilidade obtida de Reservas. Usuários valida perfis e identidade; Chaves controla movimentações; Notificações recebe fatos e cria avisos ao responsável.
- Exchange `reservas.eventos`, tipo `topic`, fila durável `notificacoes.reservas`, bindings `reserva.confirmada`, `reserva.cancelada`, `reserva.alterada`. Eventos de chave podem ter rotas próprias posteriormente. Novos serviços interessados recebem filas próprias; réplicas de Notificações compartilham sua fila.
- Evento com `event_id`, `event_type`, `schema_version`, `reservation_id`, `occurred_at`, `correlation_id`, responsável identificado por ID e dados mínimos necessários. O serviço dono da operação publica o fato após confirmação; Wanderson coordena a integração.

Confirmação do broker não equivale a notificação entregue ao aluno. ACK do consumidor confirma processamento conforme a aplicação implementa. Durabilidade e mensagens persistentes não eliminam duplicatas nem tornam commit no banco e publicação uma operação única. Planejar outbox transacional e consumidores idempotentes antes de declarar o fluxo confiável. [Confirms e acknowledgements](https://www.rabbitmq.com/docs/confirms).

Em `amqplib`, o retorno booleano de `channel.publish()` indica o estado do buffer de escrita, não a confirmação do broker. No fluxo confiável, usar confirm channel, aguardar confirmações, respeitar backpressure e tratar mensagens retornadas/erros. Aguardar a declaração de exchange, fila e binding antes de consumir ou publicar. Para o consumidor integrado, `noAck: false` e `ack` somente após o processamento persistido.

## 4. Regras que não podem desaparecer no MVP funcional

| Requisito do relatório | Implementação/validação necessária |
|---|---|
| RF01/RNF05 | Autenticação e autorização por papel, sem confiar no perfil enviado pelo navegador |
| RF02–RF04 | Sala cadastrada e ativa; consulta de horários e criação com intervalo/participantes |
| RF05 | Pelo menos três discentes distintos e válidos; funcionários não substituem essa contagem |
| RF06 | Bloquear sobreposição na mesma sala, inclusive sob concorrência |
| RF07 | Bloquear sobreposição de qualquer discente participante em salas distintas |
| RF08 | Cancelamento libera ocupação do intervalo e mantém o histórico |
| RF09 | Avisos ao responsável de confirmação, cancelamento e alteração |
| RF10–RF11 | Retirada pelo responsável, devolução e identificação de atraso |
| RF12 | Histórico da reserva e movimentações da chave persistido |
| RF13 | Funcionário pode consultar e gerenciar com permissões definidas |

Proposta de intervalos: [início, fim); horários adjacentes são permitidos. Exigir início < fim e normalizar fuso. O relatório não fixa duração máxima, horários de funcionamento, prazo/permissão de cancelamento, tolerância de atraso, política com chave já retirada nem efeitos de desativação de sala. Decidir e registrar esses pontos antes das funcionalidades correspondentes.

Integridade: consultar disponibilidade e depois inserir sem proteção permite duas confirmações concorrentes. Em Reservas, implementar transação que bloqueia a sala e todos os participantes em ordem determinística, revalida conflitos e grava. Uma estratégia possível é PostgreSQL com bloqueios transacionais por IDs e isolamento/consulta apropriados; todos os caminhos de criação, alteração e cancelamento precisam seguir o protocolo. Testar duas requisições simultâneas para mesma sala e duas salas com participante comum. Notificações e middleware não resolvem esses conflitos.

## 5. Execução faseada

| Fase | Entrega | Critério de conclusão |
|---|---|---|
| 0 — hoje | Inspeção do checkout, escolha da stack e pequeno contrato de evento | Equipe identifica o que existe e consegue explicar os papéis |
| 1 — amanhã | Broker + publicador + consumidor + painel; evento sintético de reserva | Mesmo identificador no envio e recebimento, evidência do painel, comando reproduzível |
| 2 | Integração Reservas → Notificações | Reserva válida persistida gera aviso persistido; confirmação/cancelamento/alteração exercitados |
| 3 | Usuários, Salas e integridade de Reservas | Regras RF01–RF08 e permissões verificadas, incluindo concorrência |
| 4 | Chaves, histórico, gestão e interface | RF09–RF13 e integração dos cinco serviços demonstrados |
| 5 | Confiabilidade | Outbox, deduplicação, retries limitados, fila de erro e recuperação testados |
| 6 | Carga progressiva | Relatório com resultados reais, ambiente e limites, até 1000 somente se viável |

Não exigir terminar uma fase inteira para estudar a seguinte. Integrar em fatias pequenas, mantendo claro quais requisitos ainda faltam. Estrutura sugerida: demos e futuros serviços sob `codigo/backend`; interface sob `codigo/frontend`; planos, contratos e evidências sob `documentos`. Não mover os diretórios existentes.

Responsáveis do relatório: Yasmin/Usuários, Liah/Salas, Gabriel/Reservas, Euderlan/Chaves, Wanderson/Notificações e Middleware. Para amanhã, Wanderson organiza broker/consumidor, Gabriel prepara significado e payload do evento, e os demais revisam roteiro e capturam evidências. Essa divisão da demonstração é proposta; os donos dos serviços permanecem os definidos no PDF.

## 6. Demonstração mínima reproduzível para amanhã

O roteiro abaixo usa os programas JavaScript do tutorial oficial como **exercício isolado**, sem entregar o backend pronto. Pré-requisitos: Docker instalado e em execução, Node.js 24 LTS com npm e acesso à internet para obter imagem, cliente e exemplos. Os comandos abaixo usam um terminal Bash/Zsh; no Windows, usar WSL/Git Bash ou adaptar a sintaxe. Executar no checkout real, não no diretório de referências sincronizadas. Não rode em uma pasta que já contenha uma demo sem revisar os arquivos primeiro.

### Preparar ambiente

```bash
mkdir -p codigo/backend/demo-middleware
cd codigo/backend/demo-middleware
node --version
npm --version
npm init -y
npm install amqplib
curl -fL https://raw.githubusercontent.com/rabbitmq/rabbitmq-tutorials/main/javascript-nodejs/src/receive_logs.js -o receive_logs.cjs
curl -fL https://raw.githubusercontent.com/rabbitmq/rabbitmq-tutorials/main/javascript-nodejs/src/emit_log.js -o emit_log.cjs
docker run -d --name reserva-rabbitmq \
  -p 127.0.0.1:5672:5672 \
  -p 127.0.0.1:15672:15672 \
  rabbitmq:4-management
docker exec reserva-rabbitmq rabbitmq-diagnostics -q ping
```

Se o nome do contêiner já existir, inspecionar e reutilizar o ambiente adequado; não apagar automaticamente. Se o ping falhar logo após a criação, aguardar inicialização e verificar `docker logs reserva-rabbitmq`. Os programas oficiais usam localhost e credenciais guest padrão; neste exercício as portas ficam restritas à máquina local. Não usar essa configuração em implantação compartilhada.

Os exemplos usam `require`; salvá-los como `.cjs` permite executá-los mesmo se o projeto pai usar ES Modules. Versionar `package.json` e `package-lock.json`, ignorar `node_modules` e usar `npm ci` nas próximas instalações. Registrar `node --version`, `npm ls amqplib` e a versão efetiva/digest da imagem; a tag `4-management` e os exemplos em `main` podem mudar. Após a primeira execução bem-sucedida, fixar as versões e o commit dos exemplos aprovados. Os [tutoriais oficiais](https://www.rabbitmq.com/tutorials) têm exemplos executáveis e usam RabbitMQ 4.x.

### Publicador e consumidor

Terminal A, na pasta da demo:

```bash
node receive_logs.cjs
```

Terminal B, na mesma pasta:

```bash
node emit_log.cjs '{"event_id":"demo-001","event_type":"reserva.confirmada","schema_version":1,"reservation_id":"reserva-demo","room_id":"sala-demo","responsavel_id":"aluno-a","participant_ids":["aluno-a","aluno-b","aluno-c"],"simulated":true}'
```

O texto deve aparecer no terminal A. O publicador envia para o exchange `logs` do tutorial, tipo `fanout`; o consumidor cria uma fila temporária e binding. O JSON é um fato **simulado**, não uma reserva validada e gravada pelo sistema. Este exercício demonstra transporte, não RF05–RF07. No incremento integrado, usar o contrato e os nomes propostos na seção 3, com durabilidade e ACK manual.

Abra um terceiro terminal com outro `node receive_logs.cjs` e repita o envio com `event_id` diferente. Ambos devem receber porque têm filas distintas. Peça ao aluno explicar por que dois consumidores na mesma fila teriam outro comportamento.

### Monitoramento e evidências

Abrir [painel local](http://localhost:15672), login guest/guest. Mostrar Connections, Exchanges (`logs`), Queues and Streams (filas geradas) e bindings. Na página da fila, observar consumidor conectado e atividade de entrega. Enviar algumas mensagens espaçadas: uma única mensagem pode desaparecer rápido demais para aparecer claramente no gráfico. O painel usa porta 15672; os programas usam AMQP na 5672. [Documentação do painel](https://www.rabbitmq.com/docs/management).

Opcionalmente obter a topologia:

```bash
docker exec reserva-rabbitmq rabbitmqctl list_exchanges name type
docker exec reserva-rabbitmq rabbitmqctl list_bindings
docker exec reserva-rabbitmq rabbitmqctl list_queues name consumers messages_ready messages_unacknowledged
```

Capturar: terminal do envio; terminal do recebimento com mesmo event_id; painel/topologia mostrando a conexão e o binding. Salvar data, comando, versões e limitações em `documentos/evidencias-middleware`. Não capturar dados pessoais reais.

**Limite importante do exemplo:** fila exclusiva temporária e `noAck: true`, sem confirmação manual do processamento; mensagens podem ser perdidas quando não há fila vinculada. O publicador didático também não espera publisher confirms. Iniciar consumidores antes do publicador e verificar o binding no painel. Parar o consumidor não demonstra backlog durável. Para esse segundo experimento, o aluno deve implementar fila durável, binding estável, mensagem persistente, confirms e ACK após processamento; então parar o consumidor, publicar, observar `messages_ready` e reiniciar. Não alegar recuperação antes desse incremento.

Fala sugerida: “Executamos dois processos independentes conectados ao RabbitMQ. O publicador enviou um evento sintético e o consumidor o recebeu por uma fila vinculada ao exchange. O painel mostra essa topologia. A integração com as regras e o banco será o próximo incremento. Ainda não executamos testes de 1000 clientes.”

Se houver tempo, preferir substituir o publicador sintético por uma operação real já validada; se não houver, apresentar honestamente o exercício isolado. Uma notificação impressa no terminal comprova consumo técnico, mas não equivale ao envio ao usuário exigido por RF09. Na integração, criar aviso persistido acessível ao responsável; email é opção posterior, pois o relatório não fixa canal.

## 7. Plano de carga até 1000 clientes

Primeiro definir com o professor: “1000 clientes” são usuários simultâneos na API ou 1000 conexões AMQP? Todos publicam e recebem? Cada evento chega a um consumidor ou a todos? Conexões abertas sem tráfego não comprovam capacidade de processamento. Mil publicadores e mil consumidores em conexões separadas significam duas mil conexões, mesmo que representem mil usuários.

**Experimento A — broker:** clientes sintéticos AMQP, conexões persistentes, mensagens com IDs únicos, tamanho definido, taxa configurável, confirms e consumidores com ACK. Medir cenários de fila compartilhada e de uma fila por assinante separadamente. Se 1000 publicadores emitem 1 evento/s e cada evento é enviado a 1000 assinantes, a demanda teórica é 1 milhão de entregas/s, não 1000. Isso altera radicalmente o teste.

**Experimento B — sistema:** usuários autenticados via REST criam, consultam, cancelam e recebem avisos via canal escolhido. Usar k6 com scripts JavaScript para HTTP e clientes Node.js instrumentados com `amqplib` para AMQP direto. O k6 tem runtime próprio, diferente de Node.js: não pressupor que `amqplib` possa ser importado nele. Se a interface começar por consulta periódica de avisos, incluir essas consultas no perfil de carga; se evoluir para push, adaptar a medição ao protocolo escolhido. [Runtime JavaScript do k6](https://grafana.com/docs/k6/latest/using-k6/javascript-typescript-compatibility-mode/). Validar versões na implementação. Gerar dados suficientes para carga sem conflito e uma bateria separada de conflitos intencionais. Só fatos confirmados geram eventos. Registrar rejeições esperadas por conflito separadamente de erros do servidor.

Proposta de patamares: 1, 10, 50, 100, 250, 500, 750 e 1000 clientes simultâneos. Em cada patamar: aquecer 1 minuto, manter 5 minutos, parar entradas e aguardar drenagem limitada; repetir três vezes os níveis relevantes. Valores são desenho inicial, ajustável ao orçamento e à duração exigida. Avaliar também taxa fixa versus concorrência fixa; registrar think time e taxa efetiva para evitar conclusões enganosas.

Métricas mínimas:

- Clientes ativos, conexões, canais, mensagens tentadas, aceitas/confirmadas, entregues e processadas únicas por consumidor lógico.
- Throughput de requisições, publicações e processamentos/s; latência API e evento→aviso p50/p95/p99, incluindo tempo em fila.
- Erros, timeouts, confirmações negativas, mensagens não roteadas, retries, redeliveries, duplicatas e fila de erro.
- `messages_ready`, `messages_unacknowledged`, idade do evento mais antigo e tempo de drenagem após cessar a carga.
- CPU, RAM, disco/I/O, rede, descritores/conexões de broker, banco, APIs, consumidores e gerador; alarmes e bloqueio de publicação.
- Reservas inválidas/duplicadas, conflitos indevidamente aceitos e notificações ausentes. Nenhuma violação de integridade é aceitável.

Comparar IDs e cardinalidade esperada por fila/assinante; não chamar duplicata de perda nem multiplicação do fanout de mensagens novas. Ao fim da drenagem, classificar todo evento confirmado como processado, pendente, falho conhecido ou discrepância investigada. Para latência entre máquinas, sincronizar relógios ou adotar medição/correlação que não dependa de clocks desalinhados.

Critérios propostos antes do teste: zero violação de regras, zero perda sem explicação, filas drenando e taxa de erros inesperados e p95 dentro de limites acordados. Não inventar um SLA do professor. Parar a escalada se backlog/latência crescem continuamente, há alarmes de disco/memória, erros persistentes ou saturação do gerador. O maior patamar testado não prova escalabilidade ilimitada.

Usar ambiente local/dedicado autorizado e dados sintéticos. Fixar versões, commit, limites Docker, máquina, número de réplicas, tamanho do payload, prefetch, topologia e taxa. O gerador pode ser o gargalo; evitar concluir que o broker falhou só porque um notebook não sustenta mil clientes. Não escalar workers antes de medir o gargalo. Um broker único não comprova alta disponibilidade.

Para amanhã o painel é suficiente; para séries históricas dos testes, considerar Prometheus e Grafana na fase de carga, sem acrescentá-los ao primeiro exercício. [Monitoramento oficial](https://www.rabbitmq.com/docs/monitoring) e [orientações de implantação](https://www.rabbitmq.com/docs/production-checklist).

Relatório de cada execução: data, commit, ambiente, topologia, definição de cliente, carga planejada/real, duração, métricas, gráfico de backlog/latência, reconciliação de IDs, erros, gargalo, critério de parada e conclusão limitada àquele cenário. Até que existam esses resultados, escrever “teste planejado até 1000 clientes”.

## 8. Uso do AGENTS.md

O arquivo fornecido ao lado deste plano é destinado à raiz do checkout real. Se já houver AGENTS.md, integrar o conteúdo às instruções existentes em vez de sobrescrever. O AGENTS.md deste espelho do projeto foi preservado. O ciclo didático é explicar → tarefa pequena → tentativa do aluno → revisão → teste → explicação pelo aluno. O prazo de amanhã justifica um exercício curto reproduzível, não a geração automática de cinco serviços completos.

# Sistema de Reserva de Salas em Bibliotecas

## Objetivo e forma de trabalhar
Este projeto acadêmico deve ser construído incrementalmente, com compreensão do aluno. Atue como tutor e revisor. Não implemente o sistema inteiro automaticamente.

Em cada incremento:
1. Leia o código e os requisitos envolvidos; explique em português o problema, o fluxo e os conceitos novos.
2. Proponha uma tarefa pequena com critério de conclusão e indique onde ela se encaixa no repositório.
3. Peça ao aluno para implementar a parte central. Ofereça primeiro pistas e pseudocódigo; forneça trechos completos somente quando solicitados ou após dificuldade concreta.
4. Aguarde a tentativa quando a tarefa depender dela. Revise a solução, explique erros e sugira a menor correção necessária.
5. Execute as verificações autorizadas e peça ao aluno para explicar o comportamento com suas próprias palavras.
6. Registre o que foi feito, o que foi realmente testado e o próximo passo.

Pedidos explícitos do aluno para implementar uma parte autorizam essa parte. Mesmo assim, explique as decisões e não amplie silenciosamente o escopo. Não transforme o modo didático em pedidos repetidos de confirmação para leituras e verificações já autorizadas.

## Inspeção e organização
- Antes de editar, leia instruções locais, README, árvore de arquivos, estado do Git e dependências. Este arquivo não substitui instruções já existentes: integre as regras aplicáveis.
- Preserve `codigo/backend`, `codigo/frontend` e `documentos`. Adicione subpastas somente quando necessárias; não reorganize o repositório inteiro.
- Nunca edite arquivos sob `sources/`, caso existam: são referências sincronizadas e somente leitura.
- Preserve trabalho de colegas e alterações locais. Não faça reset, limpeza destrutiva, push, merge ou publicação sem autorização correspondente.
- O relatório define requisitos e serviços, mas não fixa linguagem, framework ou banco. Verifique a implementação atual antes de propor tecnologias. Não troque uma stack existente apenas por preferência.
- A equipe escolheu JavaScript. A stack recomendada é Node.js 24 LTS, Fastify, PostgreSQL com `pg`, RabbitMQ com `amqplib` e Docker Compose; para a interface, React com Vite no template JavaScript. Não introduza TypeScript como requisito.
- Use npm e versionamento do `package-lock.json`; reproduza instalações com `npm ci`. Nos serviços novos, prefira ES Modules e async/await. A demo oficial em CommonJS pode usar arquivos `.cjs` isolados.
- Use JSON Schema do Fastify para validar contratos, logger integrado para logs e `node:test` com `fastify.inject()` para testes de API. Para persistência, SQL parametrizado com `pg` e migrações versionadas; mantenha toda transação no mesmo client adquirido do pool e libere-o em finally.
- Adote dependências gradualmente: a primeira demonstração precisa apenas de Node.js, `amqplib` e RabbitMQ. Framework HTTP, banco e frontend entram nos incrementos correspondentes. Fastify é recomendação; se a equipe já tiver implementado Express, preserve-o e adapte os testes/validações.

## Requisitos obrigatórios do relatório
- RF01: cadastro, autenticação e identificação de discentes e funcionários.
- RF02–RF03: cadastrar, consultar, ativar/desativar salas e consultar horários disponíveis.
- RF04–RF05: reserva com sala, data, intervalo e participantes; mínimo de três discentes. Conte discentes distintos, sem inflar o total com participantes repetidos.
- RF06: impedir reservas sobrepostas da mesma sala por grupos diferentes.
- RF07: impedir participação do mesmo discente em reservas sobrepostas, inclusive em salas diferentes e inclusive participantes que não sejam o responsável.
- RF08: cancelar e liberar o horário, preservando histórico.
- RF09: notificar o responsável sobre confirmação, cancelamento e alterações.
- RF10–RF12: registrar retirada da chave pelo responsável, devolução, atrasos e histórico de sala, intervalo, participantes e movimentações de chave.
- RF13: funcionários podem consultar e gerenciar reservas, conforme autorização.
- RNF01–RNF08: cinco serviços distribuídos, REST e mensageria, eventos assíncronos, persistência, permissões, integridade, interface simples e execução com Docker.

## Decisões propostas e pendências
- RabbitMQ é a proposta de mensageria; InterSCity é integração opcional de recursos/contexto, salvo exigência expressa do professor.
- Usuários, Salas, Reservas, Chaves e Notificações devem ter responsabilidades claras. Um MVP parcial deve ser identificado como parcial, sem alegar cumprir todos os RNFs.
- Reservas é a autoridade para ocupação dos horários e conflitos dos participantes. Salas fornece cadastro e estado; não mantenha dois algoritmos independentes de disponibilidade.
- PostgreSQL pode começar em uma única instância com schemas/credenciais separados por serviço. Nenhum serviço deve escrever diretamente nos dados privados de outro.
- A proposta de intervalos é [início, fim), com conflito quando inícioA < fimB e inícioB < fimA. Documente a decisão antes de adotá-la; o relatório não fixa essa convenção.
- Prazo de cancelamento, duração máxima, quem pode cancelar, efeito de desativação de sala, retirada antecipada, tolerância de atraso, cancelamento com chave retirada e edição de participantes/horário não estão especificados. Registre e esclareça antes de implementar políticas que afetem esses casos.

## Integridade e comunicação
- Não trate consulta de disponibilidade como garantia de reserva. Verificação e gravação precisam ser atômicas e resistir a duas requisições simultâneas.
- Planeje transação com bloqueios consistentes por sala e por todos os discentes, em ordem determinística, ou restrições equivalentes no banco. Teste concorrência entre salas com participante compartilhado.
- Valide identidade, perfil e sala ativa via contratos dos serviços; documente o comportamento quando uma dependência falha. Não invente sucesso em caso de erro.
- Eventos só representam fatos confirmados. Use nomes versionados, event_id, reservation_id, occurred_at, correlation_id e versão do agregado quando necessário; evite dados pessoais desnecessários.
- Publisher confirm confirma aceitação pelo broker, não envio da notificação. ACK do consumidor só ocorre após persistir/processar com sucesso.
- Use filas duráveis e mensagens persistentes no fluxo integrado, publisher confirms, roteamento verificável e tratamento de mensagem não roteada.
- Em `amqplib`, `channel.publish()` retornar true não é publisher confirm: indica capacidade do buffer local. Use confirm channel e aguarde confirmações; respeite backpressure, trate erros/fechamento e aguarde inicialização da topologia antes de publicar/consumir. Não confunda `noAck: true` com confirmação manual de processamento.
- A entrega pode se repetir: deduplique event_id com persistência e efeito atômico. Não prometa exactly-once.
- Para eliminar a lacuna entre commit no banco e publicação, implemente outbox transacional no incremento de confiabilidade, com retry limitado, backoff e monitoramento.
- Falhas permanentes vão para fila de erro; evite requeue infinito. Não perca silenciosamente notificações.
- Réplicas do mesmo serviço podem compartilhar uma fila; serviços independentes que precisam receber o mesmo evento precisam de filas distintas.

## Responsabilidades da equipe
- Yasmin: Usuários, autenticação, perfis e validação de participantes.
- Liah: Salas, cadastro, ativação/desativação e consulta de disponibilidade integrada com Reservas.
- Gabriel: Reservas, mínimo de três discentes, conflitos por sala/participante, cancelamento e status.
- Euderlan: Chaves, retirada/devolução, atrasos e histórico.
- Wanderson: Notificações e middleware, publicação/consumo e integração.
- Cada responsável revisa seu domínio; mudanças de contrato entre serviços devem ser acordadas entre os envolvidos. Não atribua publicação de fatos a Notificações: o serviço que confirma o fato publica, com apoio de Wanderson.

## Testes e qualidade
- Faça testes proporcionais ao incremento: regras de três discentes, duplicados, intervalos inválidos, fronteiras, conflitos por sala e por participante, cancelamento, autorização, chaves e atrasos.
- Inclua teste concorrente em banco real: duas tentativas incompatíveis não podem terminar confirmadas.
- Teste integração publicador–broker–consumidor com event_id rastreável; consumidor parado, recuperação, redelivery, duplicados e mensagens inválidas nos incrementos correspondentes.
- Use migrações, validação de entrada, logs estruturados, health checks e README reproduzível. Não registre senhas, tokens ou matrículas reais em evidências.
- Configurações por ambiente; `.env` fora do Git e `.env.example` sem segredos. Fixe versões aprovadas e registre a versão/digest usada em testes.
- Use dados sintéticos, recursos locais limitados e credenciais próprias. Não exponha o painel do broker publicamente.
- Não introduza Kubernetes, service mesh, event sourcing, autenticação externa ou outros componentes sem necessidade demonstrada.

## Evidências e carga
- Diferencie simulação de evento, integração real e teste de desempenho. Nunca invente prints, medições ou testes de 1000 clientes.
- Registre comando, versão/commit, ambiente, quantidade de clientes, taxa, duração, payload, resultado e limitações.
- Separe carga AMQP direta do broker de carga ponta a ponta via API e notificações. Defina se cliente significa usuário HTTP, conexão AMQP, publicador, assinante ou par publicador/assinante.
- Para carga HTTP, use k6 com scripts JavaScript. Para AMQP direto, clientes Node.js com `amqplib` instrumentados. k6 possui runtime próprio: não importar `amqplib` como se executasse em Node.js.
- Suba gradualmente até 1000 somente em ambiente autorizado, com métricas de erros, latência, throughput, backlog, recursos, duplicados/perdas e integridade. Interrompa em saturação persistente.
- Final de cada tarefa: explique alterações, arquivos, verificações executadas, resultados reais, limitações e exercício seguinte para o aluno.

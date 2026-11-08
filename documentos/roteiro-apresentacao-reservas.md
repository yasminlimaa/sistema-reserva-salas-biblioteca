# Apresentação de Reservas

## O que demonstrar

Um serviço REST real grava reservas no PostgreSQL do Supabase, impede conflitos sob concorrência, preserva histórico de cancelamento e produz eventos pela outbox/RabbitMQ. Usuários e Salas são catálogos fictícios explícitos e os tokens são locais. O frontend de login dos colegas não foi alterado ou integrado a essa demo.

## Ambiente deste checkout

As migrações e a credencial própria foram preparadas pelo agente no banco de desenvolvimento. Arquivos .env (admin), .env.app (reservas_app), .env.demo (tokens locais) e CA permanecem fora do Git. Não repetir db:setup para rotacionar a senha: o script preserva arquivos e role já ativos.

Antes de usar outro ambiente, seguir o README do serviço. Não criar um novo Supabase pago, banco de produção ou recursos AWS para este roteiro.

## Ensaio com quatro terminais

Em cada terminal, a partir da raiz do checkout:

```bash
cd codigo/backend/reservas
nvm use
```

1. API: `npm start` (http://127.0.0.1:3001).
2. Broker: `docker start reserva-rabbitmq`; aguardar `docker exec reserva-rabbitmq rabbitmq-diagnostics -q ping`; depois `npm run demo:events`.
3. Roteiro HTTP: `npm run demo:run`.
4. Publicação: `npm run worker:once` (ou `npm run worker` para execução contínua).

O roteiro mostra HTTP 400 para grupo insuficiente, 201 na criação, 409 para conflito de sala e para participante em outra sala, 200 na consulta e cancelamento, e nova criação no horário liberado. Ao finalizar, cancela os registros que criou, mas mantém seu histórico fictício e os eventos para inspeção. Se um roteiro anterior interrompido deixou reserva ativa, consultar/cancelar esse registro antes de repetir; não apagar dados arbitrariamente.

No observador, comparar event_id e reservation_id com a outbox. No painel RabbitMQ local (porta 15672), mostrar reservas.eventos/topic e notificacoes.reservas durável. O observador imprime e dá ACK técnico; não entrega aviso real ao aluno.

Para mostrar recuperação: deixar o worker parado, executar o roteiro e consultar os eventos pendentes no SQL Editor. Iniciar worker:once e conferir publicada_em. Não desligar um broker compartilhado ou excluir filas para esse experimento.

```sql
SELECT event_id, reservation_id, event_type, tentativas, publicada_em, falhou_em
FROM reservas.outbox
ORDER BY criada_em DESC
LIMIT 20;
```

## Testes para mostrar ao professor

Com worker parado e banco de desenvolvimento:

```bash
npm test
npm run db:test
npm run test:integration
```

test:integration usa dados fictícios e remove apenas seus próprios IDs. Testa requisições simultâneas via fastify.inject com transações PostgreSQL reais; não é teste de carga. O roteiro HTTP separado usa uma porta real e mantém registros cancelados como evidência.

## Fala sugerida

“O serviço de Reservas já possui API e persistência real. Autorizamos o responsável pelo token, validamos o grupo e travamos os recursos no banco antes de confirmar. Duas requisições incompatíveis não conseguem terminar confirmadas. O cancelamento preserva o histórico e libera o horário. A outbox registra o evento na mesma transação, e o worker publica com confirmação do RabbitMQ. Para esta apresentação, identidade e salas são fictícias; os colegas integrarão esses contratos aos seus serviços.”

## Divisão do próximo trabalho

- Yasmin: identidade e perfil verificados pelo backend, validação de participantes e contrato de autenticação.
- Liah: IDs de salas e contrato de cadastro/atividade; disponibilidade deve consultar a autoridade de Reservas.
- Wanderson: consumidor de notificacoes.reservas com persistência dos avisos, deduplicação e ACK após processamento.
- Euderlan: movimentos de chave relacionados a reservation_id, autorização e histórico.
- Gabriel: manter integridade/contrato de Reservas, integrar adaptadores reais e acordar edição de reservas antes de implementá-la.

Integração com o frontend, Docker Compose completo, implantação e testes de carga continuam posteriores. Esta entrega é o serviço de Reservas para demo local, não o sistema de cinco serviços completo.

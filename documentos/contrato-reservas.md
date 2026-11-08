# Contrato de Reservas — demo local v1

Base: http://127.0.0.1:3001. Backend JavaScript/Node 24, Fastify e PostgreSQL no Supabase.

Reservas e eventos são persistidos de verdade. Usuários, salas e autenticação são adaptadores fictícios, conforme escolha para a apresentação. O processo recusa produção e escuta apenas em 127.0.0.1. Nenhum serviço deve escrever diretamente nas tabelas privadas de Reservas.

## Autenticação da demo

Rotas de negócio exigem Authorization: Bearer seguido de um token local gerado por `npm run demo:setup`. Os tokens ficam em .env.demo, fora do Git, e identificam três atores: discente A, discente D e funcionário. Não são senhas reais ou autenticação Supabase. Perfil e responsável nunca são aceitos do corpo da reserva.

Consultar GET /demo/catalogo, autenticado, para obter IDs fictícios de salas e discentes. A terceira sala é inativa; funcionários não podem substituir discentes no grupo. O arquivo demo.js mantém esse catálogo determinístico para os testes.

## Rotas

| Método e caminho | Comportamento |
|---|---|
| GET /health | Processo ativo e indicação explícita do modo demo; sem autenticação |
| GET /ready | Confere acesso ao banco; 503 se indisponível; sem autenticação |
| GET /demo/catalogo | Catálogo fictício e identidade do token usado |
| POST /reservas | Cria reserva para o discente autenticado; responde 201 e Location |
| GET /reservas?limite=50&offset=0 | Discente vê reservas das quais participa; funcionário vê todas; limite máximo 100 |
| GET /reservas?sala_id=UUID | Mesmo filtro de autorização, limitado à sala indicada |
| GET /reservas/:id | Consulta de participante ou funcionário |
| GET /disponibilidade?sala_id=UUID&inicio=ISO&fim=ISO | Disponibilidade da sala no intervalo; não garante criação nem valida conflitos dos participantes |
| POST /reservas/:id/cancelamento | Responsável ou funcionário, sem prazo de antecedência; repetição é idempotente |

Não há endpoint de edição ou exclusão física nesta versão. Funcionalidades de Chaves, notificações persistidas ao aluno e interface de reservas pertencem aos incrementos/serviços correspondentes.

## Criação

Exemplo com IDs do catálogo fictício:

```json
{
  "sala_id": "20000000-0000-4000-8000-000000000001",
  "inicio": "2030-01-15T15:00:00-03:00",
  "fim": "2030-01-15T17:00:00-03:00",
  "participante_ids": [
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
    "10000000-0000-4000-8000-000000000003"
  ]
}
```

Regras: IDs UUID; instantes ISO com offset ou Z; duração positiva de até duas horas; pelo menos três discentes distintos e ativos no catálogo; responsável incluído; sala ativa. A API não inventa uma regra de antecedência ou data mínima. Duplicados são rejeitados, não contados ou removidos silenciosamente.

Resposta: reserva_id, sala_id, responsavel_id, inicio, fim, status, criada_em, cancelada_em e participante_ids. Datas retornam normalizadas em ISO/UTC. Listagem retorna `{ reservas, limite, offset }`; a consulta individual inclui os participantes.

Decisão confirmada: intervalos [início, fim). Uma reserva pode iniciar exatamente quando outra termina. Sobreposição da mesma sala ou de qualquer participante é recusada, inclusive em salas distintas.

Criação e cancelamento usam uma transação com o mesmo client e bloqueios PostgreSQL por sala e por todos os participantes, adquiridos em ordem determinística. Conflitos são reavaliados depois dos bloqueios. Esse protocolo deve ser preservado por qualquer novo caminho de escrita; escrita SQL administrativa pode ignorá-lo. O mínimo de três e a inclusão do responsável têm também restrições adiadas no banco, verificadas ao finalizar a transação.

Cancelamento mantém reserva e participantes, preenche cancelada_em e libera a ocupação. Repetir o cancelamento não gera novo evento. Uma consulta de disponibilidade é apenas informativa: a criação faz a verificação definitiva dentro da transação.

## Erros

Formato `{ codigo, mensagem, correlation_id }`, sem URI de conexão ou mensagens arbitrárias do driver.

| HTTP | Exemplos |
|---|---|
| 400 | Corpo/UUID/intervalo inválido, menos de três, duplicado ou responsável ausente |
| 401 | Token da demo ausente ou inválido |
| 403 | Perfil, consulta ou cancelamento sem autorização |
| 404 | Reserva inexistente |
| 409 | Sala ou participante em conflito |
| 422 | Sala inativa/inexistente, discente inválido ou restrição de integridade |
| 503 | Banco indisponível ou bloqueio/concorrência que excedeu o limite de espera |
| 500 | Falha interna sem detalhes sensíveis |

## Eventos para Notificações/Middleware

Exchange topic durável: reservas.eventos. Fila durável: notificacoes.reservas. Bindings declarados: reserva.confirmada, reserva.cancelada e reserva.alterada (este último reservado para incremento futuro).

Envelope JSON v1: event_id (UUID), event_type, schema_version, reservation_id, occurred_at, correlation_id, responsavel_id, room_id, inicio, fim e simulated=true. A marca indica o contexto fictício da demo; os fatos são criados somente após a operação persistida. Não contém matrícula, senha, token ou contato do aluno.

Outbox é gravada na mesma transação da reserva. Worker usa mensagem persistente, mandatory, confirm channel e backpressure. publicada_em significa confirmação de aceitação pelo broker, não notificação entregue ao aluno. Falhas usam backoff com até cinco tentativas; falhou_em indica quarentena persistida para investigação/reprocessamento administrativo. Não há requeue infinito nem descarte silencioso.

Enquanto uma confirmação da reserva não estiver publicada, seu cancelamento aguarda, inclusive se a confirmação estiver em retry, em publicação por outro worker ou em quarentena. Outras reservas seguem normalmente. A operação administrativa de recuperação deve resolver a confirmação antes de liberar o cancelamento. Esta regra cobre os dois tipos atuais; incluir eventos de alteração exige ampliar o sequenciamento. Ordem de publicação não garante ordem de conclusão do processamento por consumidores paralelos.

Crash entre confirmação e atualização da outbox pode gerar reenvio do mesmo event_id. Notificações deverá deduplicar event_id persistentemente e dar ACK somente após o efeito persistido. Não se promete exactly-once. O observador demo:events só imprime e confirma recebimento técnico; não implementa essa deduplicação nem o requisito de aviso ao aluno.

## Interfaces para substituir os dados fictícios

O objeto directory injetado em buildApp possui:

- authenticate(authorization): resolve `{ id, perfil, ativo }` a partir de identidade verificada pelo serviço de Usuários.
- validateStudents(ids): confirma existência, atividade e perfil discente de todos os IDs; lança erro em caso de falha.
- validateRoom(id): confirma existência e sala ativa no serviço de Salas.
- catalog: usado exclusivamente pela rota fictícia /demo/catalogo; deve ser removida ao integrar dados reais.

Os endpoints HTTP de Usuários e Salas ainda precisam ser acordados com Yasmin e Liah. Reservas continua sendo a autoridade dos conflitos e da disponibilidade. Não autorizar funcionário por user_metadata editável ou por perfil enviado pelo navegador. Na integração real, dependências devem ter timeout e falhar explicitamente com 503, sem fallback fictício silencioso.

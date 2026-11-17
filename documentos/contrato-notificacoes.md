# Contrato de Notificações — demo local v1

Base: `http://127.0.0.1:3005`. Backend JavaScript/Node 24, Fastify, `amqplib` e PostgreSQL no Supabase (schema `notificacoes`, role restrita `notificacoes_app`).

## Propriedade dos dados e telas atendidas

- **Telas atendidas no frontend**:
  - `Inicio.jsx` (`GET /avisos` -> seção *Avisos recentes* do usuário logado).
  - `App.jsx` e `MenuLateral.jsx` (`GET /avisos/nao-lidos/contagem` -> badge de notificações não lidas).
- **Consumo confiável e idempotente (RF09 / RNF02 / RNF03)**:
  - Consome a fila durável `notificacoes.reservas` vinculada ao exchange `reservas.eventos` (`topic`) para `reserva.confirmada`, `reserva.cancelada` e `reserva.alterada`.
  - Deduplica `event_id` persistentemente no PostgreSQL (`UNIQUE (event_id)` + `ON CONFLICT (event_id) DO NOTHING`), enviando `ACK` manual apenas após o commit da transação.
  - Mensagens permanentemente inválidas são encaminhadas para a fila durável de quarentena `notificacoes.reservas.erros` sem loop infinito de requeue.

## Rotas

| Método e caminho | Autorização | Comportamento |
|---|---|---|
| `GET /health` | Pública | Indica processo ativo e modo demo |
| `GET /ready` | Pública | Verifica acesso ao PostgreSQL (`503` se indisponível) |
| `GET /avisos?nao_lidos=false&limite=50&offset=0` | Discente ou Funcionário | Lista avisos do usuário autenticado ordenados do mais recente ao mais antigo |
| `GET /notificacoes` | Discente ou Funcionário | Rota equivalente a `GET /avisos` |
| `GET /avisos/nao-lidos/contagem` | Discente ou Funcionário | Retorna `{ nao_lidos, naoLidos }` |
| `POST /avisos/:id/leitura` | Destinatário | Marca o aviso `:id` como lido (`lido = true`, `lido_em = now()`) de forma idempotente |
| `POST /avisos/leitura-todos` | Discente ou Funcionário | Marca todos os avisos pendentes do usuário autenticado como lidos |


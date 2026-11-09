# Contrato de Salas — demo local v1

Base: `http://127.0.0.1:3002`. Backend JavaScript/Node 24, Fastify e PostgreSQL no Supabase (schema `salas`, role restrita `salas_app`).

## Propriedade dos dados e integração com Reservas

- **Salas** é a autoridade para o cadastro, capacidade, recursos (`bloco` e `equipamentos`) e estado operacional (`ativa`: `true` ou `false`) de cada sala (RF02).
- **Reservas** permanece como única autoridade para ocupação de horários e conflitos (RF03, RF06). Salas não duplica tabelas de reservas nem mantém algoritmo concorrente de disponibilidade.
- Na consulta de disponibilidade em Salas, se a sala estiver inativa (`ativa = false`), o serviço responde imediatamente `disponivel: false` com `motivo: "SALA_INATIVA"`. Se estiver ativa, consulta `GET /disponibilidade` no serviço de Reservas via HTTP com timeout de 5 segundos.
- No serviço de Reservas, ao configurar `SALAS_API_URL=http://127.0.0.1:3002`, `validateRoom(id)` consulta `GET /salas/:id` no serviço de Salas para confirmar existência e `ativa === true`.

## Rotas

| Método e caminho | Autorização | Comportamento |
|---|---|---|
| `GET /health` | Pública | Indica processo ativo e modo demo |
| `GET /ready` | Pública | Verifica acesso ao PostgreSQL (`503` se indisponível) |
| `POST /salas` | Funcionário | Cadastra nova sala; responde `201` e cabeçalho `Location` |
| `GET /salas?ativa=true&capacidade_minima=6&limite=50&offset=0` | Discente ou Funcionário | Lista salas com filtros opcionais de estado e capacidade mínima |
| `GET /salas/:id` | Discente, Funcionário ou serviço | Retorna os dados cadastrais e o estado `ativa` da sala |
| `PATCH /salas/:id` | Funcionário | Atualiza `nome`, `capacidade`, `bloco` e/ou `equipamentos` |
| `POST /salas/:id/ativacao` | Funcionário | Ativa a sala (`ativa = true`) de forma idempotente |
| `POST /salas/:id/desativacao` | Funcionário | Desativa a sala (`ativa = false`) de forma idempotente |
| `GET /salas/:id/disponibilidade?inicio=ISO&fim=ISO` | Discente ou Funcionário | Verifica se a sala está ativa e consulta ocupação em Reservas |
| `GET /disponibilidade?sala_id=UUID&inicio=ISO&fim=ISO` | Discente ou Funcionário | Equivalente por querystring à consulta de disponibilidade |

## Exemplo de cadastro (`POST /salas`)

```json
{
  "nome": "Sala 01",
  "capacidade": 6,
  "bloco": "Bloco A",
  "equipamentos": ["Quadro branco", "TV"],
  "ativa": true
}
```

Regras:
- `nome`: obrigatório, entre 1 e 80 caracteres (após remoção de espaços nas extremidades), único no catálogo.
- `capacidade`: inteiro entre `3` e `50` (coerente com RF05, que exige no mínimo 3 discentes por reserva).
- `bloco`: opcional (`string` de 1 a 60 caracteres ou `null`).
- `equipamentos`: lista opcional de até 20 itens não vazios e sem duplicatas.
- `ativa`: booleano opcional (padrão `true`).

## Erros

Formato `{ codigo, mensagem, correlation_id }`:

| HTTP | Código / Situação |
|---|---|
| `400` | `ENTRADA_INVALIDA`, `NOME_SALA_INVALIDO`, `CAPACIDADE_INVALIDA`, `EQUIPAMENTOS_DUPLICADOS`, `INTERVALO_INVALIDO` |
| `401` | `NAO_AUTENTICADO` (token ausente ou inválido) |
| `403` | `PERFIL_INVALIDO` (discente tentando cadastrar, editar, ativar ou desativar sala) |
| `404` | `SALA_NAO_ENCONTRADA` |
| `409` | `CONFLITO_SALA` (nome ou `sala_id` já existente) |
| `503` | `DEPENDENCIA_INDISPONIVEL` (banco ou serviço de Reservas indisponível) |


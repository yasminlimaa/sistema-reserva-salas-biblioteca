# Contrato de Chaves — demo local v1

Base: `http://127.0.0.1:3004`. Backend JavaScript/Node 24, Fastify e PostgreSQL no Supabase (schema `chaves`, role restrita `chaves_app`).

## Propriedade dos dados e telas atendidas

- **Telas atendidas no frontend**:
  - `ServicoChaves.jsx` (`GET /chaves/dia?data=AAAA-MM-DD&busca=...`, `POST /chaves/reservas/:id/retirada`, `POST /chaves/reservas/:id/devolucao`).
  - `HistoricoChavesModal.jsx` (`GET /chaves/reservas/:id/historico`).
  - `GestaoReservas.jsx` (`GET /chaves/reservas/:id` -> `status`: `na-recepcao`, `retirada`, `atrasada` ou `devolvida`).
- **Regras (RF10, RF11, RF12)**:
  - Retirada e devolução são operações exclusivas para o perfil `funcionario`.
  - Uma chave só pode ser retirada para reserva `confirmada` e desde que nenhuma reserva anterior da mesma sala retenha a chave sem devolução.
  - O atraso é calculado automaticamente comparando o horário de término da reserva (`fim_previsto`) com o instante atual/de devolução, persistindo `devolvida_com_atraso`, `atraso_minutos` e a trilha completa em `chaves.movimentacoes`.

## Rotas

| Método e caminho | Autorização | Comportamento |
|---|---|---|
| `GET /health` | Pública | Indica processo ativo e modo demo |
| `GET /ready` | Pública | Verifica acesso ao PostgreSQL (`503` se indisponível) |
| `GET /chaves/dia?data=AAAA-MM-DD&busca=...` | Funcionário | Retorna `{ data, resumo, chaves }` com os cartões e a tabela do claviculário |
| `POST /chaves/reservas/:id/retirada` | Funcionário | Registra a retirada da chave da reserva `:id` e grava movimentação no histórico |
| `POST /chaves/reservas/:id/devolucao` | Funcionário | Registra a devolução da chave, detecta atraso e preserva o histórico |
| `GET /chaves/reservas/:id` | Discente ou Funcionário | Retorna o status atual da chave e seu histórico |
| `GET /chaves/reservas/:id/historico` | Discente ou Funcionário | Equivalente para consulta do histórico de uso da chave |


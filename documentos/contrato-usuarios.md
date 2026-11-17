# Contrato de Usuários — demo local v1

Base: `http://127.0.0.1:3003`. Backend JavaScript/Node 24, Fastify e PostgreSQL no Supabase (schema `usuarios`, role restrita `usuarios_app`).

## Propriedade dos dados e telas atendidas

- **Telas atendidas no frontend**:
  - `LoginForm.jsx` (`POST /auth/login`, `POST /auth/logout`).
  - `CadastroForm.jsx` (`POST /auth/cadastro`, `GET /matriculas/:numero`).
  - `Participantes.jsx` (`GET /discentes?termo=...` para buscar colegas por nome ou matrícula).
- **Segurança (RF01 / RNF05)**:
  - Senhas são derivadas com `scrypt` (`node:crypto`) e sal aleatório de 128 bits; `senha_hash` nunca é retornado pela API.
  - Sessões utilizam tokens opacos de 256 bits persistidos por hash SHA-256 em `usuarios.sessoes` com expiração e revogação explícita no logout.
  - Em modo demo, também reconhece os tokens locais (`DEMO_TOKEN_DISCENTE_A`, `DEMO_TOKEN_DISCENTE_D`, `DEMO_TOKEN_FUNCIONARIO`) para compatibilidade imediata com os roteiros dos demais serviços.

## Rotas

| Método e caminho | Autorização | Comportamento |
|---|---|---|
| `GET /health` | Pública | Indica processo ativo e modo demo |
| `GET /ready` | Pública | Verifica acesso ao PostgreSQL (`503` se indisponível) |
| `GET /matriculas/:numero` | Pública | Verifica se a matrícula de discente (8 a 15 dígitos) está ativa e retorna `{ numero, ativa, curso }` |
| `POST /auth/cadastro` | Pública | Cadastra `discente` (`@discente.ufma.br`) ou `funcionario` (`@ufma.br`, SIAPE 7 dígitos); retorna `201` com `{ usuario, token, precisaConfirmarEmail }` |
| `POST /auth/login` | Pública | Autentica por `{ perfil, email, senha }` e retorna `{ usuario, token }` |
| `POST /auth/logout` | Sessão | Revoga o token de sessão atual e responde `204` |
| `GET /auth/me` | Discente ou Funcionário | Resolve a identidade verificada `{ id, usuario_id, nome, email, matricula, unidade, perfil, ativo }` |
| `GET /discentes?termo=...&limite=50&offset=0` | Discente ou Funcionário | Busca discentes ativos por nome ou matrícula |
| `POST /discentes/validacao` | Discente, Funcionário ou serviço | Valida lista `discente_ids` (todos devem existir, estar ativos e ter perfil `discente`) |
| `GET /usuarios/:id` | Discente, Funcionário ou serviço | Retorna os dados públicos do usuário por UUID |


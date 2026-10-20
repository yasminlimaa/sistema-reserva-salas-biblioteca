# Frontend — Salaa BU (login e cadastro)

Telas de login e cadastro de discente em React + Vite (JavaScript). Só o front: as regras e os dados ficam no backend ou no Supabase, ligados por um único ponto de entrada.

## Rodar

```bash
npm install
cp .env.example .env.local
npm run dev
```

Com `VITE_AUTH_PROVIDER=mock` (padrão) o sistema roda sem backend e sem banco, só para ver as telas e o fluxo.

## Ligar ao backend ou ao Supabase

Toda chamada de autenticação passa por `src/services/auth/`. O provedor é escolhido em `.env.local`:

| `VITE_AUTH_PROVIDER` | Usa |
|---|---|
| `mock` | Nada (demonstração) |
| `api` | Backend REST em `VITE_API_URL` |
| `supabase` | Supabase Auth com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` |

Para trocar de backend, basta mudar a variável. Os formulários não precisam mudar.

### Contrato do backend (`src/services/auth/api.js`)

Assumido até o backend ser definido. Ajustar o arquivo quando o contrato for fechado:

- `POST /auth/login` — envia `{ perfil, email, senha }`, espera `{ usuario }`
- `POST /auth/cadastro` — envia `{ perfil, nome, matricula, unidade, email, telefone, senha }` (`perfil` é `discente` ou `funcionario`; `unidade` é o curso ou o setor), espera `{ usuario?, precisaConfirmarEmail? }`
- `GET /matriculas/:numero` — espera `{ ativa, curso }` (ou `null` se não houver verificação)
- `POST /auth/logout`
- Erros: resposta não-2xx com `{ "mensagem": "..." }`

### Supabase (`src/services/auth/supabase.js`)

- Crie um projeto no Supabase e copie a URL e a chave **anon** para `.env.local`. Nunca use a `service_role` no frontend.
- Em Authentication → Providers → Email, decida se a confirmação de e-mail fica ligada. A tela de cadastro já trata os dois casos.
- Os dados do cadastro vão em `user_metadata`. Para uma tabela de perfis, crie um trigger em `auth.users`.
- A consulta de matrícula no SIGAA ainda não existe no Supabase; `buscarMatricula` retorna `null` e o preenchimento fica manual.

## Regras de formulário

Ficam em `src/lib/perfis.js` (por tipo de usuário) e `src/lib/validators.js`:

- Discente: e-mail `@discente.ufma.br`, matrícula de 8 a 15 dígitos, campo Curso.
- Funcionário: e-mail `@ufma.br`, matrícula SIAPE de 7 dígitos, campo Setor. Sem consulta automática de matrícula.
- Senha mínima de 8 caracteres e aceite das regras de uso, para os dois.

# Serviço de Usuários — demo funcional local

API REST em Node.js 24/Fastify com PostgreSQL no Supabase. Atende as telas de **Login** (`LoginForm.jsx`), **Cadastro de Discente/Funcionário** (`CadastroForm.jsx`) e **Busca de Participantes** (`Participantes.jsx`), além de fornecer verificação de identidade (`GET /auth/me`) e validação de discentes (`POST /discentes/validacao`) para os demais serviços do backend.

## Comandos para iniciar e testar

```bash
cd codigo/backend/usuarios
nvm use
npm install
npm test
```

Porta padrão: `http://127.0.0.1:3003`.

## Documentação

- `../../../documentos/contrato-usuarios.md`: rotas, payloads JSON, códigos de erro e integração com os demais serviços.


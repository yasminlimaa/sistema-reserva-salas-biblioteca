# Serviço de Reservas — conexão PostgreSQL

Entrega atual: migração inicial de duas tabelas, diagnóstico de conexão via pg e verificação de suas restrições no PostgreSQL real. Ainda não há API de reservas nem implementação completa das regras de negócio.

## Executar

Da raiz do repositório:

```bash
cd codigo/backend/reservas
nvm use
npm ci
```

Se ainda não houver `.env`, copie `.env.example` para `.env`. Preserve um arquivo local já configurado. Preencha DATABASE_URL com a URI de Connect → Session pooler do Supabase. Codifique os caracteres especiais da senha para URL; nunca versione ou imprima a URI real.

```bash
npm test
npm run db:check
```

O diagnóstico executa somente SELECT: exibe banco/usuário e verifica a existência de reservas.reservas e reservas.reserva_participantes. Termina com código 1 se houver falha ou tabela ausente, encerrando o pool em finally. Existência das tabelas não comprova suas colunas, restrições ou regras de negócio.

## Testar as restrições no banco de desenvolvimento

Após a aplicação da migração inicial e a configuração do certificado:

```bash
npm run db:test
```

São 14 cenários: duração igual/menor/maior que duas horas, intervalo zero/invertido, sala ausente, status inválido, coerência de cancelamento, reserva_id repetido, discente repetido, participação sem reserva, proteção de exclusão com participantes e preservação de três participações no cancelamento.

O script faz INSERT/UPDATE e uma tentativa de DELETE somente de registros fictícios criados por ele. Usa um único client, BEGIN, SAVEPOINT por cenário e ROLLBACK, sem COMMIT; não aplica migrações e não altera dados existentes. Confere ao final que os IDs de reserva gerados não permaneceram. Usar exclusivamente no ambiente de desenvolvimento com a migração 001; futuras regras ou triggers exigirão revisão dos testes e de seus possíveis efeitos externos.

O processo retorna código 1 se uma regra esperada falhar. Estes testes não validam mínimo de três, responsável participante, autorização nem conflitos de horários/concorrência. npm test continua sendo apenas a bateria local sem banco.

Referências: [transações com um único client no pg](https://node-postgres.com/features/transactions), [SAVEPOINT no PostgreSQL](https://www.postgresql.org/docs/current/sql-savepoint.html).

## Certificado TLS

A conexão exige TLS com validação do certificado e do hostname. Se a CA não estiver na cadeia confiável do Node, baixe o certificado oficial no painel do projeto: Database Settings → SSL Configuration → Download certificate.

Crie `certs/` dentro desta pasta e salve o certificado como `certs/prod-supabase.cer`. Acrescente ao `.env`:

```dotenv
PG_CA_CERT_PATH=./certs/prod-supabase.cer
```

Execute novamente `npm run db:check`. Não inclua parâmetros ssl* na DATABASE_URL: no pg, eles podem substituir o objeto ssl configurado no código. Certificados locais e .env são ignorados pelo Git.

Referências oficiais: [Supabase SSL](https://supabase.com/docs/guides/platform/ssl-enforcement), [configuração TLS no pg](https://node-postgres.com/features/ssl).

## Arquivos e limites

- db.js: valida configuração, cria pool limitado a duas conexões e permite CA oficial opcional. Erros são traduzidos sem imprimir a senha, URI ou mensagens arbitrárias do driver.
- testar-conexao.js: consulta de diagnóstico, tratamento de falhas e fechamento de conexões.
- verificar-restricoes.js: bateria de integração no banco real, com dados sintéticos e rollback.
- migrations/001_criar_reservas.sql: schema e tabelas com duração positiva de até duas horas, coerência de cancelamento e chave composta dos participantes. A aplicação no Supabase foi relatada pelo aluno; não repetir automaticamente a migração em banco existente.
- test/conexao.test.js: cenários locais de configuração inválida e proteção contra vazamento de credenciais, sem conexão externa.

O diagnóstico pode usar temporariamente a credencial administrativa do projeto. Antes de operar a API, criar usuário PostgreSQL próprio com privilégios apenas no schema do serviço. Outros serviços não devem reutilizar essa credencial administrativa.

Nenhuma migração ou escrita remota é executada por db:check. db:test realiza escritas temporárias com rollback. Ainda não há runner de migrações, configuração de permissões ou API HTTP.

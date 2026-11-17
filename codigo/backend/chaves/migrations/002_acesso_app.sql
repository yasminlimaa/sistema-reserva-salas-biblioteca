-- Senha gerada fora da migração, pelo script configurar-acesso.js.
CREATE ROLE chaves_app NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB
  NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5;
GRANT CONNECT ON DATABASE postgres TO chaves_app;
GRANT USAGE ON SCHEMA chaves TO chaves_app;
GRANT SELECT, INSERT, UPDATE ON chaves.entregas, chaves.movimentacoes TO chaves_app;
-- Sem CREATE, ALTER, TRUNCATE, DELETE ou acesso concedido a outros schemas.


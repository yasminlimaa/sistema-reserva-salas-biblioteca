-- Senha gerada fora da migração, pelo script configurar-acesso.js.
CREATE ROLE notificacoes_app NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB
  NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5;
GRANT CONNECT ON DATABASE postgres TO notificacoes_app;
GRANT USAGE ON SCHEMA notificacoes TO notificacoes_app;
GRANT SELECT, INSERT, UPDATE ON notificacoes.avisos TO notificacoes_app;
-- Sem CREATE, ALTER, TRUNCATE, DELETE ou acesso concedido a outros schemas.


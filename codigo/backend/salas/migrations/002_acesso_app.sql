-- Senha gerada fora da migração, pelo script configurar-acesso.js.
CREATE ROLE salas_app NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB
  NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5;
GRANT CONNECT ON DATABASE postgres TO salas_app;
GRANT USAGE ON SCHEMA salas TO salas_app;
GRANT SELECT, INSERT, UPDATE ON salas.salas TO salas_app;
-- Sem CREATE, ALTER, TRUNCATE, DELETE ou acesso concedido a outros schemas.


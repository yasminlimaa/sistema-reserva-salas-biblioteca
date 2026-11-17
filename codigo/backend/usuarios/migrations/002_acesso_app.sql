-- Senha gerada fora da migração, pelo script configurar-acesso.js.
CREATE ROLE usuarios_app NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB
  NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5;
GRANT CONNECT ON DATABASE postgres TO usuarios_app;
GRANT USAGE ON SCHEMA usuarios TO usuarios_app;
GRANT SELECT, INSERT, UPDATE ON usuarios.usuarios, usuarios.sessoes TO usuarios_app;
-- Sem CREATE, ALTER, TRUNCATE, DELETE ou acesso concedido a outros schemas.


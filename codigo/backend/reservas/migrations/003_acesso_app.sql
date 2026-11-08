-- Senha gerada fora da migração, pelo script configurar-acesso.js.
CREATE ROLE reservas_app NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB
  NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5;
GRANT CONNECT ON DATABASE postgres TO reservas_app;
GRANT USAGE ON SCHEMA reservas TO reservas_app;
GRANT SELECT, INSERT, UPDATE ON
  reservas.reservas, reservas.reserva_participantes, reservas.outbox TO reservas_app;
-- Sem CREATE, ALTER, TRUNCATE, DELETE ou acesso concedido a outros schemas.

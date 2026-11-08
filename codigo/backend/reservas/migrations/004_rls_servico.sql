-- A identidade de usuário final é validada pela API; esta role é exclusiva do backend.
ALTER TABLE reservas.reservas ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas.reserva_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas.outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY reservas_backend ON reservas.reservas
  TO reservas_app USING (true) WITH CHECK (true);
CREATE POLICY participantes_backend ON reservas.reserva_participantes
  TO reservas_app USING (true) WITH CHECK (true);
CREATE POLICY outbox_backend ON reservas.outbox
  TO reservas_app USING (true) WITH CHECK (true);

-- Não expor estes dados diretamente ao navegador via Supabase Data API.
REVOKE ALL ON SCHEMA reservas FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA reservas FROM anon, authenticated;

-- A identidade de usuário final é validada pela API; esta role é exclusiva do backend de Salas.
ALTER TABLE salas.salas ENABLE ROW LEVEL SECURITY;

CREATE POLICY salas_backend ON salas.salas
  TO salas_app USING (true) WITH CHECK (true);

-- Não expor estes dados diretamente ao navegador via Supabase Data API.
REVOKE ALL ON SCHEMA salas FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA salas FROM anon, authenticated;


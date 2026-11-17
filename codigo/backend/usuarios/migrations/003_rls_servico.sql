-- A identidade de usuário final é validada pela API; esta role é exclusiva do backend de Usuários.
ALTER TABLE usuarios.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios.sessoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY usuarios_backend ON usuarios.usuarios
  TO usuarios_app USING (true) WITH CHECK (true);

CREATE POLICY sessoes_backend ON usuarios.sessoes
  TO usuarios_app USING (true) WITH CHECK (true);

-- Não expor estes dados diretamente ao navegador via Supabase Data API.
REVOKE ALL ON SCHEMA usuarios FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA usuarios FROM anon, authenticated;


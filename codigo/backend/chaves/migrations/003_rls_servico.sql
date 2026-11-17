-- A identidade de usuário final é validada pela API; esta role é exclusiva do backend de Chaves.
ALTER TABLE chaves.entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE chaves.movimentacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY entregas_backend ON chaves.entregas
  TO chaves_app USING (true) WITH CHECK (true);

CREATE POLICY movimentacoes_backend ON chaves.movimentacoes
  TO chaves_app USING (true) WITH CHECK (true);

-- Não expor estes dados diretamente ao navegador via Supabase Data API.
REVOKE ALL ON SCHEMA chaves FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA chaves FROM anon, authenticated;


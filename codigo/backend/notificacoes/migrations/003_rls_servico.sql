-- A identidade de usuário final é validada pela API; esta role é exclusiva do backend de Notificações.
ALTER TABLE notificacoes.avisos ENABLE ROW LEVEL SECURITY;

CREATE POLICY avisos_backend ON notificacoes.avisos
  TO notificacoes_app USING (true) WITH CHECK (true);

-- Não expor estes dados diretamente ao navegador via Supabase Data API.
REVOKE ALL ON SCHEMA notificacoes FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA notificacoes FROM anon, authenticated;


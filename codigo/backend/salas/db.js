import { readFileSync } from 'node:fs';
import pg from 'pg';

export class ConfigurationError extends Error {}

// Nunca imprimir a URL: ela contém a senha do banco.
export function createPool(env = process.env) {
  if (!env.DATABASE_URL?.trim()) {
    throw new ConfigurationError('Defina DATABASE_URL no .env do serviço de Salas.');
  }

  let url;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new ConfigurationError('DATABASE_URL inválida. Copie a URI do painel e codifique a senha para URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname
      || !url.username || !url.password || !url.pathname.slice(1)) {
    throw new ConfigurationError('DATABASE_URL deve informar protocolo PostgreSQL, host, usuário, senha e banco.');
  }

  // No pg, parâmetros SSL da URI podem substituir o objeto ssl abaixo.
  for (const name of url.searchParams.keys()) {
    if (name.toLowerCase().startsWith('ssl')) {
      throw new ConfigurationError('Remova os parâmetros ssl* da DATABASE_URL; TLS é configurado pelo db.js.');
    }
  }

  const ssl = { rejectUnauthorized: true };
  if (env.PG_CA_CERT_PATH) {
    try {
      ssl.ca = readFileSync(env.PG_CA_CERT_PATH, 'utf8');
    } catch {
      throw new ConfigurationError('Não foi possível ler o certificado indicado em PG_CA_CERT_PATH.');
    }
  }

  return new pg.Pool({
    connectionString: env.DATABASE_URL,
    ssl,
    max: 2,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    query_timeout: 10_000,
    statement_timeout: 10_000,
    application_name: env.PGAPPNAME || 'biblioteca-salas',
  });
}

export function describeDatabaseError(error) {
  if (error instanceof ConfigurationError) return error.message;
  const messages = {
    ENOTFOUND: 'Host não encontrado. Confira os parâmetros atuais de Connect → Session pooler.',
    EAI_AGAIN: 'Falha temporária de DNS ao localizar o banco.',
    EPERM: 'A conexão foi bloqueada pelas permissões do ambiente.',
    EACCES: 'A conexão foi bloqueada pelas permissões do ambiente.',
    ECONNREFUSED: 'Conexão recusada pelo servidor PostgreSQL.',
    ETIMEDOUT: 'Tempo limite de conexão excedido.',
    '28P01': 'Autenticação recusada. Confira usuário, senha e codificação da senha no .env.',
    '42501': 'Usuário conectado sem permissão para consultar o schema de Salas.',
    SELF_SIGNED_CERT_IN_CHAIN: 'Certificado não confiável. Configure PG_CA_CERT_PATH com a CA oficial do Supabase.',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'Certificado não confiável. Configure PG_CA_CERT_PATH com a CA oficial do Supabase.',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'Não foi possível verificar o certificado. Confira a CA oficial em PG_CA_CERT_PATH.',
    CERT_HAS_EXPIRED: 'O certificado TLS expirou; confira o certificado e a data da máquina.',
  };
  // Não repassar mensagens arbitrárias do driver: podem conter dados da conexão.
  return messages[error?.code]
    ?? 'Não foi possível concluir o diagnóstico. Confira rede, credenciais, certificado e disponibilidade do projeto.';
}


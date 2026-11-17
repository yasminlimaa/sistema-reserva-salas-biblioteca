import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Regras de domínio do serviço de Usuários (RF01 e RNF05).
// Valida dados institucionais de discentes e funcionários (idênticos às regras da tela de cadastro)
// e realiza derivação segura de senha com scrypt nativo do Node.js.
export class ServiceError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string' || !storedHash.startsWith('scrypt$')) return false;
  const [, salt, expectedHex] = storedHash.split('$');
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function normalizeRegistrationInput(body) {
  const perfil = body.perfil;
  if (perfil !== 'discente' && perfil !== 'funcionario') {
    throw new ServiceError(400, 'PERFIL_INVALIDO', 'O perfil deve ser discente ou funcionario.');
  }

  const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
  if (nome.length < 3 || nome.length > 120) {
    throw new ServiceError(400, 'NOME_INVALIDO', 'Informe seu nome completo (entre 3 e 120 caracteres).');
  }

  const matricula = typeof body.matricula === 'string' ? body.matricula.replace(/\D/g, '') : '';
  if (perfil === 'discente' && !/^\d{8,15}$/.test(matricula)) {
    throw new ServiceError(400, 'MATRICULA_INVALIDA', 'A matrícula de discente deve conter de 8 a 15 números.');
  }
  if (perfil === 'funcionario' && !/^\d{7}$/.test(matricula)) {
    throw new ServiceError(400, 'MATRICULA_INVALIDA', 'A matrícula SIAPE de funcionário deve conter 7 números.');
  }

  const unidade = typeof body.unidade === 'string' ? body.unidade.trim() : '';
  if (unidade.length < 2 || unidade.length > 100) {
    throw new ServiceError(
      400,
      'UNIDADE_INVALIDA',
      perfil === 'discente' ? 'Informe seu curso.' : 'Informe seu setor.',
    );
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const dominioEsperado = perfil === 'discente' ? '@discente.ufma.br' : '@ufma.br';
  if (!EMAIL_RE.test(email) || !email.endsWith(dominioEsperado)) {
    throw new ServiceError(400, 'EMAIL_INVALIDO', `Use seu e-mail institucional (${dominioEsperado}).`);
  }

  const rawPhone = body.telefone ? String(body.telefone).replace(/\D/g, '') : '';
  if (rawPhone && rawPhone.length !== 10 && rawPhone.length !== 11) {
    throw new ServiceError(400, 'TELEFONE_INVALIDO', 'Informe DDD e número válidos.');
  }

  const senha = typeof body.senha === 'string' ? body.senha : '';
  if (senha.length < 8 || senha.length > 128) {
    throw new ServiceError(400, 'SENHA_INVALIDA', 'A senha deve ter no mínimo 8 caracteres.');
  }

  return {
    usuario_id: body.usuario_id ? body.usuario_id.toLowerCase() : null,
    perfil,
    nome,
    matricula,
    unidade,
    email,
    telefone: rawPhone || null,
    senha_hash: hashPassword(senha),
  };
}

export function normalizeLoginInput(body) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const senha = typeof body.senha === 'string' ? body.senha : '';
  const perfil = body.perfil;
  if (!EMAIL_RE.test(email) || !senha) {
    throw new ServiceError(400, 'CREDENCIAIS_INVALIDAS', 'Informe um e-mail institucional válido e sua senha.');
  }
  if (perfil !== undefined && perfil !== 'discente' && perfil !== 'funcionario') {
    throw new ServiceError(400, 'PERFIL_INVALIDO', 'O perfil deve ser discente ou funcionario.');
  }
  return { email, senha, perfil };
}

export function formatPublicUser(row) {
  return {
    id: row.usuario_id,
    usuario_id: row.usuario_id,
    nome: row.nome,
    email: row.email,
    matricula: row.matricula,
    unidade: row.unidade,
    telefone: row.telefone ?? null,
    perfil: row.perfil,
    ativo: row.ativo,
    criado_em: row.criado_em,
  };
}


import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../app.js';
import { createDemoAdapter, students, employee } from '../demo.js';
import { hashPassword } from '../domain.js';

const env = {
  DEMO_MODE: 'true',
  NODE_ENV: 'test',
  DEMO_TOKEN_DISCENTE_A: 'a'.repeat(64),
  DEMO_TOKEN_DISCENTE_D: 'd'.repeat(64),
  DEMO_TOKEN_FUNCIONARIO: 'f'.repeat(64),
};

// Simula o banco PostgreSQL de Usuários em memória para testes rápidos de API.
function createMemoryPool(seed = []) {
  const users = new Map(seed.map((user) => [user.usuario_id, {
    ...user,
    senha_hash: user.senha_hash || hashPassword('senha12345'),
    criado_em: new Date().toISOString(),
  }]));
  const sessions = new Map();

  async function execute(sql, values = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized === 'SELECT 1' || normalized.startsWith('BEGIN')
        || normalized.startsWith('SET LOCAL') || normalized === 'COMMIT'
        || normalized === 'ROLLBACK' || normalized.startsWith('SELECT pg_advisory_xact_lock')) {
      return { rows: [{ '?column?': 1 }] };
    }
    if (normalized.startsWith('INSERT INTO usuarios.usuarios')) {
      const [usuario_id, nome, email, matricula, unidade, telefone, perfil, senha_hash] = values;
      const duplicate = [...users.values()].some(
        (u) => u.usuario_id === usuario_id || u.email === email || u.matricula === matricula,
      );
      if (duplicate) {
        const error = new Error('duplicate key');
        error.code = '23505';
        throw error;
      }
      const created = {
        usuario_id,
        nome,
        email,
        matricula,
        unidade,
        telefone,
        perfil,
        senha_hash,
        ativo: true,
        criado_em: new Date().toISOString(),
      };
      users.set(usuario_id, created);
      return { rows: [created] };
    }
    if (normalized.startsWith('INSERT INTO usuarios.sessoes')) {
      const [sessao_id, usuario_id, token_sha256, expira_em] = values;
      sessions.set(token_sha256, { sessao_id, usuario_id, token_sha256, expira_em, revogada_em: null });
      return { rows: [] };
    }
    if (normalized.includes('FROM usuarios.usuarios WHERE email = $1')) {
      const found = [...users.values()].find((u) => u.email === values[0]);
      return { rows: found ? [found] : [] };
    }
    if (normalized.includes('FROM usuarios.sessoes s JOIN usuarios.usuarios u')) {
      const session = sessions.get(values[0]);
      if (!session || session.revogada_em || Date.parse(session.expira_em) <= Date.now()) {
        return { rows: [] };
      }
      const user = users.get(session.usuario_id);
      return { rows: user && user.ativo ? [user] : [] };
    }
    if (normalized.startsWith('UPDATE usuarios.sessoes SET revogada_em = now()')) {
      const session = sessions.get(values[0]);
      if (session) session.revogada_em = new Date().toISOString();
      return { rows: [] };
    }
    if (normalized.includes('FROM usuarios.usuarios WHERE usuario_id = $1')) {
      const found = users.get(values[0]);
      return { rows: found ? [found] : [] };
    }
    if (normalized.includes('WHERE perfil = \'discente\' AND ativo = true AND ($1::text = \'\'')) {
      const [termo, limit, offset] = values;
      const lower = termo.toLowerCase();
      const filtered = [...users.values()]
        .filter((u) => u.perfil === 'discente' && u.ativo
          && (!lower || u.nome.toLowerCase().includes(lower) || u.matricula.includes(lower)))
        .sort((a, b) => a.nome.localeCompare(b.nome) || a.usuario_id.localeCompare(b.usuario_id))
        .slice(offset, offset + limit);
      return { rows: filtered };
    }
    if (normalized.includes('WHERE usuario_id = ANY($1::uuid[]) AND perfil = \'discente\' AND ativo = true')) {
      const [ids] = values;
      const filtered = [...users.values()].filter(
        (u) => ids.includes(u.usuario_id) && u.perfil === 'discente' && u.ativo,
      );
      return { rows: filtered };
    }
    throw new Error(`SQL não suportado no mock de Usuários: ${normalized}`);
  }

  return {
    query: execute,
    async connect() {
      return { query: execute, release() {} };
    },
  };
}

test('API de Usuários valida regras de cadastro institucional e autenticação', async (t) => {
  const pool = createMemoryPool([...students, employee]);
  const directory = createDemoAdapter(env);
  const app = buildApp({ pool, directory });
  t.after(() => app.close());

  // 1. Consulta de matrícula no SIGAA (CadastroForm.jsx)
  const matAtiva = await app.inject({ method: 'GET', url: '/matriculas/2024001301' });
  assert.equal(matAtiva.statusCode, 200);
  assert.equal(matAtiva.json().ativa, true);
  assert.equal(matAtiva.json().curso, 'Engenharia da Computação');

  const matInativa = await app.inject({ method: 'GET', url: '/matriculas/0000123456' });
  assert.equal(matInativa.statusCode, 200);
  assert.equal(matInativa.json().ativa, false);

  // 2. Rejeita cadastro de discente com e-mail fora de @discente.ufma.br
  const emailInvalido = await app.inject({
    method: 'POST',
    url: '/auth/cadastro',
    payload: {
      perfil: 'discente',
      nome: 'Pedro Henrique',
      matricula: '2024099999',
      unidade: 'Ciência da Computação',
      email: 'pedro@gmail.com',
      senha: 'senhaSegura123',
    },
  });
  assert.equal(emailInvalido.statusCode, 400);
  assert.equal(emailInvalido.json().codigo, 'EMAIL_INVALIDO');

  // 3. Rejeita cadastro de funcionário com matrícula fora de 7 dígitos (SIAPE)
  const siapeInvalido = await app.inject({
    method: 'POST',
    url: '/auth/cadastro',
    payload: {
      perfil: 'funcionario',
      nome: 'Servidor Teste',
      matricula: '12345',
      unidade: 'Biblioteca Central',
      email: 'servidor@ufma.br',
      senha: 'senhaSegura123',
    },
  });
  assert.equal(siapeInvalido.statusCode, 400);
  assert.equal(siapeInvalido.json().codigo, 'MATRICULA_INVALIDA');

  // 4. Cadastro válido cria usuário com senha criptografada (sem expor senha_hash) e retorna sessão
  const cadastroOk = await app.inject({
    method: 'POST',
    url: '/auth/cadastro',
    payload: {
      perfil: 'discente',
      nome: 'Pedro Henrique Silva',
      matricula: '2024099999',
      unidade: 'Ciência da Computação',
      email: 'pedro.silva@discente.ufma.br',
      telefone: '(98) 98888-7777',
      senha: 'senhaSegura123',
    },
  });
  assert.equal(cadastroOk.statusCode, 201);
  const body = cadastroOk.json();
  assert.equal(body.usuario.email, 'pedro.silva@discente.ufma.br');
  assert.equal(body.usuario.senha_hash, undefined);
  assert.ok(body.token);

  // 5. E-mail ou matrícula duplicados retornam 409
  const duplicado = await app.inject({
    method: 'POST',
    url: '/auth/cadastro',
    payload: {
      perfil: 'discente',
      nome: 'Outro Nome',
      matricula: '2024099999',
      unidade: 'Ciência da Computação',
      email: 'pedro.silva@discente.ufma.br',
      senha: 'senhaSegura123',
    },
  });
  assert.equal(duplicado.statusCode, 409);

  // 6. Login com credenciais válidas e inválidas (LoginForm.jsx)
  const loginFalho = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { perfil: 'discente', email: 'pedro.silva@discente.ufma.br', senha: 'senhaErrada' },
  });
  assert.equal(loginFalho.statusCode, 401);

  const loginOk = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { perfil: 'discente', email: 'pedro.silva@discente.ufma.br', senha: 'senhaSegura123' },
  });
  assert.equal(loginOk.statusCode, 200);
  const { token } = loginOk.json();

  // 7. Consulta de sessão (GET /auth/me), busca de discentes (Participantes.jsx) e validação de grupo
  const me = await app.inject({
    method: 'GET',
    url: '/auth/me',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().matricula, '2024099999');

  const busca = await app.inject({
    method: 'GET',
    url: '/discentes?termo=Yasmin',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(busca.statusCode, 200);
  assert.equal(busca.json().discentes.length, 1);
  assert.equal(busca.json().discentes[0].matricula, '2025007136');

  // Validação de discentes rejeita ID de funcionário no meio do grupo
  const validacaoInvalida = await app.inject({
    method: 'POST',
    url: '/discentes/validacao',
    headers: { authorization: `Bearer ${token}` },
    payload: { discente_ids: [students[0].id, students[1].id, employee.id] },
  });
  assert.equal(validacaoInvalida.statusCode, 422);

  const validacaoValida = await app.inject({
    method: 'POST',
    url: '/discentes/validacao',
    headers: { authorization: `Bearer ${token}` },
    payload: { discente_ids: [students[0].id, students[1].id, students[2].id] },
  });
  assert.equal(validacaoValida.statusCode, 200);
  assert.equal(validacaoValida.json().validos, true);

  // 8. Logout invalida o token de sessão
  const logout = await app.inject({
    method: 'POST',
    url: '/auth/logout',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(logout.statusCode, 204);

  const meAfterLogout = await app.inject({
    method: 'GET',
    url: '/auth/me',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(meAfterLogout.statusCode, 401);
});


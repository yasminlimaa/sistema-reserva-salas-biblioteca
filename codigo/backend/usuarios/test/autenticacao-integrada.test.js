import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp as buildUsuarios } from '../app.js';
import { createDemoAdapter as createUsuariosDemo, students, employee } from '../demo.js';
import { hashPassword } from '../domain.js';
import { buildApp as buildSalas } from '../../salas/app.js';
import { createDemoAdapter as createSalasDemo, initialRooms } from '../../salas/demo.js';
import { buildApp as buildReservas } from '../../reservas/app.js';
import { createDemoAdapter as createReservasDemo } from '../../reservas/demo.js';

const env = { DEMO_MODE: 'true', NODE_ENV: 'test',
  DEMO_TOKEN_DISCENTE_A: 'a'.repeat(64), DEMO_TOKEN_DISCENTE_D: 'd'.repeat(64), DEMO_TOKEN_FUNCIONARIO: 'f'.repeat(64) };

function txResult(sql) {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  return normalized === 'SELECT 1' || normalized.startsWith('BEGIN') || normalized.startsWith('SET LOCAL')
    || normalized === 'COMMIT' || normalized === 'ROLLBACK' || normalized.startsWith('SELECT pg_advisory_xact_lock');
}

function usuariosPool(seed) {
  const users = new Map(seed.map((u) => [u.usuario_id, { ...u, senha_hash: hashPassword('senha12345'), criado_em: new Date().toISOString() }]));
  const sessions = new Map();
  async function query(sql, values = []) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (txResult(sql)) return { rows: [{}] };
    if (q.startsWith('INSERT INTO usuarios.sessoes')) { const [, id, hash, expira] = values; sessions.set(hash, { id, expira, revogada: false }); return { rows: [] }; }
    if (q.includes('FROM usuarios.usuarios WHERE email = $1')) { const row = [...users.values()].find((u) => u.email === values[0]); return { rows: row ? [row] : [] }; }
    if (q.includes('FROM usuarios.sessoes s JOIN usuarios.usuarios u')) { const s = sessions.get(values[0]); const row = s && !s.revogada && Date.parse(s.expira) > Date.now() ? users.get(s.id) : null; return { rows: row ? [row] : [] }; }
    if (q.startsWith('UPDATE usuarios.sessoes SET revogada_em')) { const s = sessions.get(values[0]); if (s) s.revogada = true; return { rows: [] }; }
    if (q.includes("WHERE perfil = 'discente' AND ativo = true AND")) { const [term, limit, offset] = values; const lower = term.toLowerCase(); return { rows: [...users.values()].filter((u) => u.perfil === 'discente' && u.ativo && (!lower || u.nome.toLowerCase().includes(lower) || u.matricula.includes(lower))).slice(offset, offset + limit) }; }
    if (q.includes('WHERE usuario_id = ANY($1::uuid[])')) { const ids = values[0]; return { rows: ids.map((id) => users.get(id)).filter((u) => u?.perfil === 'discente' && u.ativo) }; }
    throw new Error(`SQL de Usuários não suportado: ${q}`);
  }
  return { query, async connect() { return { query, release() {} }; } };
}

function salasPool(seed) {
  const rooms = new Map(seed.map((r) => [r.sala_id, { ...r, equipamentos: [...r.equipamentos] }]));
  async function query(sql, values = []) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (txResult(sql)) return { rows: [{}] };
    if (q.includes('FROM salas.salas WHERE ($1::boolean IS NULL')) { const [ativa, min, limit, offset] = values; return { rows: [...rooms.values()].filter((r) => (ativa === null || r.ativa === ativa) && (min === null || r.capacidade >= min)).slice(offset, offset + limit) }; }
    if (q.includes('FROM salas.salas WHERE sala_id = $1')) { const row = rooms.get(values[0]); return { rows: row ? [row] : [] }; }
    throw new Error(`SQL de Salas não suportado: ${q}`);
  }
  return { query, async connect() { return { query, release() {} }; } };
}

function reservasPool() {
  const reservations = new Map(); const participants = new Map();
  const overlaps = (r, inicio, fim) => r.status === 'confirmada' && r.inicio < fim && inicio < r.fim;
  const read = (id) => { const r = reservations.get(id); return r && { ...r, participante_ids: [...(participants.get(id) || [])] }; };
  async function query(sql, values = []) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (txResult(sql)) return { rows: [{}] };
    if (q.startsWith('SELECT r.*, ARRAY(') && q.includes('WHERE r.reserva_id = $1')) { const row = read(values[0]); return { rows: row ? [row] : [] }; }
    if (q.startsWith('SELECT NOT EXISTS')) { const [room, inicio, fim] = values; return { rows: [{ disponivel: ![...reservations.values()].some((r) => r.sala_id === room && overlaps(r, inicio, fim)) }] }; }
    if (q.startsWith('SELECT r.reserva_id FROM reservas.reservas r')) { const [room, inicio, fim, ids] = values; return { rows: [...reservations.values()].filter((r) => overlaps(r, inicio, fim) && (r.sala_id === room || [...(participants.get(r.reserva_id) || [])].some((id) => ids.includes(id)))).slice(0, 1) }; }
    if (q.startsWith('INSERT INTO reservas.reservas')) { const [id, room, responsible, inicio, fim] = values; reservations.set(id, { reserva_id: id, sala_id: room, responsavel_id: responsible, inicio, fim, status: 'confirmada', criada_em: new Date().toISOString(), cancelada_em: null }); return { rows: [] }; }
    if (q.startsWith('INSERT INTO reservas.reserva_participantes')) { participants.set(values[0], values[1]); return { rows: [] }; }
    if (q.startsWith('INSERT INTO reservas.outbox')) return { rows: [] };
    if (q.startsWith('SELECT reserva_id FROM reservas.reservas WHERE')) return { rows: reservations.has(values[0]) ? [{ reserva_id: values[0] }] : [] };
    if (q.startsWith('UPDATE reservas.reservas SET status')) { const r = reservations.get(values[0]); r.status = 'cancelada'; r.cancelada_em = new Date().toISOString(); return { rows: [] }; }
    if (q.includes('FROM reservas.reservas r WHERE ($1::boolean')) { const [staff, userId, room, limit, offset] = values; const rows = [...reservations.values()].filter((r) => (staff || (participants.get(r.reserva_id) || []).includes(userId)) && (!room || r.sala_id === room)).slice(offset, offset + limit).map((r) => read(r.reserva_id)); return { rows }; }
    throw new Error(`SQL de Reservas não suportado: ${q}`);
  }
  return { query, async connect() { return { query, release() {} }; } };
}

test('integração em memória autentica e revoga a mesma sessão entre Usuários, Salas e Reservas', async (t) => {
  let usuarios; let salas; let reservas;
  const encaminhamentos = [];
  const fetchBetweenApps = async (url, options = {}) => {
    const parsed = new URL(url); const target = ({ 'usuarios.local': usuarios, 'salas.local': salas, 'reservas.local': reservas })[parsed.hostname];
    encaminhamentos.push({ destino: parsed.hostname, caminho: parsed.pathname, authorization: options.headers?.authorization });
    const response = await target.inject({ method: options.method || 'GET', url: `${parsed.pathname}${parsed.search}`, headers: options.headers, payload: options.body });
    return { status: response.statusCode, async json() { return response.json(); } };
  };
  usuarios = buildUsuarios({ pool: usuariosPool([...students, employee]), directory: createUsuariosDemo(env) });
  salas = buildSalas({ pool: salasPool(initialRooms), directory: createSalasDemo({ ...env, USUARIOS_API_URL: 'http://usuarios.local', RESERVAS_API_URL: 'http://reservas.local' }, { fetchImpl: fetchBetweenApps }) });
  reservas = buildReservas({ pool: reservasPool(), directory: createReservasDemo({ ...env, USUARIOS_API_URL: 'http://usuarios.local', SALAS_API_URL: 'http://salas.local' }, { fetchImpl: fetchBetweenApps }) });
  t.after(async () => { await usuarios.close(); await salas.close(); await reservas.close(); });

  const login = await usuarios.inject({ method: 'POST', url: '/auth/login', payload: { perfil: 'discente', email: students[0].email, senha: 'senha12345' } });
  assert.equal(login.statusCode, 200); const token = login.json().token; const headers = { authorization: `Bearer ${token}` };
  assert.equal((await usuarios.inject({ method: 'GET', url: '/auth/me', headers })).statusCode, 200);
  assert.equal((await salas.inject({ method: 'GET', url: '/salas' })).statusCode, 401);
  assert.equal((await reservas.inject({ method: 'GET', url: '/reservas', headers: { authorization: 'Bearer invalido' } })).statusCode, 401);
  assert.equal((await salas.inject({ method: 'GET', url: '/salas', headers })).statusCode, 200);
  assert.equal((await salas.inject({ method: 'GET', url: `/salas/${initialRooms[0].sala_id}`, headers })).statusCode, 200);
  assert.equal((await salas.inject({ method: 'POST', url: '/salas', headers, payload: { nome: 'Sala sem permissao', capacidade: 3 } })).statusCode, 403);
  const found = await usuarios.inject({ method: 'GET', url: '/discentes?limite=3', headers }); assert.equal(found.json().discentes.length, 3);
  const payload = { sala_id: initialRooms[0].sala_id, inicio: '2070-01-01T15:00:00-03:00', fim: '2070-01-01T16:00:00-03:00', participante_ids: students.slice(0, 3).map((s) => s.id) };
  const created = await reservas.inject({ method: 'POST', url: '/reservas', headers, payload }); assert.equal(created.statusCode, 201); const id = created.json().reserva_id;
  assert.ok(encaminhamentos.some((item) => item.destino === 'salas.local' && item.caminho === `/salas/${payload.sala_id}` && item.authorization === headers.authorization));
  assert.ok(encaminhamentos.some((item) => item.destino === 'usuarios.local' && item.caminho === '/discentes/validacao' && item.authorization === headers.authorization));
  assert.equal((await reservas.inject({ method: 'GET', url: '/reservas', headers })).json().reservas.length, 1);
  assert.equal((await reservas.inject({ method: 'POST', url: '/reservas', headers, payload })).statusCode, 409);
  const inactive = await reservas.inject({ method: 'POST', url: '/reservas', headers, payload: { ...payload, sala_id: initialRooms[2].sala_id } }); assert.equal(inactive.statusCode, 422); assert.equal(inactive.json().codigo, 'SALA_INVALIDA');
  const absent = await reservas.inject({ method: 'POST', url: '/reservas', headers, payload: { ...payload, sala_id: '20000000-0000-4000-8000-000000000099' } }); assert.equal(absent.statusCode, 422); assert.equal(absent.json().codigo, 'SALA_INVALIDA');
  const invalidParticipant = await reservas.inject({ method: 'POST', url: '/reservas', headers, payload: { ...payload, participante_ids: [students[0].id, students[1].id, employee.id] } }); assert.equal(invalidParticipant.statusCode, 422); assert.equal(invalidParticipant.json().codigo, 'DISCENTE_INVALIDO');
  const employeeLogin = await usuarios.inject({ method: 'POST', url: '/auth/login', payload: { perfil: 'funcionario', email: employee.email, senha: 'senha12345' } });
  assert.equal(employeeLogin.statusCode, 200);
  assert.equal((await reservas.inject({ method: 'POST', url: '/reservas', headers: { authorization: `Bearer ${employeeLogin.json().token}` }, payload })).statusCode, 403);
  assert.equal((await reservas.inject({ method: 'POST', url: `/reservas/${id}/cancelamento`, headers })).statusCode, 200);
  const salasIndisponiveis = buildSalas({
    pool: salasPool(initialRooms),
    directory: createSalasDemo({ ...env, USUARIOS_API_URL: 'http://usuarios.indisponivel' }, { fetchImpl: async () => { throw new Error('ECONNREFUSED'); } }),
  });
  t.after(async () => salasIndisponiveis.close());
  assert.equal((await salasIndisponiveis.inject({ method: 'GET', url: '/salas', headers: { authorization: 'Bearer token-nao-demo' } })).statusCode, 503);
  assert.equal((await usuarios.inject({ method: 'POST', url: '/auth/logout', headers })).statusCode, 204);
  for (const app of [usuarios, salas, reservas]) assert.equal((await app.inject({ method: 'GET', url: app === salas ? '/salas' : app === reservas ? '/reservas' : '/auth/me', headers })).statusCode, 401);
});

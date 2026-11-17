import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool, describeDatabaseError } from './db.js';
import { hashPassword } from './domain.js';

// Exclusivo para o banco de desenvolvimento: usa dados sintéticos e nunca executa COMMIT.
async function main() {
  const pool = createPool();
  pool.on('error', (error) => {
    console.error('Erro de conexão:', describeDatabaseError(error));
    process.exitCode = 1;
  });
  let client;
  let transactionStarted = false;
  const generatedIds = [];

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query("SET LOCAL lock_timeout = '2s'");

    async function insertUser(overrides = {}) {
      const suffix = randomUUID().slice(0, 8);
      const data = {
        usuario_id: randomUUID(),
        nome: `Discente Teste ${suffix}`,
        email: `discente.${suffix}@discente.ufma.br`,
        matricula: String(Math.floor(1000000000 + Math.random() * 9000000000)),
        unidade: 'Engenharia da Computação',
        telefone: '98988887777',
        perfil: 'discente',
        senha_hash: hashPassword('senha12345'),
        ...overrides,
      };
      generatedIds.push(data.usuario_id);
      const { rows: [row] } = await client.query(`
        INSERT INTO usuarios.usuarios
          (usuario_id, nome, email, matricula, unidade, telefone, perfil, senha_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        data.usuario_id,
        data.nome,
        data.email,
        data.matricula,
        data.unidade,
        data.telefone,
        data.perfil,
        data.senha_hash,
      ]);
      return row;
    }

    async function expectViolation(operation, code, constraint) {
      await assert.rejects(operation, (error) => error.code === code
        && (!constraint || error.constraint === constraint));
    }

    const cases = [
      ['aceita discente com matrícula de 10 dígitos e domínio @discente.ufma.br', async () => {
        const row = await insertUser();
        assert.equal(row.perfil, 'discente');
        assert.equal(row.ativo, true);
      }],
      ['aceita funcionário com matrícula SIAPE de 7 dígitos e domínio @ufma.br', async () => {
        const row = await insertUser({
          perfil: 'funcionario',
          matricula: '1234567',
          email: `servidor.${randomUUID().slice(0, 6)}@ufma.br`,
          unidade: 'Biblioteca Central',
        });
        assert.equal(row.perfil, 'funcionario');
      }],
      ['rejeita discente com domínio incorreto', () => expectViolation(
        () => insertUser({ email: 'aluno@ufma.br' }),
        '23514',
        'usuarios_regras_institucionais',
      )],
      ['rejeita funcionário com matrícula fora de 7 dígitos', () => expectViolation(
        () => insertUser({ perfil: 'funcionario', email: 'servidor@ufma.br', matricula: '1234567890' }),
        '23514',
        'usuarios_regras_institucionais',
      )],
      ['rejeita e-mail duplicado', async () => {
        const row = await insertUser();
        await expectViolation(() => insertUser({ email: row.email }), '23505', 'usuarios_email_unico');
      }],
    ];

    let failures = 0;
    for (const [label, check] of cases) {
      await client.query('SAVEPOINT caso');
      try {
        await check();
        console.log('OK:', label);
      } catch {
        failures++;
        console.error('FALHOU:', label);
      } finally {
        await client.query('ROLLBACK TO SAVEPOINT caso');
        await client.query('RELEASE SAVEPOINT caso');
      }
    }

    await client.query('ROLLBACK');
    transactionStarted = false;
    console.log(`Resultado: ${cases.length - failures}/${cases.length} cenários passaram. Dados fictícios revertidos.`);
    if (failures) process.exitCode = 1;
  } finally {
    try {
      if (transactionStarted) await client.query('ROLLBACK');
    } finally {
      client?.release();
      await pool.end();
    }
  }
}

main().catch((error) => {
  console.error('Falha na verificação:', describeDatabaseError(error));
  process.exitCode = 1;
});


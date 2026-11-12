import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../testar-conexao.js', import.meta.url));
const secret = 'senha-ficticia-que-nao-pode-aparecer';

// Não carrega .env nem abre conexão real: estas entradas devem falhar antes da rede.
for (const [name, connectionString, expected] of [
  ['configuração ausente', '', /Defina DATABASE_URL/],
  ['URI inválida com segredo', `valor-invalido-${secret}`, /DATABASE_URL inválida/],
  ['tentativa de desativar TLS pela URI', `postgresql://usuario:${secret}@localhost/banco?sslmode=disable`, /Remova os parâmetros ssl/],
]) {
  test(`${name}: falha sem expor a configuração`, () => {
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, DATABASE_URL: connectionString, PG_CA_CERT_PATH: '' },
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, expected);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
  });
}


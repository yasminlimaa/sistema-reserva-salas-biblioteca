import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

// Reaproveita os tokens de ../reservas/.env.demo se já existirem, para que os dois serviços
// aceitem as mesmas credenciais locais durante a demonstração integrada.
async function resolveTokens() {
  try {
    const reservasDemo = parseEnv(await readFile('../reservas/.env.demo', 'utf8'));
    if (reservasDemo.DEMO_TOKEN_DISCENTE_A?.length >= 32
        && reservasDemo.DEMO_TOKEN_DISCENTE_D?.length >= 32
        && reservasDemo.DEMO_TOKEN_FUNCIONARIO?.length >= 32) {
      return [
        `DEMO_TOKEN_DISCENTE_A=${reservasDemo.DEMO_TOKEN_DISCENTE_A}`,
        `DEMO_TOKEN_DISCENTE_D=${reservasDemo.DEMO_TOKEN_DISCENTE_D}`,
        `DEMO_TOKEN_FUNCIONARIO=${reservasDemo.DEMO_TOKEN_FUNCIONARIO}`,
      ];
    }
  } catch {
    // Se ../reservas/.env.demo não existir, gera tokens locais próprios abaixo.
  }
  return ['DISCENTE_A', 'DISCENTE_D', 'FUNCIONARIO']
    .map((name) => `DEMO_TOKEN_${name}=${randomBytes(32).toString('hex')}`);
}

try {
  const tokens = await resolveTokens();
  const content = [
    'DEMO_MODE=true',
    'NODE_ENV=development',
    'HOST=127.0.0.1',
    'PORT=3002',
    'RESERVAS_API_URL=http://127.0.0.1:3001',
    ...tokens,
  ].join('\n') + '\n';
  await writeFile('.env.demo', content, { flag: 'wx', mode: 0o600 });
  console.log('.env.demo criado para Salas; nenhum token foi impresso.');
} catch (error) {
  console.error(error.code === 'EEXIST' ? '.env.demo existente preservado.' : 'Não foi possível criar .env.demo.');
  process.exitCode = 1;
}


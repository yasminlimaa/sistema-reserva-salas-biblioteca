import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

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
    // Gera tokens locais próprios caso ../reservas/.env.demo não exista.
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
    'PORT=3003',
    ...tokens,
  ].join('\n') + '\n';
  await writeFile('.env.demo', content, { flag: 'wx', mode: 0o600 });
  console.log('.env.demo criado para Usuários; nenhum token foi impresso.');
} catch (error) {
  console.error(error.code === 'EEXIST' ? '.env.demo existente preservado.' : 'Não foi possível criar .env.demo.');
  process.exitCode = 1;
}


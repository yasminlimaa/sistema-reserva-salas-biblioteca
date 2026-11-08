import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const content = [
  'DEMO_MODE=true', 'NODE_ENV=development', 'HOST=127.0.0.1', 'PORT=3001',
  'AMQP_URL=amqp://localhost',
  ...['DISCENTE_A', 'DISCENTE_D', 'FUNCIONARIO'].map((name) => `DEMO_TOKEN_${name}=${randomBytes(32).toString('hex')}`),
].join('\n') + '\n';

try {
  await writeFile('.env.demo', content, { flag: 'wx', mode: 0o600 });
  console.log('.env.demo criado com tokens aleatórios locais; nenhum token foi impresso.');
} catch (error) {
  console.error(error.code === 'EEXIST' ? '.env.demo existente preservado.' : 'Não foi possível criar .env.demo.');
  process.exitCode = 1;
}

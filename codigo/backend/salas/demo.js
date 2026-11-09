import { timingSafeEqual } from 'node:crypto';
import { ServiceError } from './domain.js';
import { createReservasClient } from './reservas-client.js';

// Adaptador de autenticação da demo local, compatível com os mesmos tokens de Reservas.
// Identidades de usuários continuam fictícias até a integração com o serviço de Usuários.
export const students = ['a', 'b', 'c', 'd', 'e', 'f'].map((letter, i) => ({
  id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  nome: `Discente fictício ${letter.toUpperCase()}`,
  perfil: 'discente',
  ativo: true,
}));

export const employee = {
  id: '10000000-0000-4000-8000-000000000099',
  nome: 'Funcionário fictício',
  perfil: 'funcionario',
  ativo: true,
};

// Catálogo inicial determinístico compatível com os UUIDs esperados pelo serviço de Reservas
// e com os atributos exibidos pela interface (capacidade, bloco, equipamentos e estado ativa).
export const initialRooms = [
  {
    sala_id: '20000000-0000-4000-8000-000000000001',
    nome: 'Sala 01',
    capacidade: 6,
    bloco: 'Bloco A',
    equipamentos: ['Quadro branco'],
    ativa: true,
  },
  {
    sala_id: '20000000-0000-4000-8000-000000000002',
    nome: 'Sala 02',
    capacidade: 8,
    bloco: 'Bloco A',
    equipamentos: ['Quadro branco', 'TV'],
    ativa: true,
  },
  {
    sala_id: '20000000-0000-4000-8000-000000000003',
    nome: 'Sala 03',
    capacidade: 10,
    bloco: 'Bloco B',
    equipamentos: ['Projetor', 'Quadro branco'],
    ativa: false,
  },
];

const tokenDefinitions = [
  ['DEMO_TOKEN_DISCENTE_A', students[0]],
  ['DEMO_TOKEN_DISCENTE_D', students[3]],
  ['DEMO_TOKEN_FUNCIONARIO', employee],
];

export function createDemoAdapter(env = process.env, { fetchImpl } = {}) {
  if (env.DEMO_MODE !== 'true' || env.NODE_ENV === 'production') {
    throw new Error('Esta versão exige DEMO_MODE=true e recusa NODE_ENV=production.');
  }
  const identities = tokenDefinitions.map(([name, user]) => {
    const token = env[name];
    if (!token || token.length < 32) {
      throw new Error(`Configure ${name} com um token local de ao menos 32 caracteres.`);
    }
    return [Buffer.from(token), user];
  });
  if (new Set(identities.map(([token]) => token.toString())).size !== identities.length) {
    throw new Error('Os tokens da demo devem ser distintos.');
  }

  const reservasClient = createReservasClient(env.RESERVAS_API_URL || 'http://127.0.0.1:3001', {
    fetchImpl,
    serviceToken: env.DEMO_TOKEN_FUNCIONARIO,
  });

  return {
    authenticate(header) {
      const match = /^Bearer (\S+)$/.exec(header || '');
      if (match) {
        const supplied = Buffer.from(match[1]);
        for (const [token, user] of identities) {
          if (token.length === supplied.length && timingSafeEqual(token, supplied)) return user;
        }
      }
      throw new ServiceError(401, 'NAO_AUTENTICADO', 'Token de demonstração ausente ou inválido.');
    },
    checkAvailability: reservasClient.checkAvailability,
  };
}


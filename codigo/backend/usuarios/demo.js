import { timingSafeEqual } from 'node:crypto';
import { ServiceError } from './domain.js';

// Catálogo de demonstração alinhado com os IDs determinísticos de Reservas
// e com os dados exibidos nas telas do frontend (nome, matrícula e curso).
export const students = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    usuario_id: '10000000-0000-4000-8000-000000000001',
    nome: 'Gabriel André Barreto',
    email: 'gabriel.barreto@discente.ufma.br',
    matricula: '2024001301',
    unidade: 'Engenharia da Computação',
    perfil: 'discente',
    ativo: true,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    usuario_id: '10000000-0000-4000-8000-000000000002',
    nome: 'Gabriela Lopes',
    email: 'gabriela.lopes@discente.ufma.br',
    matricula: '2024008812',
    unidade: 'Engenharia da Computação',
    perfil: 'discente',
    ativo: true,
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    usuario_id: '10000000-0000-4000-8000-000000000003',
    nome: 'Yasmin Serejo',
    email: 'yasmin.serejo@discente.ufma.br',
    matricula: '2025007136',
    unidade: 'Ciência da Computação',
    perfil: 'discente',
    ativo: true,
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    usuario_id: '10000000-0000-4000-8000-000000000004',
    nome: 'Ana Clara Martins',
    email: 'ana.martins@discente.ufma.br',
    matricula: '2024012408',
    unidade: 'Engenharia da Computação',
    perfil: 'discente',
    ativo: true,
  },
  {
    id: '10000000-0000-4000-8000-000000000005',
    usuario_id: '10000000-0000-4000-8000-000000000005',
    nome: 'Lucas Oliveira',
    email: 'lucas.oliveira@discente.ufma.br',
    matricula: '2024021917',
    unidade: 'Ciência da Computação',
    perfil: 'discente',
    ativo: true,
  },
  {
    id: '10000000-0000-4000-8000-000000000006',
    usuario_id: '10000000-0000-4000-8000-000000000006',
    nome: 'Mariana Costa',
    email: 'mariana.costa@discente.ufma.br',
    matricula: '2024005540',
    unidade: 'BICT',
    perfil: 'discente',
    ativo: true,
  },
];

export const employee = {
  id: '10000000-0000-4000-8000-000000000099',
  usuario_id: '10000000-0000-4000-8000-000000000099',
  nome: 'Funcionário Biblioteca Central',
  email: 'recepcao.biblioteca@ufma.br',
  matricula: '1234567',
  unidade: 'Biblioteca Central',
  perfil: 'funcionario',
  ativo: true,
};

const tokenDefinitions = [
  ['DEMO_TOKEN_DISCENTE_A', students[0]],
  ['DEMO_TOKEN_DISCENTE_D', students[3]],
  ['DEMO_TOKEN_FUNCIONARIO', employee],
];

export function createDemoAdapter(env = process.env) {
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

  return {
    matchDemoToken(rawToken) {
      const supplied = Buffer.from(rawToken);
      for (const [token, user] of identities) {
        if (token.length === supplied.length && timingSafeEqual(token, supplied)) {
          return user;
        }
      }
      return null;
    },
    lookupEnrollment(numero) {
      const clean = String(numero || '').replace(/\D/g, '');
      if (!/^\d{8,15}$/.test(clean)) {
        throw new ServiceError(400, 'MATRICULA_INVALIDA', 'A matrícula deve conter de 8 a 15 números.');
      }
      // Simula consulta no SIGAA para o formulário de cadastro (CadastroForm.jsx).
      const matched = students.find((student) => student.matricula === clean);
      if (clean.startsWith('0000')) {
        return { numero: clean, ativa: false, curso: null };
      }
      return {
        numero: clean,
        ativa: true,
        curso: matched?.unidade || 'Engenharia da Computação',
      };
    },
  };
}


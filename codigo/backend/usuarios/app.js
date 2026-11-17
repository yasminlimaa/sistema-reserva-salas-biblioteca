import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { createRepository } from './repository.js';
import {
  ServiceError,
  normalizeLoginInput,
  normalizeRegistrationInput,
} from './domain.js';

const uuid = { type: 'string', format: 'uuid' };
const params = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: uuid },
};

function extractBearerToken(header) {
  const match = /^Bearer (\S+)$/.exec(header || '');
  return match ? match[1] : null;
}

export function buildApp({ pool, directory, logger = false }) {
  const app = Fastify({
    logger,
    bodyLimit: 16_384,
    genReqId: () => randomUUID(),
    ajv: { customOptions: { removeAdditional: false } },
  });
  const repository = createRepository(pool);

  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({
        codigo: 'ENTRADA_INVALIDA',
        mensagem: 'Parâmetros inválidos. Confira os dados informados.',
        correlation_id: request.id,
      });
    }
    if (error instanceof ServiceError) {
      return reply.code(error.statusCode).send({
        codigo: error.code,
        mensagem: error.message,
        correlation_id: request.id,
      });
    }
    const status = ['23503', '23514', '23505'].includes(error.code) ? 422
      : ['55P03', '40P01', '40001', 'ECONNREFUSED', 'ENOTFOUND', '57P01'].includes(error.code) ? 503
      : error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    request.log.error({ code: error.code || 'ERRO_INTERNO' }, 'Falha na operação de Usuários');
    return reply.code(status).send({
      codigo: status === 503 ? 'DEPENDENCIA_INDISPONIVEL' : 'OPERACAO_RECUSADA',
      mensagem: status === 503
        ? 'Dependência indisponível ou operação concorrente; tente novamente.'
        : 'Não foi possível concluir a operação.',
      correlation_id: request.id,
    });
  });

  app.get('/health', async () => ({
    status: 'ok',
    servico: 'usuarios',
    modo: 'demo',
  }));

  app.get('/ready', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'indisponivel' });
    }
  });

  // RF01: Verificação de matrícula de discente (usada pela tela CadastroForm.jsx -> GET /matriculas/:numero).
  app.get('/matriculas/:numero', {
    schema: {
      params: {
        type: 'object',
        required: ['numero'],
        additionalProperties: false,
        properties: { numero: { type: 'string', minLength: 1, maxLength: 20 } },
      },
    },
  }, async (request) => directory.lookupEnrollment(request.params.numero));

  // RF01: Cadastro de discente ou funcionário (usado pela tela CadastroForm.jsx -> POST /auth/cadastro).
  app.post('/auth/cadastro', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['perfil', 'nome', 'matricula', 'unidade', 'email', 'senha'],
        properties: {
          usuario_id: uuid,
          perfil: { type: 'string', enum: ['discente', 'funcionario'] },
          nome: { type: 'string', minLength: 1, maxLength: 120 },
          matricula: { type: 'string', minLength: 1, maxLength: 30 },
          unidade: { type: 'string', minLength: 1, maxLength: 100 },
          email: { type: 'string', minLength: 1, maxLength: 120 },
          telefone: { type: ['string', 'null'], maxLength: 30 },
          senha: { type: 'string', minLength: 1, maxLength: 128 },
        },
      },
    },
  }, async (request, reply) => {
    const input = normalizeRegistrationInput(request.body);
    const { usuario, token } = await repository.register(input);
    return reply.code(201).send({
      usuario,
      token,
      precisaConfirmarEmail: false,
    });
  });

  // RF01: Autenticação de usuário (usado pela tela LoginForm.jsx -> POST /auth/login).
  app.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['email', 'senha'],
        properties: {
          perfil: { type: 'string', enum: ['discente', 'funcionario'] },
          email: { type: 'string', minLength: 5, maxLength: 120 },
          senha: { type: 'string', minLength: 1, maxLength: 128 },
        },
      },
    },
  }, async (request) => {
    const credentials = normalizeLoginInput(request.body);
    return repository.login(credentials);
  });

  // RF01: Encerramento de sessão (usado pelo App.jsx -> POST /auth/logout).
  app.post('/auth/logout', async (request, reply) => {
    const rawToken = extractBearerToken(request.headers.authorization);
    if (rawToken && !directory.matchDemoToken(rawToken)) {
      await repository.revokeSessionToken(rawToken);
    }
    return reply.code(204).send();
  });

  app.register(async (authenticated) => {
    authenticated.addHook('preHandler', async (request) => {
      const rawToken = extractBearerToken(request.headers.authorization);
      if (!rawToken) {
        throw new ServiceError(401, 'NAO_AUTENTICADO', 'Token de autenticação ausente ou inválido.');
      }
      const demoActor = directory.matchDemoToken(rawToken);
      if (demoActor) {
        request.actor = demoActor;
        return;
      }
      const sessionActor = await repository.findBySessionToken(rawToken);
      if (!sessionActor) {
        throw new ServiceError(401, 'NAO_AUTENTICADO', 'Sessão expirada ou token inválido.');
      }
      request.actor = sessionActor;
    });

    // Identidade autenticada do token (usada pelos demais serviços para resolver request.actor).
    authenticated.get('/auth/me', async (request) => request.actor);

    // Busca de discentes ativos por nome ou matrícula (usada pela tela Participantes.jsx -> buscarDiscentes).
    authenticated.get('/discentes', {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            termo: { type: 'string', maxLength: 80, default: '' },
            limite: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
        },
      },
    }, async (request) => {
      const { termo, limite, offset } = request.query;
      const discentes = await repository.searchStudents({ termo, limit: limite, offset });
      return { discentes, limite, offset };
    });

    // Validação em lote de participantes discentes (usada pelo serviço de Reservas -> validateStudents).
    authenticated.post('/discentes/validacao', {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['discente_ids'],
          properties: {
            discente_ids: {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              items: uuid,
            },
          },
        },
      },
    }, async (request) => {
      const discentes = await repository.validateStudents(request.body.discente_ids);
      return { validos: true, discentes };
    });

    // Consulta de usuário por ID (usada para identificar nome e matrícula do responsável em Chaves/Gestão).
    authenticated.get('/usuarios/:id', { schema: { params } }, async (request) =>
      repository.read(request.params.id.toLowerCase()));
  });

  return app;
}


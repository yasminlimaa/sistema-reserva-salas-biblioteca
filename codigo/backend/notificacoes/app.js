import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { createRepository } from './repository.js';
import { ServiceError } from './domain.js';

const uuid = { type: 'string', format: 'uuid' };
const params = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: uuid },
};

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
        mensagem: 'Parâmetros inválidos. Confira o contrato da API de Notificações.',
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
    request.log.error({ code: error.code || 'ERRO_INTERNO' }, 'Falha na operação de Notificações');
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
    servico: 'notificacoes',
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

  app.register(async (authenticated) => {
    authenticated.addHook('preHandler', async (request) => {
      request.actor = await directory.authenticate(request.headers.authorization);
    });

    const listQuerystring = {
      type: 'object',
      additionalProperties: false,
      properties: {
        nao_lidos: { type: 'boolean', default: false },
        limite: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      },
    };

    async function handleList(request) {
      const { nao_lidos: apenasNaoLidos, limite, offset } = request.query;
      const avisos = await repository.listForUser(request.actor.id, {
        apenasNaoLidos,
        limit: limite,
        offset,
      });
      return { avisos, limite, offset };
    }

    // RF09: Lista avisos recentes do responsável autenticado (usado pela tela Inicio.jsx -> listarAvisos).
    authenticated.get('/avisos', { schema: { querystring: listQuerystring } }, handleList);
    authenticated.get('/notificacoes', { schema: { querystring: listQuerystring } }, handleList);

    // RF09: Contagem de avisos não lidos (usada pelo App.jsx e MenuLateral.jsx -> contarAvisosNaoLidos).
    async function handleUnreadCount(request) {
      const total = await repository.countUnread(request.actor.id);
      return { nao_lidos: total, naoLidos: total };
    }

    authenticated.get('/avisos/nao-lidos/contagem', handleUnreadCount);
    authenticated.get('/notificacoes/nao-lidas/contagem', handleUnreadCount);

    // Marca um aviso individual como lido de forma idempotente.
    authenticated.post('/avisos/:id/leitura', { schema: { params } }, async (request) =>
      repository.markAsRead(request.params.id.toLowerCase(), request.actor));

    // Marca todos os avisos do usuário autenticado como lidos.
    authenticated.post('/avisos/leitura-todos', async (request) =>
      repository.markAllAsRead(request.actor.id));
  });

  return app;
}


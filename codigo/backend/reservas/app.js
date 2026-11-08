import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { createRepository } from './repository.js';
import { ServiceError, validateInterval, validateParticipants } from './domain.js';

const uuid = { type: 'string', format: 'uuid' };
const params = { type: 'object', required: ['id'], additionalProperties: false, properties: { id: uuid } };

export function buildApp({ pool, directory, logger = false }) {
  const app = Fastify({
    logger, bodyLimit: 16_384, genReqId: () => randomUUID(),
    ajv: { customOptions: { removeAdditional: false } },
  });
  const repository = createRepository(pool);

  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({ codigo: 'ENTRADA_INVALIDA', mensagem: 'Parâmetros inválidos. Confira o contrato da API.', correlation_id: request.id });
    }
    if (error instanceof ServiceError) {
      return reply.code(error.statusCode).send({ codigo: error.code, mensagem: error.message, correlation_id: request.id });
    }
    const status = ['23503', '23514', '23505'].includes(error.code) ? 422
      : ['55P03', '40P01', '40001', 'ECONNREFUSED', 'ENOTFOUND', '57P01'].includes(error.code) ? 503
      : error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    request.log.error({ code: error.code || 'ERRO_INTERNO' }, 'Falha na operação de Reservas');
    return reply.code(status).send({
      codigo: status === 503 ? 'DEPENDENCIA_INDISPONIVEL' : 'OPERACAO_RECUSADA',
      mensagem: status === 503 ? 'Dependência indisponível ou operação concorrente; tente novamente.' : 'Não foi possível concluir a operação.',
      correlation_id: request.id,
    });
  });

  app.get('/health', async () => ({ status: 'ok', modo: 'demo', dependencias: 'usuarios-e-salas-ficticios' }));
  app.get('/ready', async (_request, reply) => {
    try { await pool.query('SELECT 1'); return { status: 'ok' }; }
    catch { return reply.code(503).send({ status: 'indisponivel' }); }
  });

  app.register(async (authenticated) => {
    authenticated.addHook('preHandler', async (request) => {
      request.actor = await directory.authenticate(request.headers.authorization);
    });

    authenticated.get('/demo/catalogo', async (request) => ({
      modo: 'demo', usuario: request.actor, ...directory.catalog,
    }));

    authenticated.get('/disponibilidade', {
      schema: { querystring: { type: 'object', additionalProperties: false,
        required: ['sala_id', 'inicio', 'fim'], properties: {
          sala_id: uuid, inicio: { type: 'string', format: 'date-time' }, fim: { type: 'string', format: 'date-time' },
        } } },
    }, async (request) => {
      const { sala_id, inicio, fim } = request.query;
      validateInterval(inicio, fim);
      await directory.validateRoom(sala_id);
      return { sala_id, inicio, fim, disponivel: await repository.available(sala_id, inicio, fim),
        aviso: 'Consulta de sala não garante criação nem valida conflitos dos participantes.' };
    });

    authenticated.post('/reservas', {
      schema: { body: {
        type: 'object', additionalProperties: false,
        required: ['sala_id', 'inicio', 'fim', 'participante_ids'],
        properties: {
          sala_id: uuid, inicio: { type: 'string', format: 'date-time' },
          fim: { type: 'string', format: 'date-time' },
          participante_ids: { type: 'array', minItems: 3, uniqueItems: true, items: uuid },
        },
      } },
    }, async (request, reply) => {
      if (request.actor.perfil !== 'discente') throw new ServiceError(403, 'PERFIL_INVALIDO', 'A criação deve ser feita pelo discente responsável.');
      const input = { ...request.body, sala_id: request.body.sala_id.toLowerCase(),
        participante_ids: request.body.participante_ids.map((id) => id.toLowerCase()) };
      validateInterval(input.inicio, input.fim);
      validateParticipants(input.participante_ids, request.actor.id);
      await directory.validateRoom(input.sala_id);
      await directory.validateStudents(input.participante_ids);
      const reservation = await repository.create(input, request.actor.id, request.id);
      return reply.code(201).header('location', `/reservas/${reservation.reserva_id}`).send(reservation);
    });

    authenticated.get('/reservas', {
      schema: { querystring: {
        type: 'object', additionalProperties: false,
        properties: { sala_id: uuid, limite: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'integer', minimum: 0, default: 0 } },
      } },
    }, async (request) => ({
      reservas: await repository.list(request.actor, request.query.sala_id, request.query.limite, request.query.offset),
      limite: request.query.limite, offset: request.query.offset,
    }));

    authenticated.get('/reservas/:id', { schema: { params } }, async (request) => {
      const reservation = await repository.read(request.params.id);
      if (request.actor.perfil !== 'funcionario' && !reservation.participante_ids.includes(request.actor.id)) {
        throw new ServiceError(403, 'CONSULTA_NAO_AUTORIZADA', 'Você não participa desta reserva.');
      }
      return reservation;
    });

    authenticated.post('/reservas/:id/cancelamento', { schema: { params } }, async (request) =>
      repository.cancel(request.params.id, request.actor, request.id));
  });

  return app;
}

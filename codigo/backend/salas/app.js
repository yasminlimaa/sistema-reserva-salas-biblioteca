import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { createRepository } from './repository.js';
import {
  ServiceError,
  normalizeRoomInput,
  normalizeRoomPatch,
  validateInterval,
} from './domain.js';

const uuid = { type: 'string', format: 'uuid' };
const params = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: uuid },
};

function ensureEmployee(actor, message) {
  if (actor.perfil !== 'funcionario') {
    throw new ServiceError(403, 'PERFIL_INVALIDO', message);
  }
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
        mensagem: 'Parâmetros inválidos. Confira o contrato da API de Salas.',
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
    request.log.error({ code: error.code || 'ERRO_INTERNO' }, 'Falha na operação de Salas');
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
    servico: 'salas',
    modo: 'demo',
    dependencias: 'usuarios-ficticios-reservas-http',
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

    // RF02: Cadastro de nova sala (exclusivo para funcionários).
    authenticated.post('/salas', {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['nome', 'capacidade'],
          properties: {
            sala_id: uuid,
            nome: { type: 'string', minLength: 1, maxLength: 80 },
            capacidade: { type: 'integer', minimum: 3, maximum: 50 },
            bloco: { type: ['string', 'null'], maxLength: 60 },
            equipamentos: {
              type: 'array',
              maxItems: 20,
              items: { type: 'string', minLength: 1, maxLength: 60 },
            },
            ativa: { type: 'boolean' },
          },
        },
      },
    }, async (request, reply) => {
      ensureEmployee(request.actor, 'Apenas funcionários podem cadastrar salas.');
      const input = normalizeRoomInput(request.body);
      const room = await repository.create(input);
      return reply.code(201).header('location', `/salas/${room.sala_id}`).send(room);
    });

    // RF02: Listagem de salas com filtros opcionais de estado (ativa) e capacidade mínima.
    authenticated.get('/salas', {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ativa: { type: 'boolean' },
            capacidade_minima: { type: 'integer', minimum: 1, maximum: 50 },
            limite: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
        },
      },
    }, async (request) => {
      const { ativa, capacidade_minima: capacidadeMinima, limite, offset } = request.query;
      const salas = await repository.list({
        ativa,
        capacidadeMinima,
        limit: limite,
        offset,
      });
      return { salas, limite, offset };
    });

    // RF02: Consulta individual de sala por UUID (usada também pelo serviço de Reservas na validação).
    authenticated.get('/salas/:id', { schema: { params } }, async (request) =>
      repository.read(request.params.id.toLowerCase()));

    // RF02: Gerenciamento/atualização dos dados cadastrais da sala (exclusivo para funcionários).
    authenticated.patch('/salas/:id', {
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: {
            nome: { type: 'string', minLength: 1, maxLength: 80 },
            capacidade: { type: 'integer', minimum: 3, maximum: 50 },
            bloco: { type: ['string', 'null'], maxLength: 60 },
            equipamentos: {
              type: 'array',
              maxItems: 20,
              items: { type: 'string', minLength: 1, maxLength: 60 },
            },
          },
        },
      },
    }, async (request) => {
      ensureEmployee(request.actor, 'Apenas funcionários podem gerenciar salas.');
      const patch = normalizeRoomPatch(request.body);
      return repository.update(request.params.id.toLowerCase(), patch);
    });

    // RF02: Ativação idempotente de sala (exclusivo para funcionários).
    authenticated.post('/salas/:id/ativacao', { schema: { params } }, async (request) => {
      ensureEmployee(request.actor, 'Apenas funcionários podem ativar salas.');
      return repository.setActive(request.params.id.toLowerCase(), true);
    });

    // RF02: Desativação idempotente de sala (exclusivo para funcionários).
    authenticated.post('/salas/:id/desativacao', { schema: { params } }, async (request) => {
      ensureEmployee(request.actor, 'Apenas funcionários podem desativar salas.');
      return repository.setActive(request.params.id.toLowerCase(), false);
    });

    // Função auxiliar que combina o estado cadastral em Salas com a ocupação em Reservas.
    async function consultRoomAvailability(salaId, inicio, fim, authorization) {
      validateInterval(inicio, fim);
      const room = await repository.read(salaId);
      if (!room.ativa) {
        return {
          sala_id: room.sala_id,
          nome: room.nome,
          capacidade: room.capacidade,
          ativa: false,
          inicio,
          fim,
          disponivel: false,
          motivo: 'SALA_INATIVA',
          aviso: 'A sala encontra-se desativada e não pode receber reservas.',
        };
      }
      const occupation = await directory.checkAvailability({
        salaId: room.sala_id,
        inicio,
        fim,
        authorization,
      });
      return {
        sala_id: room.sala_id,
        nome: room.nome,
        capacidade: room.capacidade,
        ativa: true,
        inicio,
        fim,
        disponivel: occupation.disponivel,
        aviso: occupation.aviso,
      };
    }

    // RF03: Consulta de disponibilidade da sala no intervalo [inicio, fim), integrada ao serviço de Reservas.
    authenticated.get('/salas/:id/disponibilidade', {
      schema: {
        params,
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['inicio', 'fim'],
          properties: {
            inicio: { type: 'string', format: 'date-time' },
            fim: { type: 'string', format: 'date-time' },
          },
        },
      },
    }, async (request) =>
      consultRoomAvailability(
        request.params.id.toLowerCase(),
        request.query.inicio,
        request.query.fim,
        request.headers.authorization,
      ));

    // Rota equivalente por querystring (?sala_id=UUID&inicio=ISO&fim=ISO) para simetria de contrato.
    authenticated.get('/disponibilidade', {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['sala_id', 'inicio', 'fim'],
          properties: {
            sala_id: uuid,
            inicio: { type: 'string', format: 'date-time' },
            fim: { type: 'string', format: 'date-time' },
          },
        },
      },
    }, async (request) =>
      consultRoomAvailability(
        request.query.sala_id.toLowerCase(),
        request.query.inicio,
        request.query.fim,
        request.headers.authorization,
      ));
  });

  return app;
}


import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { createRepository } from './repository.js';
import {
  ServiceError,
  computeKeyState,
  formatHourInLibraryTz,
  formatMovementItem,
  todayInLibraryTz,
  validateDateParam,
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
        mensagem: 'Parâmetros inválidos. Confira o contrato da API de Chaves.',
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
    request.log.error({ code: error.code || 'ERRO_INTERNO' }, 'Falha na operação de Chaves');
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
    servico: 'chaves',
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

    // RF10: Registro de retirada da chave pelo responsável da reserva (exclusivo para funcionários).
    authenticated.post('/chaves/reservas/:id/retirada', {
      schema: { params },
    }, async (request, reply) => {
      ensureEmployee(request.actor, 'Apenas funcionários da recepção podem registrar retirada de chaves.');
      const body = request.body || {};
      if (typeof body !== 'object' || Array.isArray(body)) {
        throw new ServiceError(400, 'ENTRADA_INVALIDA', 'Corpo da requisição inválido.');
      }
      const reservationId = request.params.id.toLowerCase();
      const reservation = await directory.getReservation(reservationId);
      const state = await repository.withdraw({
        reservation,
        actor: request.actor,
        operadorNome: typeof body.operador === 'string' ? body.operador : undefined,
      });
      return reply.code(201).send(state);
    });

    // RF11: Registro de devolução da chave com identificação de atraso (exclusivo para funcionários).
    authenticated.post('/chaves/reservas/:id/devolucao', {
      schema: { params },
    }, async (request) => {
      ensureEmployee(request.actor, 'Apenas funcionários da recepção podem registrar devolução de chaves.');
      const body = request.body || {};
      if (typeof body !== 'object' || Array.isArray(body)) {
        throw new ServiceError(400, 'ENTRADA_INVALIDA', 'Corpo da requisição inválido.');
      }
      const reservationId = request.params.id.toLowerCase();
      return repository.returnKey({
        reservationId,
        actor: request.actor,
        operadorNome: typeof body.operador === 'string' ? body.operador : undefined,
        comAtrasoForcado: Boolean(body.com_atraso),
        observacao: typeof body.observacao === 'string' ? body.observacao : null,
      });
    });

    // RF12: Situação e histórico de movimentações da chave de uma reserva (usado em Gestão e no Modal de Histórico).
    authenticated.get('/chaves/reservas/:id', { schema: { params } }, async (request) => {
      const reservationId = request.params.id.toLowerCase();
      return repository.getStatusForReservation(reservationId);
    });

    authenticated.get('/chaves/reservas/:id/historico', { schema: { params } }, async (request) => {
      const reservationId = request.params.id.toLowerCase();
      return repository.getStatusForReservation(reservationId);
    });

    // RF10–RF12: Painel completo do claviculário do dia (atende diretamente a tela ServicoChaves.jsx).
    authenticated.get('/chaves/dia', {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            data: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            busca: { type: 'string', maxLength: 80, default: '' },
          },
        },
      },
    }, async (request) => {
      ensureEmployee(request.actor, 'A tela de Serviço de Chaves é de uso exclusivo para funcionários da recepção.');
      const dataAlvo = request.query.data ? validateDateParam(request.query.data) : todayInLibraryTz();
      const termoBusca = (request.query.busca || '').trim().toLowerCase();

      const [rooms, reservations] = await Promise.all([
        directory.listRooms(),
        directory.listReservationsByDate(dataAlvo),
      ]);

      const reservationIds = reservations.map((r) => r.reserva_id);
      const { deliveries, movementsByReservation } = await repository.listDeliveriesForReservations(reservationIds);
      const now = new Date();

      const items = await Promise.all(rooms.map(async (sala) => {
        const roomId = sala.sala_id || sala.id;
        const reserva = reservations.find((r) => r.sala_id === roomId);

        if (reserva) {
          const delivery = deliveries.get(reserva.reserva_id) || null;
          const movements = movementsByReservation.get(reserva.reserva_id) || [];
          const responsavelUser = await directory.resolveResponsible(reserva.responsavel_id);
          const inicioHora = formatHourInLibraryTz(reserva.inicio);
          const fimHora = formatHourInLibraryTz(reserva.fim);
          const keyState = computeKeyState(delivery, reserva.fim, now);
          const participantCount = Array.isArray(reserva.participante_ids) ? reserva.participante_ids.length : 3;

          const baseHistory = [{
            acao: 'Chave na recepção (Aguardando retirada)',
            horario: inicioHora,
            operador: 'Sistema',
          }];

          return {
            id: reserva.reserva_id,
            reservaId: reserva.reserva_id,
            salaId: roomId,
            sala: sala.nome,
            horario: `${inicioHora} – ${fimHora}`,
            horarioFim: fimHora,
            responsavel: responsavelUser.nome || 'Discente Responsável',
            matricula: responsavelUser.matricula || '---',
            grupo: `${participantCount} discentes`,
            status: keyState.status,
            atrasoMinutos: keyState.atrasoMinutos,
            historico: [...baseHistory, ...movements.map(formatMovementItem)],
            temReserva: true,
            emManutencao: !sala.ativa,
          };
        }

        return {
          id: `livre-${roomId}`,
          reservaId: null,
          salaId: roomId,
          sala: sala.nome,
          horario: 'Sem reserva neste dia',
          horarioFim: null,
          responsavel: !sala.ativa ? 'Em manutenção' : 'Disponível no claviculário',
          matricula: '—',
          grupo: '—',
          status: 'na-recepcao',
          atrasoMinutos: 0,
          historico: [{
            acao: 'Chave disponível na recepção',
            horario: '08:00',
            operador: 'Sistema',
          }],
          temReserva: false,
          emManutencao: !sala.ativa,
        };
      }));

      const chavesFiltradas = termoBusca
        ? items.filter((item) =>
            item.matricula.toLowerCase().includes(termoBusca)
            || item.responsavel.toLowerCase().includes(termoBusca)
            || item.sala.toLowerCase().includes(termoBusca))
        : items;

      const resumo = {
        na_recepcao: items.filter((c) => c.status === 'na-recepcao' || c.status === 'devolvida').length,
        retiradas: items.filter((c) => c.status === 'retirada').length,
        atrasadas: items.filter((c) => c.status === 'atrasada').length,
        reservas_dia: items.filter((c) => c.temReserva).length,
      };

      return { data: dataAlvo, resumo, chaves: chavesFiltradas };
    });
  });

  return app;
}


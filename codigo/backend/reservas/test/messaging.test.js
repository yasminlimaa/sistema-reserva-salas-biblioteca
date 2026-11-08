import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setImmediate as nextTurn } from 'node:timers/promises';
import test from 'node:test';
import amqp from 'amqplib';
import { createPublisher } from '../messaging.js';

const payload = { event_id: 'evento-ficticio', event_type: 'reserva.confirmada' };

function connectionFixture({ stalledConfirm = false, stalledClose = false } = {}) {
  const connection = new EventEmitter();
  const channel = new EventEmitter();
  const sent = [];
  const stream = { destroyed: false, destroy() { this.destroyed = true; } };
  connection.connection = { stream };
  connection.createConfirmChannel = async () => channel;
  connection.close = channel.close = () => stalledClose ? new Promise(() => {}) : Promise.resolve();
  channel.assertExchange = channel.assertQueue = channel.bindQueue = async () => {};
  channel.publish = (_exchange, _key, _body, options, confirm) => {
    sent.push(options.messageId);
    if (!stalledConfirm) queueMicrotask(() => confirm(null));
    return true;
  };
  return { connection, stream, sent };
}

test('timeout de publicação termina mesmo se o broker não responder ao fechamento', { timeout: 2000 }, async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fixture = connectionFixture({ stalledConfirm: true, stalledClose: true });
  t.mock.method(amqp, 'connect', async () => fixture.connection);
  const publisher = createPublisher('amqp://ficticio');
  const rejected = assert.rejects(publisher.publish(payload), /BROKER_INDISPONIVEL_OU_SEM_CONFIRMACAO/);
  await nextTurn();
  t.mock.timers.tick(10_000);
  await nextTurn();
  t.mock.timers.tick(1000);
  await nextTurn();
  assert.equal(fixture.stream.destroyed, true);
  await rejected;
});

test('close do worker é limitado e o publicador consegue reconectar depois', { timeout: 2000 }, async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const first = connectionFixture({ stalledClose: true });
  const second = connectionFixture();
  let calls = 0;
  t.mock.method(amqp, 'connect', async () => (++calls === 1 ? first : second).connection);
  const publisher = createPublisher('amqp://ficticio');
  await publisher.publish(payload);
  const closing = publisher.close();
  await nextTurn();
  t.mock.timers.tick(1000);
  await nextTurn();
  assert.equal(first.stream.destroyed, true);
  await closing;
  await publisher.publish({ ...payload, event_id: 'segundo-evento' });
  assert.deepEqual(second.sent, ['segundo-evento']);
  await publisher.close();
  assert.equal(second.stream.destroyed, false);
});

test('conexão que abre depois do timeout é encerrada sem afetar a conexão nova', { timeout: 2000 }, async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const late = connectionFixture({ stalledClose: true });
  const current = connectionFixture();
  let releaseLate;
  let calls = 0;
  t.mock.method(amqp, 'connect', () => ++calls === 1
    ? new Promise((resolve) => { releaseLate = resolve; }) : Promise.resolve(current.connection));
  const publisher = createPublisher('amqp://ficticio');
  const rejected = assert.rejects(publisher.publish(payload), /BROKER_INDISPONIVEL_OU_SEM_CONFIRMACAO/);
  await nextTurn();
  t.mock.timers.tick(10_000);
  await rejected;
  await publisher.publish({ ...payload, event_id: 'evento-atual' });
  releaseLate(late.connection);
  await nextTurn();
  t.mock.timers.tick(1000);
  await nextTurn();
  assert.equal(late.stream.destroyed, true);
  assert.equal(current.stream.destroyed, false);
  assert.deepEqual(late.sent, []);
  assert.deepEqual(current.sent, ['evento-atual']);
  await publisher.close();
});

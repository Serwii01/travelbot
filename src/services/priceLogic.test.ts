import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAlert } from './priceLogic.js';
import type { Alert } from '../models/types.js';

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'abc123',
    chatId: 1,
    origin: 'MAD',
    destination: 'PRG',
    departRange: { from: '2099-01-01', to: '2099-01-01' },
    returnRange: null,
    directOnly: false,
    currency: 'EUR',
    targetPrice: 120,
    lastSeenPrice: null,
    lastNotifiedPrice: null,
    minSeenPrice: null,
    lastDeal: null,
    status: 'active',
    createdAt: 'now',
    updatedAt: 'now',
    ...overrides,
  };
}

test('primera vez por debajo del objetivo: notifica (below_target)', () => {
  const r = evaluateAlert(makeAlert(), 89);
  assert.equal(r.notify, true);
  assert.equal(r.reason, 'below_target');
});

test('primera vez por encima del objetivo: no notifica', () => {
  assert.equal(evaluateAlert(makeAlert(), 200).notify, false);
});

test('bajada sin estar bajo objetivo: notifica (drop) con delta', () => {
  const r = evaluateAlert(makeAlert({ targetPrice: 80, lastSeenPrice: 100 }), 90);
  assert.equal(r.notify, true);
  assert.equal(r.reason, 'drop');
  assert.equal(r.dropFromLastSeen, 10);
});

test('mismo precio ya notificado: no repite (dedupe)', () => {
  assert.equal(evaluateAlert(makeAlert({ lastSeenPrice: 90, lastNotifiedPrice: 90 }), 90).notify, false);
});

test('nuevo minimo por debajo de lo ya notificado: notifica', () => {
  assert.equal(evaluateAlert(makeAlert({ lastSeenPrice: 90, lastNotifiedPrice: 90 }), 85).notify, true);
});

test('precio sube respecto a lo notificado: no notifica', () => {
  assert.equal(evaluateAlert(makeAlert({ lastSeenPrice: 90, lastNotifiedPrice: 90 }), 95).notify, false);
});

test('umbral: bajada pequena por encima del objetivo no notifica', () => {
  const r = evaluateAlert(makeAlert({ targetPrice: 80, lastSeenPrice: 200 }), 196, 3);
  assert.equal(r.notify, false);
});

test('umbral: bajada suficiente notifica', () => {
  const r = evaluateAlert(makeAlert({ targetPrice: 80, lastSeenPrice: 200 }), 190, 3);
  assert.equal(r.notify, true);
});

test('umbral: bajo objetivo pero apenas mas barato que lo notificado no repite', () => {
  const r = evaluateAlert(makeAlert({ lastSeenPrice: 100, lastNotifiedPrice: 100 }), 99, 3);
  assert.equal(r.notify, false);
});

test('minimo historico', () => {
  assert.equal(evaluateAlert(makeAlert({ minSeenPrice: 100 }), 95).historicLow, true);
  assert.equal(evaluateAlert(makeAlert({ minSeenPrice: 100 }), 105).historicLow, false);
  assert.equal(evaluateAlert(makeAlert(), 95).historicLow, false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAlert } from './priceLogic';
import type { Alert } from '../models/types';

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'abc123',
    chatId: 1,
    origin: 'MAD',
    destination: 'PRG',
    date: '2099-01-01',
    currency: 'EUR',
    targetPrice: 120,
    lastSeenPrice: null,
    lastNotifiedPrice: null,
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
  const r = evaluateAlert(makeAlert(), 200);
  assert.equal(r.notify, false);
});

test('bajada sin estar bajo objetivo: notifica (drop) con delta', () => {
  const r = evaluateAlert(makeAlert({ targetPrice: 80, lastSeenPrice: 100 }), 90);
  assert.equal(r.notify, true);
  assert.equal(r.reason, 'drop');
  assert.equal(r.dropFromLastSeen, 10);
});

test('mismo precio ya notificado: no repite (dedupe)', () => {
  const r = evaluateAlert(makeAlert({ lastSeenPrice: 90, lastNotifiedPrice: 90 }), 90);
  assert.equal(r.notify, false);
});

test('nuevo minimo por debajo de lo ya notificado: notifica', () => {
  const r = evaluateAlert(makeAlert({ lastSeenPrice: 90, lastNotifiedPrice: 90 }), 85);
  assert.equal(r.notify, true);
});

test('precio sube respecto a lo notificado: no notifica', () => {
  const r = evaluateAlert(makeAlert({ lastSeenPrice: 90, lastNotifiedPrice: 90 }), 95);
  assert.equal(r.notify, false);
});

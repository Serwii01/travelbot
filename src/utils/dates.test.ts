import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthsOf, parseDateSpec } from './dates.js';

const TODAY = '2026-08-10';

test('parseDateSpec: fecha exacta', () => {
  assert.deepEqual(parseDateSpec('2026-08-20', TODAY), { ok: true, value: { from: '2026-08-20', to: '2026-08-20' } });
});

test('parseDateSpec: mes, recortando dias pasados', () => {
  assert.deepEqual(parseDateSpec('2026-08', TODAY), { ok: true, value: { from: '2026-08-10', to: '2026-08-31' } });
});

test('parseDateSpec: febrero bisiesto', () => {
  assert.deepEqual(parseDateSpec('2028-02', TODAY), { ok: true, value: { from: '2028-02-01', to: '2028-02-29' } });
});

test('parseDateSpec: rango valido y errores', () => {
  assert.equal(parseDateSpec('2026-08-15..2026-08-25', TODAY).ok, true);
  assert.equal(parseDateSpec('2026-08-25..2026-08-15', TODAY).ok, false);
  assert.equal(parseDateSpec('2026-08-15..2026-10-15', TODAY).ok, false);
  assert.equal(parseDateSpec('2026-07', TODAY).ok, false);
  assert.equal(parseDateSpec('2026-13', TODAY).ok, false);
  assert.equal(parseDateSpec('20/08/2026', TODAY).ok, false);
});

test('monthsOf: cruza de ano', () => {
  assert.deepEqual(monthsOf({ from: '2026-12-20', to: '2027-01-10' }), ['2026-12', '2027-01']);
  assert.deepEqual(monthsOf({ from: '2026-08-01', to: '2026-08-31' }), ['2026-08']);
});

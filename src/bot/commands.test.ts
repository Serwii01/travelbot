import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, parseAddArgs } from './commands.js';

const TODAY = '2026-06-01';

test('parseCommand: extrae nombre y argumentos', () => {
  assert.deepEqual(parseCommand('/add MAD PRG 2099-01-01 120'), {
    name: 'add',
    args: ['MAD', 'PRG', '2099-01-01', '120'],
  });
});

test('parseCommand: minusculas y sufijo @bot', () => {
  assert.deepEqual(parseCommand('/List@MyBot'), { name: 'list', args: [] });
});

test('parseCommand: texto sin slash devuelve null', () => {
  assert.equal(parseCommand('hola'), null);
});

test('parseAddArgs: solo ida, normaliza a mayusculas y redondea precio', () => {
  const r = parseAddArgs(['mad', 'prg', '2026-08-20', '120.6'], TODAY);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.value, {
      origin: 'MAD',
      destination: 'PRG',
      departRange: { from: '2026-08-20', to: '2026-08-20' },
      returnRange: null,
      directOnly: false,
      targetPrice: 121,
    });
  }
});

test('parseAddArgs: ida y vuelta con rangos y directo', () => {
  const r = parseAddArgs(['MAD', 'PRG', '2026-08-15..2026-08-20', '2026-08-22..2026-08-27', '200', 'directo'], TODAY);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.value.departRange, { from: '2026-08-15', to: '2026-08-20' });
    assert.deepEqual(r.value.returnRange, { from: '2026-08-22', to: '2026-08-27' });
    assert.equal(r.value.directOnly, true);
    assert.equal(r.value.targetPrice, 200);
  }
});

test('parseAddArgs: mes completo', () => {
  const r = parseAddArgs(['MAD', 'LON', '2026-09', '150'], TODAY);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.value.departRange, { from: '2026-09-01', to: '2026-09-30' });
});

test('parseAddArgs: vuelta anterior a la ida rechazada', () => {
  const r = parseAddArgs(['MAD', 'PRG', '2026-08-20', '2026-08-10', '150'], TODAY);
  assert.equal(r.ok, false);
});

test('parseAddArgs: numero de argumentos incorrecto', () => {
  assert.equal(parseAddArgs(['MAD', 'PRG'], TODAY).ok, false);
});

test('parseAddArgs: IATA invalido', () => {
  assert.equal(parseAddArgs(['MADRID', 'PRG', '2026-08-20', '120'], TODAY).ok, false);
});

test('parseAddArgs: origen igual a destino', () => {
  assert.equal(parseAddArgs(['MAD', 'mad', '2026-08-20', '120'], TODAY).ok, false);
});

test('parseAddArgs: fecha pasada rechazada', () => {
  assert.equal(parseAddArgs(['MAD', 'PRG', '2000-01-01', '120'], TODAY).ok, false);
});

test('parseAddArgs: fecha mal formada rechazada', () => {
  assert.equal(parseAddArgs(['MAD', 'PRG', '2099-13-40', '120'], TODAY).ok, false);
});

test('parseAddArgs: precio no positivo rechazado', () => {
  assert.equal(parseAddArgs(['MAD', 'PRG', '2026-08-20', '-5'], TODAY).ok, false);
});

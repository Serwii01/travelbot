import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, parseAddArgs } from './commands';

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

test('parseAddArgs: caso valido normaliza a mayusculas y redondea precio', () => {
  const r = parseAddArgs(['mad', 'prg', '2099-01-01', '120.6']);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.value, {
      origin: 'MAD',
      destination: 'PRG',
      date: '2099-01-01',
      targetPrice: 121,
    });
  }
});

test('parseAddArgs: numero de argumentos incorrecto', () => {
  const r = parseAddArgs(['MAD', 'PRG']);
  assert.equal(r.ok, false);
});

test('parseAddArgs: IATA invalido', () => {
  const r = parseAddArgs(['MADRID', 'PRG', '2099-01-01', '120']);
  assert.equal(r.ok, false);
});

test('parseAddArgs: fecha pasada rechazada', () => {
  const r = parseAddArgs(['MAD', 'PRG', '2000-01-01', '120']);
  assert.equal(r.ok, false);
});

test('parseAddArgs: fecha mal formada rechazada', () => {
  const r = parseAddArgs(['MAD', 'PRG', '2099-13-40', '120']);
  assert.equal(r.ok, false);
});

test('parseAddArgs: precio no positivo rechazado', () => {
  const r = parseAddArgs(['MAD', 'PRG', '2099-01-01', '-5']);
  assert.equal(r.ok, false);
});

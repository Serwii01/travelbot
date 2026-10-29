import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, calendarKeyboard, monthsKeyboard } from './keyboards.js';
import { parsePlaces } from '../services/PlacesService.js';

const data = (b: { text: string } & Record<string, unknown>) => (b as { callback_data?: string }).callback_data;

test('addMonths: cruza de ano en ambos sentidos', () => {
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2027-01', -1), '2026-12');
});

test('calendario: empieza en lunes, desactiva dias fuera de rango y navega', () => {
  // Diciembre 2026 empieza en martes.
  const kb = calendarKeyboard('2026-12', { minDate: '2026-12-10', maxDate: '2027-12-10' });
  assert.equal(data(kb[0][0]), 'noop'); // sin "anterior": es el mes minimo
  assert.equal(data(kb[0][2]), 'c:n:2027-01');
  const firstWeek = kb[2];
  assert.equal(firstWeek[0].text, ' ');
  assert.equal(firstWeek[1].text, '·'); // dia 1, antes del minimo
  const days = kb.slice(2).flat().filter((b) => data(b)?.startsWith('c:p:'));
  assert.equal(days.length, 22); // del 10 al 31
  assert.equal(data(days[0]), 'c:p:2026-12-10');
  assert.ok(kb.slice(2).every((row) => row.length === 7));
});

test('calendario: marca el inicio de rango', () => {
  const kb = calendarKeyboard('2026-12', { minDate: '2026-12-01', maxDate: '2026-12-31', rangeStart: '2026-12-05' });
  assert.ok(kb.flat().some((b) => b.text === '[5]'));
});

test('meses: 12 botones de 3 en 3 desde el mes minimo', () => {
  const kb = monthsKeyboard('2026-11-20');
  assert.equal(kb.length, 4);
  assert.equal(data(kb[0][0]), 'c:M:2026-11');
  assert.equal(data(kb[3][2]), 'c:M:2027-10');
});

test('parsePlaces: ciudades primero, sin duplicados', () => {
  const places = parsePlaces([
    { type: 'airport', code: 'MAD', name: 'Barajas', city_name: 'Madrid', country_name: 'España' },
    { type: 'city', code: 'MAD', name: 'Madrid', country_name: 'España' },
    { type: 'airport', code: 'TOJ', name: 'Torrejón', city_name: 'Madrid', country_name: 'España' },
    { type: 'city', code: 'bad' },
  ]);
  assert.deepEqual(places, [
    { code: 'MAD', name: 'Madrid, España', isCity: true },
    { code: 'TOJ', name: 'Madrid · Torrejón, España', isCity: false },
  ]);
});

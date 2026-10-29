import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Place, WizardDraft } from '../models/types.js';
import { draftToAddArgs, newDraft, onCallback, onText, render, type Transition } from './wizard.js';

const TODAY = '2026-11-10';
const MAD: Place = { code: 'MAD', name: 'Madrid, España', isCity: true };
const PRG: Place = { code: 'PRG', name: 'Praga, Chequia', isCity: true };
const lookup = async (term: string): Promise<Place[]> =>
  term.toLowerCase().startsWith('mad') ? [MAD, { code: 'TOJ', name: 'Torrejón', isCity: false }] : term === 'praga' ? [PRG] : [];

function next(t: Transition): WizardDraft {
  assert.equal(t.kind, 'continue', JSON.stringify(t));
  return (t as { draft: WizardDraft }).draft;
}

test('flujo completo ida y vuelta con rango y mes', async () => {
  let d = newDraft();
  d = next(await onText(d, 'madr', lookup)); // ambiguo -> botones
  assert.equal(d.step, 'origin');
  assert.equal(d.options.length, 2);
  d = next(onCallback(d, 'w:o:MAD', TODAY));
  assert.equal(d.origin?.name, 'Madrid, España');
  d = next(await onText(d, 'praga', lookup)); // una opcion -> se elige sola
  assert.equal(d.step, 'trip');
  d = next(onCallback(d, 'w:t:rt', TODAY));
  d = next(onCallback(d, 'w:m:range', TODAY));
  d = next(onCallback(d, 'c:p:2026-12-03', TODAY));
  assert.equal(d.rangeStart, '2026-12-03');
  d = next(onCallback(d, 'c:p:2026-12-07', TODAY));
  assert.deepEqual(d.departRange, { from: '2026-12-03', to: '2026-12-07' });
  assert.equal(d.step, 'returnMode');
  d = next(onCallback(d, 'w:m:month', TODAY));
  d = next(onCallback(d, 'c:M:2026-12', TODAY));
  assert.deepEqual(d.returnRange, { from: '2026-12-03', to: '2026-12-31' });
  assert.equal(d.step, 'price');
  d = next(await onText(d, '150 €', lookup));
  d = next(onCallback(d, 'w:x:1', TODAY));
  assert.equal(d.step, 'confirm');
  assert.equal(onCallback(d, 'w:ok', TODAY).kind, 'done');

  assert.deepEqual(draftToAddArgs(d), {
    origin: 'MAD',
    destination: 'PRG',
    departRange: { from: '2026-12-03', to: '2026-12-07' },
    returnRange: { from: '2026-12-03', to: '2026-12-31' },
    directOnly: true,
    targetPrice: 150,
  });
});

test('solo ida con dia exacto salta la vuelta', async () => {
  let d: WizardDraft = { ...newDraft(), step: 'trip', history: ['origin', 'destination'], origin: MAD, destination: PRG };
  d = next(onCallback(d, 'w:t:ow', TODAY));
  d = next(onCallback(d, 'w:m:day', TODAY));
  d = next(onCallback(d, 'c:p:2026-11-20', TODAY));
  assert.equal(d.step, 'price');
  assert.deepEqual(d.departRange, { from: '2026-11-20', to: '2026-11-20' });
});

test('atras vuelve al paso anterior', async () => {
  let d = next(await onText(newDraft(), 'praga', lookup));
  assert.equal(d.step, 'destination');
  d = next(onCallback(d, 'w:back', TODAY));
  assert.equal(d.step, 'origin');
  assert.equal(onCallback(d, 'w:back', TODAY).kind, 'ignored');
});

test('dias pasados, botones viejos y textos invalidos', async () => {
  const pick: WizardDraft = { ...newDraft(), step: 'departPick', departMode: 'day', history: ['origin'] };
  assert.equal(onCallback(pick, 'c:p:2026-11-01', TODAY).kind, 'ignored');
  assert.equal(onCallback(pick, 'w:t:rt', TODAY).kind, 'ignored');

  const price: WizardDraft = { ...newDraft(), step: 'price' };
  const t = await onText(price, 'barato', lookup);
  assert.equal(t.kind, 'continue');
  assert.ok((t as { notice?: string }).notice);

  const none = await onText(newDraft(), 'zzzz', lookup);
  assert.ok((none as { notice?: string }).notice?.includes('No encuentro'));
});

test('nombre exacto (sin tildes) se elige solo aunque haya mas resultados', async () => {
  const fuzzy = async (): Promise<Place[]> => [
    { code: 'MLA', name: 'Malta, Malta', isCity: true },
    { code: 'MLG', name: 'Málaga, España', isCity: true },
  ];
  const d = next(await onText(newDraft(), 'malaga', fuzzy));
  assert.equal(d.origin?.code, 'MLG');
});

test('sin buscador disponible acepta codigos IATA', async () => {
  const failing = async () => {
    throw new Error('down');
  };
  const d = next(await onText(newDraft(), 'mad', failing));
  assert.equal(d.origin?.code, 'MAD');
});

test('destino igual al origen rechazado', () => {
  const d: WizardDraft = { ...newDraft(), step: 'destination', origin: MAD, options: [MAD] };
  assert.equal(onCallback(d, 'w:d:MAD', TODAY).kind, 'ignored');
});

test('cancelar y render con resumen', () => {
  const d: WizardDraft = { ...newDraft(), step: 'price', history: ['origin'], origin: MAD, destination: PRG };
  assert.equal(onCallback(d, 'w:cancel', TODAY).kind, 'cancel');
  const view = render(d, TODAY, 'EUR');
  assert.ok(view.text.includes('Madrid, España (MAD)'));
  assert.ok(view.text.includes('EUR'));
  assert.deepEqual(
    view.keyboard.at(-1)?.map((b) => b.text),
    ['◀ Atrás', '✖️ Cancelar'],
  );
});

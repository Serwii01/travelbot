import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TravelpayoutsFlightProvider, type TravelpayoutsTicket } from './TravelpayoutsFlightProvider.js';
import type { FlightQuery } from './FlightProvider.js';

function fakeFetch(tickets: TravelpayoutsTicket[]) {
  const calls: URL[] = [];
  const fn = (async (input: string | URL | Request) => {
    calls.push(new URL(String(input)));
    return new Response(JSON.stringify({ success: true, data: tickets }), { status: 200 });
  }) as typeof fetch;
  return { fn, calls };
}

const query = (overrides: Partial<FlightQuery> = {}): FlightQuery => ({
  origin: 'MAD',
  destination: 'PRG',
  departRange: { from: '2026-08-15', to: '2026-08-20' },
  returnRange: null,
  directOnly: false,
  currency: 'EUR',
  ...overrides,
});

test('rango: pide por mes y elige el mas barato dentro del rango', async () => {
  const { fn, calls } = fakeFetch([
    { price: 40, departure_at: '2026-08-02T10:00:00+02:00', transfers: 0, link: '/x' }, // fuera de rango
    { price: 75, departure_at: '2026-08-18T10:00:00+02:00', transfers: 1, airline: 'FR', link: '/search/MAD1808PRG1' },
    { price: 90, departure_at: '2026-08-16T10:00:00+02:00', transfers: 0, link: '/y' },
  ]);
  const p = new TravelpayoutsFlightProvider({ token: 't', marker: '123', fetchFn: fn });
  const r = await p.search(query());

  assert.equal(calls.length, 1);
  assert.equal(calls[0].searchParams.get('departure_at'), '2026-08');
  assert.equal(calls[0].searchParams.get('one_way'), 'true');
  assert.equal(r?.price, 75);
  assert.equal(r?.departDate, '2026-08-18');
  assert.equal(r?.airline, 'FR');
  assert.equal(r?.transfers, 1);
  assert.equal(r?.link, 'https://www.aviasales.com/search/MAD1808PRG1?marker=123');
});

test('fecha exacta: pide ese dia', async () => {
  const { fn, calls } = fakeFetch([]);
  const p = new TravelpayoutsFlightProvider({ token: 't', fetchFn: fn });
  const r = await p.search(query({ departRange: { from: '2026-08-15', to: '2026-08-15' } }));
  assert.equal(calls[0].searchParams.get('departure_at'), '2026-08-15');
  assert.equal(r, null);
});

test('ida y vuelta + directo: filtra vuelta fuera de rango y escalas', async () => {
  const { fn, calls } = fakeFetch([
    { price: 100, departure_at: '2026-08-15T08:00', return_at: '2026-08-30T08:00', transfers: 0, return_transfers: 0 },
    { price: 110, departure_at: '2026-08-15T08:00', return_at: '2026-08-22T08:00', transfers: 0, return_transfers: 1 },
    { price: 130, departure_at: '2026-08-16T08:00', return_at: '2026-08-23T08:00', transfers: 0, return_transfers: 0 },
  ]);
  const p = new TravelpayoutsFlightProvider({ token: 't', fetchFn: fn });
  const r = await p.search(
    query({ returnRange: { from: '2026-08-22', to: '2026-08-25' }, directOnly: true }),
  );
  assert.equal(calls[0].searchParams.get('one_way'), 'false');
  assert.equal(calls[0].searchParams.get('direct'), 'true');
  assert.equal(r?.price, 130);
  assert.equal(r?.returnDate, '2026-08-23');
  assert.equal(r?.transfers, 0);
});

test('cache: consultas que comparten mes no repiten llamada', async () => {
  const { fn, calls } = fakeFetch([{ price: 50, departure_at: '2026-08-18T10:00' }]);
  const p = new TravelpayoutsFlightProvider({ token: 't', fetchFn: fn });
  await p.search(query());
  await p.search(query({ departRange: { from: '2026-08-17', to: '2026-08-25' } }));
  assert.equal(calls.length, 1);
});

test('rango que cruza meses: una llamada por mes', async () => {
  const { fn, calls } = fakeFetch([]);
  const p = new TravelpayoutsFlightProvider({ token: 't', fetchFn: fn });
  await p.search(query({ departRange: { from: '2026-08-25', to: '2026-09-05' } }));
  assert.deepEqual(
    calls.map((c) => c.searchParams.get('departure_at')),
    ['2026-08', '2026-09'],
  );
});

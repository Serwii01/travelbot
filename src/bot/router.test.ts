import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AppState, Place } from '../models/types.js';
import type { InlineKeyboard, SendOptions, TelegramClient, TelegramUpdate } from '../services/TelegramClient.js';
import { AlertService } from '../services/AlertService.js';
import { processUpdate, type BotContext } from './router.js';
import { MENU } from './keyboards.js';

interface Sent {
  method: string;
  text?: string;
  keyboard?: InlineKeyboard;
  toast?: string;
}

function fakeTelegram() {
  const log: Sent[] = [];
  let nextId = 100;
  const tg = {
    sendMessage: async (_chat: number, text: string, opts: SendOptions = {}) => {
      log.push({ method: 'send', text, keyboard: opts.keyboard });
      return nextId++;
    },
    editMessageText: async (_c: number, _m: number, text: string, keyboard?: InlineKeyboard) => {
      log.push({ method: 'edit', text, keyboard });
    },
    editMessageReplyMarkup: async (_c: number, _m: number, keyboard: InlineKeyboard) => {
      log.push({ method: 'markup', keyboard });
    },
    answerCallbackQuery: async (_id: string, toast?: string) => {
      log.push({ method: 'answer', toast });
    },
  };
  return { tg: tg as unknown as TelegramClient, log };
}

const MAD: Place = { code: 'MAD', name: 'Madrid', isCity: true };
const PRG: Place = { code: 'PRG', name: 'Praga', isCity: true };

function setup() {
  const state: AppState = { alerts: [], users: {}, sessions: {}, telegram: { offset: 0 } };
  const { tg, log } = fakeTelegram();
  const checks: number[] = [];
  const ctx: BotContext = {
    telegram: tg,
    state,
    service: new AlertService(state, 'EUR'),
    places: async (t) => (t === 'madrid' ? [MAD] : [PRG]),
    requestCheck: (chatId) => checks.push(chatId),
  };
  let id = 1;
  const text = (t: string): TelegramUpdate => ({ update_id: id++, message: { message_id: id, chat: { id: 7 }, text: t } });
  const press = (data: string): TelegramUpdate => ({
    update_id: id++,
    callback_query: { id: `q${id}`, data, message: { message_id: 50, chat: { id: 7 } } },
  });
  return { ctx, log, checks, text, press, state };
}

test('crear una alerta solo con el menu, texto y botones', async () => {
  const { ctx, log, checks, text, press, state } = setup();
  for (const u of [
    text(MENU.add),
    text('madrid'),
    text('praga'),
    press('w:t:ow'),
    press('w:m:month'),
    press('c:M:2099-01'), // fuera de los 12 meses visibles pero valido para el parser
  ]) {
    await processUpdate(u, ctx);
  }
  // El mes no esta en el teclado, pero si es futuro se acepta igual.
  assert.equal(state.sessions['7']?.kind, 'wizard');
  await processUpdate(text('120'), ctx);
  await processUpdate(press('w:x:0'), ctx);
  await processUpdate(press('w:ok'), ctx);

  assert.equal(state.alerts.length, 1);
  const alert = state.alerts[0];
  assert.equal(alert.origin, 'MAD');
  assert.equal(alert.destination, 'PRG');
  assert.equal(alert.targetPrice, 120);
  assert.equal(alert.returnRange, null);
  assert.equal(state.sessions['7'], undefined);
  assert.deepEqual(checks, [7]);
  assert.ok(log.some((l) => l.text?.startsWith('✅ Alerta creada')));
  // Todos los botones pulsados se contestaron (sin "cargando" colgado).
  assert.equal(log.filter((l) => l.method === 'answer').length, 5);
});

test('gestionar una alerta: pausar, cambiar precio y borrar', async () => {
  const { ctx, log, text, press, state } = setup();
  const alert = ctx.service.addAlert(7, {
    origin: 'MAD',
    destination: 'PRG',
    departRange: { from: '2099-01-01', to: '2099-01-01' },
    returnRange: null,
    directOnly: false,
    targetPrice: 100,
    currency: 'EUR',
  });

  await processUpdate(text(MENU.list), ctx);
  assert.ok(log.at(-1)?.keyboard?.[0][0].text.includes('MAD→PRG'));

  await processUpdate(press(`a:p:${alert.id}`), ctx);
  assert.equal(alert.status, 'paused');

  await processUpdate(press(`a:t:${alert.id}`), ctx);
  await processUpdate(text('80'), ctx);
  assert.equal(alert.targetPrice, 80);
  assert.equal(state.sessions['7'], undefined);

  await processUpdate(press(`a:d:${alert.id}`), ctx);
  assert.equal(state.alerts.length, 1); // pide confirmacion
  await processUpdate(press(`a:dy:${alert.id}`), ctx);
  assert.equal(state.alerts.length, 0);

  await processUpdate(press(`n:p:${alert.id}`), ctx);
  assert.equal(log.at(-1)?.method, 'markup'); // aviso de alerta inexistente: quita botones
});

test('boton de un asistente ya terminado no rompe nada', async () => {
  const { ctx, log, press } = setup();
  await processUpdate(press('w:t:ow'), ctx);
  assert.ok(log.at(-1)?.toast?.includes('ya terminó'));
});

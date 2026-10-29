import type { AppState, Session } from '../models/types.js';
import type { TelegramCallbackQuery, TelegramClient, TelegramMessage, TelegramUpdate } from '../services/TelegramClient.js';
import type { PlaceLookup } from '../services/PlacesService.js';
import { AlertService } from '../services/AlertService.js';
import { formatAlertCreated, formatAlertDetail, formatAlertSummary } from '../services/MessageFormatter.js';
import { handleCommand, HELP } from './handler.js';
import { parseCommand } from './commands.js';
import {
  MENU,
  NOOP,
  alertDetailKeyboard,
  alertListKeyboard,
  confirmDeleteKeyboard,
  linkOnlyKeyboard,
  mainMenu,
  notificationKeyboard,
  cb,
} from './keyboards.js';
import { draftToAddArgs, newDraft, onCallback, onText, render, type Transition } from './wizard.js';
import { parsePositiveNumber } from '../utils/validation.js';
import { todayUtc } from '../utils/dates.js';
import { logger } from '../utils/logger.js';

export interface BotContext {
  telegram: TelegramClient;
  state: AppState;
  service: AlertService;
  places: PlaceLookup;
  /** Pide una comprobacion de precios y que al terminar se mande el resumen a este chat. */
  requestCheck: (chatId: number) => void;
}

/** Las conversaciones abandonadas se olvidan pasado este tiempo. */
const SESSION_TTL_MS = 24 * 3600_000;

const CHECKING = '🔎 Comprobando precios… te mando el resumen en un momento.';

/** Procesa un update (mensaje o boton). Nunca lanza: los errores se registran. */
export async function processUpdate(update: TelegramUpdate, ctx: BotContext): Promise<void> {
  try {
    if (update.callback_query) await onCallbackQuery(update.callback_query, ctx);
    else {
      const msg = update.message ?? update.edited_message;
      if (msg?.text && msg.chat) await onMessage(msg as TelegramMessage & { text: string; chat: { id: number } }, ctx);
    }
  } catch (err) {
    logger.warn(`Error procesando update ${update.update_id}:`, (err as Error).message);
  }
}

/** Borra las sesiones antiguas. */
export function pruneSessions(state: AppState, now = Date.now()): void {
  for (const [chat, session] of Object.entries(state.sessions)) {
    if (now - Date.parse(session.updatedAt) > SESSION_TTL_MS) delete state.sessions[chat];
  }
}

// --- Sesiones ---

const getSession = (ctx: BotContext, chatId: number): Session | undefined => ctx.state.sessions[String(chatId)];

function setSession(ctx: BotContext, chatId: number, session: Session | null): void {
  if (session) ctx.state.sessions[String(chatId)] = session;
  else delete ctx.state.sessions[String(chatId)];
}

const now = () => new Date().toISOString();

// --- Mensajes de texto ---

async function onMessage(msg: TelegramMessage & { text: string; chat: { id: number } }, ctx: BotContext): Promise<void> {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const send = (t: string, opts = {}) => ctx.telegram.sendMessage(chatId, t, opts);

  // Botones del menu fijo: siempre tienen prioridad y cancelan lo que estuviera a medias.
  switch (text) {
    case MENU.add:
      return startWizard(ctx, chatId);
    case MENU.list:
      setSession(ctx, chatId, null);
      return sendAlertList(ctx, chatId);
    case MENU.check:
      return checkNow(ctx, chatId);
    case MENU.help:
      await send(HELP, { replyKeyboard: mainMenu });
      return;
  }

  const cmd = parseCommand(text);
  if (cmd) {
    switch (cmd.name) {
      case 'start':
      case 'help':
        setSession(ctx, chatId, null);
        await send(handleCommand(ctx.service, cmd, chatId).reply, { replyKeyboard: mainMenu });
        return;
      case 'nueva':
        return startWizard(ctx, chatId);
      case 'add':
        if (cmd.args.length === 0) return startWizard(ctx, chatId);
        break;
      case 'list':
      case 'alertas':
        setSession(ctx, chatId, null);
        return sendAlertList(ctx, chatId);
      case 'checknow':
        return checkNow(ctx, chatId);
      case 'cancel':
      case 'cancelar':
        setSession(ctx, chatId, null);
        await send('Cancelado.', { replyKeyboard: mainMenu });
        return;
    }
    const result = handleCommand(ctx.service, cmd, chatId);
    await send(result.reply);
    if (result.wantsCheck) ctx.requestCheck(chatId);
    return;
  }

  // Texto libre: respuesta a la conversacion en curso.
  const session = getSession(ctx, chatId);
  if (session?.kind === 'wizard') {
    const transition = await onText(session.draft, text, ctx.places);
    await applyWizard(ctx, chatId, transition, null);
    return;
  }
  if (session?.kind === 'target') {
    const price = parsePositiveNumber(text.replace(',', '.').replace(/[€$\s]/g, ''));
    if (price == null) {
      await send('Escribe solo un número, por ejemplo 120.');
      return;
    }
    setSession(ctx, chatId, null);
    const ok = ctx.service.setTarget(chatId, session.alertId, Math.round(price));
    const alert = ctx.service.getAlert(chatId, session.alertId);
    if (!ok || !alert) {
      await send('Esa alerta ya no existe.', { replyKeyboard: mainMenu });
      return;
    }
    await ctx.telegram.editMessageReplyMarkup(chatId, session.messageId, []).catch(() => {});
    await send(`🎯 Nuevo objetivo: ${alert.targetPrice} ${alert.currency}\n\n${formatAlertDetail(alert)}`, {
      keyboard: alertDetailKeyboard(alert),
    });
    return;
  }

  await send('Usa el menú de abajo 👇 para crear o ver tus alertas.', { replyKeyboard: mainMenu });
}

async function startWizard(ctx: BotContext, chatId: number): Promise<void> {
  const draft = newDraft();
  setSession(ctx, chatId, { kind: 'wizard', draft, updatedAt: now() });
  const view = render(draft, todayUtc(), ctx.service.getUserCurrency(chatId));
  await ctx.telegram.sendMessage(chatId, view.text, { keyboard: view.keyboard });
}

async function sendAlertList(ctx: BotContext, chatId: number, editMessageId?: number): Promise<void> {
  const alerts = ctx.service.listAlerts(chatId);
  const text = formatAlertSummary(alerts);
  const keyboard = alertListKeyboard(alerts);
  if (editMessageId) await ctx.telegram.editMessageText(chatId, editMessageId, text, keyboard);
  else await ctx.telegram.sendMessage(chatId, text, { keyboard });
}

async function checkNow(ctx: BotContext, chatId: number): Promise<void> {
  if (ctx.service.listAlerts(chatId).length === 0) {
    await ctx.telegram.sendMessage(chatId, 'No tienes alertas todavía.', {
      keyboard: [[cb(MENU.add, 'w:new')]],
    });
    return;
  }
  await ctx.telegram.sendMessage(chatId, CHECKING);
  ctx.requestCheck(chatId);
}

/** Aplica el resultado del asistente: edita el mensaje del boton o envia uno nuevo si vino de texto. */
async function applyWizard(
  ctx: BotContext,
  chatId: number,
  t: Transition,
  messageId: number | null,
  answer?: (toast?: string) => Promise<void>,
): Promise<void> {
  const show = async (text: string, keyboard: ReturnType<typeof render>['keyboard']) => {
    if (messageId) await ctx.telegram.editMessageText(chatId, messageId, text, keyboard);
    else await ctx.telegram.sendMessage(chatId, text, { keyboard });
  };

  switch (t.kind) {
    case 'ignored':
      await answer?.(t.toast);
      return;
    case 'cancel':
      setSession(ctx, chatId, null);
      await answer?.();
      if (messageId) await ctx.telegram.editMessageText(chatId, messageId, 'Alerta cancelada.', []);
      return;
    case 'continue': {
      setSession(ctx, chatId, { kind: 'wizard', draft: t.draft, updatedAt: now() });
      await answer?.();
      const view = render(t.draft, todayUtc(), ctx.service.getUserCurrency(chatId), t.notice);
      await show(view.text, view.keyboard);
      return;
    }
    case 'done': {
      const args = draftToAddArgs(t.draft);
      if (!args) {
        await answer?.('Faltan datos, revisa los pasos');
        return;
      }
      setSession(ctx, chatId, null);
      const alert = ctx.service.addAlert(chatId, { ...args, currency: ctx.service.getUserCurrency(chatId) });
      await answer?.('Alerta creada');
      await show(`${formatAlertCreated(alert)}\n\nBusco el precio ahora y te aviso.`, alertDetailKeyboard(alert));
      ctx.requestCheck(chatId);
      return;
    }
  }
}

// --- Botones ---

async function onCallbackQuery(q: TelegramCallbackQuery, ctx: BotContext): Promise<void> {
  const data = q.data ?? '';
  const chatId = q.message?.chat?.id;
  const messageId = q.message?.message_id;
  let answered = false;
  const answer = async (toast?: string) => {
    if (answered) return;
    answered = true;
    await ctx.telegram.answerCallbackQuery(q.id, toast).catch(() => {});
  };

  try {
    if (data === NOOP || chatId == null || messageId == null) return;

    if (data === 'w:new') {
      await answer();
      return startWizard(ctx, chatId);
    }

    if (data.startsWith('w:') || data.startsWith('c:')) {
      const session = getSession(ctx, chatId);
      if (session?.kind !== 'wizard') {
        await answer('Este asistente ya terminó. Empieza otro con ➕ Nueva alerta');
        return;
      }
      await applyWizard(ctx, chatId, onCallback(session.draft, data, todayUtc()), messageId, answer);
      return;
    }

    if (data === 'a:l') {
      await answer();
      return sendAlertList(ctx, chatId, messageId);
    }

    const [scope, action, id] = data.split(':');
    const alert = id ? ctx.service.getAlert(chatId, id) : undefined;
    if ((scope === 'a' || scope === 'n') && !alert) {
      await answer('Esa alerta ya no existe');
      if (scope === 'n') await ctx.telegram.editMessageReplyMarkup(chatId, messageId, []);
      return;
    }
    if (!alert) return;

    // a:* -> acciones desde el detalle (se edita el propio mensaje).
    if (scope === 'a') {
      switch (action) {
        case 'v':
          break;
        case 'p':
          ctx.service.setStatus(chatId, id, 'paused');
          await answer('Alerta pausada');
          break;
        case 'r':
          ctx.service.setStatus(chatId, id, 'active');
          await answer('Alerta reactivada');
          break;
        case 't':
          setSession(ctx, chatId, { kind: 'target', alertId: id, messageId, updatedAt: now() });
          await answer();
          await ctx.telegram.editMessageText(
            chatId,
            messageId,
            `${formatAlertDetail(alert)}\n\n🎯 ✍️ Escribe el nuevo precio objetivo (${alert.currency}):`,
            [[cb('↩️ Cancelar', `a:v:${id}`)]],
          );
          return;
        case 'd':
          await answer();
          await ctx.telegram.editMessageText(
            chatId,
            messageId,
            `${formatAlertDetail(alert)}\n\n¿Seguro que quieres borrar esta alerta?`,
            confirmDeleteKeyboard(alert),
          );
          return;
        case 'dy':
          ctx.service.removeAlert(chatId, id);
          await answer('Alerta borrada');
          return sendAlertList(ctx, chatId, messageId);
        default:
          return;
      }
      // Si estaba cambiando el precio y vuelve al detalle, se cancela.
      if (getSession(ctx, chatId)?.kind === 'target') setSession(ctx, chatId, null);
      await answer();
      await ctx.telegram.editMessageText(chatId, messageId, formatAlertDetail(alert), alertDetailKeyboard(alert));
      return;
    }

    // n:* -> acciones desde un aviso de precio (el aviso se conserva; solo cambian sus botones).
    if (scope === 'n') {
      const link = alert.lastDeal?.link ?? null;
      switch (action) {
        case 'v':
          await answer();
          await ctx.telegram.sendMessage(chatId, formatAlertDetail(alert), { keyboard: alertDetailKeyboard(alert) });
          return;
        case 'p':
          ctx.service.setStatus(chatId, id, 'paused');
          await answer('Alerta pausada. Reactívala desde 📋 Mis alertas');
          await ctx.telegram.editMessageReplyMarkup(chatId, messageId, linkOnlyKeyboard(link));
          return;
        case 'd':
          await answer();
          await ctx.telegram.editMessageReplyMarkup(chatId, messageId, [
            [cb('✅ Sí, borrar', `n:dy:${id}`), cb('↩️ No', `n:k:${id}`)],
          ]);
          return;
        case 'dy':
          ctx.service.removeAlert(chatId, id);
          await answer('Alerta borrada');
          await ctx.telegram.editMessageReplyMarkup(chatId, messageId, linkOnlyKeyboard(link));
          return;
        case 'k':
          await answer();
          await ctx.telegram.editMessageReplyMarkup(chatId, messageId, notificationKeyboard(alert, link));
          return;
      }
    }
  } finally {
    await answer();
  }
}

import type { TelegramClient, TelegramUpdate } from '../services/TelegramClient.js';
import { AlertService } from '../services/AlertService.js';
import { formatAlertList } from '../services/MessageFormatter.js';
import { parseCommand } from '../bot/commands.js';
import { handleCommand } from '../bot/handler.js';
import { logger } from '../utils/logger.js';

export interface Reply {
  chatId: number;
  text: string;
}

export interface UpdatesOutcome {
  replies: Reply[];
  /** Chats que pidieron /checknow. */
  checkChats: Set<number>;
  /** Offset a guardar (ultimo update_id + 1). */
  nextOffset: number;
}

/** Aplica un lote de updates al estado (sin red) y devuelve las respuestas a enviar. */
export function applyUpdates(updates: TelegramUpdate[], service: AlertService, offset: number): UpdatesOutcome {
  const replies: Reply[] = [];
  const checkChats = new Set<number>();
  let nextOffset = offset;

  for (const update of updates) {
    nextOffset = Math.max(nextOffset, update.update_id + 1);
    const msg = update.message ?? update.edited_message;
    const text = msg?.text;
    const chatId = msg?.chat?.id;
    if (!text || chatId == null) continue;

    const parsed = parseCommand(text);
    const result = parsed
      ? handleCommand(service, parsed, chatId)
      : { reply: 'Envía un comando. Usa /help para ver las opciones.' };
    replies.push({ chatId, text: result.reply });
    if (result.wantsCheck) checkChats.add(chatId);
  }

  if (updates.length > 0) logger.info(`Procesados ${updates.length} update(s).`);
  return { replies, checkChats, nextOffset };
}

export async function sendReplies(telegram: TelegramClient, replies: Reply[]): Promise<void> {
  for (const reply of replies) {
    try {
      await telegram.sendMessage(reply.chatId, reply.text);
    } catch (err) {
      logger.warn('Respuesta fallida:', (err as Error).message);
    }
  }
}

/** Tras una comprobacion, manda el estado de sus alertas a quien pidio /checknow. */
export async function sendCheckReports(
  telegram: TelegramClient,
  service: AlertService,
  chats: Iterable<number>,
): Promise<void> {
  await sendReplies(
    telegram,
    [...chats].map((chatId) => ({ chatId, text: `📋 Estado actual:\n\n${formatAlertList(service.listAlerts(chatId))}` })),
  );
}

/**
 * Modo cron (sin proceso 24/7): drena getUpdates con el offset guardado,
 * aplica los comandos y responde. Devuelve los chats que pidieron /checknow.
 */
export async function drainUpdates(
  telegram: TelegramClient,
  state: { telegram: { offset: number } },
  service: AlertService,
): Promise<Set<number>> {
  const checkChats = new Set<number>();
  const replies: Reply[] = [];

  while (true) {
    let updates;
    try {
      updates = await telegram.getUpdates(state.telegram.offset, 0);
    } catch (err) {
      logger.warn('getUpdates fallo:', (err as Error).message);
      break;
    }
    if (updates.length === 0) break;

    const outcome = applyUpdates(updates, service, state.telegram.offset);
    // Guardamos el offset aunque falle algun envio: los comandos ya se aplicaron.
    state.telegram.offset = outcome.nextOffset;
    replies.push(...outcome.replies);
    outcome.checkChats.forEach((c) => checkChats.add(c));
  }

  await sendReplies(telegram, replies);
  return checkChats;
}

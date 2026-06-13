import type { AppState } from '../models/types';
import type { TelegramClient } from '../services/TelegramClient';
import { AlertService } from '../services/AlertService';
import { parseCommand } from '../bot/commands';
import { handleCommand } from '../bot/handler';
import { logger } from '../utils/logger';

/**
 * Procesa los comandos de Telegram pendientes (modo cron, sin proceso 24/7):
 * drena getUpdates con el offset guardado, ejecuta cada comando y responde.
 */
export async function processUpdates(
  telegram: TelegramClient,
  state: AppState,
  service: AlertService,
): Promise<void> {
  let offset = state.telegram.offset;
  const replies: Array<{ chatId: number; text: string }> = [];
  let processed = 0;

  while (true) {
    let updates;
    try {
      updates = await telegram.getUpdates(offset, 0);
    } catch (err) {
      logger.warn('getUpdates fallo:', (err as Error).message);
      break;
    }
    if (updates.length === 0) break;

    for (const update of updates) {
      offset = update.update_id + 1;
      const msg = update.message ?? update.edited_message;
      const text = msg?.text;
      const chatId = msg?.chat?.id;
      if (!text || chatId == null) continue;

      processed++;
      const parsed = parseCommand(text);
      const reply = parsed
        ? handleCommand(service, parsed, chatId)
        : 'Envía un comando. Usa /help para ver las opciones.';
      replies.push({ chatId, text: reply });
    }
  }

  // Guardamos el offset aunque falle algun envio: los comandos ya se aplicaron.
  state.telegram.offset = offset;
  if (processed > 0) logger.info(`Procesados ${processed} mensaje(s).`);

  for (const reply of replies) {
    try {
      await telegram.sendMessage(reply.chatId, reply.text);
    } catch (err) {
      logger.warn('Respuesta fallida:', (err as Error).message);
    }
  }
}

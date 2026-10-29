import type { TelegramClient } from '../services/TelegramClient.js';
import { AlertService } from '../services/AlertService.js';
import { formatAlertList } from '../services/MessageFormatter.js';
import { alertListKeyboard } from '../bot/keyboards.js';
import { processUpdate, pruneSessions, type BotContext } from '../bot/router.js';
import { logger } from '../utils/logger.js';

/** Tras una comprobacion, manda el estado de sus alertas (con botones) a quien la pidio. */
export async function sendCheckReports(
  telegram: TelegramClient,
  service: AlertService,
  chats: Iterable<number>,
): Promise<void> {
  for (const chatId of chats) {
    const alerts = service.listAlerts(chatId);
    try {
      await telegram.sendMessage(chatId, `📋 Estado actual:\n\n${formatAlertList(alerts)}`, {
        keyboard: alertListKeyboard(alerts),
      });
    } catch (err) {
      logger.warn('Resumen fallido:', (err as Error).message);
    }
  }
}

/**
 * Modo cron (sin proceso 24/7): drena getUpdates con el offset guardado y
 * procesa cada mensaje o boton.
 */
export async function drainUpdates(ctx: BotContext): Promise<void> {
  pruneSessions(ctx.state);
  let processed = 0;
  while (true) {
    let updates;
    try {
      updates = await ctx.telegram.getUpdates(ctx.state.telegram.offset, 0);
    } catch (err) {
      logger.warn('getUpdates fallo:', (err as Error).message);
      break;
    }
    if (updates.length === 0) break;

    for (const update of updates) {
      // El offset avanza aunque falle algo: un update roto no debe bloquear a los demas.
      ctx.state.telegram.offset = update.update_id + 1;
      await processUpdate(update, ctx);
      processed++;
    }
  }
  if (processed > 0) logger.info(`Procesados ${processed} update(s).`);
}

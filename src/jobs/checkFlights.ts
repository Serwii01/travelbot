import { config, assertRuntimeConfig } from '../config.js';
import { createStorage } from '../storage/index.js';
import { createProvider } from '../providers/index.js';
import { TelegramClient } from '../services/TelegramClient.js';
import { AlertService } from '../services/AlertService.js';
import { PriceChecker } from '../services/PriceChecker.js';
import { PlacesService } from '../services/PlacesService.js';
import { drainUpdates, sendCheckReports } from './processUpdates.js';
import { logger } from '../utils/logger.js';

/**
 * Modo cron (GitHub Actions o crontab): una ejecucion y termina.
 *  1) procesa mensajes y botones de Telegram pendientes,
 *  2) comprueba precios y notifica,
 *  3) persiste el estado.
 * Para el VPS es mejor el modo 24/7 (src/jobs/bot.ts): aqui el asistente con
 * botones funciona, pero cada paso responde en la siguiente ejecucion.
 */
async function main(): Promise<void> {
  assertRuntimeConfig();

  const storage = createStorage();
  const state = await storage.load();
  const service = new AlertService(state, config.defaultCurrency);
  const telegram = new TelegramClient(config.telegramToken);
  const checkChats = new Set<number>();

  await drainUpdates({
    telegram,
    state,
    service,
    places: new PlacesService().search,
    requestCheck: (chatId) => checkChats.add(chatId),
  });

  try {
    const checker = new PriceChecker(createProvider(), telegram, config.minDropPct);
    await checker.run(state, service);
    await sendCheckReports(telegram, service, checkChats);
  } catch (err) {
    logger.error('Error comprobando precios:', (err as Error).message);
  }

  await storage.save(state);
  logger.info('Ejecución completada.');
}

main().catch((err) => {
  logger.error('Fallo fatal:', err);
  process.exit(1);
});

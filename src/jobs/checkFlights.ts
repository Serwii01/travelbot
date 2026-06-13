import { config, assertRuntimeConfig } from '../config';
import { createStorage } from '../storage';
import { createProvider } from '../providers';
import { TelegramClient } from '../services/TelegramClient';
import { AlertService } from '../services/AlertService';
import { PriceChecker } from '../services/PriceChecker';
import { processUpdates } from './processUpdates';
import { logger } from '../utils/logger';

/**
 * Punto de entrada del job (GitHub Actions, cada 3h o manual):
 *  1) procesa comandos de Telegram pendientes,
 *  2) comprueba precios y notifica,
 *  3) persiste el estado.
 */
async function main(): Promise<void> {
  assertRuntimeConfig();

  const storage = createStorage();
  const state = await storage.load();
  const service = new AlertService(state, config.defaultCurrency);
  const telegram = new TelegramClient(config.telegramToken);

  try {
    await processUpdates(telegram, state, service);
  } catch (err) {
    logger.error('Error procesando comandos:', (err as Error).message);
  }

  try {
    const provider = createProvider();
    const checker = new PriceChecker(provider, telegram, config.requestDelayMs);
    await checker.run(state);
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

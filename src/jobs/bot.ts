import { config, assertRuntimeConfig } from '../config.js';
import { createStorage } from '../storage/index.js';
import { createProvider } from '../providers/index.js';
import { TelegramClient } from '../services/TelegramClient.js';
import { AlertService } from '../services/AlertService.js';
import { PriceChecker } from '../services/PriceChecker.js';
import { PlacesService } from '../services/PlacesService.js';
import { processUpdate, pruneSessions, type BotContext } from '../bot/router.js';
import { sendCheckReports } from './processUpdates.js';
import { logger } from '../utils/logger.js';
import { sleep } from '../utils/sleep.js';

const LONG_POLL_SECONDS = 30;

/**
 * Modo 24/7 (VPS): un unico proceso ligero.
 *  - Long polling a Telegram -> responde a los comandos al instante.
 *  - Comprueba precios al arrancar y cada CHECK_INTERVAL_MIN minutos (y con /checknow).
 *  - Guarda el estado tras cada cambio y al recibir SIGTERM/SIGINT.
 */
async function main(): Promise<void> {
  assertRuntimeConfig();

  const storage = createStorage();
  const state = await storage.load();
  const service = new AlertService(state, config.defaultCurrency);
  const telegram = new TelegramClient(config.telegramToken);
  const checker = new PriceChecker(createProvider(), telegram, config.minDropPct);

  const save = () => storage.save(state).catch((err) => logger.error('No se pudo guardar:', (err as Error).message));

  // --- Comprobacion de precios (nunca dos a la vez) ---
  let checking: Promise<void> | null = null;
  const pendingReports = new Set<number>();

  const runCheck = (): Promise<void> => {
    if (checking) return checking;
    checking = (async () => {
      // Solo respondemos a quien lo pidio antes de empezar; el resto espera a la siguiente.
      const chats = [...pendingReports];
      pendingReports.clear();
      try {
        await checker.run(state, service);
      } catch (err) {
        logger.error('Error comprobando precios:', (err as Error).message);
      }
      await save();
      await sendCheckReports(telegram, service, chats);
    })().finally(() => {
      checking = null;
      // /checknow llegado durante la comprobacion: otra pasada (barata, el proveedor cachea).
      if (pendingReports.size > 0 && !stopping) void runCheck();
    });
    return checking;
  };

  // --- Parada limpia ---
  const abort = new AbortController();
  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info(`${signal} recibido, guardando y saliendo…`);
    clearInterval(timer);
    abort.abort();
    await save();
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));

  const ctx: BotContext = {
    telegram,
    state,
    service,
    places: new PlacesService().search,
    requestCheck: (chatId) => {
      pendingReports.add(chatId);
      void runCheck();
    },
  };

  const timer = setInterval(() => {
    pruneSessions(state);
    void runCheck();
  }, config.checkIntervalMin * 60_000);

  // Sugerencias al escribir "/" en Telegram.
  await telegram
    .setMyCommands([
      { command: 'nueva', description: 'Crear una alerta paso a paso' },
      { command: 'alertas', description: 'Ver y gestionar tus alertas' },
      { command: 'checknow', description: 'Comprobar precios ahora' },
      { command: 'cancel', description: 'Cancelar lo que estés haciendo' },
      { command: 'help', description: 'Ayuda' },
    ])
    .catch((err) => logger.warn('setMyCommands falló:', (err as Error).message));
  logger.info(
    `Bot arrancado (proveedor ${config.provider}, comprobación cada ${config.checkIntervalMin} min, ` +
      `${state.alerts.length} alerta(s)).`,
  );
  void runCheck();

  // --- Bucle de long polling ---
  let backoffMs = 1000;
  while (!stopping) {
    let updates;
    try {
      updates = await telegram.getUpdates(state.telegram.offset, LONG_POLL_SECONDS, abort.signal);
      backoffMs = 1000;
    } catch (err) {
      if (stopping) break;
      // Token invalido: reintentar no sirve de nada.
      if (/getUpdates 401/.test((err as Error).message)) throw new Error('TELEGRAM_BOT_TOKEN inválido (401).');
      logger.warn(`getUpdates falló, reintento en ${backoffMs / 1000}s:`, (err as Error).message);
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, 60_000);
      continue;
    }
    if (updates.length === 0) continue;

    for (const update of updates) {
      // El offset avanza aunque falle algo: un update roto no debe bloquear a los demas.
      state.telegram.offset = update.update_id + 1;
      await processUpdate(update, ctx);
    }
    await save();
  }
}

main().catch((err) => {
  logger.error('Fallo fatal:', err);
  process.exit(1);
});

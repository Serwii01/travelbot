import type { AppState, Alert } from '../models/types';
import type { FlightProvider } from '../providers/FlightProvider';
import type { TelegramClient } from './TelegramClient';
import { evaluateAlert } from './priceLogic';
import { formatPriceAlert } from './MessageFormatter';
import { logger } from '../utils/logger';
import { sleep } from '../utils/sleep';

const routeKey = (a: Alert): string => `${a.origin}|${a.destination}|${a.date}|${a.currency}`;

/**
 * Comprueba precios minimizando llamadas:
 *  - agrupa alertas con misma ruta -> 1 llamada compartida,
 *  - espera entre llamadas (rate limit),
 *  - actualiza lastSeen siempre y notifica solo lo relevante (ver priceLogic),
 *  - si una ruta falla, continua con las demas.
 */
export class PriceChecker {
  constructor(
    private readonly provider: FlightProvider,
    private readonly telegram: TelegramClient,
    private readonly delayMs: number,
  ) {}

  async run(state: AppState): Promise<void> {
    const active = state.alerts.filter((a) => a.status === 'active');
    if (active.length === 0) {
      logger.info('No hay alertas activas.');
      return;
    }

    const groups = new Map<string, Alert[]>();
    for (const alert of active) {
      const key = routeKey(alert);
      const group = groups.get(key);
      if (group) group.push(alert);
      else groups.set(key, [alert]);
    }

    logger.info(`Comprobando ${active.length} alerta(s) en ${groups.size} ruta(s) unica(s).`);

    let first = true;
    for (const [key, alerts] of groups) {
      if (!first) await sleep(this.delayMs);
      first = false;

      const sample = alerts[0];
      let result;
      try {
        result = await this.provider.search({
          origin: sample.origin,
          destination: sample.destination,
          date: sample.date,
          currency: sample.currency,
        });
      } catch (err) {
        logger.warn(`Busqueda fallida ${key}:`, (err as Error).message);
        continue;
      }

      if (!result) {
        logger.info(`Sin ofertas para ${key}.`);
        continue;
      }

      const price = Math.round(result.price);
      logger.info(`${key} -> ${price} ${result.currency}`);

      for (const alert of alerts) {
        const evaluation = evaluateAlert(alert, price);
        alert.lastSeenPrice = price;
        alert.updatedAt = new Date().toISOString();

        if (!evaluation.notify) continue;
        try {
          await this.telegram.sendMessage(
            alert.chatId,
            formatPriceAlert(alert, price, evaluation.dropFromLastSeen),
          );
          alert.lastNotifiedPrice = price;
          logger.info(`Notificado chat ${alert.chatId} alerta #${alert.id} (${evaluation.reason}).`);
        } catch (err) {
          logger.warn(`Notificacion fallida #${alert.id}:`, (err as Error).message);
        }
      }
    }
  }
}

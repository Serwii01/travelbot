import type { AppState, Alert } from '../models/types.js';
import type { FlightProvider, FlightQuery } from '../providers/FlightProvider.js';
import type { TelegramClient } from './TelegramClient.js';
import { AlertService } from './AlertService.js';
import { evaluateAlert } from './priceLogic.js';
import { formatExpired, formatPriceAlert } from './MessageFormatter.js';
import { logger } from '../utils/logger.js';

const toQuery = (a: Alert): FlightQuery => ({
  origin: a.origin,
  destination: a.destination,
  departRange: a.departRange,
  returnRange: a.returnRange,
  directOnly: a.directOnly,
  currency: a.currency,
});

/**
 * Comprueba precios minimizando llamadas:
 *  - elimina (y avisa) las alertas caducadas,
 *  - agrupa alertas con la misma consulta -> 1 busqueda compartida
 *    (el proveedor ademas cachea y espacia las llamadas reales),
 *  - actualiza precios siempre y notifica solo lo relevante (ver priceLogic),
 *  - si una ruta falla, continua con las demas.
 */
export class PriceChecker {
  constructor(
    private readonly provider: FlightProvider,
    private readonly telegram: TelegramClient,
    private readonly minDropPct: number,
  ) {}

  async run(state: AppState, service: AlertService): Promise<void> {
    for (const alert of service.expireAlerts()) {
      logger.info(`Alerta #${alert.id} caducada.`);
      await this.send(alert.chatId, formatExpired(alert));
    }

    const active = state.alerts.filter((a) => a.status === 'active');
    if (active.length === 0) {
      logger.info('No hay alertas activas.');
      return;
    }

    const groups = new Map<string, Alert[]>();
    for (const alert of active) {
      const key = JSON.stringify(toQuery(alert));
      const group = groups.get(key);
      if (group) group.push(alert);
      else groups.set(key, [alert]);
    }

    logger.info(`Comprobando ${active.length} alerta(s) en ${groups.size} consulta(s) unica(s).`);

    for (const alerts of groups.values()) {
      const sample = alerts[0];
      const label = `${sample.origin}-${sample.destination} #${sample.id}`;
      let result;
      try {
        result = await this.provider.search(toQuery(sample));
      } catch (err) {
        logger.warn(`Busqueda fallida ${label}:`, (err as Error).message);
        continue;
      }

      if (!result) {
        logger.info(`Sin ofertas para ${label}.`);
        continue;
      }

      const deal = { ...result, price: Math.round(result.price) };
      logger.info(`${label} -> ${deal.price} ${deal.currency}`);

      for (const alert of alerts) {
        // En modo 24/7 el usuario puede borrar o pausar la alerta mientras buscamos.
        if (alert.status !== 'active' || !state.alerts.includes(alert)) continue;

        const evaluation = evaluateAlert(alert, deal.price, this.minDropPct);
        alert.lastSeenPrice = deal.price;
        alert.minSeenPrice = Math.min(alert.minSeenPrice ?? Infinity, deal.price);
        alert.lastDeal = {
          price: deal.price,
          departDate: deal.departDate,
          returnDate: deal.returnDate,
          airline: deal.airline,
          transfers: deal.transfers,
          link: deal.link,
        };
        alert.updatedAt = new Date().toISOString();

        if (!evaluation.notify) continue;
        const sent = await this.send(
          alert.chatId,
          formatPriceAlert(alert, deal, evaluation),
          deal.link ? { text: '🔗 Ver vuelo', url: deal.link } : undefined,
        );
        if (sent) {
          alert.lastNotifiedPrice = deal.price;
          logger.info(`Notificado chat ${alert.chatId} alerta #${alert.id} (${evaluation.reason}).`);
        }
      }
    }
  }

  private async send(chatId: number, text: string, button?: { text: string; url: string }): Promise<boolean> {
    try {
      await this.telegram.sendMessage(chatId, text, button ? { button } : {});
      return true;
    } catch (err) {
      logger.warn(`Envio fallido a ${chatId}:`, (err as Error).message);
      return false;
    }
  }
}

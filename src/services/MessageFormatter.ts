import type { Alert, Deal } from '../models/types.js';
import type { PriceEvaluation } from './priceLogic.js';
import { formatRange } from '../utils/dates.js';

const tripLabel = (a: Alert): string =>
  [
    `${a.origin} → ${a.destination}`,
    a.returnRange ? 'ida y vuelta' : 'solo ida',
    a.directOnly ? 'directo' : null,
  ]
    .filter(Boolean)
    .join(' · ');

const datesLabel = (a: Alert): string =>
  a.returnRange
    ? `Ida ${formatRange(a.departRange)} · Vuelta ${formatRange(a.returnRange)}`
    : `Ida ${formatRange(a.departRange)}`;

const transfersLabel = (n: number | null): string | null =>
  n == null ? null : n === 0 ? 'directo' : n === 1 ? '1 escala' : `${n} escalas`;

const dealLine = (d: Deal): string =>
  [
    d.returnDate ? `${d.departDate} → ${d.returnDate}` : d.departDate,
    d.airline,
    transfersLabel(d.transfers),
  ]
    .filter(Boolean)
    .join(' · ');

export function formatAlertCreated(a: Alert): string {
  return [`✅ Alerta creada (#${a.id})`, tripLabel(a), datesLabel(a), `Objetivo: ${a.targetPrice} ${a.currency}`].join(
    '\n',
  );
}

export function formatAlertList(alerts: Alert[]): string {
  if (alerts.length === 0) {
    return 'No tienes alertas. Crea una con:\n/add MAD PRG 2026-08-20 120';
  }
  return alerts
    .map((a) => {
      const icon = a.status === 'paused' ? '⏸️' : '✅';
      const lines = [`#${a.id} ${icon} ${tripLabel(a)}`, `   ${datesLabel(a)}`];
      const prices = [`objetivo ${a.targetPrice} ${a.currency}`];
      if (a.lastSeenPrice != null) prices.push(`actual ${a.lastSeenPrice}`);
      if (a.minSeenPrice != null) prices.push(`mínimo ${a.minSeenPrice}`);
      lines.push(`   ${prices.join(' · ')}`);
      if (a.lastDeal) lines.push(`   Mejor: ${dealLine(a.lastDeal)}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

export function formatPriceAlert(alert: Alert, deal: Deal, evaluation: PriceEvaluation): string {
  const header = evaluation.reason === 'below_target' ? '🎯 ¡Precio por debajo de tu objetivo!' : '📉 Ha bajado el precio';
  const lines = [header, `#${alert.id} ${tripLabel(alert)}`, '', `💶 ${deal.price} ${alert.currency} (objetivo ${alert.targetPrice})`];
  if (evaluation.dropFromLastSeen != null && evaluation.dropFromLastSeen > 0) {
    lines.push(`⬇️ ${evaluation.dropFromLastSeen} ${alert.currency} menos que la última vez`);
  }
  if (evaluation.historicLow) lines.push('🔥 Precio más bajo desde que lo vigilo');
  lines.push(`🛫 ${dealLine(deal)}`);
  lines.push('', 'Precio orientativo (búsquedas de las últimas 48 h); confírmalo antes de comprar.');
  return lines.join('\n');
}

export function formatExpired(a: Alert): string {
  const min = a.minSeenPrice != null ? ` El mínimo que vi fue ${a.minSeenPrice} ${a.currency}.` : '';
  return `⌛ La alerta #${a.id} (${a.origin} → ${a.destination}) ha caducado y la he eliminado.${min}`;
}

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

const NO_ALERTS = 'No tienes alertas. Pulsa ➕ Nueva alerta para crear una.';

const NO_OFFERS =
  '🔍 Sin precios recientes: nadie ha buscado esta ruta y fechas en Aviasales en los últimos días. ' +
  'Sigo mirando; si quieres más opciones, prueba con un mes entero, otras fechas o un aeropuerto cercano.';

/** Cabecera de "Mis alertas" (el detalle va en los botones). */
export function formatAlertSummary(alerts: Alert[]): string {
  if (alerts.length === 0) return NO_ALERTS;
  return `📋 Tienes ${alerts.length} alerta(s). Pulsa una para ver el detalle, pausarla, cambiar el precio o borrarla.`;
}

export function formatAlertDetail(a: Alert): string {
  const lines = [`📌 Alerta #${a.id}${a.status === 'paused' ? ' (⏸️ pausada)' : ''}`, tripLabel(a), `📅 ${datesLabel(a)}`];
  lines.push(`🎯 Objetivo: ${a.targetPrice} ${a.currency}`);
  if (a.lastSeenPrice != null) {
    const min = a.minSeenPrice != null && a.minSeenPrice < a.lastSeenPrice ? ` · mínimo visto ${a.minSeenPrice}` : '';
    lines.push(`💶 Precio actual: ${a.lastSeenPrice} ${a.currency}${min}`);
  } else if (!a.noOffers) {
    lines.push('💶 Aún sin precio (se comprueba en breve)');
  }
  if (a.noOffers) lines.push(NO_OFFERS);
  if (a.lastDeal) lines.push(`🛫 Mejor vuelo: ${dealLine(a.lastDeal)}`);
  return lines.join('\n');
}

export function formatAlertList(alerts: Alert[]): string {
  if (alerts.length === 0) return NO_ALERTS;
  return alerts
    .map((a) => {
      const icon = a.status === 'paused' ? '⏸️' : '✅';
      const lines = [`#${a.id} ${icon} ${tripLabel(a)}`, `   ${datesLabel(a)}`];
      const prices = [`objetivo ${a.targetPrice} ${a.currency}`];
      if (a.lastSeenPrice != null) prices.push(`actual ${a.lastSeenPrice}`);
      if (a.minSeenPrice != null) prices.push(`mínimo ${a.minSeenPrice}`);
      lines.push(`   ${prices.join(' · ')}`);
      if (a.lastDeal) lines.push(`   Mejor: ${dealLine(a.lastDeal)}`);
      if (a.noOffers) lines.push(`   ${NO_OFFERS}`);
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

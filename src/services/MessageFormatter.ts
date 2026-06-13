import type { Alert } from '../models/types';

export function formatAlertList(alerts: Alert[]): string {
  if (alerts.length === 0) {
    return 'No tienes alertas. Crea una con:\n/add MAD PRG 2026-08-20 120';
  }
  return alerts
    .map((a) => {
      const icon = a.status === 'paused' ? '⏸️' : '✅';
      const seen = a.lastSeenPrice != null ? ` | último visto ${a.lastSeenPrice} ${a.currency}` : '';
      return `#${a.id} ${icon} ${a.origin}->${a.destination} ${a.date} | objetivo ${a.targetPrice} ${a.currency}${seen}`;
    })
    .join('\n');
}

export function formatPriceAlert(
  alert: Alert,
  price: number,
  dropFromLastSeen: number | null,
): string {
  const lines = [
    '✈️ Precio encontrado',
    `${alert.origin} -> ${alert.destination}`,
    `Fecha: ${alert.date}`,
    `Precio actual: ${price} ${alert.currency}`,
    `Tu objetivo: ${alert.targetPrice} ${alert.currency}`,
  ];
  if (dropFromLastSeen != null && dropFromLastSeen > 0) {
    lines.push(`Bajada desde último visto: ${dropFromLastSeen} ${alert.currency}`);
  }
  return lines.join('\n');
}

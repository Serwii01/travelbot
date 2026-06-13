import type { Alert } from '../models/types';

export interface PriceEvaluation {
  notify: boolean;
  reason: 'drop' | 'below_target' | null;
  /** Bajada respecto al ultimo precio visto, si la hubo. */
  dropFromLastSeen: number | null;
}

/**
 * Logica pura de decision (sin efectos). Notifica si:
 *   - el precio baja respecto al ultimo visto, O
 *   - el precio esta en/por debajo del objetivo,
 * y SOLO si es un nuevo minimo respecto a lo ya notificado (deduplicacion).
 */
export function evaluateAlert(alert: Alert, price: number): PriceEvaluation {
  const lastSeen = alert.lastSeenPrice;
  const dropped = lastSeen != null && price < lastSeen;
  const belowTarget = price <= alert.targetPrice;
  const relevant = dropped || belowTarget;

  const isNewLow = alert.lastNotifiedPrice == null || price < alert.lastNotifiedPrice;
  const notify = relevant && isNewLow;

  const reason: PriceEvaluation['reason'] = !notify
    ? null
    : belowTarget
      ? 'below_target'
      : 'drop';

  return {
    notify,
    reason,
    dropFromLastSeen: dropped ? (lastSeen as number) - price : null,
  };
}

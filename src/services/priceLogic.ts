import type { Alert } from '../models/types.js';

export interface PriceEvaluation {
  notify: boolean;
  reason: 'drop' | 'below_target' | null;
  /** Bajada respecto al ultimo precio visto, si la hubo. */
  dropFromLastSeen: number | null;
  /** Precio mas bajo desde que existe la alerta (y ya se habia visto alguno antes). */
  historicLow: boolean;
}

/** ¿`price` es una bajada "significativa" respecto a `reference`? */
const isSignificantDrop = (reference: number, price: number, minDropPct: number): boolean =>
  price < reference && reference - price >= reference * (minDropPct / 100);

/**
 * Logica pura de decision (sin efectos). Notifica si:
 *   - el precio baja al menos `minDropPct`% respecto al ultimo visto, O
 *   - el precio esta en/por debajo del objetivo,
 * y SOLO si es un nuevo minimo (con el mismo umbral) respecto a lo ya notificado.
 */
export function evaluateAlert(alert: Alert, price: number, minDropPct = 0): PriceEvaluation {
  const lastSeen = alert.lastSeenPrice;
  const dropped = lastSeen != null && isSignificantDrop(lastSeen, price, minDropPct);
  const belowTarget = price <= alert.targetPrice;
  const relevant = dropped || belowTarget;

  const isNewLow =
    alert.lastNotifiedPrice == null || isSignificantDrop(alert.lastNotifiedPrice, price, minDropPct);
  const notify = relevant && isNewLow;

  const reason: PriceEvaluation['reason'] = !notify
    ? null
    : belowTarget
      ? 'below_target'
      : 'drop';

  return {
    notify,
    reason,
    dropFromLastSeen: lastSeen != null && price < lastSeen ? lastSeen - price : null,
    historicLow: alert.minSeenPrice != null && price < alert.minSeenPrice,
  };
}

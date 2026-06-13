export type AlertStatus = 'active' | 'paused';

export interface Alert {
  id: string;
  chatId: number;
  origin: string;
  destination: string;
  /** YYYY-MM-DD */
  date: string;
  currency: string;
  targetPrice: number;
  /** Ultimo precio observado (null si nunca se ha comprobado). */
  lastSeenPrice: number | null;
  /** Ultimo precio por el que se notifico (para deduplicar mensajes). */
  lastNotifiedPrice: number | null;
  status: AlertStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UserPrefs {
  currency: string;
}

/** Estado completo persistido. */
export interface AppState {
  alerts: Alert[];
  users: Record<string, UserPrefs>;
  telegram: {
    /** Offset de getUpdates ya procesado. */
    offset: number;
  };
}

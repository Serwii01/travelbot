export type AlertStatus = 'active' | 'paused';

/** Rango de fechas inclusivo en formato YYYY-MM-DD (from === to para una fecha exacta). */
export interface DateRange {
  from: string;
  to: string;
}

/** Mejor billete encontrado para una alerta. */
export interface Deal {
  price: number;
  /** YYYY-MM-DD */
  departDate: string;
  /** YYYY-MM-DD o null si es solo ida. */
  returnDate: string | null;
  /** Codigo IATA de la aerolinea (ej. FR). */
  airline: string | null;
  /** Escalas totales (ida + vuelta). */
  transfers: number | null;
  /** Enlace de compra. */
  link: string | null;
}

export interface Alert {
  id: string;
  chatId: number;
  origin: string;
  destination: string;
  departRange: DateRange;
  /** null = solo ida. */
  returnRange: DateRange | null;
  directOnly: boolean;
  currency: string;
  targetPrice: number;
  /** Ultimo precio observado (null si nunca se ha comprobado). */
  lastSeenPrice: number | null;
  /** Ultimo precio por el que se notifico (para deduplicar mensajes). */
  lastNotifiedPrice: number | null;
  /** Precio mas bajo visto desde que existe la alerta. */
  minSeenPrice: number | null;
  /** Detalle del ultimo mejor billete visto. */
  lastDeal: Deal | null;
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

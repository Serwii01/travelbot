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

/** Ciudad o aeropuerto elegido en el asistente. */
export interface Place {
  /** Codigo IATA (ciudad o aeropuerto). */
  code: string;
  /** Nombre legible, p. ej. "Madrid, España". */
  name: string;
  isCity: boolean;
}

export type DateMode = 'day' | 'range' | 'month';

export type WizardStep =
  | 'origin'
  | 'destination'
  | 'trip'
  | 'departMode'
  | 'departPick'
  | 'returnMode'
  | 'returnPick'
  | 'price'
  | 'direct'
  | 'confirm';

/** Borrador de alerta que el asistente va rellenando paso a paso. */
export interface WizardDraft {
  step: WizardStep;
  /** Pasos anteriores, para el boton "Atras". */
  history: WizardStep[];
  /** Ultimas opciones de ciudad mostradas (para recuperar el nombre al pulsar). */
  options: Place[];
  origin?: Place;
  destination?: Place;
  roundTrip?: boolean;
  departMode?: DateMode;
  departRange?: DateRange;
  returnMode?: DateMode;
  returnRange?: DateRange;
  /** Primer dia elegido de un rango, a la espera del ultimo. */
  rangeStart?: string;
  /** Mes que se ve en el calendario (YYYY-MM). */
  calendarMonth?: string;
  targetPrice?: number;
  directOnly?: boolean;
}

/** Conversacion en curso con un chat. */
export type Session =
  | { kind: 'wizard'; draft: WizardDraft; updatedAt: string }
  | { kind: 'target'; alertId: string; messageId: number; updatedAt: string };

/** Estado completo persistido. */
export interface AppState {
  alerts: Alert[];
  users: Record<string, UserPrefs>;
  /** Conversaciones a medias por chat (asistente, cambio de precio). */
  sessions: Record<string, Session>;
  telegram: {
    /** Offset de getUpdates ya procesado. */
    offset: number;
  };
}

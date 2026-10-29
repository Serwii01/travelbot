import type { AppState, Alert, AlertStatus } from '../models/types.js';
import type { AddArgs } from '../bot/commands.js';
import { newId } from '../utils/id.js';
import { todayUtc } from '../utils/dates.js';

type AddAlertInput = AddArgs & { currency: string };

/** Operaciones de negocio sobre las alertas. Muta el estado en memoria. */
export class AlertService {
  constructor(
    private readonly state: AppState,
    private readonly defaultCurrency: string,
  ) {}

  getUserCurrency(chatId: number): string {
    return this.state.users[String(chatId)]?.currency ?? this.defaultCurrency;
  }

  setUserCurrency(chatId: number, currency: string): void {
    this.state.users[String(chatId)] = { currency };
  }

  addAlert(chatId: number, input: AddAlertInput): Alert {
    const now = new Date().toISOString();
    const ids = new Set(this.state.alerts.map((a) => a.id));
    let id = newId();
    while (ids.has(id)) id = newId();

    const alert: Alert = {
      id,
      chatId,
      origin: input.origin,
      destination: input.destination,
      departRange: input.departRange,
      returnRange: input.returnRange,
      directOnly: input.directOnly,
      currency: input.currency,
      targetPrice: input.targetPrice,
      lastSeenPrice: null,
      lastNotifiedPrice: null,
      minSeenPrice: null,
      lastDeal: null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.state.alerts.push(alert);
    return alert;
  }

  listAlerts(chatId: number): Alert[] {
    return this.state.alerts.filter((a) => a.chatId === chatId);
  }

  getAlert(chatId: number, id: string): Alert | undefined {
    return this.state.alerts.find((a) => a.chatId === chatId && a.id === id);
  }

  removeAlert(chatId: number, id: string): boolean {
    const idx = this.state.alerts.findIndex((a) => a.chatId === chatId && a.id === id);
    if (idx < 0) return false;
    this.state.alerts.splice(idx, 1);
    return true;
  }

  setStatus(chatId: number, id: string, status: AlertStatus): boolean {
    const alert = this.getAlert(chatId, id);
    if (!alert) return false;
    alert.status = status;
    alert.updatedAt = new Date().toISOString();
    return true;
  }

  /** Cambia el objetivo y reinicia la deduplicacion para volver a avisar con el nuevo umbral. */
  setTarget(chatId: number, id: string, targetPrice: number): boolean {
    const alert = this.getAlert(chatId, id);
    if (!alert) return false;
    alert.targetPrice = targetPrice;
    alert.lastNotifiedPrice = null;
    alert.updatedAt = new Date().toISOString();
    return true;
  }

  /** Quita del estado las alertas cuya ultima fecha de ida ya paso y las devuelve. */
  expireAlerts(today: string = todayUtc()): Alert[] {
    const expired = this.state.alerts.filter((a) => a.departRange.to < today);
    if (expired.length > 0) {
      this.state.alerts = this.state.alerts.filter((a) => a.departRange.to >= today);
    }
    return expired;
  }
}

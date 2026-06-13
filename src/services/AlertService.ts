import type { AppState, Alert, AlertStatus } from '../models/types';
import { newId } from '../utils/id';

interface AddAlertInput {
  origin: string;
  destination: string;
  date: string;
  targetPrice: number;
  currency: string;
}

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
    const alert: Alert = {
      id: newId(),
      chatId,
      origin: input.origin,
      destination: input.destination,
      date: input.date,
      currency: input.currency,
      targetPrice: input.targetPrice,
      lastSeenPrice: null,
      lastNotifiedPrice: null,
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

  removeAlert(chatId: number, id: string): boolean {
    const idx = this.state.alerts.findIndex((a) => a.chatId === chatId && a.id === id);
    if (idx < 0) return false;
    this.state.alerts.splice(idx, 1);
    return true;
  }

  setStatus(chatId: number, id: string, status: AlertStatus): boolean {
    const alert = this.state.alerts.find((a) => a.chatId === chatId && a.id === id);
    if (!alert) return false;
    alert.status = status;
    alert.updatedAt = new Date().toISOString();
    return true;
  }
}

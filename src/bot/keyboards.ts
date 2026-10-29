import type { Alert } from '../models/types.js';
import type { InlineButton, InlineKeyboard, ReplyKeyboard } from '../services/TelegramClient.js';
import { parseIsoDate } from '../utils/dates.js';

/** Textos del menu fijo. El router los reconoce cuando el usuario los pulsa. */
export const MENU = {
  add: '➕ Nueva alerta',
  list: '📋 Mis alertas',
  check: '🔎 Comprobar precios',
  help: '❓ Ayuda',
} as const;

export const mainMenu: ReplyKeyboard = {
  keyboard: [[{ text: MENU.add }], [{ text: MENU.list }, { text: MENU.check }], [{ text: MENU.help }]],
  resize_keyboard: true,
  is_persistent: true,
};

/** Boton que no hace nada (etiquetas del calendario, dias no disponibles). */
export const NOOP = 'noop';

export const cb = (text: string, data: string): InlineButton => ({ text, callback_data: data });
const label = (text: string): InlineButton => cb(text, NOOP);

export const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTHS_LONG_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** "2026-12" + n meses. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export const wizardFooter = (canGoBack: boolean): InlineButton[] =>
  canGoBack ? [cb('◀ Atrás', 'w:back'), cb('✖️ Cancelar', 'w:cancel')] : [cb('✖️ Cancelar', 'w:cancel')];

export interface CalendarOptions {
  /** Primer dia seleccionable (YYYY-MM-DD). */
  minDate: string;
  /** Ultimo dia seleccionable (YYYY-MM-DD). */
  maxDate: string;
  /** Dia marcado como inicio de rango. */
  rangeStart?: string;
}

/**
 * Calendario mensual con botones. Semanas de lunes a domingo.
 *   c:n:YYYY-MM     cambiar de mes
 *   c:p:YYYY-MM-DD  elegir dia
 */
export function calendarKeyboard(month: string, opts: CalendarOptions): InlineKeyboard {
  const [y, m] = month.split('-').map(Number);
  const minMonth = opts.minDate.slice(0, 7);
  const maxMonth = opts.maxDate.slice(0, 7);

  const rows: InlineKeyboard = [
    [
      month > minMonth ? cb('◀', `c:n:${addMonths(month, -1)}`) : label(' '),
      label(`${MONTHS_LONG_ES[m - 1]} ${y}`),
      month < maxMonth ? cb('▶', `c:n:${addMonths(month, 1)}`) : label(' '),
    ],
    ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(label),
  ];

  const first = parseIsoDate(`${month}-01`)!;
  const offset = (first.getUTCDay() + 6) % 7; // lunes = 0
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();

  let week: InlineButton[] = Array.from({ length: offset }, () => label(' '));
  for (let d = 1; d <= days; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    if (date < opts.minDate || date > opts.maxDate) week.push(label('·'));
    else if (date === opts.rangeStart) week.push(cb(`[${d}]`, `c:p:${date}`));
    else week.push(cb(String(d), `c:p:${date}`));
    if (week.length === 7) {
      rows.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(label(' '));
    rows.push(week);
  }
  return rows;
}

/** Proximos 12 meses desde minDate, 3 por fila. c:M:YYYY-MM elige el mes entero. */
export function monthsKeyboard(minDate: string): InlineKeyboard {
  const start = minDate.slice(0, 7);
  const rows: InlineKeyboard = [];
  for (let i = 0; i < 12; i++) {
    const month = addMonths(start, i);
    const [y, m] = month.split('-').map(Number);
    if (i % 3 === 0) rows.push([]);
    rows[rows.length - 1].push(cb(`${MONTHS_ES[m - 1]} ${String(y).slice(2)}`, `c:M:${month}`));
  }
  return rows;
}

// --- Alertas ---

const shortAlert = (a: Alert): string => {
  const price = a.lastSeenPrice != null ? ` · ${a.lastSeenPrice} ${a.currency}` : '';
  const paused = a.status === 'paused' ? '⏸️ ' : '';
  return `${paused}${a.origin}→${a.destination}${a.returnRange ? ' ⇄' : ''}${price}`;
};

/** Lista: un boton por alerta (abre el detalle) y "Nueva alerta". */
export function alertListKeyboard(alerts: Alert[]): InlineKeyboard {
  return [...alerts.map((a) => [cb(shortAlert(a), `a:v:${a.id}`)]), [cb(MENU.add, 'w:new')]];
}

/** Detalle de una alerta con sus acciones. */
export function alertDetailKeyboard(a: Alert): InlineKeyboard {
  const rows: InlineKeyboard = [];
  if (a.lastDeal?.link) rows.push([{ text: '🔗 Ver vuelo', url: a.lastDeal.link }]);
  rows.push([
    a.status === 'active' ? cb('⏸️ Pausar', `a:p:${a.id}`) : cb('▶️ Reanudar', `a:r:${a.id}`),
    cb('🎯 Cambiar precio', `a:t:${a.id}`),
  ]);
  rows.push([cb('🗑️ Borrar', `a:d:${a.id}`), cb('◀ Mis alertas', 'a:l')]);
  return rows;
}

export const confirmDeleteKeyboard = (a: Alert): InlineKeyboard => [
  [cb('✅ Sí, borrar', `a:dy:${a.id}`), cb('↩️ No', `a:v:${a.id}`)],
];

/** Botones bajo un aviso de precio. */
export function notificationKeyboard(a: Alert, link: string | null): InlineKeyboard {
  const rows: InlineKeyboard = [];
  if (link) rows.push([{ text: '🔗 Ver vuelo', url: link }]);
  rows.push([cb('⏸️ Pausar', `n:p:${a.id}`), cb('🗑️ Borrar', `n:d:${a.id}`), cb('📋 Detalle', `n:v:${a.id}`)]);
  return rows;
}

export const linkOnlyKeyboard = (link: string | null | undefined): InlineKeyboard =>
  link ? [[{ text: '🔗 Ver vuelo', url: link }]] : [];

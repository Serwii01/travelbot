import type { DateMode, DateRange, Place, WizardDraft, WizardStep } from '../models/types.js';
import type { InlineKeyboard } from '../services/TelegramClient.js';
import type { PlaceLookup } from '../services/PlacesService.js';
import type { AddArgs } from './commands.js';
import { calendarKeyboard, cb, monthsKeyboard, wizardFooter } from './keyboards.js';
import { MAX_RANGE_DAYS, formatRange, parseDateSpec } from '../utils/dates.js';
import { parsePositiveNumber } from '../utils/validation.js';

/**
 * Asistente "Nueva alerta" paso a paso con botones.
 * Logica pura: recibe el borrador y una entrada (boton o texto) y devuelve el
 * siguiente borrador; render() lo convierte en texto + botones. El router se
 * encarga de enviar/editar mensajes y guardar el borrador en la sesion.
 *
 *   origen → destino → ida/vuelta → tipo de fecha ida → calendario ida
 *   → [tipo de fecha vuelta → calendario vuelta] → precio → directos → confirmar
 */

export interface View {
  text: string;
  keyboard: InlineKeyboard;
}

export type Transition =
  | { kind: 'continue'; draft: WizardDraft; notice?: string }
  | { kind: 'done'; draft: WizardDraft }
  | { kind: 'cancel' }
  | { kind: 'ignored'; toast: string };

/** Hasta cuantos dias vista se puede elegir (los datos de vuelos no llegan mucho mas lejos). */
const MAX_AHEAD_DAYS = 365;

const addDays = (date: string, n: number): string =>
  new Date(Date.parse(date) + n * 86_400_000).toISOString().slice(0, 10);

const minDate = (a: string, b: string): string => (a < b ? a : b);

export const newDraft = (): WizardDraft => ({ step: 'origin', history: [], options: [] });

function advance(d: WizardDraft, next: WizardStep, changes: Partial<WizardDraft> = {}): WizardDraft {
  return { ...d, ...changes, history: [...d.history, d.step], step: next, options: [], rangeStart: undefined };
}

const stay = (d: WizardDraft, changes: Partial<WizardDraft>): Transition => ({
  kind: 'continue',
  draft: { ...d, ...changes },
});

/** Limites del calendario para el paso actual. */
function pickBounds(d: WizardDraft, today: string): { min: string; max: string } {
  const max = addDays(today, MAX_AHEAD_DAYS);
  const base = d.step === 'returnPick' && d.departRange ? d.departRange.from : today;
  if (d.rangeStart) return { min: d.rangeStart, max: minDate(addDays(d.rangeStart, MAX_RANGE_DAYS - 1), max) };
  return { min: base, max };
}

const modeOf = (d: WizardDraft): DateMode | undefined => (d.step === 'returnPick' ? d.returnMode : d.departMode);

/** Guarda el rango elegido y pasa al siguiente paso. */
function finishPick(d: WizardDraft, range: DateRange): Transition {
  if (d.step === 'departPick') {
    // Si cambia la ida, la vuelta elegida antes puede haber quedado invalida.
    const returnRange = d.returnRange && d.returnRange.to >= range.from ? d.returnRange : undefined;
    return { kind: 'continue', draft: advance(d, d.roundTrip ? 'returnMode' : 'price', { departRange: range, returnRange }) };
  }
  return { kind: 'continue', draft: advance(d, 'price', { returnRange: range }) };
}

export function onCallback(d: WizardDraft, data: string, today: string): Transition {
  if (data === 'w:cancel') return { kind: 'cancel' };

  if (data === 'w:back') {
    const step = d.history[d.history.length - 1];
    if (!step) return { kind: 'ignored', toast: 'Ya estás en el primer paso' };
    return stay(d, { step, history: d.history.slice(0, -1), options: [], rangeStart: undefined });
  }

  const [scope, action, value = ''] = data.split(':');
  const stale: Transition = { kind: 'ignored', toast: 'Ese botón ya no está activo' };

  if (scope === 'w') {
    switch (`${d.step}:${action}`) {
      case 'origin:o':
        return { kind: 'continue', draft: advance(d, 'destination', { origin: pickPlace(d, value) }) };
      case 'destination:d':
        if (value === d.origin?.code) return { kind: 'ignored', toast: 'El destino no puede ser el origen' };
        return { kind: 'continue', draft: advance(d, 'trip', { destination: pickPlace(d, value) }) };
      case 'trip:t':
        return { kind: 'continue', draft: advance(d, 'departMode', { roundTrip: value === 'rt' }) };
      case 'departMode:m':
        return {
          kind: 'continue',
          draft: advance(d, 'departPick', { departMode: value as DateMode, calendarMonth: today.slice(0, 7) }),
        };
      case 'returnMode:m': {
        const from = d.departRange?.from ?? today;
        return {
          kind: 'continue',
          draft: advance(d, 'returnPick', { returnMode: value as DateMode, calendarMonth: from.slice(0, 7) }),
        };
      }
      case 'direct:x':
        return { kind: 'continue', draft: advance(d, 'confirm', { directOnly: value === '1' }) };
      case 'confirm:ok':
        return { kind: 'done', draft: d };
      default:
        return stale;
    }
  }

  if (scope === 'c' && (d.step === 'departPick' || d.step === 'returnPick')) {
    const mode = modeOf(d);
    const { min, max } = pickBounds(d, today);

    if (action === 'n') return stay(d, { calendarMonth: value });

    if (action === 'M' && mode === 'month') {
      const parsed = parseDateSpec(value, min);
      if (!parsed.ok) return { kind: 'ignored', toast: 'Ese mes no está disponible' };
      return finishPick(d, parsed.value);
    }

    if (action === 'p' && mode !== 'month') {
      if (value < min || value > max) return { kind: 'ignored', toast: 'Ese día no está disponible' };
      if (mode === 'day') return finishPick(d, { from: value, to: value });
      if (!d.rangeStart) return stay(d, { rangeStart: value });
      return finishPick(d, { from: d.rangeStart, to: value });
    }
  }

  return stale;
}

export async function onText(
  d: WizardDraft,
  text: string,
  lookup: PlaceLookup,
): Promise<Transition> {
  const input = text.trim();

  if (d.step === 'origin' || d.step === 'destination') {
    let places: Place[];
    try {
      places = await lookup(input);
    } catch {
      if (!/^[A-Za-z]{3}$/.test(input)) {
        return {
          kind: 'continue',
          draft: d,
          notice: 'Ahora mismo no puedo buscar ciudades. Escribe el código de 3 letras del aeropuerto (p. ej. MAD).',
        };
      }
      places = [{ code: input.toUpperCase(), name: input.toUpperCase(), isCity: false }];
    }

    if (d.step === 'destination' && d.origin) places = places.filter((p) => p.code !== d.origin!.code);
    if (places.length === 0) {
      return { kind: 'continue', draft: { ...d, options: [] }, notice: `No encuentro «${input}». Prueba con otro nombre o con el código del aeropuerto.` };
    }

    // El buscador es difuso ("praga" tambien devuelve Barcelona, Riga…): si el nombre o el
    // codigo coinciden exactamente con lo escrito, se elige solo; si no, se ofrecen botones.
    // Tambien vale una palabra completa del nombre ("madrid" -> "Ciudad de Madrid") si solo hay una.
    const wanted = normalize(input);
    const cityName = (p: Place) => normalize(p.name.split(',')[0]);
    const byName = places.filter((p) => cityName(p) === wanted);
    const byWord = places.filter((p) => ` ${cityName(p)} `.includes(` ${wanted} `));
    const exact =
      places.find((p) => p.code === input.toUpperCase()) ??
      (byName.length === 1 ? byName[0] : byWord.length === 1 ? byWord[0] : undefined);
    const chosen = exact ?? (places.length === 1 ? places[0] : null);
    if (!chosen) return stay(d, { options: places });
    return d.step === 'origin'
      ? { kind: 'continue', draft: advance(d, 'destination', { origin: chosen }) }
      : { kind: 'continue', draft: advance(d, 'trip', { destination: chosen }) };
  }

  if (d.step === 'price') {
    const price = parsePositiveNumber(input.replace(',', '.').replace(/[€$\s]/g, ''));
    if (price == null) return { kind: 'continue', draft: d, notice: 'Escribe solo un número, por ejemplo 150.' };
    return { kind: 'continue', draft: advance(d, 'direct', { targetPrice: Math.round(price) }) };
  }

  return { kind: 'continue', draft: d, notice: 'Usa los botones de este mensaje 👇' };
}

const normalize = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

function pickPlace(d: WizardDraft, code: string): Place {
  return d.options.find((p) => p.code === code) ?? { code, name: code, isCity: false };
}

const placeLabel = (p: Place): string => (p.name === p.code ? p.code : `${p.name} (${p.code})`);

const MODE_LABEL: Record<DateMode, string> = { day: 'día concreto', range: 'varios días', month: 'mes entero' };

function summary(d: WizardDraft): string[] {
  const lines: string[] = [];
  if (d.origin) lines.push(`🛫 Desde: ${placeLabel(d.origin)}`);
  if (d.destination) lines.push(`🛬 A: ${placeLabel(d.destination)}`);
  if (d.roundTrip != null && d.step !== 'trip') lines.push(`🔁 ${d.roundTrip ? 'Ida y vuelta' : 'Solo ida'}`);
  if (d.departRange && d.step !== 'departPick') lines.push(`📅 Ida: ${formatRange(d.departRange)}`);
  if (d.returnRange && d.roundTrip && d.step !== 'returnPick') lines.push(`📅 Vuelta: ${formatRange(d.returnRange)}`);
  if (d.targetPrice != null && d.step !== 'price') lines.push(`💶 Máximo: ${d.targetPrice}`);
  if (d.directOnly != null && d.step === 'confirm') lines.push(`✈️ ${d.directOnly ? 'Solo directos' : 'Con o sin escalas'}`);
  return lines;
}

function question(d: WizardDraft, currency: string): string {
  const leg = d.step === 'returnPick' ? 'vuelta' : 'ida';
  switch (d.step) {
    case 'origin':
      return d.options.length > 0
        ? 'Elige el origen:'
        : '¿Desde dónde sales? ✍️ Escribe una ciudad o aeropuerto (p. ej. Madrid).';
    case 'destination':
      return d.options.length > 0 ? 'Elige el destino:' : '¿A dónde quieres ir? ✍️ Escribe una ciudad o aeropuerto.';
    case 'trip':
      return '¿Solo ida o ida y vuelta?';
    case 'departMode':
      return '¿Cómo son tus fechas de ida?\nCon varios días o un mes entero busco el día más barato.';
    case 'returnMode':
      return '¿Y las de vuelta?';
    case 'departPick':
    case 'returnPick': {
      const mode = modeOf(d);
      if (mode === 'month') return `Elige el mes de ${leg}:`;
      if (mode === 'day') return `Elige el día de ${leg}:`;
      return d.rangeStart
        ? `Desde el ${d.rangeStart}. Ahora elige el último día de ${leg} (máx. ${MAX_RANGE_DAYS} días):`
        : `Elige el primer día posible de ${leg}:`;
    }
    case 'price':
      return `¿Cuál es tu precio máximo en ${currency}? ✍️ Escribe un número (p. ej. 150).\nTe aviso cuando baje de ahí o cuando baje bastante.`;
    case 'direct':
      return '¿Solo vuelos directos?';
    case 'confirm':
      return '¿Creo la alerta?';
  }
}

function stepKeyboard(d: WizardDraft, today: string): InlineKeyboard {
  switch (d.step) {
    case 'origin':
      return d.options.map((p) => [cb(placeLabel(p), `w:o:${p.code}`)]);
    case 'destination':
      return d.options.map((p) => [cb(placeLabel(p), `w:d:${p.code}`)]);
    case 'trip':
      return [[cb('➡️ Solo ida', 'w:t:ow'), cb('🔁 Ida y vuelta', 'w:t:rt')]];
    case 'departMode':
    case 'returnMode':
      return [
        [cb(`📅 Un ${MODE_LABEL.day}`, 'w:m:day')],
        [cb('↔️ Varios días (el más barato)', 'w:m:range')],
        [cb(`🗓️ Un ${MODE_LABEL.month}`, 'w:m:month')],
      ];
    case 'departPick':
    case 'returnPick': {
      const { min, max } = pickBounds(d, today);
      if (modeOf(d) === 'month') return monthsKeyboard(min);
      const month = d.calendarMonth && d.calendarMonth >= min.slice(0, 7) ? d.calendarMonth : min.slice(0, 7);
      return calendarKeyboard(month, { minDate: min, maxDate: max, rangeStart: d.rangeStart });
    }
    case 'price':
      return [];
    case 'direct':
      return [[cb('✈️ Solo directos', 'w:x:1'), cb('🔀 Me da igual', 'w:x:0')]];
    case 'confirm':
      return [[cb('✅ Crear alerta', 'w:ok')]];
  }
}

export function render(d: WizardDraft, today: string, currency: string, notice?: string): View {
  const parts = ['✈️ Nueva alerta'];
  const lines = summary(d);
  if (lines.length > 0) parts.push(lines.join('\n'));
  if (notice) parts.push(`⚠️ ${notice}`);
  parts.push(question(d, currency));
  return {
    text: parts.join('\n\n'),
    keyboard: [...stepKeyboard(d, today), wizardFooter(d.history.length > 0)],
  };
}

/** Convierte un borrador completo en los datos de /add. */
export function draftToAddArgs(d: WizardDraft): AddArgs | null {
  if (!d.origin || !d.destination || !d.departRange || d.targetPrice == null) return null;
  if (d.roundTrip && !d.returnRange) return null;
  return {
    origin: d.origin.code,
    destination: d.destination.code,
    departRange: d.departRange,
    returnRange: d.roundTrip ? d.returnRange! : null,
    directOnly: d.directOnly ?? false,
    targetPrice: d.targetPrice,
  };
}

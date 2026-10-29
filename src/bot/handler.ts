import { AlertService } from '../services/AlertService.js';
import { formatAlertCreated, formatAlertList } from '../services/MessageFormatter.js';
import { parseAddArgs, type ParsedCommand } from './commands.js';
import { isCurrency, parsePositiveNumber } from '../utils/validation.js';

const HELP = [
  'Comandos disponibles:',
  '',
  '/add ORIGEN DESTINO IDA [VUELTA] precioMax [directo]',
  '  Fechas: 2026-08-20 · 2026-08-15..2026-08-25 · 2026-08 (mes entero)',
  '  /add MAD PRG 2026-08-20 120',
  '  /add MAD PRG 2026-08-15..2026-08-20 2026-08-22..2026-08-27 200',
  '  /add MAD LON 2026-09 2026-09 150 directo',
  '',
  '/list  — ver tus alertas y el mejor precio actual',
  '/target ID precio  — cambiar el precio objetivo',
  '/remove ID  — eliminar una alerta',
  '/pause ID · /resume ID  — pausar / reactivar',
  '/setcurrency EUR  — moneda de nuevas alertas',
  '/checknow  — comprobar precios ahora',
  '/help  — esta ayuda',
  '',
  'Con un rango o un mes busco el día más barato dentro de él.',
  'Las alertas se borran solas cuando pasa la fecha de ida.',
].join('\n');

const START = [
  '👋 ¡Hola! Soy tu bot de alertas de precios de vuelos.',
  'Vigilo rutas y te aviso cuando el precio baja o cae por debajo de tu objetivo.',
  '',
  HELP,
].join('\n');

export interface CommandResult {
  reply: string;
  /** El usuario pidio /checknow: hay que lanzar una comprobacion y mandarle el resumen. */
  wantsCheck?: boolean;
}

/**
 * Despacha un comando ya parseado y devuelve el texto de respuesta.
 * Funcion sincrona y sin red: la persistencia y el envio se hacen fuera.
 */
export function handleCommand(service: AlertService, cmd: ParsedCommand, chatId: number): CommandResult {
  const id = cmd.args[0]?.replace(/^#/, '');

  switch (cmd.name) {
    case 'start':
      return { reply: START };

    case 'help':
      return { reply: HELP };

    case 'add': {
      const parsed = parseAddArgs(cmd.args);
      if (!parsed.ok) return { reply: parsed.error };
      const currency = service.getUserCurrency(chatId);
      const alert = service.addAlert(chatId, { ...parsed.value, currency });
      return { reply: `${formatAlertCreated(alert)}\n\nUsa /checknow para ver el precio ya.` };
    }

    case 'list':
      return { reply: formatAlertList(service.listAlerts(chatId)) };

    case 'target': {
      const price = parsePositiveNumber(cmd.args[1] ?? '');
      if (!id || price == null) return { reply: 'Uso: /target ID precio' };
      return {
        reply: service.setTarget(chatId, id, Math.round(price))
          ? `🎯 Objetivo de #${id}: ${Math.round(price)}.`
          : `No encontré la alerta #${id}.`,
      };
    }

    case 'remove': {
      if (!id) return { reply: 'Uso: /remove ID' };
      return {
        reply: service.removeAlert(chatId, id) ? `🗑️ Alerta #${id} eliminada.` : `No encontré la alerta #${id}.`,
      };
    }

    case 'pause': {
      if (!id) return { reply: 'Uso: /pause ID' };
      return {
        reply: service.setStatus(chatId, id, 'paused') ? `⏸️ Alerta #${id} pausada.` : `No encontré la alerta #${id}.`,
      };
    }

    case 'resume': {
      if (!id) return { reply: 'Uso: /resume ID' };
      return {
        reply: service.setStatus(chatId, id, 'active')
          ? `▶️ Alerta #${id} reactivada.`
          : `No encontré la alerta #${id}.`,
      };
    }

    case 'setcurrency': {
      const cur = cmd.args[0];
      if (!cur || !isCurrency(cur)) return { reply: 'Uso: /setcurrency EUR (código de 3 letras)' };
      service.setUserCurrency(chatId, cur.toUpperCase());
      return { reply: `💱 Moneda por defecto: ${cur.toUpperCase()} (se aplica a nuevas alertas).` };
    }

    case 'checknow':
      if (service.listAlerts(chatId).length === 0) return { reply: formatAlertList([]) };
      return { reply: '🔎 Comprobando precios… te mando el resumen en un momento.', wantsCheck: true };

    default:
      return { reply: 'Comando no reconocido. Usa /help.' };
  }
}

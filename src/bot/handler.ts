import { AlertService } from '../services/AlertService';
import { formatAlertList } from '../services/MessageFormatter';
import { parseAddArgs, type ParsedCommand } from './commands';
import { isCurrency } from '../utils/validation';

const HELP = [
  'Comandos disponibles:',
  '/add ORG DEST YYYY-MM-DD precioMax  — crear alerta (ej. /add MAD PRG 2026-08-20 120)',
  '/list  — ver tus alertas',
  '/remove ID  — eliminar una alerta',
  '/pause ID  — pausar una alerta',
  '/resume ID  — reactivar una alerta',
  '/setcurrency EUR  — moneda por defecto de nuevas alertas',
  '/checknow  — forzar comprobación',
  '/help  — esta ayuda',
].join('\n');

const START = [
  '👋 ¡Hola! Soy tu bot de alertas de precios de vuelos.',
  'Vigilo rutas y te aviso cuando el precio baja o cae por debajo de tu objetivo.',
  '',
  HELP,
].join('\n');

/**
 * Despacha un comando ya parseado y devuelve el texto de respuesta.
 * Funcion sincrona y sin red: la persistencia y el envio se hacen fuera.
 */
export function handleCommand(
  service: AlertService,
  cmd: ParsedCommand,
  chatId: number,
): string {
  switch (cmd.name) {
    case 'start':
      return START;

    case 'help':
      return HELP;

    case 'add': {
      const parsed = parseAddArgs(cmd.args);
      if (!parsed.ok) return parsed.error;
      const currency = service.getUserCurrency(chatId);
      const alert = service.addAlert(chatId, { ...parsed.value, currency });
      return [
        `✅ Alerta creada (#${alert.id})`,
        `${alert.origin} -> ${alert.destination}`,
        `Fecha: ${alert.date}`,
        `Objetivo: ${alert.targetPrice} ${alert.currency}`,
      ].join('\n');
    }

    case 'list':
      return formatAlertList(service.listAlerts(chatId));

    case 'remove': {
      const id = cmd.args[0];
      if (!id) return 'Uso: /remove ID';
      return service.removeAlert(chatId, id)
        ? `🗑️ Alerta #${id} eliminada.`
        : `No encontré la alerta #${id}.`;
    }

    case 'pause': {
      const id = cmd.args[0];
      if (!id) return 'Uso: /pause ID';
      return service.setStatus(chatId, id, 'paused')
        ? `⏸️ Alerta #${id} pausada.`
        : `No encontré la alerta #${id}.`;
    }

    case 'resume': {
      const id = cmd.args[0];
      if (!id) return 'Uso: /resume ID';
      return service.setStatus(chatId, id, 'active')
        ? `▶️ Alerta #${id} reactivada.`
        : `No encontré la alerta #${id}.`;
    }

    case 'setcurrency': {
      const cur = cmd.args[0];
      if (!cur || !isCurrency(cur)) return 'Uso: /setcurrency EUR (código de 3 letras)';
      service.setUserCurrency(chatId, cur.toUpperCase());
      return `💱 Moneda por defecto: ${cur.toUpperCase()} (se aplica a nuevas alertas).`;
    }

    case 'checknow':
      // El job comprueba precios justo despues de procesar comandos en la misma
      // ejecucion, asi que aqui basta con confirmar.
      return '🔎 Comprobación en curso. Te avisaré si hay una bajada o precio bajo tu objetivo.';

    default:
      return 'Comando no reconocido. Usa /help.';
  }
}

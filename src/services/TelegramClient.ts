export interface TelegramChat {
  id: number;
}
export interface TelegramMessage {
  message_id: number;
  text?: string;
  chat?: TelegramChat;
}
export interface TelegramCallbackQuery {
  id: string;
  data?: string;
  message?: TelegramMessage;
}
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export type InlineButton = { text: string; callback_data: string } | { text: string; url: string };
export type InlineKeyboard = InlineButton[][];

/** Teclado fijo bajo la caja de texto (menu principal). */
export interface ReplyKeyboard {
  keyboard: { text: string }[][];
  resize_keyboard?: boolean;
  is_persistent?: boolean;
}

export interface SendOptions {
  /** Botones bajo el mensaje. */
  keyboard?: InlineKeyboard;
  /** Menu fijo bajo la caja de texto. */
  replyKeyboard?: ReplyKeyboard;
}

const MAX_MESSAGE = 4000; // Telegram admite 4096

/** Parte un texto largo por bloques (lineas en blanco) sin pasar del limite. */
export function splitMessage(text: string, max = MAX_MESSAGE): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let current = '';
  for (const block of text.split('\n\n')) {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length <= max) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    current = block;
    while (current.length > max) {
      chunks.push(current.slice(0, max));
      current = current.slice(max);
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

class TelegramError extends Error {
  constructor(
    readonly method: string,
    readonly status: number,
    readonly description: string,
  ) {
    super(`${method} ${status}: ${description.slice(0, 200)}`);
  }
}

/** Cliente minimo de la Bot API. */
export class TelegramClient {
  private readonly base: string;

  constructor(token: string) {
    this.base = `https://api.telegram.org/bot${token}`;
  }

  private async call<T>(method: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${this.base}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (!res.ok || !data.ok) throw new TelegramError(method, res.status, data.description ?? 'error desconocido');
    return data.result as T;
  }

  /** Envia un mensaje (troceado si es largo) y devuelve el id del ultimo trozo. */
  async sendMessage(chatId: number, text: string, opts: SendOptions = {}): Promise<number> {
    const chunks = splitMessage(text);
    let messageId = 0;
    for (let i = 0; i < chunks.length; i++) {
      const last = i === chunks.length - 1;
      const body: Record<string, unknown> = { chat_id: chatId, text: chunks[i], disable_web_page_preview: true };
      if (last && opts.keyboard) body.reply_markup = { inline_keyboard: opts.keyboard };
      else if (last && opts.replyKeyboard) body.reply_markup = opts.replyKeyboard;
      messageId = (await this.call<TelegramMessage>('sendMessage', body)).message_id;
    }
    return messageId;
  }

  /** Sustituye texto y botones de un mensaje ya enviado. */
  async editMessageText(chatId: number, messageId: number, text: string, keyboard?: InlineKeyboard): Promise<void> {
    try {
      await this.call('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: splitMessage(text)[0],
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: keyboard ?? [] },
      });
    } catch (err) {
      if (!isNotModified(err)) throw err;
    }
  }

  /** Cambia solo los botones de un mensaje (sin botones si keyboard esta vacio). */
  async editMessageReplyMarkup(chatId: number, messageId: number, keyboard: InlineKeyboard): Promise<void> {
    try {
      await this.call('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch (err) {
      if (!isNotModified(err)) throw err;
    }
  }

  /** Quita el "cargando" del boton pulsado; con texto muestra un aviso breve. */
  async answerCallbackQuery(id: string, text?: string): Promise<void> {
    await this.call('answerCallbackQuery', text ? { callback_query_id: id, text } : { callback_query_id: id });
  }

  /** Lista de comandos que Telegram sugiere al escribir "/". */
  async setMyCommands(commands: { command: string; description: string }[]): Promise<void> {
    await this.call('setMyCommands', { commands });
  }

  /**
   * Devuelve updates pendientes desde offset.
   * timeout = 0 -> short-poll (modo cron); timeout > 0 -> long-poll (modo 24/7):
   * Telegram mantiene la conexion abierta hasta que llega un mensaje o vence el timeout.
   */
  async getUpdates(offset: number, timeout = 0, signal?: AbortSignal): Promise<TelegramUpdate[]> {
    const deadline = AbortSignal.timeout((timeout + 15) * 1000);
    try {
      return await this.call<TelegramUpdate[]>(
        'getUpdates',
        { offset, timeout, allowed_updates: ['message', 'callback_query'] },
        signal ? AbortSignal.any([signal, deadline]) : deadline,
      );
    } catch (err) {
      if (err instanceof TelegramError && err.status === 409) {
        throw new Error(`${err.message} (otra instancia del bot está leyendo mensajes: ¿sigue activo el workflow de GitHub?)`);
      }
      throw err;
    }
  }
}

const isNotModified = (err: unknown): boolean =>
  err instanceof TelegramError && err.description.includes('message is not modified');

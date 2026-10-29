export interface TelegramChat {
  id: number;
}
export interface TelegramMessage {
  text?: string;
  chat?: TelegramChat;
}
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
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

export interface SendOptions {
  /** Boton bajo el mensaje que abre esta URL. */
  button?: { text: string; url: string };
}

/** Cliente minimo de la Bot API (solo lo que usamos: sendMessage + getUpdates). */
export class TelegramClient {
  private readonly base: string;

  constructor(token: string) {
    this.base = `https://api.telegram.org/bot${token}`;
  }

  /** Envia un mensaje; si supera el limite de Telegram lo trocea por bloques. */
  async sendMessage(chatId: number, text: string, opts: SendOptions = {}): Promise<void> {
    const chunks = splitMessage(text);
    for (let i = 0; i < chunks.length; i++) {
      await this.sendChunk(chatId, chunks[i], i === chunks.length - 1 ? opts : {});
    }
  }

  private async sendChunk(chatId: number, text: string, opts: SendOptions): Promise<void> {
    const body: Record<string, unknown> = { chat_id: chatId, text, disable_web_page_preview: true };
    if (opts.button) body.reply_markup = { inline_keyboard: [[opts.button]] };

    const res = await fetch(`${this.base}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`sendMessage ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  }

  /**
   * Devuelve updates pendientes desde offset.
   * timeout = 0 -> short-poll (modo cron); timeout > 0 -> long-poll (modo 24/7):
   * Telegram mantiene la conexion abierta hasta que llega un mensaje o vence el timeout.
   */
  async getUpdates(offset: number, timeout = 0, signal?: AbortSignal): Promise<TelegramUpdate[]> {
    const url = new URL(`${this.base}/getUpdates`);
    url.searchParams.set('timeout', String(timeout));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('allowed_updates', JSON.stringify(['message']));

    const deadline = AbortSignal.timeout((timeout + 15) * 1000);
    const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
    if (!res.ok) {
      const hint =
        res.status === 409 ? ' (otra instancia del bot está leyendo mensajes: ¿sigue activo el workflow de GitHub?)' : '';
      throw new Error(`getUpdates ${res.status}${hint}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as { result?: TelegramUpdate[] };
    return data.result ?? [];
  }
}

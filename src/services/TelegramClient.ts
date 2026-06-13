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

/** Cliente minimo de la Bot API (solo lo que usamos: sendMessage + getUpdates). */
export class TelegramClient {
  private readonly base: string;

  constructor(token: string) {
    this.base = `https://api.telegram.org/bot${token}`;
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    const res = await fetch(`${this.base}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!res.ok) {
      throw new Error(`sendMessage ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  }

  /** Short-poll: devuelve updates pendientes desde offset y retorna de inmediato. */
  async getUpdates(offset: number, timeout = 0): Promise<TelegramUpdate[]> {
    const url = new URL(`${this.base}/getUpdates`);
    url.searchParams.set('timeout', String(timeout));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('allowed_updates', JSON.stringify(['message']));

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`getUpdates ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as { result?: TelegramUpdate[] };
    return data.result ?? [];
  }
}

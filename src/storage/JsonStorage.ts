import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { StorageProvider } from './StorageProvider.js';
import type { Alert, AppState } from '../models/types.js';

const emptyState = (): AppState => ({ alerts: [], users: {}, sessions: {}, telegram: { offset: 0 } });

/** Alertas guardadas por versiones anteriores (fecha unica `date`, sin rangos). */
type StoredAlert = Partial<Alert> & { date?: string };

function migrateAlert(a: StoredAlert): Alert {
  const departRange = a.departRange ?? { from: a.date!, to: a.date! };
  return {
    id: a.id!,
    chatId: a.chatId!,
    origin: a.origin!,
    destination: a.destination!,
    departRange,
    returnRange: a.returnRange ?? null,
    directOnly: a.directOnly ?? false,
    currency: a.currency ?? 'EUR',
    targetPrice: a.targetPrice!,
    lastSeenPrice: a.lastSeenPrice ?? null,
    lastNotifiedPrice: a.lastNotifiedPrice ?? null,
    minSeenPrice: a.minSeenPrice ?? a.lastSeenPrice ?? null,
    lastDeal: a.lastDeal ?? null,
    status: a.status ?? 'active',
    createdAt: a.createdAt ?? new Date().toISOString(),
    updatedAt: a.updatedAt ?? new Date().toISOString(),
  };
}

/**
 * Estado en un fichero JSON.
 * Escritura atomica (fichero temporal + rename) y serializada, para que un corte
 * o dos guardados seguidos nunca dejen el fichero a medias.
 */
export class JsonStorage implements StorageProvider {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  async load(): Promise<AppState> {
    try {
      const raw = await readFile(this.file, 'utf8');
      const data = JSON.parse(raw) as Partial<Omit<AppState, 'alerts'>> & { alerts?: StoredAlert[] };
      return {
        alerts: (data.alerts ?? []).map(migrateAlert),
        users: data.users ?? {},
        sessions: data.sessions ?? {},
        telegram: { offset: data.telegram?.offset ?? 0 },
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyState();
      throw err;
    }
  }

  save(state: AppState): Promise<void> {
    const json = JSON.stringify(state, null, 2) + '\n';
    const write = async () => {
      await mkdir(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, json, 'utf8');
      await rename(tmp, this.file);
    };
    const next = this.queue.then(write, write);
    this.queue = next.catch(() => {});
    return next;
  }
}

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { StorageProvider } from './StorageProvider';
import type { AppState } from '../models/types';

const emptyState = (): AppState => ({ alerts: [], users: {}, telegram: { offset: 0 } });

export class JsonStorage implements StorageProvider {
  constructor(private readonly file: string) {}

  async load(): Promise<AppState> {
    try {
      const raw = await readFile(this.file, 'utf8');
      const data = JSON.parse(raw) as Partial<AppState>;
      return {
        alerts: data.alerts ?? [],
        users: data.users ?? {},
        telegram: { offset: data.telegram?.offset ?? 0 },
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyState();
      throw err;
    }
  }

  async save(state: AppState): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(state, null, 2) + '\n', 'utf8');
  }
}

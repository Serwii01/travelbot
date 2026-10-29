import type { AppState } from '../models/types.js';

/**
 * Capa de almacenamiento abstracta.
 * Implementacion actual: JSON en fichero (committeado por GitHub Actions).
 * Para migrar a Postgres/SQLite basta con crear otra clase que cumpla esta interfaz.
 */
export interface StorageProvider {
  load(): Promise<AppState>;
  save(state: AppState): Promise<void>;
}

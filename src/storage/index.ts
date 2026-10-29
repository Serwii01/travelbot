import { config } from '../config.js';
import type { StorageProvider } from './StorageProvider.js';
import { JsonStorage } from './JsonStorage.js';

/** Factory: cambia aqui para enchufar otro backend de almacenamiento. */
export function createStorage(): StorageProvider {
  switch (config.storage) {
    case 'json':
    default:
      return new JsonStorage(config.dataFile);
  }
}

export type { StorageProvider };

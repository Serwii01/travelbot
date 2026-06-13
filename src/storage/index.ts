import { config } from '../config';
import type { StorageProvider } from './StorageProvider';
import { JsonStorage } from './JsonStorage';

/** Factory: cambia aqui para enchufar otro backend de almacenamiento. */
export function createStorage(): StorageProvider {
  switch (config.storage) {
    case 'json':
    default:
      return new JsonStorage(config.dataFile);
  }
}

export type { StorageProvider };

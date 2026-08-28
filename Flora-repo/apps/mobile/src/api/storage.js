/**
 * Storage abstraction for the mock client.
 *
 * The real Expo app registers AsyncStorage at startup via setPersistentStorage();
 * until then (and in node/Vitest, where React Native storage cannot run) an
 * in-memory AsyncStorage-compatible fallback is used.
 */

/**
 * Create an AsyncStorage-compatible in-memory store.
 * @returns {{ getItem(key: string): Promise<string|null>, setItem(key: string, value: string): Promise<void>, removeItem(key: string): Promise<void> }}
 */
export function createMemoryStorage() {
  const items = new Map();
  return {
    async getItem(key) {
      return items.has(key) ? items.get(key) : null;
    },
    async setItem(key, value) {
      items.set(key, String(value));
    },
    async removeItem(key) {
      items.delete(key);
    },
  };
}

const fallbackStorage = createMemoryStorage();
let persistentStorage = null;

/**
 * Register the real persistent storage (e.g. AsyncStorage from the Expo app entry).
 * @param {{ getItem: Function, setItem: Function, removeItem: Function }} storage
 */
export function setPersistentStorage(storage) {
  persistentStorage = storage;
}

/**
 * The storage the default mock client persists to — the registered persistent
 * storage if the app provided one, otherwise the in-memory fallback.
 */
export function getPersistentStorage() {
  return persistentStorage ?? fallbackStorage;
}

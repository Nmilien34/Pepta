// In-memory AsyncStorage stand-in for tests. `setup.ts` mocks
// @react-native-async-storage/async-storage with this so context/persistence
// tests can assert what was written. `clear()` between tests for isolation.

type Store = Record<string, string>;

let store: Store = {};

export const testStorage = {
  async getItem(key: string): Promise<string | null> {
    return store[key] ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    store[key] = value;
  },
  async removeItem(key: string): Promise<void> {
    delete store[key];
  },
  async multiRemove(keys: string[]): Promise<void> {
    for (const key of keys) {
      delete store[key];
    }
  },
  clear(): void {
    store = {};
  },
  snapshot(): Store {
    return { ...store };
  },
};

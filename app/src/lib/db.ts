/**
 * The local key-value store behind store.ts. This file is the web build:
 * IndexedDB, shared by the page and the service worker. Metro picks
 * db.native.ts (SQLite) for the apps.
 */
import { openDB, type IDBPDatabase } from 'idb';
import { KEY_PATHS, type KeyValueDb } from './db-schema';

export type { KeyValueDb, OriginStore, StoreName } from './db-schema';

const DB_NAME = 'keryx';
const DB_VERSION = 5;

let dbPromise: Promise<IDBPDatabase> | null = null;

function idb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // previous layouts are incompatible: drop and rebuild rather than
      // attempt an unreliable migration
      if (oldVersion > 0) {
        for (const name of Array.from(db.objectStoreNames)) db.deleteObjectStore(name);
      }
      for (const [name, keyPath] of Object.entries(KEY_PATHS)) {
        const store = db.createObjectStore(name, { keyPath });
        if (name === 'items' || name === 'media') store.createIndex('by-origin', 'origin');
      }
    },
  });
  return dbPromise;
}

export function openAppDb(): KeyValueDb {
  return {
    async get(store, key) {
      return (await idb()).get(store, key);
    },
    async getAll(store) {
      return (await idb()).getAll(store);
    },
    async getAllByOrigin(store, origin) {
      return (await idb()).getAllFromIndex(store, 'by-origin', origin);
    },
    async putMany(store, values) {
      const tx = (await idb()).transaction(store, 'readwrite');
      await Promise.all([...values.map((v) => tx.store.put(v)), tx.done]);
    },
    async deleteMany(store, keys) {
      const tx = (await idb()).transaction(store, 'readwrite');
      await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done]);
    },
    async deleteByOrigin(store, origin) {
      const tx = (await idb()).transaction(store, 'readwrite');
      let cursor = await tx.store.index('by-origin').openCursor(IDBKeyRange.only(origin));
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
      await tx.done;
    },
    async update(store, key, next, changes = []) {
      const tx = (await idb()).transaction([...new Set([store, ...changes.map((c) => c.store)])], 'readwrite');
      const value = next(await tx.objectStore(store).get(key));
      if (value !== undefined) {
        await tx.objectStore(store).put(value);
        for (const change of changes) {
          const target = tx.objectStore(change.store);
          for (const record of change.put ?? []) await target.put(record);
          for (const id of change.remove ?? []) await target.delete(id);
        }
      }
      await tx.done;
      return value !== undefined;
    },
  };
}

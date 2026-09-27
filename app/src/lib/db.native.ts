/**
 * The local key-value store on the apps: one SQLite table per store, each row
 * the JSON of one record. Byte fields (cached media) are stored as base64.
 */
import * as SQLite from 'expo-sqlite';
import { base64urlToBytes, bytesToBase64url } from './bytes';
import { KEY_PATHS, type KeyValueDb, type StoreName } from './db-schema';

const BYTES = '$bytes';

function encode(value: object): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v instanceof ArrayBuffer ? { [BYTES]: bytesToBase64url(new Uint8Array(v)) } : v,
  );
}

function decode<T>(store: StoreName, json: string): T {
  const value = JSON.parse(json);
  if (store === 'media' && value.bytes?.[BYTES]) {
    value.bytes = base64urlToBytes(value.bytes[BYTES]).slice().buffer;
  }
  return value as T;
}

// Expo's iOS SQLite binding uses NUL-terminated strings; compound keys contain NULs.
const storageKey = (key: string): string => JSON.stringify(key);

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function sqlite(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const db = await SQLite.openDatabaseAsync('keryx.db');
    await db.execAsync(
      Object.keys(KEY_PATHS)
        .map(
          (store) =>
            `CREATE TABLE IF NOT EXISTS ${store} (key TEXT PRIMARY KEY NOT NULL, origin TEXT, value TEXT NOT NULL);` +
            `CREATE INDEX IF NOT EXISTS ${store}_origin ON ${store} (origin);`,
        )
        .join(''),
    );
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if (!version?.user_version) {
      await db.withExclusiveTransactionAsync(async (txn) => {
        for (const store of Object.keys(KEY_PATHS) as StoreName[]) {
          const rows = await txn.getAllAsync<Row>(`SELECT value FROM ${store}`);
          await txn.runAsync(`DELETE FROM ${store}`);
          for (const row of rows) await put(txn, store, decode(store, row.value));
        }
        await txn.execAsync('PRAGMA user_version = 1');
      });
    }
    return db;
  })();
  return dbPromise;
}

type Row = { value: string };

async function put(db: SQLite.SQLiteDatabase, store: StoreName, value: object): Promise<void> {
  const record = value as Record<string, unknown>;
  const origin = typeof record.origin === 'string' ? record.origin : null;
  await db.runAsync(
    `INSERT OR REPLACE INTO ${store} (key, origin, value) VALUES (?, ?, ?)`,
    storageKey(String(record[KEY_PATHS[store]])),
    origin,
    encode(value),
  );
}

let writes: Promise<unknown> = Promise.resolve();

function write<T>(action: (txn: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const result = writes.then(async () => {
    const db = await sqlite();
    let value!: T;
    await db.withExclusiveTransactionAsync(async (txn) => { value = await action(txn); });
    return value;
  });
  writes = result.catch(() => undefined);
  return result;
}

export function openAppDb(): KeyValueDb {
  return {
    async get(store, key) {
      const row = await (await sqlite()).getFirstAsync<Row>(`SELECT value FROM ${store} WHERE key = ?`, storageKey(key));
      return row ? decode(store, row.value) : undefined;
    },
    async getAll(store) {
      const rows = await (await sqlite()).getAllAsync<Row>(`SELECT value FROM ${store} ORDER BY key`);
      return rows.map((r) => decode(store, r.value));
    },
    async getAllByOrigin(store, origin) {
      const rows = await (await sqlite()).getAllAsync<Row>(`SELECT value FROM ${store} WHERE origin = ? ORDER BY key`, origin);
      return rows.map((r) => decode(store, r.value));
    },
    putMany(store, values) {
      return write(async (txn) => {
        for (const value of values) await put(txn, store, value);
      });
    },
    deleteMany(store, keys) {
      return write(async (txn) => {
        for (const key of keys) await txn.runAsync(`DELETE FROM ${store} WHERE key = ?`, storageKey(key));
      });
    },
    deleteByOrigin(store, origin) {
      return write(async (txn) => { await txn.runAsync(`DELETE FROM ${store} WHERE origin = ?`, origin); });
    },
    update(store, key, next) {
      return write(async (txn) => {
        const row = await txn.getFirstAsync<Row>(`SELECT value FROM ${store} WHERE key = ?`, storageKey(key));
        const value = next(row ? decode(store, row.value) : undefined);
        if (value === undefined) return false;
        await put(txn, store, value);
        return true;
      });
    },
  };
}

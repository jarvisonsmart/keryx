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

function decode<T>(json: string): T {
  return JSON.parse(json, (_key, v: unknown) => {
    if (v && typeof v === 'object' && BYTES in v) {
      return base64urlToBytes((v as Record<string, string>)[BYTES]).slice().buffer;
    }
    return v;
  }) as T;
}

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
    String(record[KEY_PATHS[store]]),
    origin,
    encode(value),
  );
}

export function openAppDb(): KeyValueDb {
  return {
    async get(store, key) {
      const row = await (await sqlite()).getFirstAsync<Row>(`SELECT value FROM ${store} WHERE key = ?`, key);
      return row ? decode(row.value) : undefined;
    },
    async getAll(store) {
      const rows = await (await sqlite()).getAllAsync<Row>(`SELECT value FROM ${store} ORDER BY key`);
      return rows.map((r) => decode(r.value));
    },
    async getAllByOrigin(store, origin) {
      const rows = await (await sqlite()).getAllAsync<Row>(`SELECT value FROM ${store} WHERE origin = ? ORDER BY key`, origin);
      return rows.map((r) => decode(r.value));
    },
    async putMany(store, values) {
      const db = await sqlite();
      await db.withExclusiveTransactionAsync(async (txn) => {
        for (const value of values) await put(txn, store, value);
      });
    },
    async deleteMany(store, keys) {
      const db = await sqlite();
      await db.withExclusiveTransactionAsync(async (txn) => {
        for (const key of keys) await txn.runAsync(`DELETE FROM ${store} WHERE key = ?`, key);
      });
    },
    async deleteByOrigin(store, origin) {
      await (await sqlite()).runAsync(`DELETE FROM ${store} WHERE origin = ?`, origin);
    },
    async update(store, key, next) {
      let wrote = false;
      const db = await sqlite();
      await db.withExclusiveTransactionAsync(async (txn) => {
        const row = await txn.getFirstAsync<Row>(`SELECT value FROM ${store} WHERE key = ?`, key);
        const value = next(row ? decode(row.value) : undefined);
        if (value === undefined) return;
        await put(txn, store, value);
        wrote = true;
      });
      return wrote;
    },
  };
}

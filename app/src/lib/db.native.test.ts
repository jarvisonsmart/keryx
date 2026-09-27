import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite', () => ({
  async openDatabaseAsync() {
    const db = new DatabaseSync(':memory:');
    // The iOS bridge binds strings with length -1, ending at the first NUL.
    const args = (values: SQLInputValue[]) => values.map((v) => typeof v === 'string' ? v.split('\0')[0] : v);
    let writing = false;
    const adapter = {
      async execAsync(sql: string) { db.exec(sql); },
      async runAsync(sql: string, ...values: SQLInputValue[]) { return db.prepare(sql).run(...args(values)); },
      async getFirstAsync(sql: string, ...values: SQLInputValue[]) { return db.prepare(sql).get(...args(values)); },
      async getAllAsync(sql: string, ...values: SQLInputValue[]) { return db.prepare(sql).all(...args(values)); },
      async withExclusiveTransactionAsync(fn: (txn: unknown) => Promise<void>) {
        if (writing) throw new Error('database is locked');
        writing = true;
        try { await fn(adapter); } finally { writing = false; }
      },
    };
    return adapter;
  },
}));

import { openAppDb } from './db.native';

describe('SQLite persistence', () => {
  it('keeps item and relay keys distinct through write, read, update and delete', async () => {
    const db = openAppDb();
    const first = { id: 'https://test.example\0public:news\0one', origin: 'https://test.example', read: false };
    const second = { ...first, id: 'https://test.example\0public:news\0two' };
    await db.putMany('items', [first, second]);
    expect(await db.getAllByOrigin('items', first.origin)).toHaveLength(2);
    await db.update<typeof first>('items', first.id, (v) => v && { ...v, read: true });
    expect(await db.get('items', first.id)).toEqual({ ...first, read: true });
    expect(await db.get('items', second.id)).toEqual(second);
    await db.deleteMany('items', [first.id]);
    expect(await db.get('items', second.id)).toEqual(second);
    const records = [{ key: 'seq\0a', value: 7 }, { key: 'seq\0b', value: 9 }];
    await db.putMany('relay', records);
    expect(await db.get('relay', records[0].key)).toEqual(records[0]);
  });

  it('serializes simultaneous writes and replay updates', async () => {
    const db = openAppDb();
    await Promise.all(Array.from({ length: 8 }, (_, i) => db.putMany('relay', [{ key: `parallel-${i}`, seq: i }])));
    await Promise.all(Array.from({ length: 8 }, () => db.update<{ key: string; seq: number }>('relay', 'parallel-0',
      (row) => row && { ...row, seq: row.seq + 1 })));
    expect(await db.get('relay', 'parallel-0')).toEqual({ key: 'parallel-0', seq: 8 });
  });

  it('commits related item writes only when the company comparison succeeds', async () => {
    const db = openAppDb();
    const company = { origin: 'race', revision: 2 };
    const item = { id: 'race-item', origin: 'race' };
    await db.putMany('companies', [company]);
    const changes = [{ store: 'items' as const, put: [item] }];
    expect(await db.update<typeof company>('companies', 'race', () => undefined, changes)).toBe(false);
    expect(await db.get('items', item.id)).toBeUndefined();
    expect(await db.update<typeof company>('companies', 'race', (current) => current, changes)).toBe(true);
    expect(await db.get('items', item.id)).toEqual(item);
  });

  it('round trips media bytes without interpreting publisher JSON as a byte marker', async () => {
    const db = openAppDb();
    const item = { id: 'custom', origin: 'test', item: { custom: { $bytes: 'not bytes!' } } };
    await db.putMany('items', [item]);
    expect(await db.get('items', item.id)).toEqual(item);
    const media = { url: 'image', origin: 'test', bytes: new Uint8Array([0, 128, 255]).buffer };
    await db.putMany('media', [media]);
    expect(await db.get('media', media.url)).toEqual(media);
  });
});

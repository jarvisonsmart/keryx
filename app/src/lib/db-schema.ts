/** The local store's shape, shared by db.ts (IndexedDB) and db.native.ts (SQLite). */
export type StoreName = 'companies' | 'items' | 'media' | 'relay' | 'registrations';
export type OriginStore = 'items' | 'media';

export interface StoreChanges {
  store: StoreName;
  put?: object[];
  remove?: string[];
}

export interface KeyValueDb {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  getAll<T>(store: StoreName): Promise<T[]>;
  getAllByOrigin<T>(store: OriginStore, origin: string): Promise<T[]>;
  putMany(store: StoreName, values: object[]): Promise<void>;
  deleteMany(store: StoreName, keys: string[]): Promise<void>;
  deleteByOrigin(store: OriginStore, origin: string): Promise<void>;
  /** Atomic read-modify-write of one record; `next` returning undefined writes nothing. Resolves whether it wrote. */
  update<T extends object>(store: StoreName, key: string, next: (current: T | undefined) => T | undefined, changes?: StoreChanges[]): Promise<boolean>;
}

/** Each store's primary key field. */
export const KEY_PATHS: Record<StoreName, string> = {
  companies: 'origin',
  items: 'id',
  media: 'url',
  relay: 'key',
  registrations: 'baseUrl',
};

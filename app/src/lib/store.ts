/**
 * Local-only persistence: companies + verified items + media (IndexedDB on
 * the web, SQLite on the apps — see db.ts). Nothing here ever leaves the
 * device (zero PII, no server state).
 */

import { openAppDb } from './db';
import type { RootDoc, TargetsDoc, SeenVersions } from './tuf';
import type { FeedItem } from './item';
import type { RelayRegistration } from './relay';

export interface ChannelState {
  /** bare channel name (the item target path segment) */
  name: string;
  displayName: string;
  description?: string;
  followed: boolean;
  /** seen for the first time since this company was paired ("new" badge) */
  isNew?: boolean;
  /** feed-level `expired: true` → finished: no further updates, cache kept */
  closed?: boolean;
}

/** A private (per-order) capability feed subscription (spec/feeds.md §3). */
export interface PrivateFeedSub {
  url: string;
  /** the pattern entry's channel (label only — NOT a TUF role) */
  channel: string;
  displayName?: string;
  purpose?: string;
  /** last seen document `version` (anti-rollback via version memory) */
  version?: number;
  /** document `expires` — the order window end (anti-freeze) */
  expires?: string;
  /** expired/404/410/pattern removed → stop polling, keep cached items */
  closed?: boolean;
}

export interface CompanyRecord {
  /** key: the join origin (the user-confirmed domain — the trust anchor) */
  origin: string;
  joinUrl: string;
  /** company identity as confirmed at pairing (spec/core.md §2) */
  identity: { companyName?: string; logo?: string; logoSHA256?: string };
  /** company_name changed since pairing → prominent warning, re-pair required */
  rebrandPending?: boolean;
  /** logo changed since pairing → one-tap acknowledgement */
  logoChangePending?: boolean;
  pinnedRoot: RootDoc;
  pinnedRootVersion: number;
  targets: TargetsDoc;
  targetsVersion: number;
  /** Earliest expiry of the verified root/timestamp/snapshot/targets chain. */
  authorizationExpiresAt?: number;
  /** anti-rollback version memory */
  seen: SeenVersions;
  channels: ChannelState[];
  privateFeeds: PrivateFeedSub[];
  status: 'active' | 'suspended' | 'rebrand';
  suspendedReason?: string;
  joinedAt: number;
  lastSyncAt: number | null;
  /** transient sync problems (feed fetch failures etc.) — shown to the user, never suspension */
  lastSyncErrors?: string[];
  prefs: { languages: string[]; tags: string[]; loadRemoteMedia: boolean };
}

export interface StoredItem {
  /** dedup key: `${origin}\0${feedKey}\0${itemId}` — feedKey = `public:<channel>` or `private:<url>` */
  id: string;
  origin: string;
  /** bare channel name (public) or pattern channel label (private) */
  channel: string;
  /** private capability URL (empty for public items) */
  feedUrl: string;
  isPrivate: boolean;
  item: FeedItem;
  published: string;
  /** TUF target sha256 of the signed item bytes (public channels) */
  hash?: string;
  /** position in the feed document (ordering fallback when date_published is absent) */
  feedIndex?: number;
  receivedAt: number;
  read: boolean;
  /** in-place update: content differs from the previous signed copy */
  updated?: boolean;
}

export interface Prefs {
  languages: string[];
  tags: string[];
  loadRemoteMedia: boolean;
}

export const defaultPrefs = (): Prefs => ({
  languages: [],
  tags: [],
  loadRemoteMedia: true,
});

const db = openAppDb();

// --- companies ---

export async function getAllCompanies(): Promise<CompanyRecord[]> {
  const list = await db.getAll<CompanyRecord>('companies');
  return list.sort((a, b) => a.joinedAt - b.joinedAt);
}

export async function getCompany(origin: string): Promise<CompanyRecord | undefined> {
  return db.get<CompanyRecord>('companies', origin);
}

export async function putCompany(company: CompanyRecord): Promise<void> {
  await db.putMany('companies', [company]);
}

export async function deleteCompany(origin: string): Promise<void> {
  await db.deleteMany('companies', [origin]);
  await db.deleteByOrigin('items', origin);
  await db.deleteByOrigin('media', origin);
}

// --- app-wide relay registration (relay/SPECIFICATION.md §5.3) ---

export async function getRegistration(baseUrl: string): Promise<RelayRegistration | undefined> {
  return db.get<RelayRegistration>('registrations', baseUrl);
}

export async function getRegistrations(): Promise<RelayRegistration[]> {
  return db.getAll<RelayRegistration>('registrations');
}

export async function putRegistration(reg: RelayRegistration): Promise<void> {
  await db.putMany('registrations', [reg]);
}

export async function deleteRegistrationRecord(baseUrl: string): Promise<void> {
  await db.deleteMany('registrations', [baseUrl]);
}

// --- items ---

export function itemKey(origin: string, feedKey: string, itemId: string): string {
  return `${origin}\u0000${feedKey}\u0000${itemId}`;
}

export function publicFeedKey(channel: string): string {
  return `public:${channel}`;
}

export function privateFeedKey(url: string): string {
  return `private:${url}`;
}

export async function getAllItems(): Promise<StoredItem[]> {
  return db.getAll<StoredItem>('items');
}

export async function getItems(origin: string): Promise<StoredItem[]> {
  return db.getAllByOrigin<StoredItem>('items', origin);
}

export async function getItem(origin: string, feedKey: string, itemId: string): Promise<StoredItem | undefined> {
  return db.get<StoredItem>('items', itemKey(origin, feedKey, itemId));
}

export async function putItems(items: StoredItem[]): Promise<void> {
  await db.putMany('items', items);
}

export async function deleteItems(ids: string[]): Promise<void> {
  await db.deleteMany('items', ids);
}

export async function markRead(origin: string, feedKey: string, itemId: string, read: boolean): Promise<void> {
  await db.update<StoredItem>('items', itemKey(origin, feedKey, itemId), (item) =>
    item ? { ...item, read } : undefined,
  );
}

// --- media cache (images/logo bytes keyed by URL) ---

export interface CachedMedia {
  url: string;
  origin: string;
  bytes: ArrayBuffer;
  mime: string;
  at: number;
}

export async function getMedia(url: string): Promise<CachedMedia | undefined> {
  return db.get<CachedMedia>('media', url);
}

export async function putMedia(entry: CachedMedia): Promise<void> {
  await db.putMany('media', [entry]);
}

export async function deleteMediaFor(origin: string): Promise<void> {
  await db.deleteByOrigin('media', origin);
}

// --- prefs (per company, stored on the company record) ---

// --- relay wake-up state (relay/SPECIFICATION.md §4.2) -----------------------

interface RelayStateRecord {
  key: string;
  seq?: number;
  at?: number;
}

/** The last accepted `seq` for a topic (zero when never accepted). */
export async function relaySeq(origin: string, topic: string): Promise<number> {
  const rec = await db.get<RelayStateRecord>('relay', `seq\u0000${origin}\u0000${topic}`);
  return rec?.seq ?? 0;
}

/** Persist the last accepted `seq` for a topic (verified wake-ups only). */
export async function setRelaySeq(origin: string, topic: string, seq: number): Promise<boolean> {
  const key = `seq\u0000${origin}\u0000${topic}`;
  return db.update<RelayStateRecord>('relay', key, (current) =>
    seq > (current?.seq ?? 0) ? { key, seq } : undefined,
  );
}

/** The recovery-cooldown expiry for a company (0 when never attempted). */
export async function relayRecoveryAt(origin: string): Promise<number> {
  const rec = await db.get<RelayStateRecord>('relay', `recovery\u0000${origin}`);
  return rec?.at ?? 0;
}

/**
 * Atomically reserve the one recovery allowance per company per cooldown
 * (relay/SPECIFICATION.md §4.2): persist `next_recovery_at` BEFORE
 * networking. Returns false when the allowance is still in force.
 */
export async function reserveRecovery(origin: string, now: number, cooldownMs: number): Promise<boolean> {
  const key = `recovery\u0000${origin}`;
  return db.update<RelayStateRecord>('relay', key, (rec) =>
    rec?.at && now < rec.at ? undefined : { key, at: now + cooldownMs },
  );
}

/** The last wake-up this install accepted for a company (epoch ms). */
export async function markPushReceived(origin: string, at: number): Promise<void> {
  await db.putMany('relay', [{ key: `push\u0000${origin}`, at }]);
}

export async function lastPushAt(origin: string): Promise<number> {
  const rec = await db.get<RelayStateRecord>('relay', `push\u0000${origin}`);
  return rec?.at ?? 0;
}

/** A wake-up the worker could not verify against its cached metadata. */
export interface PendingRecovery {
  origin: string;
  topic: string;
  seq: number;
  at: number;
  payload?: string;
}

/**
 * Record a wake-up the worker could not verify: the cached metadata may simply
 * be stale after a key rotation, so the page re-verifies with the full TUF
 * state and its recovery allowance (design/notifications.md, worker rule).
 */
export async function markPendingRecovery(pending: PendingRecovery): Promise<void> {
  await db.putMany('relay', [{ key: `recovery-pending\u0000${pending.origin}`, ...pending }]);
}

export async function pendingRecoveries(): Promise<PendingRecovery[]> {
  const all = await db.getAll<PendingRecovery & { key: string }>('relay');
  return all.filter((r) => r.key.startsWith('recovery-pending\u0000'));
}

export async function clearPendingRecovery(origin: string): Promise<void> {
  await db.deleteMany('relay', [`recovery-pending\u0000${origin}`]);
}

/** The pending self-test the service worker matches by nonce (§5.3.1). */
export interface PendingTest {
  baseUrl: string;
  nonce: string;
  expiresAt: number;
  /** the topic-leg test topic the native SDK is subscribed to while it is pending */
  topic?: string;
  receivedAt?: number;
}

export async function putPendingTest(t: PendingTest): Promise<void> {
  await db.putMany('relay', [{ key: `test\u0000${t.baseUrl}`, ...t }]);
}

export async function pendingTest(baseUrl: string): Promise<PendingTest | undefined> {
  const rec = await db.get<PendingTest & { key: string }>('relay', `test\u0000${baseUrl}`);
  if (!rec) return undefined;
  return {
    baseUrl: rec.baseUrl,
    nonce: rec.nonce,
    topic: rec.topic,
    expiresAt: rec.expiresAt,
    receivedAt: rec.receivedAt,
  };
}

export async function clearPendingTest(baseUrl: string): Promise<void> {
  await db.deleteMany('relay', [`test\u0000${baseUrl}`]);
}

export function makeCompany(
  origin: string,
  joinUrl: string,
  pinnedRoot: RootDoc,
  targets: TargetsDoc,
  identity: { companyName?: string; logo?: string; logoSHA256?: string },
  channels: ChannelState[],
  privateFeeds: PrivateFeedSub[],
): CompanyRecord {
  return {
    origin,
    joinUrl,
    identity,
    pinnedRoot,
    pinnedRootVersion: pinnedRoot.signed.version,
    targets,
    targetsVersion: targets.signed.version,
    seen: {
      timestamp: undefined,
      snapshot: undefined,
      targets: targets.signed.version,
      roles: {},
    },
    channels,
    privateFeeds,
    status: 'active',
    joinedAt: Date.now(),
    lastSyncAt: null,
    prefs: defaultPrefs(),
  };
}

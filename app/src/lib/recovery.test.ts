import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sign, hashes } from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { describe, expect, it, vi } from 'vitest';
import { buildPairingOffer, createCompanyFromOffer, parseJoinUrl } from './pair';
import { handlePush, recoverPendingWakeups, topicBindings } from './relay-sw';
import { getAllCompanies, getCompany, getAllItems, commitSync, deleteCompany, putCompany, relaySeq, pendingRecoveries } from './store';
import { bytesToBase64url } from './bytes';
import { wakeupSignedBytes } from './relay';

hashes.sha512 = sha512;
const demo = process.env.KERYX_DEMO_DIR ?? '../keryx-demo';
const keys = process.env.KERYX_KEYSTORE ?? '../keryx-demo-keys';
const joinUrl = readFileSync(join(demo, 'join.txt'), 'utf8').trim();
const { origin, payload } = parseJoinUrl(joinUrl);
const requests: string[] = [];
const fetchDemo: typeof fetch = async (input) => {
  const url = String(input);
  requests.push(url);
  return new Response(readFileSync(join(demo, new URL(url).pathname)));
};

async function setup() {
  for (const company of await getAllCompanies()) await deleteCompany(company.origin);
  const offer = await buildPairingOffer(origin, joinUrl, payload, fetchDemo);
  const company = createCompanyFromOffer(offer, ['news']);
  const topic = Object.entries(topicBindings(company)).find(([, binding]) => binding.channel === 'news')![0];
  const key = JSON.parse(readFileSync(join(keys, 'news.json'), 'utf8')) as { seed_hex: string; keyid: string };
  const keyid = company.targets.signed.delegations!.roles.find((role) => role.name === 'channels.news')!.keyids[0];
  const envelope = { v: 1, t: topic, seq: 10, sig: [{ keyid, sig: bytesToBase64url(sign(wakeupSignedBytes(1, topic, 10), Buffer.from(key.seed_hex, 'hex'))) }] };
  company.authorizationExpiresAt = 0;
  await putCompany(company);
  requests.length = 0;
  return { topic, envelope, company };
}

describe('page-side wake-up recovery', () => {
  it('discards sync results after unfollow, preference changes or removal', async () => {
    const { company } = await setup();
    const changed = { ...company, prefs: { ...company.prefs, loadRemoteMedia: false },
      channels: company.channels.map((channel) => ({ ...channel, followed: false })) };
    await putCompany(changed);
    expect(await commitSync(company, { ...company, lastSyncAt: Date.now() })).toBe(false);
    expect(await getCompany(company.origin)).toEqual(changed);
    await deleteCompany(company.origin);
    expect(await commitSync(changed, company)).toBe(false);
    expect(await getCompany(company.origin)).toBeUndefined();
    expect(await getAllItems()).toEqual([]);
    await putCompany(company);
    expect(await commitSync(company, changed)).toBe(true);
    expect(await getCompany(company.origin)).toEqual(changed);
  });

  it('refreshes only metadata, then retries the signed envelope before advancing seq', async () => {
    const { topic, envelope } = await setup();
    expect((await handlePush(JSON.stringify(envelope))).pendingRecovery).toBe(true);
    expect(requests).toEqual([]);
    const accepted = await recoverPendingWakeups(fetchDemo);
    expect(accepted).toHaveLength(1);
    expect(await relaySeq(origin, topic)).toBe(10);
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.some((url) => url.includes('/channels/'))).toBe(false);
    expect(await pendingRecoveries()).toEqual([]);
  });

  it('does not fetch content or advance seq for a forgery, including during cooldown', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 61_000);
    try {
      const { topic, envelope } = await setup();
      envelope.seq = 11;
      await handlePush(JSON.stringify(envelope));
      expect(await recoverPendingWakeups(fetchDemo)).toEqual([]);
      expect(await relaySeq(origin, topic)).toBe(10);
      expect(requests.some((url) => url.includes('/channels/'))).toBe(false);
      requests.length = 0;
      await handlePush(JSON.stringify(envelope));
      await recoverPendingWakeups(fetchDemo);
      expect(requests).toEqual([]);
    } finally { vi.useRealTimers(); }
  });
});

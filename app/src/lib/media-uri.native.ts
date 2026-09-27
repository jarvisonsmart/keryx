import { sha256Hex } from './bytes';
import { bytesToBase64url } from './bytes';

/** A renderable URI for verified image bytes: a data URI on the apps (no object URLs). */
const cache = new Map<string, string>();

export function mediaUri(url: string, bytes: ArrayBuffer, mime: string): string {
  const key = `${url}\0${sha256Hex(new Uint8Array(bytes))}\0${mime}`;
  let uri = cache.get(key);
  if (!uri) {
    const b64 = bytesToBase64url(new Uint8Array(bytes)).replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    uri = `data:${mime === 'image/*' ? 'application/octet-stream' : mime};base64,${padded}`;
    cache.set(key, uri);
  }
  return uri;
}

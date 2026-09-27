import { sha256Hex } from './bytes';
/** A renderable URI for verified image bytes: an object URL on the web. */
const cache = new Map<string, string>();

export function mediaUri(url: string, bytes: ArrayBuffer, mime: string): string {
  const key = `${url}\0${sha256Hex(new Uint8Array(bytes))}\0${mime}`;
  let uri = cache.get(key);
  if (!uri) {
    uri = URL.createObjectURL(new Blob([bytes], { type: mime || 'image/*' }));
    cache.set(key, uri);
  }
  return uri;
}

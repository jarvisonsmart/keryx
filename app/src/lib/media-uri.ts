/** A renderable URI for verified image bytes: an object URL on the web. */
const cache = new Map<string, string>();

export function mediaUri(url: string, bytes: ArrayBuffer, mime: string): string {
  let uri = cache.get(url);
  if (!uri) {
    uri = URL.createObjectURL(new Blob([bytes], { type: mime || 'image/*' }));
    cache.set(url, uri);
  }
  return uri;
}

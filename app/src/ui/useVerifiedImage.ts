import { useEffect, useState } from 'react';
import { loadImage } from '../lib/media';

/** A changed source or pin hides the previous image before the next fetch settles. */
export function useVerifiedImage(url: string | undefined, origin: string, sha: unknown, enabled = true): string | null {
  const key = JSON.stringify([url, origin, sha]);
  const [image, setImage] = useState<{ key: string; uri: string | null } | null>(null);
  useEffect(() => {
    if (!url || !enabled) return;
    let alive = true;
    void loadImage(url, origin, sha).then((uri) => {
      if (alive) setImage({ key, uri });
    });
    return () => { alive = false; };
  }, [url, origin, sha, enabled, key]);
  return enabled && image?.key === key ? image.uri : null;
}

import { describe, expect, it } from 'vitest';
import { mediaUri } from './media-uri';
import { mediaUri as nativeMediaUri } from './media-uri.native';

describe('verified media rendering', () => {
  it('renders the current verified bytes when a URL is reused', async () => {
    const before = new Uint8Array([1, 2]).buffer;
    const after = new Uint8Array([3, 4]).buffer;
    const first = mediaUri('https://company.test/image', before, 'image/png');
    const second = mediaUri('https://company.test/image', after, 'image/png');
    expect(first).not.toBe(second);
    expect(new Uint8Array(await (await fetch(second)).arrayBuffer())).toEqual(new Uint8Array(after));
    expect(nativeMediaUri('image', before, 'image/png')).not.toBe(nativeMediaUri('image', after, 'image/png'));
  });
});

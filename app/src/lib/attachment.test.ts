import { afterEach, expect, it, vi } from 'vitest';
import { sha256Hex } from './bytes';
import { openAttachment } from './attachment';
import { openExternal } from './platform';
import { saveAttachment } from './save-attachment';
vi.mock('./platform', () => ({ openExternal: vi.fn() }));
vi.mock('./save-attachment', () => ({ saveAttachment: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('hands off exactly the verified bytes and never reopens the remote URL', async () => {
  const bytes = new TextEncoder().encode('verified attachment');
  const url = 'https://example.com/report.txt';
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(bytes)).mockResolvedValue(new Response('changed'));
  vi.stubGlobal('fetch', fetcher);
  await openAttachment(url, { id: 'test', attachments: [{ url, mime_type: 'text/plain', sha256: sha256Hex(bytes) }] });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(saveAttachment).toHaveBeenCalledWith(bytes.buffer, 'report.txt', 'text/plain');
  expect(openExternal).not.toHaveBeenCalled();
});

it('never hands off bytes with a mismatched hash', async () => {
  const url = 'https://example.com/report.txt';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('wrong')));
  await openAttachment(url, { id: 'test', attachments: [{ url, sha256: '0'.repeat(64) }] });
  expect(saveAttachment).not.toHaveBeenCalled();
  expect(openExternal).not.toHaveBeenCalled();
});

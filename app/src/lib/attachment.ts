import { attachmentSha, bytesMatchSha, type FeedItem } from './item';
import { openExternal } from './platform';
import { saveAttachment } from './save-attachment';

export async function openAttachment(url: string, item: FeedItem): Promise<void> {
  const sha = attachmentSha(item, url);
  if (sha === null) return;
  if (!sha) return openExternal(url);
  try {
    const response = await fetch(url);
    if (!response.ok) return;
    const bytes = await response.arrayBuffer();
    if (!bytesMatchSha(new Uint8Array(bytes), sha)) return;
    const attachment = item.attachments?.find((a) => a.url === url);
    const filename = new URL(url).pathname.split('/').pop()?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'attachment';
    await saveAttachment(bytes, filename, attachment?.mime_type ?? 'application/octet-stream');
  } catch {
    // An unavailable or unverifiable resource is never opened.
  }
}

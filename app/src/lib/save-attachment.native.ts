import { Directory, File, Paths } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';
import { sha256Hex } from './bytes';

export async function saveAttachment(bytes: ArrayBuffer, filename: string, mime: string): Promise<void> {
  const directory = new Directory(Paths.cache, 'attachments', sha256Hex(new Uint8Array(bytes)));
  directory.create({ intermediates: true, idempotent: true });
  const file = new File(directory, filename);
  file.write(new Uint8Array(bytes));
  await shareAsync(file.uri, { mimeType: mime });
}

/** Save the exact verified bytes without navigating back to the mutable origin. */
export async function saveAttachment(bytes: ArrayBuffer, filename: string, mime: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

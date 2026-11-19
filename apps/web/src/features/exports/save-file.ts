import type { DownloadedFile } from '../../api/client';

/** Hands a downloaded file to the browser's own save: a link to the file in memory is clicked and then forgotten. */
export function saveDownloadedFile(file: DownloadedFile): void {
  const address = URL.createObjectURL(file.blob);
  const link = document.createElement('a');
  link.href = address;
  link.download = file.fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(address);
}

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPlainFileName } from '../helpers/chat-page-security';

/** Where the built chat window and loader are (the `apps/site` build). The API serves them as they are. */
export const DEFAULT_WIDGET_FILES_DIRECTORY = fileURLToPath(new URL('../../../../../../site/dist/', import.meta.url));

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
};

/** A file ready to send. */
export interface WidgetFile {
  content: Buffer;
  contentType: string;
}

/**
 * Reads the built widget files (the loader, the chat window's page, its script and styles). Only plain file names inside the build folder
 * are ever read, so no request can reach any other file. Answers undefined for anything that is not there.
 */
export function createWidgetFilesService(input: { directory?: string } = {}) {
  const directory = input.directory ?? DEFAULT_WIDGET_FILES_DIRECTORY;

  /** Reads one file of the folder (or of its `assets` folder), or undefined when the name is not plain, the type is unknown, or it is missing. */
  async function readBuiltFile(subfolder: '' | 'assets', fileName: string): Promise<WidgetFile | undefined> {
    if (!isPlainFileName(fileName)) return undefined;
    const contentType = CONTENT_TYPES[path.extname(fileName)];
    if (!contentType) return undefined;
    try {
      return { content: await readFile(path.join(directory, subfolder, fileName)), contentType };
    } catch {
      return undefined;
    }
  }

  return {
    /** The loader script a business's website loads. */
    readLoader: () => readBuiltFile('', 'loader.js'),
    /** The chat window's page. */
    readChatPage: () => readBuiltFile('', 'chat.html'),
    /** One of the chat window's built scripts or styles. */
    readAsset: (fileName: string) => readBuiltFile('assets', fileName),
  };
}

import { extname } from 'node:path';
import type { InteractiveElement } from './domain.js';

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip',
};

export function matchesAccept(path: string, accept: string | undefined) {
  const tokens = (accept ?? '')
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const extension = extname(path).toLowerCase();
  const mime = MIME_TYPES[extension];
  return tokens.some((token) => {
    if (token.startsWith('.')) return token === extension;
    if (!mime) return false;
    if (token.endsWith('/*')) return mime.startsWith(token.slice(0, -1));
    return token === mime;
  });
}

export function uploadProblem(element: InteractiveElement, paths: string[]): string | undefined {
  if (paths.length > 1 && !element.multiple)
    return `Control "${element.name}" accepts a single file, but ${paths.length} files were provided`;
  const rejected = paths.filter((path) => !matchesAccept(path, element.accept));
  if (rejected.length > 0)
    return `Control "${element.name}" does not accept the file type of ${rejected.length} provided file(s) (accept="${element.accept}")`;
  return undefined;
}

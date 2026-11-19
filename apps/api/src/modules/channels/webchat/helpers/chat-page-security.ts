// The security rules of the chat window's page. Pure: no database.

/** The page the chat window is served as. Nothing inline, nothing from anywhere else, and no other page may be framed by it. */
export function makeChatPagePolicy(allowedWebsites: readonly string[]): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    // Only the business's own websites may show this page in a frame (an empty list shows it nowhere)
    `frame-ancestors ${allowedWebsites.length > 0 ? allowedWebsites.join(' ') : "'none'"}`,
  ].join('; ');
}

/**
 * True when the browser says this page is being opened to be shown in a frame, or says nothing (older browsers). A page opened on its own
 * (typed into the address bar, or a link) says "document", and is refused: the chat window only exists inside a business's website.
 */
export function isOpenedAsFrame(secFetchDest: string | undefined): boolean {
  return secFetchDest === undefined || secFetchDest === 'iframe';
}

/** True when a file name is plain: letters, digits, dots, dashes and underscores, not starting with a dot. No folders, no "..". */
export function isPlainFileName(fileName: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(fileName);
}

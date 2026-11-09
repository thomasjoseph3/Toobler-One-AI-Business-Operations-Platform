/** An error with an HTTP status and a stable code. The message is plain English meant for the screen. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new ApiError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Please sign in.') => new ApiError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = "You don't have access to that.") => new ApiError(403, 'FORBIDDEN', message);
/** Another business's record answers exactly like a missing one. */
export const notFound = (what = 'That') => new ApiError(404, 'NOT_FOUND', `${what} wasn't found.`);
export const conflict = (code: string, message: string, details?: unknown) => new ApiError(409, code, message, details);
export const tooMany = (message = 'Too many attempts. Please wait a few minutes and try again.') =>
  new ApiError(429, 'TOO_MANY_REQUESTS', message);

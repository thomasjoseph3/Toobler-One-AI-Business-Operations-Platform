import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { ApiError } from '../errors';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown; request?: string };
}

/** Sends the standard error response: an HTTP status plus a body shaped like ErrorBody. */
const sendErrorResponse = (reply: FastifyReply, httpStatus: number, error: ErrorBody['error']) =>
  reply.code(httpStatus).send({ error } satisfies ErrorBody);

// Postgres refusing a write: show a sentence, never the SQL error
const POSTGRES_ERROR_MESSAGES: Record<string, string> = {
  '22P02': 'One of the values has the wrong form (a number, a date or an ID).',
  '22007': "One of the dates or times isn't valid.",
  '22008': 'One of the dates or times is out of range.',
  '23514': 'One of the values is outside what is allowed.',
  '23502': 'A required value is missing.',
  '23503': "That refers to something that doesn't exist (any more).",
};

/** Turns a field path such as "/contact_name" into a readable label such as "Contact name". Empty path gives "". */
const fieldLabelFromPath = (fieldPath: string) => {
  const lastPathPart = fieldPath.split('/').filter(Boolean).at(-1) ?? '';
  return lastPathPart ? lastPathPart.replace(/_/g, ' ').replace(/^./, (firstLetter) => firstLetter.toUpperCase()) : '';
};

/** Installs the handlers that turn every failure into the standard error response (unknown route, bad input, our own bugs). */
export function registerErrorHandling(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) =>
    sendErrorResponse(reply, 404, { code: 'NOT_FOUND', message: `No route for ${request.method} ${request.url.split('?')[0]}` }),
  );

  app.setErrorHandler((error: FastifyError | ApiError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ApiError) {
      return sendErrorResponse(reply, error.status, { code: error.code, message: error.message, details: error.details });
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const details = error.validation.map((validationIssue) => ({
        path: validationIssue.instancePath.replace(/^\//, '').replace(/\//g, '.'),
        message: validationIssue.message ?? 'Is not valid',
      }));
      const message = error.validation
        .map((validationIssue) => {
          const fieldLabel = fieldLabelFromPath(validationIssue.instancePath);
          return fieldLabel ? `${fieldLabel}: ${validationIssue.message}` : (validationIssue.message ?? 'Is not valid');
        })
        .join('. ');
      return sendErrorResponse(reply, 400, { code: 'VALIDATION_ERROR', message, details });
    }

    const fastifyErrorCode = (error as FastifyError).code;
    if (
      fastifyErrorCode === 'FST_ERR_CTP_INVALID_JSON_BODY' ||
      fastifyErrorCode === 'FST_ERR_CTP_EMPTY_JSON_BODY' ||
      fastifyErrorCode === 'FST_ERR_CTP_INVALID_MEDIA_TYPE'
    ) {
      return sendErrorResponse(reply, 400, { code: 'BAD_JSON', message: "The request couldn't be read (it isn't valid JSON)." });
    }
    if (fastifyErrorCode === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return sendErrorResponse(reply, 413, { code: 'TOO_LARGE', message: 'That is too large to send.' });
    }
    if ((error as FastifyError).statusCode === 429) {
      return sendErrorResponse(reply, 429, {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many attempts. Please wait a few minutes and try again.',
      });
    }

    // Postgres errors carry their own five-character code in the same `code` field.
    const postgresErrorCode = (error as { code?: string }).code;
    if (postgresErrorCode === '23505') return sendErrorResponse(reply, 409, { code: 'DUPLICATE', message: 'That already exists.' });
    if (postgresErrorCode && POSTGRES_ERROR_MESSAGES[postgresErrorCode]) {
      return sendErrorResponse(reply, 400, { code: 'BAD_REQUEST', message: POSTGRES_ERROR_MESSAGES[postgresErrorCode] });
    }

    if (!isResponseSerializationError(error)) {
      const httpStatus = (error as FastifyError).statusCode;
      if (httpStatus && httpStatus >= 400 && httpStatus < 500) {
        return sendErrorResponse(reply, httpStatus, { code: 'BAD_REQUEST', message: 'The request could not be processed.' });
      }
    }
    // Anything else is our bug: log it with the request id, tell the person only that id.
    request.log.error({ err: error }, 'unhandled error');
    return sendErrorResponse(reply, 500, {
      code: 'INTERNAL',
      message: `Something went wrong on our side. Please try again; if it keeps happening, tell support the reference ${request.id}.`,
      request: request.id,
    });
  });
}

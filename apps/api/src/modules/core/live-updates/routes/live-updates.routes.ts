import type { FastifyInstance } from 'fastify';
import { unauthorized } from '../../../../kernel/errors';
import { createLiveUpdatesService } from '../services/live-updates.service';

/** How often an open screen asks the outbox for new events, and how often a quiet connection gets a heartbeat so proxies keep it open. */
const READ_EVERY_MILLISECONDS = 2_000;
const HEARTBEAT_EVERY_MILLISECONDS = 20_000;

/**
 * Registers GET /api/v1/events: a server-sent-events stream of what is happening in the signed-in person's own business (ids and kinds only, so the
 * screens refetch what they show). It starts from the moment it opens. The business comes from the session, never from the request.
 */
export function liveUpdatesRoutes(app: FastifyInstance) {
  const liveUpdates = createLiveUpdatesService({ database: app.kernel.database });

  // For any signed-in, verified person (API.md: Staff).
  app.get('/events', { config: { access: 'staff' } }, async (request, reply) => {
    if (!request.principal) throw unauthorized(); // the guard always sets it; this satisfies the type checker
    const following = liveUpdates.startFollowing(request.principal);
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // So a proxy in front does not hold the messages back
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write('retry: 3000\n\n');
    reply.raw.write(': open\n\n');

    let isReading = false;
    const readTimer = setInterval(() => {
      if (isReading) return; // the last read is still running: skip this beat
      isReading = true;
      following
        .readNewMessages()
        .then((messages) => {
          for (const message of messages) reply.raw.write(`event: update\ndata: ${JSON.stringify(message)}\n\n`);
        })
        .catch((error: unknown) => request.log.warn({ error }, 'live updates could not read the new events'))
        .finally(() => {
          isReading = false;
        });
    }, READ_EVERY_MILLISECONDS);
    const heartbeatTimer = setInterval(() => reply.raw.write(': keep-alive\n\n'), HEARTBEAT_EVERY_MILLISECONDS);
    request.raw.on('close', () => {
      clearInterval(readTimer);
      clearInterval(heartbeatTimer);
    });
  });
}

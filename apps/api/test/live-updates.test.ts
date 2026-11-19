import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { createConversationRecordsService } from '../src/modules/core/conversations';
import { createLiveUpdatesService } from '../src/modules/core/live-updates/services/live-updates.service';
import { buildTestApp } from './support/app';
import { createPretendBrowser } from './support/browser';
import { openTestDatabase } from './support/harness';
import { signUpOwner, type TeamMember } from './support/team';

// F21: GET /events (the live updates stream) carries only the signed-in person's own business's events, as kinds and ids.

let database: Database;
let app: FastifyInstance;
let address: string;

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const listening = app.server.address();
  address = typeof listening === 'object' && listening ? `http://127.0.0.1:${listening.port}` : '';
});
afterAll(async () => {
  await app.close();
  await database.close();
});

/** Opens the stream as a person (with their own cookies) and collects the messages it sends, until closed. */
async function openStream(person: TeamMember) {
  const cookie = person.browser
    .cookieNames()
    .map((name) => `${name}=${person.browser.cookieValue(name)}`)
    .join('; ');
  const controller = new AbortController();
  const response = await fetch(`${address}/api/v1/events`, { headers: { cookie }, signal: controller.signal });
  const messages: Array<Record<string, string>> = [];
  const reading = (async () => {
    if (!response.body) return;
    const decoder = new TextDecoder();
    let buffered = '';
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        buffered += decoder.decode(chunk, { stream: true });
        let end = buffered.indexOf('\n\n');
        while (end !== -1) {
          const block = buffered.slice(0, end);
          buffered = buffered.slice(end + 2);
          const data = block.split('\n').find((line) => line.startsWith('data: '));
          if (data) messages.push(JSON.parse(data.slice(6)) as Record<string, string>);
          end = buffered.indexOf('\n\n');
        }
      }
    } catch {
      // closed by the test
    }
  })();
  return {
    response,
    messages,
    async close() {
      controller.abort();
      await reading;
    },
  };
}

/** Waits until the condition holds (checked every 100 ms), or fails after the given time. */
async function waitFor(condition: () => boolean, milliseconds = 8000) {
  const deadline = Date.now() + milliseconds;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Waited too long for a live update.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe('GET /events', () => {
  it("tells an open screen about its own business's conversation events, as kinds and ids only, and never about another business", async () => {
    const mine = await signUpOwner(app, database);
    const theirs = await signUpOwner(app, database);
    const myStream = await openStream(mine);
    const theirStream = await openStream(theirs);
    expect(myStream.response.status).toBe(200);
    expect(myStream.response.headers.get('content-type')).toContain('text/event-stream');

    const records = createConversationRecordsService({ database });
    const myChat = await records.startConversation(mine.businessId, { channel: 'webchat' });
    await records.addMessage(mine.businessId, myChat, { sender: 'customer', body: 'My private words about a refund' });
    const theirChat = await records.startConversation(theirs.businessId, { channel: 'webchat' });

    await waitFor(() => myStream.messages.some((message) => message.event === 'conversation.message'));
    await waitFor(() => theirStream.messages.some((message) => message.event === 'conversation.started'));
    // Give the other business's events time to (wrongly) arrive
    await new Promise((resolve) => setTimeout(resolve, 2500));

    expect(myStream.messages.every((message) => message.conversationId === myChat)).toBe(true);
    expect(theirStream.messages.every((message) => message.conversationId === theirChat)).toBe(true);
    // Only the event's kind and the id: never the words, never a person
    for (const message of [...myStream.messages, ...theirStream.messages]) {
      expect(Object.keys(message).sort()).toEqual(['conversationId', 'event']);
    }
    expect(JSON.stringify(myStream.messages)).not.toContain('refund');
    // Each event once
    const startedCount = myStream.messages.filter((message) => message.event === 'conversation.started').length;
    expect(startedCount).toBe(1);
    await myStream.close();
    await theirStream.close();
  });

  it('shows no history from before it opened, and is refused when signed out (401)', async () => {
    const owner = await signUpOwner(app, database);
    const records = createConversationRecordsService({ database });
    await records.startConversation(owner.businessId, { channel: 'webchat' });
    const stream = await openStream(owner);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(stream.messages).toEqual([]);
    await stream.close();
    expect((await createPretendBrowser(app).send('GET', '/api/v1/events')).statusCode).toBe(401);
  });
});

describe('the live updates service', () => {
  it('sends an event that was saved late (inside the overlap) once, and an event of the own-leads-only role never', async () => {
    const owner = await signUpOwner(app, database);
    const records = createConversationRecordsService({ database });
    let clock = new Date();
    const service = createLiveUpdatesService({ database, now: () => clock });
    const following = service.startFollowing({ accountId: owner.businessId, role: 'manager' });
    const restricted = service.startFollowing({ accountId: owner.businessId, role: 'staff_own' });
    const conversationId = await records.startConversation(owner.businessId, { channel: 'webchat' });
    clock = new Date(clock.getTime() + 3000);
    expect((await following.readNewMessages()).map((message) => message.event)).toEqual(['conversation.started']);
    // A second read an instant later sends nothing again, even though the reads overlap
    clock = new Date(clock.getTime() + 2000);
    expect(await following.readNewMessages()).toEqual([]);
    await records.addMessage(owner.businessId, conversationId, { sender: 'customer', body: 'Hi' });
    clock = new Date(clock.getTime() + 2000);
    expect((await following.readNewMessages()).map((message) => message.event)).toEqual(['conversation.message']);
    expect(await restricted.readNewMessages()).toEqual([]);
  });
});

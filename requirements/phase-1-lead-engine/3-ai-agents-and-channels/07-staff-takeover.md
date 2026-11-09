# Staff takeover

**Phase 1 · Channels · HubSpot equivalent: Live chat handoff, Conversation assignment**

## What it is

A staff member can take over any live WhatsApp or website chat from the AI with one button. The AI stops replying in
that chat until staff hand it back.

## Why it matters

Some customers need a person: a big order, an upset customer, a tricky question. Staff must be able to step in at once.

## How it works

1. Rahul sees a hot chat in the inbox and clicks **I'll handle this**.
2. The AI stops. Rahul types replies from the inbox.
3. When done, he clicks **Hand back to AI**, or the chat returns to the AI after 2 hours with no staff reply.
4. The customer sees no change except a person's name on the replies, if the business wants that.

## Rules

- Only one person can hold a chat at a time; others see who has it.
- The AI never replies while a person holds the chat.

## Done when

- [ ] Takeover stops AI replies within one second.
- [ ] Staff replies reach the customer on the same channel.
- [ ] The chat returns to the AI after the set time.

## Better than HubSpot

- The AI has already collected the details, so the person starts with the full picture.

## For developers

- **Code folder:** `apps/api/src/core/conversations`
- **API:** [API.md](../../API.md), Phase 1 → Staff takeover
- **Columns:** `chats.held_by_user_id`, `held_until`.

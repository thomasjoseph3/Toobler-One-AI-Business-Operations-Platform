# C3: Test the agent screen (UI catch-up block, R64)

**Where:** `/knowledge/test-agent` ("Test the agent"; links from Knowledge base and from the setup step "Try the AI agent"). **Uses only existing routes:** `POST /agent/test-chat`, `POST /agent/test-chats/{id}/summary`.
**Status:** built 17 Nov 2026, waiting for the owner's check. Screenshots: `docs/features/C3-test-the-agent/`.

## Feature guide

**What it does.** A chat where the owner plays the customer and the business's own AI agent answers, exactly as it would for a real customer. Beside the chat, a panel shows **what the agent did**: where its answer came from (an FAQ, what you sell, the business profile), what the customer has told it so far (name, phone), the **one promise** it made and when it falls due, how it sees the customer (may buy, ready to book, not a sale), and the steps it took, in plain words. A button shows the summary the inbox would keep for this chat.

**Why it helps.** The owner can hear their agent before a real customer does, and see why it said what it said. If a price is wrong, the panel shows it came from "What you sell", so the owner knows where to fix it. It is also how a business finishes the setup step "Try the AI agent" that going live needs.

**A day in the life.** Anita opens Test the agent and asks "What is the price of a deluxe room?" The agent answers "from ₹4,000 a night plus GST", and the panel says it answered from *What you sell: Offerings and offers*. She asks about parking and sees it came from her FAQ. She gives a name and number as a customer; the panel lists them and shows the promise "Our team will call you within 15 minutes. Due 15:45". She starts a new chat to try a complaint: the panel says "Not a sale" and the promise is "I've passed this to the manager". Her setup step turns Done.

**Who can do what.** Any signed-in person except the "own leads only" role (the API refuses it, and the page says so in plain words).

**Limits.** One test chat on screen at a time (older test chats are saved but not listed; reading them back is a later screen). Messages up to 2,000 characters.

**Never does.** A test chat never becomes a lead, a contact or a ticket, and nothing here is sent to a real customer.

**Not part of it.** A list of earlier test chats; editing the agent's rules.

## For the tech team
- Code: `apps/web/src/features/test-agent/`: `test-chat-state.ts` (pure: words for the tools, due time in the business's time zone, details, unique sources, taking back a failed message) with 9 tests, and `TestAgentPage.tsx`.
- A tool the page has no words for is shown by its own name and a failed step is marked "(did not work)", so nothing the agent did is hidden.
- If a turn fails, the customer's message is put back in the box and removed from the chat. The AI's own refusals (`AI_*`, such as no key set up) are shown in their own plain words; anything else gets a general sentence, never a code.
- Tests: 12 browser tests at phone and desktop (`e2e/test-agent.spec.ts`, pretend agent in `e2e/pretend-agent.ts`) including the setup step turning Done and an accessibility check; the shell, accessibility, Business profile and Setup guide tests still pass.

## Manual test script (real app, any role except own-leads-only; the business needs AI access (F37): platform keys switched on, or its own key)
1. Open Knowledge base, then **Test the agent** (or the "Try the agent now" link on the Setup guide).
2. Type "How much is a room?" and press **Send** (or Enter; Shift+Enter makes a new line). The agent's reply shows, and the panel says where it answered from.
3. Ask something your FAQs cover, and something they do not. Look at the panel: the first names the FAQ; for the second, check the Unanswered questions list later.
4. Give a made-up name and phone number. The panel lists them and shows the one promise with its due time in your business's time zone.
5. Press **Show the summary the inbox would keep**.
6. Press **Start a new test chat** and try a complaint.
7. Open the Setup guide: "Try the AI agent" now says Done.
8. If the agent cannot answer (no AI key), you see a plain message and your text is still in the box.

## Known limits / notes for the designer
- Designed by us in the Leads screens' style (flag in docs/FRONTEND.md §5). Chat bubbles: dark for the person, light for the agent.

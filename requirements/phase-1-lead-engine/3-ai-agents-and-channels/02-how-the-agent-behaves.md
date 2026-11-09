# How the AI agent behaves

**Phase 1 · AI agents · HubSpot equivalent: Customer Agent, Chatbot builder**

## What it is

The rules every AI agent follows, whatever the channel: what it answers, what it collects, how it ends a conversation,
and which actions (tools) it may take.

## Why it matters

The agent speaks for the business. It must be polite, correct and never promise what the business can't keep.

## How it works

**1. It answers** only from the [knowledge base](08-knowledge-base.md): the business profile, offerings, documents and
FAQs. Asked for a rate, it gives the "from" price, the GST note and what's included. When it can't find an answer, it
says the team will call back and logs the question for the owner. It handles common moments (a discount request, a
complaint, fully booked) the way the business chose in **Situations**.

**2. It collects**, one question at a time, without pushing: name, phone (taken from caller ID or WhatsApp, never asked
again), dates, number of people, what they're interested in, budget if offered, best time to call, and any custom
fields marked "AI should ask".

**3. It ends with one promise**, chosen by office hours:

| Situation | What the agent says |
| --- | --- |
| Business is open | "Our team will call you within 15 minutes." (minutes set per business) |
| Business is closed | "We're closed now. Someone will call you at 9 AM. Shall I send the details on WhatsApp now?" |
| Ready to book | "We'll send you the confirmation and booking link." Staff send it from their own system. |
| Not a sale (complaint, past order) | "I've passed this to the manager, who will get back to you." A ticket is raised. |

**4. It saves** the contact, lead, custom fields, the promise as a task, and a summary.

**Languages:** it replies in the customer's language (Malayalam, English and Hindi at launch; more once tested). Once a call settles
in a language, it stays in it. Numbers and prices are spoken naturally in each language, including Malayalam number words.

**Tools it may use:**

| Tool | What it does |
| --- | --- |
| `get_business_info` | Reads the business profile (hours, address, policies, payment methods) and the situations |
| `list_offerings` | Reads offerings, from-prices, GST notes and current offers |
| `search_knowledge` | Finds answers in uploaded documents and FAQs, with their source |
| `log_unanswered_question` | Records a question it couldn't answer, for the owner |
| `save_lead` | Saves contact, company, lead details, custom fields and the promise |
| `send_details_whatsapp` | Sends an offering's details on an approved WhatsApp template |
| `request_human_callback` | Raises a ticket for anything that isn't a sale |
| `transfer_call` | Transfers a call to the business's staff number during office hours |
| `end_call` | Ends a phone call politely |

## Rules

- Never invents facts, prices, availability or discounts.
- Never does maths. Never says a total, and never adds GST to a price.
- Never mentions competitors or their prices.
- Never asks for card or bank details.
- If unsure, it says so and offers a callback.
- Tells the customer it is an AI assistant if asked.

## Done when

- [ ] The agent test suite (scripted conversations in English, Malayalam and Hindi) passes on every change to prompts or tools.
- [ ] In tests, every conversation that gives a phone number ends with a saved lead and exactly one promise.
- [ ] No test conversation produces a total, a discount or an invented fact.

## Better than HubSpot

- Answers phone calls, not only chat and email, in Indian languages.
- Ends every conversation with a promise that becomes a task, so follow-up is guaranteed.

## For developers

- **Code folder:** `apps/api/src/agents`
- **API:** [API.md](../../API.md), Phase 1 → How the AI agent behaves
- **Code:** `agents/runtime` (prompt, conversation, model calls), `agents/tools` (every tool defined once),
  `agents/languages` (language detection and lock, Malayalam number words), `agents/voice`, `agents/text`,
  `agents/email`; industry wording in `core/industries`.
- **Tools:** defined once in `agents/tools` and served to voice, chat, email and the MCP server; each checks the
  business's engines.
- **Evals:** `npm run eval:agent` runs scripted conversations in English, Malayalam and Hindi on every prompt or tool
  change.

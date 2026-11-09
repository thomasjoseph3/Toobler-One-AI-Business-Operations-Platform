# How the system is built

*For everyone first, then for developers.*

## In plain words

The product is made of a few apps that share one database.

| App | Who uses it | What it does |
| --- | --- | --- |
| **API** | All the other apps | The brain. Every read and change goes through it. It also runs the AI agents and the background jobs. |
| **Staff app** | Business owners and staff | The screens: Today, Leads, Contacts, Inbox, Tasks, Reports, Settings. Works on computers and phones. |
| **Public site** | The business's customers | The chat bubble, the free check, quote and payment pages, help pages, the customer portal, and (Phase 6) whole websites. |
| **MCP server** | AI assistants like Claude | Lets a business use its CRM from an AI assistant, with the same permissions. |
| **Mobile app** (Phase 7) | Staff | The staff app as a phone app, with push alerts. |

Outside services do the specialised work: the phone provider carries calls, Meta carries WhatsApp messages, the AI model
provider runs the speech and language models, and the payment provider collects money. The full list is at the end of
[API.md](API.md).

## How one conversation flows

1. A customer calls, messages on WhatsApp, chats on the website or sends an email.
2. The phone provider, Meta or the mailbox passes it to our API.
3. The API works out which business it belongs to (from the number, the WhatsApp account or the mailbox).
4. The AI agent for that channel talks to the customer, using only that business's information and tools.
5. When the agent learns something (a name, dates, a promise), it calls a tool. The tool saves it: contact, lead,
   custom fields, task.
6. When the conversation ends, the agent writes a summary, and the code scores the lead.
7. Alerts go out on WhatsApp, and the staff app updates on every open screen.
8. Staff pick up from the Today page or the Inbox.

## Technology choices

| Part | Choice | Why |
| --- | --- | --- |
| Language | TypeScript everywhere | One language for every app; mistakes are caught before they run |
| API | Node.js with Fastify | Fast, with request checking built in |
| Database | PostgreSQL (a managed service) with Row Level Security | Reliable; the database itself keeps each business's data apart |
| Background jobs | A job queue stored in PostgreSQL | Jobs survive restarts; no extra system to run at the start |
| Staff app and public site | Next.js (React) | One framework for both; good on phones |
| Live updates | Server-sent events | Simple one-way push from the API to open screens |
| Voice AI | Gemini Live (speech in and speech out) | Natural, quick voice replies in Indian languages |
| Text AI (chat, WhatsApp, email, assistant) | Chosen per task by cost and quality tests (Gemini or Claude) | The best answer for the lowest cost |
| Phone calls | Exotel or Twilio (open) | Indian numbers, call forwarding, audio streaming |
| WhatsApp | Meta WhatsApp Cloud API | The official way |
| Payments and subscriptions | Razorpay (Stripe for customers abroad) | UPI auto-pay, cards, Indian invoices |
| Files (recordings, imports, documents) | S3-compatible object storage | Cheap; private links that expire |
| Knowledge base search | pgvector inside PostgreSQL, plus keyword search | Finds answers by meaning; no extra system to run |
| Errors and uptime | An error-tracking service and an outside uptime check | We hear about problems before customers do |
| Tests | Vitest for unit and API tests, Playwright for click-through tests, agent evals | Every layer is checked |

## Folder by folder

One repository holds every app.

```text
<repo>/
├── apps/
│   ├── api/                  The API: every endpoint, the AI agents, background jobs
│   │   ├── src/
│   │   │   ├── core/         CRM core, every business gets it
│   │   │   │   ├── accounts/       the business, its settings and office hours
│   │   │   │   ├── auth/           sign-up, sign-in, sessions, WhatsApp codes
│   │   │   │   ├── users/          people, roles, teams, invitations
│   │   │   │   ├── engines/        which engines each business has
│   │   │   │   ├── knowledge/      knowledge base: business questions, documents, FAQs, unanswered
│   │   │   │   │                   questions, fill from website, completeness score
│   │   │   │   ├── competitors/    competitor report
│   │   │   │   ├── offerings/      what the business sells
│   │   │   │   ├── contacts/       contacts, lifecycle stage, privacy (erase, export)
│   │   │   │   ├── companies/
│   │   │   │   ├── leads/          leads, pipelines, stages, sharing out, scoring
│   │   │   │   ├── activities/     timeline and notes
│   │   │   │   ├── tasks/
│   │   │   │   ├── fields/         custom fields
│   │   │   │   ├── views/          saved views, lists, search
│   │   │   │   ├── imports/        import and export
│   │   │   │   ├── duplicates/
│   │   │   │   ├── conversations/  inbox, takeover
│   │   │   │   ├── notifications/  staff alerts, morning summary
│   │   │   │   ├── tickets/
│   │   │   │   ├── today/
│   │   │   │   ├── reports/
│   │   │   │   ├── setup/          setup wizard progress
│   │   │   │   ├── industries/     presets and wording per industry
│   │   │   │   ├── billing/        our subscriptions to businesses
│   │   │   │   ├── audit/          activity log, support access
│   │   │   │   ├── platform/       platform console, health checks, usage
│   │   │   │   └── public/         the free check and other no-login endpoints
│   │   │   ├── engines/      one folder per paid engine
│   │   │   │   ├── leads/          follow-ups (Phase 1)
│   │   │   │   ├── sales/          Phase 2
│   │   │   │   ├── service/        Phase 3
│   │   │   │   ├── marketing/      Phase 4
│   │   │   │   ├── automation/     Phase 5
│   │   │   │   ├── content/        Phase 6
│   │   │   │   └── ai/             Phase 7
│   │   │   ├── agents/       the AI agents
│   │   │   │   ├── runtime/        prompt building, conversation, model calls, summaries
│   │   │   │   ├── tools/          every tool, defined once, checked against the business's engines
│   │   │   │   ├── languages/      language detection and lock, number words
│   │   │   │   ├── voice/          live phone conversations
│   │   │   │   ├── text/           website chat and WhatsApp
│   │   │   │   ├── email/          email sorting and replies
│   │   │   │   ├── assistant/      the staff assistant
│   │   │   │   └── setup/          the setup chat that asks the business questions
│   │   │   ├── channels/     the connections to outside services
│   │   │   │   ├── telephony/      one bridge per phone provider
│   │   │   │   ├── whatsapp/       webhook, sending, templates
│   │   │   │   ├── email/          mailbox reading and sending
│   │   │   │   └── webchat/        the chat bubble's connection
│   │   │   ├── jobs/         the job runner and every scheduled job
│   │   │   └── db/           database access and the Row Level Security helper
│   │   └── test/
│   ├── web/                  Staff app (Next.js)
│   │   └── app/              today, leads, contacts, companies, tasks, inbox, tickets,
│   │                         reports, settings, setup, platform
│   ├── site/                 Public site (Next.js): widget, check, quotes, booking links,
│   │                         help pages, portal, websites
│   ├── mcp/                  MCP server
│   ├── mobile/               Phone app (Phase 7)
│   └── extension/            Gmail and Outlook extension (Phase 2)
├── packages/
│   ├── shared/               types and request checks shared by every app
│   └── ui/                   shared screen parts (buttons, tables, the board)
├── db/
│   └── migrations/           001_*.sql onwards, one file per change
├── docs/
│   └── requirements/         these documents
├── scripts/                  agent evals, local test data (never on live)
└── .github/workflows/        tests on every push; deploy on merge to main
```

Each folder in `core/` and `engines/` has the same files: `routes.ts` (the API endpoints), `service.ts` (the rules),
`repository.ts` (database reads and writes) and `*.test.ts`.

## Rules for the code

- **Every table has `account_id`** and a Row Level Security policy. The API sets the business on each database
  connection, so a query can't reach another business even by mistake.
- **Money is stored in paise** as whole numbers, never as decimals. Totals are worked out in code.
- **Times are stored in UTC**; each business has a time zone for office hours and display.
- **Phone numbers** are stored in international form (+91…) plus a `phone_key` (last 10 digits) for matching.
- **IDs** are UUIDs.
- **Every change** to a record notes who made it (a person, the AI, a workflow, an import) and when.
- **Secrets** live in environment settings on the server, never in the code or the logs.
- **Every API endpoint** has tests that prove it works, refuses the wrong role, and refuses another business.

## Environments and branches

| Environment | Branch | Database | Who uses it |
| --- | --- | --- | --- |
| Local | any | a throwaway database per test run | Developers |
| Staging | `dev` | its own database | Our team, for checking |
| Production | `main` | the live database, real businesses only | Customers |

Work happens on short branches, merges into `dev`, and reaches `main` only through a checked pull request with all tests
passing.

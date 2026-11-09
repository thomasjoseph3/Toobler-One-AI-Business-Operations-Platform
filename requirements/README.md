# Product requirements: start here

*Written 6 Nov 2026. Owner: Thomas Joseph.*

## What we are building

A customer management system (a **CRM**) for small businesses, like HubSpot, with one big difference: **our AI agents do
the work.** They answer every phone call, WhatsApp message, website chat and email, day and night, in the customer's
language (Malayalam, English and Hindi at launch). Then they save everything into the CRM by themselves.

HubSpot is a place where staff record their work. Ours does most of that work for them.

## How the product is shaped

The product has three layers.

1. **CRM core.** Every business gets it. Contacts, companies, a leads board, a timeline of every conversation, tasks,
   custom fields, an inbox, reports. This is the HubSpot part.
2. **Engines.** Paid modules a business switches on. HubSpot calls these "hubs".
3. **AI agents.** Voice, WhatsApp, chat and email agents, plus a staff assistant. They work across every engine.

| Engine | What it does | Like HubSpot's | Phase |
| --- | --- | --- | --- |
| Lead engine | Answers every enquiry, saves and scores the lead, promises a callback | Smart CRM + parts of Sales Hub | 1 |
| Sales engine | Products, quotes, payments, bookings, invoices, sales team tools | Sales Hub + Revenue Hub | 2 |
| Service engine | Help desk, public help articles, customer portal, surveys | Service Hub | 3 |
| Marketing engine | Forms, campaigns on WhatsApp/email/SMS, ads, social, tracking | Marketing Hub | 4 |
| Automation and data | Workflows, custom objects, integrations, report builder | Data Hub | 5 |
| Content engine | Website builder, blog, SEO | Content Hub | 6 |
| AI and scale | Build-your-own agents, call coaching, mobile app, big-company controls | Agent Hub + Enterprise | 7 |

## What is in this folder

| File or folder | What it holds |
| --- | --- |
| This README | The overview, the rules, the decisions |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the system is built: apps, technology, the code folder by folder |
| [API.md](API.md) | Every API endpoint and agent tool we build, phase by phase, feature by feature |
| [HUBSPOT-COVERAGE.md](HUBSPOT-COVERAGE.md) | Every HubSpot feature and the file that covers it, so nothing is missed |
| [GLOSSARY.md](GLOSSARY.md) | Plain meanings of the words used |
| `phase-1-…` to `phase-7-…` | One folder per phase, one file per feature |

## The phases

Each phase is finished, tested and live before the next one starts. A business can use the product from the end of
Phase 1.

| Phase | Folder | In one line |
| --- | --- | --- |
| 1 | [phase-1-lead-engine](phase-1-lead-engine/README.md) | The lead engine plus the full CRM core. A business can run on this alone. |
| 2 | [phase-2-sales-engine](phase-2-sales-engine/README.md) | Turn leads into paid sales: quotes, payments, bookings, invoices, sales tools. |
| 3 | [phase-3-service-engine](phase-3-service-engine/README.md) | Look after customers after the sale. |
| 4 | [phase-4-marketing-engine](phase-4-marketing-engine/README.md) | Bring in more enquiries. |
| 5 | [phase-5-automation-and-data](phase-5-automation-and-data/README.md) | Let each business automate its own way and connect other apps. |
| 6 | [phase-6-content-engine](phase-6-content-engine/README.md) | Build and run the business's website. |
| 7 | [phase-7-ai-and-scale](phase-7-ai-and-scale/README.md) | Custom AI agents, coaching, mobile app, large-business controls. |

## How to read a feature file

Every feature has its own file, with these parts in this order.

| Part | Who it is for | What it says |
| --- | --- | --- |
| Top line | Everyone | Phase, area, and the HubSpot feature it matches |
| What it is | Everyone | The feature in two or three plain sentences |
| Why it matters | Everyone | What goes wrong for a business without it |
| How it works | Everyone | A short story, step by step, of someone using it |
| Rules | Everyone | What must always or never happen |
| Screens | Everyone, designers | The pages and buttons |
| Done when | Everyone, testers | A checklist. The feature is finished when every box is true. |
| Better than HubSpot | Everyone | What we do that HubSpot doesn't |
| For developers | Developers | Code folder, the feature's endpoints in [API.md](API.md), tables, agent tools, jobs |
| Open questions | The owner | Decisions still needed |

Phase 1 files are complete. Files for Phases 2–7 are shorter: a part with nothing to add yet is left out, and is
filled in when that phase starts.

## Rules every feature follows

A feature that breaks one of these is not done.

1. **Each business sees only its own data.** Every table carries the business's id and the database itself blocks
   anyone else from reading it.
2. **The AI never does maths.** Every price or total it speaks comes from a tool that calculates it in code.
3. **The AI only says what the business told it.** Nothing invented. If it doesn't know, it says so and offers a
   callback.
4. **Nothing is deleted without asking.** Every delete in the app has an "Are you sure?" step.
5. **Build only what this phase needs.** No tables or screens for a later phase. Each database change is its own
   numbered migration.
6. **Every industry works the same way.** Hotels, travel agents, clinics, car dealers and any other business use the
   same screens and flows. The industry only changes words and presets, never the code path.
7. **Clean data only.** The live database holds real businesses' data, never test or demo data. Tests use a throwaway
   database.
8. **Every page works on a phone.** Business owners mostly check from their phone.
9. **Every step is tested.** Lint, unit tests, API tests and click-through tests pass, and the feature is checked in the
   running app, before it is called done.

## Decisions taken

| Decision | Choice |
| --- | --- |
| One sales record or two | One: the **lead**. It moves along the board from New to Won or Lost. In Phase 2 it can also carry products, quotes and a value. HubSpot's separate "deal" is not needed. |
| What Phase 1 holds | The lead engine plus the full CRM core |
| How much of HubSpot | Every feature gets a phase |
| Launch languages | Malayalam, English and Hindi |
| Technology | See [ARCHITECTURE.md](ARCHITECTURE.md) |

## Decisions still open

- **Product name.**
- **Pricing:** one monthly price per business (suggested), or per staff login like HubSpot; and whether there's a free
  plan. See [subscription billing](phase-1-lead-engine/5-onboarding-and-launch/04-subscription-billing.md).
- **Phone provider:** Exotel or Twilio. See [phone calls](phase-1-lead-engine/3-ai-agents-and-channels/03-phone-calls.md).
- **Hosting:** a single server to start, or a cloud platform. See [go live](phase-1-lead-engine/5-onboarding-and-launch/06-go-live.md).

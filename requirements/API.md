# API list

Every API we build, phase by phase and feature by feature, in the same order as the feature files.

## In plain words

An API is the set of web addresses our apps use to read and change data. The staff app, the public site, the phone app
and (from Phase 5) other companies' software all go through it. Each row below is one address, called an **endpoint**.

**Who can call it:**

| Who | Meaning |
| --- | --- |
| Staff | Any signed-in staff member of the business |
| Manager | Only managers of the business |
| Public | Anyone, without signing in (rate-limited) |
| Customer | A business's customer, signed in to the portal with a WhatsApp code |
| Provider | An outside service telling us something (Meta, the phone provider, the payment provider), checked by signature |
| Platform | Only our own team |

Besides endpoints, the AI agents use **tools**. These are listed at the end, with the outside services we call.

## Rules for every endpoint (for developers)

- Every address starts with `/api/v1`, which is left out below.
- The staff app signs in with a session cookie. Other software uses API keys or OAuth (Phase 5).
- A staff endpoint always acts on the signed-in person's **current business** and can never reach another.
- Lists accept `?page`, `?limit` (at most 100), `?sort` and `?filter[field]=value`, and return `{ items, next }`.
- Errors return `{ "error": { "code", "message" } }` with the right HTTP status.
- Writes accept an `Idempotency-Key` header, so a repeated request doesn't do the work twice.
- Requests and responses are checked against shared schemas in `packages/shared`.
- Provider webhooks check the signature, answer quickly, and do the work in a background job.
- Every endpoint has tests for: works, wrong role refused, other business refused.
- `{id}` means the id of that record.

---

# Phase 1: Lead engine and CRM core

### Users, roles and teams

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/users` | List the team with role, team, last seen | Staff |
| POST | `/users/invite` | Invite a person by email and WhatsApp | Manager |
| POST | `/invites/{token}/accept` | Accept an invitation and set a password | Public |
| PATCH | `/users/{id}` | Change role or team | Manager |
| DELETE | `/users/{id}?reassign_to=` | Remove a person, handing over their leads and tasks | Manager |
| GET | `/teams` | List teams | Staff |
| POST | `/teams` | Add a team | Manager |
| PATCH | `/teams/{id}` | Rename, change members | Manager |
| DELETE | `/teams/{id}` | Remove a team | Manager |

### Engines and plans

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/engines` | Which engines the business has | Staff |

### Security, privacy and the activity log

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/audit-log` | Who did what, when (filters: person, kind, date) | Manager |
| GET | `/support-access` | Is Toobler's support access on, and until when | Manager |
| POST | `/support-access` | Grant support access for a set time | Manager |
| DELETE | `/support-access` | End support access | Manager |
| GET | `/contacts/{id}/export` | Download everything held about a contact | Manager |
| POST | `/contacts/{id}/erase` | Erase a contact's personal data | Manager |

### Contacts

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/contacts` | List with filters, search, saved view, columns | Staff |
| POST | `/contacts` | Add a contact | Staff |
| GET | `/contacts/{id}` | Details, custom fields, company, leads, tasks | Staff |
| PATCH | `/contacts/{id}` | Edit details, owner, lifecycle stage | Staff |
| DELETE | `/contacts/{id}` | Delete (the app asks first) | Manager |

### Companies

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/companies` | List | Staff |
| POST | `/companies` | Add | Staff |
| GET | `/companies/{id}` | Details, contacts, leads, combined timeline | Staff |
| PATCH | `/companies/{id}` | Edit | Staff |
| DELETE | `/companies/{id}` | Delete, keeping its contacts | Manager |
| PUT | `/contacts/{id}/company` | Link or change a contact's company | Staff |

### Leads and the pipeline board

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/leads` | List or board (`?view=board`), with filters | Staff |
| POST | `/leads` | Add a lead by hand | Staff |
| GET | `/leads/{id}` | Details, custom fields, conversations, tasks | Staff |
| PATCH | `/leads/{id}` | Edit details | Staff |
| POST | `/leads/{id}/move` | Move to a stage (Lost needs `lost_reason`) | Staff |
| POST | `/leads/{id}/assign` | Change owner or team | Staff |
| DELETE | `/leads/{id}` | Delete | Manager |
| GET | `/pipeline` | Stages in order | Staff |
| POST | `/pipeline/stages` | Add a stage | Manager |
| PATCH | `/pipeline/stages/{id}` | Rename | Manager |
| POST | `/pipeline/stages/reorder` | Reorder | Manager |
| DELETE | `/pipeline/stages/{id}?move_to=` | Remove, moving its leads | Manager |
| GET, PUT | `/lost-reasons` | Read or replace the list of lost reasons | Manager |
| GET, PUT | `/assignment-rules` | How new leads are shared out | Manager |

### Activity timeline and notes

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/activities?contact_id=&lead_id=&company_id=&kind=` | The timeline | Staff |
| POST | `/notes` | Add a note to a contact or lead | Staff |
| PATCH | `/notes/{id}` | Edit own note | Staff |
| DELETE | `/notes/{id}` | Delete a note | Manager |
| GET | `/calls/{id}` | Call details, summary, transcript | Staff |
| GET | `/calls/{id}/recording` | A short-lived link to the recording | Staff |

### Tasks and reminders

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/tasks?due=overdue|today|upcoming|done&owner=` | List | Staff |
| POST | `/tasks` | Add | Staff |
| PATCH | `/tasks/{id}` | Complete, snooze, reassign, edit | Staff |
| DELETE | `/tasks/{id}` | Delete | Staff |

### Custom fields

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/fields?object=contact|company|lead` | List definitions | Staff |
| POST | `/fields` | Add a field | Manager |
| PATCH | `/fields/{id}` | Edit label, options, "AI should ask", "required before Won" | Manager |
| POST | `/fields/reorder` | Reorder | Manager |
| DELETE | `/fields/{id}` | Remove (values hidden for 30 days) | Manager |

### Lead scoring and filtering

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| PATCH | `/leads/{id}/temperature` | Set hot, warm or cold by hand | Staff |
| GET | `/leads?filtered=true` | The Filtered list | Staff |
| POST | `/leads/{id}/unfilter` | Move back onto the board | Staff |

### Views, filters and search

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/views?object=` | Saved views | Staff |
| POST | `/views` | Save a view | Staff |
| PATCH | `/views/{id}` | Rename, share, change | Staff (own), Manager (shared) |
| DELETE | `/views/{id}` | Delete | Staff (own), Manager (shared) |
| GET | `/search?q=` | Find contacts, companies, leads by name, phone or email | Staff |
| GET | `/lists` | Static contact lists | Staff |
| POST | `/lists` | Make a list from a view or by hand | Staff |
| POST | `/lists/{id}/members` | Add contacts | Staff |
| DELETE | `/lists/{id}/members/{contact_id}` | Remove a contact | Staff |
| DELETE | `/lists/{id}` | Delete a list | Manager |

### Import and export

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| POST | `/imports` | Upload a spreadsheet; returns a preview and guessed columns | Manager |
| PATCH | `/imports/{id}` | Fix the column mapping; returns counts | Manager |
| POST | `/imports/{id}/run` | Start the import | Manager |
| GET | `/imports/{id}` | Progress and report | Manager |
| POST | `/exports` | Export a view or list; the link is emailed | Manager |
| GET | `/exports/{id}` | Status and short-lived download link | Manager |

### Duplicates and merging

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/duplicates?object=` | Possible duplicates with reasons | Staff |
| POST | `/duplicates/{id}/merge` | Merge, with the values to keep | Manager |
| POST | `/duplicates/{id}/dismiss` | "Not the same" | Staff |

### Business info and offerings

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/business` | Business profile, hours, promises, alert number, languages | Staff |
| PATCH | `/business` | Edit promises and alerts | Manager |
| GET | `/business/completeness` | Score and what's missing | Staff |
| POST | `/business/fill-from-website` | Read a website, listing or upload and draft answers and offerings | Manager |
| GET | `/offerings` | List | Staff |
| POST | `/offerings` | Add | Manager |
| PATCH | `/offerings/{id}` | Edit, switch on or off | Manager |
| POST | `/offerings/reorder` | Reorder | Manager |
| DELETE | `/offerings/{id}` | Delete | Manager |
| GET, POST | `/offers` | Current offers with end dates | Staff, Manager |
| PATCH, DELETE | `/offers/{id}` | Edit, delete | Manager |
| POST | `/agent/test-chat` | Talk to the agent as a customer would; each answer shows its source | Staff |

### Knowledge base

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/knowledge/questions` | The business questions for this business's industry, with answers, sources and status | Staff |
| PUT | `/knowledge/answers/{question_key}` | Answer or change one question | Manager |
| POST | `/knowledge/answers/confirm` | Confirm pre-filled answers (one or many) | Manager |
| POST | `/knowledge/prefill` | Start reading a website or listing links | Manager |
| GET | `/knowledge/prefill/{id}` | Progress and what was found | Manager |
| GET | `/knowledge/situations` | Situations and the chosen handling | Staff |
| PUT | `/knowledge/situations/{key}` | Change how one situation is handled | Manager |
| GET | `/knowledge/documents` | Uploaded documents and website pages | Staff |
| POST | `/knowledge/documents` | Upload a file or photo (returns an upload address) | Manager |
| PATCH | `/knowledge/documents/{id}` | Use for answers or not, rename | Manager |
| DELETE | `/knowledge/documents/{id}` | Delete (asks first) | Manager |
| POST | `/knowledge/website/reread` | Read the website again and list what changed | Manager |
| GET, POST | `/knowledge/faqs` | List, add | Staff, Manager |
| PATCH, DELETE | `/knowledge/faqs/{id}` | Edit, delete | Manager |
| GET | `/knowledge/unanswered` | Questions the AI couldn't answer, grouped, with counts | Manager |
| POST | `/knowledge/unanswered/{id}/answer` | Answer; it becomes an FAQ | Manager |
| POST | `/knowledge/unanswered/{id}/dismiss` | Ignore | Manager |
| GET | `/knowledge/conflicts` | "These don't match" warnings | Manager |
| POST | `/knowledge/conflicts/{id}/resolve` | Pick the right value | Manager |

### How the AI agent behaves

No endpoints of its own; it acts through the agent tools listed at the end.

### Phone calls

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/channels/phone` | Our number, forwarding status, forwarding codes | Staff |
| PATCH | `/channels/phone` | Transfer number, recording days | Manager |
| POST | `/channels/phone/test-call` | Ring the owner's phone for a test | Manager |
| POST | `/webhooks/telephony/{provider}` | Call started, answered, ended | Provider |
| WS | `/voice/stream/{call_id}` | Live call audio both ways | Provider |

### WhatsApp

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/webhooks/whatsapp` | Meta's verify check | Provider |
| POST | `/webhooks/whatsapp` | Incoming messages, delivery and read updates | Provider |
| GET | `/channels/whatsapp` | Connected number and status | Staff |
| GET | `/channels/whatsapp/templates` | Templates and approval state | Manager |
| POST | `/channels/whatsapp/templates` | Submit a template to Meta | Manager |

### Website chat

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/channels/webchat` | Settings and the code to paste | Staff |
| PATCH | `/channels/webchat` | Colour, greeting, position, allowed websites | Manager |
| GET | `/public/widget/{key}/config` | The bubble's settings | Public |
| POST | `/public/widget/{key}/messages` | Send a visitor's message; streams the reply | Public |
| WS | `/public/widget/{key}/call` | Web call to the voice agent | Public |

### Email

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/channels/email` | Connected mailbox, status, reply modes | Staff |
| POST | `/channels/email/connect` | Start connecting Gmail or Outlook (or save IMAP details) | Manager |
| GET | `/channels/email/callback` | Finish the Gmail or Outlook sign-in | Manager |
| PATCH | `/channels/email` | Reply mode per kind: AI sends, or AI drafts | Manager |
| DELETE | `/channels/email` | Disconnect | Manager |
| POST | `/webhooks/gmail` | Gmail's "new mail" push | Provider |

### Staff takeover

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| POST | `/conversations/{id}/takeover` | Stop the AI; I'll reply | Staff |
| POST | `/conversations/{id}/handback` | Hand back to the AI | Staff |

### Today page

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/today?scope=me|team` | Late, hot, due today, overnight, this week | Staff |
| GET | `/events` | Live updates stream (server-sent events) | Staff |

### Inbox

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/conversations?channel=&status=&needs_person=` | The inbox | Staff |
| GET | `/conversations/{id}` | One conversation with messages | Staff |
| POST | `/conversations/{id}/reply` | Reply on the customer's channel | Staff |
| POST | `/conversations/{id}/draft/send` | Send the AI's email draft, edited or not | Staff |
| POST | `/conversations/{id}/done` | Mark done | Staff |

### Staff alerts and the morning summary

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/me/alerts` | My alert settings | Staff |
| PUT | `/me/alerts` | Change them | Staff |
| GET, PUT | `/alert-settings` | Business-wide: alert number, required alerts, night alerts | Manager |

### Follow-ups

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/follow-ups?status=pending` | Drafts waiting for approval | Staff |
| PATCH | `/follow-ups/{id}` | Edit a draft | Staff |
| POST | `/follow-ups/{id}/send` | Approve and send | Staff |
| POST | `/follow-ups/{id}/cancel` | Cancel | Staff |
| GET, PUT | `/follow-up-settings` | Days, stages, ask-first or automatic | Manager |

### Reports and dashboard

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/reports/{name}?from=&to=` | One report: `leads-by-channel`, `after-hours`, `speed-to-call`, `funnel`, `won-lost`, `by-staff`, `by-offering` | Manager |
| GET | `/reports/{name}/leads?bucket=` | The leads behind one bar | Manager |
| GET | `/reports/{name}/export` | Download the numbers | Manager |

### Tickets

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/tickets` | List | Staff |
| POST | `/tickets` | Add | Staff |
| GET | `/tickets/{id}` | Details | Staff |
| PATCH | `/tickets/{id}` | Assign, note, close | Staff |

### Staff assistant

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| POST | `/assistant/messages` | Ask a question (text or voice); streams the answer | Staff |
| POST | `/assistant/actions/{id}/confirm` | Confirm a change the assistant proposed | Staff |
| GET | `/assistant/chats` | Past chats | Staff |
| (MCP) | `apps/mcp` | The same tools for Claude and other AI apps | Staff (signed in) |

### Free "what you're missing" check

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| POST | `/public/check` | Work out the rupee figure from the answers | Public |
| POST | `/public/check/send-code` | Send a WhatsApp code to the owner's number | Public |
| POST | `/public/check/send-report` | Check the code and send the report on WhatsApp | Public |

### Sign-up and sign-in

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| POST | `/auth/signup` | Create the business and its owner | Public |
| POST | `/auth/verify-email` | Confirm email from the link | Public |
| POST | `/auth/login` | Email and password | Public |
| POST | `/auth/code/send` | Send a WhatsApp code to a mobile | Public |
| POST | `/auth/code/verify` | Sign in with the code | Public |
| POST | `/auth/password/forgot` | Email a reset link | Public |
| POST | `/auth/password/reset` | Set a new password | Public |
| POST | `/auth/logout` | Sign out | Staff |
| GET | `/me` | Me, my businesses, my role | Staff |
| PATCH | `/me` | My name, language, password | Staff |
| POST | `/me/business` | Switch current business | Staff |

### Setup wizard

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/setup` | Steps and which are done | Manager |
| PATCH | `/setup` | Mark a step done or skipped | Manager |
| POST | `/setup/chat` | Send the owner's reply to the setup chat; returns the next question, its options and any pre-filled answer (streamed) | Manager |
| GET | `/industries` | Industries and their presets | Public |
| POST | `/setup/apply-preset` | Apply an industry's stages, fields and wording | Manager |
| POST | `/setup/go-live` | Start answering real customers | Manager |

### Subscription billing

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/billing` | Plan, trial end, next payment, invoices | Manager |
| POST | `/billing/subscribe` | Start paying (returns the payment page) | Manager |
| POST | `/billing/change` | Change plan | Manager |
| POST | `/billing/cancel` | Cancel | Manager |
| GET | `/billing/invoices/{id}` | Download an invoice | Manager |
| POST | `/webhooks/billing/razorpay` | Payment and subscription updates | Provider |

### Platform console

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/platform/businesses` | Every business with plan, health, activity | Platform |
| GET | `/platform/businesses/{id}` | One business | Platform |
| POST | `/platform/businesses/{id}/suspend` | Suspend (asks first) | Platform |
| POST | `/platform/businesses/{id}/engines` | Switch an engine on or off for a business | Platform |
| GET | `/platform/health` | Channel and connection checks | Platform |
| GET | `/platform/usage?from=&to=` | Calls, minutes, messages, AI cost per business | Platform |
| POST | `/platform/businesses/{id}/visit` | Open a business under granted support access (logged) | Platform |
| GET | `/health` | Uptime check | Public |

### Go live

No endpoints of its own.

### Competitor report

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, PUT | `/competitors` | Up to three competitor links | Manager |
| POST | `/competitors/report` | Build or refresh the report (once a month) | Manager |
| GET | `/competitors/report` | The latest report | Manager |

---

# Phase 2: Sales engine

### Engines (switch screen)

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| POST | `/engines/{engine}/enable` | Switch an engine on (after payment) | Manager |
| POST | `/engines/{engine}/disable` | Switch off, keeping data | Manager |

### Products and price lists

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/products` | List, add | Staff, Manager |
| GET, PATCH, DELETE | `/products/{id}` | Read, edit, delete | Staff, Manager |
| GET, POST | `/products/{id}/variants` | Variants (season, room type, date) | Staff, Manager |
| GET, POST | `/price-lists` | Price lists | Manager |
| PATCH, DELETE | `/price-lists/{id}` | Edit, delete | Manager |
| GET | `/availability?product_id=&from=&to=&qty=` | What's free | Staff |
| POST | `/pricing/quote` | Exact price worked out in code | Staff |

### Quotes

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/quotes` | List, create | Staff |
| GET, PATCH, DELETE | `/quotes/{id}` | Read, edit (draft only), delete | Staff |
| POST | `/quotes/{id}/send` | Send by WhatsApp or email | Staff |
| GET | `/quotes/{id}/pdf` | Download | Staff |
| GET | `/public/quotes/{token}` | The customer's quote page | Public |
| POST | `/public/quotes/{token}/accept` | Accept (and pay if set) | Public |

### Quote rules and approvals

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, PUT | `/quote-rules` | Discount limits, minimum prices | Manager |
| GET | `/quote-approvals` | Waiting approvals | Manager |
| POST | `/quote-approvals/{id}/approve` | Approve | Manager |
| POST | `/quote-approvals/{id}/reject` | Reject with a reason | Manager |

### Payment links and payments

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/payments` | List | Staff |
| POST | `/payment-links` | Create and send a link | Staff |
| POST | `/payments/manual` | Record cash or bank transfer | Staff |
| POST | `/payments/{id}/refund` | Refund (asks first) | Manager |
| GET | `/public/pay/{token}` | The customer's payment page | Public |
| POST | `/webhooks/payments/{provider}` | Payment updates | Provider |
| GET, PUT | `/payment-settings` | The business's payment account | Manager |

### Bookings and cancellations

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/bookings` | List, create (with hold) | Staff |
| GET, PATCH | `/bookings/{id}` | Read, change | Staff |
| POST | `/bookings/{id}/cancel` | Cancel; refund worked out by the rules | Staff |
| GET, PUT | `/cancellation-policies` | The business's rules | Manager |
| GET | `/public/manage/{token}` | The customer's booking page | Public |
| POST | `/public/manage/{token}/change` | Ask to change | Public |
| POST | `/public/manage/{token}/cancel` | Cancel | Public |

### Invoices and tax

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/invoices` | List, create | Staff |
| GET, PATCH | `/invoices/{id}` | Read, edit (draft only) | Staff |
| POST | `/invoices/{id}/send` | Send | Staff |
| POST | `/invoices/{id}/void` | Cancel with a credit note | Manager |
| GET | `/invoices/{id}/pdf` | Download | Staff |
| GET, PUT | `/tax-settings` | GSTIN, state, tax rates | Manager |

### Subscriptions and recurring billing

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/customer-subscriptions` | List, create | Staff |
| GET, PATCH | `/customer-subscriptions/{id}` | Read, change | Staff |
| POST | `/customer-subscriptions/{id}/pause` | Pause | Staff |
| POST | `/customer-subscriptions/{id}/cancel` | Cancel (asks first) | Manager |

### Contracts and e-signature

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| POST | `/quotes/{id}/signature-request` | Ask the customer to sign | Staff |
| GET | `/public/sign/{token}` | The signing page | Public |
| POST | `/public/sign/{token}` | Sign with a phone code | Public |
| GET | `/signatures/{id}` | Signed PDF and record | Staff |

### Revenue reports

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/reports/{name}` | Adds `revenue-by-month`, `revenue-by-product`, `revenue-by-staff`, `collected-vs-owed`, `ai-saved-revenue` | Manager |

### Meeting scheduler

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| POST | `/calendar/connect` | Connect Google or Outlook calendar | Staff |
| GET, POST | `/meeting-links` | My booking links | Staff |
| PATCH, DELETE | `/meeting-links/{id}` | Edit, delete | Staff |
| GET | `/meetings` | Upcoming meetings | Staff |
| GET | `/public/meet/{slug}/slots?from=&to=` | Free times | Public |
| POST | `/public/meet/{slug}/book` | Book a time | Public |
| POST | `/public/meet/booking/{token}/reschedule` | Move it | Public |

### Sequences

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/sequences` | List, create | Manager |
| GET, PATCH, DELETE | `/sequences/{id}` | Read, edit, delete | Manager |
| POST | `/sequences/{id}/enrol` | Enrol leads | Staff |
| POST | `/enrolments/{id}/stop` | Stop for one lead | Staff |
| GET | `/sequences/{id}/stats` | Reply and win rates | Manager |

### Email and WhatsApp templates, snippets and scheduling

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/templates` | List, add | Staff |
| PATCH, DELETE | `/templates/{id}` | Edit, delete | Staff (own), Manager |
| GET, POST | `/snippets` | List, add | Staff |
| PATCH, DELETE | `/snippets/{id}` | Edit, delete | Staff (own), Manager |
| POST | `/ai/draft-reply` | AI writes a reply for a conversation | Staff |
| GET, POST | `/scheduled-messages` | List, schedule | Staff |
| DELETE | `/scheduled-messages/{id}` | Cancel | Staff |

### Email tracking and mail extensions

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| POST | `/mail/connect` | Connect my Gmail or Outlook | Staff |
| DELETE | `/mail/connect` | Disconnect | Staff |
| GET | `/t/o/{id}.gif` | Open tracking | Public |
| GET | `/t/c/{id}` | Link click tracking, then redirect | Public |
| GET | `/extension/contact?email=` | The side panel's data | Staff |

### Staff calling and call logging

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| POST | `/calls/outbound` | Ring me, then the customer | Staff |
| POST | `/calls/{id}/outcome` | Log the outcome | Staff |
| POST | `/dialer/sessions` | Start calling down a list | Staff |
| POST | `/dialer/sessions/{id}/next` | Next call | Staff |
| POST | `/calls/{id}/apply-suggestions` | Approve fields the AI heard on a staff call | Staff |

### Document sharing

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/documents` | List, upload | Staff, Manager |
| DELETE | `/documents/{id}` | Delete | Manager |
| POST | `/documents/{id}/send` | Send to a contact | Staff |
| GET | `/public/d/{token}` | View (tracked) | Public |

### Playbooks

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/playbooks` | List, add | Staff, Manager |
| PATCH, DELETE | `/playbooks/{id}` | Edit, delete | Manager |
| POST | `/leads/{id}/playbook-answers` | Save answers to the lead | Staff |

### Deal plans and buying groups

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/leads/{id}/contacts` | People on a lead and their roles | Staff |
| DELETE | `/leads/{id}/contacts/{contact_id}` | Remove | Staff |
| GET, POST | `/leads/{id}/plan-steps` | Plan steps | Staff |
| PATCH, DELETE | `/plan-steps/{id}` | Edit, tick, delete | Staff |

### Forecasting and goals

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/goals` | List, set | Manager |
| PATCH, DELETE | `/goals/{id}` | Edit, delete | Manager |
| GET | `/forecast?period=` | Forecast from open leads | Manager |
| PUT | `/leads/{id}/splits` | Split credit between staff | Manager |

### Deal scoring and next steps

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/leads/{id}/next-steps` | Suggested next steps and likelihood with reasons | Staff |
| POST | `/next-steps/{id}/do` | Do the suggestion | Staff |
| POST | `/next-steps/{id}/dismiss` | Dismiss | Staff |

---

# Phase 3: Service engine

### Help desk and ticket pipelines

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/ticket-pipelines` | List, add pipelines and stages | Manager |
| PATCH, DELETE | `/ticket-pipelines/{id}` | Edit, delete | Manager |
| POST | `/tickets/{id}/reply` | Reply on the customer's channel | Staff |
| POST | `/tickets/{id}/move` | Change stage | Staff |

### Routing and skills

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, PUT | `/routing-rules` | Rules | Manager |
| GET, PUT | `/users/{id}/skills` | Skills and languages | Manager |
| PUT | `/me/availability` | Available or Away | Staff |

### Response-time targets (SLAs)

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/sla-policies` | List, add | Manager |
| PATCH, DELETE | `/sla-policies/{id}` | Edit, delete | Manager |

### Ticket automation

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/ticket-rules` | List, add | Manager |
| PATCH, DELETE | `/ticket-rules/{id}` | Edit, switch off, delete | Manager |

### Knowledge base

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/kb/articles` | List, write | Staff, Manager |
| PATCH, DELETE | `/kb/articles/{id}` | Edit, publish, delete | Manager |
| POST | `/kb/articles/draft-from-tickets` | AI drafts an article from resolved tickets | Manager |
| GET, POST | `/kb/categories` | Categories | Manager |
| GET | `/public/help/{site}` | Help page | Public |
| GET | `/public/help/{site}/search?q=` | Search articles | Public |

### Customer portal

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| POST | `/public/portal/{site}/code` | Send a WhatsApp code | Public |
| POST | `/public/portal/{site}/verify` | Sign in | Public |
| GET | `/portal/me` | My bookings, quotes, invoices, payments, tickets | Customer |
| POST | `/portal/requests` | Raise a request | Customer |
| POST | `/portal/tickets/{id}/reply` | Reply to my ticket | Customer |

### Feedback surveys

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/surveys` | List, add | Manager |
| PATCH, DELETE | `/surveys/{id}` | Edit, switch off, delete | Manager |
| GET | `/surveys/{id}/responses` | Answers | Manager |
| GET | `/public/survey/{token}` | Survey page (for email surveys) | Public |
| POST | `/public/survey/{token}` | Answer | Public |

### Customer success and health scores

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/health-scores?status=at-risk|due` | At-risk and due lists | Staff |
| GET | `/contacts/{id}/health` | One customer's score and reasons | Staff |

### Phone menu and call routing

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, PUT | `/call-routes` | Who gets which calls, queues, fallback | Manager |

### Service reports

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/reports/{name}` | Adds `tickets`, `first-reply-time`, `sla-met`, `ai-resolved`, `survey-scores`, `workload` | Manager |

### What the AI couldn't answer

The list itself is in Phase 1 (`/knowledge/unanswered`). Phase 3 adds:

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/knowledge/unanswered/{id}/suggested-answer` | An answer drafted from how staff answered the same question in tickets and chats | Manager |

---

# Phase 4: Marketing engine

### Consent and marketing contacts

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/contacts/{id}/consents` | Consent per channel with source and time | Staff |
| PUT | `/contacts/{id}/consents/{channel}` | Record consent or stop | Staff |

### Forms

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/forms` | List, build | Manager |
| GET, PATCH, DELETE | `/forms/{id}` | Read, edit, delete | Manager |
| GET | `/forms/{id}/submissions` | Submissions | Staff |
| GET | `/public/forms/{id}` | Form definition for the embed | Public |
| POST | `/public/forms/{id}/submit` | Submit | Public |
| POST | `/webhooks/meta-leads` | Facebook and Instagram lead ads | Provider |

### Landing pages

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/pages?kind=landing` | List, create | Manager |
| POST | `/pages/draft` | AI drafts a page from a sentence | Manager |
| GET, PATCH, DELETE | `/pages/{id}` | Read, edit, delete | Manager |
| POST | `/pages/{id}/publish` | Publish | Manager |
| GET, POST | `/pages/{id}/variants` | A/B versions | Manager |

### Website tracking and visitor intent

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| POST | `/public/track` | Page view and source from the tracking script | Public |
| GET | `/contacts/{id}/visits` | Pages a contact saw and where they came from | Staff |

### Segments and lists

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/segments` | List, build | Manager |
| GET, PATCH, DELETE | `/segments/{id}` | Read, edit, delete | Manager |
| GET | `/segments/{id}/preview` | Who is in it now | Manager |
| GET | `/segments/{id}/lookalikes` | Similar contacts with reasons | Manager |

### WhatsApp and SMS campaigns

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/message-campaigns` | List, create | Manager |
| PATCH, DELETE | `/message-campaigns/{id}` | Edit, delete (before sending) | Manager |
| POST | `/message-campaigns/{id}/schedule` | Send now or later | Manager |
| POST | `/message-campaigns/{id}/cancel` | Stop sending | Manager |
| GET | `/message-campaigns/{id}/stats` | Sent, delivered, read, replied, leads, revenue | Manager |
| POST | `/webhooks/sms/{provider}` | SMS delivery and replies | Provider |

### Email marketing

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/email-campaigns` | List, create | Manager |
| POST | `/email-campaigns/draft` | AI drafts an email | Manager |
| PATCH, DELETE | `/email-campaigns/{id}` | Edit, delete | Manager |
| POST | `/email-campaigns/{id}/test` | Send a test to me | Manager |
| POST | `/email-campaigns/{id}/schedule` | Send now or later, with A/B | Manager |
| GET | `/email-campaigns/{id}/stats` | Results | Manager |
| GET, POST | `/sending-domains` | Add and verify a domain | Manager |
| GET | `/public/unsubscribe/{token}` | Unsubscribe | Public |
| POST | `/webhooks/email-events` | Delivery, bounce, complaint | Provider |

### Nurture automation

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/nurtures` | List, create | Manager |
| PATCH, DELETE | `/nurtures/{id}` | Edit, switch off, delete | Manager |
| GET | `/nurtures/{id}/stats` | Results | Manager |

### Campaigns

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/campaigns` | List, create | Manager |
| POST | `/campaigns/plan` | AI plans a campaign from a goal and budget | Manager |
| GET, PATCH, DELETE | `/campaigns/{id}` | Read, edit, delete | Manager |
| POST | `/campaigns/{id}/assets` | Tag a send, page, form or ad to it | Manager |
| GET | `/campaigns/{id}/report` | Leads and revenue from all parts | Manager |

### Ads

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| POST | `/ad-accounts/connect` | Connect Google Ads or Meta Ads | Manager |
| GET | `/ad-accounts` | Connected accounts | Manager |
| GET | `/ads/report?from=&to=` | Spend, leads, revenue per ad | Manager |
| POST | `/ads/audiences` | Send a segment to an ad platform | Manager |

### Social media

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| POST | `/social/accounts/connect` | Connect Instagram, Facebook, LinkedIn, Google Business | Manager |
| GET, POST | `/social/posts` | List, schedule | Staff |
| PATCH, DELETE | `/social/posts/{id}` | Edit, delete | Staff |
| POST | `/social/captions` | AI writes captions | Staff |
| POST | `/webhooks/meta-social` | Comments and direct messages | Provider |

### Personalisation

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| PUT | `/pages/{id}/blocks/{block_id}/rules` | Who sees which version of a block | Manager |

### Marketing events

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/events` | List, create | Manager |
| GET, PATCH, DELETE | `/events/{id}` | Read, edit, delete | Manager |
| GET | `/events/{id}/registrations` | Registrations | Staff |
| POST | `/events/{id}/checkin` | Check in by QR code | Staff |
| POST | `/public/events/{id}/register` | Register | Public |

### Attribution and marketing reports

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/reports/attribution?model=first|last|shared` | Leads and revenue by source, campaign, ad | Manager |
| GET | `/reports/journeys` | Common paths to a sale | Manager |

---

# Phase 5: Automation and data

### Workflows

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/workflows` | List, create | Manager |
| POST | `/workflows/draft` | AI builds a workflow from a description | Manager |
| GET, PATCH, DELETE | `/workflows/{id}` | Read, edit, delete | Manager |
| POST | `/workflows/{id}/publish` | Switch on this version | Manager |
| POST | `/workflows/{id}/pause` | Switch off | Manager |
| GET | `/workflows/{id}/runs` | History | Manager |
| POST | `/hooks/workflows/{id}/{secret}` | Start a workflow from another app | Provider |

### Custom objects

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/objects` | Object definitions | Manager |
| PATCH, DELETE | `/objects/{key}` | Edit, delete | Manager |
| GET, POST | `/objects/{key}/records` | List, add records | Staff |
| GET, PATCH, DELETE | `/objects/{key}/records/{id}` | Read, edit, delete | Staff |
| POST, DELETE | `/record-links` | Link or unlink two records, with a label | Staff |
| GET, PUT | `/layouts/{object}` | Which fields show on a record page, in what order | Manager |

### Calculated fields

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| POST | `/fields` (type `formula`) | Add a calculated field | Manager |
| POST | `/fields/formula/check` | Check a formula and preview results | Manager |

### Data quality

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/data-quality/issues` | Problems found | Manager |
| POST | `/data-quality/issues/{id}/fix` | Fix in bulk | Manager |
| GET, PUT | `/data-quality/rules` | Formatting rules on entry | Manager |

### Integrations and data sync

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/integrations` | Available and connected apps | Manager |
| POST | `/integrations/{app}/connect` | Connect an app | Manager |
| DELETE | `/integrations/{id}` | Disconnect | Manager |
| GET, PUT | `/integrations/{id}/mappings` | What syncs, which way, field matching | Manager |
| POST | `/integrations/{id}/sync` | Sync now | Manager |
| GET | `/integrations/{id}/runs` | History and errors | Manager |

### Public API, webhooks and app store

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| All | every staff endpoint above | Open to other software with an API key or OAuth, by scope | Software (with permission) |
| GET, POST | `/api-keys` | List, create | Manager |
| DELETE | `/api-keys/{id}` | Revoke | Manager |
| GET, POST | `/oauth/apps` | Partner apps | Platform, partners |
| GET | `/oauth/authorize` | A business approves an app | Manager |
| POST | `/oauth/token` | The app gets its token | Software |
| GET, POST | `/webhook-subscriptions` | Tell my app when records change | Manager |
| DELETE | `/webhook-subscriptions/{id}` | Stop | Manager |
| GET | `/webhook-subscriptions/{id}/deliveries` | Delivery history | Manager |
| POST | `/webhook-deliveries/{id}/retry` | Send again | Manager |
| GET | `/marketplace/apps` | The app store | Public |

### Custom report builder

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/custom-reports` | List, build | Manager |
| POST | `/custom-reports/ask` | AI builds a report from a question | Manager |
| GET, PATCH, DELETE | `/custom-reports/{id}` | Read, edit, delete | Manager |
| GET | `/custom-reports/{id}/data` | Run it | Staff (if shared) |
| GET, POST | `/dashboards` | List, create | Manager |
| PATCH, DELETE | `/dashboards/{id}` | Arrange, share, schedule email, delete | Manager |

### AI connectors

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| (MCP) | `apps/mcp` with OAuth sign-in | Claude, ChatGPT and other AI apps use the CRM | Staff (signed in) |

---

# Phase 6: Content engine

### Website builder and hosting

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/sites` | List, create | Manager |
| POST | `/sites/{id}/generate` | AI builds the site from business info | Manager |
| GET, PATCH | `/sites/{id}` | Theme, menu, settings | Manager |
| GET, POST | `/sites/{id}/pages` | Pages | Manager |
| POST | `/pages/{id}/publish` | Publish | Manager |
| GET | `/themes` | Themes | Manager |
| POST | `/domains` | Connect a domain | Manager |
| POST | `/domains/{id}/verify` | Check DNS and issue HTTPS | Manager |

### Blog and AI writer

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/pages?kind=post` | Posts | Staff |
| POST | `/ai/topic-ideas` | Topics people search for | Staff |
| POST | `/ai/write-post` | Draft a post | Staff |
| POST | `/pages/{id}/schedule` | Publish later | Manager |

### SEO and AI search visibility

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/seo/pages/{id}` | Problems and suggestions for a page | Staff |
| GET, PUT | `/visibility/questions` | Questions to check in AI assistants | Manager |
| GET | `/visibility/results` | Whether the business is mentioned, over time | Manager |

### Video and podcasts

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/media` | List, upload | Staff |
| DELETE | `/media/{id}` | Delete | Manager |
| POST | `/media/{id}/clips` | AI cuts short clips with captions | Staff |
| GET | `/media/{id}/views` | Who watched | Staff |

### Brand voice and content remix

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, PUT | `/brand-voice` | Tone, words to use and avoid | Manager |
| POST | `/ai/remix` | Turn one piece into posts, email, WhatsApp | Staff |

### Memberships and content approvals

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| PUT | `/pages/{id}/access` | Who can see a page | Manager |
| GET | `/page-approvals` | Waiting for approval | Manager |
| POST | `/page-approvals/{id}/approve` | Approve | Manager |
| POST | `/page-approvals/{id}/reject` | Send back with a note | Manager |
| GET, POST | `/pages/{id}/translations` | Language versions | Staff |

---

# Phase 7: AI and scale

### Agent builder

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/agents` | List, create | Manager |
| GET, PATCH, DELETE | `/agents/{id}` | Read, edit, delete | Manager |
| POST | `/agents/{id}/test` | Test chat | Manager |
| POST | `/agents/{id}/publish` | Go live | Manager |
| GET | `/agents/{id}/runs` | What it did | Manager |

### Data agent

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| POST | `/data-agent/ask` | Ask a research question; streams the answer with sources | Staff |
| POST | `/companies/{id}/research` | Fill company details from the web, for approval | Staff |

### Prospecting agent

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| POST | `/prospects/find` | Find companies like my best customers | Manager |
| GET | `/prospects` | Suggestions with reasons | Staff |
| POST | `/prospects/{id}/approve` | Approve the drafted first message | Staff |
| POST | `/prospects/{id}/dismiss` | Not a fit | Staff |

### Call coaching

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/calls/{id}/review` | Score, reasons, tips for one call | Staff |
| GET | `/coaching/team` | Team trends | Manager |
| POST | `/meetings/{id}/notetaker` | Send the notetaker to an online meeting | Staff |

### Mobile app

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| POST | `/devices` | Register a phone for push alerts | Staff |
| DELETE | `/devices/{id}` | Remove | Staff |
| POST | `/contacts/scan-card` | Business card photo to contact | Staff |

### Advanced permissions, single sign-on and sandbox

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/roles` | Custom roles | Manager |
| PATCH, DELETE | `/roles/{id}` | Edit, delete | Manager |
| GET, PUT | `/field-permissions` | Hidden fields per role | Manager |
| GET, PUT | `/sso` | Google Workspace or Microsoft sign-in | Manager |
| GET | `/auth/sso/{account}` | Start SSO sign-in | Public |
| POST | `/sandboxes` | Make a test copy | Manager |
| POST | `/sandboxes/{id}/promote` | Copy changes to live | Manager |

### Currencies and languages

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, PUT | `/currencies` | Currencies used and exchange rates | Manager |
| PATCH | `/me` (`language`) | Screen language | Staff |

### Multiple branches

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET, POST | `/branches` | List, add | Manager |
| PATCH, DELETE | `/branches/{id}` | Edit, delete | Manager |
| PUT | `/users/{id}/branches` | Which branches a person sees | Manager |

### White label and partners

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/partner/clients` | A partner's businesses | Partner |
| POST | `/partner/clients` | Sign up a business | Partner |
| GET | `/partner/commissions` | Earnings | Partner |
| GET, PUT | `/partner/branding` | Name, logo, colours, domain | Partner |

---

# Agent tools

The actions the AI agents may take. Each tool checks the business's engines and the rules before it does anything.

| Tool | What it does | Phase |
| --- | --- | --- |
| `get_business_info` | Read the business profile and the situations | 1 |
| `list_offerings` | Read offerings, from-prices, GST notes and current offers | 1 |
| `search_knowledge` | Find answers in documents and FAQs, with their source | 1 |
| `log_unanswered_question` | Record a question the AI couldn't answer | 1 |
| `save_lead` | Save contact, company, lead details, custom fields, the promise | 1 |
| `send_details_whatsapp` | Send an offering's details on an approved template | 1 |
| `request_human_callback` | Raise a ticket for anything that isn't a sale | 1 |
| `transfer_call` | Transfer to a staff number during office hours | 1 |
| `end_call` | End a call politely | 1 |
| `check_availability` | What's free on given dates | 2 |
| `price_quote` | Exact price, worked out in code | 2 |
| `send_quote` | Create and send a quote | 2 |
| `send_payment_link`, `resend_payment_link` | Payment links | 2 |
| `create_booking`, `modify_booking`, `find_bookings`, `send_cancellation_link` | Bookings | 2 |
| `get_invoice` | Find and resend an invoice | 2 |
| `list_meeting_slots`, `book_meeting` | Meetings | 2 |
| `send_document` | Send a brochure or price sheet | 2 |
| `search_help_articles` | Answer from published help articles (added to `search_knowledge`) | 3 |
| `transfer_to_team` | Route a call to a team | 3 |
| `record_consent` | Save marketing consent | 4 |

**Staff assistant and MCP tools (Phase 1, more per engine later):** `list_leads`, `get_lead`, `search_contacts`,
`list_tasks`, `create_task`, `move_lead`, `add_note`, `get_report`.

# Outside services we call

| Service | Used for | Phase |
| --- | --- | --- |
| Gemini Live | Voice conversations on calls | 1 |
| Gemini or Claude (chosen by tests) | Chat, WhatsApp, email, summaries, assistant | 1 |
| Exotel or Twilio | Phone numbers, forwarding, call audio, outbound calls | 1, 2 |
| Meta WhatsApp Cloud API | WhatsApp messages and templates | 1 |
| Gmail API, Microsoft Graph, IMAP | Reading mailboxes; staff mail sync | 1, 2 |
| Razorpay | Our subscriptions; businesses' payments, UPI auto-pay | 1, 2 |
| Stripe | Payments from abroad | 2 |
| S3-compatible storage | Recordings, imports, exports, documents, media | 1 |
| Google Places API | Pre-filling from Google listings; competitor ratings | 1 |
| Google Calendar, Microsoft Graph | Meeting scheduler | 2 |
| E-sign provider (Aadhaar) | Signed contracts, when needed | 2 |
| SMS provider with DLT | SMS campaigns | 4 |
| Amazon SES (or similar) | Marketing email | 4 |
| Meta Marketing API, Google Ads API | Ads and audiences | 4 |
| Meta Graph API, LinkedIn API, Google Business Profile API | Social posts, comments, messages | 4 |
| Tally, Zoho, Google Sheets, Shopify, WooCommerce, Salesforce, Slack, Zapier and others | Integrations | 5 |
| Company data provider | Prospecting research | 7 |
| Google Meet, Zoom | Meeting notetaker | 7 |
| Apple and Google push services | Mobile alerts | 7 |

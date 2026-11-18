# Roles and access: who can sign in, and who can do what

*The one page that answers "who is who in Toobler One". Written for the owner and the team; plain English first, the exact route table at the end. Last checked against the code on 18 Nov 2026 (the team routes of F02 added). The rules themselves live in `docs/SECURITY.md` §2 and are enforced in `apps/api/src/kernel/http/guard.ts`.*

## 1. The hierarchy in one picture

```text
Toobler platform (the company that runs the product)
 │   Platform admins: the Toobler team. They manage what the product offers, not any business's customers.
 │
 ├── Business A  (an "account": the unit that owns data, e.g. "Nair Stays")
 │     ├── Manager       full control of the business's settings and data
 │     ├── Staff         does the daily work: contacts, leads, tickets, FAQs
 │     └── Own-leads-only staff   like staff, but sees only the leads that are theirs
 │
 ├── Business B  ... (never sees anything of Business A)
 └── ...
```

Two rules sit above everything else:

1. **A business never sees another business.** Every table is fenced by the business, in the database itself, not only in the code. A request for another business's record answers "not found" (404), so it does not even confirm the record exists.
2. **The business always comes from who you are signed in as,** never from anything the request says. Nobody can ask for "business 7".

## 2. Who can sign in, and how each kind of person comes to exist today

| Kind of person | How they get an account today | How they sign in | What they can reach |
| --- | --- | --- | --- |
| **Manager** | Signs up on their own (F01): the sign-up creates the business and makes the person its manager. The email must be verified before the app works. | Email and password | Everything in their own business, including settings |
| **Staff** and **own-leads-only staff** | A manager invites them from Settings → Team (F02): the person gets an emailed link (works once, 48 hours), chooses a password and joins with the role the manager picked. | Email and password (same sign-in) | The daily work of their own business, see section 3 |
| **Platform admin** (Toobler team) | Not through the app, on purpose: the owner switches the admin flag on with one line of SQL for a person. | Email and password (same sign-in) | The platform routes (section 5), plus their own business if they have one |
| **Platform support** (Toobler staff helping a business, with that business's permission) | **Planned, not built** (F24, Privacy and support access) | | |
| **Customers** (the business's own customers) | They are not users. They are *contacts*, created by staff or by the AI channels. They never sign in. | Website chat, WhatsApp, calls, email (later features) | Nothing in the staff app |

Every sign-in is the same screen for every kind of person. What a person can do depends on their role, which the server reads from the database on every request (so a role change takes effect straight away, with no need to sign in again).

**Sign-in rules (F01):** passwords of at least 10 characters; 5 wrong tries lock the account for 15 minutes; a session lasts up to 7 days if unused and 30 days at most; signing out or changing the password ends the other sessions; a person whose email is not yet verified can only reach the few routes marked "works before the email is verified" in section 5.

## 3. The roles and what they can do

| | Manager | Staff | Own-leads-only staff |
| --- | --- | --- | --- |
| Contacts: add, view, edit | Yes | Yes | Yes (contacts are shared; "own contacts only" comes with F02/F11) |
| Contacts: delete | **Yes** | No | No |
| Companies: add, change, link contacts | Yes | Yes | Yes (sees only their own leads on a company page, and not its combined timeline) |
| Companies: delete | **Yes** | No | No |
| Leads: add, view, edit, move, reassign | All of the business's leads | All of the business's leads | **Only leads they own**; a lead they add is always theirs and they cannot name another owner |
| Leads: delete | **Yes** | No | No |
| Pipeline stages and lost reasons | **Change** | View | View (the board shows only their leads) |
| The sharing rule (how new leads are shared out) | **View and change** | Not shown | Not shown |
| Tickets: add, view, edit, assign, note, close | Yes | Yes | Yes (tickets are shared work) |
| FAQs and unanswered questions | Yes | Yes | Yes (open to every role, R48) |
| Business profile, situations, settings | **Change** | View | View |
| Offerings and offers | **Change** | View | View |
| Modules: switch a part of the product on or off | **Yes** | View the list | View the list |
| AI settings: models, the business's own keys, usage, the call log | **Yes** | No | No |
| Conversation types: see the list | Yes | Yes | Yes |
| Conversations: read one, and change its type ("this isn't a lead") | Yes | Yes | No (a conversation has no owner yet, so who sees which one is decided with the inbox, F21) |
| Conversation types: add, change, remove, reorder, and "Try it" (test a message with the AI) | **Yes** | No | No |
| Block list (numbers and emails treated as spam) | **Yes** | No | No (it holds personal data) |
| Team: invite people, change roles, remove people, teams, the activity log | **Yes** | No | No |
| Own profile and password | Yes | Yes | Yes |

"View" means the information is shown to the person; only managers can change it. The exact answer for any single action is in the table in section 5, which is built from the code.

## 4. What the server checks on every request, in this order

1. **Is the route open to everyone?** (`public`: sign-up, sign-in, health, the industries list, and the password and email links.) If so, no sign-in is needed.
2. **Is the person signed in?** If not: **401**.
3. **Has the person verified their email?** If not, only the routes marked for it work; every other answers **403**.
4. **Is the role enough?** A manager-only route answers **403** to staff; a platform route answers **403** to anyone who is not a platform admin.
5. **Does the record belong to the person's business?** If not: **404**.
6. **Is the request well formed?** If not: **400** with a plain message.
7. **Does it make sense right now?** (for example: a lead already open, a built-in type that cannot be removed): **409**.

Every route must say who may call it (a route without that declaration does not start), and every route is tested for: works, 401, 403, 404 for another business, and 400. Changes made through the browser also need the safety headers the web app sends (a check against forged requests), or they answer 403.

## 5. Every route and who can call it

*Built from the route files on 16 Nov 2026. Regenerate it when a route is added or its access changes (the isolation test already fails if a route is added without being registered, so a new route cannot slip by unnoticed).*

### Sign-up, sign-in and your own profile (F01)

| Method | Address | Who can call it |
| --- | --- | --- |
| POST | `/api/v1/auth/verify-email` | Anyone, signed in or not |
| POST | `/api/v1/auth/resend-email` | Any signed-in person (every role) (works before the email is verified) |
| POST | `/api/v1/auth/forgot-password` | Anyone, signed in or not |
| POST | `/api/v1/auth/reset-password` | Anyone, signed in or not |
| POST | `/api/v1/me/password` | Any signed-in person (every role) |
| GET | `/api/v1/me` | Any signed-in person (every role) (works before the email is verified) |
| PATCH | `/api/v1/me` | Any signed-in person (every role) |
| POST | `/api/v1/auth/login` | Anyone, signed in or not |
| POST | `/api/v1/auth/logout` | Any signed-in person (every role) (works before the email is verified) |
| POST | `/api/v1/auth/refresh` | Anyone, signed in or not |
| POST | `/api/v1/auth/signup` | Anyone, signed in or not |

### Modules (plug and play) (F03)

| Method | Address | Who can call it |
| --- | --- | --- |
| GET | `/api/v1/modules` | Any signed-in person (every role) |
| PATCH | `/api/v1/modules/:id` | Managers only |
| POST | `/api/v1/platform/businesses/:id/modules` | Platform admins only (the Toobler team) |

### Industries list (F01 / F03)

| Method | Address | Who can call it |
| --- | --- | --- |
| GET | `/api/v1/industries` | Anyone, signed in or not |
| POST | `/api/v1/industries` | Platform admins only (the Toobler team) |

### Health check (F00)

| Method | Address | Who can call it |
| --- | --- | --- |
| GET | `/api/v1/health` | Anyone, signed in or not |

### Team, teams and the activity log (F02)

| Method | Address | Who can call it |
| --- | --- | --- |
| GET | `/api/v1/team` | Managers only |
| POST | `/api/v1/team/invitations` | Managers only |
| DELETE | `/api/v1/team/invitations/:id` | Managers only |
| POST | `/api/v1/team/invitations/:id/resend` | Managers only |
| PATCH | `/api/v1/team/members/:id` | Managers only |
| DELETE | `/api/v1/team/members/:id` | Managers only |
| POST | `/api/v1/auth/invitations/preview` | Anyone with the emailed link (the token proves it; works once, 48 hours) |
| POST | `/api/v1/auth/accept-invitation` | Anyone with the emailed link (the token proves it; works once, 48 hours) |
| GET | `/api/v1/teams` | Any signed-in person (every role) |
| POST | `/api/v1/teams` | Managers only |
| PATCH | `/api/v1/teams/:id` | Managers only |
| DELETE | `/api/v1/teams/:id` | Managers only |
| GET | `/api/v1/audit-log` | Managers only |

### Companies (F05)

| Method | Address | Who can call it |
| --- | --- | --- |
| GET | `/api/v1/companies` | Any signed-in person (every role; the "own leads only" role's numbers count only its own leads) |
| POST | `/api/v1/companies` | Any signed-in person (every role) |
| GET | `/api/v1/companies/:id` | Any signed-in person (every role; the "own leads only" role sees only its own leads) |
| PATCH | `/api/v1/companies/:id` | Any signed-in person (every role) |
| DELETE | `/api/v1/companies/:id` | Managers only |
| PUT | `/api/v1/contacts/:id/company` | Any signed-in person (every role) |

### Contacts (F04)

| Method | Address | Who can call it |
| --- | --- | --- |
| POST | `/api/v1/contacts` | Any signed-in person (every role) |
| GET | `/api/v1/contacts` | Any signed-in person (every role) |
| GET | `/api/v1/contacts/:id` | Any signed-in person (every role) |
| PATCH | `/api/v1/contacts/:id` | Any signed-in person (every role) |
| DELETE | `/api/v1/contacts/:id` | Managers only |

### Pipeline, leads, lost reasons and sharing rule (F06)

| Method | Address | Who can call it |
| --- | --- | --- |
| GET | `/api/v1/assignment-rules` | Managers only |
| PUT | `/api/v1/assignment-rules` | Managers only |
| POST | `/api/v1/leads` | Any signed-in person (every role) |
| GET | `/api/v1/leads` | Any signed-in person (every role) |
| GET | `/api/v1/leads/:id` | Any signed-in person (every role) |
| PATCH | `/api/v1/leads/:id` | Any signed-in person (every role) |
| POST | `/api/v1/leads/:id/move` | Any signed-in person (every role) |
| POST | `/api/v1/leads/:id/assign` | Any signed-in person (every role) |
| DELETE | `/api/v1/leads/:id` | Managers only |
| GET | `/api/v1/lost-reasons` | Any signed-in person (every role) |
| PUT | `/api/v1/lost-reasons` | Managers only |
| GET | `/api/v1/pipeline` | Any signed-in person (every role) |
| POST | `/api/v1/pipeline/stages` | Managers only |
| POST | `/api/v1/pipeline/stages/reorder` | Managers only |
| PATCH | `/api/v1/pipeline/stages/:id` | Managers only |
| DELETE | `/api/v1/pipeline/stages/:id` | Managers only |

### Tickets (F14)

| Method | Address | Who can call it |
| --- | --- | --- |
| POST | `/api/v1/tickets` | Any signed-in person (every role) |
| GET | `/api/v1/tickets` | Any signed-in person (every role) |
| GET | `/api/v1/tickets/:id` | Any signed-in person (every role) |
| PATCH | `/api/v1/tickets/:id` | Any signed-in person (every role) |

### Business profile, FAQs, unanswered questions, search (F16 / F18)

| Method | Address | Who can call it |
| --- | --- | --- |
| POST | `/api/v1/knowledge/faqs` | Any signed-in person (every role) |
| GET | `/api/v1/knowledge/faqs` | Any signed-in person (every role) |
| PATCH | `/api/v1/knowledge/faqs/:id` | Any signed-in person (every role) |
| DELETE | `/api/v1/knowledge/faqs/:id` | Any signed-in person (every role) |
| GET | `/api/v1/knowledge/questions` | Any signed-in person (every role) |
| PUT | `/api/v1/knowledge/answers/:question_key` | Managers only |
| POST | `/api/v1/knowledge/answers/confirm` | Managers only |
| GET | `/api/v1/knowledge/search` | Any signed-in person (every role) |
| GET | `/api/v1/knowledge/settings` | Any signed-in person (every role) |
| PUT | `/api/v1/knowledge/settings` | Managers only |
| GET | `/api/v1/knowledge/situations` | Any signed-in person (every role) |
| PUT | `/api/v1/knowledge/situations/:key` | Managers only |
| GET | `/api/v1/knowledge/unanswered` | Any signed-in person (every role) |
| POST | `/api/v1/knowledge/unanswered/:id/answer` | Any signed-in person (every role) |
| POST | `/api/v1/knowledge/unanswered/:id/dismiss` | Any signed-in person (every role) |

### Setup wizard (F31)

| Method | Address | Who can call it |
| --- | --- | --- |
| GET | `/api/v1/setup` | Managers only |
| PATCH | `/api/v1/setup` | Managers only |
| POST | `/api/v1/knowledge/prefill` | Managers only |
| GET | `/api/v1/knowledge/prefill/:id` | Managers only |
| POST | `/api/v1/setup/apply-preset` | Managers only |
| POST | `/api/v1/setup/go-live` | Managers only |

### Offerings and offers (F17)

| Method | Address | Who can call it |
| --- | --- | --- |
| POST | `/api/v1/offerings` | Managers only |
| GET | `/api/v1/offerings` | Any signed-in person (every role) |
| POST | `/api/v1/offerings/reorder` | Managers only |
| PATCH | `/api/v1/offerings/:id` | Managers only |
| DELETE | `/api/v1/offerings/:id` | Managers only |
| POST | `/api/v1/offers` | Managers only |
| GET | `/api/v1/offers` | Any signed-in person (every role) |
| PATCH | `/api/v1/offers/:id` | Managers only |
| DELETE | `/api/v1/offers/:id` | Managers only |

### AI models, keys, usage and the platform AI settings (F37)

| Method | Address | Who can call it |
| --- | --- | --- |
| GET | `/api/v1/ai/calls` | Managers only |
| GET | `/api/v1/platform/ai/keys` | Platform admins only (the Toobler team) |
| POST | `/api/v1/ai/keys` | Managers only |
| GET | `/api/v1/ai/keys` | Managers only |
| DELETE | `/api/v1/ai/keys/:id` | Managers only |
| POST | `/api/v1/ai/keys/:id/test` | Managers only |
| GET | `/api/v1/ai/models` | Managers only |
| GET | `/api/v1/ai/settings` | Managers only |
| PUT | `/api/v1/ai/settings` | Managers only |
| GET | `/api/v1/ai/usage` | Managers only |
| GET | `/api/v1/ai/status` | Managers only |
| GET | `/api/v1/platform/businesses/:id/ai-access` | Platform admins only (the Toobler team) |
| PUT | `/api/v1/platform/businesses/:id/ai-access` | Platform admins only (the Toobler team) |
| GET | `/api/v1/platform/ai/models` | Platform admins only (the Toobler team) |
| POST | `/api/v1/platform/ai/models` | Platform admins only (the Toobler team) |
| PATCH | `/api/v1/platform/ai/models/:id` | Platform admins only (the Toobler team) |
| PUT | `/api/v1/platform/ai/tasks/:taskId/models` | Platform admins only (the Toobler team) |

### Conversation types and the block list (F15 (in progress))

| Method | Address | Who can call it |
| --- | --- | --- |
| GET | `/api/v1/block-list` | Managers only |
| PUT | `/api/v1/block-list` | Managers only |
| GET | `/api/v1/conversation-types` | Any signed-in person (every role) |
| POST | `/api/v1/conversation-types` | Managers only |
| POST | `/api/v1/conversation-types/test` | Managers only ("Try it": makes one real AI call, limited to 10 a minute) |
| GET | `/api/v1/conversations/{id}` | Any signed-in person, except the "own leads only" role (403) |
| POST | `/api/v1/conversations/{id}/type` | Any signed-in person, except the "own leads only" role (403) |
| GET | `/api/v1/lists` | Any signed-in person |
| POST | `/api/v1/lists` | Any signed-in person |
| GET | `/api/v1/views?object=lead` | Any signed-in person (their own views and the ones shared with the team) |
| POST | `/api/v1/views` | Any signed-in person (the view is their own; sharing comes in slice 3 and is for managers) |
| PATCH | `/api/v1/views/{id}` | The owner (their own view); only a manager sets `shared`; a manager can also change a shared view of anyone but only share or stop sharing it. Another person's unshared view is 404, a shared view they may not change is 403 |
| DELETE | `/api/v1/views/{id}` | The owner, or a manager for a shared view. Same 404 and 403 rules |
| GET | `/api/v1/conversations?filtered=true` | Any signed-in person, except the "own leads only" role (403) |
| POST | `/api/v1/conversations/{id}/unfilter` | Any signed-in person, except the "own leads only" role (403) |
| POST | `/api/v1/conversation-types/reorder` | Managers only |
| PATCH | `/api/v1/conversation-types/:id` | Managers only |
| DELETE | `/api/v1/conversation-types/:id` | Managers only |

## 6. What is not built yet

| Missing | Where it is planned |
| --- | --- |
| Inviting team members, choosing and changing roles, removing a person, teams, the activity log screen | F02 (built, 18 Nov 2026) |
| The "own contacts only" filter | F02 / F11 |
| Support staff visiting a business with its permission, and erasing a person's data | F24 |
| Platform admin screens (the platform console) | F35 |
| Platform admins can only add industries, switch modules on for a business, and manage AI models and keys today | Wider platform powers arrive with F35 |
| Signing in with a WhatsApp code | F25 |

## 7. Keeping this page true

When a feature adds a route or changes who may call one, update section 5 and, if a role gains or loses a power, section 3. The feature's own file in `docs/features/` still holds the detail and the reason for each choice.

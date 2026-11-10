# Phase 1 plan: lead engine and CRM core, feature by feature

Each row of the requirements' "Order of work" is split into features small enough to build, test and approve one at a
time ([DEVELOPMENT.md](../DEVELOPMENT.md)). Every feature ships **backend + front end + tests** and ends with a manual
test the owner runs. Status lives in [STATUS.md](STATUS.md).

Requirement links are relative to `requirements/phase-1-lead-engine/`. "Every route tested" always means: works, 401,
403 wrong role, 404 other business, 400 bad input, plus an isolation entry.

**Outside services in development:** every provider (WhatsApp, email, phone, AI, storage, payments) has a `console`
version that prints what it would send, plus Mailpit for email, so features can be built and tested before accounts
and approvals exist. The real provider is switched on by settings in the feature that needs it.

## Build order (changed 10 Nov 2026)

The numbers F00 to F36 name the features; the order they are built in is the order of the rows in
[STATUS.md](STATUS.md). The first goal is **a working lead engine from end to end**: a business signs up, fills in its
knowledge, a customer chats on its website, the AI answers from that knowledge, and a lead or ticket appears.

1. **Slice 1, the first working lead engine:** F01 sign-up and sign-in, F03 module switches (kept thin), F04 contacts,
   F06 leads (basic list and detail), F14 tickets (the router and the "ask for a person" tool need them), F16 business
   profile and questions (this is also the form version of onboarding), F17 offerings, F18 FAQs and knowledge search,
   F15 conversation types, F19 the AI agent and Test the agent, F20 website chat, then F31 the AI setup chat and fill from website
   (it needs the agent runtime from F19, so it comes after it).
2. **Then the rest of the CRM core:** F02 team and roles, F05 companies, F07 timeline, F08 tasks, F09 custom fields, F10
   scoring, F11 views and search, F12 import and export, F13 duplicates.
3. **Then the workspace and the other channels:** F21 to F30, then F32 to F36.

Until a later feature exists, the slice uses the simple version: leads carry an "unscored" temperature (F10), a promised
callback is kept on the conversation record (F08 turns it into a task), the owner is the only team member (F02), and
documents are not uploaded yet (F18 starts with FAQs and the structured facts).

## Port from the hotel agent (read just in time)

Paths are under `../hotel agent/`. At each feature, read only its row, before the brief. `backend/src/` is shortened to `src/`.

| Feature | Read (old code) | Expect to reuse |
| --- | --- | --- |
| F00 | `src/db.js`, `src/config.js`, `src/middleware/*`, `src/utils/errors.js`, `src/jobs.js`, `eslint*.js`, `test/setup.js`, `test/e2e/harness.js`, `admin/src/app/globals.css`, `admin/src/components/ui.tsx` | Fence, config checks, error shapes, lint rules, job lock, test harness, tokens |
| F01 | `src/modules/core/auth/*`, `src/middleware/auth.js`, `admin/src/lib/{session,auth}.ts`, `admin/src/proxy.ts`, `docs/SECURITY.md` | Sessions, refresh rotation, BFF cookies |
| F02–F03 | `src/modules/core/{businesses,platform,support,activity}`, `src/routes/admin.js`, `src/modules/core/industries.js` | Roles, support access, activity log, registry idea |
| F08, F23 | `src/modules/core/{notifications,monitoring}`, `src/utils/messages.js` | Channel choice, templates, alerts |
| F15, F19 | `src/agent/{index.js,industry.js,shared,api}`, `test/unit/{prompts,agentTools,agentInputs}.test.js`, `scripts/agent-eval.js` | Prompt building, tool loop, evals |
| F18, F31, F33 | `src/modules/core/websiteImport`, `test/unit/websiteImport.test.js` | Website reader |
| F20 | `src/agent/chat`, `src/modules/core/chats`, `site/src/components/chat-widget.tsx`, `site/src/lib/chat.ts`, `test/unit/{guest-chat,chat-memory}.test.js` | Chat turns, widget, memory |
| F21 | `src/modules/core/{inbox,conversations}` | Inbox, takeover ideas |
| F25 | `src/modules/core/integrations`, `src/utils/secrets.js`, `test/unit/{whatsappChat,whatsappTemplates}.test.js`, `backend/db/migrations/016_whatsapp_chats.sql` | Cloud API, template submit/sync, encrypted keys |
| F26 | `src/agent/email`, `src/modules/core/inbox/mailbox.js` (imapflow), `scripts/test-email.js` | Mailbox reading, sorting, drafts |
| F29 | `src/agent/voice`, `docs/VOICE_AGENT.md`, `site/src/lib/live-call.ts`, `site/src/components/call-dialog.tsx`, `test/unit/endCall.test.js` | Gemini Live bridge (ws), call end, transcript |
| F30 | `src/mcp/*`, `src/agent/staff`, `docs/MCP.md` | MCP server, call tokens |

---

## Stage A: Foundation (requirements step 1–2)

### F00 Foundation and design system
- **Req:** `1-foundation/01-project-setup.md`; docs/ARCHITECTURE.md, BACKEND.md, FRONTEND.md
- **Backend:** npm workspaces monorepo; `apps/api` (Fastify, kernel: config, db + account fence, errors, logging with
  redaction, module registry, `/api/v1/health`); migration runner; `001_kernel.sql` (schema `app`, roles `app_owner`/`app_user`,
  `app.current_account_id()`, extensions, `domain_events`, `activity_log`); outbox dispatcher and pg-boss worker
  skeleton; ESLint layering and boundary rules; Docker compose (Postgres+pgvector for tests, Mailpit); Vitest with
  throwaway schemas; `npm run gate`; GitHub Actions `ci.yml`.
- **Front end:** `packages/ui` tokens implementing the designer's [Design System v1.0](../design/TooblerOne_Design_System_v1.0.md) (light/dark, Manrope + Inter + Indic fallbacks self-hosted), a token-pair contrast test, and the first components; `apps/web` shell (side menu, bottom
  bar, top bar) with placeholder pages; a `/dev/ui` gallery page (development only) showing every component in both
  themes at phone and desktop size.
- **Tests:** schema test (every table with `account_id` has RLS forced); fence test (a query without an account
  returns nothing); health route; layering lint fixtures (a route importing a repository fails).
- **Manual:** `npm run setup && npm run dev`; open the staff app at phone and desktop size; switch dark mode; open
  `/dev/ui`; `curl /api/v1/health`; `npm run verify` green.

### F01 Sign-up, sign-in and sessions
- **Req:** `5-onboarding-and-launch/02-sign-up-and-sign-in.md`, security
- **Backend:** `accounts`, `users`, `memberships`, `sessions`, `auth_codes`, `login_attempts`; signup (business +
  owner as manager, industry choice → general preset only for now), verify email, login, lockout, forgot/reset
  password, WhatsApp code send/verify (console provider until F25), logout, `/me`, `PATCH /me`, switch business. Audit
  entries for sign-ins.
- **Front end:** sign-up (name, business, email, mobile, industry), verify email and mobile, sign-in (password or code),
  forgot/reset, profile, business switcher. Session cookie set by the API.
- **Tests:** lockout after 5, same answer for unknown email, session expiry and rotation, code expiry and tries,
  second business from inside the account, `/me` isolation.
- **Manual:** sign up a business; open the verify link from Mailpit; read the code from the API log; sign in both ways;
  wrong password ×5 → "try again in 15 minutes"; create a second business and switch.

### F02 Team, roles, teams and the activity log
- **Req:** `1-foundation/02-users-roles-and-teams.md`, `1-foundation/04-security-privacy-and-audit.md` (activity log part)
- **Backend:** invitations (email + WhatsApp via console), accept, change role/team, remove with hand-over (no-op
  until leads/tasks exist, then extended), `teams`, `team_members`, `GET /audit-log`.
- **Front end:** Settings → Team, Teams, Activity; accept-invitation page; role-aware menu (staff can't see Settings
  except My alerts).
- **Tests:** at least one manager always; staff can't reach manager routes; invitation token single-use and expiry.
- **Manual:** invite a staff member, accept in a private window, check what they can and can't open; Settings →
  Activity shows each step.

### F03 Modules: plug and play
- **Req:** `1-foundation/03-engines-and-plans.md`; docs/ARCHITECTURE.md §1
- **Backend:** `account_modules` (entitled / enabled / settings); the registry with every Phase 1 module declared
  (`engine.leads`, `channel.webchat|whatsapp|email|phone`, `feature.followups|assistant|competitors`); module guard on
  routes (404 when off); `GET /modules`, `PATCH /modules/{id}` (manager: enable/disable within entitlement); platform
  admin role and `POST /platform/businesses/{id}/modules` (entitle); `/me` returns active modules and nav.
- **Front end:** **Settings → Modules** (each module: what it does, on/off, "Not in your plan" when not entitled,
  "Needs connecting" for channels); menu built from `/me`; a minimal platform page to entitle modules.
- **Tests:** a disabled module's route → 404, re-enable keeps data, dependency rule (feature needs its engine),
  staff can't toggle.
- **Manual:** switch the website chat channel off and on, see its menu item go and come back; as platform admin take
  an entitlement away, see "Not in your plan".

## Stage B: CRM core (requirements step 3)

### F04 Contacts
- **Req:** `2-crm-core/01-contacts.md`
- **Backend:** `contacts` (phone/phone_key/email unique per business, lifecycle, owner, language, custom jsonb,
  actor stamps, soft delete); CRUD; `phone.ts` (every Indian format → E.164 + key); lifecycle rules as a pure function.
- **Front end:** Contacts list (search box, basic filters), contact page (details, empty timeline/leads/tasks panels
  ready for later features), add/edit, delete with "Are you sure?", Call/WhatsApp/Email buttons.
- **Tests:** phone formats (+91, 0, spaces), duplicate phone/email refused with a link to the existing contact,
  actor stamps, isolation.
- **Manual:** add Priya with `098470 12345`, then try `+91 98470-12345` → "already exists, open?"; edit; delete; phone layout.

### F05 Companies
- **Req:** `2-crm-core/02-companies.md`
- **Backend:** `companies` (name_key, domain), link/unlink contacts, domain suggestion (not for gmail.com and the like),
  delete keeps contacts.
- **Front end:** Companies list and page; Company box on the contact page.
- **Tests:** name matching ignoring case/spaces; free-mail domains never suggested; delete keeps contacts.
- **Manual:** create "Infosys HR", link two contacts, delete the company, contacts remain.

### F06 Pipeline and leads board
- **Req:** `2-crm-core/03-leads-and-pipeline-board.md`
- **Backend:** `pipelines`, `pipeline_stages`, `leads`, `lost_reasons`, `assignment_rules` (one person / round-robin
  in a team / by offering, offering-based finished in F17); move (Lost needs a reason, Won/Lost close), assign,
  remove-stage-with-move, reorder; the open-lead rule (re-enquiry attaches to the open lead, see review item R6);
  lifecycle stage updates on create/won.
- **Front end:** Leads board (drag on computer, **Move** on phone, Lost reason dialog), list, lead page, Settings →
  Pipeline (stages, lost reasons, sharing out).
- **Tests:** round-robin evenness, Won/Lost can't be removed, lost reason required, stage removal moves leads,
  staff_own sees only own leads (also by typed URL).
- **Manual:** create leads, drag across stages, try Lost without reason, rename/reorder stages, round-robin across
  two staff.

### F07 Timeline and notes
- **Req:** `2-crm-core/04-activity-timeline-and-notes.md`
- **Backend:** `activities` (kinds, actor, ref), notes CRUD (edit own, manager deletes), stage changes and creations
  write activities via events; contact timeline = all its leads; lead timeline = its own.
- **Front end:** `TimelineItem`s on contact, company and lead pages with filter chips and the Add note box.
- **Tests:** right timeline per record, note edit rights, events → activities.
- **Manual:** add notes, move a lead, see both on the lead and the contact timelines; filter chips.

### F08 Tasks and reminders
- **Req:** `2-crm-core/05-tasks-and-reminders.md`
- **Backend:** `tasks`; CRUD, complete, snooze, reassign; jobs: reminder N minutes before (owner), late alert N
  minutes after (manager) through the notifications provider (console/email now, WhatsApp in F25); close-open-tasks
  question when a lead closes; hand-over on removing a person (extends F02).
- **Front end:** Tasks page (Overdue, Today, Upcoming, Done), tasks on contact and lead pages, Add task.
- **Tests:** reminder and late jobs with a fake clock, once only; staff_own.
- **Manual:** add a task due in 16 minutes, see the reminder in the log/Mailpit; let one go late; complete, snooze.

### F09 Custom fields
- **Req:** `2-crm-core/06-custom-fields.md`
- **Backend:** `field_definitions`; the shared `validateCustom`; archive (hidden 30 days); "required before Won" enforced
  on move.
- **Front end:** Settings → Fields (three tabs), custom fields on detail pages and forms.
- **Tests:** each type validates; archived values hidden; Won blocked until required fields filled.
- **Manual:** add "Car model" dropdown, fill it on a lead, mark it required before Won and try to win.

### F10 Lead scoring and the Filtered tab
- **Req:** `2-crm-core/07-lead-scoring-and-filtering.md`
- **Backend:** `score.ts` pure rules on lead facts (`asked_price`, `asked_to_book`, dates); manual override until the
  next conversation; `filtered_reason`; unfilter.
- **Front end:** temperature tag with reason on cards and lists; set temperature by hand; **Filtered** tab.
- **Tests:** one unit test per rule; override behaviour.
- **Manual:** set facts on a lead and watch hot/warm/cold change with its reason; filter and unfilter.

### F11 Views, filters, search and lists
- **Req:** `2-crm-core/08-views-filters-and-search.md`
- **Backend:** filter engine (built-in and custom fields) shared by every list; `saved_views`; `/search` (trigram +
  phone_key); `contact_lists` and members.
- **Front end:** filter chips, column chooser, Save view, view tabs, shared views, global search sheet.
- **Tests:** filter operators per field type; staff_own in views and search; search under 1 s on 50,000 contacts
  (generated in the test database).
- **Manual:** build "My hot leads", share it, search "98470".

### F12 Import and export
- **Req:** `2-crm-core/09-import-and-export.md`
- **Backend:** upload (CSV/XLSX, size limit, private storage), column guessing, preview counts, run as a job with the
  same matching as the AI, report; exports as a job with a short-lived link emailed.
- **Front end:** the import wizard; Export on lists and views.
- **Tests:** 10,000 rows < 2 min; re-import makes no duplicates; export equals the view; manager only; audit.
- **Manual:** import a sample sheet with problems, read the report, import it again, export a view.

### F13 Duplicates and merging
- **Req:** `2-crm-core/10-duplicates-and-merging.md`
- **Backend:** nightly detection job, `duplicate_suggestions`, merge (all leads, tasks, activities, conversations move),
  dismiss forever; `contact.merged` event.
- **Front end:** Contacts → Possible duplicates, side-by-side merge.
- **Tests:** merge keeps everything; dismissed pairs never return; audit keeps both originals.
- **Manual:** create two similar contacts, run the job, merge.

### F14 Tickets
- **Req:** `4-staff-workspace/06-tickets.md`; docs/CONVERSATION-TYPES.md
- **Backend:** `tickets` (type, priority, status open/done, owner, contact, conversation type key); CRUD, assign, note,
  close with a note.
- **Front end:** Tickets list and page, on the contact page.
- **Tests:** isolation, staff_own does not hide tickets (tickets are business-wide; confirm, review item R10).
- **Manual:** raise a complaint ticket by hand, assign, close with a note.

## Stage C: Conversation types, knowledge and the agent (requirements step 4)

### F15 Conversation types and the router
- **Req:** docs/CONVERSATION-TYPES.md (new); scoring, tickets
- **Backend:** `conversations`, `messages`, `conversation_types` (system + industry presets), `conversation_outcomes`,
  `classification_corrections`, `block_list`; pre-filter rules; the classifier (`generateObject`, schema from the
  business's keys); `router.decide` (pure); outcome handlers (lead in `engine.leads`, ticket in core); staff correction.
- **Front end:** Settings → Conversation types (list as sentences, edit form, **Try it** box), block list.
- **Tests:** router unit tests for every rule; pre-filter tests; correction moves lead ↔ ticket keeping the timeline;
  classification eval set v1 (English) with the targets.
- **Manual:** in **Try it**, paste a booking enquiry, a complaint, a supplier pitch and a job request; see each type
  and what would happen. Change "General question" to log only and try again.
- **Needs:** an AI key (Gemini or Claude) in `.env`.

### F16 Business profile, business questions and situations
- **Req:** `3-ai-agents-and-channels/09-business-questions.md`, `08-knowledge-base.md`
- **Backend:** question sets in code (general + industry extras), `business_answers` (source, status
  check/confirmed), `situations`, office hours and time zone, completeness score (pure), go-live readiness check.
- **Front end:** Knowledge base → Business profile (form by section, "Please check" tags, sources), Situations,
  completeness score card.
- **Tests:** every answer type validates; unconfirmed answers never reach the agent context builder; completeness.
- **Manual:** answer sections A–G, see the score rise; leave a needed question empty and see "not ready to go live".

### F17 Offerings and offers
- **Req:** `3-ai-agents-and-channels/01-business-info-and-offerings.md`
- **Backend:** `offerings` (from-price in paise, unit, GST mode, season note, includes, active, sort), `offers` (end
  date); assignment by offering (finishes F06).
- **Front end:** Knowledge base → Offerings (list, form, reorder, on/off), offers.
- **Tests:** off and expired items never reach the agent; money formatting.
- **Manual:** add three offerings and an offer ending yesterday; check what the agent context would include
  (debug view in Test the agent comes in F19).

### F18 Documents, FAQs, knowledge search and unanswered questions
- **Req:** `08-knowledge-base.md`
- **Backend:** uploads (PDF, Word, photo; 20 MB / 50 files, review item R11), text extraction and image reading jobs,
  summaries, `knowledge_chunks` searched with Postgres full-text and trigram search (pgvector only if the evals show it misses questions; the search sits behind one function so it can be added later), `faqs`, `unanswered_questions` (grouped nightly),
  `knowledge_conflicts` (price mismatch), trust order, re-read website (with F31's reader; until then upload only).
- **Front end:** Documents (upload, summary, Use this / Don't use), FAQs, Unanswered (Answer → FAQ, Ignore),
  "These don't match" warnings.
- **Tests:** isolation of passages; unconfirmed documents excluded; trust order; conflicts.
- **Manual:** upload a rate card PDF and a phone photo of a price board; accept one; see a mismatch warning.

### F19 The AI agent (text) and Test the agent
- **Req:** `3-ai-agents-and-channels/02-how-the-agent-behaves.md`
- **Backend:** agent runtime (prompt builder, playbooks, tool loop, summaries; text agents reply in English only), Phase 1 tools,
  promise → task, facts → scoring, final type → router; `POST /agent/test-chat` (nothing saved as real customer data);
  `evals/agent` (English, Malayalam, Hindi scripted conversations).
- **Front end:** **Test the agent** panel on every knowledge base tab, each answer with its source and the type it
  detected.
- **Tests:** tools with the fake provider; evals: no totals, no invented facts, no competitor names, exactly one
  promise, complaint gets the service playbook.
- **Manual:** ask prices, ask something not in the knowledge base (see it under Unanswered), complain, ask something in English that the knowledge base can't answer.

### F20 Website chat (first channel)
- **Req:** `3-ai-agents-and-channels/05-website-chat.md`; docs/ARCHITECTURE.md §2
- **Backend:** the `ChannelAdapter` contract and conversation engine; `channel.webchat` (widget key, allowed
  websites, visitor session tokens, streaming replies, idle end → finalise).
- **Front end:** Channels → Website chat (code to copy, colour, greeting, position, allowed sites, live preview);
  the widget in `apps/site`: a tiny plain JavaScript + CSS loader (no React) that shows the launcher buttons (Chat,
  Call, WhatsApp) and opens the chat window, which is React in an iframe. Which buttons show, their order, colour,
  greeting, position, phone number and WhatsApp number + prefilled message are business settings that the loader
  fetches by widget key, so changing them never needs a re-paste. A button shows only if its channel is on for the
  business. Setup screen: the one-line snippet, short per-platform steps (HTML, PHP, WordPress, Shopify, Wix/Squarespace/
  Webflow, React/Next, Google Tag Manager), the exact CSP entries for strict sites, and a **Check installation** button
  ("last seen on <website> today"). Fallback for sites that cannot run scripts: a plain HTML snippet with `tel:` and
  `wa.me` links (no AI chat).
- **Tests:** origin checks, rate limits, a chat giving a phone → contact + lead + task + timeline + summary; a
  complaint chat → ticket, no lead.
- **Manual:** paste the code into a local test page, chat as a customer (an enquiry, then a complaint), see the lead,
  the ticket and the tasks appear.
- **Note:** the browser-call button (microphone, iframe `allow="microphone"`, HTTPS) arrives with F29 (voice); `tel:` and
  `wa.me` buttons work from F20 on. Use a neutral script file name (ad blockers block "chat").

## Stage D: Staff workspace (requirements step 5)

### F21 Inbox, staff takeover and live updates
- **Req:** `4-staff-workspace/02-inbox.md`, `3-ai-agents-and-channels/07-staff-takeover.md`, Today (SSE part)
- **Backend:** `/conversations` list and detail, reply on the channel, done, takeover/handback (one holder, auto-return
  after 2 h), `/events` SSE stream.
- **Front end:** Inbox (filters, needs-a-person first, type chips, AI unsure, Change type), conversation view with
  **I'll handle this** / **Hand back to AI**, "Answered from" links; live updates.
- **Tests:** AI never replies while held; one holder; SSE carries only own-business events.
- **Manual:** chat from the widget, take over from the inbox, reply as staff, hand back; open two browsers and see live updates.

### F22 Today page
- **Req:** `4-staff-workspace/01-today-page.md`
- **Backend:** `/today?scope=me|team` (late, hot not contacted, due today, overnight, this week, setup checklist slot).
- **Front end:** Today, phone first, Call/WhatsApp on every item, team switch for managers.
- **Tests:** each section against hand-made data; staff_own.
- **Manual:** with the data from earlier features, check every section; create a hot lead from the widget and watch it appear.

### F23 Staff alerts and the morning summary
- **Req:** `4-staff-workspace/03-staff-alerts.md`; conversation type alerts
- **Backend:** `notifications`, `alert_preferences`, business alert settings, per-type alerts, office-hours and
  night rules, grouping, email fallback; morning summary job at each business's opening time.
- **Front end:** Settings → Promises and alerts, My alerts.
- **Tests:** each alert kind once; off means off; required alerts can't be turned off; night rule; fake clock.
- **Manual:** trigger a hot lead and a complaint; see the alerts (console/Mailpit); turn a kind off.

### F24 Privacy and support access
- **Req:** `1-foundation/04-security-privacy-and-audit.md`
- **Backend:** contact export (zip of JSON), erase (every table, anonymous stub), recording retention job (ready for
  F29), `support_grants`, `support_visits`.
- **Front end:** Contact page → Privacy; Settings → Support access.
- **Tests:** after erase, no personal detail in any table (scan); export and erase in the activity log.
- **Manual:** export then erase a contact; grant support access for 1 hour.

## Stage E: More channels (requirements steps 6–7)

### F25 WhatsApp
- **Req:** `3-ai-agents-and-channels/04-whatsapp.md`
- **Backend:** webhook (verify, signature, idempotent), `connections` (encrypted), templates and approval sync, 24-hour
  rule, voice-note reply; the platform's own WhatsApp sender for codes and staff alerts (review item R4); switch
  F01/F02/F08/F23 messages from console to WhatsApp.
- **Front end:** Channels → WhatsApp.
- **Tests:** signature rejection, replay, 24-hour rule, template-only outside the window.
- **Manual:** message the test number, get an AI reply, see it in the inbox; receive a staff alert on WhatsApp.
- **Needs:** Meta business account and app (owner).

### F26 Email
- **Req:** `3-ai-agents-and-channels/06-email.md`
- **Backend:** Gmail, Outlook and IMAP connections, polling/push, pre-filter for automated mail, sender authentication
  check, reply or draft per type, threads as conversations.
- **Front end:** Channels → Email (reply mode per conversation type), drafts in the inbox.
- **Tests:** automated mail ignored; failing authentication never auto-answered; draft → send.
- **Manual:** connect a test mailbox, send an enquiry and a newsletter, see a lead for one and nothing for the other.

### F27 Follow-ups
- **Req:** `4-staff-workspace/04-follow-ups.md` (moved after WhatsApp because follow-ups go out as WhatsApp templates)
- **Backend:** `follow_ups`, settings, draft job (day 2 and 5), cancel on reply, send (template outside 24 h),
  stop list, automatic mode per kind.
- **Front end:** follow-ups section on Today, Settings → Follow-ups.
- **Tests:** right days (fake clock), reply cancels, never more than two, never to "stop".
- **Manual:** move a lead to Quoted, jump the clock, approve the draft.

### F28 Reports
- **Req:** `4-staff-workspace/05-reports-and-dashboard.md`
- **Backend:** each report as a query + pure function: by channel, after hours, speed to call, funnel, won/lost, by
  staff, by offering, **by conversation type**; drill-down; export; weekly WhatsApp summary.
- **Front end:** Reports with date range and charts (dataviz rules).
- **Tests:** every report equals a hand count on fixed test data; under 2 s for a year of generated data.
- **Manual:** pick "This month", tap a bar, export.

### F29 Phone calls (voice)
- **Req:** `3-ai-agents-and-channels/03-phone-calls.md`
- **Backend:** telephony bridge (Exotel or Twilio, review item R2), `phone_numbers`, `calls`, Gemini Live session,
  recording consent line, transcript, transfer with fallback, max length, silent-call pre-filter, web call from the widget.
- **Front end:** Channels → Phone (number, forwarding codes, status, transfer number, Test call); recordings and
  transcripts on the timeline.
- **Tests:** audio conversion, end-of-call finalise, transfer fallback; voice evals.
- **Manual:** call the number, talk in English, Malayalam and Hindi, hang up, see the call on the timeline within a minute.
- **Needs:** provider chosen, KYC done (owner).

## Stage F: Assistant, onboarding and launch (requirements steps 8–9)

### F30 Staff assistant and MCP
- **Req:** `4-staff-workspace/07-staff-assistant.md`
- **Backend:** assistant runtime with read tools and confirm-first write tools as the signed-in person; `assistant_chats`;
  `apps/mcp` serving the same tools with OAuth sign-in.
- **Front end:** assistant panel from the top bar (text, microphone).
- **Tests:** ten common questions; staff_own limits; writes need Confirm and are logged "via assistant".
- **Manual:** ask "how many hot leads this week", "add a task to call Priya tomorrow at 10" → Confirm.

### F31 Setup wizard and fill from website
- **Req:** `5-onboarding-and-launch/03-setup-wizard.md`, business questions
- **Backend:** setup progress, the setup chat agent (questions only), safe website reader (SSRF rules), Google
  Places prefill, presets per industry (stages, fields, conversation types, words), go-live.
- **Front end:** setup chat (phone first) with the side panel, Switch to form, checklist card on Today.
- **Tests:** chat and form save the same answers; prefill never confirms; go-live blocked until ready.
- **Manual:** sign up a new business with a real website and time it to the test call.

### F32 Free "what you're missing" check
- **Req:** `5-onboarding-and-launch/01-free-missed-enquiries-check.md`
- **Backend:** formula (pure), code send/verify, report on WhatsApp; rate limits.
- **Front end:** check pages in `apps/site`, one question per screen.
- **Manual:** do the check on a phone and receive the report.

### F33 Competitor report
- **Req:** `5-onboarding-and-launch/07-competitor-report.md`
- **Backend:** competitors, report job (safe reader, Places ratings), price comparison in code, monthly refresh limit.
- **Front end:** Reports → Competitors, optional setup step.
- **Tests:** comparison maths; agent evals never mention competitors.

### F34 Subscription billing
- **Req:** `5-onboarding-and-launch/04-subscription-billing.md`
- **Backend:** Razorpay subscriptions (test mode), trial, failed payment → read-only staff screens (AI keeps answering),
  cancel and 90-day deletion, GST invoices; entitlements per plan feed F03.
- **Front end:** Settings → Billing.
- **Needs:** price and plan model decided, Razorpay account (owner).

### F35 Platform console
- **Req:** `5-onboarding-and-launch/05-platform-console.md`
- **Backend:** businesses list and page, suspend, entitlements, hourly health checks, `usage_daily`, support visits.
- **Front end:** the platform area.

### F36 Go live
- **Req:** `5-onboarding-and-launch/06-go-live.md`; docs/SECURITY.md §4
- Hosting, domain, HTTPS, production database with backups and a tested restore, error tracking, uptime check,
  deploy and rollback workflows, the pre-launch security review, first three businesses.

---

## Phase 1 done (from the requirements)

Checked again at F36: self sign-up and setup in under 15/20 minutes; answers from the knowledge base; each channel
creates one contact and one lead (or the right ticket); the same person on two channels is one contact; hot-lead
WhatsApp alert within a minute; Won/Lost with a reason; every page on a phone; live with monitoring.

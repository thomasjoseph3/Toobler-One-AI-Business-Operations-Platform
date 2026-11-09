# Phase 1 screens: a guide for designers

This page lists every screen in Phase 1, in plain words: who uses it, what it is for, what is on it and what people
do there. The feature files linked from each screen have the full details.

## The product in one minute

Small businesses (hotels, travel agents, clinics, car dealers, schools and others) miss customer enquiries because
nobody answers the phone or WhatsApp in time. Our AI answers every call, WhatsApp message, website chat and email, day
and night. It saves each customer as a **contact**, each enquiry as a **lead**, and promises the customer a callback.
Staff then open the app, see who to call next, and call them.

So the app is mostly about one thing: **showing staff who to call next, and everything they need to know before they
call.**

## Who uses the screens

| Person | Who they are | Where they use it |
| --- | --- | --- |
| **Owner / manager** | Runs the business. Sets things up, watches the numbers, manages staff. | Phone most of the time, computer for setup |
| **Staff** | Calls customers back, replies to chats, moves leads along. Often not technical. | Mostly phone, between other work |
| **Customer** | The business's customer. Never signs in. | The chat bubble on the business's website |
| **Visitor** | A business owner who hasn't signed up yet | Our free check page, on a phone |
| **Toobler team** | Us. Looks after every business on the product. | Computer |

## Things to keep in mind on every screen

1. **Phone first.** Every screen must work well on a phone. Owners check from their phone. Design the phone version
   first, then the computer version.
2. **Five seconds.** Staff open the app between other jobs. The next thing to do should be clear within five seconds.
3. **Call and WhatsApp everywhere.** Wherever a customer appears, there are **Call** and **WhatsApp** buttons. On a
   phone they open the phone's dialler or WhatsApp directly.
4. **AI or person.** Every message, note and change shows who did it: a staff member's name, or "AI agent". The AI
   should look clearly different from a person.
5. **Hot, warm, cold.** Every lead has a temperature with a short reason ("Hot: dates 12–15 Dec and asked the price").
   These three need clear, consistent colours and must also be readable without colour.
6. **Live.** New leads, messages and tasks appear on open screens without reloading.
7. **"Are you sure?"** Every delete, and every action that can't be undone, asks first.
8. **Simple words.** Staff are not technical. Use "Call back at 9 AM", not "Task due 09:00".
9. **Industry words.** A business's industry changes some words. A hotel's stages might read "New → Called → Rate sent
   → Booked". Never hard-code these words into a design; treat them as labels that change.
10. **Empty states.** A new business has no leads yet. Every list needs a friendly empty state that says what to do
    next.

## Small parts used everywhere

| Part | What it shows |
| --- | --- |
| **Lead card** | Name, what they want, dates, temperature, owner, time since last contact |
| **Temperature tag** | Hot / Warm / Cold, with the reason on tap or hover |
| **Channel icon** | Phone call, WhatsApp, website chat, email |
| **"AI agent" badge** | Marks anything the AI did or wrote |
| **Timeline item** | One thing that happened: a call, a message, a note, a stage change. Icon, who, when, short summary. Calls open a recording and transcript. |
| **Call / WhatsApp buttons** | Open the dialler or WhatsApp |
| **"Are you sure?" box** | Before deleting or anything that can't be undone |
| **Filter chips and saved view tabs** | Above every list |

## The main menu

Once signed in, the app has these sections. On a computer they sit in a side menu. On a phone, suggest a bottom bar
with the four most used (Today, Leads, Inbox, Tasks) and the rest under **More**.

| Menu item | What it's for |
| --- | --- |
| **Today** | Who to call next. The first page after sign-in. |
| **Leads** | Every enquiry, as a board or a list |
| **Contacts** | Every customer |
| **Companies** | Firms or families that contacts belong to |
| **Inbox** | Every conversation from every channel in one list |
| **Tasks** | Things to do, with a time |
| **Tickets** | Requests that aren't sales: complaints, questions about a past order |
| **Reports** | Numbers and charts |
| **Knowledge base** | Everything the AI knows: business profile, offerings, situations, documents, FAQs, unanswered questions |
| **Channels** | Phone, WhatsApp, website chat, email connections |
| **Settings** | Team, pipeline, fields, billing, activity, support access |

Always visible at the top: **search** (find any contact, company or lead by name, phone or email), the **assistant**
button, a **business switcher** (for people who work for more than one business) and the person's **profile**.

The menu is built from the engines a business has switched on. In Phase 1 every business has the same menu; later
phases add sections (see [engines](1-foundation/03-engines-and-plans.md)).

---

## 1. Before sign-in

### Free "what you're missing" check

- **Who:** a visitor, on a phone, no login.
- **For:** showing an owner how much money they lose from late or missed enquiries, in rupees, before they sign up.
- **On it:** five short questions (enquiries a month, how many after hours, how many answered late, average sale
  value, how many become sales). Then a big result: "You may be losing about ₹1,20,000 a month", with the simple
  formula shown underneath.
- **Actions:** **Send me this report** → enter WhatsApp number → enter a 6-digit code → report arrives on WhatsApp. A
  **Save it** button leads to sign-up.
- **Feel:** short, friendly, three minutes. One question per screen works well on a phone.
- **Details:** [free check](5-onboarding-and-launch/01-free-missed-enquiries-check.md)

### Sign up

- **Who:** a new business owner.
- **On it:** name, business name, email, mobile. Then a 6-digit code sent on WhatsApp to confirm the mobile, and a
  link by email to confirm the email. Then **choose your industry** (a list with "Other").
- **Goes to:** the setup wizard.
- **Details:** [sign-up and sign-in](5-onboarding-and-launch/02-sign-up-and-sign-in.md)

### Sign in

- **Two ways, both on one screen:** email and password, or mobile number and a 6-digit WhatsApp code.
- **Also:** Forgot password (by email). After too many wrong tries: a clear "try again in 15 minutes" message.

### Accept invitation

- **Who:** a staff member the owner invited (they get the link on email and WhatsApp).
- **On it:** the business name, who invited them, set a password, done.
- **Details:** [users and roles](1-foundation/02-users-roles-and-teams.md)

---

## 2. First-time setup

### Setup chat (the setup wizard)

- **Who:** the owner, straight after sign-up.
- **For:** teaching the AI about the business and going live, in under 15 minutes with a website (20 without).
- **Looks like:** a chat. Our AI asks one simple question at a time; the owner taps an option button or types. It
  feels like WhatsApp, not like a form. A progress bar at the top. A **Switch to form** link for owners who prefer a
  form.
- **What the AI knows so far:** on a computer, a side panel that fills in live as the owner answers, with the
  completeness score. On a phone, a tab at the top.

**Part 1: Teach the AI about your business**

| Step | What the owner sees and does |
| --- | --- |
| 1. Where can we learn about you? | "Do you have a website?" **Yes** → paste link. **No** → "Are you on Google Maps, Instagram, Facebook, JustDial or IndiaMART?" → paste link. **None** → the AI asks the questions instead. |
| 2. Anything else to read? | Upload a brochure, rate card or menu, or take a photo of a price board. **Skip** is fine. |
| 3. About your business | Name, what you do, address, contacts, hours, languages. Pre-filled answers come as a card: "From your website: Open 9 AM to 9 PM. Is this right?" **Yes** / **Change**. |
| 4. What you sell | The offerings we found, with "from" prices. Add, change, remove. Then GST (included or extra), seasonal prices, offers, payment methods. |
| 5. How should the AI handle these? | A short list of situations (discount request, fully booked, wants a person, complaint, after hours), each with a choice already picked. **Accept all** or change one. |
| 6. Your goals | Three quick taps: what matters most, enquiries a month, how fast you call back today. |
| 7. Check | A short card list of what the AI will tell customers. **Change** on each. **Test the agent** to try it. |

**Part 2: Get ready to answer customers**

| Step | What the owner sees and does |
| --- | --- |
| 8. Promises and alerts | How fast staff will call back (e.g. 15 minutes), the WhatsApp number that gets alerts |
| 9. Your pipeline | The industry's suggested stages and fields. Accept or change. |
| 10. Team | Invite staff (can skip) |
| 11. Channels | Phone forwarding codes, connect WhatsApp, copy website chat code, connect email. Each can be skipped. |
| 12. Test call | Our number in large type and **Call now**. The owner hears the AI. A celebration moment: the business is live. |

- **Optional, after step 6:** "Who are your main competitors?" with up to three links, or **Skip**.
- **Moments to design:** "Reading your website…" while the owner carries on; a pre-filled answer card with its source;
  an upload being read, then its summary with **Use this** / **Don't use**.
- **After setup:** anything skipped shows as a **setup checklist** card at the top of the Today page until done.
- **Details:** [setup wizard](5-onboarding-and-launch/03-setup-wizard.md), [business questions](3-ai-agents-and-channels/09-business-questions.md)

---

## 3. Daily work

### Today

- **Who:** everyone. The first page after sign-in.
- **For:** answering one question: **who do I call next?**
- **On it, in this order:**
  1. **Late:** callbacks and tasks past their time (most urgent, should stand out)
  2. **Hot leads** not yet contacted
  3. **Due today:** my tasks
  4. **Came in overnight:** leads since closing time
  5. **Follow-ups to approve:** messages the AI wrote for quiet leads. **Send**, **Edit** or **Skip**.
  6. **This week:** leads in, contacted, won, and the average time to first call
- **Every item** has Call and WhatsApp buttons.
- **Managers** see the whole team; staff see their own, with a switch to see the team.
- **Details:** [Today page](4-staff-workspace/01-today-page.md), [follow-ups](4-staff-workspace/04-follow-ups.md)

### Leads: board

- **For:** seeing every open enquiry by stage.
- **On it:** one column per stage (New → Contacted → Quoted → Won / Lost), with a count on each. Lead cards in each
  column.
- **Actions:** drag a card to another column on a computer; on a phone, use a **Move** button instead of dragging.
  Moving to **Lost** asks for a reason ("too costly", "went elsewhere", "no reply", "other").
- **Tabs:** saved views (e.g. "My hot leads"), and a **Filtered** tab for calls and messages that weren't real
  enquiries (wrong numbers, spam, silent calls). Staff can move one back.
- **Details:** [leads and board](2-crm-core/03-leads-and-pipeline-board.md), [scoring](2-crm-core/07-lead-scoring-and-filtering.md)

### Leads: list

- The same leads as rows. Filters, sort, choose columns, **Save view**, **Export**.
- **Details:** [views, filters and search](2-crm-core/08-views-filters-and-search.md)

### Lead page

- **For:** everything about one enquiry, before calling.
- **On it:** who, what they want, dates, number of people, budget, temperature and reason, owner, stage, the business's
  own fields. The **timeline** of every call and message, with AI summaries, recordings and transcripts. Tasks.
- **Actions:** Call, WhatsApp, Move stage, Assign, Add note, Add task.
- **Details:** [leads](2-crm-core/03-leads-and-pipeline-board.md), [timeline](2-crm-core/04-activity-timeline-and-notes.md)

### Contacts list

- Name, phone, company, stage (New, Lead, Customer, Repeat customer, Not a fit), owner, last activity. Search,
  filters, saved views.
- **Actions:** add a contact, **Import**, **Export**, **Possible duplicates**.
- **Details:** [contacts](2-crm-core/01-contacts.md)

### Contact page

- **Layout on a computer:** details on the left (including the business's own fields), timeline in the middle, leads,
  tasks and company on the right. On a phone these become stacked sections or tabs.
- **Actions:** Call, WhatsApp, Email, Add note, Add task, New lead.
- **Privacy (managers only):** Download data, Erase contact (with "Are you sure?").
- **Details:** [contacts](2-crm-core/01-contacts.md), [security and privacy](1-foundation/04-security-privacy-and-audit.md)

### Companies list and company page

- **List:** name, number of contacts, open leads, won value, owner.
- **Page:** details, its contacts, its leads, and one combined timeline.
- **Details:** [companies](2-crm-core/02-companies.md)

### Inbox

- **For:** one place for every conversation, from every channel.
- **List:** channel icon, contact name, short summary, status. Conversations that **need a person** (customer asked for
  one, a complaint, the AI wasn't sure) are marked and sit at the top.
- **Filters:** channel, open or done, held by me, needs a person.
- **Conversation view:** the full chat or email, with the AI's messages clearly marked. Buttons:
  - **I'll handle this:** the AI stops replying and the staff member types the replies. Others see who is holding it.
  - **Hand back to AI**
  - For emails the AI drafted: edit and **Send**
  - **Done**
- **Where an answer came from:** when the AI answered from a document or FAQ, a small "Answered from: Rate card 2026"
  link under its message.
- **Details:** [inbox](4-staff-workspace/02-inbox.md), [staff takeover](3-ai-agents-and-channels/07-staff-takeover.md)

### Tasks

- **Sections:** Overdue, Today, Upcoming, Done. Filter by owner.
- **Each task:** kind (Call, WhatsApp, Email, To-do), what, who it's about, due time, owner, and whether the AI made it.
- **Actions:** tick done, snooze, reassign, add a task.
- **Details:** [tasks](2-crm-core/05-tasks-and-reminders.md)

### Tickets

- **For:** requests that aren't sales, so they don't clutter the leads board.
- **List:** contact, what it's about, owner, Open or Done.
- **Actions:** assign, add a note, close with a note.
- **Details:** [tickets](4-staff-workspace/06-tickets.md)

### Reports

- **Who:** mainly managers.
- **On it:** a date range picker ("This month" and so on), then one card per report, each with a chart and the numbers:
  leads by channel, leads after hours ("what the AI saved you"), speed to first call, the funnel from New to Won,
  won and lost with reasons, by staff member, by offering.
- **Actions:** tap a bar to see the leads behind it; **Export**.
- **Competitors tab:** the business and up to three competitors side by side (one card each on a phone): what they
  sell, prices they show, how customers reach them, Google rating, and suggestions at the bottom. **Refresh**,
  **Change competitors**. Owner and managers only.
- **Details:** [reports](4-staff-workspace/05-reports-and-dashboard.md),
  [competitor report](5-onboarding-and-launch/07-competitor-report.md)

### Assistant

- **For:** asking questions instead of using screens. "How many hot leads came in this week?" "Add a task to call
  Priya tomorrow at 10."
- **Looks like:** a chat panel that opens from the top bar, with typing and a microphone button.
- **Answers** come with numbers and links. **Changes** show what will happen and wait for **Confirm**.
- **Details:** [staff assistant](4-staff-workspace/07-staff-assistant.md)

### Search

- One box at the top of every page. Finds contacts, companies and leads by name, phone (typed any way) or email.
  Results grouped by kind.

---

## 4. Knowledge base: what the AI knows

- **For:** everything the AI may tell customers. The AI answers only from here.
- **Top of page:** a **completeness score** that says what's missing and why it matters ("Add your cancellation
  policy: customers ask about it on 1 in 5 calls"), and any **"These don't match"** warnings (e.g. a rate card and an
  offering show different prices).
- **Anything not yet confirmed** carries a **Please check** tag; the AI doesn't use it until the owner accepts it.

| Tab | What's on it |
| --- | --- |
| **Business profile** | The business questions as a form in sections (about you, what you sell, policies, goals, tax and legal). Each answer shows where it came from ("From your website"). |
| **Offerings** | Name, "from" price, unit (per night, per person, per visit), GST note, on/off. Add, edit, reorder, remove. |
| **Situations** | How the AI handles a discount request, fully booked, wants a person, a complaint, after hours. Change the choice. |
| **Documents** | Uploaded brochures, rate cards, photos, and pages read from the website: name, date, short summary, "Used for answers" on/off. **Upload**, **Re-read website**. |
| **FAQs** | Questions and answers. Add, edit, remove. |
| **Unanswered questions** | "Is there EV charging? (asked 6 times this month)". **Answer** (becomes an FAQ) or **Ignore**. |

- **Test the agent:** a chat panel on every tab. The owner types as a customer would; each AI answer shows which part
  of the knowledge base it came from.
- **Details:** [knowledge base](3-ai-agents-and-channels/08-knowledge-base.md),
  [business questions](3-ai-agents-and-channels/09-business-questions.md),
  [offerings](3-ai-agents-and-channels/01-business-info-and-offerings.md)

---

## 5. Channels

One page per channel. Each shows clearly: **connected or not**, and **working or not**.

| Page | What's on it |
| --- | --- |
| **Phone** | Our number for this business, the codes to dial to forward calls, whether forwarding works (last forwarded call), the staff number for transfers, a **Test call** button |
| **WhatsApp** | Connected number, status, message templates and whether Meta approved them |
| **Website chat** | The code to copy, colour, greeting, position, allowed websites, and a live preview of the bubble |
| **Email** | Connected mailbox, status, and for each kind of email: "AI sends" or "AI drafts, staff approve" |

Details: [phone](3-ai-agents-and-channels/03-phone-calls.md), [WhatsApp](3-ai-agents-and-channels/04-whatsapp.md),
[website chat](3-ai-agents-and-channels/05-website-chat.md), [email](3-ai-agents-and-channels/06-email.md)

---

## 6. Settings

| Page | Who | What's on it |
| --- | --- | --- |
| **Promises and alerts** | Manager | How fast staff call back during office hours, the WhatsApp number that gets alerts, whether alerts go at night |
| **Team** | Manager | People, with role, team, last seen. Invite, change role, remove (removing asks who takes over their leads and tasks). |
| **Teams** | Manager | Add, rename, remove a team; pick its members |
| **Pipeline** | Manager | Rename, add, reorder stages; lost reasons; how new leads are shared out (one person, take turns in a team, or by offering) |
| **Fields** | Manager | A tab each for Contacts, Companies, Leads. Add a field: label, type (text, number, date, dropdown, yes/no, phone, email), "AI should ask", "Required before Won". Reorder, remove. |
| **Billing** | Manager | Plan, trial days left, next payment, invoices, change card, cancel |
| **Activity** | Manager | Who did what, when |
| **Support access** | Manager | Let the Toobler team see the business's data for a set time, or end it |
| **My alerts** | Everyone | Turn each kind of WhatsApp alert on or off for themselves (except ones the manager made required) |

Roles decide what each person sees: **Manager** sees everything; **Staff** can't see Settings (except My alerts) and
can't delete; **Staff (own leads only)** sees only their own leads. Details:
[users and roles](1-foundation/02-users-roles-and-teams.md),
[security](1-foundation/04-security-privacy-and-audit.md), [pipeline](2-crm-core/03-leads-and-pipeline-board.md),
[fields](2-crm-core/06-custom-fields.md), [billing](5-onboarding-and-launch/04-subscription-billing.md),
[alerts](4-staff-workspace/03-staff-alerts.md)

---

## 7. Step-by-step tools

### Import

1. Upload an Excel or CSV file.
2. See the first rows, with our guess of what each column is (name, phone, email, company, a custom field). Fix any
   wrong guess.
3. See the result before importing: "1,240 new, 86 match existing contacts (will be updated), 12 rows skipped".
4. **Import**, then a short report of anything skipped and why.

Details: [import and export](2-crm-core/09-import-and-export.md)

### Possible duplicates

- Two contacts side by side, with why we think they're the same person.
- For each field, pick which value to keep. **Merge** (with "Are you sure?") or **Not the same**.
- Details: [duplicates](2-crm-core/10-duplicates-and-merging.md)

### Save view

- After filtering any list: **Save view**, give it a name, choose whether the team can see it. It appears as a tab.

---

## 8. Outside the app

These aren't app screens, but they need design too.

### Website chat bubble

- **Who:** the business's customers, on the business's own website.
- **On it:** a bubble in the corner, in the business's colour. Opens to a chat with the business's greeting. The AI
  replies. A **Call us** button lets them talk to the AI by voice from the browser.
- **Must:** feel like the business's own chat, not ours; load fast; work well on a phone.

### WhatsApp messages to staff

Staff get alerts on WhatsApp so they don't have to keep the app open. Each is a short message with a link to the lead.

| Message | Example |
| --- | --- |
| Hot lead | "Hot lead: Priya, 4 people, 12–15 Dec, asked price. Tap to call." |
| Callback due | 15 minutes before a promised callback |
| Callback late | To the manager, 15 minutes after, if not done |
| Needs a person | A customer asked for a person, or complained |
| Morning summary | At opening time: overnight leads by temperature, late tasks |

Details: [staff alerts](4-staff-workspace/03-staff-alerts.md)

---

## 9. Toobler team only

### Platform console

A separate area only the Toobler team can open.

- **Businesses:** list with plan, trial end, leads this week, last activity, and whether their channels are working.
- **Business page:** details, engines switched on, support access (only when the business allowed it), suspend (with
  "Are you sure?").
- **Health:** which WhatsApp, phone, email and AI connections are failing.
- **Usage:** calls, minutes, messages and AI cost per business.

Details: [platform console](5-onboarding-and-launch/05-platform-console.md)

---

## Not in Phase 1: don't design these yet

Bookings, payments, quotes and invoices to customers (Phase 2). Help desk stages, knowledge base, surveys (Phase 3).
Campaigns, forms, ads (Phase 4). Workflow builder (Phase 5). Website builder (Phase 6). Mobile app (Phase 7). The
Settings → Engines switch (Phase 2).

# Phase 1: Lead engine and CRM core

## Goal

At the end of Phase 1, a small business can sign up alone, connect its phone, WhatsApp, website and email, and **never
miss an enquiry again**. Our AI answers every customer day and night, saves them in a HubSpot-style CRM, scores them and
tells staff who to call next.

The AI never books, takes payment or cancels in this phase. That comes with the sales engine in Phase 2.

## Who it is for

Small businesses that get enquiries by phone and WhatsApp and lose some because nobody answers in time: hotels, travel
agents, clinics, schools, car dealers, real estate agents, wedding planners, and any other business with enquiries.

**Designers:** start with [SCREENS.md](SCREENS.md). It lists every Phase 1 screen in plain words.

## What is in Phase 1

| Folder | Features |
| --- | --- |
| [1-foundation](1-foundation) | Project setup, users and roles, engines and plans, security |
| [2-crm-core](2-crm-core) | Contacts, companies, leads board, timeline and notes, tasks, custom fields, scoring, views and search, import and export, duplicates |
| [3-ai-agents-and-channels](3-ai-agents-and-channels) | Business info and offerings, how the agent behaves, phone, WhatsApp, website chat, email, staff takeover, knowledge base, business questions |
| [4-staff-workspace](4-staff-workspace) | Today page, inbox, staff alerts, follow-ups, reports, tickets, staff assistant |
| [5-onboarding-and-launch](5-onboarding-and-launch) | Free check, sign-up, AI-guided setup, subscription billing, platform console, go-live, competitor report |

## What is not in Phase 1

Bookings, payments, quotes, invoices (Phase 2). Help desk stages, knowledge base, surveys (Phase 3). Campaigns, forms,
ads (Phase 4). Workflow builder, integrations (Phase 5). Website builder (Phase 6). Mobile app (Phase 7).

## Order of work

Each step ends with all tests passing and a check in the running app.

| Step | What gets built | Feature files |
| --- | --- | --- |
| 1 | Project setup: repository, apps, database, tests, staging | [project setup](1-foundation/01-project-setup.md) |
| 2 | Sign-up and sign-in, users and roles, security, engines record | [sign-up](5-onboarding-and-launch/02-sign-up-and-sign-in.md), [users](1-foundation/02-users-roles-and-teams.md), [security](1-foundation/04-security-privacy-and-audit.md), [engines](1-foundation/03-engines-and-plans.md) |
| 3 | CRM core | everything in [2-crm-core](2-crm-core) |
| 4 | Knowledge base, business questions, offerings, the AI agent, website chat | [knowledge base](3-ai-agents-and-channels/08-knowledge-base.md), [business questions](3-ai-agents-and-channels/09-business-questions.md), [business info](3-ai-agents-and-channels/01-business-info-and-offerings.md), [agent](3-ai-agents-and-channels/02-how-the-agent-behaves.md), [website chat](3-ai-agents-and-channels/05-website-chat.md) |
| 5 | Staff workspace | everything in [4-staff-workspace](4-staff-workspace) |
| 6 | WhatsApp, email, staff takeover | [WhatsApp](3-ai-agents-and-channels/04-whatsapp.md), [email](3-ai-agents-and-channels/06-email.md), [takeover](3-ai-agents-and-channels/07-staff-takeover.md) |
| 7 | Phone calls | [phone calls](3-ai-agents-and-channels/03-phone-calls.md) |
| 8 | Free check, AI-guided setup, competitor report, billing, platform console | the rest of [5-onboarding-and-launch](5-onboarding-and-launch) |
| 9 | Go live | [go live](5-onboarding-and-launch/06-go-live.md) |

Website chat comes before WhatsApp and phone because it needs no outside approvals, so the agent can be tested end to
end early.

## Phase 1 is done when

- [ ] A new business signs up and sets up alone, without our help: under 15 minutes with a website or Google listing,
      under 20 minutes without.
- [ ] The AI answers customers' questions about rates, timings and policies from the business's knowledge base, and
      logs what it couldn't answer.
- [ ] A test call, WhatsApp message, website chat and email each create one contact and one lead, with a timeline entry
      and a callback task.
- [ ] The same person on two channels ends up as one contact, not two.
- [ ] Staff see hot leads on the Today page and get a WhatsApp alert within one minute.
- [ ] Staff can drag a lead to Won or Lost, with a reason.
- [ ] Every page works on a phone.
- [ ] The product is live, with monitoring and alerts.

## What the owner needs to provide

| When | What |
| --- | --- |
| Step 1 | Product name; the code repository; a database account |
| Step 6 | A Meta business account and WhatsApp app (made Live together) |
| Step 7 | Exotel or Twilio chosen, KYC complete |
| Step 8 | The price, and a Razorpay account for subscriptions |
| Step 9 | Server or cloud account, and the domain name |

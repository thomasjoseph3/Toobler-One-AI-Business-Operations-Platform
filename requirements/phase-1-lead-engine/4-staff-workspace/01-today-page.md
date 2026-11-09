# Today page

**Phase 1 · Staff workspace · HubSpot equivalent: AI guided selling workspace, Sales workspace, Home dashboard**

## What it is

The first page staff see when they sign in. It answers one question: **who do I call next?**

## Why it matters

Staff open the app between other jobs. They need their next action in five seconds, not a menu.

## How it works

The page shows, in this order:

1. **Late:** callbacks and tasks past their time.
2. **Hot leads** not yet contacted.
3. **Due today:** my tasks.
4. **Came in overnight:** leads since closing time.
5. **This week:** leads in, contacted, won, and the average time to first call.

Each item has Call and WhatsApp buttons that open the phone's dialer or WhatsApp directly.

Managers see the whole team; staff see their own, with a switch to see the team.

## Rules

- Updates while open, without reloading.
- Works on a phone first.

## Done when

- [ ] Each section shows the right items for test data.
- [ ] Call and WhatsApp buttons work on Android and iPhone.
- [ ] A new hot lead appears within seconds without reloading.

## Better than HubSpot

- Built for one job, the next call, instead of a general dashboard.

## For developers

- **Code folder:** `apps/api/src/core/today`
- **API:** [API.md](../../API.md), Phase 1 → Today page
- **Live updates:** a server-sent events stream (`GET /events`) pushes lead and task changes to open pages.

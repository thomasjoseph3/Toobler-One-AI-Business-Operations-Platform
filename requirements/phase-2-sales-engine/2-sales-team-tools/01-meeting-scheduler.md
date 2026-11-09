# Meeting scheduler

**Phase 2 · Sales tools · HubSpot equivalent: Meeting scheduler, Meetings links, Calendar sync**

## What it is

Each staff member has a booking link showing their free times from their Google or Outlook calendar. Customers pick a
time for a call, visit or video meeting. The AI can offer slots and book them during a conversation.

## Why it matters

"When can you talk?" back-and-forth loses customers. A link or the AI books it in one step.

## How it works

1. Rahul connects his Google Calendar and sets his hours.
2. The AI, on WhatsApp: "Rahul can call you at 11 AM or 3 PM tomorrow. Which suits you?" Priya picks 3 PM.
3. The meeting goes into Rahul's calendar, a task is created, and both get reminders.
4. Customers can also use the link on the website or in emails, and reschedule from it.

## Rules

- Only free times are offered. Bookings respect the minimum notice and buffer the business sets.

## Done when

- [ ] Booking through a link and through the AI both create a calendar event, a task and reminders.
- [ ] Round-robin links share meetings across a team.

## Better than HubSpot

- The AI books meetings in the conversation itself; customers don't have to open a link.

## For developers

- **Code folder:** `apps/api/src/engines/sales/meetings`
- **API:** [API.md](../../API.md), Phase 2 → Meeting scheduler
- **Tables:** `calendar_connections` (`user_id`, `provider`, tokens encrypted), `meeting_links`, `meetings`.
- **Code:** Google Calendar and Microsoft Graph APIs; public page `apps/site/app/meet/[slug]`.
- **Agent tools:** `list_meeting_slots`, `book_meeting`.

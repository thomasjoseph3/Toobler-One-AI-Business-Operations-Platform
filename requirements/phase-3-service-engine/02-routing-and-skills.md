# Routing and skills

**Phase 3 · Service · HubSpot equivalent: Skill-based routing, Ticket assignment, Conversation routing**

## What it is

New tickets and conversations go to the right person automatically: by category, language, customer value or staff
skill, shared evenly, and only to people who are available.

## How it works

1. Manager sets: Malayalam speakers get Malayalam tickets; billing tickets go to Anil; VIP customers go to the manager.
2. Staff mark themselves Available or Away.
3. A new ticket goes to the matching available person with the fewest open tickets.

## Done when

- [ ] Rules route test tickets correctly; Away staff get none.

## For developers

- **Code folder:** `apps/api/src/engines/service/routing`
- **API:** [API.md](../API.md), Phase 3 → Routing and skills
- **Tables:** `routing_rules`, `user_skills`, `user_availability`.

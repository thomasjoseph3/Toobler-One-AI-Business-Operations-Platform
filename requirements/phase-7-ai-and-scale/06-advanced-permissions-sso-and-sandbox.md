# Advanced permissions, single sign-on and sandbox

**Phase 7 · Scale · HubSpot equivalent: Permission sets, Field-level permissions, Team hierarchy, Single sign-on, Sandboxes, Audit logs**

## What it is

Controls for larger businesses: custom roles built from detailed permissions, hiding sensitive fields from some roles,
teams inside teams, sign-in through Google Workspace or Microsoft, and a test copy of the account to try changes before
going live.

## Done when

- [ ] Custom roles and hidden fields are enforced on every route and in the AI tools.
- [ ] SSO sign-in works; sandbox changes can be copied to live.

## For developers

- **Code folder:** `apps/api/src/core/permissions`
- **API:** [API.md](../API.md), Phase 7 → Advanced permissions, single sign-on and sandbox
- **Tables:** `roles`, `role_permissions`, `field_permissions`, `team_parents`, `sso_configs`, `sandboxes`.

---
name: f09-custom-fields
description: F09 custom fields approved 18 Nov 2026 (a1b2554); all 5 slices done; R75 decisions; F10 next
metadata:
  type: project
---

F09 is `approved` (18 Nov 2026, verify green: 657 e2e). Slices 1-5 committed: fields CRUD + reorder, custom values on contacts/companies/leads, Required before Won, AI asks (`save_custom_answers`, max 3, contact+lead fields only) and nightly purge (`fields.purge_removed`, event `field.values_purged`). Migrations through 060 applied to dev DB. Decisions R75 in REQUIREMENTS-REVIEW.md.

**How to apply:** same slice routine (tests, isolation entries, brief log, commit). Run e2e with `E2E_WEB_PORT=3917`. Next: F10, F11, F12, F13, F21-F30, F32-F36. See [[f05-companies]] for the open R74 gap.

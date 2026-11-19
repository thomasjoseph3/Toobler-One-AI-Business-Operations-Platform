---
name: measure-before-optimising
description: Owner asks about unwanted re-renders and optimisation; measure first, report numbers, change only what shows
metadata:
  type: feedback
---

On 13 Nov 2026 the owner asked "are you checking for unwanted rerendering and optimisation issues as well?". Answer honestly about what
was measured. At the end of a screen, do a short measured check instead of guessing: count row renders for common actions
(a temporary counter, restored afterwards), look at the bundle size (`npm -w apps/web run build`), and time the API calls. Report the
numbers, fix only what shows, and say plainly when something is fine and why (for example 25 light rows re-rendering on a tick).

**Why:** the owner wants optimisation covered (see [[dont-overengineer-means-no-extra-complexity]]) but not speculative complexity.
**How to apply:** findings so far: panels and menus keep their state local (0 table re-renders); a tick re-renders all 25 rows (harmless);
bundle about 476 kB (144 kB gzip) in one file, so split code per page when more screens arrive; the API list cost is dominated by
the distant Supabase development database (about 2 s per call), not by React.

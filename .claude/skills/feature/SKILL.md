---
name: feature
description: The one-feature-at-a-time workflow for this project. Use to start the next feature, check progress, verify a feature before hand-off, hand it to the owner, record approval or requested changes. Use whenever the user says "next feature", "start F07", "verify", "hand off", "approved", "looks good, continue", or asks what's being built. Args - start | status | verify | handoff | approve | changes.
---

# Feature workflow

The process is in `docs/DEVELOPMENT.md`; the plan in `docs/plan/PHASE-1.md`; status in `docs/plan/STATUS.md`. This
skill makes sure every step is done and **the gate is never skipped**.

## Slices (owner rule)
Build a feature in slices of **at most 2 API routes**. After each slice explain every folder and file added or changed,
give the Postman and browser test steps, and stop until the owner has verified it. See docs/DEVELOPMENT.md "Slices".

## status
Read `docs/plan/STATUS.md`. Report the current feature, its state, and what the owner is waiting on (if anything).

## start
1. Run `npm run gate` (before F00 exists, read STATUS.md by hand). Refuse to start if any feature is `in_progress` or
   `in_review`, or any earlier feature isn't `approved`/`deferred`. Tell the owner which feature is blocking.
2. Take the first `planned` feature. Read its section in PHASE-1.md and **every requirement file it links**, plus the
   relevant parts of docs/ARCHITECTURE.md, BACKEND.md, FRONTEND.md, SECURITY.md and CONVERSATION-TYPES.md.
2b. **Reuse check:** read the hotel agent's code for this area (the "Port from" table in PHASE-1.md), only that area.
   Record reused / changed / left behind in the brief's "Reused from the hotel agent" section.
3. Check `docs/REQUIREMENTS-REVIEW.md` for open questions this feature depends on. If one is unanswered, ask the owner
   now (AskUserQuestion) with a recommended answer; don't guess on product behaviour.
4. Write `docs/features/Fxx-<slug>.md` from the template in DEVELOPMENT.md: scope (in/out), migration, endpoints with
   roles, screens (phone layout, empty states), rules, tests, **manual test script** with expected results, security
   checklist, differences from the requirements.
5. Set the feature to `in_progress` in STATUS.md with the brief's link. Create the branch `feature/Fxx-<slug>` if git exists.
6. Build in this order: migration → repository → service → routes → API tests → front end → e2e. Keep the layering
   rules; run `npm test` as you go.

## verify
All must pass; fix and re-run until they do. Never hand off with a red check.
1. `npm run verify` (gate, lint, typecheck, unit, API, isolation, e2e).
2. Start the apps (`npm run dev`) and walk the brief's manual test script yourself in a real browser
   (browser-automation or claude-in-chrome skill): phone size (375×812) and desktop (1280×800), light and dark, empty
   / loading / error states. Take screenshots into `docs/features/Fxx-<slug>/`.
3. Check the console and server log for errors and for any personal data or secrets in the log.
4. Tick the security checklist in the brief (use the `api-security` skill to review the diff). Each unticked box needs
   a written reason.
5. Check nothing was built for a later feature or phase.

## handoff
0. **Write the Feature guide** at the top of the feature's file in `docs/features/` (a `## Feature guide` section above the build log;
   F18's is the model). Plain English first, for the application's users: what it does, why it is useful, a day-in-the-life example, who
   can do what, settings and limits, what it never does, what is not part of it. Then a clearly marked "For the tech team" part: module,
   tables, routes, jobs, events, how it works inside, known limits. No jargon in the first part. If the feature changes an earlier
   feature's behaviour, update that feature's guide too.
1. Set the feature to `in_review` in STATUS.md.
2. Reply to the owner with: what was built (short); **how to test it yourself** (numbered steps, logins, expected
   results, URLs); test counts; screenshot paths; differences from the requirements; known limits.
3. **Stop.** Do not start, plan or scaffold the next feature. Wait for the owner.

## approve
Only when the owner clearly says it's approved (e.g. "approved", "go to the next feature").
1. Set `approved` and today's date in STATUS.md.
2. Commit the feature on its branch with a clear message (the owner's approval is the go-ahead to commit). Don't push
   or merge unless asked.
3. Save anything learned about the owner's preferences to memory.
4. Ask whether to start the next feature, or start it if the owner already said so.

## changes
The owner asked for changes: set the feature back to `in_progress`, list the changes in the brief under
"Review rounds", make them, then `verify` and `handoff` again.

# C2: Setup guide (UI catch-up block, R64)

**Where:** `/setup` ("Setup guide"; reached from the card on Today and from a link on Knowledge base; it has no sidebar entry because the sidebar fits a 640 px window exactly). **Uses only existing routes:** `GET /setup`, `PATCH /setup`, `POST /setup/apply-preset`, `POST /setup/go-live`, `GET /knowledge/questions`.
**Status:** built 17 Nov 2026, waiting for the owner's check. Screenshots: `docs/features/C2-setup-guide/`.

## Feature guide

**What it does.** A checklist that takes a new business from sign-up to answering customers. Part 1 teaches the AI about the business (read the website, the business profile, what you sell, how situations are handled, goals). Part 2 gets it ready for customers (how fast you call back, your leads board, team, channels, trying the agent). A progress bar says how far along you are, and a **Go live** card says exactly what is still missing, in plain words, until nothing is.

**Why it helps.** The owner is never left wondering "what next?". Each step says what it is for and takes them to the right place. Going live is a deliberate button, not something that happens by accident.

**A day in the life.** Anita opens the Today page and sees "Finish setting up: 0% done. 6 things still stop you going live." She opens the guide. She reads her website (step 1), checks the answers in the business profile, sets "call back within 20 minutes", and taps **Use my industry's words**, which renames her leads board stages to "New enquiry, Called, Rate sent". She skips "Invite your team" for now. The Go live card still lists "Try the AI agent". Once she has (screen coming next), the card says "Everything needed is done" and she presses **Go live**. Her website chat now answers real customers.

**Who can do what.** Managers do everything. Other staff see a message that setup is for managers.

**Rules.** Steps the system can check for itself (about your business, what you sell, trying the agent) have no Done button: they finish when the facts are true. The callback-time step cannot be skipped, because going live needs it. Skipping is allowed for the rest; a skipped step can be reopened. A skipped step does not count as done in the progress. Going live twice does nothing the second time.

**Never does.** It never goes live by itself, and never marks the system-checked steps for you.

**Not part of it.** Trying the agent (C3), adding what you sell (C4), channel settings (C6), team invites (F02), the setup chat (F31 slice 5).

## For the tech team
- Code: `apps/web/src/features/setup/`. Pure logic with tests: `setup-state.ts` (step words and actions, which buttons a step offers, blockers in words). Screens: `SetupPage`, `SetupStepRow`, `GoLiveCard`, `SetupChecklistCard` (on Today, managers only, hidden once live; staff never ask for `/setup`).
- `navigation.ts` has a new field `isHiddenFromMenu`; the Setup guide is in the route table and the top bar title but not in the sidebar or the phone's More list.
- Tests: 9 unit tests (`setup-state`); 28 browser tests at phone and desktop (`e2e/setup.spec.ts`) against a pretend API (`e2e/pretend-setup.ts`), including an accessibility check, and run three times in a row to catch flakiness; the shell, accessibility and Business profile tests still pass.
- Fixed on the way: the Business profile settings card lost its "Saved." message when the page reloaded after a save (it was remounted); it now keeps its state.

## Manual test script (real app, manager login, a business that is not live)
1. Open Today: a "Finish setting up" card shows with the percent and the number of things still stopping you. Press **Open the setup guide**.
2. The guide shows 0% to start (or whatever you have done), "Not live yet", "Next: …", and the steps in two parts.
3. Press **Read my website** on step 1: it takes you to Knowledge base. Come back with the browser's Back.
4. Press **Skip for now** on "Invite your team": it shows Skipped. Press **Reopen**: it shows To do.
5. Press **Mark done** on "How fast you call back". Note there is no Skip button on it.
6. Press **Use my industry's words**: a message says how many stages changed. Open Leads: the board uses the new words.
7. Look at the Go live card: it lists what is missing in words. The button is off.
8. Do what it lists (confirm the answers, and later try the agent). When the card says "Everything needed is done", press **Go live**. It says you are live, and the page shows "Live since <date>".
9. Open Today again: the setup card is gone.
10. Sign in as staff: Setup guide says it is for managers; Today shows no setup card.
11. Try it on a phone width.

## Known limits / notes for the designer
- No Figma frame exists; designed by us in the Leads screens' style (flag in docs/FRONTEND.md §5).
- The "Try the AI agent" step is finished from the Test the agent screen (C3).
- No sidebar entry yet (see above); the designer may want a place for it.

# C7: Settings → AI keys and Modules screens (UI catch-up block, R64)

**Where:** `/settings` (the Settings entry in the sidebar, "AI" tab) and `/settings/modules` ("Modules" tab). **Uses only existing routes:** `GET/PUT /ai/settings`, `GET/POST /ai/keys`, `DELETE /ai/keys/{id}`, `POST /ai/keys/{id}/test`, `GET /ai/usage`, `GET /modules`, `PATCH /modules/{id}`.
**Status:** built 17 Nov 2026, waiting for the owner's check. Screenshots: `docs/features/C7-settings-ai-and-modules/`.

## Feature guide

**AI tab.** The AI that answers your customers runs on a key from an AI company (Google Gemini, OpenAI or Anthropic). This page lets a manager decide where the key comes from and manage their own keys.
- **Which keys the AI uses:** *my own keys first, then the platform's* (the default), *only my own*, or *only the platform's*. The page warns when a choice would leave the AI with nothing to answer with (for example "only my own" with no key saved).
- **The platform's keys:** whether Toobler has switched them on for the business, the monthly allowance, how much is used this month (with a bar) and when the allowance ends.
- **Your own keys:** add a key (company, a name you will recognise, the key), **test** it (it says in words whether it works, was rejected, ran out of quota, or cannot use a model), and **delete** it (after "Are you sure?" naming it). A saved key is shown only as its last four characters and is never shown again.
- **AI use this month:** calls, failures, and how often a back-up key or model was used.

**Modules tab.** Every part of Toobler One with its state for this business: *On*, *Switched off* (hidden, data kept), *Needs connecting*, or *Not in your plan*. A manager switches a part on (at once) or off (after a question saying the data is kept). Each shows what it needs ("Needs: Lead engine"). A part that is not in the plan says to ask the platform team, because only the platform team can add it.

**Why it helps.** Keys are the one thing a business owner must bring themselves, so this page is where a business becomes independent of the platform's allowance. Modules answer "where do I switch the website chat on or off?" (see Channels).

**A day in the life.** Anita's platform allowance is nearly used up (bar at 90%). She pastes her own Gemini key, presses **Test** ("This key works (gemini-2.5-flash, 412 ms)"), and the AI now uses her key first and falls back to the platform's only if hers fails.

**Who can do what.** Managers only for AI settings (the AI routes are manager-only; staff are told so and their browsers never ask). Staff can read the Modules list; only managers switch.

**Rules.** A key has no spaces and is 16 to 400 characters; the name is 1 to 80. The key is a password box, is sent once, and is cleared from the page the moment it is saved. If a switch would break another part (a part another one needs), the API refuses and its words are shown.

**Never does.** It never shows a key after saving it, and never lets a business change the platform's allowance.

**Not part of it.** Choosing which AI model does which job (a later, advanced setting; the platform's choice is used), the platform team's own AI screens, and a per-task health view.

## For the tech team
- Code: `apps/web/src/features/settings/`: pure logic with tests (`ai-key-state.ts`, `modules-state.ts`: 10 tests) and the screens (`SettingsAiPage`, `KeyModeCard`, `AiKeysCard`, `AddKeyPanel`, `ModulesPage`, `SettingsTabs`). The manager-only part is a separate component so a non-manager's browser never asks an AI route.
- The page keeps what is on screen while it reloads, and (fixed on the way) the key-mode card no longer loses its "Saved." message when it reloads.
- Tests: 10 unit tests; 36 browser tests at phone and desktop (`e2e/settings.spec.ts`, pretend API in `e2e/pretend-settings.ts` which never keeps a key, only its preview) including: the key is a password field, is sent once and never appears in the page, accessibility on both pages; all earlier screens' tests still pass.

## Manual test script (real app, manager login)
1. Open **Settings**. You see "Which keys the AI uses", the platform's allowance and your own keys.
2. Change the mode to "Only my own keys" with no key saved: a warning says the AI cannot answer. Change it back.
3. **Add a key** with your real Gemini key. Try an empty form first (it asks for each missing thing). After saving only `••••` plus the last four characters show.
4. Press **Test** on it: it says whether it works.
5. In Test the agent, ask a question: the AI answers (on your key).
6. **Delete** a key: a box names it and asks "Are you sure?".
7. Open the **Modules** tab. Switch **Follow-ups** (or any "Switched off" one) on. Switch **Website chat** off: a box says its data is kept. Switch it back on. Check Channels while it is off: the page says it is switched off.
8. Sign in as staff: Settings → AI says only managers; Modules is readable with no buttons.

## Known limits / notes for the designer
- Designed by us in the Leads screens' style (flag in docs/FRONTEND.md §5). Single choices use plain radio inputs (proposal: a Radio component).

# C1: Business profile screen (UI catch-up block, R64)

**Where:** Knowledge base (`/knowledge`) in the staff app. **Uses only existing routes:** `GET /knowledge/questions`, `PUT /knowledge/answers/{key}`, `POST /knowledge/answers/confirm`, `GET` and `PUT /knowledge/settings`, `GET` and `PUT /knowledge/situations`, `POST /knowledge/prefill`, `GET /knowledge/prefill/{id}`. No new route.
**Status:** built 17 Nov 2026, waiting for the owner's check. Screenshots: `docs/features/C1-business-profile/`.

## Feature guide

**What it does.** One page where a business owner teaches the AI about their business. It shows how complete the profile is, lets the owner paste their website so the system can read it and suggest answers, and lists every question in its section (About your business, What you sell, Your policies...). Each answer can be typed or changed; the page picks the right kind of box for each question (words, a choice, ticks, Yes or No, opening hours for the week, or rows such as phone numbers).

**Why it helps.** The owner mostly checks instead of typing. An answer the system read from the website is marked **Please check**, says "From your website", and **the AI does not use it until the owner taps Yes**.

**A day in the life.** Anita opens Knowledge base. The card says 33% complete and lists what is still needed to go live. She types her website into "Fill this in from your website" and presses **Read my website**. A message says it is reading and she can carry on. A minute later it says "Done. We read 3 pages and found 5 answers to check." The business name, address and phone numbers now show **Please check**. She taps **Yes** on two, **Change** on the address, and **Yes to all** for the rest. She sets "call a customer back within" to 20 minutes, and the AI now promises 20 minutes in every chat.

**Who can do what.** Managers do everything. Other staff can read the page but see no buttons.

**Limits.** An upload question says uploads come later. "What do you sell?" is answered in What you sell (a later screen); the page says so. Reading is limited to 10 a day and one at a time (the API says so in plain words).

**Never does.** It never marks a website answer as confirmed by itself, and never changes an answer you already confirmed.

**Not part of it.** Adding offerings from the suggestions (C4), FAQs (C5), the setup checklist and Go live (C2), trying the agent (C3).

## For the tech team
- Code: `apps/web/src/features/knowledge/`. Pure logic with tests: `answer-draft.ts` (draft ⇄ API value for every answer type, rupees ⇄ paise), `profile-state.ts` (sections, question state, reading state, polling delays), `problem-message.ts`. Screens: `KnowledgePage`, `ProfileProgressCard`, `ReadWebsiteCard`, `BusinessSettingsCard`, `ProfileSection`, `QuestionRow`, `AnswerEditor` (+ `HoursEditor`, `ListEditor`), `SituationsCard`, `use-kept-resource.ts` (keeps the last good answer while a save reloads, so nothing blanks).
- `apiRequest` now accepts `PUT`. All words are in `i18n.ts` (`knowledge.*`).
- Tests: 24 unit tests (`answer-draft`, `profile-state`), 3 in `problem-message`; 36 browser tests at phone and desktop (`e2e/knowledge.spec.ts`) against a pretend API (`e2e/pretend-knowledge.ts`), including an accessibility check; the shell and accessibility tests for every page still pass.
- The Settings card here carries time zone, country and the callback promise (F31 slice 4).

## Manual test script (real app, manager login)
1. Open Knowledge base. You see the completeness card, "Fill this in from your website", the settings card and the sections.
2. Type your website, press **Read my website**. "Reading your website…" shows; when done, answers appear marked **Please check · From your website**. Suggested offerings are listed under the card.
3. Tap **Yes** on one answer, **Change** on another and save. The "Please check" mark goes away; the percent goes up.
4. Open opening hours: tick days, set times, save. Try a closing time before the opening time: you get a plain message and nothing is saved.
5. Add two phone numbers as rows; leave one value empty: it refuses; fill it and save.
6. Set the callback minutes to 3: it refuses; set 30 and Save. Open Test the agent later (C3) to hear "within 30 minutes".
7. Change a situation (for example "Prices are fixed"). The complaint situation is greyed out: it is the same for every business.
8. Sign in as staff: you can read everything and change nothing.
9. Resize to a phone: no sideways scrolling; the buttons are easy to tap.

## Known limits / notes for the designer
- Designed by us in the style of the Leads screens; no Figma frame exists (flag in docs/FRONTEND.md §5).
- The time zone list holds ten common zones plus the business's own.
- A reading's suggestions are shown only for the current visit; accepting them is C4.

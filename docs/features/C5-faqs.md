# C5: FAQs and unanswered questions screen (UI catch-up block, R64)

**Where:** `/knowledge/faqs` ("FAQs"), the fourth tab of the Knowledge base (Business profile, What you sell, FAQs, Test the agent). **Uses only existing routes:** `GET/POST /knowledge/faqs`, `PATCH/DELETE /knowledge/faqs/{id}`, `GET /knowledge/unanswered` (with `include=history`), `POST /knowledge/unanswered/{id}/answer` and `/dismiss`, `GET /knowledge/search`.
**Status:** built 17 Nov 2026, waiting for the owner's check. Screenshots: `docs/features/C5-faqs/`.

## Feature guide

**What it does.** Two lists and a search box. **Questions the AI could not answer** are the things customers asked that the AI had no answer for (it promised a callback instead and wrote the question here). They are shown most-asked first, with how many times and when last asked. The team can **answer** one (it becomes an FAQ and leaves the list) or **ignore** it. **Your FAQs** are the question-and-answer pairs the AI looks at first when a customer asks something; they can be added, changed and deleted. **See what the AI would find** lets anyone type a customer question and see which FAQ the AI's search would use.

**Why it helps.** The AI gets better with use: every question it could not answer is a chance to teach it once, and it never has to be asked again. Customers' own words are often rough ("pool timing??"), so when answering the team can reword the question before it becomes an FAQ.

**A day in the life.** Priya on the front desk opens FAQs and sees "Is there an EV charger?" asked 3 times. She presses **Answer**, types "Yes, two chargers in the car park, ₹15 a unit", and saves. Next time a customer asks, the AI answers from that FAQ and Test the agent shows "FAQ: Is there an EV charger?" as its source. She tries the search box with "can I charge my car?" to check the FAQ is found.

**Who can do what.** Everyone on the team, every role (owner decision, 13 Nov 2026): add, change, delete, answer, ignore. Only managers are asked for business settings elsewhere; this page is for everyone.

**Rules.** Spaces in a question are tidied. An answer keeps its line breaks. Two FAQs cannot have the same question (the API says so in plain words). A drafted FAQ (from the website) is marked "Please check" and is not used by the AI until it is saved by a person. Deleting asks "Are you sure?" and names the FAQ. Ignored and answered questions are kept: tick the box to see them.

**Never does.** It never turns a question into an FAQ without an answer typed by a person, and the AI never invents an answer to fill this list.

**Not part of it.** Documents (uploads are deferred), merging look-alike questions by hand (the API merges similar open questions every night), and a place for staff to be told when new questions arrive (alerts come with F23).

## For the tech team
- Code: `apps/web/src/features/faqs/`: pure logic with tests (`faq-form.ts`, `unanswered-state.ts`) and the screens (`FaqsPage`, `UnansweredCard`, `FaqsCard`, `FaqFormPanel`, `SearchCard`). The panel is reused for a new FAQ, an edit and an answer; the answer sends the reworded question only when it was reworded.
- Tests: 8 unit tests; 34 browser tests at phone and desktop (`e2e/faqs.spec.ts`, pretend API in `e2e/pretend-faqs.ts`) including an accessibility check.

## Manual test script (real app, any signed-in role)
1. Open Knowledge base, then **FAQs**.
2. To get something in "Questions the AI could not answer": in **Test the agent**, ask something your business has not told it (for example "Do you have a helipad?"). Come back here after a moment and reload: the question is listed.
3. Press **Answer**, check the question is filled in (reword it if you like), type an answer, **Save**. It leaves the list and shows under "Your FAQs" marked "From a customer question".
4. Press **Ignore** on another. Tick "Show answered and ignored questions" to see both, with their state.
5. **Add an FAQ**; try saving with an empty answer (it asks for one). Try adding the same question twice (the API refuses in plain words).
6. **Edit** one: change only the answer. **Delete** one: a box names it and asks "Are you sure?".
7. Use **See what the AI would find** with a customer-style question; try one nothing matches.
8. Ask the same question in Test the agent: it answers from the FAQ and names it.

## Known limits / notes for the designer
- Designed by us in the Leads screens' style (flag in docs/FRONTEND.md §5).

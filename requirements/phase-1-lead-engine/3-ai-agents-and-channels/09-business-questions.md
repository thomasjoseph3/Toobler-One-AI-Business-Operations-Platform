# Business questions

**Phase 1 · AI agents · HubSpot equivalent: none (HubSpot's customer agent needs a knowledge base written by hand)**

## What it is

A fixed list of questions that tells us everything the AI needs to know about a business. Every business answers the
same **general questions**, plus a few **extra questions for its industry**. We pre-fill as many answers as we can from
the business's website, Google listing, Instagram page or uploaded documents, so the owner mostly checks rather than
types.

The answers become the business profile and situations in the [knowledge base](08-knowledge-base.md).

## Why it matters

Small business owners don't know what an AI needs to be told. A fixed list makes sure nothing important is missed, and
lets us measure how complete a business's information is. Pre-filling makes it quick.

## How it works

1. During setup, the questions are asked one at a time in a friendly chat (see
   [setup wizard](../5-onboarding-and-launch/03-setup-wizard.md)). Later, the same questions appear as a form under
   **Knowledge base → Business profile**.
2. A pre-filled answer is shown with where it came from: "From your website: Open 9 AM to 9 PM, every day. Is this
   right?" with **Yes** and **Change**.
3. Most questions have ready options to tap, with **Other** to type something else.
4. Questions marked **Needed to go live** must be answered before the AI answers real customers. All others can be
   answered later; the completeness score shows what's left.

**Answer types:** short text, longer text, pick one, pick several, yes/no, weekly hours, list (add rows), price,
link, file upload.

### General questions (every business)

**A. Where can we learn about you?**

| # | Question | Answer type | Needed to go live |
| --- | --- | --- | --- |
| A1 | Do you have a website? | Yes (enter link) / No | Yes |
| A2 | Are you on any of these? Google Maps, Instagram, Facebook, JustDial, IndiaMART | Pick several, a link for each | No |
| A3 | Do you have a brochure, rate card, menu or price list? Upload it, or take a photo. | File upload | No |

**B. About your business**

| # | Question | Answer type | Pre-filled from | Needed to go live |
| --- | --- | --- | --- | --- |
| B1 | What do customers call your business? | Short text | Website, listings | Yes |
| B2 | What does your business do, in one or two lines? | Longer text | Website, listings | Yes |
| B3 | Address, with a landmark | Longer text, map pin | Google listing, website | Yes |
| B4 | Phone numbers and email customers can use | List | Website, listings | Yes |
| B5 | Opening hours, and days you're closed | Weekly hours | Google listing, website | Yes |
| B6 | Which languages do your customers speak? | Pick several: Malayalam, English, Hindi | Industry and location | Yes |
| B7 | Who are your usual customers? (families, companies, students...) | Pick several, with Other | Website | No |

**C. What you sell**

| # | Question | Answer type | Pre-filled from | Needed to go live |
| --- | --- | --- | --- | --- |
| C1 | What do you sell? Name, short description, "from" price, unit, what's included | List | Website, uploads | At least one, or "We don't share prices" |
| C2 | Do your prices include GST? | Included / Plus GST / No GST | Website, uploads | Yes, if prices are given |
| C3 | Do prices change by season or day? | No / Yes, describe in words ("higher in Dec–Jan") | Website | No |
| C4 | Do you have any offers running now? | No / Yes, describe with end date | Website | No |
| C5 | Is there a minimum order, or an advance to pay? | Longer text | Website, uploads | No |
| C6 | How can customers pay? | Pick several: UPI, card, cash, bank transfer | Website | No |

**D. Your policies**

| # | Question | Answer type | Pre-filled from | Needed to go live |
| --- | --- | --- | --- | --- |
| D1 | Cancellation and refund policy | Longer text | Website, uploads | No |
| D2 | Anything else customers often ask? (parking, documents needed, age limits...) | List of question and answer | Website (FAQ page) | No |
| D3 | Is there anything the AI must never tell customers? | Longer text | — | No |

**E. How you handle situations**

Each has a sensible choice already picked, so the owner can accept them all in one tap.

| # | When this happens | Choices (first is picked by default) |
| --- | --- | --- |
| E1 | A customer asks for a discount | Staff will call with the best price / Prices are fixed / Tell them our current offer |
| E2 | You don't have what they want, or you're full | Take details, staff call back / Suggest something similar we have |
| E3 | A customer asks to speak to a person | Transfer during office hours, otherwise promise a callback / Always promise a callback |
| E4 | A customer complains | Apologise, pass to the manager, raise a ticket (fixed) |
| E5 | A customer asks for an exact final price | Give the "from" price and say staff will confirm the exact price (fixed in Phase 1) |
| E6 | The AI doesn't know the answer | Say the team will call back, and log the question (fixed) |
| E7 | A customer calls after hours | Promise a call at opening time and offer details on WhatsApp / Promise a call at opening time only |

**F. Your goals**

| # | Question | Answer type | Used for |
| --- | --- | --- | --- |
| F1 | What matters most to you? | Pick up to two: answer every enquiry / call back faster / cover nights and weekends / know which leads are hot | What the Today page and reports show first |
| F2 | About how many enquiries do you get in a month? | Number range | "Before and after" in reports |
| F3 | How fast do you usually call back today? | Within an hour / Same day / Next day / Not always | "Before and after" in reports |

**G. Tax and legal** (not needed to go live)

| # | Question | Answer type |
| --- | --- | --- |
| G1 | Registered business name | Short text |
| G2 | GST number | Short text, checked for the right format |
| G3 | Billing address, if different | Longer text |

The GST number goes on our invoices to the business, and is told to customers only if they ask for it.

**H. Competitors** (optional)

| # | Question | Answer type |
| --- | --- | --- |
| H1 | Who are your main competitors? Up to three websites or listings. | List of links |

These are only used for the owner's [competitor report](../5-onboarding-and-launch/07-competitor-report.md).

### Extra questions per industry (examples)

| Industry | Extra questions |
| --- | --- |
| Hotel or homestay | Check-in and check-out times; room types; meal plans; pets; parking; nearby places |
| Travel agent | Destinations; group or private tours; visa help; pick-up points |
| Clinic | Doctors and their timings; consultation fee; appointment needed or walk-in; insurance |
| Car dealer | Brands and models; test drives; exchange of old cars; finance options |
| School or coaching | Classes or courses; admission months; fee structure; transport |
| Wedding planner | Services; cities covered; guest count range; how far ahead to book |
| Real estate | Projects; locations; property types; price range; site visits |
| Any other business | No extra questions; the general ones are enough |

## Rules

- The AI never asks the owner a question that isn't on the list. It may ask a short follow-up only to make an answer
  clear ("Is ₹2,000 per person or per room?").
- A pre-filled answer is not used until the owner confirms it.
- Every answer can be changed later from **Knowledge base → Business profile**.
- New questions are added by us, not by businesses, so every business can be measured the same way. Businesses add
  their own details as FAQs.

## Screens

- **In setup:** the questions as a chat, one at a time, with tap-to-answer options (see
  [setup wizard](../5-onboarding-and-launch/03-setup-wizard.md)).
- **Knowledge base → Business profile:** the same questions as a form in sections A–H, each answer showing its source
  and **Please check** if not yet confirmed.

## Done when

- [ ] Every general question and the extras for each listed industry can be answered in the chat and in the form.
- [ ] For 8 of 10 real test websites, at least half the B and C answers are pre-filled correctly.
- [ ] The business can't go live until every "Needed to go live" question is answered.
- [ ] The completeness score updates as answers are added.

## For developers

- **Code folder:** `apps/api/src/core/knowledge/questions`
- **API:** [API.md](../../API.md), Phase 1 → Knowledge base
- **Question set:** defined in code, `questions/general.ts` plus one file per industry; each question has `key`,
  `section`, `text`, `type`, `options`, `needed_to_go_live`, `prefill_from`, `used_for`. Answers in
  `business_answers` (see [knowledge base](08-knowledge-base.md)).
- **Pre-filling:** website reader (several pages: home, about, rooms or services, contact, FAQ), Google Places API for
  Google listings, best-effort reading of public Instagram, Facebook, JustDial and IndiaMART pages, and document
  reading. Each pre-filled answer keeps its source.
- **Tests:** each question type saves and validates; pre-fill never marks an answer confirmed.

## Open questions

- Reading Instagram, JustDial and IndiaMART pages may be blocked or against their terms. If so, we ask those questions
  instead. Check before building.

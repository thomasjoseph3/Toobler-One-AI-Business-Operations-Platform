# Free "what you're missing" check

**Phase 1 · Onboarding · HubSpot equivalent: Free tools and graders (Website Grader, AEO Grader)**

## What it is

A free, 3-minute questionnaire on our website, with no login. A business owner answers a few questions and gets a
report of how much money they lose from late or missed enquiries, sent to their WhatsApp.

## Why it matters

It shows the owner the problem in rupees before asking them to sign up. It is the front door of the product.

## How it works

1. Owner answers: enquiries per month, how many come after hours, how many get answered late, average sale value, how
   many enquiries become sales.
2. The page works out, in code: "You may be losing about ₹1,20,000 a month in enquiries answered late or not at all."
3. "Send me this report": they enter their WhatsApp number and get a 6-digit code to confirm it.
4. The report arrives on WhatsApp. A **Save it** button creates their account (see [sign-up](02-sign-up-and-sign-in.md)).

## Rules

- All sums are done in code, with the formula shown under the result.
- The phone number is used only to send the report and, if they agree, one follow-up.

## Done when

- [ ] The check works on a phone with no login.
- [ ] The rupee figure matches the formula for test inputs.
- [ ] The report arrives on WhatsApp within a minute.

## For developers

- **Code folders:** `apps/api/src/core/public`, `apps/site` (check page)
- **API:** [API.md](../../API.md), Phase 1 → Free "what you're missing" check
- **Template:** WhatsApp Authentication template for the code; Utility template for the report.

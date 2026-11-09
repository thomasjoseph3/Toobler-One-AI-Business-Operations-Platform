# Deal scoring and next steps

**Phase 2 · Sales tools · HubSpot equivalent: Deal scoring, Deal progression, AI guided selling**

## What it is

After every conversation the AI suggests the next best step ("Send the wedding brochure", "Call before Friday, dates are
close") and gives each open lead a likelihood to win, with reasons.

## How it works

1. After Priya's call, the lead shows "Next: send quote for 2 rooms 20–23 Dec" with **Do it** and **Dismiss**.
2. Each lead shows "Likely to win: high. Asked price twice, dates in 3 weeks, replied within an hour."

## Rules

- The likelihood is worked out by code from facts (replies, speed, stage, dates, past wins), with the facts shown.
- Suggestions never act without a person's tap, unless a business turns that on.

## Done when

- [ ] Suggestions appear after each conversation; scores show their reasons.

## For developers

- **Code folder:** `apps/api/src/engines/sales/deal-scoring`
- **API:** [API.md](../../API.md), Phase 2 → Deal scoring and next steps
- **Code:** `deal-scoring/score.ts`; suggestions written when a conversation ends, in `agents/runtime`.

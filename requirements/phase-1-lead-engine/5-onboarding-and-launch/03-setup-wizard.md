# Setup wizard

**Phase 1 · Onboarding · HubSpot equivalent: Onboarding, Guided setup**

## What it is

A guided setup after sign-up. Our AI chats with the owner, asks the [business questions](../3-ai-agents-and-channels/09-business-questions.md)
one at a time with options to tap, fills in what it can from the website or listings, and builds the
[knowledge base](../3-ai-agents-and-channels/08-knowledge-base.md). It ends with the owner hearing the AI answer their
own phone.

## Why it matters

Small business owners are busy and not technical. A chat that asks simple questions, already knows half the answers,
and lets them tap instead of type is the difference between a business that goes live today and one that never
finishes setup.

## How it works

The setup has two parts and a progress bar.

### Part 1: Teach the AI about your business

| Step | What happens |
| --- | --- |
| 1. Where can we learn about you? | "Do you have a website?" **Yes:** paste the link. **No:** "Are you on Google Maps, Instagram, Facebook, JustDial or IndiaMART?" Paste a link. **None:** we'll ask the questions instead. While the owner carries on, we read what they gave us. |
| 2. Anything else to read? | "Do you have a brochure, rate card, menu or price list?" Upload a file or take a photo. **Skip** is fine. |
| 3. About your business | Questions B1–B7: name, what you do, address, contacts, hours, languages. Pre-filled answers appear as "From your website: … Is this right?" with **Yes** and **Change**. |
| 4. What you sell | Your offerings with "from" prices, as found. Add, change or remove. Then: GST included or extra, seasonal prices, current offers, payment methods. |
| 5. How should the AI handle these? | The situations (discount request, fully booked, asks for a person, complaint, after hours), each with a sensible choice already picked. **Accept all** or change any. |
| 6. Your goals | What matters most, enquiries a month, how fast you call back today. Three taps. |
| 7. Check | A short summary of what the AI will tell customers, with "from" prices and the GST note. Fix anything wrong. **Test the agent** opens a chat to try it. |

### Part 2: Get ready to answer customers

| Step | What happens |
| --- | --- |
| 8. Promises and alerts | How fast staff will call back during office hours (e.g. 15 minutes), and the WhatsApp number that gets alerts |
| 9. Your pipeline | The industry's suggested stages and fields. Accept or change. |
| 10. Team | Invite staff. **Skip** is fine. |
| 11. Channels | Phone forwarding codes, connect WhatsApp, copy website chat code, connect email. Each can be skipped. |
| 12. Test call | "Call your own number now." The owner hears the AI answer with their business's details. **The business is live.** |

**Optional, any time:** "Who are your main competitors?" for the [competitor report](07-competitor-report.md). It's
offered after step 6 and runs in the background.

**After the wizard:** anything skipped or not yet answered shows on a **setup checklist** card on the Today page, with
the completeness score, until done.

**Two ways to answer:** the chat is the default. A **Switch to form** link shows the same questions as a form for
owners who prefer it. Both save the same answers.

## Rules

- The AI asks only the business questions, in order, and skips any already answered. It may ask a short follow-up to
  make an answer clear, nothing else.
- Every pre-filled answer must be confirmed by the owner before the AI uses it.
- Every step can be left and resumed later, on a computer or a phone.
- The business doesn't go live (answer real customers) until every question marked "Needed to go live" is answered and
  step 8 is done.
- The setup speaks the owner's language: Malayalam, English or Hindi.

## Screens

- **Setup chat:** full screen on a phone. The AI's questions on the left, the owner's answers on the right. Tap-to-answer
  option buttons under each question, a text box, an **Upload** button and a microphone button. A progress bar at the
  top.
- **What the AI knows so far:** on a computer, a side panel that fills in live as answers come in, with the
  completeness score. On a phone, a tab at the top of the chat.
- **Pre-filled answer card:** the answer, where it came from ("From your website"), **Yes** and **Change**.
- **Reading in progress:** a friendly "Reading your website…" message while the owner carries on with other questions.
- **Check step:** the summary as a short card list, each with **Change**.
- **Test call step:** our number in large type, a **Call now** button on a phone, and a live tick when the call arrives.
- **Setup checklist card** on the Today page.

## Done when

- [ ] With a website or Google listing, a new owner goes from sign-up to a working test call in under 15 minutes,
      without help.
- [ ] Without any website or listing, it takes under 20 minutes.
- [ ] For 8 of 10 real test websites, at least half the business and offering answers are pre-filled correctly.
- [ ] Unconfirmed answers are never used by the AI.
- [ ] The chat and the form save the same answers.
- [ ] Skipped steps show on the checklist.

## Better than HubSpot

- A chat that asks simple questions in the owner's language, with most answers already filled in, instead of setup
  screens and a knowledge base to write.

## For developers

- **Code folder:** `apps/api/src/core/setup`
- **API:** [API.md](../../API.md), Phase 1 → Setup wizard and Knowledge base
- **Setup chat:** a small agent in `agents/setup` that walks the question set in order, offers each question's options,
  turns free-text replies into answers, and saves them through the same API as the form. It has no other tools.
- **Pre-filling:** runs as background jobs; answers arrive in the chat as they are found.
- **Presets:** `core/industries/<industry>.ts` (stages, fields, wording, extra questions); any industry without its own
  file uses the general preset.
- **Column:** `accounts.setup_progress` (jsonb).

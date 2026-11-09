# Phone calls

**Phase 1 · Channels · HubSpot equivalent: Calling, Call tracking, Call recording and transcription**

## What it is

The AI answers the business's phone calls. The business keeps its own number and **forwards** calls to a number we give
it: when the line is busy, unanswered, or after hours. Every call is recorded, transcribed and summarised.

## Why it matters

In India most enquiries still come by phone. A missed call is usually a lost customer, because they ring the next
business on the list.

## How it works

1. During setup we give the business a number. The setup screen shows the code to dial on their phone to forward calls
   (e.g. forward when busy or unanswered).
2. Priya calls the business at 10 PM. Nobody answers, so the call forwards to our number.
3. Our number tells us which business it is. The AI greets her in the business's name, in her language.
4. The caller's number arrives with the call, so the contact has a phone from the first second.
5. After the call: recording, transcript, summary, lead, task.

**Transfer to a person:** during office hours, if the customer asks for a person, the AI can transfer to a staff
number the business sets. If nobody picks up, the AI takes over again and promises a callback.

## Rules

- Calls are recorded only after the AI says the call may be recorded.
- Very short silent calls are filtered out (see [scoring](../2-crm-core/07-lead-scoring-and-filtering.md)).
- A call longer than the set limit ends politely with a callback promise.

## Screens

- **Channels → Phone:** our number, forwarding status (last forwarded call), forwarding codes, transfer number, test
  call button.

## Done when

- [ ] A forwarded call is answered within two rings, in the right business's name.
- [ ] Recording, transcript and summary appear on the timeline within one minute of hang-up.
- [ ] Transfer to a person works, and falls back to the AI if unanswered.

## Better than HubSpot

- HubSpot's calling is for staff to make calls. Ours answers incoming calls with AI, any hour, in Malayalam, Hindi or English.

## For developers

- **Code folders:** `apps/api/src/channels/telephony`, `apps/api/src/agents/voice`
- **API:** [API.md](../../API.md), Phase 1 → Phone calls
- **Provider:** Exotel (Indian numbers and KYC) or Twilio; both stream call audio to a WebSocket. Audio is converted
  between 8 kHz and 16/24 kHz for Gemini Live.
- **Code:** `agents/voice` (live session, call control, recording, transcript); one bridge per provider in
  `channels/telephony/<provider>.ts`.
- **Tables:** `phone_numbers` (number → business), `calls`.
- **Agent tools:** `transfer_call`, `end_call`.

## Open questions

- Exotel or Twilio? Owner to decide before step 6.

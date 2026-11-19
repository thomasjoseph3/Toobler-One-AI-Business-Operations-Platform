---
name: f29-web-call-first-twilio-later
description: Owner decision 18 Nov 2026 - F29 builds the web call (browser voice) now; phone calls via Twilio are coded but not connected until later
metadata:
  type: project
---

Owner said (18 Nov 2026): do the **web call only for now**; set up phone calls later, but **write the code and everything for it**, probably **Twilio**.

**Why:** a phone provider account is not ready; this settles R2 (phone provider) as "Twilio, probably" without connecting it.
**How to apply:** at F29, build the web call end to end and the phone channel code (Twilio adapter, webhooks, number setup, each business's own encrypted keys per [[voice-uses-business-own-keys]]) behind the same ChannelAdapter, switched off/unconnected. Record it in the F29 brief and REQUIREMENTS-REVIEW. Also: WhatsApp (F25) and email (F26) already exist in `../hotel agent`; port them (read that code at the start of each feature), owner wants F25/F26 soon.

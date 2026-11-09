# Contracts and e-signature

**Phase 2 · Selling · HubSpot equivalent: Contracts, E-signature**

## What it is

A quote or agreement the customer signs online. The signed copy is saved on the lead, with the time and the signer's
details.

## How it works

1. Rahul attaches terms to a quote and turns on "Signature needed".
2. The customer types their name and confirms with a code sent to their phone (Aadhaar e-sign for businesses that need
   it).
3. The signed PDF is saved and sent to both sides.

## Done when

- [ ] A signed quote has a tamper-proof PDF with the signature record.

## For developers

- **Code folder:** `apps/api/src/engines/sales/signatures`
- **API:** [API.md](../../API.md), Phase 2 → Contracts and e-signature
- **Tables:** `signatures` (`quote_id`, `signer_name`, `phone`, `ip`, `signed_at`, `document_hash`).
- **Provider:** our own code-based signing first; an Aadhaar e-sign provider later.

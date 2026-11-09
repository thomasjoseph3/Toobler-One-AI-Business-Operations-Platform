# Website builder and hosting

**Phase 6 · Content · HubSpot equivalent: Drag-and-drop website builder, AI website generator, Themes, Free hosting, Multiple sites, Remove branding**

## What it is

The AI builds a full website from the business info and offerings. The owner edits it by dragging blocks, picks a theme,
and publishes on their own domain. Hosting, HTTPS, chat bubble, WhatsApp button and enquiry forms are built in.

## Why it matters

Many small businesses have no website, or an old one. A good site that feeds the CRM brings more enquiries.

## How it works

1. Owner clicks **Build my website**. The AI drafts Home, Offerings, About, Contact, Help pages.
2. Owner edits text and photos, picks a theme, connects `www.business.com`.
3. Enquiries from the site land in the CRM with source "website".

## Done when

- [ ] Generated sites score well on Google's speed test on phones and publish on custom domains.
- [ ] Paid plans remove our branding; one business can run several sites.

## For developers

- **Code folder:** `apps/api/src/engines/content/sites`
- **API:** [API.md](../API.md), Phase 6 → Website builder and hosting
- **Code:** `apps/site` renders every site; the page builder is shared with
  Phase 4 landing pages; `sites`, `pages`, `themes`, `domains` tables; automatic HTTPS certificates.

# HubSpot coverage: every feature and where we build it

This is the checklist that nothing is missed. Every HubSpot product feature (as listed on hubspot.com on 6 Nov 2026) is
mapped to the file in this folder that covers it. If HubSpot adds a feature, add a row here and a file in the right
phase.

Short names: P1 = [phase-1-lead-engine](phase-1-lead-engine), P2 = [phase-2-sales-engine](phase-2-sales-engine), and so
on.

## Smart CRM (HubSpot's free core)

| HubSpot feature | Our file | Phase |
| --- | --- | --- |
| Contacts, contact management | [contacts](phase-1-lead-engine/2-crm-core/01-contacts.md) | 1 |
| Lifecycle stages | [contacts](phase-1-lead-engine/2-crm-core/01-contacts.md) | 1 |
| Companies | [companies](phase-1-lead-engine/2-crm-core/02-companies.md) | 1 |
| Associations | [companies](phase-1-lead-engine/2-crm-core/02-companies.md), [custom objects](phase-5-automation-and-data/02-custom-objects.md) | 1, 5 |
| Leads object, lead management | [leads and board](phase-1-lead-engine/2-crm-core/03-leads-and-pipeline-board.md) | 1 |
| Deals, deal board, pipeline management | [leads and board](phase-1-lead-engine/2-crm-core/03-leads-and-pipeline-board.md) | 1 |
| Activity timeline, notes, call logging | [timeline and notes](phase-1-lead-engine/2-crm-core/04-activity-timeline-and-notes.md) | 1 |
| Tasks, task queues | [tasks](phase-1-lead-engine/2-crm-core/05-tasks-and-reminders.md) | 1 |
| Custom properties, required fields | [custom fields](phase-1-lead-engine/2-crm-core/06-custom-fields.md) | 1 |
| Contact scoring, lead scoring | [scoring](phase-1-lead-engine/2-crm-core/07-lead-scoring-and-filtering.md) | 1 |
| Saved views, lists, global search | [views and search](phase-1-lead-engine/2-crm-core/08-views-filters-and-search.md) | 1 |
| CRM import, export | [import and export](phase-1-lead-engine/2-crm-core/09-import-and-export.md) | 1 |
| Duplicate management | [duplicates](phase-1-lead-engine/2-crm-core/10-duplicates-and-merging.md), [data quality](phase-5-automation-and-data/04-data-quality.md) | 1, 5 |
| User management, teams | [users and roles](phase-1-lead-engine/1-foundation/02-users-roles-and-teams.md) | 1 |
| Reporting dashboard | [reports](phase-1-lead-engine/4-staff-workspace/05-reports-and-dashboard.md) | 1 |
| Shared inbox | [inbox](phase-1-lead-engine/4-staff-workspace/02-inbox.md) | 1 |
| Ticketing | [tickets](phase-1-lead-engine/4-staff-workspace/06-tickets.md), [help desk](phase-3-service-engine/01-help-desk-and-ticket-pipelines.md) | 1, 3 |
| Breeze Assistant, Breeze Copilot | [staff assistant](phase-1-lead-engine/4-staff-workspace/07-staff-assistant.md) | 1 |
| Chatbot builder, live chat | [website chat](phase-1-lead-engine/3-ai-agents-and-channels/05-website-chat.md), [agent](phase-1-lead-engine/3-ai-agents-and-channels/02-how-the-agent-behaves.md) | 1 |
| Calculated properties | [calculated fields](phase-5-automation-and-data/03-calculated-fields.md) | 5 |
| Custom objects, record page layouts | [custom objects](phase-5-automation-and-data/02-custom-objects.md) | 5 |
| Custom reporting | [report builder](phase-5-automation-and-data/07-custom-report-builder.md) | 5 |
| Data sync | [integrations](phase-5-automation-and-data/05-integrations-and-data-sync.md) | 5 |
| Permission sets, field-level permissions, SSO | [advanced permissions](phase-7-ai-and-scale/06-advanced-permissions-sso-and-sandbox.md) | 7 |
| Multiple currencies | [currencies and languages](phase-7-ai-and-scale/07-currencies-and-languages.md) | 7 |
| Mobile app | [mobile app](phase-7-ai-and-scale/05-mobile-app.md) | 7 |
| Remove HubSpot branding | [website builder](phase-6-content-engine/01-website-builder-and-hosting.md), [white label](phase-7-ai-and-scale/09-white-label-and-partners.md) | 6, 7 |
| Audit log, data privacy tools | [security and audit](phase-1-lead-engine/1-foundation/04-security-privacy-and-audit.md) | 1 |

## Sales Hub

| HubSpot feature | Our file | Phase |
| --- | --- | --- |
| Calling, call recording | [phone calls](phase-1-lead-engine/3-ai-agents-and-channels/03-phone-calls.md) (incoming), [staff calling](phase-2-sales-engine/2-sales-team-tools/05-staff-calling-and-call-logging.md) (outgoing) | 1, 2 |
| Power dialer, call tracking, call outcomes | [staff calling](phase-2-sales-engine/2-sales-team-tools/05-staff-calling-and-call-logging.md) | 2 |
| AI guided selling, prospecting workspace | [Today page](phase-1-lead-engine/4-staff-workspace/01-today-page.md), [next steps](phase-2-sales-engine/2-sales-team-tools/10-deal-scoring-and-next-steps.md) | 1, 2 |
| Sequences, sales automation | [follow-ups](phase-1-lead-engine/4-staff-workspace/04-follow-ups.md), [sequences](phase-2-sales-engine/2-sales-team-tools/02-sequences.md) | 1, 2 |
| Meeting scheduler | [meeting scheduler](phase-2-sales-engine/2-sales-team-tools/01-meeting-scheduler.md) | 2 |
| Email templates, snippets, scheduling, AI email writer | [templates](phase-2-sales-engine/2-sales-team-tools/03-email-templates-and-scheduling.md) | 2 |
| Email tracking, Gmail/Outlook, sales extensions | [email tracking](phase-2-sales-engine/2-sales-team-tools/04-email-tracking-and-mail-extensions.md) | 2 |
| Documents, document tracking | [document sharing](phase-2-sales-engine/2-sales-team-tools/06-document-sharing.md) | 2 |
| Playbooks | [playbooks](phase-2-sales-engine/2-sales-team-tools/07-playbooks.md) | 2 |
| Deal plans, buying groups, target accounts | [deal plans](phase-2-sales-engine/2-sales-team-tools/08-deal-plans-and-buying-groups.md) | 2 |
| Forecasting, goals, quotas, deal splits | [forecasting](phase-2-sales-engine/2-sales-team-tools/09-forecasting-and-goals.md) | 2 |
| Deal scoring, deal progression | [deal scoring](phase-2-sales-engine/2-sales-team-tools/10-deal-scoring-and-next-steps.md) | 2 |
| Products library | [products](phase-2-sales-engine/1-selling/01-products-and-price-lists.md) | 2 |
| Sales analytics | [reports](phase-1-lead-engine/4-staff-workspace/05-reports-and-dashboard.md), [revenue reports](phase-2-sales-engine/1-selling/09-revenue-reporting.md) | 1, 2 |
| Conversation intelligence, methodology scoring, notetaker, coaching | [call coaching](phase-7-ai-and-scale/04-call-coaching.md) | 7 |

## Revenue Hub (formerly Commerce Hub)

| HubSpot feature | Our file | Phase |
| --- | --- | --- |
| Quotes, CPQ | [quotes](phase-2-sales-engine/1-selling/02-quotes.md) | 2 |
| Quote rules, quote approvals, discount guardrails | [quote rules](phase-2-sales-engine/1-selling/03-quote-rules-and-approvals.md) | 2 |
| Payment links, payments | [payments](phase-2-sales-engine/1-selling/04-payment-links-and-payments.md) | 2 |
| Carts, orders, appointments | [bookings](phase-2-sales-engine/1-selling/05-bookings-and-cancellations.md) | 2 |
| Invoices, automated sales tax, revenue agent | [invoices and tax](phase-2-sales-engine/1-selling/06-invoices-and-tax.md) | 2 |
| Subscriptions, subscription billing | [subscriptions](phase-2-sales-engine/1-selling/07-subscriptions-and-recurring-billing.md) | 2 |
| Contracts, e-signature | [contracts](phase-2-sales-engine/1-selling/08-contracts-and-e-signature.md) | 2 |
| Revenue reporting, revenue analytics | [revenue reports](phase-2-sales-engine/1-selling/09-revenue-reporting.md) | 2 |
| External revenue integrations | [integrations](phase-5-automation-and-data/05-integrations-and-data-sync.md) | 5 |

## Service Hub

| HubSpot feature | Our file | Phase |
| --- | --- | --- |
| Help desk workspace, multiple ticket pipelines | [help desk](phase-3-service-engine/01-help-desk-and-ticket-pipelines.md) | 3 |
| Omnichannel communication, team email | [inbox](phase-1-lead-engine/4-staff-workspace/02-inbox.md), [email](phase-1-lead-engine/3-ai-agents-and-channels/06-email.md) | 1 |
| Skill-based routing, conversation routing | [routing](phase-3-service-engine/02-routing-and-skills.md) | 3 |
| SLA management, conditional SLAs | [SLAs](phase-3-service-engine/03-slas.md) | 3 |
| Simple ticket automation, automated customer service | [ticket automation](phase-3-service-engine/04-ticket-automation.md) | 3 |
| Knowledge base, Knowledge Base Agent | [knowledge base](phase-1-lead-engine/3-ai-agents-and-channels/08-knowledge-base.md), [help articles](phase-3-service-engine/05-knowledge-base.md) | 1, 3 |
| Customer portal | [customer portal](phase-3-service-engine/06-customer-portal.md) | 3 |
| Feedback surveys (NPS, CSAT, CES) | [surveys](phase-3-service-engine/07-feedback-surveys.md) | 3 |
| Customer success workspace, health score | [customer success](phase-3-service-engine/08-customer-success-and-health-scores.md) | 3 |
| Phone trees, call routing | [phone menu](phase-3-service-engine/09-phone-menu-and-call-routing.md) | 3 |
| Service analytics, customer journey analytics | [service reports](phase-3-service-engine/10-service-reports.md), [attribution](phase-4-marketing-engine/14-attribution-and-marketing-reports.md) | 3, 4 |
| Agent knowledge gaps | [knowledge base](phase-1-lead-engine/3-ai-agents-and-channels/08-knowledge-base.md) (unanswered questions), [suggested answers](phase-3-service-engine/11-agent-knowledge-gaps.md) | 1, 3 |

## Marketing Hub

| HubSpot feature | Our file | Phase |
| --- | --- | --- |
| Marketing contacts, subscription types, consent | [consent](phase-4-marketing-engine/01-consent-and-marketing-contacts.md) | 4 |
| Forms, form shortening | [forms](phase-4-marketing-engine/02-forms.md) | 4 |
| Landing pages, A/B testing | [landing pages](phase-4-marketing-engine/03-landing-pages.md) | 4 |
| Tracking code, audience segments (anonymous), behavioural events | [website tracking](phase-4-marketing-engine/04-website-tracking-and-visitor-intent.md) | 4 |
| Lists, segments, lookalike lists | [segments](phase-4-marketing-engine/05-segments-and-lists.md) | 4 |
| Mobile messaging (WhatsApp, SMS) | [WhatsApp and SMS campaigns](phase-4-marketing-engine/06-whatsapp-and-sms-campaigns.md) | 4 |
| Email marketing, AI-powered emails, smart send times | [email marketing](phase-4-marketing-engine/07-email-marketing.md) | 4 |
| Marketing automation, Nurture Agent | [nurture](phase-4-marketing-engine/08-nurture-automation.md) | 4 |
| Campaigns, Campaign Agent, Marketing Studio | [campaigns](phase-4-marketing-engine/09-campaigns.md) | 4 |
| Ads, ad audiences | [ads](phase-4-marketing-engine/10-ads.md) | 4 |
| Social media management, Messenger and Instagram inbox | [social media](phase-4-marketing-engine/11-social-media.md) | 4 |
| Personalisation, dynamic content | [personalisation](phase-4-marketing-engine/12-personalisation.md) | 4 |
| Marketing events, webinars | [events](phase-4-marketing-engine/13-marketing-events.md) | 4 |
| Marketing analytics, multi-touch attribution, Pathfinder | [attribution](phase-4-marketing-engine/14-attribution-and-marketing-reports.md) | 4 |
| Customer Agent | [agent](phase-1-lead-engine/3-ai-agents-and-channels/02-how-the-agent-behaves.md) | 1 |
| Prospecting Agent | [prospecting agent](phase-7-ai-and-scale/03-prospecting-agent.md) | 7 |

## Content Hub

| HubSpot feature | Our file | Phase |
| --- | --- | --- |
| CMS, drag-and-drop website builder, AI website generator, themes, hosting, multiple sites | [website builder](phase-6-content-engine/01-website-builder-and-hosting.md) | 6 |
| Blog, AI blog writer, Content Agent, blog research agent | [blog](phase-6-content-engine/02-blog-and-ai-writer.md) | 6 |
| SEO recommendations, AEO, AEO Grader, AI Search Sensor | [SEO and AI search](phase-6-content-engine/03-seo-and-ai-search-visibility.md) | 6 |
| Video marketing, podcasts | [video and podcasts](phase-6-content-engine/04-video-and-podcasts.md) | 6 |
| Brand voice, content remix, repurposing | [brand voice](phase-6-content-engine/05-brand-voice-and-content-remix.md) | 6 |
| Memberships, content approvals, multi-language content | [memberships](phase-6-content-engine/06-memberships-and-content-approvals.md) | 6 |
| Lead generation forms, landing pages, dynamic content | see Marketing Hub rows | 4 |

## Data Hub (formerly Operations Hub)

| HubSpot feature | Our file | Phase |
| --- | --- | --- |
| Workflows, programmable automation, webhooks in workflows | [workflows](phase-5-automation-and-data/01-workflows.md) | 5 |
| Data quality overview, formatting automation | [data quality](phase-5-automation-and-data/04-data-quality.md) | 5 |
| Data sync, cloud data storage integrations | [integrations](phase-5-automation-and-data/05-integrations-and-data-sync.md) | 5 |
| Data Studio, datasets, dashboards | [report builder](phase-5-automation-and-data/07-custom-report-builder.md) | 5 |
| API, webhooks, developer tools, Marketplace | [public API](phase-5-automation-and-data/06-public-api-webhooks-and-app-store.md) | 5 |
| Connector for Claude, ChatGPT connector, MCP | [AI connectors](phase-5-automation-and-data/08-ai-connectors.md) | 5 |

## Agent Hub and AI

| HubSpot feature | Our file | Phase |
| --- | --- | --- |
| Agent Hub, Agent Builder, AI Studio | [agent builder](phase-7-ai-and-scale/01-agent-builder.md) | 7 |
| Data Agent | [staff assistant](phase-1-lead-engine/4-staff-workspace/07-staff-assistant.md), [data agent](phase-7-ai-and-scale/02-data-agent.md) | 1, 7 |
| Customer, Nurture, Campaign, Content, Prospecting, Revenue, Knowledge Base agents | in the rows above | 1–7 |

## Platform, plans and programmes

| HubSpot feature | Our file | Phase |
| --- | --- | --- |
| Free, Starter, Professional, Enterprise editions; Small Business Bundle | [engines and plans](phase-1-lead-engine/1-foundation/03-engines-and-plans.md), [billing](phase-1-lead-engine/5-onboarding-and-launch/04-subscription-billing.md) | 1 |
| Onboarding, guided setup | [setup wizard](phase-1-lead-engine/5-onboarding-and-launch/03-setup-wizard.md) | 1 |
| Free tools and graders | [free check](phase-1-lead-engine/5-onboarding-and-launch/01-free-missed-enquiries-check.md), [SEO and AI search](phase-6-content-engine/03-seo-and-ai-search-visibility.md) | 1, 6 |
| Customer support, premium support | [platform console](phase-1-lead-engine/5-onboarding-and-launch/05-platform-console.md) (support access) | 1 |
| Business units, brands | [multiple branches](phase-7-ai-and-scale/08-multiple-branches.md) | 7 |
| Sandboxes | [advanced permissions](phase-7-ai-and-scale/06-advanced-permissions-sso-and-sandbox.md) | 7 |
| Solutions, affiliate and technology partner programmes | [white label and partners](phase-7-ai-and-scale/09-white-label-and-partners.md), [public API](phase-5-automation-and-data/06-public-api-webhooks-and-app-store.md) | 5, 7 |

## Not product features

HubSpot also runs company programmes that aren't part of the software: HubSpot Academy courses and certifications, the
community forum, user groups, the INBOUND conference, blogs, ebooks, website template marketplace, and ROI calculators.
We can do our own versions (a help centre with videos, a WhatsApp community for owners) as business activities, outside
these phases.

## Our features HubSpot doesn't have

| Our feature | File |
| --- | --- |
| AI answers incoming phone calls, in Malayalam, English and Hindi | [phone calls](phase-1-lead-engine/3-ai-agents-and-channels/03-phone-calls.md) |
| AI answers WhatsApp as a main channel | [WhatsApp](phase-1-lead-engine/3-ai-agents-and-channels/04-whatsapp.md) |
| Every AI promise becomes a task with a WhatsApp reminder | [tasks](phase-1-lead-engine/2-crm-core/05-tasks-and-reminders.md) |
| The AI asks for the business's own custom fields | [custom fields](phase-1-lead-engine/2-crm-core/06-custom-fields.md) |
| Set up by chatting with our AI: it asks simple questions, fills in answers from the website, Google listing or a photo of a rate card | [setup wizard](phase-1-lead-engine/5-onboarding-and-launch/03-setup-wizard.md), [business questions](phase-1-lead-engine/3-ai-agents-and-channels/09-business-questions.md) |
| Free competitor report on day one | [competitor report](phase-1-lead-engine/5-onboarding-and-launch/07-competitor-report.md) |
| Free "what you're missing in rupees" check | [free check](phase-1-lead-engine/5-onboarding-and-launch/01-free-missed-enquiries-check.md) |
| AI listens to staff calls and fills the CRM | [staff calling](phase-2-sales-engine/2-sales-team-tools/05-staff-calling-and-call-logging.md) |
| Workflows described in plain words | [workflows](phase-5-automation-and-data/01-workflows.md) |
| "AI-saved revenue" from after-hours leads | [revenue reports](phase-2-sales-engine/1-selling/09-revenue-reporting.md) |
| Surveys by WhatsApp reply, happy customers sent to Google reviews | [surveys](phase-3-service-engine/07-feedback-surveys.md) |

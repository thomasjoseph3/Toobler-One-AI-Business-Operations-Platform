# Knowledge base

**Phase 1 · AI agents · HubSpot equivalent: Knowledge base for the Customer Agent, Knowledge Base Agent, Agent knowledge
gaps**

## What it is

Everything the AI knows about the business, kept in one place. The AI answers customers' questions (rates, timings,
what's included, policies, how to reach the business) only from what is here.

It has six parts:

| Part | What it holds | Where it comes from |
| --- | --- | --- |
| **Business profile** | Name, what the business does, address, hours, contacts, languages, GST details, payment methods, policies | The [business questions](09-business-questions.md), pre-filled from the website or listings |
| **Offerings** | What the business sells, with "from" prices and what's included | Website, uploads, or typed in (see [offerings](01-business-info-and-offerings.md)) |
| **Situations** | How the business wants common moments handled: a discount request, fully booked, a complaint | The situation questions in setup |
| **Documents** | Brochures, rate cards, menus, price lists (PDF, Word, photos), and pages read from the website | Uploaded by the owner, or read from the website |
| **FAQs** | Short question-and-answer pairs | Typed in, drafted from the website, or added from unanswered questions |
| **Unanswered questions** | What customers asked that the AI couldn't answer, with how often | Logged by the AI |

## Why it matters

The AI can only answer from what it has been told. A good knowledge base means the AI gives a real answer at 11 PM
instead of "I'll ask the team to call you". It also means every staff member gives the same answers.

## How it works

1. During setup, the owner answers the business questions. Most answers are already filled in from their website or
   listing; the owner only checks them (see [setup wizard](../5-onboarding-and-launch/03-setup-wizard.md)).
2. The owner uploads anything else they have: a brochure, a rate card, a photo of the price board. We read it and show a
   short summary: "Rate card 2026: 4 room types, from ₹3,500, breakfast included". The owner taps **Use this** (or
   **Don't use**).
3. A customer asks on WhatsApp: "Is breakfast included, and do you have parking?" The AI finds both answers in the
   knowledge base and replies.
4. A customer asks "Do you have EV charging?". Nothing in the knowledge base says. The AI says "Let me check with the
   team" and logs the question.
5. The manager sees "Is there EV charging? (asked 6 times this month)" under **Unanswered questions**, types the answer
   once, and it becomes an FAQ. From the next conversation, the AI answers it.

**When two places disagree** (the rate card says ₹3,500 but the offering says ₹3,800), the knowledge base shows a
**"These don't match"** warning to the manager. Until it is fixed, the AI uses this order of trust:

1. Answers the owner typed or confirmed (business profile, offerings, situations, FAQs)
2. Documents the owner uploaded
3. Pages read from the website

**Keeping it fresh:** every three months the manager is reminded to review the knowledge base. **Re-read website**
checks the website again and shows only what changed, for the manager to accept or ignore.

## Rules

- The AI answers only from the knowledge base. Nothing invented. If it isn't there, the AI says so and offers a
  callback.
- Only confirmed information is used. Anything pre-filled or uploaded is marked **Please check** and is not used
  until the owner accepts it.
- Prices are always "from" prices, said with their GST note ("from ₹3,500 plus GST"). The AI never adds GST, never
  works out a total and never offers a discount the business hasn't listed.
- Competitor information (see [competitor report](../5-onboarding-and-launch/07-competitor-report.md)) is never part of
  the knowledge base and is never mentioned to customers.
- Every answer the AI gives from a document or FAQ records its source, so staff can see where it came from.
- Removing a document or FAQ asks "Are you sure?".

## Screens

- **Knowledge base** (main menu), with a **completeness score** at the top that says what's missing and why it
  matters ("Add your cancellation policy: customers ask about it on 1 in 5 calls"). Tabs:
  - **Business profile:** the business questions as a simple form, grouped in sections. Edit any answer.
  - **Offerings:** see [offerings](01-business-info-and-offerings.md).
  - **Situations:** each situation with the chosen answer; change it.
  - **Documents:** list with name, kind, date, summary, "Used for answers" on/off; **Upload**, **Re-read website**.
  - **FAQs:** list of questions and answers; add, edit, remove.
  - **Unanswered questions:** grouped, with counts; **Answer** or **Ignore**.
- **Test the agent:** a chat panel on every tab. The owner asks as a customer would. Each answer shows which part of
  the knowledge base it came from.
- **On a conversation in the Inbox:** when the AI used a document or FAQ, a small "Answered from: Rate card 2026"
  link.

## Done when

- [ ] Answers to the business questions, offerings, situations, uploaded documents and FAQs are all used by the AI.
- [ ] A PDF, a Word file and a phone photo of a price board are each read and summarised correctly in tests.
- [ ] Pre-filled or uploaded information isn't used until the owner accepts it.
- [ ] A question the AI can't answer appears under Unanswered questions; once answered, the AI uses it in the next
      conversation.
- [ ] A price that differs between a document and an offering shows "These don't match".
- [ ] In agent tests, no answer contains a fact that isn't in the knowledge base, a total, or a competitor's name.

## Better than HubSpot

- Built by answering questions and uploading what the business already has, not by writing articles.
- Reads photos of price boards and handwritten-style rate cards, common for small Indian businesses.
- Unanswered questions from phone calls and WhatsApp, not only chat and email.

## For developers

- **Code folder:** `apps/api/src/core/knowledge`
- **API:** [API.md](../../API.md), Phase 1 → Knowledge base
- **Tables:** `business_answers` (`account_id`, `question_key`, `value` jsonb, `source` (`typed`, `website`, `listing`,
  `document`), `source_ref`, `status` (`check`, `confirmed`), `confirmed_by`, `confirmed_at`); `situations`
  (`account_id`, `situation_key`, `choice`, `custom_text`); `knowledge_documents` (`account_id`, `title`, `kind`
  (`upload`, `website_page`), `file_key`, `source_url`, `text`, `summary`, `use_for_answers`, `status`,
  `read_at`); `knowledge_chunks` (`account_id`, `document_id`, `text`, `embedding`); `faqs` (`account_id`,
  `question`, `answer`, `source`); `unanswered_questions` (`account_id`, `question`, `group_key`, `count`,
  `last_asked_at`, `answered_at`, `faq_id`); `knowledge_conflicts` (`account_id`, `kind`, `refs`, `resolved_at`).
- **Search:** documents and FAQs are split into short passages with embeddings (pgvector), searched by meaning plus
  keywords; results carry their source.
- **Reading files:** PDF and Word text extraction; photos read by the AI model's image reading, then shown to the owner
  to confirm.
- **Agent tools:** `get_business_info` (profile and situations), `list_offerings`, `search_knowledge` (passages from
  documents and FAQs, with sources), `log_unanswered_question`.
- **Jobs:** read uploaded files; group unanswered questions nightly; three-monthly review reminder.
- **Tests:** trust order when sources disagree; unconfirmed items never reach the agent; cross-business isolation of
  passages.

## Open questions

- How large can uploads be? Suggest 20 MB per file and 50 files per business in Phase 1.

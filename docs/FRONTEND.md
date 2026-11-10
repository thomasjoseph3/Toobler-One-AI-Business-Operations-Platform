# Front-end design guide

For `apps/web` (staff app), `apps/site` (the free check and public pages) and the chat widget. Product behaviour comes
from [SCREENS.md](../requirements/phase-1-lead-engine/SCREENS.md). **Visual design comes from the designer's
[Toobler One Design System v1.0](design/TooblerOne_Design_System_v1.0.md), which is the authority**: colours,
type, spacing, radius, components, motion, accessibility. This page does not repeat its values; it says how we apply
it in code and what we add where it is silent. Do not edit the v1.0 copy: changes go to the designer and come back as
a new version (their governance rule, section 9).

Shared tokens and components live in `packages/ui` (`@toobler-one/ui`) so every app looks like one product.

## 1. Principles

The design system's six principles (daily work first, colour with intent, scannable, calm surfaces, explicit state,
real content) plus our product checks from SCREENS.md:

| # | Principle | Check before a screen is done |
| --- | --- | --- |
| 1 | **Phone first** | Designed and tested at 375×812 first, then 1280×800. No horizontal scroll at 360 px. Touch targets 44 px. |
| 2 | **Five seconds** | The page's main action or next item is visible without scrolling on a phone. |
| 3 | **Call and WhatsApp everywhere** | Wherever a customer appears: `tel:` and `https://wa.me/` buttons. |
| 4 | **AI or person** | Every message, note and change shows its actor; AI items carry the AI badge (sparkle icon + "AI agent"). |
| 5 | **Hot / warm / cold** | Icon **and** word **and** colour; reason on tap or hover. Readable in greyscale. |
| 6 | **Live** | Lists that can change subscribe to `/events` and refresh without a reload. |
| 7 | **"Are you sure?"** | Every delete and every action that can't be undone goes through `<ConfirmDialog>` naming the item and the consequence. |
| 8 | **Simple words** | "Call back at 9 AM", not "Task due 09:00". No jargon ("lifecycle", "pipeline") in buttons. |
| 9 | **Industry words** | No stage, field or record word is hard-coded; all come from the business's labels (`useWords()`). |
| 10 | **Empty, loading, error** | Every list has all three states; the empty state says what to do next, with the action. |
| 11 | **Real content** | Test with a 60-character name, a Malayalam name, a Hindi address, ₹1,20,00,000, and zero rows. |

## 2. Using the design system in code

**Tokens.** `packages/ui/src/tokens.css` implements the designer's section 8 CSS variables exactly
(`--color-canvas`, `--color-surface`, `--color-text-primary`, `--color-action`, `--spacing-4`, `--rounded-lg`, …) and
adds the rest of the designer's tables (neutral and emerald scales, feedback colours, shadows) under the same naming.

- **Dark mode redefines the same variables**, not separate `dark-` names. The designer's `dark-color-*` values go under
  `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` and `:root[data-theme="dark"] { … }`.
  A switch in the profile menu sets `data-theme`; the default follows the system.
- **Tailwind 4 `@theme` references the variables** (`--color-canvas: var(--color-canvas)` style), never raw hex. So
  `bg-surface`, `text-text-secondary`, `border-border` and the spacing/radius utilities all come from one place.
- **No one-off colours, spacing, radii or type styles in components.** An exception is documented in the component and
  listed in [REQUIREMENTS-REVIEW.md](REQUIREMENTS-REVIEW.md) for the designer.

**Type.** Manrope (headings, buttons) and Inter (everything else), self-hosted by the Vite build (font files come from npm packages, so there is no call to Google Fonts and the content security policy stays `'self'`). The designer's named
styles (`text-2xl-page-title`, `text-sm-body`, `text-xs-label`, …) become utility classes in `packages/ui`; use those,
not raw sizes. Numbers, currency, dates and reference IDs use `tabular-nums`.

**Indian scripts.** The app's own text is English only. Manrope and Inter have no Malayalam or Devanagari glyphs, but customer names, messages and call transcripts can contain them. Both font stacks therefore end with `"Noto Sans Malayalam", "Noto Sans Devanagari"` (also via
self-hosted the same way, subsetted), then the system font. The 11 px styles are never used for text that can be in those scripts.

**Icons.** One outline family: Lucide (stroke 1.75–2, sizes 16 / 20 / 24). Icon-only buttons have an accessible name.

**Layout** (designer's sections 2.6 and 7):

| Size | Navigation | Content |
| --- | --- | --- |
| Phone (< 768) | **Bottom bar** with Today, Leads, Inbox, Tasks and **More** (full-screen sheet for the rest). Top bar 56 px: search, assistant, business switcher, profile. | One column; 16 px padding, 12 px gaps; 4-column grid. Tables become stacked records; dialogs become full-screen or bottom sheets. |
| Tablet (768–1279) | Compact rail 64–72 px, or collapsible sidebar | 24 px padding, 16 px gaps; 8-column grid; details open in a side panel |
| Desktop (≥ 1280) | Rail 220–240 px | 32 px padding, 24 px gaps; 12-column grid; main content max width 1440 px |

Top bar 56–64 px on every size. Contact and lead pages on desktop: details left, timeline in the middle, related
records right.

**The menu is data.** The web app gets the active modules and their nav items from `GET /me` and builds the menu from
them. A module that is off has no menu item, and its routes show the not-found page.

**Slots.** Pages that other modules extend expose named slots: `lead.sidebar`, `lead.card.badges`, `contact.sidebar`,
`settings.sections`, `today.sections`. A module's front-end folder registers components into slots in its
`features/<module>/index.ts`. This is how the sales engine adds quotes to the lead page in Phase 2 without editing it.

## 3. Components (`packages/ui`)

Built once, used everywhere, to the designer's section 3 specs: buttons Primary / Secondary / Tertiary / Destructive /
Link, 40 px high (44 px on touch) with default, hover, focus-visible, pressed, disabled and loading states; inputs
40/44 px with `rounded-md`; cards with a 1 px border, 12 px radius and no shadow; tables with a quiet header, 44–48 px
rows, end-aligned numbers and no vertical lines; transitions 120–180 ms, none under `prefers-reduced-motion`.
Destructive means the error outline or tint, and always sits inside `ConfirmDialog`.

| Component | Notes |
| --- | --- |
| `AppShell`, `SideNav`, `BottomBar`, `TopBar`, `BusinessSwitcher`, `GlobalSearch` | Selected nav item: `color-action-subtle` with emerald icon and text. Badges only for actionable counts. Search opens a full-screen sheet on a phone. |
| `PageHeader`, `Card`, `Section`, `Tabs`, `FilterChips`, `ViewTabs` | Page structure; no nested cards |
| `DataList` | One component: table on desktop and tablet, stacked records on phone; chosen columns, sorting, sticky header |
| `LeadCard` | Name, interest, dates, temperature, owner, time since last activity; draggable on the board; **Move** button on a phone |
| `TemperatureTag`, `TypeChip`, `ChannelIcon`, `AiBadge`, `ActorLabel`, `StageBadge`, `AiUnsureChip`, `StatusBadge` | Tinted pill, readable foreground, icon + visible text; never colour alone |
| `TimelineItem` | Icon, actor, when (relative, exact on hover/tap), summary; calls open recording and transcript |
| `CallButton`, `WhatsAppButton`, `EmailButton` | Open the dialler, WhatsApp or mail app |
| `ConfirmDialog` | Names the item, states the consequence, the danger button repeats the verb |
| `Form`, `Field`, `TextInput`, `Select`, `Combobox`, `DateTimePicker`, `PhoneInput`, `Switch`, `CheckboxGroup` | Visible labels, required/optional stated in words, errors under the field from the API's `details`, form data kept after a recoverable error |
| `CustomFieldInput` | Renders any custom field definition (text, number, date, dropdown, yes/no, phone, email) |
| `MetricCard`, `Chart` | Label, prominent value, one period and one comparison; text summary beside each chart |
| `EmptyState`, `Skeleton`, `ErrorState`, `Toast` | Skeletons match the final geometry; toasts only for brief confirmations, lasting issues go in inline banners or the inbox |
| `Board` | dnd-kit columns with keyboard support; counts per column; Lost asks for a reason |
| `ChatThread`, `Composer` | Inbox and setup chat; AI messages marked, "Answered from: …" source links |

## 4. Toobler One extensions (our decisions, existing tokens only)

The design system covers the shell, foundations and core components but not the CRM's own states. Its governance says
to define additional states before adding colours and to add a token only when no existing one can express the role. So
these **reuse existing tokens** only. The owner decided (9 Nov 2026) to keep the designer's file as delivered and not send these back; if the designer later issues a new version, we align.

| Need | Proposal (existing tokens only) | Why / open point |
| --- | --- | --- |
| **Hot / warm / cold** | Hot = Error family + flame icon; Warm = Warning family + sun icon; Cold = Information family + snowflake icon; each with its word | Red for "hot" also reads as "error". Designer to confirm or give another pairing. |
| **Lead stages** | Open stages: neutral pill with the stage's own name (businesses rename and add stages, so no colour per stage). Won = Success. Lost = neutral with a cross icon (not an error). | |
| **Task due state** | Overdue = Error, due today = Warning, upcoming = neutral, done = Success | |
| **Ticket** | Open = Warning, Done = Success; high priority adds an Error "High" badge | |
| **Conversation flags** | Needs a person = Warning with an alert icon; AI unsure = Information with a question icon | |
| **AI actor** | Sparkle icon + "AI agent" text on a neutral-muted pill; AI messages in a chat sit on `color-surface-muted`; people get an initials avatar | The design system has no actor colour; violet is dropped. |
| **Channel** | Icon + word, neutral colour for all four channels | WhatsApp green would clash with "emerald = primary action". |
| **Chart series** | Emerald-700 primary, emerald-300 comparison (designer). More than two categories: emerald-700 / emerald-300 / neutral-500 / neutral-300, and Information, Warning, Error only where the category truly means that | "Leads by channel" has four categories and "by conversation type" more; the designer must supply a categorical palette. |
| **Operational states** | The designer's Occupied, Needs cleaning, Booked, Out of service and Do not disturb are hotel housekeeping states. **Not used in Phase 1**; Phase 2 booking states may adopt them. | |
| **Money** | Full Indian grouping everywhere (₹1,20,000); no ₹1.2L form | The design system allows either "consistently"; a CRM is read for exact figures. |
| **Dates and time** | `20 Dec 2026`, range `12–15 Dec 2026`; times in the business's time zone with the zone shown when staff are in several | |

## 5. Contrast findings on the designer's v1.0 values

Computed with WCAG 2.2 formulas (9 Nov 2026). **Decision (owner): the designer's values are used unchanged.** The F00 contrast test asserts every token pair we use and keeps this table as its explicit known-exceptions list: a new failing pair fails the build, these five do not. We do not darken colours ourselves. Where practical we avoid them: timestamps use `color-text-secondary` at 12 px and above when they matter, and the dark primary button follows the designer's spec.

| Pair | Ratio | Need | Where it matters |
| --- | ---: | ---: | --- |
| `color-text-muted` #7C837F on canvas / white / muted surface | 3.58 / 3.88 / 3.52 | 4.5 | Timestamps and metadata at 12–13 px |
| Dark theme: white text on `color-action` #43A77A | 2.98 | 4.5 | Primary buttons in dark mode (dark text on it is 5.91) |
| `color-action` #078453 on `color-action-subtle` | 4.19 | 4.5 | Selected navigation item text at 13 px |
| Dark theme: `color-action` #43A77A on `color-action-subtle` #263D32 | 3.92 | 4.5 | Selected navigation item text (found by the token test on 10 Nov 2026; same cause as the light-theme row above) |
| `color-focus-ring` #58A987 on white | 2.82 | 3.0 | Keyboard focus indicator |
| `color-text-disabled` on white | 2.37 | exempt | Disabled controls (WCAG exempts them) |

All other pairs checked pass (body and secondary text, white on `color-action` 4.74, all four feedback families in
both themes, dark muted text 4.98–5.60).

## 6. Writing on screen

- Sentence case. Buttons are verbs that say the result: **Save**, **Move to Won**, **Call Priya**.
- Relative times when recent ("12 min ago"), exact on hover or tap.
- Errors say what happened and what to do: "That phone number is already on Priya Nair. Open her contact?"
- The app is English only (decision R9). Text still goes through `t('key')` so a language could be added later without touching components. Industry words come from the business's labels, not the dictionary.

## 7. Accessibility

WCAG 2.2 AA is the target (design system section 6). Semantic HTML first; every control usable by keyboard, the board
too (pick up, move, drop with keys); visible 2 px focus ring with offset; labels on every input; `aria-live="polite"`
on live lists; dialogs trap and restore focus; `prefers-reduced-motion` respected; status never by colour alone;
Malayalam, Hindi and English without clipping or fixed widths.

## 8. How the web app talks to the API

- **Single-page app.** `apps/web` is React + Vite. In development Vite proxies `/api` to the API; in production a reverse
  proxy serves the app and `/api` from one address, so the browser sees one origin.
- **Sign-in cookie.** The API sets the session in an **httpOnly, Secure, SameSite=Lax** cookie. Tokens never reach
  browser JavaScript, `localStorage` or a URL. State-changing requests are checked for a matching `Origin` and a CSRF
  header (docs/SECURITY.md 2.2).
- **Data.** A small typed client in `lib/api.ts` (schemas from `packages/shared`). Each page loads through a hook with
  loading, empty and error states; forms show field errors from `error.details`.
- **Live**: a hook subscribes to `GET /api/v1/events` (server-sent events) and refetches the affected list, debounced.
- **Optimistic UI** only where it matters (board moves, ticking a task), with rollback and a toast on failure.
- **Module guard on routes**: each module's routes sit inside `<RequireModule id="engine.leads">`, so a switched-off
  module's address shows the not-found page even if typed by hand. The API enforces the same (404), so this is only
  about the screen.

## 9. The website chat widget (`apps/site`)

A small script (`<script src=".../w/{key}.js" async>`) that injects an iframe, so the business's CSS can't break it
and it can't read the business's page. Works at 320 px and never blocks the host page's load.

**Two parts, two technologies.** The *loader* (the floating Chat / Call / WhatsApp buttons on the client's page) is
plain JavaScript and CSS, no React, built to one small file (target under 10 KB gzipped). The *chat window* is React
(Vite build) inside the iframe and loads only when the visitor clicks Chat, so it can share `packages/ui`. The client
only ever sees the one pasted line; Vite is our build tool, not their concern.

**Buttons** (the business picks which show, their order and the numbers; the loader fetches this by widget key):
Chat; Call (`tel:` link, on desktop the number with a copy button); Call from the browser (F29, needs HTTPS and
microphone permission); WhatsApp (`https://wa.me/<number>?text=<prefilled message>`, lands in the WhatsApp channel).
A button appears only if its channel is on for the business.

**Fits any website:** the same line works on HTML, PHP, WordPress, Shopify, Wix/Squarespace/Webflow, React/Next and
Google Tag Manager; the setup screen gives per-platform steps. Strict Content Security Policy sites must allow our
domain (script, frame and connect); the setup screen lists the exact entries. A **Check installation** button shows
"last seen on <website>". Sites that cannot run scripts get a plain HTML snippet of `tel:` / `wa.me` links (no AI chat).

**The design system does not govern the bubble.** It is the business's own chat (SCREENS.md), so its accent colour,
greeting and position come from the business's widget settings. We keep only the structure, spacing, radius, focus and
contrast rules, and compute a readable text colour for whatever accent the business picks (warn in Settings if the
choice fails contrast).

## 10. Front-end tests

- Playwright runs every click-through test at **phone (Pixel 7) and desktop** sizes.
- A unit test checks every token pair we use for contrast in light and dark (see §5).
- Each feature's manual test script includes a phone check; screenshots are taken with the browser tools at hand-off.
- Visual checks per feature: light and dark, empty, loading and error states, a 60-character name, a Malayalam name.

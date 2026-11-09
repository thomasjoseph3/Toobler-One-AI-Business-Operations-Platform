# Toobler One — AI Business Operations Platform

Version 1.0 · Product design system foundation for Toobler One

## 1. Purpose and product character

Toobler One is a professional, capable AI Business Operations Platform. Its interface should bring clarity to complex business workflows with the order and precision of a modern enterprise dashboard. Use calm surfaces, clear hierarchy, and consistent patterns that scale across business modules and customer journeys.

### Design principles

1. **Prioritize daily work.** Make key tasks, exceptions, and next actions easy to find.
2. **Use color with intent.** Emerald means primary action or positive movement; semantic colors describe status.
3. **Keep information scannable.** Use clear hierarchy, aligned numbers, concise labels, and consistent spacing.
4. **Prefer calm surfaces.** White cards, pale neutral canvas, restrained borders, and minimal shadow.
5. **Make state explicit.** Pair color with text, icon, or shape; never rely on color alone.
6. **Design for real content.** Support long names, changing amounts, translations, empty data, and error states.

## 2. Foundations

### 2.1 Color tokens

Use the emerald and mint palette from the approved dashboard direction. Primitive brand tokens define the palette; semantic tokens define how UI components use it across Toobler One modules.

#### Brand scale

| Token | Hex | Primary use |
|---|---|---|
| `emerald-950` | `#064B35` | Deep pressed state, high contrast accents |
| `emerald-900` | `#075C40` | Strong brand surface |
| `emerald-800` | `#06734A` | Hover and active action |
| `emerald-700` | `#078453` | Primary action and main chart series |
| `emerald-600` | `#14966A` | Highlights and secondary emphasis |
| `emerald-400` | `#58A987` | Focus ring and emphasis marks |
| `emerald-300` | `#83C4AA` | Secondary chart series |
| `emerald-200` | `#C6E5D8` | Selected controls and data fills |
| `emerald-100` | `#E7F4EE` | Selected navigation and soft status surface |
| `emerald-50` | `#F3FAF6` | Subtle brand-tinted surface |

#### Neutral scale

| Token | Hex | Use |
|---|---|---|
| `neutral-950` | `#171A18` | Primary text |
| `neutral-900` | `#252A27` | Strong secondary text |
| `neutral-700` | `#454C48` | Body text and icons |
| `neutral-600` | `#626965` | Secondary text |
| `neutral-500` | `#7C837F` | Muted content |
| `neutral-400` | `#A4AAA6` | Disabled text and quiet icons |
| `neutral-300` | `#D5D9D7` | Strong borders |
| `neutral-200` | `#E5E7E6` | Default borders and dividers |
| `neutral-100` | `#F3F4F3` | Muted surfaces and table headers |
| `neutral-50` | `#F8F9F8` | Hover surfaces |
| `white` | `#FFFFFF` | Cards and raised surfaces |

#### Semantic light-theme colors

| Semantic token | Value | Use |
|---|---|---|
| `color-canvas` | `#F5F6F5` | App workspace background |
| `color-surface` | `#FFFFFF` | Cards, dialogs, navigation |
| `color-surface-muted` | `#F3F4F3` | Inputs, table headers, inset areas |
| `color-surface-hover` | `#F8F9F8` | Hovered row and control surfaces |
| `color-border` | `#E5E7E6` | Standard outlines and dividers |
| `color-border-strong` | `#D5D9D7` | Emphasized boundaries |
| `color-text-primary` | `#171A18` | Main text and headings |
| `color-text-secondary` | `#626965` | Descriptions and supporting labels |
| `color-text-muted` | `#7C837F` | Timestamps and tertiary metadata |
| `color-text-disabled` | `#A4AAA6` | Disabled labels and values |
| `color-action` | `#078453` | Primary action, link, active chart mark |
| `color-action-hover` | `#06734A` | Hover state |
| `color-action-pressed` | `#064B35` | Pressed state |
| `color-action-subtle` | `#E7F4EE` | Soft brand surface |
| `color-focus-ring` | `#58A987` | Keyboard focus ring |
| `color-scrim` | `rgba(23, 26, 24, 0.48)` | Modal backdrop |
| `color-tooltip` | `#171A18` | Tooltip background |
| `color-tooltip-text` | `#FFFFFF` | Tooltip text |

#### Semantic feedback colors

Use tinted backgrounds for badges and banners, stronger foregrounds for text/icons, and a separate border token when the component needs an outline.

| State | Light foreground | Light background | Light border | Dark foreground | Dark background |
|---|---|---|---|---|---|
| Success | `#176345` | `#E7F4EE` | `#B8DDCA` | `#A7D8BE` | `#263D32` |
| Warning | `#805A12` | `#FFF3D6` | `#E8D39F` | `#E8C77F` | `#473B29` |
| Error | `#A13F3A` | `#FCEAE8` | `#E8B9B4` | `#E5A29B` | `#472D2B` |
| Information | `#315F76` | `#E8F2F7` | `#B9D3E0` | `#9CC9DC` | `#243743` |

#### Operational states

Keep state meanings consistent in operational dashboards, task lists, filters, and detail views. Always show a text label or accessible name alongside the color. Define module-specific status vocabularies while reusing these semantic colors.

| State | Light foreground | Light background | Dark foreground | Dark background |
|---|---|---|---|---|
| Available / ready | `#176345` | `#E7F4EE` | `#A7C3A7` | `#29382E` |
| Occupied | `#FFFFFF` | `#416D68` | `#FFFFFF` | `#416D68` |
| Needs cleaning | `#725A31` | `#EAD9B7` | `#E2C990` | `#473B29` |
| Booked | `#77694F` | `#EAE1D1` | `#D8C9A8` | `#3D382D` |
| Out of service | `#8D4438` | `#F2D9D3` | `#F0C1B5` | `#6E4942` |
| Do not disturb | `#075C40` | `#E7F4EE` | `#A9C7BE` | `#2B433D` |

Workflow, payment, and service states should use the same semantic family where meanings match. Define any additional states before adding new colors.

#### Dark theme semantic colors

| Semantic token | Value |
|---|---|
| `dark-color-canvas` | `#151A17` |
| `dark-color-surface` | `#1E2521` |
| `dark-color-surface-raised` | `#28312C` |
| `dark-color-surface-muted` | `#242B27` |
| `dark-color-surface-hover` | `#2A342E` |
| `dark-color-border` | `#38423C` |
| `dark-color-border-strong` | `#4A554E` |
| `dark-color-text-primary` | `#F0F3F1` |
| `dark-color-text-secondary` | `#AEB8B1` |
| `dark-color-text-muted` | `#89948C` |
| `dark-color-text-disabled` | `#727D75` |
| `dark-color-action` | `#43A77A` |
| `dark-color-action-hover` | `#59B58B` |
| `dark-color-action-pressed` | `#83C4AA` |
| `dark-color-action-subtle` | `#263D32` |
| `dark-color-focus-ring` | `#83C4AA` |

### 2.2 Typography

- **Headings and buttons:** Manrope.
- **Body, tables, labels, navigation, and form content:** Inter.
- Source both families from Google Fonts or bundle licensed font files with the product.
- Use `font-variant-numeric: tabular-nums` for currency, counts, dates, reference IDs, and other aligned numeric data.
- Text styles use Tailwind-inspired size names with role suffixes where the same size has multiple jobs.

| Token | Font | Size / line height | Weight | Letter spacing | Use |
|---|---|---:|---:|---:|---|
| `text-4xl-display` | Manrope | 32 / 40 px | 700 | -0.02em | Rare display or hero metric |
| `text-2xl-page-title` | Manrope | 24 / 32 px | 700 | -0.02em | Page heading |
| `text-xl-section-title` | Manrope | 20 / 28 px | 600 | -0.01em | Major section title |
| `text-lg-subsection-title` | Manrope | 18 / 24 px | 600 | -0.01em | Card or panel title |
| `text-base-heading` | Manrope | 16 / 24 px | 600 | 0 | Compact heading |
| `text-base-body` | Inter | 16 / 24 px | 400 | 0 | Introductory or prominent body |
| `text-sm-body` | Inter | 14 / 20 px | 400 | 0 | Standard interface content |
| `text-xs-supporting` | Inter | 13 / 18 px | 400 | 0 | Dense supporting content |
| `text-xs-label` | Inter | 12 / 16 px | 500 | 0 | Field labels and table headers |
| `text-sm-button` | Manrope | 14 / 20 px | 600 | 0 | Standard buttons |
| `text-xs-navigation` | Inter | 13 / 20 px | 500 | 0 | Sidebar and top navigation |
| `text-xs-caption` | Inter | 12 / 16 px | 400 | 0 | Metadata and helper text |
| `text-[11px]-compact` | Inter | 11 / 14 px | 500 | 0 | Dense secondary data; use sparingly |
| `text-[11px]-caps` | Inter | 11 / 14 px | 600 | 0.06em | Short uppercase overlines and group labels |

Do not use the 11 px styles for essential instructions or primary data. Use sentence case by default; uppercase labels are reserved for short, secondary labels.

### 2.3 Spacing scale

Use a 4 px base unit. Build common layout spacing on multiples of 8 px, using intermediate values only where component geometry needs them.

| Token | Value |
|---|---:|
| `spacing-1` | 4 px |
| `spacing-2` | 8 px |
| `spacing-3` | 12 px |
| `spacing-4` | 16 px |
| `spacing-5` | 20 px |
| `spacing-6` | 24 px |
| `spacing-8` | 32 px |
| `spacing-10` | 40 px |
| `spacing-12` | 48 px |
| `spacing-16` | 64 px |
| `spacing-20` | 80 px |
| `spacing-24` | 96 px |

### 2.4 Radius scale

| Token | Value | Typical use |
|---|---:|---|
| `rounded-sm` | 4 px | Compact tags and small elements |
| `rounded-md` | 8 px | Inputs, buttons, dropdowns |
| `rounded-lg` | 12 px | Standard cards and panels |
| `rounded-xl` | 16 px | Prominent feature cards and sheets |
| `rounded-2xl` | 20 px | Rare large visual surfaces |
| `rounded-full` | 9999 px | Pills and circular avatars |

### 2.5 Border, elevation, and opacity

| Token | Value | Use |
|---|---|---|
| `border-0` | 0 px | Unbounded layout grouping |
| `border-1` | 1 px | Standard control and card outline |
| `border-2` | 2 px | Focus/selection only where specified |
| `shadow-xs` | `0 1px 2px rgba(23,26,24,0.05)` | Floating control or subtle hover lift |
| `shadow-sm` | `0 2px 6px rgba(23,26,24,0.06)` | Popover and small menu |
| `shadow-md` | `0 8px 24px rgba(23,26,24,0.10)` | Dialog and elevated panel |
| `shadow-none` | `none` | Default card treatment |

Prefer a border over a shadow for standard cards. Do not stack multiple shadows. In dark mode, use surface contrast and borders instead of black shadows.

### 2.6 Layout and breakpoints

| Token | Width | Layout behavior |
|---|---:|---|
| `screen-sm` | 640 px | Small phone landscape / large phone |
| `screen-md` | 768 px | Tablet layout transition |
| `screen-lg` | 1024 px | Compact desktop navigation |
| `screen-xl` | 1280 px | Full dashboard layout |
| `screen-2xl` | 1440 px | Maximum main content width |

- Desktop navigation rail: 220–240 px; compact rail: 64–72 px.
- Top bar: 56–64 px high.
- Main content maximum width: 1440 px.
- Main content padding: 32 px desktop, 24 px tablet, 16 px phone.
- Use a 12-column grid on wide desktop, 8 columns on tablet, and 4 columns on phone.
- Standard panel gap: 24 px desktop, 16 px tablet, 12 px phone.

### 2.7 Iconography and imagery

- Use one consistent outline icon family for navigation and controls; use filled marks only for small status indicators when clarity improves.
- Standard icon sizes: 16 px inline, 20 px controls/navigation, 24 px prominent actions.
- Keep stroke weight consistent, generally 1.75–2 px.
- Icon-only buttons require an accessible name and a practical hit target.
- Use people, product, or workflow imagery only when it adds useful context; never use decorative photos to fill empty dashboard space.

## 3. Core components

### 3.1 Buttons

| Variant | Treatment | Use |
|---|---|---|
| Primary | Emerald fill, white text | Main action in a page or decision area |
| Secondary | Surface fill, border, primary text | Supporting actions |
| Tertiary | Transparent, text and optional icon | Low-emphasis actions |
| Destructive | Semantic error outline or tint | Risky action with clear confirmation |
| Link | Text link in emerald | In-context navigation |

- Use Manrope 14/20 px, weight 600 for standard button labels.
- Minimum height 40 px; use 44 px on touch-focused layouts.
- Use 8 px horizontal icon-to-label gap and 12–16 px horizontal padding.
- Provide default, hover, focus-visible, pressed, disabled, and loading states.
- Use one primary button per decision area; make the label describe the result.

### 3.2 Inputs and forms

- Default control height: 40 px; touch variant: 44 px.
- Use `rounded-md`, a 1 px border, and 12 px horizontal padding.
- Labels use `text-xs-label`; helper text uses `text-xs-caption`.
- Error state includes semantic border, icon if useful, and a concise message below the field.
- Show required/optional status clearly; do not rely on placeholder text as a label.
- Support default, hover, focus, filled, error, disabled, and read-only states.
- Group fields by task; avoid long single-column forms when a logical two-column layout fits.

### 3.3 Navigation

- Keep navigation labels concise and grouped by work area.
- Selected item uses `color-action-subtle` with emerald icon and text; active contrast must remain readable.
- Reserve badges for actionable counts, such as unassigned arrivals or pending approvals.
- On narrow screens, use a drawer or compact rail; preserve the active destination label.

### 3.4 Cards and panels

- Standard card: white surface, 1 px neutral border, 12 px radius, no default shadow.
- Card padding: 20–24 px; compact data cards may use 16 px.
- Align card headings, values, and actions to a consistent internal grid.
- Avoid nesting cards; use spacing, dividers, or subtle inset backgrounds for grouping.

### 3.5 Tables

- Use 12 px / 16 px, weight 500 for table headers and sentence case labels.
- Body rows use 13–14 px Inter; row height 44–48 px.
- Align numeric and currency values to the end; apply tabular numerals.
- Use a quiet header surface, 1 px horizontal dividers, and no vertical gridlines by default.
- Keep search and filters visually attached to the table context.
- Provide empty, loading, error, selected, and pagination states.
- On phone, convert rows to readable stacked records or allow intentional horizontal scrolling.

### 3.6 Status badges

- Use compact tinted pills with readable foreground, optional icon, and visible text.
- Keep badge vocabulary consistent across list, filter, detail, and dashboard views.
- Do not use color alone to communicate workflow, payment, or service state.

### 3.7 Metric cards and charts

- A metric card contains a clear label, prominent value, and one relevant period/comparison.
- Keep unit and date context close to the number; never imply a trend without a comparison period.
- Use emerald for the primary series and pale mint for comparison; semantic colors only for meaningful categories.
- Use labels, legends, and textual summaries so chart meaning is not color-dependent.
- Keep chart grids thin and neutral; avoid decorative gradients and excessive data labels.

### 3.8 Dialogs, drawers, and notifications

- Use dialogs for focused decisions; use drawers/side panels for details that benefit from page context.
- Dialogs need a title, clear close action, concise content, and aligned footer actions.
- Use an opaque-enough scrim to communicate modal focus while preserving context.
- Confirm destructive actions with the affected item and consequence stated plainly.
- Toasts are for brief confirmations; persistent or actionable issues belong in inline banners or an inbox.

## 4. Business operations patterns

### Records and workflows

- Make the primary record identifier and current state easy to scan.
- Keep workflow status, payment status, and service status as separate fields when they represent different processes.
- Use lifecycle labels that match the product domain; define them once and reuse them across lists, filters, details, and dashboards.
- Make the next available action clear without hiding the record context.
- Show ownership, timestamps, relevant parties, and key amounts close to the record summary.

### Operational grids and queues

- Use grids for items whose state benefits from spatial or categorical scanning; use queues for ordered work that needs action.
- Keep a persistent legend when color maps to multiple states.
- Use consistent state labels and colors in overview, filters, and detail views.
- Support assignment, priority, due date, and exception context where relevant to the workflow.
- Let users open a record detail panel without losing their place in the underlying list.

### Empty, loading, and error states

- Empty states explain what belongs here and offer one relevant next action.
- Skeletons should match final content geometry and respect reduced motion.
- Errors should explain what happened in plain language and provide a safe retry or recovery action.
- Preserve entered form data after recoverable errors.

## 5. Interaction and motion

- Transitions: 120–180 ms for hover, focus, and small state changes.
- Use ease-out for entrances and ease-in for exits; avoid bouncy movement in operational workflows.
- Respect `prefers-reduced-motion` and provide non-animated state changes.
- Every interactive component needs hover, focus-visible, pressed, disabled, and loading states where relevant.
- Do not make essential information appear only on hover.
- Keep pointer targets at least 40 px for desktop controls and 44 px where practical on touch.

## 6. Accessibility and localization

- Target WCAG 2.2 AA contrast for text, controls, and meaningful graphics.
- Use semantic headings, landmarks, form labels, table headers, and button names.
- Preserve visible keyboard focus; use a clear 2 px ring with an offset where the surface allows.
- Pair color with text, icon, or shape for every status and chart category.
- Support keyboard navigation, screen readers, zoom, and reduced motion.
- Support Malayalam, Hindi, and English text without clipping or fixed-width assumptions.
- Use property-local time and explicit timezone when users may coordinate across locations.
- Format currency using the property's configured currency; for Indian properties use ₹1,20,000 or ₹1.2L consistently.
- Keep dates unambiguous, for example `20 Dec 2026`; use locale-aware formatting where available.

## 7. Responsive behavior

### Wide desktop (`screen-xl` and above)

- Full navigation rail, multi-column dashboard, visible contextual table controls.
- Use the available width without stretching line lengths beyond readable limits.

### Tablet (`screen-md` to `screen-xl`)

- Compact navigation rail or collapsible sidebar.
- Reflow dashboard panels to fewer columns; keep primary actions visible.
- Open record details and long forms in a side panel or full-height sheet.

### Phone (below `screen-md`)

- Use a navigation drawer or bottom navigation only for a small number of core destinations.
- Stack dashboard panels and keep critical operational actions near the top.
- Convert tables to stacked records or allow intentional horizontal scrolling.
- Use full-screen sheets for complex dialogs; keep primary actions within easy reach.

## 8. Implementation tokens

Use these names as the public design-token API in Figma and code. CSS custom properties are the source of truth; framework configuration should reference them rather than duplicating raw values.

```css
:root {
  --color-canvas: #f5f6f5;
  --color-surface: #ffffff;
  --color-surface-muted: #f3f4f3;
  --color-surface-hover: #f8f9f8;
  --color-border: #e5e7e6;
  --color-border-strong: #d5d9d7;
  --color-text-primary: #171a18;
  --color-text-secondary: #626965;
  --color-text-muted: #7c837f;
  --color-text-disabled: #a4aaa6;
  --color-action: #078453;
  --color-action-hover: #06734a;
  --color-action-pressed: #064b35;
  --color-action-subtle: #e7f4ee;
  --color-focus-ring: #58a987;

  --font-heading: "Manrope", sans-serif;
  --font-body: "Inter", sans-serif;

  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
  --spacing-5: 20px;
  --spacing-6: 24px;
  --spacing-8: 32px;
  --spacing-10: 40px;
  --spacing-12: 48px;
  --spacing-16: 64px;

  --rounded-sm: 4px;
  --rounded-md: 8px;
  --rounded-lg: 12px;
  --rounded-xl: 16px;
  --rounded-2xl: 20px;
  --rounded-full: 9999px;
}
```

## 9. Governance

- Change tokens centrally and record the reason and version in this document.
- Add a new semantic token only when an existing token cannot express the role clearly.
- Do not create one-off colors, spacing values, radii, or type styles inside components without documenting the exception.
- Review contrast, focus states, responsive behavior, and long-content behavior when adding or changing components.
- Keep component examples and production UI aligned with this system.


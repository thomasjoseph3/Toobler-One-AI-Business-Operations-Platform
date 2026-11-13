# TooblerOne — Design System

**Version:** 1.3 · **Updated:** 11 November 2026  
**Product:** TooblerOne AI Business Operations Platform

A framework-independent system with Tailwind-inspired semantic naming. These tokens are original to TooblerOne; the naming style is a convention and does not reproduce Tailwind UI components or screens.

## Review status and scope

This release tightens v1 token consistency, adds practical screen and state coverage, and records contrast risks. It is a design-system specification review, not a claim that every final implementation has been rendered and audited. Validate actual combinations in Figma and the implemented UI before release.

## 1. Principles

- Keep the supplied charcoal sidebar, pale content canvas, and near-white header as the light theme anchor.
- Use lavender, peach, and neutral tints as restrained card-header accents.
- Maintain hierarchy through typography, spacing, and contrast. Color alone must not communicate state.
- Use 8px increments for primary layout spacing; 4px is the fine adjustment step.
- Prefer semantic tokens over raw hex values in component specs.
- A disabled state may be subdued, but essential disabled text must remain legible.

## 2. Color tokens

### 2.1 Foundation neutrals

| Token | Hex | Intended use |
|---|---:|---|
| `color.neutral.0` | `#FFFFFF` | Pure white |
| `color.neutral.25` | `#FCFCFC` | Reference header |
| `color.neutral.50` | `#F9F9F8` | Subtle surface |
| `color.neutral.100` | `#F5F5F5` | Neutral card header / hover fill |
| `color.neutral.150` | `#EDEDED` | Reference content canvas |
| `color.neutral.200` | `#E2E2E0` | Light separators |
| `color.neutral.300` | `#C9C9C6` | Light default border |
| `color.neutral.400` | `#A6A6A2` | Muted text / disabled details |
| `color.neutral.500` | `#80807E` | Reference sidebar item (contrast caveat below) |
| `color.neutral.600` | `#666663` | Secondary content text |
| `color.neutral.700` | `#4B4B49` | Supporting text |
| `color.neutral.800` | `#3F3F3D` | Reference sidebar group title (contrast caveat below) |
| `color.neutral.900` | `#212121` | Content heading |
| `color.neutral.950` | `#161715` | Sidebar background |

### 2.2 Light theme semantic tokens

| Token | Hex | Usage |
|---|---:|---|
| `color.light.bg.canvas` | `#EDEDED` | Main work area |
| `color.light.bg.header` | `#FCFCFC` | Global header |
| `color.light.bg.surface` | `#FFFFFF` | Cards, dialogs, menus |
| `color.light.bg.surface-subtle` | `#F9F9F8` | Quiet panel/table header |
| `color.light.bg.input` | `#FFFFFF` | Inputs, selects |
| `color.light.bg.hover` | `#F5F5F5` | Hovered rows and controls |
| `color.light.bg.selected` | `#F0F0EF` | Selected neutral row/control |
| `color.light.bg.disabled` | `#F5F5F5` | Disabled control |
| `color.light.bg.sidebar` | `#161715` | Sidebar |
| `color.light.text.primary` | `#212121` | Headings/primary copy |
| `color.light.text.secondary` | `#4B4B49` | Body and labels |
| `color.light.text.tertiary` | `#666663` | Supporting copy; passes 4.5:1 on canvas |
| `color.light.text.placeholder` | `#666663` | Placeholder when essential; avoid placeholder-only instructions |
| `color.light.text.disabled` | `#666663` | Essential disabled label; use disabled surface/border to show state |
| `color.light.text.inverse` | `#FCFCFC` | Standard inverse text on dark fills |
| `color.light.text.inverse-white` | `#FFFFFF` | Pure white text when exact white is needed on dark fills |
| `color.light.border.subtle` | `#E8E8E6` | Low-priority separators |
| `color.light.border.default` | `#D4D4D1` | Input/card boundary |
| `color.light.border.strong` | `#B8B8B4` | Emphasized boundary; non-text UI only |
| `color.light.border.emphasis` | `#8E8E8A` | High-emphasis non-text outline |
| `color.light.icon.primary` | `#3F3F3D` | Primary icon |
| `color.light.icon.secondary` | `#666663` | Secondary icon |
| `color.light.icon.subtle` | `#666663` | Informative icon; `#92928F` only for decorative marks |
| `color.light.icon.disabled` | `#666663` | Essential disabled icon; pair with disabled surface |
| `color.light.icon.inverse` | `#EEEEEE` | Standard inverse icon on dark surface |
| `color.light.icon.inverse-white` | `#FFFFFF` | Pure white icon when exact white is needed on dark surface |
| `color.light.sidebar.logo` | `#EEEEEE` | Logo |
| `color.light.sidebar.section` | `#8E8E8A` | Accessible group label |
| `color.light.sidebar.section.reference` | `#3F3F3D` | Requested muted section label; decorative/large only |
| `color.light.sidebar.item` | `#A6A6A2` | Recommended essential inactive label/icon |
| `color.light.sidebar.item.reference` | `#80807E` | Requested item color; passes 4.5:1 for text on sidebar |
| `color.light.sidebar.item-hover` | `#D4D4D1` | Hovered label/icon |
| `color.light.sidebar.item-active` | `#F5F5F3` | Active label/icon |
| `color.light.sidebar.item-active-bg` | `#2A2B28` | Active row |
| `color.light.link.default` | `#35566E` | Link text; underline links in body copy |
| `color.light.link.hover` | `#243F53` | Hover link |
| `color.light.focus` | `#35566E` | Keyboard focus ring |

### 2.3 Dark theme semantic tokens

| Token | Hex | Usage |
|---|---:|---|
| `color.dark.bg.canvas` | `#111210` | Main work area |
| `color.dark.bg.header` | `#1B1C19` | Global header |
| `color.dark.bg.surface` | `#1F201D` | Cards, dialogs, menus |
| `color.dark.bg.surface-subtle` | `#252623` | Quiet panel/table header |
| `color.dark.bg.input` | `#1B1C19` | Inputs, selects |
| `color.dark.bg.hover` | `#2A2B28` | Hovered rows and controls |
| `color.dark.bg.selected` | `#30312E` | Selected neutral row/control |
| `color.dark.bg.disabled` | `#252623` | Disabled control |
| `color.dark.bg.sidebar` | `#161715` | Sidebar |
| `color.dark.text.primary` | `#F2F2F0` | Headings/primary copy |
| `color.dark.text.secondary` | `#D0D0CC` | Body and labels |
| `color.dark.text.tertiary` | `#A6A6A2` | Supporting copy |
| `color.dark.text.placeholder` | `#A6A6A2` | Essential placeholder |
| `color.dark.text.disabled` | `#A6A6A2` | Essential disabled label; show state through background/border |
| `color.dark.text.inverse` | `#212121` | Standard inverse text on light fills |
| `color.dark.text.inverse-white` | `#FFFFFF` | Pure white text when exact white is needed on dark fills |
| `color.dark.border.subtle` | `#2B2C29` | Low-priority separators |
| `color.dark.border.default` | `#3A3B37` | Input/card boundary |
| `color.dark.border.strong` | `#51524D` | Emphasized boundary; non-text UI |
| `color.dark.border.emphasis` | `#70716B` | High-emphasis non-text outline |
| `color.dark.icon.primary` | `#D4D4D1` | Primary icon |
| `color.dark.icon.secondary` | `#A6A6A2` | Secondary icon |
| `color.dark.icon.subtle` | `#A6A6A2` | Informative icon; `#858681` decorative only |
| `color.dark.icon.disabled` | `#A6A6A2` | Essential disabled icon; pair with disabled surface |
| `color.dark.icon.inverse` | `#212121` | Standard inverse icon on light surface |
| `color.dark.icon.inverse-white` | `#FFFFFF` | Pure white icon when exact white is needed on dark surface |
| `color.dark.sidebar.logo` | `#EEEEEE` | Logo |
| `color.dark.sidebar.section` | `#8E8E8A` | Group label |
| `color.dark.sidebar.item` | `#A6A6A2` | Inactive label/icon |
| `color.dark.sidebar.item-hover` | `#D4D4D1` | Hovered label/icon |
| `color.dark.sidebar.item-active` | `#FCFCFC` | Active label/icon |
| `color.dark.sidebar.item-active-bg` | `#30312E` | Active row |
| `color.dark.link.default` | `#9FC4DF` | Link text |
| `color.dark.link.hover` | `#C2DDF0` | Hover link |
| `color.dark.focus` | `#9FC4DF` | Keyboard focus ring |

### 2.4 Card-header tints

| Token | Value | Use |
|---|---:|---|
| `color.light.card-header.lavender` | `#F9F2FC` | General/overview |
| `color.light.card-header.peach` | `#F9EBE1` | Reservation/warm category |
| `color.light.card-header.neutral` | `#F5F5F5` | System/neutral category |
| `color.dark.card-header.lavender` | `#302B32` | Dark-mode general/overview |
| `color.dark.card-header.peach` | `#332B26` | Dark-mode reservation/warm category |
| `color.dark.card-header.neutral` | `#252623` | Dark-mode system/neutral category |

Use primary theme text/icons on these fills. Avoid putting small muted text over tints; do not use tints alone to encode status. Dark mode uses the matching `color.dark.card-header.*` tokens.

### 2.5 Status colors

| Token | Light background / foreground | Dark background / foreground |
|---|---|---|
| `color.light.status.success` / `color.dark.status.success` | `#EAF4EC` / `#28613A` | `#203327` / `#9DD3A8` |
| `color.light.status.warning` / `color.dark.status.warning` | `#FBF2DF` / `#765315` | `#382F1D` / `#E8C879` |
| `color.light.status.error` / `color.dark.status.error` | `#F8E9E7` / `#8C342C` | `#3B2523` / `#E5A09A` |
| `color.light.status.info` / `color.dark.status.info` | `#EAF0F5` / `#35566E` | `#222F39` / `#9FC4DF` |

Use these pairs for compact badges, alerts, and inline feedback. Include a text label and/or meaningful icon. Check the foreground/background pair against the required contrast for its use.

### 2.6 Data visualization tokens

| Token | Value | Use |
|---|---:|---|
| `color.chart.series-1` | `#35566E` | Primary series |
| `color.chart.series-2` | `#5C6B5A` | Secondary series |
| `color.chart.series-3` | `#9A6A45` | Tertiary series |
| `color.chart.series-4` | `#7B668A` | Fourth series |
| `color.chart.grid` light/dark | `#D4D4D1` / `#3A3B37` | Gridline |
| `color.chart.axis` light/dark | `#666663` / `#A6A6A2` | Axis labels |

Use direct labels, markers, or patterns in addition to color. Keep series distinguishable in grayscale and avoid assigning meaning solely by hue. These chart colors are visual series, not text colors unless contrast is separately verified.

## 3. Typography

### Font families

| Token | Family | Use |
|---|---|---|
| `font-sans` | Inter, sans-serif | Body, labels, controls, tables, data |
| `font-heading` | Plus Jakarta Sans, sans-serif | Page, section, and card headings |

### Type scale

| Token | Font | Size / line height | Default weight | Use |
|---|---|---:|---:|---|
| `text-label-xs` | Inter | 11 / 16px | 500 or 600 | Dense labels only |
| `text-label-sm` | Inter | 12 / 16px | 500 or 600 | Form labels, table headings |
| `text-body-xs` | Inter | 12 / 16px | 400 | Compact supporting text |
| `text-body-sm` | Inter | 13 / 20px | 400 | Dense tables/control text |
| `text-body-md` | Inter | 14 / 20px | 400 | Default body/form text |
| `text-body-lg` | Inter | 16 / 24px | 400 | Prominent body copy |
| `text-heading-sm` | Plus Jakarta Sans | 16 / 24px | 600 | Small section heading |
| `text-heading-md` | Plus Jakarta Sans | 18 / 28px | 600 | Card/section heading |
| `text-heading-lg` | Plus Jakarta Sans | 20 / 28px | 600 | Major section heading |
| `text-heading-xl` | Plus Jakarta Sans | 22 / 32px | 600 | Page subheading |
| `text-heading-2xl` | Plus Jakarta Sans | 24 / 32px | 600 | Standard page title |
| `text-heading-3xl` | Plus Jakarta Sans | 32 / 40px | 700 | Dashboard hero title |

### Body and label weight variants

| Size | Required variants |
|---|---|
| 12px body | Regular 400, Medium 500, Semibold 600, Bold 700 |
| 13px body | Regular 400, Medium 500, Semibold 600, Bold 700 |
| 14px body | Regular 400, Medium 500, Semibold 600, Bold 700 |
| 16px body | Regular 400, Medium 500, Semibold 600, Bold 700 |
| 11px label | Medium 500, Semibold 600 |
| 12px label | Medium 500, Semibold 600 |

Naming: `text-body-sm-medium`, `text-body-md-bold`, `text-label-xs-semibold`, etc. Plus Jakarta Sans heading weights available: Medium 500, Semibold 600, Bold 700. Use 600 by default; 700 for top-level emphasis.

### Type usage and edge cases

- Page titles: 24px/32 Semibold by default; 32px/40 Bold for dashboard welcome/hero where space allows.
- Card/section headings: 16–20px Semibold. Use 22px for a page-level subsection, not every card.
- Body: 14px/20 Regular; 16px/24 for primary explanatory copy.
- Dense tables: 13px/20. Do not reduce below 12px for essential content.
- Labels: 12px Medium by default. 11px is reserved for compact, secondary labels.
- Numeric KPI values: 24–32px Semibold/Bold; use tabular numerals if available.
- Long headings: allow wrapping; do not truncate without a way to reveal the full label.
- Links in body copy: underline by default. Inline links must remain distinguishable without relying on color alone.
- Text in all caps: use sparingly for short group labels; never apply to sentences.

## 4. Spacing

Primary layout values follow an 8px grid. 4px increments support controlled compactness; values 12px and 20px are half-grid exceptions for local component gaps, not page layout.

| Token | Value | Usage |
|---|---:|---|
| `spacing-1` | 4px | Icon/text gap, micro inset |
| `spacing-2` | 8px | Compact internal gap |
| `spacing-3` | 12px | Compact component gap |
| `spacing-4` | 16px | Standard control and content gap |
| `spacing-5` | 20px | Local component exception |
| `spacing-6` | 24px | Card padding / section gap |
| `spacing-8` | 32px | Main layout gap |
| `spacing-10` | 40px | Major content separation |
| `spacing-12` | 48px | Large section gap |
| `spacing-14` | 56px | Large page rhythm |
| `spacing-16` | 64px | Major separation |
| `spacing-20` | 80px | Spacious section separation |
| `spacing-24` | 96px | Rare, large page separation |

Default layout should use 8, 16, 24, 32, 40, 48, 56, 64, 80, or 96px. Use 4, 12, or 20px only where density or optical alignment benefits.

## 5. Radius

| Token | Value | Usage |
|---|---:|---|
| `rounded-sm` | 4px | Compact chips and small badges |
| `rounded-md` | 8px | Buttons, inputs, small controls |
| `rounded-lg` | 12px | Cards, menus, popovers |
| `rounded-xl` | 16px | Dialogs and larger panels |
| `rounded-2xl` | 20px | Special feature panels only |
| `rounded-full` | 9999px | Avatars and pill badges |

Use 8px for buttons/inputs, 12px for cards, 16px for dialogs. Keep a screen to three radii or fewer when practical.

## 6. Borders, focus, and elevation

### Border ramp

| Token | Light | Dark | Appropriate use |
|---|---:|---:|---|
| Subtle | `#E8E8E6` (light) / `#2B2C29` (dark) | Separators only |
| Default | `#D4D4D1` (light) / `#3A3B37` (dark) | Inputs/cards |
| Strong | `#B8B8B4` (light) / `#51524D` (dark) | Non-text highlighted boundary |
| Emphasis | `#8E8E8A` (light) / `#70716B` (dark) | Non-text high-emphasis outline |

Use 1px default border and 2px focus outline. Borders are UI graphics; ensure at least 3:1 contrast against adjacent surfaces when the boundary is needed to identify a control.

### Focus

Use `color.light.focus` or `color.dark.focus` as a 2px outline with 2px offset. Ensure it is visible against both the component and its surrounding surface. Do not suppress the browser focus indicator without replacing it.

### Elevation

| Token | Shadow | Use |
|---|---|---|
| `shadow-none` | none | Flat canvas/rows |
| `shadow-sm` | `0 1px 2px rgba(22,23,21,0.06)` | Cards and controls |
| `shadow-md` | `0 4px 12px rgba(22,23,21,0.08)` | Menus and popovers |
| `shadow-lg` | `0 12px 32px rgba(22,23,21,0.12)` | Dialog over page |

Dark theme relies mainly on surface contrast and borders; shadows may be removed when they muddy the surface hierarchy.

## 7. Icons

| Role | Light | Dark |
|---|---:|---:|
| Subtle/informative | `#666663` | `#A6A6A2` |
| Decorative only | `#92928F` | `#858681` |
| Secondary | `#666663` | `#A6A6A2` |
| Primary | `#3F3F3D` | `#D4D4D1` |
| Strong | `#212121` | `#FCFCFC` |
| Inverse | `#EEEEEE` | `#212121` |
| Inverse white | `#FFFFFF` | `#FFFFFF` |

Use 16px icons for compact controls and 20px for primary navigation/actions. Decorative icons may be 12–14px and may use the subdued decorative token. Essential icons must meet non-text contrast against adjacent fills and should not be the only way to identify an action; provide a label or accessible name.

## 8. Component and scenario rules

| Scenario | Rule |
|---|---|
| App shell | Sidebar `#161715`; light header `#FCFCFC`; light canvas `#EDEDED`. Dark theme uses its own canvas/header/surface tokens. |
| Sidebar navigation | Active state changes both text/icon and row background. Essential inactive text uses the accessible recommendation; reference-muted values may remain for low-priority or large labels. |
| Header | 64px default height; 24px horizontal padding; search must have a visible label or accessible name. |
| Page heading | 24px/32 Semibold default; 32px/40 Bold for spacious dashboard hero. Keep title and actions aligned without forcing truncation. |
| Cards | 1px default border, 12px radius, 24px padding. Use white surface in light mode; use dark surface token in dark mode. |
| Card header accents | Use lavender, peach, or neutral fill; keep card body in main surface. Ensure header title remains legible. |
| Primary button | Use the product’s separately defined action/brand color. This neutral palette does not define a saturated primary action fill. Specify hover, pressed, focus, disabled, and loading in that action palette before production. |
| Secondary button | Surface or transparent fill, default border, primary text; hover uses theme hover surface. |
| Destructive action | Status error foreground/fill, clear verb label, and confirmation for irreversible actions. |
| Input/select | 14px Inter, 40px minimum height, visible label, helper/error text outside placeholder, default border, focus outline. |
| Validation | Associate error text with field; add icon or message, not only red border. Keep entered value readable. |
| Disabled control | Keep essential text legible; muted surface/border plus disabled behavior. Do not rely on opacity alone. Explain unavailable reason when useful. |
| Table | 13px body, 48–56px row height, 12–16px cell padding, subtle row dividers. Sortable headers expose direction and active state. |
| Table selection | Use selected background plus checkbox/selection indicator. Preserve hover and focus visibility. |
| Empty state | State what is empty, why if known, and the next available action. Use neutral surface and one clear CTA. |
| Loading | Preserve layout dimensions; use skeletons for content regions and progress text for long operations. Respect reduced motion. |
| Error/alert | Provide concise explanation and recovery action; use status icon and text. Keep alert contrast compliant. |
| Success confirmation | Confirm the completed action in text; avoid color-only feedback; do not leave transient confirmation as the only record for important changes. |
| Modal/dialog | 16px radius, clear title, labelled actions, focus trap, Escape behavior where appropriate, return focus to trigger. |
| Tooltip | Use for supplemental explanation only, not essential instructions; ensure keyboard and touch access. |
| Charts | Use series tokens plus labels/markers; include units and time range; do not rely on hue alone. |
| Dense data/KPIs | Use tabular numerals, explicit units/currency, and contextual period. Avoid ambiguous color-only trend arrows. |
| Reduced motion | Remove nonessential animation; keep state change understandable without movement. |
| Responsive layout | At narrow widths, collapse sidebar to an accessible drawer, stack cards, preserve essential actions, and allow tables to scroll or transform without hiding data. |
| Zoom/reflow | At 200% zoom or narrow viewport, content must reflow without overlap or loss of actions; allow long labels to wrap. |
| Localization | Allow for longer strings, locale-specific date/number formats, and text expansion. Do not hard-code English label widths. |
| Keyboard-only | Logical tab order, visible focus, no keyboard traps outside dialogs, full operation of menus and controls. |

### Baseline component dimensions

| Component | Default |
|---|---|
| Sidebar | 240–256px wide on desktop; accessible drawer on compact screens |
| Header | 64px high; 24px horizontal inset |
| Button | 40px minimum height; 14px Inter Medium/Semibold; 16px horizontal padding; 8px radius |
| Input | 40px minimum height; 14px Inter; 12px horizontal padding; 8px radius |
| Card | 24px padding; 12px radius |
| Table row | 48–56px, depending on density |
| Badge | 12px Inter Medium; 4px vertical / 8px horizontal padding |

Dimensions are defaults, not hard constraints. Use larger controls when needed for touch/accessibility.

## 9. Accessibility and contrast audit

Ratios below are calculated using WCAG relative luminance for the named foreground/background pairs. For normal text, target at least 4.5:1; for large text (at least 24px regular or 18.66px bold), target at least 3:1. Essential UI boundaries/icons should target at least 3:1 against adjacent colors. Disabled controls are exempt from WCAG contrast requirements, but should remain understandable where their status matters.

| Pair | Approx. ratio | Finding |
|---|---:|---|
| `#80807E` on `#161715` | 4.55:1 | Passes normal-text threshold narrowly; avoid reducing opacity or using thinner type |
| `#3F3F3D` on `#161715` | 1.70:1 | Fails; use `#8E8E8A` for small/essential section labels |
| `#8E8E8A` on `#161715` | 5.47:1 | Passes normal text |
| `#212121` on `#EDEDED` | 13.75:1 | Passes |
| `#4B4B49` on `#EDEDED` | 7.47:1 | Passes |
| `#666663` on `#EDEDED` | 4.92:1 | Passes narrowly; do not lighten for essential text |
| `#92928F` on `#EDEDED` | 2.67:1 | Fails normal text and non-text UI; decorative only |
| `#92928F` on `#FFFFFF` | 3.12:1 | Fails normal text; acceptable only for large text/non-text where applicable |
| `#B8B8B4` on `#FFFFFF` | 1.99:1 | Fails UI-boundary contrast; decorative/disabled only |
| `#F2F2F0` on `#111210` | 16.76:1 | Passes |
| `#D0D0CC` on `#111210` | 12.15:1 | Passes |
| `#A6A6A2` on `#111210` | 7.69:1 | Passes |
| `#858681` on `#111210` | 5.12:1 | Passes narrowly; avoid opacity reduction |
| `#6F706C` on `#111210` | 3.77:1 | Fails normal text; large text only, or use `#A6A6A2` for essential disabled copy |
| `#D4D4D1` on `#1F201D` | 11.02:1 | Passes |
| `#A6A6A2` on `#1F201D` | 6.70:1 | Passes |
| `#858681` on `#1F201D` | 4.46:1 | Slightly fails normal-text threshold; use `#A6A6A2` for essential text/icons |
| `#5F605C` on `#1F201D` | 2.58:1 | Fails; disabled/decorative only |

For any unlisted pairing, validate the exact foreground, background, font size/weight, and state. Tinted cards, status chips, links, chart labels, and focus rings need their own pairing checks. Do not apply opacity to a token that already passes narrowly.

### Inverse foreground convention

`inverse` is the standard semantic role for a foreground placed on a contrasting surface (commonly dark). Use `color.{theme}.text.inverse` or `color.{theme}.icon.inverse` for the default inverse foreground. Use the explicit `*-inverse-white` token only when pure white `#FFFFFF` is specifically required; `inverse` in itself does not mean pure white. Keep `#FCFCFC` as the standard near-white light-theme inverse text, and retain `#EEEEEE` for the light-theme inverse icon/brand mark. The exact-white variants are available for high-contrast product marks and cases that require true white.

## 10. Token uniqueness and naming

Names are utility-inspired but semantic and framework-agnostic:

- Color: `color.{theme}.{group}.{role}` (e.g. `color.light.text.primary`, `color.dark.border.default`). Every theme-specific token has an explicit `light` or `dark` segment.
- Typography: `font-heading`, `font-sans`, `text-body-md-semibold`.
- Spacing: `spacing-{step}` (e.g. `spacing-4` = 16px).
- Radius: `rounded-{size}` (e.g. `rounded-lg` = 12px).
- Elevation: `shadow-{size}`.

A token is defined once in its semantic source table; later sections may refer to it but must not redefine it. Paired theme values use separate names (for example, `color.light.card-header.lavender` and `color.dark.card-header.lavender`). Keep raw values centralized; components should consume semantic tokens.

## 11. Release checklist

Before calling an implementation production-ready, verify:

- Light and dark themes across default, hover, active, selected, focus, disabled, loading, error, and success states.
- Text and icon contrast on every actual surface, including tinted cards, badges, sidebar, table hover/selection, and placeholders.
- Keyboard operation, visible focus, accessible names, labels, and error associations.
- Responsive reflow, 200% zoom, long localized copy, empty data, large data, and narrow tables.
- Chart labels, units, series distinctions, and non-color cues.
- No essential instructions are supplied only by placeholder, tooltip, color, or transient toast.
- No layout shifts when loading or validation messages appear.

A design specification can define these requirements; only implementation-specific review can establish that every screen meets them.
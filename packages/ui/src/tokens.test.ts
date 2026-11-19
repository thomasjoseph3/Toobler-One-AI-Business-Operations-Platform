import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';

const tokensCss = fs.readFileSync(path.join(import.meta.dirname, 'tokens.css'), 'utf8');

/** Returns the text between the braces of the first block that starts with `opening`. */
function blockAfter(opening: string): string {
  const start = tokensCss.indexOf(opening);
  if (start < 0) throw new Error(`tokens.css has no block "${opening}"`);
  const bodyStart = tokensCss.indexOf('{', start) + 1;
  let depth = 1;
  let position = bodyStart;
  while (depth > 0 && position < tokensCss.length) {
    if (tokensCss[position] === '{') depth++;
    if (tokensCss[position] === '}') depth--;
    position++;
  }
  return tokensCss.slice(bodyStart, position - 1);
}

/** Reads every `--name: value;` line of a block into a map. */
function readVariables(block: string): Map<string, string> {
  const variables = new Map<string, string>();
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) variables.set(match[1]!, match[2]!.trim());
  return variables;
}

const lightTheme = readVariables(blockAfter('@theme static'));
const darkByChoice = readVariables(blockAfter(":root[data-theme='dark']"));
const darkBySystem = readVariables(blockAfter(':root:not'));
const darkTheme = new Map([...lightTheme, ...darkByChoice]); // the dark theme overrides the light values

/** The colour of a token in a theme. */
const colorOf = (theme: Map<string, string>, tokenName: string): string => {
  const value = theme.get(`--color-${tokenName}`);
  if (!value) throw new Error(`No token --color-${tokenName}`);
  return value;
};

type Pair = { foreground: string; background: string; minimum: number; note: string };

// Text needs 4.5:1 (WCAG AA); meaningful graphics and focus indicators need 3:1.
const pairsToCheck = (): Pair[] => {
  const pairs: Pair[] = [];
  // Body text on every surface it can sit on (v1.3 section 9)
  for (const background of ['canvas', 'header', 'surface', 'surface-subtle', 'input', 'hover']) {
    for (const foreground of ['text-primary', 'text-secondary', 'text-tertiary']) {
      pairs.push({ foreground, background, minimum: 4.5, note: 'text' });
    }
  }
  pairs.push({ foreground: 'text-placeholder', background: 'input', minimum: 4.5, note: 'placeholder' });
  pairs.push({ foreground: 'text-disabled', background: 'disabled', minimum: 4.5, note: 'essential disabled label' });
  // Text on the card-header tints
  for (const tint of ['lavender', 'peach', 'neutral']) {
    pairs.push({ foreground: 'text-primary', background: `card-header-${tint}`, minimum: 4.5, note: 'card title' });
  }
  // Sidebar
  pairs.push({ foreground: 'sidebar-item', background: 'sidebar', minimum: 4.5, note: 'inactive menu item' });
  pairs.push({ foreground: 'sidebar-section', background: 'sidebar', minimum: 4.5, note: 'menu group label' });
  pairs.push({ foreground: 'sidebar-logo', background: 'sidebar', minimum: 4.5, note: 'logo' });
  pairs.push({
    foreground: 'sidebar-item-active',
    background: 'sidebar-item-active-bg',
    minimum: 4.5,
    note: 'active item',
  });
  pairs.push({
    foreground: 'sidebar-item-hover',
    background: 'sidebar-item-active-bg',
    minimum: 4.5,
    note: 'hovered item',
  });
  // Links and focus
  pairs.push({ foreground: 'link', background: 'surface', minimum: 4.5, note: 'link' });
  pairs.push({ foreground: 'link', background: 'canvas', minimum: 4.5, note: 'link on canvas' });
  pairs.push({ foreground: 'focus', background: 'surface', minimum: 3, note: 'focus indicator' });
  pairs.push({ foreground: 'focus', background: 'canvas', minimum: 3, note: 'focus indicator on canvas' });
  // Primary action (not in v1.3: our proposal from the Figma frame)
  for (const state of ['action', 'action-hover', 'action-pressed']) {
    pairs.push({ foreground: 'action-text', background: state, minimum: 4.5, note: 'primary button label' });
  }
  // Controls: the boundary that identifies a control needs 3:1
  pairs.push({ foreground: 'border-emphasis', background: 'surface', minimum: 3, note: 'checkbox outline' });
  pairs.push({ foreground: 'border-default', background: 'input', minimum: 3, note: 'input boundary' });
  // Status badges and alerts
  for (const state of ['success', 'warning', 'error', 'info']) {
    pairs.push({ foreground: state, background: `${state}-bg`, minimum: 4.5, note: `${state} badge` });
  }
  // Lead-stage tags (Figma): the text colour depends on the tone
  for (const tone of ['new', 'won', 'lost']) {
    pairs.push({ foreground: 'link-hover', background: `tag-stage-${tone}`, minimum: 4.5, note: `${tone} tag` });
  }
  for (const tone of ['contacted', 'qualified', 'rate-sent']) {
    pairs.push({ foreground: 'text-secondary', background: `tag-stage-${tone}`, minimum: 4.5, note: `${tone} tag` });
  }
  return pairs;
};

// Delivered values that do not reach the minimum. Each entry names the theme, the pair and the highest ratio it is
// allowed to have: a pair that gets WORSE fails, and a pair that is fixed must be removed from this list. Filled in
// from the first run of this test (see docs/FRONTEND.md section 5).
const KNOWN_EXCEPTIONS: Record<string, number> = {
  // v1.3 says inputs use border.default, and also that a boundary needed to identify a control needs 3:1. Both cannot hold.
  'light border-default on input': 1.49,
  'dark border-default on input': 1.52,
};

describe('design tokens', () => {
  it('has the same dark theme in both places (the manual switch and the system setting)', () => {
    expect(Object.fromEntries(darkBySystem)).toEqual(Object.fromEntries(darkByChoice));
  });

  it('defines every colour token in both themes where the designer gives a dark value', () => {
    for (const tokenName of [
      'canvas',
      'header',
      'surface',
      'text-primary',
      'border-default',
      'link',
      'focus',
      'action',
      'success',
      'warning',
      'error',
      'info',
      'tag-stage-new',
    ]) {
      expect(darkTheme.get(`--color-${tokenName}`), tokenName).toBeDefined();
      expect(darkByChoice.has(`--color-${tokenName}`), `${tokenName} should be redefined for dark`).toBe(true);
    }
  });

  for (const [themeName, theme] of [
    ['light', lightTheme],
    ['dark', darkTheme],
  ] as const) {
    describe(`${themeName} theme contrast`, () => {
      for (const pair of pairsToCheck()) {
        const label = `${themeName} ${pair.foreground} on ${pair.background}`;
        it(`${label} (${pair.note})`, () => {
          const ratio = contrastRatio(colorOf(theme, pair.foreground), colorOf(theme, pair.background));
          const knownRatio = KNOWN_EXCEPTIONS[label];
          if (knownRatio === undefined) {
            expect(ratio, `${label} is ${ratio.toFixed(2)}:1, needs ${pair.minimum}:1`).toBeGreaterThanOrEqual(
              pair.minimum,
            );
          } else {
            // A known exception: it must really be below the minimum (else remove it from the list) and not get worse.
            expect(ratio, `${label} now passes: remove it from KNOWN_EXCEPTIONS`).toBeLessThan(pair.minimum);
            expect(ratio, `${label} got worse than the delivered ${knownRatio}:1`).toBeGreaterThanOrEqual(
              knownRatio - 0.005,
            );
          }
        });
      }
    });
  }

  it('lists no exception that is not a real pair above', () => {
    const checkedLabels = new Set(
      (['light', 'dark'] as const).flatMap((themeName) =>
        pairsToCheck().map((pair) => `${themeName} ${pair.foreground} on ${pair.background}`),
      ),
    );
    for (const label of Object.keys(KNOWN_EXCEPTIONS)) expect(checkedLabels.has(label), label).toBe(true);
  });
});

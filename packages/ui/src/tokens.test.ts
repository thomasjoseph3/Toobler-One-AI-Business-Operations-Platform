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
  for (const background of ['canvas', 'surface', 'surface-muted']) {
    for (const foreground of ['text-primary', 'text-secondary', 'text-muted']) {
      pairs.push({ foreground, background, minimum: 4.5, note: 'text' });
    }
  }
  pairs.push({ foreground: 'action', background: 'surface', minimum: 4.5, note: 'link and action text' });
  pairs.push({ foreground: 'action', background: 'action-subtle', minimum: 4.5, note: 'selected navigation text' });
  pairs.push({ foreground: 'white', background: 'action', minimum: 4.5, note: 'primary button label' });
  pairs.push({ foreground: 'focus-ring', background: 'surface', minimum: 3, note: 'focus indicator' });
  for (const state of ['success', 'warning', 'error', 'info']) {
    pairs.push({ foreground: state, background: `${state}-bg`, minimum: 4.5, note: `${state} badge` });
  }
  return pairs;
};

// The designer's delivered values that do not reach the minimum. The owner decided to keep them (docs/FRONTEND.md
// section 5). Each entry names the theme, the pair and the highest ratio it is allowed to have: a pair that gets
// WORSE fails, and a pair that is fixed must be removed from this list.
const KNOWN_EXCEPTIONS: Record<string, number> = {
  'light text-muted on canvas': 3.58,
  'light text-muted on surface': 3.88,
  'light text-muted on surface-muted': 3.52,
  'light action on action-subtle': 4.19,
  'light focus-ring on surface': 2.82,
  'dark white on action': 2.98,
  'dark action on action-subtle': 3.92, // found by this test on 10 Nov 2026 (not in the first analysis); same cause as the light one
};

describe('design tokens', () => {
  it('has the same dark theme in both places (the manual switch and the system setting)', () => {
    expect(Object.fromEntries(darkBySystem)).toEqual(Object.fromEntries(darkByChoice));
  });

  it('defines every colour token in both themes where the designer gives a dark value', () => {
    for (const tokenName of [
      'canvas',
      'surface',
      'text-primary',
      'action',
      'focus-ring',
      'success',
      'warning',
      'error',
      'info',
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

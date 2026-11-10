// WCAG 2.2 contrast arithmetic (pure functions, no dependencies): used by the token test.

/** Turns "#rrggbb" into red, green and blue numbers from 0 to 255. */
export function parseHexColor(hex: string): [number, number, number] {
  const cleaned = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) throw new Error(`Not a 6-digit hex colour: "${hex}"`);
  return [0, 2, 4].map((start) => Number.parseInt(cleaned.slice(start, start + 2), 16)) as [number, number, number];
}

/** The relative luminance of a colour (0 black ... 1 white), as defined by WCAG. */
export function relativeLuminance(hex: string): number {
  const [red, green, blue] = parseHexColor(hex).map((channel) => {
    const fraction = channel / 255;
    return fraction <= 0.03928 ? fraction / 12.92 : ((fraction + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** The contrast ratio between two colours, from 1 (identical) to 21 (black on white). */
export function contrastRatio(firstHex: string, secondHex: string): number {
  const first = relativeLuminance(firstHex);
  const second = relativeLuminance(secondHex);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

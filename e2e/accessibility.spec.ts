import AxeBuilder from '@axe-core/playwright';
import { expect, PAGES, test } from './support';

// Automatic accessibility checks (WCAG 2.2 AA) on every page, in both themes.
//
// Known exceptions, from the designer's colours which we use unchanged (docs/FRONTEND.md section 5, owner decision):
// the label on the primary button in dark mode, and the text of the selected menu item. Those two exact elements are
// left out of the contrast check; everything else on the page is checked, and any other contrast problem fails.
const KNOWN_CONTRAST_EXCEPTIONS = ['[aria-current="page"]', '.bg-action'];

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const pagesToCheck: { name: string; path: string; isSignedOut?: boolean }[] = [
  ...PAGES.map((pageEntry) => ({ name: pageEntry.label, path: pageEntry.path })),
  { name: 'Sign in', path: '/sign-in', isSignedOut: true },
  { name: 'Not found', path: '/nothing-here' },
  { name: 'UI gallery', path: '/dev/ui' },
];

for (const theme of ['light', 'dark'] as const) {
  for (const pageEntry of pagesToCheck) {
    test(`${pageEntry.name} has no accessibility violations (${theme})`, async ({ page, pretendApi }) => {
      pretendApi.signedIn = !pageEntry.isSignedOut;
      await page.addInitScript((chosenTheme) => window.localStorage.setItem('toobler-theme', chosenTheme), theme);
      await page.goto(pageEntry.path);
      await expect(
        page
          .getByRole('heading', { level: 1 })
          .or(page.getByRole('heading', { level: 2 }))
          .first(),
      ).toBeVisible();

      const contrastExceptionResults = new AxeBuilder({ page }).withTags(WCAG_TAGS);
      for (const selector of KNOWN_CONTRAST_EXCEPTIONS) contrastExceptionResults.exclude(selector);
      const checkedWithExceptions = await contrastExceptionResults.analyze();

      // The excluded elements are still checked for everything except contrast.
      const checkedWithoutContrast = await new AxeBuilder({ page })
        .withTags(WCAG_TAGS)
        .disableRules(['color-contrast'])
        .analyze();

      const violations = [...checkedWithExceptions.violations, ...checkedWithoutContrast.violations];
      const summary = violations.map(
        (violation) =>
          `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(' ')).join(' | ')})`,
      );
      expect(summary).toEqual([]);
    });
  }
}

import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

for (const route of ['home', 'training', 'settings', 'privacy']) {
  test(`${route} has no automatically detectable serious accessibility violations`, async ({ page }) => {
    await page.goto(`/#${route}`);
    await page.addScriptTag({ path: axePath });
    const violations = await page.evaluate(async () => {
      const result = await window.axe.run(document, {
        resultTypes: ['violations'],
        rules: { 'color-contrast': { enabled: false } }
      });
      return result.violations.filter(item => ['critical', 'serious'].includes(item.impact));
    });
    expect(violations).toEqual([]);
  });
}

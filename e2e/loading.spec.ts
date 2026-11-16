import { expect, test } from '@playwright/test';

test('long engine loads show elapsed time and can copy page-owned diagnostics without Wasm calls', async ({ page, context }) => {
  // Hold the real downloader so this UI check needs neither assets nor engine threads.
  await context.route('**/nacht/manifest.json', () => {});
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/nacht');
  await page.waitForFunction(() => Boolean(globalThis.bo1z));
  await page.evaluate(() => {
    bo1z.view.screen = 'loading';
    bo1z.view.eta = 1;
    bo1z.diagnostics.timings.engineStart = performance.now() - 90000;
    bo1z.diagnostics.console.push({ ms: performance.now(), message: 'test engine milestone', error: false });
    bo1z.diagnostics.canvas = { width: 800, height: 450 };
  });
  await expect(page.locator('.kb-status small')).toHaveText(/9\d s écoulées/);
  await expect(page.locator('.kb-status small')).not.toContainText('presque');
  await page.click('#loading-details summary');
  const text = await page.locator('#loading-details pre').innerText();
  const report = JSON.parse(text);
  expect(report.screen).toBe('loading');
  expect(report.canvas).toEqual({ width: 800, height: 450 });
  expect(report.console.at(-1).message).toBe('test engine milestone');
  expect(report.elapsedEngineSeconds).toBeGreaterThanOrEqual(90);
  await page.click('#loading-details button');
  const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(copied.console.at(-1).message).toBe('test engine milestone');
});

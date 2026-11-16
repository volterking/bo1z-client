import { expect, test } from '@playwright/test';

test('graphics controls persist across visits without changing other settings', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Options', exact: true }).click();
  for (const size of ['640x360', '800x450', '960x540', '1280x720']) {
    await page.selectOption('#o-resolution', size);
    await expect(page.locator('#o-resolution')).toHaveValue(size);
  }
  await page.selectOption('#o-resolution', '800x450');
  await page.selectOption('#o-graphics', 'very-low');
  await page.selectOption('#o-renderer', 'webgl2');
  await page.check('#o-perf');
  await page.reload();
  await page.getByRole('button', { name: 'Options', exact: true }).click();
  await expect(page.locator('#o-resolution')).toHaveValue('800x450');
  await expect(page.locator('#o-graphics')).toHaveValue('very-low');
  await expect(page.locator('#o-renderer')).toHaveValue('webgl2');
  await expect(page.locator('#o-perf')).toBeChecked();
  await expect(page.locator('#o-n')).toHaveValue('300');
});

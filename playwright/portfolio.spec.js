const { test, expect } = require('@playwright/test');

test.describe('Resume Intelligence critical workflow', () => {
  test('loads, edits resume, persists, analyzes, and invalidates stale results', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Resume Intelligence');
    await page.getByRole('button', { name: 'Resume Intelligence — Overview' }).click();
    await expect(page.locator('#view-dashboard')).toHaveClass(/active/);
    await page.getByRole('button', { name: 'Resume Intelligence — Overview' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#view-dashboard')).toHaveClass(/active/);
    await page.locator('.nav-item[data-view="resume"]').click();
    await page.locator('#structured-name').fill('QA Engineer');
    await page.reload();
    await page.locator('.nav-item[data-view="resume"]').click();
    await expect(page.locator('#structured-name')).toHaveValue('QA Engineer');
    await page.getByRole('button', { name: 'Job description' }).click();
    await page.locator('#job-description').fill('Requirements:\n- Python experience required');
    await page.getByRole('button', { name: 'Overview', exact: true }).click()
    await page.getByRole('button', { name: 'Job description', exact: true }).click();
    await expect(page.locator('#job-description')).toHaveValue('Requirements:\n- Python experience required');
    await page.reload();
    await page.getByRole('button', { name: 'Job description', exact: true }).click();
    await expect(page.locator('#job-description')).toHaveValue('Requirements:\n- Python experience required');
    await page.getByRole('button', { name: /Run baseline analysis/ }).click();
    await expect(page.locator('#job-analysis-result').getByRole('heading', { name: 'Baseline analysis' })).toBeVisible();
    await page.getByRole('button', { name: 'Match analysis' }).click();
    await page.getByRole('button', { name: 'Analyze match' }).click();
    await expect(page.locator('#match-analysis-result small').getByText('deterministic baseline', { exact: true })).toBeVisible();
    await page.locator('.nav-item[data-view="resume"]').click();
    await page.locator('#structured-name').fill('Changed Resume');
    await expect(page.locator('.analysis-stale p')).toContainText('Resume changed');
  });

  test('valid structured links render as anchors and unsafe URLs do not', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-item[data-view="resume"]').click();
    await page.locator('#structured-website').fill('https://example.com');
    await page.locator('#structured-github').fill('javascript:alert(1)');
    await page.locator('#structured-name').fill('Link Test');
    await page.locator('#structured-summary').fill('Engineer');
    await expect(page.locator('#preview a[href="https://example.com"]')).toHaveCount(1);
    await expect(page.locator('#preview a[href^="javascript:"]')).toHaveCount(0);
  });

  test('renders malicious input as text', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-item[data-view="resume"]').click();
    await page.locator('#structured-name').fill('<script>alert(1)</script>');
    await expect(page.locator('#preview h1')).toHaveText('<script>alert(1)</script>');
    await expect(page.locator('#preview h1')).not.toHaveAttribute('data-xss', 'executed');
  });
});

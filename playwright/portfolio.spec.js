const { test, expect } = require('@playwright/test');

const screenshotDirectory = '/tmp/agent-browser';

async function enterAnalysisInputs(page) {
  await page.locator('.nav-item[data-view="resume"]').click();
  await page.locator('#structured-name').fill('Alex Morgan');
  await page.locator('#structured-headline').fill('Software Engineer');
  await page.locator('#structured-summary').fill('Built Python services and SQL reporting tools for internal teams.');
  await page.locator('#structured-skills').fill('Python, SQL');
  await page.locator('.nav-item[data-view="job"]').click();
  await page.locator('#job-description').fill('Requirements:\n- Python experience required\n- Docker experience required\nPreferred:\n- Kubernetes');
  await page.locator('.nav-item[data-view="analysis"]').click();
  await page.locator('#run-analysis').click();
}

test.describe('Light glass workspace', () => {
  test('keeps all seven sections accessible with keyboard navigation and light mode', async ({ page }) => {
    await page.setViewportSize({ width: 937, height: 620 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('.nav-item')).toHaveCount(7);
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
    await expect(page.locator('#overview-score')).toHaveText('—');
    await page.screenshot({ path: `${screenshotDirectory}/verified-resume-overview-desktop.png`, animations: 'disabled' });
    await page.locator('.nav-item[data-view="dashboard"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.nav-item[data-view="resume"]')).toBeFocused();
    await expect(page.locator('.nav-item[data-view="resume"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#view-resume')).toBeVisible();
    await page.keyboard.press('End');
    await expect(page.locator('#view-settings')).toBeVisible();
    await page.keyboard.press('Home');
    await expect(page.locator('#view-dashboard')).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.nav-bubble')).toHaveCSS('transition-duration', '1e-05s');
  });

  test('traces real baseline results, filters evidence and shows honest priority labels', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await enterAnalysisInputs(page);
    await expect(page.locator('.match-score small')).toHaveText('deterministic baseline');
    await expect(page.locator('.breakdown-group')).toHaveCount(2);
    await expect(page.locator('.match-item')).toHaveCount(3);
    await expect(page.locator('.match-trace').first()).toHaveAttribute('open', '');
    await page.locator('.match-trace summary').nth(1).click();
    await expect(page.locator('.match-trace').nth(1)).toHaveAttribute('open', '');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${screenshotDirectory}/verified-resume-analysis-desktop.png`, animations: 'disabled' });
    await page.locator('.nav-item[data-view="evidence"]').click();
    await page.locator('#evidence-status-filter').selectOption('supported');
    await expect(page.locator('.evidence-record')).toHaveCount(1);
    await expect(page.locator('.evidence-record')).toContainText('resume.');
    await page.locator('.nav-item[data-view="gaps"]').click();
    await expect(page.locator('.gap-priority.high')).toHaveCount(1);
    await expect(page.locator('.gap-priority.medium')).toHaveCount(1);
    await page.locator('#gap-priority-filter').selectOption('high');
    await expect(page.locator('.skill-gap-record')).toHaveCount(1);
    await page.locator('.nav-item[data-view="dashboard"]').click();
    await expect(page.locator('#overview-score')).not.toHaveText('—');
    await page.screenshot({ path: `${screenshotDirectory}/verified-resume-overview-analyzed.png`, animations: 'disabled' });
    await page.locator('.nav-item[data-view="resume"]').click();
    await page.screenshot({ path: `${screenshotDirectory}/verified-resume-editor-desktop.png`, animations: 'disabled' });
    await expect(page.locator('#preview')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.locator('#preview')).toHaveCSS('backdrop-filter', 'none');
  });

  test('fits every section on mobile, including populated evidence', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await enterAnalysisInputs(page);
    for (const view of ['dashboard', 'resume', 'job', 'analysis', 'evidence', 'gaps', 'settings']) {
      await page.locator(`.nav-item[data-view="${view}"]`).click();
      await expect(page.locator(`#view-${view}`)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const dock = await page.locator('.sidebar').boundingBox();
      expect(dock.x).toBeGreaterThanOrEqual(0);
      expect(dock.x + dock.width).toBeLessThanOrEqual(375);
    }
    await page.locator('.nav-item[data-view="analysis"]').click();
    await page.screenshot({ path: `${screenshotDirectory}/verified-resume-analysis-mobile.png`, animations: 'disabled' });
    await page.locator('.nav-item[data-view="dashboard"]').click();
    await page.screenshot({ path: `${screenshotDirectory}/verified-resume-overview-mobile.png`, animations: 'disabled' });
    await page.setViewportSize({ width: 320, height: 700 });
    for (const view of ['dashboard', 'resume', 'job', 'analysis', 'evidence', 'gaps', 'settings']) {
      await page.locator(`.nav-item[data-view="${view}"]`).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });

  test('exports the paper resume and keeps print output free of application chrome', async ({ page }) => {
    await page.goto('/');
    await enterAnalysisInputs(page);
    await page.locator('.nav-item[data-view="resume"]').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#pdf-btn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('resume.pdf');
    expect(await download.failure()).toBeNull();
    await expect(page.locator('#toast')).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.sidebar')).not.toBeVisible();
    await expect(page.locator('.editor-panel')).not.toBeVisible();
    await expect(page.locator('#preview')).toBeVisible();
  });
});

test.describe('Resume Intelligence critical workflow', () => {
  test('loads, edits resume, persists, analyzes, and invalidates stale results', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Resume Intelligence');
    await page.locator('.nav-item[data-view="resume"]').click();
    await page.locator('#structured-name').fill('QA Engineer');
    await page.reload();
    await page.locator('.nav-item[data-view="resume"]').click();
    await expect(page.locator('#structured-name')).toHaveValue('QA Engineer');
    await page.getByRole('button', { name: 'Job description' }).click();
    await page.locator('#job-description').fill('Requirements:\n- Python experience required');
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

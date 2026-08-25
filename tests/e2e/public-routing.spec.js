import { test, expect } from '@playwright/test';

test('landing page stays public and protected sections show previews', async ({ page }) => {
  await page.goto('/#home');
  await expect(page.getByRole('heading', { name: 'Night Ops training.' })).toBeVisible();

  await page.getByRole('button', { name: /Start training/ }).click();
  await expect(page).toHaveURL(/#training$/);
  await expect(page.getByRole('heading', { name: 'Build your field skills.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Create account/ })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#home$/);
  await expect(page.getByRole('heading', { name: 'Night Ops training.' })).toBeVisible();
});

test('direct protected routes preserve the intended destination', async ({ page }) => {
  await page.goto('/#packing');
  await expect(page.getByRole('heading', { name: 'Pack with confidence.' })).toBeVisible();
  await page.getByRole('button', { name: /Log in/ }).last().click();
  await expect(page).toHaveURL(/#settings$/);
  await expect(page.getByRole('heading', { name: 'Sign in to Night Ops' })).toBeVisible();
});

test('unknown routes recover to the public home page', async ({ page }) => {
  await page.goto('/#does-not-exist');
  await expect(page).toHaveURL(/#home$/);
  await expect(page).toHaveTitle('Night Ops Training');
});

test('account screen separates sign-in and account creation', async ({ page }) => {
  await page.goto('/#settings');
  const signedOutAccount = page.locator('#auth-signed-out');
  await expect(page.getByRole('heading', { name: 'Sign in to Night Ops' })).toBeVisible();
  await expect(signedOutAccount.getByLabel('Display name')).toBeHidden();

  await page.getByRole('tab', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Create a Night Ops account' })).toBeVisible();
  await expect(signedOutAccount.getByLabel('Display name')).toBeVisible();
  await expect(page.getByRole('button', { name: /Create account/ }).last()).toBeVisible();
});

test('privacy information and account controls stay publicly reachable', async ({ page }) => {
  await page.goto('/#privacy');
  await expect(page).toHaveURL(/#privacy$/);
  await expect(page.getByRole('heading', { name: 'Your progress belongs to you.' })).toBeVisible();
  await page.getByRole('button', { name: /Manage my account/ }).click();
  await expect(page).toHaveURL(/#settings$/);
});

test('install metadata is available', async ({ page, request }) => {
  await page.goto('/#home');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest/);
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  await expect(manifest.json()).resolves.toMatchObject({ name: 'Night Ops Training', display: 'standalone' });
});

import { test, expect } from '@playwright/test';

// UI contract tests use mocked HTTP responses. PostgreSQL behavior is tested in Python.
const services = [
  { id: 1, name: 'Haircut', duration_minutes: 30, price_rupees: 400 },
  { id: 2, name: 'Hair spa', duration_minutes: 60, price_rupees: 1200 },
  { id: 3, name: 'Beard trim', duration_minutes: 15, price_rupees: 200 },
  { id: 4, name: 'Facial', duration_minutes: 45, price_rupees: 900 },
];
const stylists = [
  { id: 1, name: 'Meera', work_start: '10:00', work_end: '19:00' },
  { id: 2, name: 'Karan', work_start: '11:00', work_end: '20:00' },
];

async function catalog(page) {
  await page.route('**/api/services', route => route.fulfill({ json: services }));
  await page.route('**/api/stylists', route => route.fulfill({ json: stylists }));
  await page.route('**/api/availability?**', route => route.fulfill({
    json: { date: '2026-11-02', timezone: 'Asia/Kolkata', start_times: ['10:00', '10:15', '10:30'] },
  }));
}

test('validates details, confirms a booking, and refreshes for another booking', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await catalog(page);
  let bookings = 0;
  await page.route('**/api/bookings', async route => {
    const input = route.request().postDataJSON();
    expect(input.customer_name).toBe('Asha Shah');
    expect(input.mobile).toBe('0123456789');
    expect(input).not.toHaveProperty('price_rupees');
    bookings++;
    await route.fulfill({ status: 201, json: {
      id: '7b3feac0-946b-4a98-a752-31fcc83e080d', service: 'Haircut', stylist: 'Meera',
      starts_at: `${input.date}T10:00:00+05:30`, ends_at: `${input.date}T10:30:00+05:30`,
      price_rupees: 400, status: 'confirmed',
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '10:00 am', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm appointment' }).click();
  await expect(page.getByText('Enter your name (1–100 characters).')).toBeVisible();
  await expect(page.getByText('Enter exactly 10 digits, without +91 or spaces.')).toBeVisible();
  expect(bookings).toBe(0);
  await page.getByRole('textbox', { name: 'Your name' }).fill('  Asha Shah  ');
  await page.getByRole('textbox', { name: 'Mobile number' }).fill('0123456789');
  await page.getByRole('button', { name: 'Confirm appointment' }).click();
  await expect(page.getByRole('heading', { name: 'Your time is reserved.' })).toBeVisible();
  await expect(page.getByText('7b3feac0-946b-4a98-a752-31fcc83e080d')).toBeVisible();
  expect(bookings).toBe(1);
  await page.getByRole('button', { name: 'Book another appointment' }).click();
  await expect(page.getByRole('button', { name: '10:00 am', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('conflict clears the selected slot and fetches fresh availability', async ({ page }) => {
  await catalog(page);
  let conflicted = false;
  await page.route('**/api/availability?**', route => route.fulfill({
    json: { start_times: conflicted ? ['10:30'] : ['10:00', '10:30'] },
  }));
  await page.route('**/api/bookings', route => {
    conflicted = true;
    return route.fulfill({ status: 409, json: { detail: 'That time is unavailable. Please choose another time.' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '10:00 am', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your name' }).fill('Asha');
  await page.getByRole('textbox', { name: 'Mobile number' }).fill('0123456789');
  await page.getByRole('button', { name: 'Confirm appointment' }).click();
  await expect(page.getByRole('alert')).toContainText('That time is unavailable');
  await expect(page.getByRole('button', { name: '10:00 am', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirm appointment' })).toBeDisabled();
});

test('changing service clears the selection and updates duration and price', async ({ page }) => {
  await catalog(page);
  await page.goto('/');
  await page.getByRole('button', { name: '10:00 am', exact: true }).click();
  await page.getByRole('button', { name: /Hair spa/ }).click();
  await expect(page.getByRole('button', { name: 'Confirm appointment' })).toBeDisabled();
  await expect(page.getByRole('complementary')).toContainText('60 minutes');
  await expect(page.getByRole('complementary')).toContainText('₹1,200');
});

test('shows empty availability and a recoverable catalog error', async ({ page }) => {
  await catalog(page);
  await page.route('**/api/availability?**', route => route.fulfill({ json: { start_times: [] } }));
  await page.goto('/');
  await expect(page.getByText(/No times left for this service/)).toBeVisible();
  await page.route('**/api/services', route => route.fulfill({ status: 503, json: { detail: 'Database temporarily unavailable.' } }));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'We couldn’t load the salon.' })).toBeVisible();
  await page.route('**/api/services', route => route.fulfill({ json: services }));
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('button', { name: /Haircut/ })).toBeVisible();
});

for (const width of [320, 768, 1024, 1440]) {
  test(`fits the ${width}px viewport without horizontal overflow`, async ({ page }) => {
    await catalog(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Haircut/ })).toBeVisible();
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflows).toBe(false);
    if (width === 1440) await page.screenshot({ path: '../test-results/desktop.png', fullPage: true });
    if (width === 320) await page.screenshot({ path: '../test-results/mobile.png', fullPage: true });
  });
}

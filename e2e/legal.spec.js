const { test, expect } = require('@playwright/test');
const { skipTour } = require('./helpers');

test('cadastro exige o aceite dos termos e a conta pode pedir e cancelar a exclusão', async ({ page }) => {
  await page.goto('/');
  await page.click('#hl');
  await page.waitForSelector('#login:not([hidden])');
  await expect(page.locator('#tcw')).toBeHidden();
  await page.click('#sw');
  await expect(page.locator('#tcw')).toBeVisible();
  await page.fill('#e', 'legal-ui@x.com');
  await page.fill('#nm', 'Dono Legal');
  await page.fill('#wa', '51999990010');
  await page.fill('#p', 'senha123');
  await page.click('#go');
  await expect(page.locator('#err')).toContainText('Aceite os Termos');
  await page.check('#tc');
  await page.click('#go');
  await page.waitForSelector('#app:not([hidden])', { timeout: 8000 });
  await skipTour(page);

  await page.click('#fdata');
  await expect(page.locator('#mydata')).toBeVisible();
  await page.fill('#mdp', 'senha123');
  await page.click('#mdb');
  await expect(page.locator('#mydata')).toContainText('Exclusão agendada');
  await page.click('#mdc');
  await expect(page.locator('#mdb')).toBeVisible();
});

'use strict';

// Fecha o tour de boas-vindas, que cobre a tela logo depois do primeiro login.
async function skipTour(page) {
  await page.waitForTimeout(1100);
  await page.evaluate(() => { try { tourEnd(); } catch (e) { /* sem tour */ } });
}

async function signup(page, role, email, name, wa, pass) {
  await page.goto('/');
  await page.click('#hl');
  await page.waitForSelector('#login:not([hidden])');
  await page.click(`#rl button[data-r=${role}]`);
  await page.click('#sw');
  await page.fill('#e', email);
  await page.fill('#nm', name);
  await page.fill('#wa', wa);
  await page.fill('#p', pass);
  await page.check('#tc');
  await page.click('#go');
  await page.waitForSelector('#app:not([hidden])', { timeout: 8000 });
  await skipTour(page);
}

async function acceptInvite(page, link, name, wa, pass) {
  await page.goto(link);
  await page.waitForSelector('#ib:not([hidden])');
  await page.fill('#nm', name);
  await page.fill('#wa', wa);
  await page.fill('#p', pass);
  await page.check('#tc');
  await page.click('#go');
  await page.waitForSelector('.hc', { timeout: 8000 });
  await skipTour(page);
}

const api = (page, path) => page.evaluate((p) => fetch(p).then((r) => r.json()), path);

module.exports = { skipTour, signup, acceptInvite, api };

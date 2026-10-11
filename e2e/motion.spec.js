'use strict';
const { test, expect } = require('@playwright/test');
const { signup } = require('./helpers');

// Atrasa a rota de dados no navegador (sem bloquear o teste) para enxergar os estados de carregamento.
const delayFetch = (page, part, ms) => page.addInitScript(([p, d]) => {
  const f = window.fetch;
  window.fetch = (u, o) => (String(u).includes(p) ? new Promise((r) => setTimeout(r, d)).then(() => f(u, o)) : f(u, o));
}, [part, ms]);

test('skeleton e barra de progresso aparecem enquanto os dados carregam', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL });
  const page = await ctx.newPage();
  await signup(page, 'owner', `mo${Date.now()}@x.com`, 'Mo Teste', '51999990009', 'senha123');
  const page2 = await (await browser.newContext({ baseURL, storageState: await ctx.storageState() })).newPage();
  await delayFetch(page2, '/api/sync', 1500);
  await page2.goto('/');
  await expect(page2.locator('#m .sk').first()).toBeVisible();
  expect(Number(await page2.evaluate(() => getComputedStyle(document.getElementById('mo-bar')).opacity))).toBeGreaterThan(0);
  await expect(page2.locator('#m .sk')).toHaveCount(0, { timeout: 8000 });
});

test('diálogo tem entrada e saída; reduced-motion desliga', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL });
  const page = await ctx.newPage();
  await signup(page, 'owner', `mo2${Date.now()}@x.com`, 'Mo Dois', '51999990010', 'senha123');
  await page.click('#eh1');
  await page.waitForSelector('#dlg[open]');
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('dlg')).animationName)).toBe('mo-pop');
  await page.evaluate(() => document.getElementById('dlg').close());
  expect(await page.evaluate(() => document.getElementById('dlg').classList.contains('closing'))).toBe(true);
  await expect.poll(() => page.evaluate(() => document.getElementById('dlg').open)).toBe(false);

  const rctx = await browser.newContext({ baseURL, reducedMotion: 'reduce', storageState: await ctx.storageState() });
  const r = await rctx.newPage();
  await r.goto('/');
  await r.waitForSelector('#app:not([hidden])');
  await r.click('#eh1');
  await r.waitForSelector('#dlg[open]');
  expect(await r.evaluate(() => getComputedStyle(document.getElementById('dlg')).animationName)).toBe('none');
});

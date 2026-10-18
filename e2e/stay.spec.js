'use strict';
const { test, expect } = require('@playwright/test');
const { signup, acceptInvite, api } = require('./helpers');

// Fluxo completo da hospedagem: convite → proposta → aceite → adiantamento informado e confirmado
// → página de check-in da família → link público → histórico.
test('adiantamento, casa liberada e página de check-in da família', async ({ browser, baseURL }) => {
  const mk = async () => (await browser.newContext({ baseURL })).newPage();
  const owner = await mk();
  const broker = await mk();
  const open = (page, id) => page.evaluate((i) => { PG = 'props'; PV = i; view = null; render(); }, id);

  await test.step('proprietário cadastra a casa e convida o corretor', async () => {
    await signup(owner, 'owner', 'dono2@x.com', 'Dono Dois', '51999990011', 'senha123');
    await owner.click('#eh1');
    await owner.waitForSelector('#dlg[open]');
    const f = { '#f-name': 'Casa Fluxo', '#f-loc': 'Atlântida, RS', '#f-lot': '10', '#f-q': '4', '#f-s': '2', '#f-b': '5', '#f-rate': '2000' };
    for (const [k, v] of Object.entries(f)) await owner.fill(k, v);
    await owner.click('#fs');
    await owner.waitForTimeout(2000);
    await owner.evaluate(() => { view = null; render(); });
    await owner.waitForSelector('.hc');
    await owner.click('.hc');
    await owner.waitForSelector('#iv-e');
    await owner.fill('#iv-e', 'corr3@x.com');
    await owner.click('#iv-b');
    await owner.waitForFunction(() => { const i = document.querySelector('#iv-lki'); return i && i.value.includes('convite='); });
    await acceptInvite(broker, await owner.inputValue('#iv-lki'), 'Corretor Tres', '51988880011', 'senha123');
  });

  const hid = (await api(owner, '/api/sync')).view.houses[0].id;
  let pid;
  await test.step('corretor marca as datas e o proprietário aceita', async () => {
    const [a, b] = await broker.evaluate(() => [add(40), add(43)]);
    await broker.evaluate(([h, x, y]) => {
      PROP.unshift({ id: 'p' + Date.now(), hid: 'r' + h, house: 'Casa Fluxo', broker: ME, bname: 'Corretor Tres', in: x, out: y, value: 6000, guest: 'Família Silva', pax: 4, msg: '', status: 'pending', at: today, log: [] });
      saveP();
    }, [hid, a, b]);
    await expect.poll(async () => (await api(owner, '/api/sync')).view.props.length).toBe(1);
    pid = (await api(owner, '/api/sync')).view.props[0].id;
    await owner.waitForFunction((id) => PROP.some((q) => q.id === id), pid, { timeout: 15000 });
    await owner.evaluate((id) => { const x = PROP.find((q) => q.id === id); x.status = 'accepted'; x.final = x.value; saveP(); }, pid);
    await expect.poll(async () => (await api(broker, '/api/sync')).view.props.find((q) => q.id === pid)?.status).toBe('accepted');
  });

  await test.step('corretor informa o pagamento do adiantamento', async () => {
    await broker.waitForFunction((id) => PROP.find((q) => q.id === id)?.status === 'accepted', pid);
    await open(broker, pid);
    await expect(broker.locator('.stp2')).toContainText('Adiantamento pendente');
    await expect(broker.locator('.stp2')).toContainText('Página de check-in');
    await broker.click('[data-s=py]');
    await expect.poll(async () => !!(await api(owner, '/api/sync')).view.props.find((q) => q.id === pid)?.pay).toBe(true);
  });

  await test.step('proprietário confere e confirma: casa liberada', async () => {
    await owner.waitForFunction((id) => PROP.find((q) => q.id === id)?.pay, pid, { timeout: 15000 });
    await open(owner, pid);
    await expect(owner.locator('.stp2')).toContainText('Pagamento informado');
    await owner.click('[data-s=cf]');
    await expect.poll(async () => !!(await api(broker, '/api/sync')).view.props.find((q) => q.id === pid)?.paid).toBe(true);
  });

  await test.step('proprietário preenche e envia a página de check-in', async () => {
    await expect(owner.locator('#sk-t')).toHaveValue('15:00');
    await owner.fill('#sk-t', '14:00');
    await owner.fill('#sk-ph', 'Zelador: 51999990000');
    await owner.fill('#sk-n', 'Estacionar na garagem.');
    await owner.click('[data-s=ksend]');
    await expect.poll(async () => !!(await api(broker, '/api/sync')).view.props.find((q) => q.id === pid)?.ck?.s).toBe(true);
  });

  let link;
  await test.step('corretor recebe o link e a família abre a página', async () => {
    await broker.waitForFunction((id) => PROP.find((q) => q.id === id)?.ck?.s, pid, { timeout: 15000 });
    await open(broker, pid);
    await expect(broker.locator('#sl-u')).toHaveValue(/\/hospedagem\/[a-f0-9]{16}/);
    link = await broker.inputValue('#sl-u');
    const guest = await mk();
    await guest.goto(link);
    await guest.waitForSelector('#pub:not([hidden]) .stg');
    const txt = await guest.locator('#pub').innerText();
    for (const s of ['Casa Fluxo', 'Família Silva', '14:00', 'Zelador: 51999990000', 'Estacionar na garagem.']) expect(txt).toContain(s);
    await expect(guest.locator('#stc')).toBeVisible();
    const html = await guest.content();
    for (const s of ['dono2@x.com', 'corr3@x.com']) expect(html).not.toContain(s);
    await guest.goto('/hospedagem/0000000000000000');
    await expect(guest.locator('#pub')).toContainText('não está disponível');
  });

  await test.step('reserva aparece em Reservas, com a aba de histórico', async () => {
    await broker.evaluate(() => { PG = 'res'; view = null; render(); });
    await broker.waitForSelector('[data-rt=hist]');
    await broker.click('[data-rt=hist]');
    await expect(broker.locator('#m h1')).toContainText('Histórico de locações');
  });
});

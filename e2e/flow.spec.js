'use strict';
const { test, expect } = require('@playwright/test');
const { signup, acceptInvite, api } = require('./helpers');

test('proprietário e dois corretores: convite, proposta, aceite e privacidade', async ({ browser, baseURL }) => {
  const mk = async () => { const c = await browser.newContext({ baseURL }); return c.newPage(); };
  const owner = await mk();
  const b1 = await mk();
  const b2 = await mk();

  await test.step('proprietário cria conta e cadastra a casa', async () => {
    await signup(owner, 'owner', 'dono@x.com', 'Dono Teste', '51999990001', 'senha123');
    await owner.click('#eh1');
    await owner.waitForSelector('#dlg[open]');
    const f = { '#f-name': 'Casa Servidor', '#f-loc': 'Atlântida, RS', '#f-lot': '12', '#f-q': '5', '#f-s': '3', '#f-b': '6', '#f-rate': '2500' };
    for (const [k, v] of Object.entries(f)) await owner.fill(k, v);
    await owner.click('#fs');
    await owner.waitForTimeout(2000);
    await owner.evaluate(() => { view = null; render(); });
    await owner.waitForSelector('.hc');
  });

  const view = (await api(owner, '/api/sync')).view;
  expect(view.houses).toHaveLength(1);
  const hid = view.houses[0].id;
  const slug = view.houses[0].pg;

  await test.step('bloqueio de data chega ao servidor', async () => {
    await owner.evaluate((id) => { blocks[id] = [add(20)]; saveB(); }, hid);
    await expect.poll(async () => ((await api(owner, '/api/sync')).view.blocks[hid] || []).length).toBe(1);
  });

  const links = [];
  await test.step('convites para dois corretores', async () => {
    await owner.click('.hc');
    await owner.waitForSelector('#iv-e');
    for (const em of ['corr1@x.com', 'corr2@x.com']) {
      const prev = links[links.length - 1] || '';
      await owner.fill('#iv-e', em);
      await owner.click('#iv-b');
      await owner.waitForFunction((p) => { const i = document.querySelector('#iv-lki'); return i && i.value.includes('convite=') && i.value !== p; }, prev);
      links.push(await owner.inputValue('#iv-lki'));
    }
  });

  await test.step('corretores aceitam o convite e veem a casa', async () => {
    await acceptInvite(b1, links[0], 'Corretor Um', '51988880001', 'senha123');
    await expect(b1.locator('.hc').first()).toContainText('Casa Servidor');
    await acceptInvite(b2, links[1], 'Corretor Dois', '51988880002', 'senha123');
  });

  let pid;
  let dIn;
  await test.step('proposta do corretor 1 chega ao proprietário', async () => {
    dIn = await b1.evaluate(() => add(30));
    const dOut = await b1.evaluate(() => add(33));
    await b1.evaluate(([h, a, b]) => {
      PROP.unshift({ id: 'p' + Date.now(), hid: 'r' + h, house: 'Casa Servidor', broker: ME, bname: 'Corretor Um', in: a, out: b, value: 9000, guest: 'Cliente X', pax: 4, msg: 'ola', status: 'pending', at: today, log: [], chat: [] });
      saveP();
    }, [hid, dIn, dOut]);
    await expect.poll(async () => (await api(owner, '/api/sync')).view.props.length).toBe(1);
    const props = (await api(owner, '/api/sync')).view.props;
    expect(props[0].bname).toBe('Corretor Um');
    pid = props[0].id;
  });

  await test.step('privacidade: corretor 2 só vê a data segurada', async () => {
    const v2 = (await api(b2, '/api/sync')).view;
    const txt = JSON.stringify(v2);
    for (const s of ['Corretor Um', 'corr1@x.com', 'Cliente X', '"value"', '51988880001']) expect(txt).not.toContain(s);
    expect(v2.props.some((x) => x.ghost)).toBe(true);
  });

  await test.step('dupla reserva é barrada no servidor', async () => {
    const [a, b] = await b2.evaluate(() => [add(31), add(32)]);
    await b2.evaluate(([h, x, y]) => {
      PROP.unshift({ id: 'p' + Date.now(), hid: 'r' + h, house: 'Casa Servidor', broker: ME, bname: 'Corretor Dois', in: x, out: y, value: 8000, guest: 'Y', pax: 2, msg: '', status: 'pending', at: today, log: [], chat: [] });
      saveP();
    }, [hid, a, b]);
    await expect.poll(() => b2.evaluate(() => PROP.filter((x) => !x.ghost).length)).toBe(0);
  });

  await test.step('aceite bloqueia as datas para toda a rede', async () => {
    await owner.evaluate((id) => { const x = PROP.find((q) => q.id === id); x.status = 'accepted'; x.final = x.value; saveP(); }, pid);
    await expect.poll(async () => ((await api(owner, '/api/sync')).view.blocks[hid] || []).includes(dIn)).toBe(true);
    await expect.poll(async () => ((await api(b2, '/api/sync')).view.blocks[hid] || []).includes(dIn)).toBe(true);
  });

  await test.step('página pública da casa', async () => {
    const pub = await mk();
    const code = await b1.evaluate(() => SRVU.code);
    await pub.goto(`/c/${slug}?b=${code}&lg=en`);
    await pub.waitForSelector('#pub:not([hidden])');
    await expect(pub.locator('#pub')).toContainText('Casa Servidor');
    await expect(pub.locator('#pub')).toContainText('Corretor Um');
    expect(await pub.content()).not.toContain('dono@x.com');
    await pub.goto('/c/naoexiste');
    await expect(pub.locator('#pub')).toContainText('não está disponível');
  });

  await test.step('sessão persiste e logout encerra', async () => {
    await owner.reload();
    await owner.waitForSelector('#app:not([hidden])');
    await owner.evaluate(() => document.getElementById('out').click());
    await expect.poll(async () => (await api(owner, '/api/session')).user).toBeNull();
  });
});

test('administração: login, usuários e suspensão derruba a sessão', async ({ browser, baseURL }) => {
  const mkp = async () => (await browser.newContext({ baseURL })).newPage();
  const owner = await mkp();
  await signup(owner, 'broker', 'susp@x.com', 'Corretor Susp', '51988880003', 'senha123');
  const ad = await mkp();
  await ad.goto('/');
  await ad.evaluate(() => openAdmin());
  await ad.waitForSelector('#adl:not([hidden])');
  await ad.fill('#ae', 'adm@x.com');
  await ad.fill('#ap', 'errada');
  await ad.click('#ago');
  await ad.waitForSelector('#aerr:not([hidden])');
  await ad.fill('#ap', 'SenhaForte123');
  await ad.click('#ago');
  await ad.waitForSelector('#adm:not([hidden])');
  await ad.evaluate(() => { AT = 'us'; arender(); });
  await expect(ad.locator('#am')).toContainText('susp@x.com');
  await ad.evaluate(() => srvAdm('suspend', { email: 'susp@x.com', on: true }, 'ok'));
  await expect.poll(() => owner.evaluate(() => fetch('/api/sync').then((r) => r.status))).toBe(401);
});

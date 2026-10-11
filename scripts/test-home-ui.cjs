// Demo only: no production accounts, messages or payments.
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
async function run() {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const base = process.env.TEST_URL || 'http://localhost:19015';
  const out = path.join(__dirname, '../.test-runtime/home-ui');
  fs.mkdirSync(out, { recursive: true });
  await page.addInitScript(() => {
    if (!localStorage.getItem('pelada-auth-storage')) localStorage.setItem('pelada-auth-storage', JSON.stringify({state:{isLoggedIn:true,authUserId:null},version:0}));
  });
  const go = route => page.goto(base + route, { waitUntil: 'networkidle', timeout: 90000 });
  const shot = name => page.screenshot({ path: path.join(out, name) });
  const mutate = callback => page.evaluate(callback);
  try {
    await go('/');
    await page.getByText('Seus times', { exact: true }).waitFor();
    await go('/perfil');
    const banterSwitch = page.getByText('Modo Resenha', {exact:true}).locator('..').locator('..').locator('input');
    await banterSwitch.setChecked(!(await banterSwitch.isChecked()));
    await page.waitForFunction(() => !!localStorage.getItem('pelada-app-storage'));
    await go('/');
    assert.ok(await page.evaluate(() => localStorage.getItem('pelada-app-storage')));
    await mutate(() => {
      const x = JSON.parse(localStorage.getItem('pelada-app-storage'));
      const memberTeams = x.state.memberships.filter(m => m.playerId === x.state.currentPlayerId && m.active).map(m => m.peladaId);
      const g = x.state.games.find(g => memberTeams.includes(g.peladaId) && g.status === 'open');
      if (!g) throw new Error('Missing demo member game');
      g.status = 'in_progress'; g.scheduledAt = new Date(Date.now() - 3600000).toISOString();
      const volleyball = x.state.peladas.find(p => p.sportId === 'volei');
      x.state.memberships.push({peladaId:volleyball.id,playerId:x.state.currentPlayerId,role:'member',active:true,joinedAt:new Date().toISOString()});
      x.state.games.push({...g,id:'home-volleyball',peladaId:volleyball.id,status:'open',scheduledAt:new Date(Date.now()+86400000).toISOString()});
      x.state.games.push({...g,id:'home-foreign-live',peladaId:'not-a-member-team',status:'in_progress'});
      localStorage.setItem('home-test-game', g.id);
      localStorage.setItem('pelada-app-storage', JSON.stringify(x));
    });
    await go('/');
    await page.getByText('Seu jogo agora', { exact: true }).waitFor();
    await page.getByText('Ao vivo', { exact: true }).waitFor();
    await page.getByRole('button', {name:'Abrir time Vôlei da Empresa - Sábados',exact:true}).waitFor();
    assert.equal(await page.getByText('Em andamento', {exact:true}).count(), 1);
    await shot('01-home-active.png');
    const y = async text => (await page.getByText(text, { exact: true }).boundingBox()).y;
    assert.ok(await y('Seu jogo agora') < await y('Sua evolução'));
    assert.ok(await y('Sua evolução') < await y('Seus times'));
    assert.ok(await y('Seus times') < await y('Configurar minha experiência'));
    for (const label of ['Campos próximos', 'Encontrar um jogo', 'Horários e desafios', 'Aulas esportivas']) {
      assert.equal(await page.getByRole('button', {name:label,exact:true}).count(), 1);
      assert.ok((await page.getByRole('button', {name:label,exact:true}).boundingBox()).height >= 44);
    }
    await page.getByRole('button', {name:'Vôlei',exact:true}).click();
    await page.getByText('Seu jogo agora', {exact:true}).waitFor({state:'hidden'});
    await page.getByText('Seu próximo jogo', {exact:true}).waitFor();
    await page.getByText('Sem avaliações', {exact:true}).waitFor();
    assert.equal(await page.getByText('NOTA GERAL', {exact:true}).count(), 0);
    await shot('02-home-volleyball.png');
    await page.getByRole('button', {name:'Todos os esportes',exact:true}).click();
    for (const width of [320, 430]) {
      await page.setViewportSize({width,height:844});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
      await shot(`03-home-width-${width}.png`);
    }
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button', {name:'Campos próximos',exact:true}).click();
    await page.getByText('Campos perto de você', {exact:true}).waitFor();
    await go('/');
    await mutate(() => {
      const x = JSON.parse(localStorage.getItem('pelada-app-storage'));
      x.state.ratings = [];
      x.state.memberships = x.state.memberships.filter(m => m.playerId !== x.state.currentPlayerId);
      x.state.players.find(p => p.id === x.state.currentPlayerId).nickname = 'Alexandre de Albuquerque';
      localStorage.setItem('pelada-app-storage', JSON.stringify(x));
    });
    await go('/');
    await page.getByText('Sem avaliações', {exact:true}).waitFor();
    assert.equal(await page.getByText('NOTA GERAL', {exact:true}).count(), 0);
    await page.getByRole('button', {name:'Entrar em um time',exact:true}).waitFor();
    await shot('04-home-new-player.png');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({width:320,height:844});
    await shot('05-home-new-player-320.png');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('button', {name:'Criar meu time',exact:true}).click();
    await page.waitForURL(/criar-pelada/);
    assert.deepEqual(errors, []);
    console.log('PASS: mobile Home live game, hierarchy, multi-sport filter, compact 44px actions, 320/390/430px, unrated new account, team creation and fields links.');
  } catch (e) {
    await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});
    console.log((await page.locator('body').innerText()).slice(0,4500));
    throw e;
  } finally { await browser.close(); }
}
run().catch(e => {console.error(e);process.exitCode=1;});

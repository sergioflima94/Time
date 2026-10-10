// Demo-only UI test. Start Expo web with EXPO_NO_DOTENV=1.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
async function run() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror',error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('pelada-auth-storage',JSON.stringify({state:{isLoggedIn:true,authUserId:null},version:0})));
  const base = process.env.TEST_URL || 'http://localhost:19010';
  const output = path.join(__dirname,'../.test-runtime/owner-access');
  fs.mkdirSync(output,{recursive:true});
  try {
    await page.goto(`${base}/perfil`,{waitUntil:'networkidle',timeout:90000});
    await page.getByText('Acesso completo do proprietário',{exact:true}).waitFor();
    assert.equal(await page.getByText('Fundo com foto é exclusivo do Premium',{exact:true}).count(),0);
    await page.screenshot({path:path.join(output,'01-perfil.png')});
    await page.goto(`${base}/pro/planos`,{waitUntil:'networkidle'});
    await page.getByText('Liberado para o proprietário',{exact:true}).waitFor();
    await page.getByText('Time',{exact:true}).click();
    await page.getByText('Time Pro',{exact:true}).waitFor();
    await page.getByText('Liberado para o proprietário',{exact:true}).waitFor();
    await page.screenshot({path:path.join(output,'02-time-pro.png')});
    await page.goto(`${base}/estabelecimento`,{waitUntil:'networkidle'});
    await page.getByText('+ Cadastrar novo estabelecimento',{exact:true}).click();
    await page.getByText('Nome',{exact:true}).locator('..').locator('input').fill('Arena do proprietário');
    await page.getByText('Chave Pix',{exact:true}).locator('..').locator('input').fill('teste@example.invalid');
    await page.getByText('Cadastrar estabelecimento',{exact:true}).last().click();
    await page.waitForURL(/\/estabelecimento\/[^/]+$/);
    await page.goto(`${base}/pro/planos`,{waitUntil:'networkidle'});
    await page.getByText('Campo',{exact:true}).click();
    await page.getByText('Estabelecimento Pro',{exact:true}).waitFor();
    await page.getByText('Liberado para o proprietário',{exact:true}).waitFor();
    await page.screenshot({path:path.join(output,'03-estabelecimento-pro.png')});
    const data = await page.evaluate(() => ({
      app: JSON.parse(localStorage.getItem('pelada-app-storage')).state,
      pro: JSON.parse(localStorage.getItem('pelada-pro-storage') || '{"state":{"subscriptions":[]}}').state,
    }));
    assert.equal(data.app.players.find(p=>p.id==='p1').premiumUntil,null);
    assert.equal(data.pro.subscriptions.length,0);
    await page.goto(`${base}/plataforma`,{waitUntil:'networkidle'});
    await page.getByText('Usar todas as áreas do aplicativo',{exact:true}).waitFor();
    await page.getByText('Todos os recursos',{exact:true}).click();
    await page.waitForURL('**/central');
    // A non-owner free profile doesn't inherit the owner's benefit.
    await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem('pelada-app-storage'));
      stored.state.currentPlayerId = 'p4';
      localStorage.setItem('pelada-app-storage',JSON.stringify(stored));
    });
    await page.goto(`${base}/perfil`,{waitUntil:'networkidle'});
    await page.getByText('Fundo com foto é exclusivo do Premium',{exact:true}).waitFor();
    assert.equal(await page.getByText('Acesso completo do proprietário',{exact:true}).count(),0);
    await page.goto(`${base}/pro/planos`,{waitUntil:'networkidle'});
    assert.equal(await page.getByText('Liberado para o proprietário',{exact:true}).count(),0);
    assert.deepEqual(errors,[]);
    console.log('PASS: owner Premium, team/venue Pro, shortcuts, no fabricated subscriptions and free non-owner remains gated.');
  } finally { await browser.close(); }
}
run().catch(error=>{console.error(error);process.exitCode=1;});

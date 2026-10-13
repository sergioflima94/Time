// Expo demo only. External legal pages are proxied to the local site for QA.
const { chromium } = require('playwright-core'), assert = require('node:assert/strict');
const fs = require('node:fs'),path = require('node:path');
const app = process.env.TEST_URL || 'http://localhost:19017';
const site = process.env.PUBLIC_SITE_URL || 'http://127.0.0.1:19016';
async function run() {
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const errors = [];
    async function context(loggedIn) {
      const ctx = await browser.newContext({viewport:{width:390,height:844}});
      await ctx.addInitScript(loggedIn => {if(location.hostname==='localhost')localStorage.setItem('pelada-auth-storage',JSON.stringify({state:{isLoggedIn:loggedIn,authUserId:null},version:0}));}, loggedIn);
      await ctx.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'marcoujogou.com.br') {
          const response = await ctx.request.get(site+url.pathname+url.search);
          await route.fulfill({response});
        } else if (['localhost','127.0.0.1'].includes(url.hostname)) await route.continue();
        else await route.abort();
      });
      ctx.on('page',page => page.on('pageerror',e=>errors.push(e.message)));
      return ctx;
    }
    async function openLink(ctx,page,label,route,title) {
      const original = page.url();
      // Expo/RN web uses same-tab navigation, unlike the native browser handoff.
      await Promise.all([page.waitForURL('https://marcoujogou.com.br'+route),page.getByRole('button',{name:label,exact:true}).click()]);
      await page.getByRole('heading',{level:1,name:title}).waitFor();
      assert.equal(page.url(),'https://marcoujogou.com.br'+route);
      await page.goto(original,{waitUntil:'domcontentloaded',timeout:90000});
      await page.getByRole('button',{name:label,exact:true}).waitFor();
    }
    const logged = await context(true), profile = await logged.newPage();
    await profile.goto(app+'/perfil',{waitUntil:'domcontentloaded',timeout:90000});
    await profile.getByText('Privacidade e conta',{exact:true}).waitFor({timeout:90000});
    await openLink(logged,profile,'Política de Privacidade','/politica-de-privacidade/','Política de Privacidade');
    await profile.getByRole('button',{name:'Solicitar exclusão da conta',exact:true}).click();
    await profile.getByText('Digite EXCLUIR para confirmar a solicitação',{exact:true}).waitFor();
    assert.equal(await profile.getByRole('button',{name:'Enviar pedido de exclusão',exact:true}).isDisabled(),true,'Demo must not submit a real deletion request');
    const out = path.resolve(__dirname,'../.test-runtime/public-site-shots'); fs.mkdirSync(out,{recursive:true});
    await profile.getByRole('button',{name:'Solicitar exclusão da conta',exact:true}).scrollIntoViewIfNeeded();
    await profile.screenshot({path:path.join(out,'perfil-privacidade-390.png')});
    const anonymous = await context(false), login = await anonymous.newPage();
    await login.goto(app+'/login',{waitUntil:'domcontentloaded',timeout:90000});
    await openLink(anonymous,login,'Política de Privacidade','/politica-de-privacidade/','Política de Privacidade');
    await login.goto(app+'/cadastro',{waitUntil:'domcontentloaded',timeout:90000});
    await openLink(anonymous,login,'Política de Privacidade','/politica-de-privacidade/','Política de Privacidade');
    assert.deepEqual(errors,[]);
    console.log('PASS: public privacy links and in-app deletion initiation; demo cannot submit a real deletion request. Login/cadastro open privacy without creating an account.');
  } finally {await browser.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});

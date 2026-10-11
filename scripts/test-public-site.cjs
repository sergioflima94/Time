const { chromium } = require('playwright-core');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const base = process.env.PUBLIC_SITE_URL || 'http://127.0.0.1:19016';
const out = path.resolve(__dirname,'../.test-runtime/public-site-shots');
async function run() {
  fs.mkdirSync(out,{recursive:true});
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    const page = await context.newPage(); const errors = [], external = [];
    page.on('pageerror',error => errors.push(error.message));
    page.on('request',req => {if (!req.url().startsWith(base)) external.push(req.url());});
    for (const width of [320,390,1280]) {
      await page.setViewportSize({width,height:width===1280?900:844});
      for (const [route,name] of [['/','apresentacao'],['/politica-de-privacidade/','privacidade'],['/excluir-conta/','excluir-conta']]) {
        assert.equal((await page.goto(base+route)).status(),200);
        assert.equal(await page.locator('h1').count(),1);
        assert.equal(await page.locator('html').getAttribute('lang'),'pt-BR');
        assert.ok((await page.title()).includes('MarcouJogou'));
        assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://marcoujogou.com.br'+route);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth),`${route} overflow ${width}`);
        const localLinks = await page.locator('a[href^="/"]').evaluateAll(els=>els.map(e=>e.getAttribute('href').split('#')[0]));
        for (const route of new Set(localLinks)) assert.equal((await page.request.get(base+route)).status(),200,route);
        const images = await page.locator('img').evaluateAll(els=>els.every(e=>e.complete&&e.naturalWidth>0)); assert.ok(images);
        await page.screenshot({path:path.join(out,`${name}-${width}.png`),fullPage:true});
      }
    }
    await page.setViewportSize({width:390,height:844}); await page.goto(base+'/excluir-conta/');
    const requestsBefore = external.length;
    await page.getByRole('button',{name:'Preparar pedido por e-mail'}).click();
    assert.equal(await page.locator('#mensagem-preparada').isVisible(),false);
    await page.getByLabel('E-mail cadastrado no MarcouJogou',{exact:true}).fill('usuario+time@test.invalid');
    await page.getByLabel('Observação opcional').fill('<img src=x onerror=alert(1)> Não tenho acesso ao e-mail. & assunto');
    await page.getByRole('button',{name:'Preparar pedido por e-mail'}).click();
    await page.getByText('Pedido preparado. Ele ainda não foi enviado; envie pelo seu e-mail.').waitFor();
    const href = await page.locator('#abrir-email').getAttribute('href');
    assert.ok(href.startsWith('mailto:sergioferreiralima09@gmail.com?subject='));
    const url = new URL(href); assert.equal(url.searchParams.get('subject'),'Exclusão de conta — MarcouJogou');
    assert.ok(url.searchParams.get('body').includes('usuario+time@test.invalid'));
    assert.ok(url.searchParams.get('body').includes('<img src=x onerror=alert(1)>'));
    assert.equal(await page.locator('#mensagem-preparada img').count(),0);
    assert.equal(external.length,requestsBefore); // No network submission, tracker or fictional confirmation.
    assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),[]);
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true}));
    await page.getByRole('button',{name:'Copiar mensagem'}).click();
    await page.getByText('Selecione e copie o texto acima; depois envie pelo seu e-mail. Nada foi enviado.').waitFor();
    await page.screenshot({path:path.join(out,'pedido-preparado-390.png'),fullPage:true});
    assert.equal((await page.request.get(base+'/.htaccess')).status(),403);
    assert.equal((await page.request.get(base+'/inexistente')).status(),404);
    const noJS = await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
    const fallback = await noJS.newPage(); await fallback.goto(base+'/excluir-conta/');
    assert.ok(await fallback.locator('noscript').isVisible());
    assert.ok((await fallback.locator('main a[href^="mailto:"]').count())>=1);
    await fallback.goto(base+'/politica-de-privacidade/'); assert.ok(await fallback.locator('h1').isVisible());
    await noJS.close(); assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
    console.log('PASS: páginas públicas 320/390/1280 px, links e logo, sem overflow/login/trackers; pedido por e-mail sem falsa confirmação, encoding seguro, cópia alternativa e acesso sem JavaScript.');
  } finally {await browser.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});

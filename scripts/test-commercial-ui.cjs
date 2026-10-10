// Demo-only E2E, Chrome installed locally; no live credentials or payments.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');
async function run() {
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}}); page.setDefaultTimeout(15000);
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('pelada-auth-storage',JSON.stringify({state:{isLoggedIn:true,authUserId:null},version:0})));
  const base=process.env.TEST_URL || 'http://localhost:19011';
  const output=path.join(__dirname,'../.test-runtime/commercial'); fs.mkdirSync(output,{recursive:true});
  const fill=async(label,value)=>page.getByText(label,{exact:true}).locator('..').locator('input,textarea').fill(value);
  const confirm=async reason=>{await fill('Motivo (mínimo 8 caracteres)',reason);await page.getByText('Confirmar e registrar',{exact:true}).click();await page.getByText('Alteração salva e registrada na auditoria.',{exact:true}).waitFor();};
  const switchPlayer=async id=>page.evaluate(id=>{const stored=JSON.parse(localStorage.getItem('pelada-app-storage') || '{"state":{},"version":0}');stored.state.currentPlayerId=id;localStorage.setItem('pelada-app-storage',JSON.stringify(stored));},id);
  try {
    await page.goto(`${base}/plataforma`,{waitUntil:'networkidle',timeout:90000});
    await page.getByText('Licenças e ofertas',{exact:true}).click();
    await page.getByText('Diego Alves',{exact:true}).first().click();
    await fill('Mensagem para o destinatário (opcional)','Parceria com nosso jogador');
    await page.getByText('Revisar condição comercial',{exact:true}).click();
    await confirm('Licença de teste para nosso jogador');
    await page.getByText(/Jogador Premium · Licença ativa/).waitFor();
    await page.screenshot({path:path.join(output,'01-licenca.png'),fullPage:true});
    await page.getByText('Desconto %',{exact:true}).click();
    await fill('Desconto (%)','25');
    await page.getByText('Revisar condição comercial',{exact:true}).click();
    await confirm('Oferta comercial com desconto de parceria');
    await page.getByText(/Jogador Premium · Aguardando resposta/).waitFor();
    await page.screenshot({path:path.join(output,'02-oferta.png'),fullPage:true});
    await switchPlayer('p4');
    await page.goto(`${base}/perfil`,{waitUntil:'networkidle'});
    await page.getByText('Premium por licença concedida',{exact:true}).waitFor();
    await page.getByText(/R\$\s*11,18\/mês por 3 mensalidades/).waitFor();
    await page.getByText('Aceitar oferta',{exact:true}).click();
    await page.getByText('Oferta aceita. A contratação e o pagamento ainda precisam ser concluídos; nenhum valor foi cobrado.',{exact:true}).waitFor();
    await page.getByText(/Jogador Premium · Aceita · contratação pendente/).waitFor();
    await page.screenshot({path:path.join(output,'03-beneficiario.png'),fullPage:true});
    assert.equal(await page.getByText('Admin da plataforma',{exact:true}).count(),0);
    await switchPlayer('p1');
    await page.goto(`${base}/plataforma`,{waitUntil:'networkidle'});
    await page.getByText('Licenças e ofertas',{exact:true}).click();
    await page.getByText(/Jogador Premium · Licença ativa/).locator('..').getByText('Revogar condição',{exact:true}).click();
    await confirm('Encerrar licença gratuita de teste');
    await switchPlayer('p4');
    await page.goto(`${base}/perfil`,{waitUntil:'networkidle'});
    await page.getByText('Fundo com foto é exclusivo do Premium',{exact:true}).waitFor();
    assert.equal(await page.getByText('Premium por licença concedida',{exact:true}).count(),0);
    await page.getByText(/Jogador Premium · Aceita · contratação pendente/).waitFor();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('pelada-app-storage')).state.players?.find(p=>p.id==='p4')?.premiumUntil ?? null),null);
    assert.deepEqual(errors,[]);
    console.log('PASS: owner grant and audited discount, recipient Premium, offer acceptance without paid activation, no global privileges and revoked gift removes benefits.');
  } finally {await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});

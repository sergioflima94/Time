// Smoke test against the demonstration Expo web build (EXPO_NO_DOTENV=1).
// PLAYWRIGHT_MODULE may point to an installed playwright-core module.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('pelada-auth-storage',JSON.stringify({state:{isLoggedIn:true,authUserId:null},version:0})));
  const base = process.env.TEST_URL || 'http://localhost:19008';
  const output = path.join(__dirname,'../screenshots/platform-console');
  fs.mkdirSync(output,{recursive:true});
  try {
    await page.goto(`${base}/plataforma`,{waitUntil:'networkidle',timeout:90000});
    await page.getByText('Visão geral',{exact:true}).waitFor();
    await page.screenshot({path:path.join(output,'01-admin.png')});
    await page.getByText('Esportes',{exact:true}).click();
    await page.getByText('Criar novo esporte',{exact:true}).click();
    const fill = async (label,text) => {
      const field = page.getByText(label,{exact:true}).locator('..').locator('input');
      await field.fill(text);
    };
    await fill('Nome do esporte','Queimada');
    await fill('Identificador único (ex.: beach-tennis)','queimada');
    await fill('Ícone (emoji)','🔥');
    await fill('Cor de destaque (#RRGGBB)','#D946EF');
    await fill('Jogadores por time (1 a 50)','5');
    await page.screenshot({path:path.join(output,'02-novo-esporte.png'),fullPage:true});
    await page.getByText('Revisar esporte',{exact:true}).click();
    await page.getByText('Motivo (mínimo 8 caracteres)',{exact:true}).locator('..').locator('textarea').fill('Incluir queimada para os times do bairro');
    await page.getByText('Confirmar e registrar',{exact:true}).click();
    await page.getByText('Alteração salva e registrada na auditoria.',{exact:true}).waitFor();
    await page.getByText('Editar Queimada',{exact:true}).waitFor();
    await page.screenshot({path:path.join(output,'03-catalogo.png'),fullPage:true});
    // Client navigation preserves the in-memory demo catalogue.
    await page.getByLabel('Voltar',{exact:true}).click();
    await page.goto(`${base}/criar-pelada`,{waitUntil:'networkidle'});
    // Demo sports now persist through reload, so should also appear here.
    await page.getByText('Queimada',{exact:true}).waitFor();
    await page.screenshot({path:path.join(output,'04-selecao-esporte.png'),fullPage:true});
    await page.goto(`${base}/recursos/placar`,{waitUntil:'networkidle'});
    await page.getByText('🔥 Queimada',{exact:true}).click();
    await fill('Nome da partida','Teste Queimada');
    await fill('Time A','Azul'); await fill('Time B','Laranja');
    await page.getByText('Criar placar com as regras do esporte',{exact:true}).click();
    await page.getByText('Teste Queimada',{exact:true}).waitFor();
    await page.screenshot({path:path.join(output,'07-placar.png')});
    await page.goto(`${base}/`,{waitUntil:'networkidle'});
    await page.screenshot({path:path.join(output,'05-home.png')});
    await page.goto(`${base}/descobrir`,{waitUntil:'networkidle'});
    await page.screenshot({path:path.join(output,'06-descoberta.png')});
    await page.evaluate(() => {
      const value = JSON.parse(localStorage.getItem('pelada-app-storage') || '{"state":{},"version":0}');
      value.state.currentPlayerId = 'p2';
      localStorage.setItem('pelada-app-storage',JSON.stringify(value));
    });
    await page.goto(`${base}/plataforma`,{waitUntil:'networkidle'});
    await page.getByText('Acesso restrito',{exact:true}).waitFor();
    await page.getByText('Este perfil não é administrador da plataforma.',{exact:true}).waitFor();
    await page.screenshot({path:path.join(output,'08-acesso-restrito.png')});
    assert.deepEqual(errors,[]);
    console.log('PASS: admin UI, audited sport creation, sport picker, configured scoreboard, home, discovery and non-admin denial.');
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});

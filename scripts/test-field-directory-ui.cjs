const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function run(){const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},geolocation:{latitude:-23.59,longitude:-46.65},permissions:['geolocation']});
 const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('pelada-auth-storage',JSON.stringify({state:{isLoggedIn:true,authUserId:null},version:0})));
 const base=process.env.TEST_URL||'http://localhost:19013',out=path.join(__dirname,'../.test-runtime/field-directory');fs.mkdirSync(out,{recursive:true});
 const go=async route=>page.goto(base+route,{waitUntil:'networkidle',timeout:90000});
 const fill=async(label,value)=>page.getByText(label,{exact:true}).locator('..').locator('input,textarea').fill(value);
 const switchPlayer=async id=>page.evaluate(id=>{const x=JSON.parse(localStorage.getItem('pelada-app-storage'))??{state:{},version:0};x.state.currentPlayerId=id;localStorage.setItem('pelada-app-storage',JSON.stringify(x));},id);
 try{
  await go('/campos');await page.getByText('⚽ Campo do Bairro · exemplo',{exact:true}).waitFor();
  assert.ok((await page.locator('body').innerText()).indexOf('Cadastrados no BoraJogo')<(await page.locator('body').innerText()).lastIndexOf('Contato direto'));
  assert.equal(await page.getByRole('button',{name:/Ver horários no app de/}).count(),0);
  await page.getByRole('button',{name:'Usar minha localização',exact:true}).click();await page.getByText(/Seu ponto não é salvo/).waitFor();
  await page.screenshot({path:path.join(out,'01-campos-proximos.png'),fullPage:true});
  await page.getByRole('button',{name:'🏐 Vôlei',exact:true}).click();await page.getByText('1 de 1 campos na última busca.',{exact:true}).waitFor();assert.equal(await page.getByText('⚽ Arena Society Central',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Todos os esportes',exact:true}).click();await page.getByText('4 de 4 campos na última busca.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Adicionar ou editar campos',exact:true}).click();await page.getByText('Nova ficha pública',{exact:true}).waitFor();
  await fill('Nome público do campo','Campo do piloto');await fill('Endereço, bairro e cidade','Rua Teste, 100 · Setor Sul, Goiânia');await fill('Telefone público com DDD','62999991111');await fill('Latitude do campo','-16.68');await fill('Longitude do campo','-49.25');
  await page.getByRole('switch',{name:'Confirmo publicação dos dados comerciais'}).check();await fill('Motivo da publicação ou alteração','Contato comercial publicado com autorização');
  await page.getByRole('button',{name:'Salvar ficha do campo',exact:true}).click();await page.getByText(/Ficha pública salva/).waitFor();
  assert.equal(await page.getByRole('switch',{name:'Exibir horários online do campo'}).isDisabled(),true);
  await page.screenshot({path:path.join(out,'02-cadastro-contato.png'),fullPage:true});
  await page.getByRole('button',{name:'Fechar gestão do catálogo',exact:true}).click();await page.getByRole('button',{name:'Limpar minha localização',exact:true}).click();await fill('Nome, bairro ou cidade','Goiânia');await page.getByRole('button',{name:'Buscar campos',exact:true}).click();await page.getByText('⚽ Campo do piloto',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Ligar para Campo do piloto',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:/Ver horários no app de/}).count(),0);
  await page.screenshot({path:path.join(out,'03-contato-sem-reserva.png'),fullPage:true});
  await page.evaluate(()=>localStorage.setItem('borajogo-play-hub-demo-v1',JSON.stringify({data:{slots:[
    {id:'dir-slot1',field_id:'f1',field_name:'Arena Society Central',establishment_id:'est1',address:'Centro',sport_id:'futebol',starts_at:'2099-01-10T18:00:00Z',duration_minutes:60,regular_price:200,offer_price:150,active:true},
    {id:'dir-slot2',field_id:'f2',field_name:'Outro campo com oferta',establishment_id:'est2',address:'Vila Nova',sport_id:'futebol',starts_at:'2099-01-10T18:00:00Z',duration_minutes:60,regular_price:200,offer_price:150,active:true}
  ]},prefs:{}})));
  await go('/campos');await page.getByRole('button',{name:'Ver horários no app de Arena Society Central',exact:true}).click();await page.waitForURL(/bora\?fieldId=f1/);
  await page.getByText('⚽ Arena Society Central',{exact:true}).last().waitFor();assert.equal(await page.getByText('⚽ Outro campo com oferta',{exact:true}).count(),0);
  // Owner publishes only the field of their own venue, linking instead of duplicating.
  await switchPlayer('p2');await go('/estabelecimento/est1');await page.getByText('Aparecer nos campos próximos',{exact:true}).click();await page.getByRole('button',{name:'Editar Arena Society Central',exact:true}).click();
  await page.getByRole('switch',{name:'Mostrar campo no catálogo'}).uncheck();await page.getByRole('switch',{name:'Confirmo publicação dos dados comerciais'}).check();await fill('Motivo da publicação ou alteração','Responsável prefere retirar da listagem');await page.getByRole('button',{name:'Salvar ficha do campo',exact:true}).click();await page.getByText(/Ficha pública salva/).waitFor();
  await switchPlayer('p4');await go('/campos');await page.getByText('⚽ Campo do Bairro · exemplo',{exact:true}).waitFor();assert.equal(await page.getByText('⚽ Arena Society Central',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Adicionar ou editar campos',exact:true}).count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: mobile GPS, grouping, sport filter, curated contact creation + disclosure + no online booking, region without GPS, owner withdrawal and non-admin isolation.');
 }catch(e){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});console.log((await page.locator('body').innerText()).slice(-5000));throw e;}finally{await browser.close();}}
run().catch(e=>{console.error(e);process.exitCode=1;});

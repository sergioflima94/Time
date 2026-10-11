// Demo-only mobile regression. WhatsApp navigation is intercepted; no external messages are sent.
const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
async function run(){
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const base=process.env.TEST_URL||'http://localhost:19015';
 const out=path.join(__dirname,'../.test-runtime/conversations-ui');fs.mkdirSync(out,{recursive:true});
 await page.addInitScript(()=>{if(!localStorage.getItem('pelada-auth-storage'))localStorage.setItem('pelada-auth-storage',JSON.stringify({state:{isLoggedIn:true,authUserId:null},version:0}));});
 await context.route('https://chat.whatsapp.com/**',route=>route.fulfill({status:200,body:'WhatsApp navigation stub'}));
 const go=route=>page.goto(base+route,{waitUntil:'networkidle',timeout:90000});
 const switchPlayer=id=>page.evaluate(id=>{const x=JSON.parse(localStorage.getItem('pelada-app-storage'));x.state.currentPlayerId=id;localStorage.setItem('pelada-app-storage',JSON.stringify(x));},id);
 const shot=name=>page.screenshot({path:path.join(out,name)});
 const message=async text=>{await page.getByLabel('Mensagem',{exact:true}).fill(text);await page.getByRole('button',{name:'Enviar',exact:true}).click();await page.getByText(text,{exact:true}).waitFor();};
 try{
  await go('/perfil');const toggle=page.getByText('Modo Resenha',{exact:true}).locator('..').locator('..').locator('input');await toggle.setChecked(!(await toggle.isChecked()));await page.waitForFunction(()=>!!localStorage.getItem('pelada-app-storage'));
  await go('/time/pel1');await page.getByRole('button',{name:'Conversa do time',exact:true}).click();await page.getByLabel('Mensagem',{exact:true}).waitFor();await message('Quem leva a bola amanhã?');
  await shot('01-chat-time.png');
  await page.getByRole('button',{name:'Configurar chat do time',exact:true}).click();await page.getByRole('button',{name:'Ambos',exact:true}).click();
  await page.getByText('Link do grupo do WhatsApp',{exact:true}).locator('..').locator('input').fill('https://chat.whatsapp.com/abcdefghijklmnop');
  await page.getByLabel('Só administradores publicam',{exact:true}).check();await page.getByRole('button',{name:'Salvar configuração do chat',exact:true}).click();await page.getByText('Configuração do time atualizada.',{exact:true}).waitFor();await shot('02-configuracao-whatsapp.png');
  const popupWait=page.waitForEvent('popup');await page.getByRole('button',{name:'Abrir grupo no WhatsApp',exact:true}).click();const popup=await popupWait;await popup.waitForLoadState();assert.equal(popup.url(),'https://chat.whatsapp.com/abcdefghijklmnop');await popup.close();
  const teamRoom=await page.evaluate(()=>JSON.parse(localStorage.getItem('marcoujogou-conversations-demo-v1')).rooms.find(r=>r.kind==='team').id);
  await switchPlayer('p3');await go(`/conversas?roomId=${teamRoom}`);await page.getByText('Quem leva a bola amanhã?',{exact:true}).waitFor();assert.equal(await page.getByLabel('Mensagem',{exact:true}).count(),0);assert.equal(await page.getByText('Configurar chat do time',{exact:true}).count(),0);
  await shot('03-time-so-avisos.png');
  await switchPlayer('p1');await go('/amigos');await page.getByRole('button',{name:'Conversas e solicitações',exact:true}).click();await page.getByText('Suas conversas',{exact:true}).waitFor();
  await go('/jogador/p2');await page.getByRole('button',{name:'Conversar',exact:true}).click();await page.getByLabel('Mensagem',{exact:true}).waitFor();await message('Amigo, bora jogar amanhã?');
  await go('/jogador/p19');await page.getByRole('button',{name:'Solicitar conversa',exact:true}).click();await page.getByText('Solicitação enviada',{exact:true}).waitFor();assert.equal(await page.getByLabel('Mensagem',{exact:true}).count(),0);await shot('04-solicitacao-enviada.png');
  const directRoom=await page.evaluate(()=>JSON.parse(localStorage.getItem('marcoujogou-conversations-demo-v1')).rooms.find(r=>r.kind==='direct'&&r.status==='pending').id);
  await switchPlayer('p19');await go('/conversas');await page.getByText('Solicitações recebidas (1)',{exact:true}).waitFor();await page.getByText('Quer conversar com você · toque para aceitar ou recusar',{exact:true}).click();await page.getByRole('button',{name:'Aceitar conversa',exact:true}).click();await page.getByLabel('Mensagem',{exact:true}).waitFor();await message('Bora! Posso jogar na quinta.');
  await switchPlayer('p1');await go(`/conversas?roomId=${directRoom}`);await page.getByText('Bora! Posso jogar na quinta.',{exact:true}).waitFor();await message('Combinado, te envio o convite do jogo.');await shot('05-chat-privado.png');
  await page.getByRole('button',{name:/Denunciar mensagem de/}).first().click();await page.getByRole('button',{name:'Spam',exact:true}).click();await page.getByText('Denúncia enviada à administração com a mensagem para análise.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Bloquear jogador',exact:true}).click();await page.getByText('Conversa indisponível por bloqueio. O histórico privado não é exibido.',{exact:true}).waitFor();assert.equal(await page.getByText('Bora! Posso jogar na quinta.',{exact:true}).count(),0);await shot('06-bloqueio.png');
  await switchPlayer('p19');await go(`/conversas?roomId=${directRoom}`);assert.equal(await page.getByLabel('Mensagem',{exact:true}).count(),0);
  await go('/conversas');await page.getByRole('button',{name:'Privacidade das conversas',exact:true}).click();await page.getByLabel('Novas conversas só de amigos',{exact:true}).check();await page.getByText('Preferência atualizada.',{exact:true}).waitFor();await shot('07-privacidade.png');
  await switchPlayer('p2');await go('/conversas?kind=direct&contextId=p19');await page.getByText('Este jogador recebe novas conversas apenas de amigos.',{exact:true}).waitFor();
  await switchPlayer('p1');await go('/conversas');
  await page.evaluate(()=>{const x=JSON.parse(localStorage.getItem('pelada-app-storage'));const source=x.state.fieldBookings[0];if(!source)throw new Error('No demo booking');localStorage.setItem('chat-booking-test',source.id);});
  const booking=await page.evaluate(()=>localStorage.getItem('chat-booking-test'));
  await go(`/conversas?kind=booking&bookingKind=field&contextId=${booking}`);await page.getByLabel('Mensagem',{exact:true}).waitFor();await message('Podemos entrar dez minutos antes?');await shot('08-atendimento-reserva.png');
  await page.setViewportSize({width:320,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot('09-chat-320.png');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(roomId=>{const key='marcoujogou-conversations-demo-v1';const x=JSON.parse(localStorage.getItem(key));for(let i=0;i<55;i++)x.messages.push({id:`history-${i}`,roomId,senderId:'p1',text:`Histórico do time ${i}`,nonce:`seed-${i}`,createdAt:new Date(Date.now()-3600000+i*1000).toISOString()});x.messages.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));localStorage.setItem(key,JSON.stringify(x));},teamRoom);
  await go(`/conversas?roomId=${teamRoom}`);await page.getByRole('button',{name:'Carregar mensagens anteriores',exact:true}).click();await page.getByText('Histórico do time 0',{exact:true}).waitFor();await message('Uma nova mensagem depois de carregar o histórico');await page.getByText('Histórico do time 6',{exact:true}).waitFor();
  const inbox=await page.evaluate(()=>JSON.parse(localStorage.getItem('marcoujogou-conversations-demo-v1')));
  assert.equal(inbox.rooms.filter(r=>r.kind==='team').length,1);
  assert.deepEqual(errors,[]);console.log('PASS: mobile team entry/chat, admin modes + safe WhatsApp navigation, member announcements, Friends entry, stranger consent, private exchange, evidence report, two-way blocking, friends-only privacy, booking service and 320px layout.');
 }catch(e){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});console.log((await page.locator('body').innerText()).slice(-4000));throw e;}finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});

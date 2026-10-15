// Production web UI with isolated synthetic HTTP/WS. No real uploads/posts/accounts.
const { chromium }=require('playwright-core'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve('.test-runtime/lances-web'),port=19044,id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const uid=id(1),pid=id(2),game=id(3),clipId=id(4),now=new Date().toISOString();
const user={id:uid,aud:'authenticated',role:'authenticated',email:'lances@test.invalid',app_metadata:{},user_metadata:{name:'Rafa'},identities:[],created_at:now};
const token=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.fixture`;
const session={access_token:token,refresh_token:'fixture',token_type:'bearer',expires_in:3600,user};
const profile={id:pid,auth_user_id:uid,name:'Rafa',nickname:null,avatar_url:null,phone:null,preferred_position:'line',favorite_sports:['futebol'],is_guest:false,created_at:now};
let clip={id:clipId,gameId:game,teamId:id(5),teamName:'Resenha FC',sportId:'futebol',authorId:pid,authorName:'Rafa',title:'Gol de primeira',caption:'Que passe!',kind:'goal',scorerId:pid,scorerName:'Rafa',assistId:id(6),assistName:'Bia',scorerConfirmed:true,assistConfirmed:false,mediaKey:null,durationSeconds:30,status:'ready',visibility:'team',publishedAt:null,source:'upload',createdAt:now,revision:1,canManage:true,hidden:false,canModerate:false,likes:0,liked:false,commentCount:0};
let comments=[],actions=[],fail=false,videoBuffer;
const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(root,'index.html');res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.png':'image/png','.ttf':'font/ttf','.ico':'image/x-icon'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
async function run(){let browser,debugPage;try{
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const ctx=await browser.newContext({viewport:{width:390,height:844}});await ctx.routeWebSocket('**/*',ws=>ws.close());
 await ctx.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.protocol==='blob:'||url.protocol==='data:'||url.hostname==='127.0.0.1')return route.continue();
  if(!url.hostname.endsWith('.supabase.co'))return route.abort();
  if(url.pathname.includes('/storage/v1/object/sign/lances/')) {
   if(route.request().method()==='POST')return route.fulfill({json:{signedURL:`/object/sign/lances/${pid}/${clipId}.mp4?token=fixture-only`}});
   return route.fulfill({contentType:'video/mp4',body:videoBuffer});
  }
  if(url.pathname.includes('/storage/v1/object/lances/'))return route.fulfill({json:{Key:`lances/${pid}/${clipId}.mp4`,Id:clipId}});
  const body=route.request().postData()?route.request().postDataJSON():{};let json=[],status=200;
  if(url.pathname.endsWith('/token'))json=session;
  else if(url.pathname.endsWith('/user'))json=user;
  else if(url.pathname.endsWith('/players'))json=url.searchParams.has('auth_user_id')?profile:[profile];
  else if(url.pathname.endsWith('/player_profiles_snapshot'))json=[profile];
  else if(url.pathname.endsWith('/platform_configuration'))json={settings:{discoveryEnabled:true},plans:[],sports:[]};
  else if(url.pathname.endsWith('/commercial_access_snapshot'))json={role:null,licenses:[],agreements:[]};
  else if(url.pathname.endsWith('/lance_snapshot')){const logged=route.request().headers().authorization===`Bearer ${token}`;if(fail){status=403;json={message:'LANCES:Sem acesso a este lance'};}else json={items:[{...clip,canManage:logged&&clip.canManage}],participants:logged?[{id:pid,name:'Rafa'},{id:id(6),name:'Bia'}]:[],comments,me:logged?pid:null};}
  else if(url.pathname.endsWith('/lance_action')){
   const a=body.p_action,d=body.p_data;actions.push(body);json={id:clipId};
   if(a==='create')json={id:clipId,mediaKey:`${pid}/${clipId}.mp4`};
   else if(a==='finish_upload')clip.mediaKey=`${pid}/${clipId}.mp4`;
   else if(a==='edit'){Object.assign(clip,d,{scorerId:d.scorerId||null,assistId:d.assistId||null,scorerName:d.scorerId?'Rafa':null,assistName:d.assistId?'Bia':null});clip.revision++;}
   else if(a==='publish'){clip.publishedAt=now;clip.visibility=d.visibility;clip.revision++;}
   else if(a==='unpublish'){clip.publishedAt=null;clip.revision++;}
   else if(a==='like'){clip.liked=d.liked;clip.likes=d.liked?1:0;}
   else if(a==='comment'){comments.push({id:id(20),name:'Rafa',body:d.body,createdAt:now});clip.commentCount++;}
  }
  await route.fulfill({status,json,headers:{'access-control-allow-origin':'*','x-supabase-api-version':'2024-01-01'}});
 });
 const page=await ctx.newPage(),errors=[];page.setDefaultTimeout(9000);page.on('pageerror',e=>errors.push(e.message));
 debugPage=page;
 // Generate a real MP4 locally using a synthetic canvas, never a customer video.
 const encoded=await page.evaluate(async()=>{
  const mime=['video/mp4;codecs=vp9','video/mp4;codecs=avc1.42001E','video/mp4'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw Error('Chrome MP4 encoder unavailable');
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;document.body.appendChild(canvas);const g=canvas.getContext('2d');
  let frame=0;const draw=()=>{g.fillStyle='#14532d';g.fillRect(0,0,640,360);g.fillStyle='#ffffff';g.font='28px sans-serif';g.fillText('VÍDEO DE TESTE · Resenha FC',65,180);g.fillRect((frame++*20)%600,240,24,24);};draw();
  const stream=canvas.captureStream(10),recorder=new MediaRecorder(stream,{mimeType:mime}),chunks=[];
  const done=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=resolve;});
  recorder.start();const timer=setInterval(()=>{draw();stream.getVideoTracks()[0].requestFrame?.();},100);await new Promise(r=>setTimeout(r,2200));recorder.stop();await done;clearInterval(timer);stream.getTracks().forEach(t=>t.stop());canvas.remove();
  const bytes=new Uint8Array(await new Blob(chunks,{type:'video/mp4'}).arrayBuffer());return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));
 });videoBuffer=Buffer.from(encoded,'base64');assert(videoBuffer.length>1000,'Synthetic MP4 must contain video frames');
 await ctx.addInitScript(({uid})=>localStorage.setItem(`marcoujogou-terms:2026-10-12-v1:${uid}`,'fixture-accepted'),{uid});
 await page.goto(`http://127.0.0.1:${port}/login`);await page.getByPlaceholder('voce@email.com').fill(user.email);await page.getByPlaceholder('••••••••').fill('fixture-only');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL(`http://127.0.0.1:${port}/`);
 await page.goto(`http://127.0.0.1:${port}/lances?gameId=${game}`);await page.getByText('Enviar um lance desta partida',{exact:true}).waitFor();
 assert(await page.getByRole('button',{name:'Enviar como rascunho',exact:true}).isDisabled());
 await page.getByText('A integração com câmeras ainda não está conectada.',{exact:false}).waitFor();
 const out='.test-runtime/lances-prints';fs.mkdirSync(out,{recursive:true});await page.screenshot({path:`${out}/01-lances-partida.png`,fullPage:true});
 await page.getByPlaceholder('Aquele gol de primeira').fill('Gol de primeira');
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Escolher vídeo da galeria',exact:true}).click();await(await chooser).setFiles({name:'lance-teste.mp4',mimeType:'video/mp4',buffer:videoBuffer});
 await page.getByText('lance-teste.mp4',{exact:false}).waitFor();await page.getByRole('button',{name:'Enviar como rascunho',exact:true}).click();await page.getByText('Identificar a jogada',{exact:true}).waitFor();
 await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.readyState>=2&&Number.isFinite(v.duration)&&v.duration>0;});
 await page.locator('video').evaluate(async v=>{await v.play();});
 await page.waitForFunction(()=>document.querySelector('video')?.currentTime>0);
 await page.locator('video').evaluate(v=>v.pause());
 assert(await page.getByRole('button',{name:'Publicar lance',exact:true}).isDisabled());
 await page.getByRole('button',{name:'Salvar identificação',exact:true}).click();await page.getByText('Alteração confirmada.',{exact:true}).waitFor();
 assert(actions.some(a=>a.p_action==='edit'&&a.p_data.assistId===id(6)));
 await page.getByRole('button',{name:'Confirmar que posso publicar este vídeo',exact:true}).click();await page.getByRole('button',{name:'Publicar lance',exact:true}).click();
 await page.getByText('Lance restrito ao time: compartilhamento externo desativado.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Compartilhar lance',exact:true}).count(),0);
 await page.getByRole('button',{name:'Curtir lance',exact:true}).click();await page.getByRole('button',{name:'Descurtir lance',exact:true}).waitFor();
 const input=page.getByText('Seu comentário',{exact:true}).locator('..').locator('textarea');await input.fill('Que golaço!');await page.getByRole('button',{name:'Comentar',exact:true}).click();await page.getByText('Que golaço!',{exact:true}).waitFor();
 await page.screenshot({path:`${out}/02-lance-publicado-time.png`,fullPage:true});
 await page.getByRole('button',{name:'Denunciar lance',exact:true}).click();await page.getByRole('button',{name:'Enviar denúncia',exact:true}).click();await page.getByText('Denúncia enviada à moderação.',{exact:true}).waitFor();
 // Backend-confirmed tags make the existing canonical post eligible for public sharing.
 clip.assistConfirmed=true;clip.visibility='public';await page.reload();await page.getByRole('button',{name:'Compartilhar lance',exact:true}).waitFor();await page.getByText(`https://app.marcoujogou.com.br/lances/${clipId}`,{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);await page.locator('video').evaluate(async v=>{await v.play();v.pause();});
 await page.getByRole('button',{name:'Voltar',exact:true}).scrollIntoViewIfNeeded();
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/03-lance-publico.png`,fullPage:true});
 await page.goto(`http://127.0.0.1:${port}/amigos`);await page.getByText('Lances da comunidade',{exact:true}).waitFor();await page.getByText('Gol de primeira',{exact:true}).waitFor();
 await page.evaluate(()=>localStorage.clear());await page.goto(`http://127.0.0.1:${port}/lances/${clipId}`);await page.getByRole('button',{name:'Compartilhar lance',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Retirar publicação para editar',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Curtir lance',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Descurtir lance',exact:true}).count(),0);
 fail=true;await page.goto(`http://127.0.0.1:${port}/lances/${clipId}`);await page.getByText('Sem acesso a este lance',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'Compartilhar lance',exact:true}).count(),0);assert.equal(await page.getByText('Gol de primeira',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: production UI, actual locally-generated MP4 picker/upload/playback, game entry, private draft/edit/consent, publication, pending tags, private share guard, likes/comments/report, public canonical link, community feed, 320/390/1280 layouts and fail-closed access. Backend synthetic.');
}catch(e){if(debugPage){console.error((await debugPage.locator('body').innerText()).slice(-4000));await debugPage.screenshot({path:'.test-runtime/lances-prints/failure.png'});}throw e;}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}}
run().catch(e=>{console.error(e);process.exitCode=1;});

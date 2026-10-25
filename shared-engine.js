import {has2DAnimation,mount2DAnimation} from './award-2d.js';
import { io } from "/socket.io/socket.io.esm.min.js";
import { hasAchievementAnimation, mountAchievementAnimation } from './achievement-player.js';
import { PRIVACY_VERSION, DEFAULT_SUBJECT, ACHIEVEMENTS, createDrillGeometryData } from './game-config.js';
export { REGIONS, CITIES, SEAT_LIMIT, CRISIS_THRESHOLD, ECONOMY_PENALTY, RESOURCE_CAP, DEVELOPMENT_STAGES, developmentFor, MAX_TEAMS, MAX_TEAM_CAPACITY, metadataFor, mapRegionsFor, capacityFor, totalCapacity, CREATOR_TEAM_ID, isCreatorTeam, regularTeams, MODE_NAMES, soloMultiplier } from "./game-config.js";

export const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

export function setupBranding(engine){
  let key='';engine.onChange(state=>{const b=state?.branding;if(!b)return;const next=JSON.stringify(b);if(key===next)return;key=next;
    document.documentElement.style.setProperty('--cyan',b.accent);document.documentElement.style.setProperty('--gold',b.gold);
    document.querySelectorAll('[data-brand-title]').forEach(node=>node.textContent=b.title);document.querySelectorAll('[data-brand-university]').forEach(node=>node.textContent=b.university);document.querySelectorAll('[data-brand-subject]').forEach(node=>node.textContent=b.subject);
    document.querySelectorAll('[data-brand-logo]').forEach(node=>{node.hidden=!b.logoUrl;if(b.logoUrl&&node.getAttribute('src')!==b.logoUrl)node.src=b.logoUrl});
    document.title=b.subject+' · '+b.university;
  });
}
const getToken = key => { for (const storage of ['localStorage','sessionStorage']) try { const value=globalThis[storage].getItem(key);if(value)return value; } catch {} };
const setToken = (key, value) => { for (const storage of ['localStorage','sessionStorage']) try {if(value)globalThis[storage].setItem(key,value);else globalThis[storage].removeItem(key);}catch{} };
const creatorToken=()=>getToken('cq_creator_session_v1');
const saveCreatorToken=value=>setToken('cq_creator_session_v1',value);

// A timed visual simulation only: no camera, screen capture or CPU-heavy canvas noise.
export function setupPresentationEffects(engine) {
  let box=null,timer=null,previousFocus=null,locked=[];
  function stop(){
    clearTimeout(timer);box?.remove();box=null;document.body.classList.remove('presentation-signal');
    for(const [node,wasInert] of locked)node.inert=wasInert;locked=[];
    if(previousFocus?.isConnected&&document.visibilityState!=='hidden')previousFocus.focus({preventScroll:true});previousFocus=null;
  }
  const receive=event=>{
    const viewer=engine.state?.viewer;
    if(!viewer||(!viewer.player&&viewer.role!=='teacher'))return;
    if(viewer.role==='teacher'&&engine.state.sessionControl?.presentationEffectsEnabled===false)return;
    if(event?.targetPid&&event.targetPid!==viewer.player?.pid)return;
    const duration=Number(event?.duration);
    if(!Number.isInteger(duration)||duration<100||duration>60000)return;
    stop();previousFocus=document.activeElement;
    box=document.createElement('div');box.className='presentation-blocker';box.tabIndex=-1;box.setAttribute('role','alert');
    box.setAttribute('aria-label','Временный визуальный эффект. Запись экрана не ведётся.');
    box.innerHTML=`<div class="recording-hud"><span class="recording-dot">● REC · SIM</span><span>FRAME LOSS</span><span>${Math.ceil(duration/1000)}s</span></div><div class="recording-noise"></div><div class="recording-center">NO SIGNAL<br><small>ВИЗУАЛЬНЫЙ ЭФФЕКТ · ЗАПИСЬ НЕ ВЕДЁТСЯ</small></div>`;
    for(const node of document.querySelectorAll('#teacher-app,#app,#cq-chat-root,#cq-project-credits,#sys-telemetry-root')){locked.push([node,node.inert]);node.inert=true;}
    document.body.classList.add('presentation-signal');document.body.append(box);box.focus({preventScroll:true});
    timer=setTimeout(stop,duration);
  };
  engine.socket.on('ui:presentation-effect',receive);
  const off=engine.onChange(state=>{if(box&&(!state?.viewer.player&&state?.viewer.role!=='teacher'||state?.viewer.role==='teacher'&&state.sessionControl?.presentationEffectsEnabled===false))stop()});
  return ()=>{stop();off();engine.socket.off('ui:presentation-effect',receive)};
}

export function setupAmbientAudio(){
  const bar=document.querySelector('.app .topbar');if(!bar)return;
  const controls=document.createElement('div');controls.className='music-controls';controls.innerHTML='<button type="button" data-music-toggle aria-pressed="false">♫ Музыка</button><label class="sr-only" for="cq-music-volume">Громкость фоновой музыки</label><input id="cq-music-volume" type="range" min="0" max="30" value="8" aria-label="Громкость музыки">';bar.append(controls);
  const button=controls.querySelector('button'),slider=controls.querySelector('input');try{slider.value=localStorage.getItem('cq_music_volume_v1')||'8'}catch{}
  let context=null,master=null,enabled=false,timer=null,step=0;const voices=new Set(),chords=[[130.81,164.81,196],[110,130.81,164.81],[87.31,130.81,174.61],[98,146.83,196]];
  function chord(){if(!enabled||document.hidden||!context)return;const start=context.currentTime+.05;for(const hz of chords[step++%chords.length]){const wave=context.createOscillator(),gain=context.createGain();wave.type='sine';wave.frequency.value=hz;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.07,start+1.6);gain.gain.linearRampToValueAtTime(0,start+6.4);wave.connect(gain);gain.connect(master);voices.add(wave);wave.onended=()=>{voices.delete(wave);wave.disconnect();gain.disconnect()};wave.start(start);wave.stop(start+6.5)}}
  function pause(){clearInterval(timer);timer=null;for(const voice of voices)try{voice.stop()}catch{}voices.clear();context?.suspend().catch(()=>{})}
  async function play(){if(document.hidden)return;const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('Браузер не поддерживает звук');context??=new Audio();if(!master){master=context.createGain();master.connect(context.destination)}master.gain.value=Number(slider.value)/100;await context.resume();chord();clearInterval(timer);timer=setInterval(chord,6000)}
  button.addEventListener('click',async()=>{enabled=!enabled;try{if(enabled)await play();else pause()}catch{enabled=false;pause();button.title='Разрешите воспроизведение звука в браузере.'}button.setAttribute('aria-pressed',String(enabled));button.textContent=enabled?'♫ Выключить':'♫ Музыка'});
  slider.addEventListener('input',()=>{if(master)master.gain.setTargetAtTime(Number(slider.value)/100,context.currentTime,.1);try{localStorage.setItem('cq_music_volume_v1',slider.value)}catch{}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else if(enabled)play().catch(()=>{})});window.addEventListener('pagehide',pause);
}

export function setupAchievementControls(engine,host){
  host.classList.add('achievement-tools');
  host.innerHTML='<h3>Достижения и перки</h3><label class="field-label section-gap">Достижение<select data-award-kind aria-label="Достижение для проверки"></select></label><p data-award-description class="small-note mut section-gap"></p><p class="small-note mut">Предпросмотр виден только вам. Ручное вручение не собирает камни для перка.</p><div class="row section-gap"><button type="button" data-award-preview>▶ Предпросмотр анимации</button><button type="button" data-award-finish>Завершить сессию</button></div><label class="field-label section-gap">Получатель<select data-award-target aria-label="Получатель достижения"></select></label><button type="button" data-award-grant class="pri section-gap">Вручить достижение</button><button type="button" data-award-revoke class="danger section-gap">Отозвать достижение</button><label class="privacy-consent section-gap"><input type="checkbox" data-award-perks><span>Играть с перками · полная коллекция снимает предел 1000 очков</span></label><p data-award-status class="small-note" role="status"></p>';
  let busy=false;
  const target=host.querySelector('[data-award-target]'),status=host.querySelector('[data-award-status]'),kind=host.querySelector('[data-award-kind]'),perks=host.querySelector('[data-award-perks]');
  const render=state=>{
    const viewer=state?.viewer,full=viewer?.isCreator||viewer?.role==='teacher',game=full||viewer?.adminGrant?.permissions.game,canGrant=full||game&&viewer?.adminGrant?.permissions.players;
    host.hidden=!game;const shell=host.closest('[data-award-tools-shell]');if(shell)shell.hidden=!game;if(!game)return;
    const catalogue=state.achievementCatalog||ACHIEVEMENTS,catalogueKey=JSON.stringify(catalogue);
    if(kind.dataset.key!==catalogueKey){const value=kind.value;kind.innerHTML=catalogue.map(a=>`<option value="${escapeHTML(a.id)}">${escapeHTML(a.title)}${a.secret?' · секретное':''}</option>`).join('');kind.dataset.key=catalogueKey;if(catalogue.some(a=>a.id===value))kind.value=value}
    host.querySelector('[data-award-description]').textContent=catalogue.find(a=>a.id===kind.value)?.description||'';
    perks.checked=state.settings.perksEnabled!==false;perks.disabled=busy||!engine.connected||!!state.round&&!state.round.resolved;
    const options=(viewer.player?`<option value="player:${viewer.player.pid}">Себе · ${escapeHTML(viewer.player.name)}</option>`:'')+'<optgroup label="Команды">'+state.regions.filter(t=>t.members.length).map(t=>`<option value="team:${t.id}">${escapeHTML(t.name)}</option>`).join('')+'</optgroup><optgroup label="Участники">'+state.regions.flatMap(t=>t.members.filter(m=>m.pid!==viewer.player?.pid).map(m=>`<option value="player:${m.pid}">${escapeHTML(m.name)} · ${escapeHTML(t.name)}</option>`)).join('')+'</optgroup>';
    if(target.dataset.key!==options){const value=target.value;target.innerHTML=options;target.dataset.key=options;if([...target.options].some(option=>option.value===value))target.value=value}
    host.querySelector('[data-award-revoke]').hidden=!full;host.querySelector('[data-award-grant]').hidden=!canGrant;target.parentElement.hidden=!canGrant;
    for(const button of host.querySelectorAll('button'))button.disabled=busy||!engine.connected;
    host.querySelector('[data-award-grant]').disabled||=!target.value;
    host.querySelector('[data-award-finish]').disabled||=!state.match?.completedCount||state.match.finishedAt!==null||!!state.round&&!state.round.resolved;
  };
  const click=async event=>{const button=event.target.closest('button');if(!button||busy||button.disabled)return;busy=true;render(engine.state);status.textContent='';try{
    if(button.hasAttribute('data-award-preview')){await engine.previewAchievement(kind.value);status.textContent='Предпросмотр запущен.'}
    else if(button.hasAttribute('data-award-grant')){const [scope,targetId]=target.value.split(':');const result=await engine.grantAchievement(kind.value,scope,targetId);status.textContent=result.duplicate?'У получателя уже есть эта награда за текущий матч.':'Достижение вручено как специальная награда.'}
    else if(button.hasAttribute('data-award-revoke')){const [scope,targetId]=target.value.split(':');if(confirm('Отозвать выбранное достижение у получателя?')){await engine.request('revokeAchievement',{achievementId:kind.value,scope,targetId});status.textContent='Достижение отозвано.'}}
    else if(button.hasAttribute('data-award-finish')){if(confirm('Завершить сессию и зафиксировать итоговый рейтинг? Команды, выполнившие условия достижения «Ты смог, братец», получат награду.'))await engine.finishMatch()}
  }catch(error){status.textContent=error.message}finally{busy=false;render(engine.state)}};
  const change=async event=>{if(event.target===kind)render(engine.state);if(event.target===perks){const enabled=perks.checked;busy=true;render(engine.state);try{await engine.setPerksEnabled(enabled);status.textContent=enabled?'Перки включены.':'Перки выключены; заработанные очки сохраняются.'}catch(error){status.textContent=error.message}finally{busy=false;render(engine.state)}}};
  host.addEventListener('click',click);host.addEventListener('change',change);const off=engine.onChange(render);return()=>{off();host.removeEventListener('click',click);host.removeEventListener('change',change)};
}


function paintSkyDrill(context,mesh,width,height,rotation){
  context.clearRect(0,0,width,height);
  const cosine=Math.cos(rotation),sine=Math.sin(rotation),tilt=-.19,ct=Math.cos(tilt),st=Math.sin(tilt),lean=-.055;
  const rotate=([x,y,z])=>{const rx=x*cosine+z*sine,rz=z*cosine-x*sine,ry=y*ct-rz*st;return [rx+ry*lean,ry,y*st+rz*ct]};
  const scale=Math.min(width/3.15,height*.205),points=mesh.vertices.map(point=>{
    const [x,y,z]=rotate(point),perspective=13/(13+z);return [width/2+x*scale*perspective,height*.06+y*scale*perspective,z];
  });
  const palette=[[70,91,92],[203,183,136],[94,111,106],[69,226,182]],light=[-.45,-.34,-.826];
  const sorted=mesh.faces.map(face=>{
    const depth=face.indices.reduce((sum,i)=>sum+points[i][2],0)/3;
    // Render the buried roots behind the cone and the visible flight in front, avoiding intersection seams.
    const side=face.indices.reduce((sum,i)=>sum+mesh.vertices[i][2]*cosine-mesh.vertices[i][0]*sine,0);
    return {face,depth,layer:face.component===1?(side>0?0:2):1};
  }).sort((a,b)=>a.layer-b.layer||b.depth-a.depth);
  context.lineJoin='round';context.lineWidth=.45;
  for(const {face}of sorted){
    const normal=rotate(face.normal);if(normal[2]>0)for(let i=0;i<3;i++)normal[i]*=-1;
    const diffuse=Math.max(0,normal.reduce((sum,n,i)=>sum+n*light[i],0)),shine=Math.pow(Math.max(0,-normal[2]*.78-normal[0]*.55-normal[1]*.28),12);
    const base=palette[face.metal],brightness=face.metal===3?.72+diffuse*.35:.24+diffuse*.98;
    const color=base.map(channel=>Math.min(255,Math.round(channel*brightness+shine*(face.metal===1?115:155))));
    const [a,b,c]=face.indices.map(i=>points[i]);context.beginPath();context.moveTo(a[0],a[1]);context.lineTo(b[0],b[1]);context.lineTo(c[0],c[1]);context.closePath();
    context.fillStyle=context.strokeStyle=`rgb(${color.join(',')})`;context.fill();context.stroke();
  }
}

function startAchievementDrill(canvas){
  const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  if(!canvas?.getContext||reduced?.matches||!globalThis.requestAnimationFrame)return null;
  let context;try{context=canvas.getContext('2d',{alpha:true,desynchronized:true})}catch{return null}
  if(!context)return null;
  let mesh=createDrillGeometryData(),frame=0,start=null,last=-Infinity,stopped=false,width=0,height=0;
  const resize=()=>{width=canvas.clientWidth||260;height=canvas.clientHeight||390;const ratio=Math.min(globalThis.devicePixelRatio||1,1.25);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);context.setTransform(ratio,0,0,ratio,0,0)};
  const stop=()=>{if(stopped)return;stopped=true;globalThis.cancelAnimationFrame(frame);globalThis.removeEventListener?.('resize',resize);mesh=null};
  const tick=now=>{
    if(stopped)return;if(document.hidden||reduced?.matches){stop();return}start??=now;const elapsed=now-start;
    if(elapsed>5000){stop();return}
    if(now-last>=1000/30){last=now;paintSkyDrill(context,mesh,width,height,.55+elapsed*.0085)}
    frame=globalThis.requestAnimationFrame(tick);
  };
  resize();paintSkyDrill(context,mesh,width,height,.55);globalThis.addEventListener?.('resize',resize);frame=globalThis.requestAnimationFrame(tick);return stop;
}

function skyFractureMarkup(){
  const branches=[
    ['M500 500 481 464 490 429 452 385 463 343 422 299 434 244 392 190 403 128 363 54 370 0',0,2.7],
    ['M500 500 529 470 526 432 567 402 550 366 602 327 597 278 643 231 633 179 684 124 678 69 720 0',70,2.4],
    ['M500 500 552 492 581 511 620 490 661 504 703 469 741 476 786 440 837 448 882 414 938 425 1000 388',120,2.1],
    ['M500 500 528 537 520 568 555 606 547 654 590 686 581 730 633 785 622 838 674 904 680 1000',20,2.4],
    ['M500 500 474 530 477 565 437 598 444 642 402 682 412 721 367 769 374 823 323 886 312 945 277 1000',100,2.2],
    ['M500 500 457 491 422 514 388 495 347 511 312 482 268 490 217 455 170 469 117 434 61 449 0 421',35,2.6],
    ['M500 500 483 478 443 462 439 428 403 411 384 366 341 350 318 305 275 295 245 251 198 243 157 190 97 186 42 137 0 131',170,1.7],
    ['M490 429 523 403 511 370 529 339',320,1.1],['M463 343 498 316 493 279 516 247',440,1.2],
    ['M434 244 478 230 482 189 510 165',560,1],['M422 299 374 293 357 253 313 243',500,1.1],
    ['M567 402 607 412 628 388 663 386',350,1.1],['M597 278 556 252 566 218 549 191',490,1],
    ['M643 231 681 241 713 215 751 223 784 193',560,1.1],['M620 490 627 450 660 432 654 399',400,1.2],
    ['M741 476 753 521 785 530 800 562',590,1],['M837 448 846 402 882 390',680,1],
    ['M555 606 595 594 617 618 653 611',400,1.2],['M581 730 545 742 534 778',600,1],
    ['M477 565 505 592 497 622',340,1],['M402 682 359 675 345 705 307 710',480,1.1],
    ['M367 769 410 788 410 822',620,1],['M388 495 379 547 350 562 346 601',390,1.2],
    ['M268 490 252 534 211 546 209 582',520,1],['M170 469 157 412 119 397',640,1],
    ['M341 350 355 312 339 285',540,1],['M245 251 271 224 262 190',650,1],
    ['M547 654 521 670 523 699',510,.7],['M633 785 675 770 690 784',650,.65],
    ['M444 642 471 671 464 699',490,.6],['M374 823 345 837 345 866',670,.6],
    ['M312 482 319 450 307 433',490,.6],['M703 469 698 436 715 419',560,.65]
  ];
  const paths=branches.map(([d,delay,width],seed)=>{
    const numbers=d.match(/-?\d+(?:\.\d+)?/g).map(Number),points=[];for(let i=0;i<numbers.length;i+=2)points.push([numbers[i],numbers[i+1]]);
    let jagged=`M${points[0].join(' ')}`;
    for(let i=1;i<points.length;i++){
      const [x,y]=points[i-1],[endX,endY]=points[i],dx=endX-x,dy=endY-y,length=Math.hypot(dx,dy)||1;
      for(const fraction of [.36,.73]){const offset=Math.sin(seed*17+i*11+fraction*31)*Math.min(3.5,length*.065);jagged+=` ${+(x+dx*fraction-dy/length*offset).toFixed(1)} ${+(y+dy*fraction+dx/length*offset).toFixed(1)}`}
      jagged+=` ${endX} ${endY}`;
    }
    return `<path d="${jagged}" pathLength="1" style="--branch-delay:${delay}ms;--branch-width:${width}px"/>`;
  }).join('');
  const pieces=[['M498 494 481 464 490 429 512 465',-48,-116,-34],['M505 496 529 470 526 432 552 480',77,-100,42],['M512 501 552 492 581 511 540 519',135,-18,65],['M507 510 528 537 520 568 500 542',74,113,-54],['M496 510 474 530 477 565 453 534',-56,143,43],['M490 503 457 491 422 514 467 521',-133,52,-62],['M492 493 483 478 443 462 470 493',-119,-68,36]];
  return `<div class="sky-fracture" aria-hidden="true"><div class="sky-aperture"><i></i><i></i><i></i><i></i><i></i></div><svg viewBox="0 0 1000 1000" fill="none"><defs><linearGradient id="cq-shard-metal" x1=".1" y1="0" x2=".8" y2="1"><stop stop-color="#c8f8e1" stop-opacity=".5"/><stop offset=".24" stop-color="#2c7777" stop-opacity=".24"/><stop offset="1" stop-color="#0b252f" stop-opacity=".8"/></linearGradient></defs><g class="sky-fracture-shadow">${paths}</g><g class="sky-fracture-glow">${paths}</g><g class="sky-fracture-lines">${paths}</g><g class="sky-shards">${pieces.map(([d,x,y,turn],i)=>`<path d="${d}" style="--shard-x:${x}px;--shard-y:${y}px;--shard-turn:${turn}deg;--shard-delay:${i*35}ms"/>`).join('')}</g></svg></div>`;
}

const stoneColors={power:'#bb69ff',space:'#4aa5ff',reality:'#ff5277',mind:'#ffe467',soul:'#ffad4b',time:'#5de4a5'};
function collectionArtwork(effect){
  if(effect==='gauntlet'){
    const gems=[[87,118,'power'],[131,105,'space'],[176,113,'reality'],[216,138,'mind'],[60,211,'time'],[153,204,'soul']];
    return `<div class="gauntlet-orbit" aria-hidden="true"></div><svg class="gauntlet-art" viewBox="0 0 300 370" aria-hidden="true"><defs><linearGradient id="cq-gold" x1="0" y1="0" x2="1" y2=".7"><stop stop-color="#624116"/><stop offset=".3" stop-color="#f7da85"/><stop offset=".5" stop-color="#bc8438"/><stop offset=".77" stop-color="#f1c973"/><stop offset="1" stop-color="#69441c"/></linearGradient><linearGradient id="cq-gold-dark" x2="0" y2="1"><stop stop-color="#e3b95f"/><stop offset="1" stop-color="#644020"/></linearGradient></defs><g class="gauntlet-fist" fill="url(#cq-gold)" stroke="#ffdf8b" stroke-width="1.3" stroke-linejoin="round"><path d="M83 245 72 329 95 351 204 351 225 326 211 243Z"/><path d="m90 253-3 70 19 14h85l18-17-13-66" fill="url(#cq-gold-dark)"/><path d="M72 125 222 134 234 181 218 246 194 268 107 270 74 246 62 197Z"/><path d="M70 131 67 95 77 75 99 73 111 91 112 141 90 159 72 150Z"/><path d="M111 133 108 79 118 62 142 63 154 80 153 137 132 150Z"/><path d="M153 140 153 81 163 69 186 73 196 92 196 150 177 162Z"/><path d="M196 156 194 103 204 90 224 97 235 119 236 170 215 183Z"/><path d="M79 171 55 155 36 170 34 212 47 244 76 254 101 233 100 214 77 207Z"/><path d="m84 165 26 8 21-12 23 12 23-6 28 14-2 58-22 20-70-1-27-25Z" fill="url(#cq-gold-dark)"/><g fill="none" stroke="#68441b" stroke-width="3"><path d="m73 100 31-2m10-12 33 1m12 4 31 7m11 20 28 9M85 294l30 11h74l23-13M81 322l27 12h88l20-14M99 250l15-18m77 16-14-17"/></g>${gems.map(([x,y,color],i)=>`<g class="gauntlet-gem" style="--gem:${stoneColors[color]};--gem-order:${i}"><path d="M${x} ${y-17} ${x+13} ${y-8} ${x+11} ${y+11} ${x} ${y+18} ${x-12} ${y+8} ${x-13} ${y-8}Z" fill="#1b1228" stroke="#ffe3a1" stroke-width="4"/><path d="M${x} ${y-14} ${x+10} ${y-7} ${x+8} ${y+9} ${x} ${y+14} ${x-9} ${y+6} ${x-10} ${y-6}Z" class="gem-core"/><path d="m${x-9} ${y-6} 9 4 10-5m-10 5v16m0-16v-12" fill="none" stroke="#ffffffaa" stroke-width="1"/><ellipse cx="${x-3}" cy="${y-7}" rx="3" ry="5" fill="#fff" opacity=".8"/></g>`).join('')}</g></svg><div class="limit-shatter" aria-hidden="true"><span>1000 / 1000</span><strong>1000 / ∞</strong></div>`;
  }
  if(effect==='tower')return `<div class="neon-horizon" aria-hidden="true"></div><svg class="tower-art" viewBox="0 0 360 450" aria-hidden="true"><defs><linearGradient id="cq-tower" x2="1" y2="1"><stop stop-color="#1b2344"/><stop offset="1" stop-color="#090f20"/></linearGradient></defs><g fill="#10172c" stroke="#ef4266" stroke-width="1"><path d="M15 450V300h55v150M83 450V235h47v215M246 450V277h40v173M299 450V330h44v120"/></g><g class="tower-main"><path d="M116 448V106l64-43 63 43v342Z" fill="url(#cq-tower)" stroke="#fb4d7a" stroke-width="2"/><path d="M180 63v385M116 106l64 33 63-33M127 124v300m105-300v300" fill="none" stroke="#4a93be"/><path d="m153 82 27-18 28 18-28 15Z" fill="#e75675"/><path d="M180 63V28" stroke="#ff7192" stroke-width="3"/><circle cx="180" cy="28" r="5" fill="#ffe5c1"/>${Array.from({length:14},(_,i)=>`<path d="m123 ${151+i*19} 51 24m13-24 49-23" stroke="${i%3===0?'#fa527b':'#4c8eb0'}" stroke-width="${i%3===0?2:1}" opacity=".7"/>`).join('')}<path class="tower-beam" d="m180 65-80-150h160Z" fill="#fa4d7819"/></g></svg>`;
  if(effect==='card')return '<div class="zero-orbit" aria-hidden="true"></div><div class="zero-art" aria-hidden="true"><span>0</span><svg viewBox="0 0 160 200"><path d="m80 30-40 75 23 62h34l23-62Z" fill="#cfc3ee22" stroke="#b9a3dc"/><circle cx="80" cy="75" r="15" fill="#c9b5e6"/><path d="m40 175 40-65 40 65M28 184h104" fill="none" stroke="#c6a65e" stroke-width="3"/></svg><small>THE FOOL</small></div>';
  const shapes={
    chip:'<rect x="50" y="50" width="100" height="100" rx="15"/><rect x="73" y="73" width="54" height="54" rx="7"/><path d="m109 65-30 40h22l-11 31 33-43h-23Z"/>',
    eye:'<path d="M15 100Q100 12 185 100 100 188 15 100Z"/><circle cx="100" cy="100" r="36"/><circle cx="100" cy="100" r="13"/>',
    heart:'<path d="M100 160 32 93Q7 40 54 39q28-1 46 26 18-27 46-26 47 1 22 54Z"/><path d="m100 65-12 29 21 18-9 48"/>',
    book:'<path d="M20 45q40-20 80 12 40-32 80-12v110q-40-20-80 12-40-32-80-12Z"/><path d="M100 57v110M37 72l44 10M37 95l44 10M37 118l44 10m38-46 44-10m-44 33 44-10m-44 33 44-10"/>',
    sun:'<circle cx="100" cy="100" r="48"/><path d="m100 13 0 21m0 132v21M13 100h21m132 0h21M38 38l15 15m94 94 15 15M38 162l15-15m94-94 15-15"/>',
    medal:'<path d="m52 20 24 61h48l24-61M100 35v44"/><circle cx="100" cy="122" r="51"/><path d="M88 99v47m24-47v47"/>',
    eclipse:'<circle cx="100" cy="100" r="52"/><path d="M102 49q-45 52 0 103M24 70l24 14m104 0 24-14M24 130l24-14m104 0 24 14M100 13v19m0 136v19"/>'
  };
  return `<svg class="sigil-art" viewBox="0 0 200 200" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round">${shapes[effect]||shapes.medal}</g></svg>`;
}

export function setupAchievements(engine){
  let layer=null,timer=null,worldTimer=null,worldActive=false,worldMatchId=null,stopDrill=()=>{},identity='',ready=false,shelfKey='';const seen=new Set(),worldSeen=new Set(),queue=[],noticed=new Set();
  try{for(const id of JSON.parse(localStorage.getItem('cq_awards_seen_v1')||'[]'))if(typeof id==='string')seen.add(id)}catch{}
  const close=()=>{clearTimeout(timer);stopDrill();stopDrill=()=>{};layer?.remove();layer=null;document.body.classList.remove('achievement-playing','achievement-notice')};
  const clearWorld=()=>{clearTimeout(worldTimer);worldActive=false;document.body.classList.remove('map-celebrating');if(!layer&&queue.length&&!document.hidden)play(...queue.shift())};
  const closeExtras=()=>globalThis.dispatchEvent?.(new CustomEvent('cq:close-extras'));
  const finish=()=>{close();const next=queue.shift();if(next)play(...next)};
  const enqueue=(award,preview=false,toastOnly=false)=>{if(document.hidden)return;if(layer||worldActive&&!toastOnly&&!preview){if(queue.length<8&&!queue.some(([a])=>a.id===award.id))queue.push([award,preview,toastOnly])}else play(award,preview,toastOnly)};
  function play(award,preview=false,toastOnly=false){
    if(document.hidden)return;close();
    closeExtras();
    if(has2DAnimation(award.achievementId)&&!toastOnly){layer=document.createElement('div');layer.className='collection-cinema';document.body.append(layer);document.body.classList.add('achievement-playing');stopDrill=mount2DAnimation(layer,award,{onDone:finish});return;}
    if(hasAchievementAnimation(award.achievementId)&&!toastOnly){
      layer=document.createElement('div');layer.className='collection-cinema';document.body.append(layer);document.body.classList.add('achievement-playing');
      stopDrill=mountAchievementAnimation(layer,award,{preview,onDone:finish});return;
    }
    if(award.achievementId&&award.achievementId!=='sky-breaker'){
      const effect=['gauntlet','tower','card','chip','eye','heart','book','sun','medal','eclipse'].includes(award.effect)?award.effect:'medal',rarity=['perk','legendary','rare','common'].includes(award.rarity)?award.rarity:'common',compact=toastOnly||rarity==='common'||rarity==='rare';
      layer=document.createElement('div');layer.className=`collection-cinema collection-${effect} rarity-${rarity}${compact?' collection-compact':''}`;layer.setAttribute('aria-label','Достижение: '+award.title);
      layer.innerHTML=`<div class="collection-aura" aria-hidden="true"></div><div class="collection-art">${collectionArtwork(effect)}</div><aside class="collection-toast" role="status" aria-live="polite"><small>${preview?'ПРЕДПРОСМОТР':rarity==='perk'?'ПЕРК ОТКРЫТ':rarity==='legendary'?'ЛЕГЕНДАРНОЕ ДОСТИЖЕНИЕ':'ДОСТИЖЕНИЕ ПОЛУЧЕНО'}</small><strong>${escapeHTML(award.title)}</strong><span>${escapeHTML(award.recipientName||'')}</span></aside><button type="button" class="achievement-skip">Закрыть ×</button>`;
      layer.querySelector('button').addEventListener('click',finish);document.body.append(layer);document.body.classList.add(compact?'achievement-notice':'achievement-playing');timer=setTimeout(finish,compact?3600:5600);return;
    }
    layer=document.createElement('div');layer.className='achievement-cinema';layer.setAttribute('aria-label','Достижение: '+(award.title||'Ты смог, братец'));
    layer.innerHTML=`<div class="sky-atmosphere" aria-hidden="true"></div><div class="sky-speed-lines" aria-hidden="true">${Array.from({length:10},(_,i)=>`<i style="--line:${i}"></i>`).join('')}</div>${skyFractureMarkup()}<div class="sky-contact" aria-hidden="true"><div class="sky-impact"></div><div class="sky-shockwave"></div><div class="sky-shockwave secondary"></div>${Array.from({length:16},(_,i)=>`<i class="sky-spark" style="--spark:${i};--spark-distance:${65+(i*37)%100}px"></i>`).join('')}</div><div class="sky-drill" aria-hidden="true"><div class="sky-drill-aura"></div><div class="sky-exhaust"><i></i><i></i><i></i></div><canvas class="sky-drill-art"></canvas><svg class="sky-drill-fallback" viewBox="0 0 260 390"><defs><linearGradient id="cq-drill-metal"><stop stop-color="#142f38"/><stop offset=".34" stop-color="#b9bb9c"/><stop offset=".45" stop-color="#f0deb4"/><stop offset=".63" stop-color="#556c66"/><stop offset="1" stop-color="#162f38"/></linearGradient></defs><path fill="url(#cq-drill-metal)" d="m130 22 98 311-17 34H49l-17-34Z"/><path d="m124 47 17 12-27 21 40 20-51 27 65 25-78 32 91 31-103 35 118 33-130 39" fill="none" stroke="#c8b888" stroke-width="12" stroke-linejoin="round"/><path d="M45 341h170" stroke="#6de4bd" stroke-width="5"/></svg></div><aside class="achievement-toast" role="status" aria-live="polite"><span class="achievement-emblem"><svg viewBox="0 0 48 56" aria-hidden="true"><path d="M24 3 42 43 36 51H12L6 43Z" fill="#203c3b" stroke="#d4c18d" stroke-width="1.5"/><path d="m22 10 6 5-11 8 16 6-20 9 25 7" fill="none" stroke="#e8d6a0" stroke-width="3"/><path d="M13 49h22" stroke="#70e5bd" stroke-width="2"/></svg></span><div><small>${preview?'ПРЕДПРОСМОТР · ПРОРЫВ':'ДОСТИЖЕНИЕ ПОЛУЧЕНО'}</small><strong>${escapeHTML(award.title||'Ты смог, братец')}</strong><span>${escapeHTML(preview?'Небо — не предел':award.recipientName||'Путь от кризиса к победе')}</span></div></aside><button class="achievement-skip" type="button">Пропустить анимацию ×</button>`;
    layer.querySelector('button').addEventListener('click',()=>{finish();if(toastOnly)clearWorld()});document.body.append(layer);document.body.classList.add(toastOnly?'achievement-notice':'achievement-playing');
    if(toastOnly){layer.classList.add('achievement-toast-only');layer.querySelector('button').textContent='Закрыть уведомление ×'}
    const animate=toastOnly?null:startAchievementDrill(layer.querySelector('canvas'));stopDrill=animate||(()=>{});if(animate)layer.classList.add('has-drill-mesh');timer=setTimeout(finish,7800);
  }
  const render=state=>{
    if(!state)return;
    const viewer=state.viewer,current=viewer.player?.pid||(viewer.role==='teacher'?'teacher':'guest');
    if(current!==identity){identity=current;ready=false;shelfKey='';queue.length=0;close();clearWorld();worldSeen.clear();noticed.clear()}
    if(worldMatchId!==state.match?.id){worldMatchId=state.match?.id;queue.length=0;close();clearWorld();worldSeen.clear();noticed.clear()}
    const active=(state.worldAchievements||[]).filter(a=>a.durationMs-(state.serverTime-a.startedAt)-Math.max(0,Date.now()-(state.clientReceivedAt||Date.now()))>0);
    if(!document.hidden&&active.some(a=>!worldSeen.has(a.id))){
      const freshWorld=active.filter(a=>!worldSeen.has(a.id));for(const a of active)worldSeen.add(a.id);
      const drills=freshWorld;
      if(drills.length){closeExtras();worldActive=true;document.body.classList.add('map-celebrating');clearTimeout(worldTimer);const remaining=Math.max(...drills.map(a=>a.durationMs-(state.serverTime-a.startedAt)-Math.max(0,Date.now()-(state.clientReceivedAt||Date.now()))));worldTimer=setTimeout(clearWorld,remaining);}
      globalThis.dispatchEvent?.(new CustomEvent('cq:world-achievement',{detail:{teamIds:freshWorld.map(a=>a.teamId),achievementIds:freshWorld.map(a=>a.achievementId)}}));
      const ownAwards=new Set((state.achievements||[]).map(a=>a.id));
      for(const a of freshWorld.filter(a=>a.achievementId!=='sky-breaker'&&!ownAwards.has(a.id)))enqueue({...a,recipientName:a.teamName},false,true);
    }
    document.querySelectorAll('[data-achievement-rules]').forEach(node=>node.textContent=engine.mode==='teacher'?'Обычные, редкие и легендарные награды. Секретные условия доступны в пульте ниже.':'Коллекция сохраняется после выхода в этом браузере. Шесть разных легендарных наград открывают перк. Секретные награды появляются после получения.');
    const progress=state.achievementProgress,counters=state.achievementCounters;document.querySelectorAll('[data-achievement-progress]').forEach(node=>{const rank=state.teamLeaderboard?.find(t=>t.teamId===viewer.player?.regionId)?.rank??0;node.textContent=state.settings?.mode==='solo'&&counters?`Быстрых ответов: ${Math.min(5,counters.fast)}/5 · быстрая верная серия: ${Math.min(3,counters.fastRun)}/3.`:progress?`«Ты смог, братец»: ${progress.hitCrisis?'✓':'○'} экономика ниже 30% · ${progress.recoveredByQuiz&&progress.economy===100?'✓':'○'} восстановлена до 100% · ${state.match?.finishedAt!=null&&rank===1?'✓':'○'} первое место в конце. Текущее место: ${rank||'—'}.`:''});
    const awards=engine.mode==='teacher'?(state.match?.awards||[]):state.achievements||[],catalogue=state.achievementCatalog||ACHIEVEMENTS,collection=state.collection,key=JSON.stringify([awards,catalogue,collection,state.match?.id]);
    if(key!==shelfKey){shelfKey=key;
      document.querySelectorAll('[data-achievement-count]').forEach(node=>node.textContent=String(awards.length));
      document.querySelectorAll('[data-collection-stones]').forEach(node=>{node.hidden=!collection;node.innerHTML=collection?`<div class="collection-stones" aria-label="Легендарных достижений: ${collection.stones.length} из 6">${Object.entries(stoneColors).map(([stone,color])=>`<i style="--stone:${color}" class="${collection.stones.includes(stone)?'lit':''}" title="${collection.stones.includes(stone)?'Камень получен':'Камень ещё не открыт'}"></i>`).join('')}</div><p class="small-note ${collection.unlocked?'violet':'mut'}">${collection.unlocked?(collection.active?'∞ Личный перк активен · предел очков снят':'∞ Перк открыт · преподаватель отключил перки'):`${collection.stones.length} / 6 легендарных достижений`}</p>`:''});
      const owned=new Set(awards.map(a=>a.achievementId)),locked=engine.mode==='teacher'?[]:catalogue.filter(a=>!owned.has(a.id)&&!a.secret);
      document.querySelectorAll('[data-achievement-shelf]').forEach(node=>{node.innerHTML=awards.slice(-30).reverse().map(a=>`<button type="button" class="achievement-card rarity-${['common','rare','legendary','perk'].includes(a.rarity)?a.rarity:'legendary'}" data-award-replay="${escapeHTML(a.id)}"><span class="achievement-emblem">${escapeHTML(a.icon||'⟐')}</span><span><strong>${escapeHTML(a.title)}</strong><small>${escapeHTML(a.recipientName)} · ${a.source==='manual'?'Специальное вручение':a.rarity==='perk'?'Перк · полная коллекция':'Получено в игре'}</small><small>${escapeHTML(a.description||'')}</small></span><span class="achievement-replay">▶</span></button>`).join('')+locked.map(a=>`<article class="achievement-card achievement-locked"><span class="achievement-emblem">${escapeHTML(a.icon||'⟐')}</span><span><strong>${escapeHTML(a.title)}</strong><small>${escapeHTML(a.description)}</small></span></article>`).join('')||'<p class="small-note mut">В этом матче ещё нет наград.</p>'});
    }
    const fresh=awards.filter(award=>!seen.has(award.id));for(const award of awards)seen.add(award.id);
    try{localStorage.setItem('cq_awards_seen_v1',JSON.stringify([...seen].slice(-1000)))}catch{}
    if(ready)for(const award of fresh)if(engine.mode!=='teacher'||!worldSeen.has(award.id))enqueue(award,false,worldSeen.has(award.id));ready=current!=='guest';
    for(const notice of state.achievementNotices||[])if(!noticed.has(notice.id)){noticed.add(notice.id);enqueue({id:notice.id,achievementId:'notice',title:notice.text,rarity:'common',effect:'eye',recipientName:'Полученное достижение остаётся в коллекции.'},false,true)}
  };
  const preview=data=>{queue.length=0;play({...data,title:data?.title||'Ты смог, братец'},true)},replay=event=>{const id=event.target.closest('[data-award-replay]')?.dataset.awardReplay;if(!id)return;const state=engine.state,award=(engine.mode==='teacher'?state?.match?.awards:state?.achievements)?.find(a=>a.id===id);if(award){queue.length=0;play(award)}};
  const keydown=event=>{if(event.key==='Escape'){queue.length=0;close()}},visibility=()=>{if(document.hidden){queue.length=0;close();clearWorld()}};
  document.addEventListener('click',replay);document.addEventListener('keydown',keydown);document.addEventListener('visibilitychange',visibility);engine.socket.on('achievement:preview',preview);
  const off=engine.onChange(render),tools=document.getElementById('achievement-tools'),stopTools=tools?setupAchievementControls(engine,tools):null;
  return()=>{queue.length=0;close();clearWorld();off();stopTools?.();document.removeEventListener('click',replay);document.removeEventListener('keydown',keydown);document.removeEventListener('visibilitychange',visibility);engine.socket.off('achievement:preview',preview)};
}

export class GameEngine {
  constructor(mode = "student") {
    this.mode = mode;
    this.state = null;
    this.connected = false;
    this.error = "";
    this.sessionNotice = "";
    this.offset = 0;this.clockRtt=Infinity;this.lastClockSync=0;this.clockSyncing=false;this.inputStatus=null;
    this.listeners = new Set();
    this.chatListeners=new Set();this.chatMeta=null;this.chatView=null;
    this.cookieSessions=typeof document!=='undefined';this.legacyToken=this.cookieSessions?(mode==='student'?creatorToken()||getToken('cq_player_token_v2'):getToken('cq_teacher_token_v2')):null;
    this.socket = io({ autoConnect: false,transports:['websocket','polling'],tryAllTransports:true,reconnection:true,reconnectionDelay:2000,reconnectionDelayMax:2000,randomizationFactor:0,timeout:30000, auth: callback => callback({surface:mode,activityVersion:1,...(!this.cookieSessions?{playerToken:mode==='student'?creatorToken()||getToken('cq_player_token_v2'):undefined,teacherToken:mode==='teacher'?getToken('cq_teacher_token_v2'):undefined}:{})}) });
    this.socket.on('connect',async()=>{this.clockRtt=Infinity;this.lastClockSync=0;this.syncClock();this.httpProof=null;this.connected=!this.legacyToken;this.error=this.legacyToken?'Восстанавливаем вашу сессию…':'';this.emit();if(this.legacyToken&&!this.migrationTried){this.migrationTried=true;try{await this.bindSession(mode==='teacher'?'teacher':'player',this.legacyToken);this.legacyToken=null;this.clearLegacyTokens();this.socket.disconnect().connect()}catch(error){if(error.code==='SESSION_EXPIRED'){this.legacyToken=null;this.clearLegacyTokens();this.connected=true;this.error=''}else this.error='Не удалось восстановить прежний вход. Обновите страницу после подключения.';this.emit()}}});
    this.socket.on('session:ready',data=>{this.httpProof=data.proof});
    this.socket.on('session:expired',data=>{
      this.sessionNotice='Сессия завершена после 30 минут бездействия. Войдите заново.';
      this.legacyToken=null;
      if(data?.roles?.includes('player')){setToken('cq_player_token_v2',null);saveCreatorToken(null);setToken('cq_session_v3',null);setToken('isDevTelemetry',null)}
      if(data?.roles?.includes('teacher'))setToken('cq_teacher_token_v2',null);
      this.emit();
    });
    this.socket.on('answer:received',data=>{
      if(this.inputStatus?.requestId===data?.requestId){this.inputStatus={...this.inputStatus,status:'received'};this.emit();}
    });
    this.socket.on("disconnect", () => {this.clockSyncing=false;this.clockRtt=Infinity;this.httpProof=null;this.connected = false; this.emit(); });
    this.socket.on("connect_error", () => { this.connected = false; this.error = "Подключение к серверу... (пробуждение инстанса может занять до 30 сек)"; this.emit(); });
    this.socket.on("state", state => {
      const previous=this.state?.viewer,changed=previous?.role!==state.viewer.role||previous?.player?.pid!==state.viewer.player?.pid||previous?.player?.regionId!==state.viewer.player?.regionId;
      if(this.inputStatus?.roundId!==state.round?.id)this.inputStatus=null;
      this.state = state;
      Object.defineProperty(state,'clientReceivedAt',{value:Date.now(),enumerable:false});
      if(mode==='student')try{if(state.viewer.player)localStorage.setItem('cq_session_v3',JSON.stringify({playerId:state.viewer.player.pid,teamId:state.viewer.player.regionId,mode:state.settings.mode||'team',name:state.viewer.player.name}));else localStorage.removeItem('cq_session_v3');localStorage.removeItem('isDevTelemetry')}catch{}
      if(changed){this.chatMeta=null;this.chatView=null;this.emitChat()}
      if(mode==='student'&&this.cookieSessions&&state.viewer.player&&this.httpProof&&this.collectionConnection!==this.socket.id&&!this.collectionPending){
        const connection=this.socket.id;this.collectionPending=true;
        this.httpRequest('/api/collection',{}).then(()=>{this.collectionConnection=connection}).catch(()=>{}).finally(()=>{this.collectionPending=false});
      }
      if(!Number.isFinite(this.clockRtt))this.offset=state.serverTime-Date.now();
      if(Date.now()-this.lastClockSync>30000)this.syncClock();
      if(!this.legacyToken){if(mode==='student'&&!state.viewer.player){setToken('cq_player_token_v2',null);saveCreatorToken(null)}if(mode==='teacher'&&state.viewer.role!=='teacher')setToken('cq_teacher_token_v2',null)}
      this.emit();
    });
    this.socket.on('chat:meta',meta=>{this.chatMeta=meta;this.emitChat()});
    this.socket.on('ui:refresh',()=>{
      if(this.refreshPending)return;this.refreshPending=true;
      const notice=document.createElement('div');notice.className='session-refresh-toast';notice.setAttribute('role','status');notice.textContent='Администратор обновляет интерфейс. Ваше место и ответы сохранены.';document.body.append(notice);
      setTimeout(()=>window.location.reload(),1500);
    });
    this.socket.on('chat:view',view=>{this.chatView=view;this.emitChat()});
    this.socket.on('chat:message',event=>{if(this.chatView?.room!==event.room)return;const messages=this.chatView.messages.filter(m=>m.id!==event.message.id).concat(event.message).sort((a,b)=>a.sequence-b.sequence).slice(-(this.chatMeta?.historyLimit||80));this.chatView={...this.chatView,messages,latestSequence:event.latestSequence};this.emitChat()});
    this.stopActivityTracking=this.trackUserActivity();
    this.socket.connect();
  }
  trackUserActivity(){
    if(typeof document==='undefined'||typeof document.addEventListener!=='function')return ()=>{};
    let lastSent=-Infinity,pending=false,timer=null;
    const authenticated=()=>!!(this.state?.viewer.player||this.state?.viewer.role==='teacher');
    const send=()=>{timer=null;if(!pending||document.hidden||!this.connected||this.legacyToken||!authenticated())return;pending=false;lastSent=Date.now();this.socket.emit('session:activity',{})};
    const observe=event=>{if(event.isTrusted!==true||document.hidden||!this.connected||!authenticated())return;pending=true;const delay=15000-(Date.now()-lastSent);if(delay<=0)send();else if(!timer){timer=setTimeout(send,delay);timer.unref?.()}};
    const events=['pointerdown','keydown','input','scroll','wheel'];
    for(const event of events)document.addEventListener(event,observe,{capture:true,passive:true});
    const off=this.onChange(()=>{if(!authenticated()){pending=false;clearTimeout(timer);timer=null}});
    return ()=>{clearTimeout(timer);off();for(const event of events)document.removeEventListener(event,observe,true)};
  }
  onChange(listener) { this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener); }
  emit() { for (const fn of this.listeners) try{fn(this.state)}catch(error){console.error('Ошибка обновления интерфейса:',error)} }
  onChat(listener){this.chatListeners.add(listener);listener(this.chatMeta,this.chatView);return()=>this.chatListeners.delete(listener)}
  emitChat(){for(const fn of this.chatListeners)try{fn(this.chatMeta,this.chatView)}catch(error){console.error('Ошибка обновления чата:',error)}}
  subscribeChat(room){return this.request('chatSubscribe',{room})}
  sendChat(room,text,clientId){return this.request('chatSend',{room,text,clientId})}
  deleteChatMessage(messageId){return this.request('chatDelete',{messageId})}
  syncClock(){
    if(this.clockSyncing||!this.socket.connected)return;
    this.clockSyncing=true;const connection=this.socket.id,sentAt=Date.now();this.lastClockSync=sentAt;
    this.socket.timeout(4000).emit('clock:sync',(error,data)=>{
      if(connection!==this.socket.id)return;this.clockSyncing=false;const receivedAt=Date.now(),rtt=receivedAt-sentAt;
      if(!error&&Number.isFinite(data?.serverTime)&&rtt>=0&&rtt<=4000){this.clockRtt=rtt;this.offset=data.serverTime-(sentAt+receivedAt)/2;}
    });
  }
  request(event, data = {}) {
    if (!this.connected||this.legacyToken) return Promise.reject(new Error(this.legacyToken?'Идёт восстановление прежнего входа. Дождитесь подключения.':'Нет связи с сервером. Дождитесь подключения.'));
    if(this.cookieSessions&&['applyRawState','restoreBackup','updateBranding','importQuestions','analyzeSyllabus','generateQuestions'].includes(event))return this.httpRequest('/api/bulk/'+event,data);
    const input=['castVote','confirmVote','cancelVote','voteLeader','teamSubmit'].includes(event);
    if(input){const requestId=globalThis.crypto?.randomUUID?.()||('req_'+Date.now()+'_'+Math.random().toString(36).slice(2));data={...data,requestId};this.inputStatus={requestId,roundId:data.roundId,optionIdx:data.optionIdx,status:'sending'};this.emit();}
    const inputDone=status=>{if(input&&this.inputStatus?.requestId===data.requestId){this.inputStatus={...this.inputStatus,status};this.emit();}};
    return new Promise((resolve, reject) => this.socket.timeout(20000).emit(event, data, (error, response) => {
      if (error) {inputDone('error');reject(new Error("Сервер не подтвердил действие. Проверьте состояние перед повтором.")); return; }
      if (!response?.ok) {
        inputDone('error');
        if (response?.code === "FORBIDDEN" && this.mode === "teacher") { setToken("cq_teacher_token_v2", null); this.socket.disconnect().connect(); }
        reject(Object.assign(new Error(response?.error || 'Действие не выполнено.'),{code:response?.code})); return;
      }
      inputDone('saved');resolve(response);
    }));
  }
  async httpRequest(path,data){if(!this.httpProof)await new Promise((resolve,reject)=>{const ready=()=>{clearTimeout(wait);resolve()},wait=setTimeout(()=>{this.socket.off('session:ready',ready);reject(new Error('Подключение ещё не готово. Повторите действие.'))},5000);this.socket.once('session:ready',ready)});if(!this.socket.connected)throw new Error('Нет связи с сервером.');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{const response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CQ-Client':'1','X-CQ-Socket':this.socket.id,'X-CQ-Proof':this.httpProof,'X-CQ-Surface':this.mode},body:JSON.stringify(data),signal:controller.signal});const result=await response.json();if(!result.ok)throw Object.assign(new Error(result.error||'Запрос не выполнен.'),{code:result.code});return result}finally{clearTimeout(timer)}}
  bindSession(role,token){return this.httpRequest('/api/session',{role,token})}
  clearLegacyTokens(){for(const key of ['cq_player_token_v2','cq_creator_session_v1','cq_teacher_token_v2','isDevTelemetry'])setToken(key,null)}
  allQuestions() { return (this.state?.questions || []).filter(q=>(q.subject||DEFAULT_SUBJECT)===(this.state?.branding?.subject||DEFAULT_SUBJECT)); }
  remainingSeconds() {
    const round = this.state?.round;
    if (!round || round.resolved) return 0;
    return Math.max(0, Math.ceil((round.paused ? round.remainingMs : round.deadline - (Date.now() + this.offset)) / 1000));
  }
  async joinTeam(regionId, name, accepted = false) {
    const result = await this.request("joinTeam", { regionId, name, privacyConsent:{accepted,version:PRIVACY_VERSION} });
    if(result.sessionMethod==='cookie'){await this.bindSession('player',result.playerToken);this.clearLegacyTokens();this.socket.disconnect().connect()}else{setToken('cq_player_token_v2',result.playerToken);saveCreatorToken(result.isCreator?result.playerToken:null)}
    this.sessionNotice='';
    return result;
  }
  async teacherLogin(password) {
    const result = await this.request("teacherLogin", { password });
    if(result.sessionMethod==='cookie'){await this.bindSession('teacher',result.teacherToken);this.clearLegacyTokens();this.socket.disconnect().connect()}else setToken('cq_teacher_token_v2',result.teacherToken);
    this.sessionNotice='';
    return result;
  }
  async teacherLogout() {if(this.state?.viewer.isCreator){window.location.href='./student.html';return}if(this.cookieSessions)await this.httpRequest('/api/session',{role:'teacher',action:'clear'});await this.request('teacherLogout');setToken('cq_teacher_token_v2',null)}
  async leaveTeam() {await this.request('leaveTeam');if(this.cookieSessions)await this.httpRequest('/api/session',{role:'player',action:'clear'});setToken('cq_player_token_v2',null);saveCreatorToken(null)}
  voteLeader(accept){return this.request('voteLeader',{accept,roundId:this.state?.round?.id})}
  setTeamRules(decision,tradeEnabled){return this.request('setTeamRules',{decision,tradeEnabled})}
  setLeader(teamId,pid){return this.request('setLeader',{teamId,pid})}
  offerTrade(toTeamId,resources,economy){return this.request('offerTrade',{toTeamId,resources,economy})}
  settleTrade(id,accept){return this.request('settleTrade',{id,accept})}
  createAdminInvite(permissions,minutes,effectDuration){return this.request('createAdminInvite',{permissions,minutes,effectDuration})}
  revokeAdminInvite(id){return this.request('revokeAdminInvite',{id})}
  rotateAccessKey(){return this.request('rotateAccessKey')}
  finishMatch(){return this.request('finishMatch')}
  setPerksEnabled(enabled){return this.request('setPerksEnabled',{enabled})}
  grantAchievement(achievementId,scope,targetId){return this.request('grantAchievement',{achievementId,scope,targetId})}
  previewAchievement(achievementId='sky-breaker'){return this.request('previewAchievement',{achievementId})}
  castVote(optionIdx) { return this.request("castVote", { optionIdx, roundId: this.state?.round?.id }); }
  confirmVote(pid){return this.request('confirmVote',{pid,roundId:this.state?.round?.id})}
  cancelVote(){return this.request('cancelVote',{roundId:this.state?.round?.id})}
  setGameMode(mode){return this.request('setGameMode',{mode})}
  renameSelf(name){return this.request('renameSelf',{name})}
  adjustCapital(pid,delta){return this.request('adjustCapital',{pid,delta})}
  teamSubmit() { return this.request("teamSubmit", { roundId: this.state?.round?.id }); }
  freeSlot(regionId, pid) { return this.request("freeSlot", { regionId, pid }); }
  respondSessionExit(requestId,accept){return this.request('respondSessionExit',{requestId,accept})}
  removeAllPlayers(){return this.request('removeAllPlayers')}
  setSessionMode(mode){return this.request('setSessionMode',{mode})}
  refreshClients(scope){return this.request('refreshClients',{scope})}
  presentationEffect(duration,targetPid){const data={};if(duration)data.duration=duration;if(targetPid)data.targetPid=targetPid;return this.request('presentationEffect',data)}
  grantAdmin(pid,permissions,effectDuration,unlimitedEffects){return this.request('grantAdmin',{pid,permissions,effectDuration,unlimitedEffects})}
  revokeAdmin(pid){return this.request('revokeAdmin',{pid})}
  setPresentationEffects(enabled){return this.request('setPresentationEffects',{enabled})}
  updateBranding(branding){return this.request('updateBranding',{branding})}
  createBackup(){return this.request('createBackup')}
  restoreBackup(data){return this.request('restoreBackup',{...data,revision:this.state?.revision})}
  startRound(questionId, duration) { return this.request("startRound", { questionId, duration }); }
  switchQuestion(questionId,duration) { return this.request("switchQuestion",{questionId,duration}); }
  pauseRound() { return this.request("pauseRound"); }
  resetTimer() { return this.request("resetTimer"); }
  resolveRound() { return this.request("resolveRound"); }
  endRound() { return this.request("endRound"); }
  adjustPoints(regionId, delta) { return this.request("adjustPoints", { regionId, delta }); }
  adjustEconomy(regionId, delta) { return this.request("adjustEconomy", { regionId, delta }); }
  addCustomQuestion(text, options, correctIdx, points) { return this.request("addCustomQuestion", { text, options, correctIdx, points }); }
  createTeam(name, baseRegionId, capacity, points, economy,cityId) { return this.request("createTeam",{name,baseRegionId,capacity,points,economy,cityId}); }
  expandTeams(count) { return this.request("expandTeams",{count}); }
  async planTeamCount(count) { return (await this.request("planTeamCount",{count})).plan; }
  setTeamCount(count,layoutToken) { return this.request("setTeamCount",{count,layoutToken}); }
  setTeamCapacity(teamId,capacity) { return this.request("setTeamCapacity",{teamId,capacity}); }
  setAllCapacities(capacity) { return this.request("setAllCapacities",{capacity}); }
  updateTeam(teamId,changes) { return this.request("updateTeam",{teamId,changes}); }
  movePlayer(pid,toTeamId) { return this.request("movePlayer",{pid,toTeamId}); }
  renamePlayer(pid,name) { return this.request("renamePlayer",{pid,name}); }
  updatePlayer(pid,name,toTeamId) { return this.request("updatePlayer",{pid,name,toTeamId}); }
  renameTeam(teamId,name,baseRegionId) { return this.request("renameTeam",{teamId,name,baseRegionId}); }
  removeTeam(teamId) { return this.request("removeTeam",{teamId}); }
  editQuestion(questionId,question,version) { return this.request("editQuestion",{questionId,question,version}); }
  deleteQuestion(questionId) { return this.request("deleteQuestion",{questionId}); }
  importQuestions(questions) { return this.request("importQuestions",{questions}); }
  async analyzeSyllabus(text) { return this.request("analyzeSyllabus",{text}); }
  async generateQuestions(text,topics,count) { return this.request("generateQuestions",{text,topics,count}); }
  resetGame() { return this.request("resetGame"); }
  applyRawState(snapshot) { return this.request("applyRawState", snapshot); }
  async getSnapshot() { return (await this.request("getSnapshot")).snapshot; }
  getHotfixBackup() { return this.request("getHotfixBackup"); }
  async exportSummary() { return (await this.request("exportSummary")).rows; }
}

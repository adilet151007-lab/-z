import { io } from "/socket.io/socket.io.esm.min.js";
import { PRIVACY_VERSION, DEFAULT_SUBJECT } from './game-config.js';
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
  host.innerHTML='<h3>Ты смог, братец</h3><p class="small-note mut">15% → 100% ответами и первое место по итогам матча. Предпросмотр работает без игровых условий.</p><div class="row section-gap"><button type="button" data-award-preview>▶ Предпросмотр анимации</button><button type="button" data-award-finish>Завершить матч</button></div><label class="field-label section-gap">Получатель<select data-award-target aria-label="Получатель достижения"></select></label><button type="button" data-award-grant class="pri section-gap">Вручить достижение</button><p data-award-status class="small-note" role="status"></p>';
  let busy=false;
  const target=host.querySelector('[data-award-target]'),status=host.querySelector('[data-award-status]');
  const render=state=>{
    const viewer=state?.viewer,full=viewer?.isCreator||viewer?.role==='teacher',game=full||viewer?.adminGrant?.permissions.game,canGrant=full||game&&viewer?.adminGrant?.permissions.players;
    host.hidden=!game;const shell=host.closest('[data-award-tools-shell]');if(shell)shell.hidden=!game;if(!game)return;
    const options=(viewer.player?`<option value="player:${viewer.player.pid}">Себе · ${escapeHTML(viewer.player.name)}</option>`:'')+'<optgroup label="Команды">'+state.regions.filter(t=>t.members.length).map(t=>`<option value="team:${t.id}">${escapeHTML(t.name)}</option>`).join('')+'</optgroup><optgroup label="Участники">'+state.regions.flatMap(t=>t.members.filter(m=>m.pid!==viewer.player?.pid).map(m=>`<option value="player:${m.pid}">${escapeHTML(m.name)} · ${escapeHTML(t.name)}</option>`)).join('')+'</optgroup>';
    if(target.dataset.key!==options){const value=target.value;target.innerHTML=options;target.dataset.key=options;if([...target.options].some(option=>option.value===value))target.value=value}
    host.querySelector('[data-award-grant]').hidden=!canGrant;target.parentElement.hidden=!canGrant;
    for(const button of host.querySelectorAll('button'))button.disabled=busy||!engine.connected;
    host.querySelector('[data-award-grant]').disabled||=!target.value;
    host.querySelector('[data-award-finish]').disabled||=!state.match?.completedCount||state.match.finishedAt!==null||!!state.round&&!state.round.resolved;
  };
  const click=async event=>{const button=event.target.closest('button');if(!button||busy||button.disabled)return;busy=true;render(engine.state);status.textContent='';try{
    if(button.hasAttribute('data-award-preview')){await engine.previewAchievement();status.textContent='Предпросмотр запущен. Награды и очки не изменены.'}
    else if(button.hasAttribute('data-award-grant')){const [scope,targetId]=target.value.split(':');const result=await engine.grantAchievement('sky-breaker',scope,targetId);status.textContent=result.duplicate?'У получателя уже есть эта награда за текущий матч.':'Достижение вручено.'}
    else if(button.hasAttribute('data-award-finish')){if(confirm('Завершить матч и определить победителей? Итоги текущего вопроса уже должны быть подведены.'))await engine.finishMatch()}
  }catch(error){status.textContent=error.message}finally{busy=false;render(engine.state)}};
  host.addEventListener('click',click);const off=engine.onChange(render);return()=>{off();host.removeEventListener('click',click)};
}

export function setupAchievements(engine){
  let layer=null,timer=null,identity='',ready=false,shelfKey='';const seen=new Set();
  try{for(const id of JSON.parse(localStorage.getItem('cq_awards_seen_v1')||'[]'))if(typeof id==='string')seen.add(id)}catch{}
  const close=()=>{clearTimeout(timer);layer?.remove();layer=null;document.body.classList.remove('achievement-playing')};
  function play(award,preview=false){
    if(document.hidden)return;close();
    layer=document.createElement('div');layer.className='achievement-cinema';layer.setAttribute('aria-label','Достижение: '+(award.title||'Ты смог, братец'));
    layer.innerHTML=`<div class="sky-veins" aria-hidden="true"><svg viewBox="0 0 1000 700" preserveAspectRatio="none"><g class="sky-cracks"><path d="M500 188 L442 150 L458 119 L405 71 L370 0 M500 188 L564 142 L552 112 L617 58 L631 0 M500 188 L401 208 L349 175 L287 191 L202 136 L130 146 L0 72 M500 188 L594 220 L659 184 L724 207 L779 171 L866 181 L1000 125 M500 188 L476 249 L504 281 L452 333 L467 381 M500 188 L532 270 L582 288 L569 345 L638 414 M405 71 L339 68 L310 29 M617 58 L682 63 L723 23 M349 175 L337 116 L288 95 M779 171 L801 112 L859 88"/></g></svg></div><div class="sky-impact" aria-hidden="true"></div><div class="spiral-rocket" aria-hidden="true"><div class="drill-spin"><div class="drill-core"></div>${[0,1,2,3,4,5,6].map(i=>`<i class="drill-ring" style="--ring:${i}"></i>`).join('')}<div class="drill-nose"></div><div class="drill-collar"></div></div><div class="spiral-exhaust"></div></div><aside class="achievement-toast" role="status" aria-live="polite"><span class="achievement-emblem">⟐</span><div><small>${preview?'ПРЕДПРОСМОТР':'ДОСТИЖЕНИЕ ПОЛУЧЕНО'}</small><strong>${escapeHTML(award.title||'Ты смог, братец')}</strong><span>${escapeHTML(preview?'Так выглядит момент прорыва':award.recipientName||'Путь от кризиса к победе')}</span></div></aside><button class="achievement-skip" type="button">Пропустить анимацию ×</button>`;
    layer.querySelector('button').addEventListener('click',close);document.body.append(layer);document.body.classList.add('achievement-playing');timer=setTimeout(close,6400);
  }
  const render=state=>{
    if(!state)return;
    const viewer=state.viewer,current=viewer.player?.pid||(viewer.role==='teacher'?'teacher':'guest');
    if(current!==identity){identity=current;ready=false;shelfKey='';close()}
    const awards=engine.mode==='teacher'?(state.match?.awards||[]):state.achievements||[],key=JSON.stringify([awards,state.match?.id]);
    if(key!==shelfKey){shelfKey=key;
      document.querySelectorAll('[data-achievement-count]').forEach(node=>node.textContent=String(awards.length));
      document.querySelectorAll('[data-achievement-shelf]').forEach(node=>{node.innerHTML=awards.length?awards.slice(-20).reverse().map(a=>`<button type="button" class="achievement-card" data-award-replay="${a.id}"><span class="achievement-emblem">⟐</span><span><strong>${escapeHTML(a.title)}</strong><small>${escapeHTML(a.recipientName)} · ${a.source==='manual'?'Специальное вручение':'Камбэк · первое место'}</small></span><span class="achievement-replay">▶</span></button>`).join(''):'<div class="achievement-empty"><span>⟐</span><div><strong>Место для прорыва</strong><p>Награды за матч появятся здесь. «Ты смог, братец»: восстановитесь с 15% до 100% и завершите матч первыми.</p></div></div>'});
    }
    const fresh=awards.filter(award=>!seen.has(award.id));for(const award of awards)seen.add(award.id);
    try{localStorage.setItem('cq_awards_seen_v1',JSON.stringify([...seen].slice(-1000)))}catch{}
    if(ready&&fresh.length)play(fresh[fresh.length-1]);ready=current!=='guest';
  };
  const preview=()=>play({title:'Ты смог, братец'},true),replay=event=>{const id=event.target.closest('[data-award-replay]')?.dataset.awardReplay;if(!id)return;const state=engine.state,award=(engine.mode==='teacher'?state?.match?.awards:state?.achievements)?.find(a=>a.id===id);if(award)play(award)};
  const keydown=event=>{if(event.key==='Escape')close()},visibility=()=>{if(document.hidden)close()};
  document.addEventListener('click',replay);document.addEventListener('keydown',keydown);document.addEventListener('visibilitychange',visibility);engine.socket.on('achievement:preview',preview);
  const off=engine.onChange(render),tools=document.getElementById('achievement-tools'),stopTools=tools?setupAchievementControls(engine,tools):null;
  return()=>{close();off();stopTools?.();document.removeEventListener('click',replay);document.removeEventListener('keydown',keydown);document.removeEventListener('visibilitychange',visibility);engine.socket.off('achievement:preview',preview)};
}

export class GameEngine {
  constructor(mode = "student") {
    this.mode = mode;
    this.state = null;
    this.connected = false;
    this.error = "";
    this.sessionNotice = "";
    this.offset = 0;
    this.listeners = new Set();
    this.chatListeners=new Set();this.chatMeta=null;this.chatView=null;
    this.cookieSessions=typeof document!=='undefined';this.legacyToken=this.cookieSessions?(mode==='student'?creatorToken()||getToken('cq_player_token_v2'):getToken('cq_teacher_token_v2')):null;
    this.socket = io({ autoConnect: false,reconnection:true,reconnectionDelay:2000,reconnectionDelayMax:2000,randomizationFactor:0,timeout:30000, auth: callback => callback({surface:mode,activityVersion:1,...(!this.cookieSessions?{playerToken:mode==='student'?creatorToken()||getToken('cq_player_token_v2'):undefined,teacherToken:mode==='teacher'?getToken('cq_teacher_token_v2'):undefined}:{})}) });
    this.socket.on('connect',async()=>{this.httpProof=null;this.connected=!this.legacyToken;this.error=this.legacyToken?'Восстанавливаем вашу сессию…':'';this.emit();if(this.legacyToken&&!this.migrationTried){this.migrationTried=true;try{await this.bindSession(mode==='teacher'?'teacher':'player',this.legacyToken);this.legacyToken=null;this.clearLegacyTokens();this.socket.disconnect().connect()}catch(error){if(error.code==='SESSION_EXPIRED'){this.legacyToken=null;this.clearLegacyTokens();this.connected=true;this.error=''}else this.error='Не удалось восстановить прежний вход. Обновите страницу после подключения.';this.emit()}}});
    this.socket.on('session:ready',data=>{this.httpProof=data.proof});
    this.socket.on('session:expired',data=>{
      this.sessionNotice='Сессия завершена после 30 минут бездействия. Войдите заново.';
      this.legacyToken=null;
      if(data?.roles?.includes('player')){setToken('cq_player_token_v2',null);saveCreatorToken(null);setToken('cq_session_v3',null);setToken('isDevTelemetry',null)}
      if(data?.roles?.includes('teacher'))setToken('cq_teacher_token_v2',null);
      this.emit();
    });
    this.socket.on("disconnect", () => {this.httpProof=null;this.connected = false; this.emit(); });
    this.socket.on("connect_error", () => { this.connected = false; this.error = "Подключение к серверу... (пробуждение инстанса может занять до 30 сек)"; this.emit(); });
    this.socket.on("state", state => {
      const previous=this.state?.viewer,changed=previous?.role!==state.viewer.role||previous?.player?.pid!==state.viewer.player?.pid||previous?.player?.regionId!==state.viewer.player?.regionId;
      this.state = state;
      if(mode==='student')try{if(state.viewer.player)localStorage.setItem('cq_session_v3',JSON.stringify({playerId:state.viewer.player.pid,teamId:state.viewer.player.regionId,mode:state.settings.mode||'team',name:state.viewer.player.name}));else localStorage.removeItem('cq_session_v3');localStorage.removeItem('isDevTelemetry')}catch{}
      if(changed){this.chatMeta=null;this.chatView=null;this.emitChat()}
      this.offset = state.serverTime - Date.now();
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
  request(event, data = {}) {
    if (!this.connected||this.legacyToken) return Promise.reject(new Error(this.legacyToken?'Идёт восстановление прежнего входа. Дождитесь подключения.':'Нет связи с сервером. Дождитесь подключения.'));
    if(this.cookieSessions&&['applyRawState','restoreBackup','updateBranding','importQuestions','analyzeSyllabus','generateQuestions'].includes(event))return this.httpRequest('/api/bulk/'+event,data);
    return new Promise((resolve, reject) => this.socket.timeout(20000).emit(event, data, (error, response) => {
      if (error) { reject(new Error("Сервер не подтвердил действие. Проверьте состояние перед повтором.")); return; }
      if (!response?.ok) {
        if (response?.code === "FORBIDDEN" && this.mode === "teacher") { setToken("cq_teacher_token_v2", null); this.socket.disconnect().connect(); }
        reject(Object.assign(new Error(response?.error || 'Действие не выполнено.'),{code:response?.code})); return;
      }
      resolve(response);
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

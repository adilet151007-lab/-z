import {escapeHTML as h} from './shared-engine.js';

export function setupTelemetry(engine){
 let root=null,sheet=null,open=false,tab='eye',hold=null,origin=null,swipe=null,busy=false,selected='',pid='',lastIdentity='';
 const enabled=()=>engine.state?.viewer.isDevTelemetry===true,$=id=>document.getElementById(id);
 function close(){open=false;if(root)root.hidden=true;document.body.classList.remove('telemetry-open')}
 function show(){if(!enabled())return;mount();open=true;root.hidden=false;document.body.classList.add('telemetry-open');window.dispatchEvent(new Event('cq:hide-chat'));render()}
 function status(message,error=false){if($('sys-status')){$('sys-status').textContent=message;$('sys-status').classList.toggle('red',error)}}
 async function run(fn){if(!enabled()||busy)return;busy=true;status('Сохраняю…');try{await fn();if(enabled())status('Синхронизировано.')}catch(e){status(e.message,true)}finally{busy=false;if(enabled())render()}}
 function mount(){
  if(root)return;root=document.createElement('div');root.id='sys-telemetry-root';root.hidden=true;
  root.innerHTML=`<div class="telemetry-shade"></div><aside id="sys-telemetry-overlay" class="telemetry-sheet" role="dialog" aria-label="Системная диагностика"><header class="telemetry-header"><div class="telemetry-handle"></div><div class="row spaced"><strong>Session telemetry</strong><button id="sys-close" class="ghost" aria-label="Закрыть диагностику">×</button></div></header><nav class="telemetry-tabs" role="tablist">${[['eye','God Eye'],['control','Live Control & Identity'],['json','Hotfix JSON']].map(([key,name])=>`<button role="tab" data-sys-tab="${key}">${name}</button>`).join('')}</nav><p id="sys-status" class="small-note" role="status"></p><div class="telemetry-content"><section data-sys-pane="eye"><div id="sys-question" class="answer-key"></div><div id="sys-scores" class="section-gap"></div><h3 class="section-gap">Следующие вопросы</h3><div id="sys-bank" class="question-bank"></div></section><section data-sys-pane="control" hidden><form id="sys-identity-form" class="qform"><label for="sys-name">Сменить моё имя</label><input id="sys-name" minlength="2" maxlength="40" required><button class="pri">Обновить имя</button></form><label class="field-label section-gap" for="sys-target">Команда / участник</label><select id="sys-target"></select><p id="sys-target-info" class="small-note mut"></p><div class="row section-gap"><button data-sys-action="points">+25 ресурсов</button><button data-sys-action="economy">+20% экономики</button><button data-sys-action="restore">Сбросить штраф</button></div><div class="row section-gap"><button data-sys-action="previous">← Вопрос</button><button data-sys-action="next">Вопрос →</button><button data-sys-action="pause">Пауза / продолжить</button><button data-sys-action="timer">Сброс таймера</button><button data-sys-action="resolve">Подвести итоги</button></div><label class="field-label section-gap" for="sys-player">Участник в слоте</label><select id="sys-player"></select><div class="row section-gap"><button data-sys-action="kick" class="danger">Освободить слот</button><button data-sys-action="chat">Обращения</button></div></section><section data-sys-pane="json" hidden><p class="small-note mut">Очки, экономика, участники и банк вопросов. Токены и права проверяются сервером. Перед применением сохраняется резервная копия.</p><div class="row section-gap"><button data-sys-action="load">Обновить JSON</button><button data-sys-action="backup">Последняя резервная копия</button></div><textarea id="sys-json" rows="17" spellcheck="false" aria-label="JSON состояния игры" class="section-gap"></textarea><button data-sys-action="apply" class="pri section-gap">Apply Patch</button></section></div></aside>`;
  const spot=document.createElement('button');spot.id='sys-signal-zone';spot.className='telemetry-zone';spot.type='button';spot.setAttribute('aria-label','Открыть диагностику');spot.addEventListener('click',()=>open?close():show());document.body.append(root,spot);sheet=$('sys-telemetry-overlay');
  root.querySelector('.telemetry-shade').addEventListener('pointerdown',close);$('sys-close').addEventListener('click',close);
  root.querySelectorAll('[data-sys-tab]').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.sysTab;root.querySelector('.telemetry-content').scrollTop=0;render();if(tab==='json'&&!$('sys-json').value)run(loadJSON)}));
  $('sys-identity-form').addEventListener('submit',e=>{e.preventDefault();run(()=>engine.renameSelf($('sys-name').value.trim()))});
  $('sys-target').addEventListener('change',()=>{selected=$('sys-target').value;renderTarget()});$('sys-player').addEventListener('change',()=>{pid=$('sys-player').value});
  sheet.addEventListener('pointerdown',e=>{swipe={y:e.clientY,x:e.clientX,scroll:root.querySelector('.telemetry-content').scrollTop,target:e.target}});
  sheet.addEventListener('pointerup',e=>{if(swipe&&(swipe.scroll===0||swipe.target.closest('.telemetry-header'))&&!swipe.target.closest('input,textarea,select,button')&&e.clientY-swipe.y>65&&Math.abs(e.clientX-swipe.x)<90)close();swipe=null});sheet.addEventListener('pointercancel',()=>{swipe=null});
  root.addEventListener('click',e=>{const action=e.target.closest('[data-sys-action]')?.dataset.sysAction;if(action)run(()=>act(action))});
 }
 async function loadJSON(){$('sys-json').value=JSON.stringify(await engine.getSnapshot(),null,2)}
 function renderTarget(){const s=engine.state,solo=s.settings.mode==='solo',item=solo?s.leaderboard.find(m=>m.pid===selected):s.regions.find(t=>t.id===selected);$('sys-target-info').textContent=!item?'':solo?`${item.capital} капитала · серия ${item.streak} · ×${item.multiplier}`:`${item.points} / 1000 · экономика ${item.economy}%`;for(const a of ['economy','restore'])sheet.querySelector(`[data-sys-action="${a}"]`).disabled=solo||!engine.connected}
 function render(){
  if(!root||!enabled())return;const s=engine.state,solo=s.settings.mode==='solo',q=s.round?.question;
  sheet.querySelectorAll('[data-sys-pane]').forEach(p=>p.hidden=p.dataset.sysPane!==tab);sheet.querySelectorAll('[data-sys-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.sysTab===tab)));
  if(tab==='eye'){
   $('sys-question').innerHTML=q?`<h3>${h(q.text)}</h3>${q.options.map((v,i)=>`<p class="${i===q.correct?'cyan':'mut'}">${i===q.correct?'✓ ':''}${h(v)}</p>`).join('')}`:'Вопрос ещё не запущен.';
   $('sys-scores').innerHTML='<table class="roster-table"><thead><tr><th>Имя / область</th><th>Капитал / ресурс</th><th>Серия / экономика</th></tr></thead><tbody>'+(solo?s.leaderboard:s.regions).map(t=>`<tr><td>${h(t.name)}</td><td>${solo?t.capital:t.points}</td><td>${solo?'×'+t.multiplier:t.economy+'%'}</td></tr>`).join('')+'</tbody></table>';
   const index=s.questions.findIndex(v=>v.id===s.round?.questionId);$('sys-bank').innerHTML=s.questions.map((v,i)=>`<article class="bank-question"><small>${i<index?'Пройден':i===index?'Текущий':'Следующий'} · ${h(v.topic||'Без темы')}</small><strong>${i+1}. ${h(v.text)}</strong><span class="cyan">✓ ${h(v.options[v.correct])}</span></article>`).join('');
  }
  if(tab==='control'){
   const identity=s.viewer.player;if(lastIdentity!==identity.name){lastIdentity=identity.name;$('sys-name').value=identity.name}
   const entries=solo?s.leaderboard:s.regions;if(!entries.some(t=>(solo?t.pid:t.id)===selected))selected=entries[0]?(solo?entries[0].pid:entries[0].id):'';
   const options=entries.map(t=>`<option value="${solo?t.pid:t.id}">${h(t.name)}</option>`).join('');if($('sys-target').dataset.key!==options){$('sys-target').innerHTML=options;$('sys-target').dataset.key=options}$('sys-target').value=selected;
   const people=s.regions.flatMap(t=>t.members.map(m=>({...m,team:t.name})));if(!people.some(m=>m.pid===pid))pid=people[0]?.pid||'';
   const opts=people.map(m=>`<option value="${m.pid}">${h(m.name)} · ${h(m.team)}${m.online?'':' · вне сети'}</option>`).join('');if($('sys-player').dataset.key!==opts){$('sys-player').innerHTML=opts;$('sys-player').dataset.key=opts}$('sys-player').value=pid;renderTarget();
  }
 }
 async function act(action){
  const s=engine.state,solo=s.settings.mode==='solo';
  if(action==='points'){if(solo)await engine.adjustCapital(selected,25);else await engine.adjustPoints(selected,25)}if(action==='economy')await engine.adjustEconomy(selected,20);
  if(action==='restore'){const t=s.regions.find(t=>t.id===selected);if(t)await engine.adjustEconomy(t.id,100-t.economy)}
  if(action==='next'||action==='previous'){const qs=s.questions,i=qs.findIndex(q=>q.id===s.round?.questionId),q=qs[(i+(action==='next'?1:-1)+qs.length)%qs.length];await engine.switchQuestion(q.id,s.round?.duration||60)}
  if(action==='pause')await engine.pauseRound();if(action==='timer')await engine.resetTimer();if(action==='resolve')await engine.resolveRound();
  if(action==='kick'){const t=s.regions.find(t=>t.members.some(m=>m.pid===pid));if(t)await engine.freeSlot(t.id,pid)}
  if(action==='chat'){close();window.dispatchEvent(new CustomEvent('cq:show-chat',{detail:{channel:'support'}}))}if(action==='load')await loadJSON();
  if(action==='backup'){const b=await engine.getHotfixBackup();b.snapshot.revision=s.revision;$('sys-json').value=JSON.stringify(b.snapshot,null,2)}if(action==='apply'){await engine.applyRawState(JSON.parse($('sys-json').value));if(enabled())await loadJSON()}
 }
 function cancelHold(){clearTimeout(hold);hold=null;origin=null}
 const heading=document.getElementById('session-heading');heading.addEventListener('pointerdown',e=>{if(!enabled()||e.button>0)return;origin={x:e.clientX,y:e.clientY};hold=setTimeout(()=>{hold=null;try{navigator.vibrate?.(50)}catch{}show()},2000)});
 heading.addEventListener('pointermove',e=>{if(origin&&Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>12)cancelHold()});for(const event of ['pointerup','pointercancel','pointerleave'])heading.addEventListener(event,cancelHold);heading.addEventListener('contextmenu',e=>{if(enabled())e.preventDefault()});
 document.addEventListener('keydown',e=>{if(!enabled())return;if(e.key==='Escape'){close();return}if(e.key==='F9'||e.code==='Backquote'&&!e.target.closest('input,textarea,select')){e.preventDefault();open?close():show()}});window.addEventListener('cq:show-chat',close);
 engine.onChange(()=>{if(!enabled()){cancelHold();close();root?.remove();$('sys-signal-zone')?.remove();root=null;sheet=null;lastIdentity='';return}mount();if(open)render()});
}

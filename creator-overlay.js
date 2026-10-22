import { escapeHTML as h, REGIONS, RESOURCE_CAP, capacityFor, regularTeams, isCreatorTeam } from './shared-engine.js';
import { setupSyllabus } from './syllabus-ui.js';

const letter=i=>String.fromCharCode(65+i);
export function setupCreatorOverlay(engine){
 const toggle=document.getElementById('creative-toggle'),drawer=document.getElementById('creative-drawer');
 const $=id=>document.getElementById(id);
 let mounted=false,open=false,tab='world',questionEdit=null,teamEdit=null,playerEdit=null,bankKey='',teamsKey='',rosterKey='',busy=false,unsubscribeSyllabus=null;
 const enabled=()=>engine.state?.viewer.isCreator===true;
 function status(text,error=false){const el=$('cr-message');if(el){el.textContent=text;el.classList.toggle('red',error)}}
 async function task(fn,success='Сохранено и синхронизировано.'){if(!enabled())return;if(busy){status('Дождитесь завершения текущего действия.');return}busy=true;status('Сохраняю…');drawer.querySelectorAll('button:not([data-cr-tab]):not(#cr-close)').forEach(b=>b.disabled=true);try{await fn();status(success)}catch(error){status(error.message,true)}finally{busy=false;drawer.querySelectorAll('button:not([data-cr-tab]):not(#cr-close)').forEach(b=>b.disabled=!engine.connected)}}
 function show(value){if(!enabled())return;open=value;drawer.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open){window.dispatchEvent(new Event('cq:hide-chat'));render(engine.state);$('cr-close').focus()}}
 toggle.addEventListener('click',()=>show(!open));
 window.addEventListener('cq:show-chat',()=>{if(open)show(false)});
 document.addEventListener('keydown',e=>{
  if(!enabled())return;
  const editing=e.target.closest?.('input,textarea,select,[contenteditable="true"]');
  if(e.key==='F9'||(!editing&&(e.code==='Backquote'||e.key==='~'))){e.preventDefault();show(!open)}
  if(e.key==='Escape'&&open)show(false);
 });
 function switchTab(name){tab=name;drawer.querySelectorAll('[data-cr-panel]').forEach(p=>p.hidden=p.dataset.crPanel!==tab);drawer.querySelectorAll('[data-cr-tab]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.crTab===tab));b.classList.toggle('active',b.dataset.crTab===tab)});if(open)render(engine.state)}
 function mount(){
  drawer.innerHTML=`<header class="creative-header"><div><small>LIVE CONTROL · 2 ACCESS SLOTS</small><h2>⚡ Панель создателя</h2><span id="cr-owner" class="mut"></span></div><div class="row"><button id="cr-open-chat" class="ghost">Чаты</button><button id="cr-close" class="ghost" aria-label="Закрыть панель создателя">×</button></div></header><nav class="creative-tabs" role="tablist" aria-label="Инструменты создателя">${[['world','Мир'],['god','God Mode'],['players','Команды и игроки'],['questions','Вопросы'],['hotfix','JSON Hotfix']].map(([id,name])=>`<button role="tab" data-cr-tab="${id}" aria-selected="false">${name}</button>`).join('')}</nav><p id="cr-message" role="status" class="small-note cyan"></p><div class="creative-content">
  <section data-cr-panel="world"><h3>Вопрос и таймер</h3><p id="cr-round" class="small-note"></p><label for="cr-question" class="field-label">Вопрос из банка</label><select id="cr-question"></select><div class="row section-gap"><label for="cr-duration">Секунд</label><input id="cr-duration" type="number" min="5" max="3600" value="60" style="width:90px"><button data-cr-action="start" class="pri">Запустить</button></div><div class="row section-gap"><button data-cr-action="previous">← Предыдущий</button><button data-cr-action="next">Следующий →</button><button data-cr-action="pause" id="cr-pause">Пауза</button><button data-cr-action="timer">Сбросить таймер</button><button data-cr-action="resolve">Подвести итоги</button></div><h3 class="section-gap">Ресурсы и экономика</h3><label for="cr-team" class="field-label">Команда</label><select id="cr-team"></select><p id="cr-team-values" class="small-note"></p><div class="row section-gap"><button data-cr-points="25">+25 ресурса</button><button data-cr-points="-25">−25 ресурса</button><button data-cr-economy="10">+10% экономики</button><button data-cr-economy="-10">−10% экономики</button></div><div class="row section-gap"><button data-cr-action="export">Выгрузить ведомость</button><button data-cr-action="reset" class="danger">Сбросить игру</button></div><p class="small-note mut">Смена активного вопроса очищает его голоса без начисления очков. Все административные действия записываются в журнал.</p><ul id="cr-log" class="log-list section-gap"></ul></section>
  <section data-cr-panel="god" hidden><h3>Обзор матча и ответов</h3><div id="cr-god-question" class="answer-key"></div><div class="cr-table-wrap section-gap"><table id="cr-scoreboard" class="roster-table"></table></div><h3 class="section-gap">Вся структура квеста</h3><input id="cr-bank-search" type="search" placeholder="Поиск будущего вопроса или темы" aria-label="Поиск будущего вопроса" class="section-gap"><div id="cr-future-bank" class="question-bank"></div></section>
  <section data-cr-panel="players" hidden><h3>Команды и участники</h3><p class="small-note mut">Команда создателей имеет два закреплённых места и управляется отдельно от обычных команд.</p><form id="cr-count-form" class="admin-setting section-gap"><label for="cr-count">Обычных команд</label><input id="cr-count" type="number" min="1" max="50" value="4" required><button>Установить</button></form><form id="cr-capacity-form" class="admin-setting section-gap"><label for="cr-capacity">Мест во всех обычных командах</label><input id="cr-capacity" type="number" min="1" max="50" value="4" required><button>Применить</button></form>
  <details class="section-gap" id="cr-team-details"><summary>Создать или изменить команду</summary><form id="cr-team-form" class="qform section-gap"><label class="field-label" for="cr-team-name">Название</label><input id="cr-team-name" minlength="2" maxlength="60" required><label class="field-label" for="cr-team-base">Регион</label><select id="cr-team-base">${REGIONS.map(r=>`<option value="${r.id}">${h(r.name)}</option>`).join('')}</select><div class="team-edit-fields"><label>Мест<input id="cr-team-capacity" type="number" min="1" max="50" value="4" required></label><label>Ресурс<input id="cr-team-points" type="number" min="0" max="1000" value="0" required></label><label>Экономика, %<input id="cr-team-economy" type="number" min="0" max="100" value="100" required></label></div><div class="row"><button class="pri">Сохранить команду</button><button id="cr-team-cancel" type="button">Новая команда</button></div></form></details>
  <form id="cr-player-form" class="qform cr-edit-box" hidden><h3>Управление участником</h3><label class="field-label" for="cr-player-name">Имя</label><input id="cr-player-name" minlength="2" maxlength="40" required><label class="field-label" for="cr-player-team">Команда</label><select id="cr-player-team"></select><div class="row"><button class="pri">Сохранить участника</button><button id="cr-player-cancel" type="button">Закрыть</button></div></form><input id="cr-player-search" type="search" placeholder="Поиск команды или игрока" aria-label="Поиск участника в панели создателя" class="section-gap"><div id="cr-players"></div></section>
  <section data-cr-panel="questions" hidden><h3 id="cr-question-title">Новый вопрос</h3><form id="cr-question-form" class="qform"><label class="field-label" for="cr-q-text">Формулировка</label><textarea id="cr-q-text" rows="3" minlength="3" maxlength="2000" required></textarea>${[0,1,2,3].map(i=>`<label class="field-label" for="cr-q-${i}">Вариант ${letter(i)}</label><input id="cr-q-${i}" maxlength="500" required>`).join('')}<div class="team-edit-fields"><label>Правильный<select id="cr-q-correct">${[0,1,2,3].map(i=>`<option value="${i}">${letter(i)}</option>`).join('')}</select></label><label>Баллов<input id="cr-q-points" type="number" min="1" max="1000" value="25" required></label></div><label class="field-label" for="cr-q-topic">Тема</label><input id="cr-q-topic" maxlength="200"><label class="field-label" for="cr-q-explanation">Пояснение</label><textarea id="cr-q-explanation" maxlength="1200" rows="2"></textarea><div class="row"><button class="pri">Сохранить вопрос</button><button id="cr-q-cancel" type="button">Новый вопрос</button></div><p class="small-note mut">Правки запущенного вопроса действуют при следующем запуске. Текущий раунд сохраняет свой ответ.</p></form><details class="section-gap"><summary>Силлабус → вопросы</summary><div id="syllabus-panel"></div></details></section>
  <section data-cr-panel="hotfix" hidden><h3>Live State & Question Editor</h3><p class="small-note mut">JSON содержит команды, игроков и банк вопросов. Сервер проверяет патч и сохраняет резервную копию перед применением. Поля доступа создателей и токены управляются сервером.</p><div class="row section-gap"><button data-cr-action="load-json">Обновить JSON</button><button data-cr-action="load-backup">Открыть резервную копию</button><button data-cr-action="download-json">Скачать JSON</button></div><textarea id="cr-json" rows="22" spellcheck="false" aria-label="Редактор состояния игры" class="section-gap"></textarea><button data-cr-action="apply-json" class="pri section-gap">Применить патч · Apply Hotfix</button><p class="small-note mut">Открытие резервной копии не изменяет игру. Проверьте JSON и примените патч отдельно. Новые игроки добавляются через регистрацию.</p></section>
  </div>`;
  $('cr-close').addEventListener('click',()=>show(false));$('cr-open-chat').addEventListener('click',()=>window.dispatchEvent(new CustomEvent('cq:show-chat',{detail:{channel:'support'}})));
  drawer.querySelectorAll('[data-cr-tab]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.crTab)));
  $('cr-question').addEventListener('change',()=>renderGod(engine.state));$('cr-team').addEventListener('change',()=>renderWorld(engine.state));
  $('cr-bank-search').addEventListener('input',()=>{bankKey='';renderBank(engine.state)});
  $('cr-player-search').addEventListener('input',()=>{rosterKey='';renderPlayers(engine.state)});
  $('cr-count').value=regularTeams(engine.state.regions).length;$('cr-capacity').value=engine.state.settings.teamCapacity;$('cr-team-capacity').value=engine.state.settings.teamCapacity;
  $('cr-count-form').addEventListener('submit',e=>{e.preventDefault();task(async()=>{
    const plan=await engine.planTeamCount(Number($('cr-count').value));if(plan.overflow)throw new Error(`Не хватает ${plan.overflow} мест. Сначала увеличьте вместимость.`);
    if(plan.removed.length&&!confirm(`Оставить ${plan.count} обычных команд? Будут удалены: ${plan.removed.map(t=>`${t.name} (${t.points} ресурсов)`).join(', ')}. Перенос игроков: ${plan.moves.length}.`))return;
    await engine.setTeamCount(plan.count,plan.layoutToken);
  })});
  $('cr-capacity-form').addEventListener('submit',e=>{e.preventDefault();task(()=>engine.setAllCapacities(Number($('cr-capacity').value)))});
  $('cr-team-cancel').addEventListener('click',clearTeam);
  $('cr-team-form').addEventListener('submit',e=>{e.preventDefault();task(async()=>{
   const t={name:$('cr-team-name').value,baseRegionId:$('cr-team-base').value,capacity:Number($('cr-team-capacity').value),points:Number($('cr-team-points').value),economy:Number($('cr-team-economy').value)};
   if(teamEdit)await engine.updateTeam(teamEdit,t);else await engine.createTeam(t.name,t.baseRegionId,t.capacity,t.points,t.economy);clearTeam();
  })});
  $('cr-player-cancel').addEventListener('click',()=>{playerEdit=null;$('cr-player-form').hidden=true});
  $('cr-player-form').addEventListener('submit',e=>{e.preventDefault();task(async()=>{await engine.updatePlayer(playerEdit,$('cr-player-name').value,$('cr-player-team').value);playerEdit=null;$('cr-player-form').hidden=true})});
  $('cr-q-cancel').addEventListener('click',clearQuestion);
  $('cr-question-form').addEventListener('submit',e=>{e.preventDefault();task(async()=>{
   const q={...(questionEdit||{}),text:$('cr-q-text').value,options:[0,1,2,3].map(i=>$('cr-q-'+i).value),correct:Number($('cr-q-correct').value),points:Number($('cr-q-points').value),topic:$('cr-q-topic').value,explanation:$('cr-q-explanation').value};
   if(questionEdit)await engine.editQuestion(questionEdit.id,q,questionEdit.version);else {const r=await engine.importQuestions([q]);if(!r.added)throw new Error('Такой вопрос уже есть в банке.')}clearQuestion();
  })});
  unsubscribeSyllabus=setupSyllabus(engine,status);mounted=true;switchTab(tab);
 }
 function clearTeam(){teamEdit=null;$('cr-team-form').reset();$('cr-team-capacity').disabled=false;$('cr-team-capacity').value=engine.state.settings.teamCapacity}
 function clearQuestion(){questionEdit=null;$('cr-question-form').reset();$('cr-question-title').textContent='Новый вопрос'}
 function editQuestion(id){const q=engine.state.questions.find(q=>q.id===id);if(!q)return;questionEdit=structuredClone(q);switchTab('questions');$('cr-q-text').value=q.text;q.options.forEach((o,i)=>$('cr-q-'+i).value=o);$('cr-q-correct').value=q.correct;$('cr-q-points').value=q.points;$('cr-q-topic').value=q.topic||'';$('cr-q-explanation').value=q.explanation||'';$('cr-question-title').textContent='Редактирование вопроса'}
 function renderWorld(state){
  const key=JSON.stringify([state.questions.map(q=>[q.id,q.version]),state.regions.map(t=>[t.id,t.name])]);
  if(key!==teamsKey){teamsKey=key;const q=$('cr-question').value,t=$('cr-team').value;$('cr-question').innerHTML=state.questions.map((item,i)=>`<option value="${item.id}" ${item.id===q?'selected':''}>${i+1}. ${h(item.text)}</option>`).join('');$('cr-team').innerHTML=state.regions.map(item=>`<option value="${item.id}" ${item.id===(t||state.viewer.player.regionId)?'selected':''}>${h(item.name)}</option>`).join('')}
  const r=state.round,team=state.regions.find(t=>t.id===$('cr-team').value);
  $('cr-round').textContent=r?`${r.question.text} · ${r.resolved?'Завершён':r.paused?'Пауза':engine.remainingSeconds()+' с'}`:'Ожидание раунда';$('cr-pause').textContent=r?.paused?'Продолжить':'Пауза';
  $('cr-team-values').textContent=team?`${team.points} / ${RESOURCE_CAP} ресурса · экономика ${team.economy}% · ${team.members.length}/${capacityFor(team)} участников`:'';
  $('cr-log').innerHTML=state.log.slice(0,12).map(l=>`<li>${h(l.msg)}</li>`).join('');
 }
 function renderGod(state){
  const q=state.round?.question||state.questions.find(q=>q.id===$('cr-question').value),preview=state.round?.preview||[];
  $('cr-god-question').innerHTML=q?`<strong>${h(q.text)}</strong><p class="cyan section-gap">Правильный: ${letter(q.correct)}. ${h(q.options[q.correct])}</p>${q.explanation?`<p class="small-note mut">${h(q.explanation)}</p>`:''}`:'Нет вопросов';
  $('cr-scoreboard').innerHTML='<thead><tr><th>Команда</th><th>Ресурс</th><th>Экономика</th><th>Ответ</th></tr></thead><tbody>'+state.regions.map(t=>{const p=preview.find(p=>p.teamId===t.id);return `<tr><td>${h(t.name)}</td><td class="gold">${t.points}/1000</td><td>${t.economy}%</td><td class="${p?.correct===true?'cyan':p?.correct===false&&!p.empty?'red':'mut'}">${!p||p.empty?'—':p.chosen===null?p.reason==='tie'?'Поровну':'Нет голосов':`${letter(p.chosen)} · ${p.correct?'верно':'неверно'}${p.submitted?' ✓':''}`}</td></tr>`}).join('')+'</tbody>';
 }
 function renderBank(state){
  const query=$('cr-bank-search').value.trim().toLocaleLowerCase(),key=JSON.stringify([query,state.questions.map(q=>[q.id,q.version]),state.round?.questionId]);if(key===bankKey)return;bankKey=key;
  $('cr-future-bank').innerHTML=state.questions.map((q,i)=>({...q,number:i+1})).filter(q=>!query||`${q.text} ${q.topic||''}`.toLocaleLowerCase().includes(query)).map(q=>`<article class="bank-question"><strong>${q.number}. ${h(q.text)}${q.id===state.round?.questionId?' · ТЕКУЩИЙ':''}</strong><p class="cyan">${letter(q.correct)}. ${h(q.options[q.correct])}</p><span class="mut">${h(q.topic||'Без темы')} · ${q.points} баллов</span><div class="row"><button data-cr-edit-question="${q.id}">Редактировать</button><button data-cr-delete-question="${q.id}">Удалить</button></div></article>`).join('')||'<p class="mut">Вопросов не найдено</p>';
 }
 function renderPlayers(state){
  const query=$('cr-player-search').value.trim().toLocaleLowerCase(),key=JSON.stringify([query,state.regions]);if(key===rosterKey)return;rosterKey=key;
  $('cr-players').innerHTML=state.regions.filter(t=>!query||`${t.name} ${t.members.map(m=>m.name).join(' ')}`.toLocaleLowerCase().includes(query)).map(t=>`<article class="cr-team-card"><div class="row spaced"><h3>${h(t.name)} · ${t.members.length}/${capacityFor(t)}</h3><div class="row"><button data-cr-edit-team="${t.id}">Настроить</button>${!isCreatorTeam(t)?`<button class="danger" data-cr-remove-team="${t.id}">Удалить</button>`:''}</div></div>${t.members.map(m=>`<div class="cr-player-row"><span><i class="presence ${m.online?'online':''}"></i>${h(m.name)}${m.online?'':' · вне сети'}</span><div class="row">${!isCreatorTeam(t)?`<button data-cr-edit-player="${m.pid}">Изменить / перенести</button>`:''}<button class="danger" data-cr-remove-player="${m.pid}" data-cr-source="${t.id}">${isCreatorTeam(t)?'Освободить доступ':'Исключить'}</button></div></div>`).join('')||'<p class="small-note mut">Пока никого</p>'}</article>`).join('');
  if(playerEdit&&!state.regions.some(t=>t.members.some(m=>m.pid===playerEdit))) {playerEdit=null;$('cr-player-form').hidden=true}
 }
 function render(state){if(!mounted||!enabled())return;$('cr-owner').textContent=`${state.viewer.player.name} · ${engine.connected?'сервер подключён':'переподключение'}`;renderWorld(state);if(tab==='god'){renderGod(state);renderBank(state)}if(tab==='players')renderPlayers(state)}
 async function loadJSON(){const snapshot=await engine.getSnapshot();$('cr-json').value=JSON.stringify(snapshot,null,2)}
 function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 drawer.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b||!enabled())return;const d=b.dataset;
  if(d.crPoints!==undefined)task(()=>engine.adjustPoints($('cr-team').value,Number(d.crPoints)));
  if(d.crEconomy!==undefined)task(()=>engine.adjustEconomy($('cr-team').value,Number(d.crEconomy)));
  if(d.crEditQuestion)editQuestion(d.crEditQuestion);
  if(d.crDeleteQuestion&&confirm('Удалить этот вопрос из банка?'))task(()=>engine.deleteQuestion(d.crDeleteQuestion));
  if(d.crRemoveTeam&&confirm('Удалить команду и исключить её участников?'))task(()=>engine.removeTeam(d.crRemoveTeam));
  if(d.crRemovePlayer&&confirm('Освободить доступ или исключить участника? Для повторного входа потребуется регистрация.'))task(()=>engine.freeSlot(d.crSource,d.crRemovePlayer));
  if(d.crEditTeam){const t=engine.state.regions.find(t=>t.id===d.crEditTeam);if(t){teamEdit=t.id;$('cr-team-details').open=true;$('cr-team-name').value=t.name;$('cr-team-base').value=t.baseRegionId;$('cr-team-capacity').value=capacityFor(t);$('cr-team-capacity').disabled=isCreatorTeam(t);$('cr-team-points').value=t.points;$('cr-team-economy').value=t.economy;$('cr-team-name').focus()}}
  if(d.crEditPlayer){const source=engine.state.regions.find(t=>t.members.some(m=>m.pid===d.crEditPlayer)),m=source?.members.find(m=>m.pid===d.crEditPlayer);if(m){playerEdit=m.pid;$('cr-player-form').hidden=false;$('cr-player-name').value=m.name;$('cr-player-team').innerHTML=regularTeams(engine.state.regions).map(t=>`<option value="${t.id}" ${t.id===source.id?'selected':''} ${t.id!==source.id&&t.members.length>=capacityFor(t)?'disabled':''}>${h(t.name)} · ${t.members.length}/${capacityFor(t)}</option>`).join('');$('cr-player-name').focus()}}
  if(d.crAction)task(async()=>{
   const action=d.crAction,qs=engine.state.questions;
   if(['previous','next','start'].includes(action)){
    let id=$('cr-question').value;
    if(action!=='start'){const index=qs.findIndex(q=>q.id===(engine.state.round?.questionId||id));id=qs[(index+(action==='next'?1:-1)+qs.length)%qs.length].id}
    if(engine.state.round&&!engine.state.round.resolved&&!confirm('Сменить активный вопрос без начисления очков? Его голоса будут очищены.'))return;
    await engine.switchQuestion(id,Number($('cr-duration').value));$('cr-question').value=id;
   }
   if(action==='pause')await engine.pauseRound();if(action==='timer')await engine.resetTimer();if(action==='resolve')await engine.resolveRound();
   if(action==='load-json')await loadJSON();
   if(action==='load-backup'){const result=await engine.getHotfixBackup();result.snapshot.revision=engine.state.revision;$('cr-json').value=JSON.stringify(result.snapshot,null,2)}
   if(action==='download-json')download('creative-snapshot.json',JSON.stringify(await engine.getSnapshot(),null,2),'application/json');
   if(action==='apply-json'){const parsed=JSON.parse($('cr-json').value);if(confirm('Применить проверяемый JSON-патч ко всей игре?')){await engine.applyRawState(parsed);if(enabled())await loadJSON()}}
   if(action==='reset'&&confirm('Сбросить очки, раунд и участников? Ваш доступ тоже освободится.'))await engine.resetGame();
   if(action==='export'){const rows=await engine.exportSummary(),cell=value=>{const raw=String(value),safe=/^[=+\-@\t\r]/.test(raw)?"'"+raw:raw;return '"'+safe.replace(/"/g,'""')+'"'};download('creative-results.csv','\uFEFF'+[['Команда','Участники','Ресурс','Экономика'],...rows.map(r=>[r.region,r.members,r.points,r.economy])].map(row=>row.map(cell).join(';')).join('\r\n'),'text/csv;charset=utf-8')}
  });
 });
 engine.onChange(state=>{
  toggle.hidden=!state?.viewer.isCreator;
  if(!state?.viewer.isCreator){open=false;drawer.hidden=true;toggle.setAttribute('aria-expanded','false');if(mounted){unsubscribeSyllabus?.();drawer.replaceChildren();mounted=false;bankKey='';teamsKey='';rosterKey='';questionEdit=null;teamEdit=null;playerEdit=null}return}
  if(!mounted)mount();if(open)render(state);
 });
 setInterval(()=>{if(open&&enabled()&&$('cr-round'))renderWorld(engine.state)},1000);
}

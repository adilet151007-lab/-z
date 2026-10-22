import { GameEngine, REGIONS, CITIES,capacityFor, totalCapacity, regularTeams, isCreatorTeam, MAX_TEAMS, CRISIS_THRESHOLD, RESOURCE_CAP, developmentFor, metadataFor, setupPresentationEffects, setupBranding, escapeHTML as h } from "./shared-engine.js";
import { setupSyllabus } from "./syllabus-ui.js";
import { setupCommunication } from "./chat-ui.js";

const $ = id => document.getElementById(id), engine = new GameEngine("teacher");
setupCommunication(engine);
setupPresentationEffects(engine);
setupBranding(engine);
let scene=null,sceneFailed=false,sceneLoading=false,selectedQuestionId=null,duration=30,controlKey="",loggingIn=false;
let editId=null,editVersion=null,bankKey="",bankPage=0,teamEditId=null,projector=false,mapKey="",playerEditId=null,countPlan=null,managerInitialized=false,countDirty=false,capacityDirty=false,playerOptionsKey="",rosterKey="";
function message(text="",error=false){$("action-message").textContent=text;$("action-message").classList.toggle("red",error)}
async function act(fn,success=""){try{message('');await fn();if(success)message(success)}catch(error){message(error.message,true)}}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
const alphabet=i=>String.fromCharCode(65+i);
function html(id,value){const node=$(id);if(node.dataset.rendered!==value){node.innerHTML=value;node.dataset.rendered=value}}
async function ensureScene(){
 if(scene||sceneLoading||sceneFailed)return;sceneLoading=true;$('map-status').textContent='Загружаем 3D-карту…';
 try{const {createScene}=await import('./scene3d.js');if(engine.state?.viewer.role!=='teacher'&&!engine.state?.viewer.isCreator)return;scene=createScene($('scene-canvas'));scene.update(engine.state,$('map-team-select').value||null);$('map-status').textContent=''}
 catch{sceneFailed=true;$('map-status').textContent='3D недоступно. Управление игрой продолжает работать.'}
 finally{sceneLoading=false}
}

$("teacher-login-form").addEventListener("submit",async e=>{
 e.preventDefault();if(loggingIn)return;loggingIn=true;$("teacher-login-btn").disabled=true;
 try{await engine.teacherLogin($("teacher-password").value);$("teacher-password").value="";$("teacher-login-error").textContent=""}
 catch(error){$("teacher-login-error").textContent=error.message}
 finally{loggingIn=false;$("teacher-login-btn").disabled=!engine.connected}
});
$("logout-btn").addEventListener("click",()=>act(()=>engine.teacherLogout()));
$("reset-btn").addEventListener("click",()=>{if(confirm("Сбросить очки, обычных участников и раунд? Персональные администраторы, названия команд и банк вопросов сохранятся."))act(()=>engine.resetGame(),"Новая игра начата.")});
let adminCollapsed=false;
$("collapse-admin-btn").addEventListener("click",()=>{adminCollapsed=!adminCollapsed;document.body.classList.toggle("teacher-ui-collapsed",adminCollapsed);$("collapse-admin-btn").textContent=adminCollapsed?"Развернуть управление":"Свернуть управление";scene?.resize()});
async function removeParticipant(regionId,pid){const result=await engine.freeSlot(regionId,pid);message(result.exitRequested?'Запрос на выход отправлен. Участник должен принять или отклонить его.':'Участник исключён, место освобождено.')}
$("projector-btn").addEventListener("click",()=>{
 projector=!projector;document.body.classList.toggle("projector-mode",projector);
 if(projector)window.dispatchEvent(new Event('cq:hide-chat'));
 $("projector-btn").textContent=projector?"Вернуться к управлению":"Режим проектора";
 scene?.resize();
});
$('format-apply').addEventListener('click',()=>act(()=>engine.setGameMode($('game-format').value),'Формат обновлён у всех участников.'));
$('return-lobby').addEventListener('click',()=>act(()=>engine.endRound(),'Лобби открыто. Участники и очки сохранены.'));
$('rules-apply').addEventListener('click',()=>act(()=>engine.setTeamRules($('team-decision').value,$('trade-enabled').checked),'Правила команды обновлены.'));
$("export-btn").addEventListener("click",()=>act(async()=>{
 const rows=await engine.exportSummary(),cell=value=>{const text=String(value),safe=/^[=+\-@\t\r]/.test(text)?"'"+text:text;return `"${safe.replace(/"/g,'""')}"`};
 const lines=[["Место","Команда","Участники","Ресурс","Экономика %","Развитие","Статус"],...rows.map((r,i)=>[i+1,r.region,r.members,r.points,r.economy,r.development,r.status])];
 download("vedomost.csv","\uFEFF"+lines.map(row=>row.map(cell).join(";")).join("\r\n"),"text/csv;charset=utf-8");
}));
function renderControls(state){
 const questions=engine.allQuestions(),round=state.round,key=round?`${round.id}:${round.resolved}:${round.paused}:${engine.connected}`:`lobby:${questions.map(q=>q.id+":"+q.version).join("|")}:${selectedQuestionId}:${engine.connected}`;
 if(controlKey===key){updateTimer();return}controlKey=key;
 const disabled=engine.connected?"":"disabled";
 if(!round){
  if(!questions.some(q=>q.id===selectedQuestionId))selectedQuestionId=questions[0]?.id;
  $("round-control").innerHTML=`<h2>Ожидаем начало раунда</h2><div class="teacher-private">${!questions.length?'<p class="small-note mut">В этом предмете пока нет вопросов. Добавьте их в редакторе ниже.</p>':''}<label for="q-select" class="field-label">Вопрос</label><select id="q-select" ${disabled}>${questions.map((q,i)=>`<option value="${q.id}" ${q.id===selectedQuestionId?"selected":""}>${i+1}. ${h(q.text)}</option>`).join("")}</select><div class="row" style="margin-top:12px"><label for="duration-select" class="mut">Время</label><select id="duration-select" style="width:95px" ${disabled}>${[20,30,45,60,90,120].map(n=>`<option value="${n}" ${n===duration?"selected":""}>${n} с</option>`).join("")}</select><button class="pri" data-control="start" ${!questions.length?'disabled':disabled}>Запустить</button></div></div>`;
 }else{
  $("round-control").innerHTML=`<h2>Текущий вопрос</h2><p class="qtext">${h(round.question.text)}</p><ol class="current-options">${round.question.options.map(o=>`<li>${h(o)}</li>`).join("")}</ol><p class="mut small-note"><span id="teacher-timer"></span> · Ответили: <span id="submitted-count"></span></p><div class="row" style="margin-top:12px">${!round.resolved?`<button data-control="pause" ${disabled}>${round.paused?"Продолжить":"Пауза"}</button><button data-control="timer" ${disabled}>Сбросить таймер</button><button class="pri" data-control="resolve" ${disabled}>Подвести итоги</button>`:`<button class="pri" data-control="next" ${disabled}>Следующий вопрос</button>`}</div>`;
 }updateTimer();
}
$("round-control").addEventListener("change",e=>{if(e.target.id==="q-select"){selectedQuestionId=e.target.value;renderAnswers(engine.state)}if(e.target.id==="duration-select")duration=Number(e.target.value)});
$("round-control").addEventListener("click",e=>{
 const b=e.target.closest("[data-control]");if(!b||b.disabled)return;
 if(b.dataset.control==="start")act(()=>engine.startRound(selectedQuestionId,duration));
 if(b.dataset.control==="pause")act(()=>engine.pauseRound());
 if(b.dataset.control==="timer")act(()=>engine.resetTimer());
 if(b.dataset.control==="resolve")act(()=>engine.resolveRound());
 if(b.dataset.control==="next"){
  const qs=engine.allQuestions(),index=qs.findIndex(q=>q.id===engine.state.round.questionId);selectedQuestionId=qs[(index+1)%qs.length]?.id;
  act(()=>engine.endRound());
 }
});
function updateTimer(){const r=engine.state?.round;if(!r||!$("teacher-timer"))return;$("teacher-timer").textContent=r.resolved?"Итоги подведены":`${r.paused?"Пауза":"Осталось"}: ${engine.remainingSeconds()} с`;$("submitted-count").textContent=`${Object.keys(r.submitted).length}/${engine.state.settings.mode==='solo'?engine.state.leaderboard.length:engine.state.regions.filter(t=>t.members.length).length}`}
function renderAnswers(state){
 const round=state.round,q=round?.question||state.questions.find(q=>q.id===selectedQuestionId);
 $("answer-key").innerHTML=q?`<div class="teacher-answer-label">Правильный ответ · только преподавателю</div><strong class="cyan">${alphabet(q.correct)}. ${h(q.options[q.correct])}</strong>${q.explanation?`<p class="small-note mut">${h(q.explanation)}</p>`:""}${q.source?`<p class="small-note mut">Источник: ${h(q.source)}</p>`:""}`:'<p class="mut">Выберите вопрос.</p>';
 const preview=round?.preview||[];
 $("answer-preview").innerHTML=!round?'<p class="mut small-note">После запуска здесь появятся ответы команд.</p>':`<p class="small-note mut">${round.resolved?"Итоги завершённого раунда.":"Предварительно: голосование может измениться. Баллы начисляются при подведении итогов."}</p><div class="answer-counts"><span class="cyan">Верно: ${preview.filter(p=>p.correct===true&&!p.empty).length}</span><span class="red">Неверно: ${preview.filter(p=>p.correct===false&&!p.empty).length}</span><span class="mut">Нет решения: ${preview.filter(p=>p.correct===null&&!p.empty).length}</span></div><div class="answer-preview-list">${preview.map(p=>{
  const team=state.regions.find(t=>t.id===p.teamId)||state.leaderboard?.find(m=>m.pid===p.teamId);if(!team)return "";
  const status=p.empty?"Нет участников":p.reason==="tie"?"Голоса поровну":p.chosen===null?"Нет голосов":p.correct?"Верно":"Неверно";
  return `<div class="answer-preview-row"><span>${h(team.name)}</span><span class="${p.correct===null||p.empty?"mut":p.correct?"cyan":"red"}">${status}${p.chosen!==null?` · ${alphabet(p.chosen)}`:""}</span><small class="mut">${p.empty?"":p.submitted?"Ответ отправлен":`${p.voters} гол. · ещё выбирают`}</small></div>`;
 }).join("")}</div>`;
}
function renderRoster(state){
 const rosterState=JSON.stringify([engine.connected,$("roster-search").value,state.settings.mode,state.leaderboard,state.regions]);if(rosterKey===rosterState)return;rosterKey=rosterState;
 const query=$("roster-search").value.trim().toLocaleLowerCase(),teams=state.regions.filter(t=>!query||`${t.name} ${t.members.map(m=>m.name).join(" ")}`.toLocaleLowerCase().includes(query));
 $("team-stats").textContent=`${state.regions.length} команд · ${state.regions.reduce((s,t)=>s+(t.occupied??t.members.length),0)} / ${totalCapacity(state.regions)} участников`;
 if(state.settings.mode==='solo'){
  $('roster-table').innerHTML='<thead><tr><th>Участник</th><th>Капитал</th><th>Серия</th><th>Управление</th></tr></thead><tbody>'+state.leaderboard.filter(m=>!query||m.name.toLocaleLowerCase().includes(query)).map(m=>`<tr><td><button class="member-name" data-region="${m.teamId}" data-player-edit="${m.pid}">${h(m.name)}</button></td><td>${m.capital}</td><td>${m.streak} · ×${m.multiplier}</td><td><button class="ghost teacher-private" data-region="${m.teamId}" data-remove="${m.pid}">Исключить</button></td></tr>`).join('')+'</tbody>';return;
 }
 $("roster-table").innerHTML=`<thead><tr><th>Команда</th><th>Участники</th><th>Ресурс</th><th>Экономика</th><th>Управление</th></tr></thead><tbody>${teams.map(t=>{
  const meta=metadataFor(t),disabled=engine.connected?"":"disabled",base=REGIONS.find(r=>r.id===meta.baseRegionId);
  const protectedTeam=t.members.some(m=>state.sessionControl?.protectedPlayerIds.includes(m.pid));
  return `<tr><td><b style="color:${meta.color}">${h(meta.name)}</b><small class="mut">${h(base?.name||'')}</small><div class="row teacher-private"><button class="ghost compact" data-region="${t.id}" data-team-edit ${disabled}>Изменить</button><button class="ghost compact danger" data-region="${t.id}" data-team-remove ${protectedTeam||state.regions.length===1?'disabled':disabled}>Удалить</button></div></td><td>${t.occupied??t.members.length}/${capacityFor(t)}${t.members.map(m=>`<div class="roster-member"><span class="presence ${m.online?'online':''}"></span><button class="member-name" data-region="${t.id}" data-player-edit="${m.pid}" ${disabled}>${m.pid===t.leaderPid?'♛ ':''}${h(m.name)}</button><button class="ghost remove-player teacher-private" data-region="${t.id}" data-remove="${m.pid}" aria-label="Исключить ${h(m.name)}" ${disabled}>×</button></div>`).join('')||'<p class="mut">Пока никого</p>'}</td><td><b class="gold">${t.points} / ${RESOURCE_CAP}</b><div class="development-mini">${developmentFor(t.points).name}</div></td><td class="${t.economy<CRISIS_THRESHOLD?'crisis':''}">${t.economy}%</td><td><div class="row teacher-private"><button data-region="${t.id}" data-points="25" ${t.points>=RESOURCE_CAP?'disabled':disabled}>+25</button><button data-region="${t.id}" data-points="-25" ${disabled}>−25</button><button data-region="${t.id}" data-economy="20" ${disabled}>+20%</button><button data-region="${t.id}" data-economy="-20" ${disabled}>−20%</button></div></td></tr>`;
 }).join("")}</tbody>`;
}
$("roster-search").addEventListener("input",()=>{if(engine.state)renderRoster(engine.state)});
function openTeamEditor(id){
 const t=engine.state.regions.find(t=>t.id===id);if(!t)return;
 teamEditId=id;$("team-manager").open=true;$("team-form").closest("details").open=true;$("team-name").value=t.name;$("team-base").value=t.baseRegionId;$("team-capacity").value=capacityFor(t);$("team-capacity").disabled=isCreatorTeam(t);$("team-points").value=t.points;$("team-economy").value=t.economy;$("team-save").textContent="Сохранить показатели";$("team-save").disabled=!engine.connected;$("team-cancel").hidden=false;$("team-manager").scrollIntoView({behavior:"smooth",block:"center"});
 updateCities(t.cityId||'');
}
function openPlayerEditor(pid){
 const t=engine.state.regions.find(t=>t.members.some(m=>m.pid===pid)),m=t?.members.find(m=>m.pid===pid);if(!m)return;
 playerEditId=pid;playerOptionsKey="";$("player-name").value=m.name;$("player-error").textContent="";renderPlayerEditor(engine.state,t.id);$("player-dialog").showModal();
}
$('player-form').insertAdjacentHTML('beforeend','<button id="player-leader-btn" type="button">Назначить лидером команды</button>');
$('player-leader-btn').addEventListener('click',()=>act(async()=>{const team=engine.state.regions.find(t=>t.members.some(m=>m.pid===playerEditId));if(team)await engine.setLeader(team.id,playerEditId)},'Лидер назначен.'));
function renderPlayerEditor(state,selected){
 if(!playerEditId)return;
 const source=state.regions.find(t=>t.members.some(m=>m.pid===playerEditId)),member=source?.members.find(m=>m.pid===playerEditId);
 if(!member){$("player-dialog").close();playerEditId=null;return}
 const current=selected||$("player-team").value||source.id;
 $("player-name").disabled=isCreatorTeam(source);$("player-team").disabled=isCreatorTeam(source);
 $("player-status").textContent=`${source.name} · ${member.online?"в сети":"вне сети"}`;
 const key=JSON.stringify([source.id,state.regions.map(t=>[t.id,t.name,t.capacity,t.members.length])]);
 if(playerOptionsKey!==key){playerOptionsKey=key;$("player-team").innerHTML=state.regions.filter(t=>!isCreatorTeam(t)||t.id===source.id).map(t=>`<option value="${t.id}" ${t.id===current?"selected":""} ${t.id!==source.id&&state.settings.mode!=='solo'&&!state.sessionControl?.protectedPlayerIds.includes(playerEditId)&&(t.occupied??t.members.length)>=capacityFor(t)?"disabled":""}>${h(t.name)} · ${t.occupied??t.members.length}/${capacityFor(t)}${t.id===source.id?" · сейчас здесь":""}</option>`).join("");}
 $("player-save").disabled=!engine.connected;$("player-remove").disabled=!engine.connected;
 $("player-remove").textContent=state.sessionControl?.protectedPlayerIds.includes(playerEditId)?'Запросить выход':'Исключить';
 $('player-leader-btn').disabled=!engine.connected||state.settings.mode!=='team'||source.leaderPid===playerEditId;
}
$("player-cancel").addEventListener("click",()=>{$("player-dialog").close();playerEditId=null});
$("player-form").addEventListener("submit",async e=>{
 e.preventDefault();$("player-save").disabled=true;
 try{await engine.updatePlayer(playerEditId,$("player-name").value,$("player-team").value);$("player-dialog").close();playerEditId=null;message("Участник обновлён. Изменения отправлены всем игрокам.")}
 catch(error){$("player-error").textContent=error.message}
 finally{$("player-save").disabled=!engine.connected}
});
$("player-remove").addEventListener("click",async()=>{
 const source=engine.state.regions.find(t=>t.members.some(m=>m.pid===playerEditId));if(!source)return;
 if(!confirm(`Исключить ${source.members.find(m=>m.pid===playerEditId).name} из команды?`))return;
 try{await removeParticipant(source.id,playerEditId);$("player-dialog").close();playerEditId=null}catch(error){$("player-error").textContent=error.message}
});
$("roster-table").addEventListener("click",e=>{
 const b=e.target.closest("button[data-region]");if(!b||b.disabled)return;const id=b.dataset.region,t=engine.state.regions.find(t=>t.id===id);
 if(b.dataset.points!==undefined)act(()=>engine.adjustPoints(id,Number(b.dataset.points)));
 if(b.dataset.economy!==undefined)act(()=>engine.adjustEconomy(id,Number(b.dataset.economy)));
 if(b.hasAttribute("data-remove")&&confirm(`Исключить ${t.members.find(m=>m.pid===b.dataset.remove)?.name||"участника"} из команды? Для персональной сессии будет отправлен запрос на согласие.`))act(()=>removeParticipant(id,b.dataset.remove));
 if(b.hasAttribute("data-team-remove")&&confirm(`Удалить команду «${t.name}»? ${t.members.length} участников вернутся к регистрации, очки команды будут удалены.`))act(()=>engine.removeTeam(id),"Команда удалена.");
 if(b.hasAttribute("data-team-edit"))openTeamEditor(id);
 if(b.hasAttribute("data-player-edit"))openPlayerEditor(b.dataset.playerEdit);
});
$("team-base").innerHTML=REGIONS.map(r=>`<option value="${r.id}">${r.name}</option>`).join("");
function updateCities(selected=''){$('team-city').innerHTML='<option value="">Вся область / отдельная команда</option>'+CITIES.filter(c=>c.baseRegionId===$('team-base').value).map(c=>`<option value="${c.id}">${h(c.name)}</option>`).join('');$('team-city').value=selected}
$('team-base').addEventListener('change',()=>updateCities());$('team-city').addEventListener('change',()=>{const city=CITIES.find(c=>c.id===$('team-city').value);if(city)$('team-name').value=city.name});updateCities();
function clearTeamForm(){teamEditId=null;$("team-capacity").disabled=false;$("team-form").reset();updateCities();$("team-capacity").value=engine.state?.settings.teamCapacity||4;$("team-save").textContent="Создать команду";$("team-cancel").hidden=true}
$("team-cancel").addEventListener("click",clearTeamForm);
$("team-form").addEventListener("submit",e=>{e.preventDefault();act(async()=>{
 const changes={name:$("team-name").value,baseRegionId:$("team-base").value,cityId:$('team-city').value||null,capacity:Number($("team-capacity").value),points:Number($("team-points").value),economy:Number($("team-economy").value)};
 if(teamEditId)await engine.updateTeam(teamEditId,changes);else await engine.createTeam(changes.name,changes.baseRegionId,changes.capacity,changes.points,changes.economy,changes.cityId);clearTeamForm();
},"Настройки команды сохранены.")});
$("team-count").addEventListener("input",()=>{countDirty=true});
$("capacity-all").addEventListener("input",()=>{capacityDirty=true});
$("capacity-form").addEventListener("submit",e=>{e.preventDefault();act(async()=>{await engine.setAllCapacities(Number($("capacity-all").value));capacityDirty=false;if(!teamEditId)$("team-capacity").value=$("capacity-all").value},"Вместимость всех команд обновлена.")});
$("team-count-form").addEventListener("submit",async e=>{
 e.preventDefault();$("team-expand").disabled=true;
 try{
  countPlan=await engine.planTeamCount(Number($("team-count").value));
  if(countPlan.count===countPlan.currentCount){message("Уже установлено это количество команд.");return}
  if(!countPlan.removed.length){await applyTeamCount();return}
  $("count-plan").innerHTML=`<p class="small-note">Будет команд: <b>${countPlan.count}</b>. Участников: ${countPlan.totalPlayers}. Мест после изменения: ${countPlan.capacity}.</p><p class="small-note">Перенос игроков в свободные места: ${countPlan.moves.length}. Их вход и имена сохранятся.</p><p class="small-note mut">Будут удалены команды и их ресурсы:</p><ul class="count-removals">${countPlan.removed.map(t=>`<li>${h(t.name)} <span class="mut">· ${t.points} ресурсов · ${t.players} участников</span></li>`).join("")}</ul>${countPlan.overflow?`<p class="red small-note">Не хватает ${countPlan.overflow} мест. Закройте окно и увеличьте вместимость команд. Игроки не будут исключены автоматически.</p>`:'<p class="small-note mut">Голоса перенесённых игроков в текущем раунде будут очищены. Баллы оставшихся команд сохранятся.</p>'}`;
  $("count-apply").disabled=!!countPlan.overflow;$("count-dialog").showModal();
 }catch(error){message(error.message,true)}finally{$("team-expand").disabled=!engine.connected}
});
async function applyTeamCount(){
 const result=await engine.setTeamCount(countPlan.count,countPlan.layoutToken);countDirty=false;$("team-count").value=result.count;$("count-dialog").close();countPlan=null;
 message(`Команд: ${result.count}. Добавлено: ${result.added}; удалено: ${result.removed}; перенесено участников: ${result.moved}.`);
}
$("count-cancel").addEventListener("click",()=>{$("count-dialog").close();countPlan=null});
$("count-apply").addEventListener("click",async()=>{$("count-apply").disabled=true;try{await applyTeamCount()}catch(error){$("count-dialog").close();message(error.message,true)}finally{$("count-apply").disabled=!engine.connected}});
function renderManager(state){
 $('team-manager').hidden=state.settings.mode==='solo';
 const fixed=state.settings.universal&&!state.settings.flexibleTeams;for(const id of ['team-count-form','capacity-form'])$(id).hidden=fixed;for(const el of $('team-manager').querySelectorAll(':scope > p.small-note'))el.hidden=fixed;for(const id of ['team-name','team-capacity'])$(id).readOnly=fixed;$('team-base').disabled=fixed;$('team-city').disabled=fixed;$('team-economy').min=state.settings.universal?'15':'0';$('team-save').disabled=!engine.connected||fixed&&!teamEditId;
 if(!managerInitialized){$("team-count").value=regularTeams(state.regions).length;$("capacity-all").value=state.settings.teamCapacity;$("team-capacity").value=state.settings.teamCapacity;managerInitialized=true}
 if(!countDirty)$("team-count").value=regularTeams(state.regions).length;
 if(!capacityDirty)$("capacity-all").value=state.settings.teamCapacity;
 if(teamEditId&&!state.regions.some(t=>t.id===teamEditId))clearTeamForm();
 renderPlayerEditor(state);
}

$("question-builder").innerHTML=`<h2 id="question-form-title">Новый вопрос</h2><form id="question-form" class="qform"><p id="edit-round-note" class="small-note mut"></p><label class="field-label" for="qb-text">Формулировка</label><textarea id="qb-text" rows="3" minlength="3" maxlength="2000" required></textarea>${[0,1,2,3].map(i=>`<label class="field-label" for="qb-o${i}">Вариант ${alphabet(i)}</label><input id="qb-o${i}" type="text" maxlength="500" required>`).join("")}<div class="row"><label for="qb-correct" class="mut">Правильный</label><select id="qb-correct" style="width:80px">${[0,1,2,3].map(i=>`<option value="${i}">${alphabet(i)}</option>`).join("")}</select><label for="qb-pts" class="mut">Баллы</label><input id="qb-pts" type="number" min="1" max="1000" value="25" required style="width:85px"></div><label for="qb-topic" class="field-label">Тема (необязательно)</label><input id="qb-topic" type="text" maxlength="200"><label for="qb-explanation" class="field-label">Пояснение к ответу (необязательно)</label><textarea id="qb-explanation" rows="2" maxlength="1200"></textarea><div class="row"><button class="pri" type="submit" id="qb-add">Добавить вопрос</button><button id="qb-cancel" type="button" hidden>Отменить редактирование</button></div><p id="qb-msg" class="mut" role="status"></p></form>`;
function clearQuestionForm(){editId=null;editVersion=null;$("question-form").reset();$("question-form-title").textContent="Новый вопрос";$("qb-add").textContent="Добавить вопрос";$("qb-cancel").hidden=true;$("edit-round-note").textContent=""}
$("qb-cancel").addEventListener("click",clearQuestionForm);
function loadQuestion(id){
 const q=engine.state.questions.find(q=>q.id===id);if(!q)return;
 editId=q.id;editVersion=q.version||1;$("qb-text").value=q.text;q.options.forEach((o,i)=>$("qb-o"+i).value=o);$("qb-correct").value=q.correct;$("qb-pts").value=q.points;$("qb-topic").value=q.topic||"";$("qb-explanation").value=q.explanation||"";
 $("question-form-title").textContent="Редактирование вопроса";$("qb-add").textContent="Сохранить изменения";$("qb-cancel").hidden=false;
 $("edit-round-note").textContent=engine.state.round?.questionId===id&&!engine.state.round.resolved?"Этот вопрос сейчас запущен. Правки сохранятся в банке для следующего запуска; текущие голоса и правильный ответ раунда сохранятся.":"Изменения сразу сохраняются в общем банке.";
$("question-editor-panel").open=true;$("question-builder").scrollIntoView({behavior:"smooth",block:"start"});
}
$("question-form").addEventListener("submit",async e=>{
 e.preventDefault();$("qb-add").disabled=true;
 const current=engine.state.questions.find(q=>q.id===editId),q={text:$("qb-text").value.trim(),options:[0,1,2,3].map(i=>$("qb-o"+i).value.trim()),correct:Number($("qb-correct").value),points:Number($("qb-pts").value),topic:$("qb-topic").value.trim(),explanation:$("qb-explanation").value.trim(),...(current?.source?{source:current.source}:{}),...(current?.sourceExcerpt?{sourceExcerpt:current.sourceExcerpt}:{})};
 try{if(editId)await engine.editQuestion(editId,q,editVersion);else {const result=await engine.importQuestions([q]);if(!result.added)throw new Error("Такой вопрос уже есть в банке.")}clearQuestionForm();$("qb-msg").textContent="Вопрос сохранён.";$("qb-msg").className="cyan"}
 catch(error){$("qb-msg").textContent=error.message;$("qb-msg").className="red"}
 finally{$("qb-add").disabled=!engine.connected}
});
function renderBank(state,force=false){
 const query=$("bank-search").value.trim().toLocaleLowerCase(),key=JSON.stringify([state.branding?.subject,state.questions.map(q=>q.id+":"+q.version),query,bankPage,engine.connected]);
 if(!force&&key===bankKey)return;bankKey=key;
 const questions=engine.allQuestions().filter(q=>!query||`${q.text} ${q.topic||""}`.toLocaleLowerCase().includes(query)),pages=Math.max(1,Math.ceil(questions.length/15));bankPage=Math.min(bankPage,pages-1);
 $("bank-count").textContent=`${state.questions.length} вопросов в банке`;
 $("question-bank").innerHTML=questions.slice(bankPage*15,bankPage*15+15).map(q=>`<article class="bank-question"><div><span class="mut small-note">${h(q.topic||"Без темы")}</span><p>${h(q.text)}</p><p class="cyan small-note">${alphabet(q.correct)}. ${h(q.options[q.correct])}</p></div><div class="row"><button data-edit-question="${q.id}" ${!engine.connected?"disabled":""}>Изменить</button><button class="ghost danger" data-delete-question="${q.id}" ${!engine.connected||state.questions.length===1?"disabled":""}>Удалить</button></div></article>`).join("")||'<p class="mut">Вопросы не найдены.</p>';
 $("bank-page").textContent=`${bankPage+1} / ${pages}`;$("bank-prev").disabled=bankPage===0;$("bank-next").disabled=bankPage>=pages-1;
}
$("bank-search").addEventListener("input",()=>{bankPage=0;renderBank(engine.state,true)});
$("bank-prev").addEventListener("click",()=>{bankPage--;renderBank(engine.state,true)});$("bank-next").addEventListener("click",()=>{bankPage++;renderBank(engine.state,true)});
$("question-bank").addEventListener("click",e=>{const edit=e.target.closest("[data-edit-question]"),remove=e.target.closest("[data-delete-question]");if(edit)loadQuestion(edit.dataset.editQuestion);if(remove&&confirm("Удалить этот вопрос из банка?"))act(()=>engine.deleteQuestion(remove.dataset.deleteQuestion),"Вопрос удалён.")});
$("map-team-select").addEventListener("change",()=>{
 const id=$("map-team-select").value,team=engine.state?.regions.find(t=>t.id===id);
 if(scene&&team){scene.focusRegion(team.baseRegionId);scene.update(engine.state,id)}else if(scene){scene.overview();scene.update(engine.state)}
});
setupSyllabus(engine,message);

let brandKey='',brandDirty=false,settingsBusy=false;
function updateSubjectOptions(){const current=$('brand-subject').value,subjects=$('brand-subjects').value.split('\n').map(s=>s.trim()).filter(Boolean);$('brand-subject').innerHTML=subjects.map(s=>`<option value="${h(s)}">${h(s)}</option>`).join('');if(subjects.includes(current))$('brand-subject').value=current}
$('brand-subjects').addEventListener('input',updateSubjectOptions);$('branding-form').addEventListener('input',()=>{brandDirty=true});
async function settingAction(fn){if(settingsBusy)return;settingsBusy=true;renderSettings(engine.state);try{await fn()}catch(error){message(error.message,true)}finally{settingsBusy=false;if(engine.state)renderSettings(engine.state)}}
$('branding-form').addEventListener('submit',e=>{e.preventDefault();settingAction(async()=>{
 const data={university:$('brand-university').value,title:$('brand-title').value,subjects:$('brand-subjects').value.split('\n').map(s=>s.trim()).filter(Boolean),subject:$('brand-subject').value,accent:$('brand-accent').value,gold:$('brand-gold').value,operator:$('brand-operator').value,privacyContact:$('brand-contact').value};
 const file=$('brand-logo').files[0];if($('brand-remove-logo').checked)data.logo='';else if(file){if(file.size>150000)throw new Error('Логотип должен быть меньше 150 КБ.');data.logo=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Файл не прочитан.'));reader.readAsDataURL(file)})}
 await engine.updateBranding(data);brandDirty=false;$('brand-logo').value='';$('brand-status').textContent='Оформление сохранено у всех участников.';
 })});
$('backup-download').addEventListener('click',()=>settingAction(async()=>{const result=await engine.createBackup();download('culture-quest-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(result.archive,null,2),'application/json');$('backup-status').textContent='Зашифрованная копия скачана. Сохраните её отдельно от сервера.'}));
$('backup-restore').addEventListener('click',()=>{if(!$('backup-list').value||!confirm('Заменить состояние игры выбранной копией? Текущее состояние будет сохранено отдельной точкой. Вопрос откроется на паузе.'))return;settingAction(async()=>{await engine.restoreBackup({backupId:$('backup-list').value});$('backup-status').textContent='Игра восстановлена. Проверьте состав и продолжите раунд.'})});
$('backup-import').addEventListener('click',()=>{const file=$('backup-upload').files[0];if(!file){message('Выберите JSON-файл резервной копии.',true);return}if(file.size>6000000){message('Файл копии больше 6 МБ.',true);return}if(!confirm('Проверить файл и восстановить игру? Текущее состояние будет сохранено.'))return;settingAction(async()=>{await engine.restoreBackup({archive:JSON.parse(await file.text())});$('backup-upload').value='';$('backup-status').textContent='Копия проверена, игра восстановлена на паузе.'})});
function renderSettings(state){
 if(!state)return;const b=state.branding,next=JSON.stringify(b);
 if(b&&brandKey!==next&&!brandDirty){brandKey=next;for(const key of ['university','title','accent','gold','operator'])$('brand-'+key).value=b[key];$('brand-contact').value=b.privacyContact;$('brand-subjects').value=b.subjects.join('\n');updateSubjectOptions();$('brand-subject').value=b.subject;}
 const old=$('backup-list').value;html('backup-list',(state.restorePoints||[]).map(p=>`<option value="${p.id}">${h(p.label)} · ${h(new Date(p.at).toLocaleString('ru-RU'))}</option>`).join(''));if([...$('backup-list').options].some(o=>o.value===old))$('backup-list').value=old;
 for(const id of ['brand-save','backup-download','backup-import'])$(id).disabled=!engine.connected||settingsBusy;
 $('backup-restore').disabled=!engine.connected||settingsBusy||!state.restorePoints?.length;
}

async function refreshEditor(){$("dev-json").value=JSON.stringify(await engine.getSnapshot(),null,2)}
$("dev-open-btn").addEventListener("click",()=>act(async()=>{await refreshEditor();$("dev-overlay").style.display="flex"}));
$("dev-close-btn").addEventListener("click",()=>{$("dev-overlay").style.display="none"});document.addEventListener("keydown",e=>{if(e.key==="Escape")$("dev-overlay").style.display="none"});
$("dev-refresh-btn").addEventListener("click",()=>act(refreshEditor));
$("dev-free-all-btn").addEventListener("click",()=>{if(confirm('Исключить всех обычных участников? Две персональные сессии сохранятся.'))act(async()=>{const result=await engine.removeAllPlayers();await refreshEditor();$("dev-msg").textContent=`Освобождено мест: ${result.removed}.`})});
$("dev-force-resolve-btn").addEventListener("click",()=>act(async()=>{await engine.resolveRound();await refreshEditor()},"Раунд завершён."));
$("dev-apply-btn").addEventListener("click",async()=>{try{await engine.applyRawState(JSON.parse($("dev-json").value));await refreshEditor();$("dev-msg").textContent="Патч сохранён и отправлен участникам."}catch(error){$("dev-msg").textContent=error.message}});
$("dev-backup-btn").addEventListener("click",()=>act(async()=>download("culture-quest-snapshot.json",JSON.stringify(await engine.getSnapshot(),null,2),"application/json")));
engine.onChange(state=>{
 const teacher=state?.viewer.role==='teacher'||state?.viewer.isCreator;$("teacher-login").style.display=teacher?"none":"flex";$("teacher-app").style.display=teacher?"flex":"none";$("teacher-login-btn").disabled=!engine.connected||loggingIn;$('logout-btn').textContent=state?.viewer.isCreator?'Вернуться к игре':'Выйти';
 $("teacher-login-connection").textContent=engine.connected?"Сервер подключён":engine.error||"Подключение к серверу... (пробуждение инстанса может занять до 30 сек)";
 if(!teacher){scene?.setVisible(false);$("dev-overlay").style.display="none";$("player-dialog").close();$("count-dialog").close();managerInitialized=false;playerEditId=null;controlKey="";return}
 $("conn-status").textContent=engine.connected?"● Сервер подключён":"● Переподключение…";$("phase-pill").textContent=state.round?state.round.resolved?"Итоги":state.round.paused?"Пауза":"Игра идёт":"Лобби";
 for(const id of ["export-btn","reset-btn","dev-open-btn","logout-btn","team-save","team-expand","capacity-apply","qb-add"])$(id).disabled=!engine.connected;
 renderManager(state);renderRoster(state);renderControls(state);renderAnswers(state);renderBank(state);
 renderSettings(state);
 if($('game-format').dataset.mode!==state.settings.mode){$('game-format').value=state.settings.mode||'team';$('game-format').dataset.mode=state.settings.mode}$('format-apply').disabled=!!state.round||!engine.connected;$('game-format').disabled=!!state.round;$('return-lobby').disabled=!state.round||!state.round.resolved||!engine.connected;
 $('format-status').textContent=state.settings.mode==='solo'?'Личный капитал: +25 × множитель серии; экономика не меняется.':`${state.regions.length} команд · ${totalCapacity(state.regions)} мест · +25 ресурса · экономика не ниже 15%.`;
 const rulesKey=JSON.stringify([state.settings.teamDecision,state.settings.tradeEnabled]);if($('rules-apply').dataset.key!==rulesKey){$('rules-apply').dataset.key=rulesKey;$('team-decision').value=state.settings.teamDecision||'consensus';$('trade-enabled').checked=!!state.settings.tradeEnabled}for(const id of ['rules-apply','team-decision','trade-enabled'])$(id).disabled=!engine.connected||!!state.round&&!state.round.resolved||state.settings.mode==='solo';
 $('solo-ranking').hidden=state.settings.mode!=='solo';if(state.settings.mode==='solo')html('solo-leaders',state.leaderboard.slice(0,10).map((m,i)=>`<article class="leader-card"><span>${i+1}</span><strong>${h(m.name)}</strong><b>${m.capital}</b><small>серия ${m.streak} · ×${m.multiplier}</small></article>`).join('')||'<p class="mut">Участники ещё не присоединились.</p>');
 $('team-ranking').hidden=state.settings.mode!=='team';if(state.settings.mode==='team')html('team-leaders',(state.teamLeaderboard||[]).map((t,i)=>`<article class="leader-card"><span>${i+1}</span><strong>${h(t.name)}</strong><b>${t.rating}</b><small>${t.points} ресурс · ${t.economy}% экономика · ${t.members}/${t.capacity||4}</small></article>`).join('')||'<p class="mut">Команды ещё не присоединились.</p>');
 html('log-list',state.log.map(l=>`<li>${new Date(l.t).toLocaleTimeString("ru-RU")} · ${h(l.msg)}</li>`).join("")||"<li>Пока пусто</li>");
 if(!scene&&!sceneFailed)requestAnimationFrame(()=>ensureScene());{
  const key=state.regions.map(t=>t.id+":"+t.name).join("|");
  if(mapKey!==key){const selected=$("map-team-select").value;$("map-team-select").innerHTML='<option value="">Среднее по регионам</option>'+state.regions.map(t=>`<option value="${t.id}" ${t.id===selected?"selected":""}>${h(t.name)}</option>`).join("");mapKey=key}
  if(scene){scene.setVisible(true);scene.update(state,$("map-team-select").value||null);}
 }
});
setInterval(()=>{if(!document.hidden)updateTimer()},250);

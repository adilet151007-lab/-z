import { GameEngine, REGIONS, capacityFor, totalCapacity, MAX_TEAMS, CRISIS_THRESHOLD, RESOURCE_CAP, developmentFor, metadataFor, escapeHTML as h } from "./shared-engine.js";
import { createScene } from "./scene3d.js";
import { setupSyllabus } from "./syllabus-ui.js";

const $ = id => document.getElementById(id), engine = new GameEngine("teacher");
let scene=null,sceneFailed=false,selectedQuestionId=null,duration=30,controlKey="",loggingIn=false;
let editId=null,editVersion=null,bankKey="",bankPage=0,teamEditId=null,projector=false,mapKey="",playerEditId=null,countPlan=null,managerInitialized=false,countDirty=false,capacityDirty=false,playerOptionsKey="",rosterKey="";
function message(text="",error=false){$("action-message").textContent=text;$("action-message").classList.toggle("red",error)}
async function act(fn,success=""){try{await fn();message(success)}catch(error){message(error.message,true)}}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
const alphabet=i=>String.fromCharCode(65+i);

$("teacher-login-form").addEventListener("submit",async e=>{
 e.preventDefault();if(loggingIn)return;loggingIn=true;$("teacher-login-btn").disabled=true;
 try{await engine.teacherLogin($("teacher-password").value);$("teacher-password").value="";$("teacher-login-error").textContent=""}
 catch(error){$("teacher-login-error").textContent=error.message}
 finally{loggingIn=false;$("teacher-login-btn").disabled=!engine.connected}
});
$("logout-btn").addEventListener("click",()=>act(()=>engine.teacherLogout()));
$("reset-btn").addEventListener("click",()=>{if(confirm("Сбросить очки, участников и раунд? Названия команд и банк вопросов сохранятся."))act(()=>engine.resetGame(),"Новая игра начата.")});
$("projector-btn").addEventListener("click",()=>{
 projector=!projector;document.body.classList.toggle("projector-mode",projector);
 $("projector-btn").textContent=projector?"Показать панель преподавателя":"Скрыть ответы для проектора";
 scene?.resize();
});
$("export-btn").addEventListener("click",()=>act(async()=>{
 const rows=await engine.exportSummary(),cell=value=>{const text=String(value),safe=/^[=+\-@\t\r]/.test(text)?"'"+text:text;return `"${safe.replace(/"/g,'""')}"`};
 const lines=[["Место","Команда","Участники","Ресурс","Экономика %","Развитие","Статус"],...rows.map((r,i)=>[i+1,r.region,r.members,r.points,r.economy,r.development,r.status])];
 download("vedomost.csv","\uFEFF"+lines.map(row=>row.map(cell).join(";")).join("\r\n"),"text/csv;charset=utf-8");
}));
function renderControls(state){
 const round=state.round,key=round?`${round.id}:${round.resolved}:${round.paused}:${engine.connected}`:`lobby:${state.questions.map(q=>q.id+":"+q.version).join("|")}:${engine.connected}`;
 if(controlKey===key){updateTimer();return}controlKey=key;
 const disabled=engine.connected?"":"disabled";
 if(!round){
  if(!state.questions.some(q=>q.id===selectedQuestionId))selectedQuestionId=state.questions[0]?.id;
  $("round-control").innerHTML=`<h2>Запуск раунда</h2><label for="q-select" class="field-label">Вопрос</label><select id="q-select" ${disabled}>${state.questions.map((q,i)=>`<option value="${q.id}" ${q.id===selectedQuestionId?"selected":""}>${i+1}. ${h(q.text)}</option>`).join("")}</select><div class="row" style="margin-top:12px"><label for="duration-select" class="mut">Время</label><select id="duration-select" style="width:95px" ${disabled}>${[20,30,45,60,90,120].map(n=>`<option value="${n}" ${n===duration?"selected":""}>${n} с</option>`).join("")}</select><button class="pri" data-control="start" ${disabled}>Запустить</button></div>`;
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
function updateTimer(){const r=engine.state?.round;if(!r||!$("teacher-timer"))return;$("teacher-timer").textContent=r.resolved?"Итоги подведены":`${r.paused?"Пауза":"Осталось"}: ${engine.remainingSeconds()} с`;$("submitted-count").textContent=`${Object.keys(r.submitted).length}/${engine.state.regions.filter(t=>t.members.length).length}`}
function renderAnswers(state){
 const round=state.round,q=round?.question||state.questions.find(q=>q.id===selectedQuestionId);
 $("answer-key").innerHTML=q?`<div class="teacher-answer-label">Правильный ответ · только преподавателю</div><strong class="cyan">${alphabet(q.correct)}. ${h(q.options[q.correct])}</strong>${q.explanation?`<p class="small-note mut">${h(q.explanation)}</p>`:""}${q.source?`<p class="small-note mut">Источник: ${h(q.source)}</p>`:""}`:'<p class="mut">Выберите вопрос.</p>';
 const preview=round?.preview||[];
 $("answer-preview").innerHTML=!round?'<p class="mut small-note">После запуска здесь появятся ответы команд.</p>':`<p class="small-note mut">${round.resolved?"Итоги завершённого раунда.":"Предварительно: голосование может измениться. Баллы начисляются при подведении итогов."}</p><div class="answer-counts"><span class="cyan">Верно: ${preview.filter(p=>p.correct===true&&!p.empty).length}</span><span class="red">Неверно: ${preview.filter(p=>p.correct===false&&!p.empty).length}</span><span class="mut">Нет решения: ${preview.filter(p=>p.correct===null&&!p.empty).length}</span></div><div class="answer-preview-list">${preview.map(p=>{
  const team=state.regions.find(t=>t.id===p.teamId);if(!team)return "";
  const status=p.empty?"Нет участников":p.reason==="tie"?"Голоса поровну":p.chosen===null?"Нет голосов":p.correct?"Верно":"Неверно";
  return `<div class="answer-preview-row"><span>${h(team.name)}</span><span class="${p.correct===null||p.empty?"mut":p.correct?"cyan":"red"}">${status}${p.chosen!==null?` · ${alphabet(p.chosen)}`:""}</span><small class="mut">${p.empty?"":p.submitted?"Ответ отправлен":`${p.voters} гол. · ещё выбирают`}</small></div>`;
 }).join("")}</div>`;
}
function renderRoster(state){
 const rosterState=JSON.stringify([engine.connected,$("roster-search").value,state.regions]);if(rosterKey===rosterState)return;rosterKey=rosterState;
 const query=$("roster-search").value.trim().toLocaleLowerCase(),teams=state.regions.filter(t=>!query||`${t.name} ${t.members.map(m=>m.name).join(" ")}`.toLocaleLowerCase().includes(query));
 $("team-stats").textContent=`${state.regions.length} / ${MAX_TEAMS} команд · ${state.regions.reduce((s,t)=>s+t.members.length,0)} / ${totalCapacity(state.regions)} участников`;
 $("roster-table").innerHTML=`<thead><tr><th>Команда</th><th>Участники</th><th>Ресурс</th><th>Экономика</th><th>Управление</th></tr></thead><tbody>${teams.map(t=>{
  const meta=metadataFor(t),disabled=engine.connected?"":"disabled",base=REGIONS.find(r=>r.id===meta.baseRegionId);
  return `<tr><td><b style="color:${meta.color}">${h(meta.name)}</b><div class="development-mini">${h(base.name)}</div><button class="ghost compact teacher-private" data-region="${t.id}" data-team-edit ${disabled}>Изменить</button></td><td>${t.members.length}/${capacityFor(t)}${t.members.map(m=>`<div class="roster-member"><span class="presence ${m.online?"online":""}"></span><button class="member-name" data-region="${t.id}" data-player-edit="${m.pid}" ${disabled}>${h(m.name)}</button><span>${!m.online?' <small class="mut">· вне сети</small>':""}</span><button class="ghost remove-player teacher-private" data-region="${t.id}" data-remove="${m.pid}" aria-label="Исключить ${h(m.name)}" ${disabled}>×</button></div>`).join("")||'<p class="mut">Пока никого</p>'}</td><td><b class="gold">${t.points} / ${RESOURCE_CAP}</b><div class="development-mini ${t.points===RESOURCE_CAP?"complete":""}">${developmentFor(t.points).name}</div><div class="bar resource-mini"><i style="width:${t.points/10}%"></i></div></td><td class="${t.economy<CRISIS_THRESHOLD?"crisis":""}">${t.economy}%</td><td><div class="row teacher-private"><button data-region="${t.id}" data-points="25" ${t.points>=RESOURCE_CAP?"disabled":disabled}>+25</button><button data-region="${t.id}" data-points="-25" ${disabled}>−25</button><button data-region="${t.id}" data-economy="10" ${disabled}>+10%</button><button data-region="${t.id}" data-economy="-10" ${disabled}>−10%</button><button class="danger compact" data-region="${t.id}" data-team-remove ${state.regions.length===1?"disabled":disabled}>Удалить команду</button></div></td></tr>`;
 }).join("")}</tbody>`;
}
$("roster-search").addEventListener("input",()=>{if(engine.state)renderRoster(engine.state)});
function openTeamEditor(id){
 const t=engine.state.regions.find(t=>t.id===id);if(!t)return;
 teamEditId=id;$("team-form").closest("details").open=true;$("team-name").value=t.name;$("team-base").value=t.baseRegionId;$("team-capacity").value=capacityFor(t);$("team-points").value=t.points;$("team-economy").value=t.economy;$("team-save").textContent="Сохранить команду";$("team-cancel").hidden=false;$("team-manager").scrollIntoView({behavior:"smooth",block:"center"});
}
function openPlayerEditor(pid){
 const t=engine.state.regions.find(t=>t.members.some(m=>m.pid===pid)),m=t?.members.find(m=>m.pid===pid);if(!m)return;
 playerEditId=pid;playerOptionsKey="";$("player-name").value=m.name;$("player-error").textContent="";renderPlayerEditor(engine.state,t.id);$("player-dialog").showModal();
}
function renderPlayerEditor(state,selected){
 if(!playerEditId)return;
 const source=state.regions.find(t=>t.members.some(m=>m.pid===playerEditId)),member=source?.members.find(m=>m.pid===playerEditId);
 if(!member){$("player-dialog").close();playerEditId=null;return}
 const current=selected||$("player-team").value||source.id;
 $("player-status").textContent=`${source.name} · ${member.online?"в сети":"вне сети"}`;
 const key=JSON.stringify([source.id,state.regions.map(t=>[t.id,t.name,t.capacity,t.members.length])]);
 if(playerOptionsKey!==key){playerOptionsKey=key;$("player-team").innerHTML=state.regions.map(t=>`<option value="${t.id}" ${t.id===current?"selected":""} ${t.id!==source.id&&t.members.length>=capacityFor(t)?"disabled":""}>${h(t.name)} · ${t.members.length}/${capacityFor(t)}${t.id===source.id?" · сейчас здесь":""}</option>`).join("");}
 $("player-save").disabled=!engine.connected;$("player-remove").disabled=!engine.connected;
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
 try{await engine.freeSlot(source.id,playerEditId);$("player-dialog").close();playerEditId=null;message("Участник исключён.")}catch(error){$("player-error").textContent=error.message}
});
$("roster-table").addEventListener("click",e=>{
 const b=e.target.closest("button[data-region]");if(!b||b.disabled)return;const id=b.dataset.region,t=engine.state.regions.find(t=>t.id===id);
 if(b.dataset.points!==undefined)act(()=>engine.adjustPoints(id,Number(b.dataset.points)));
 if(b.dataset.economy!==undefined)act(()=>engine.adjustEconomy(id,Number(b.dataset.economy)));
 if(b.hasAttribute("data-remove")&&confirm(`Исключить ${t.members.find(m=>m.pid===b.dataset.remove)?.name||"участника"} из команды?`))act(()=>engine.freeSlot(id,b.dataset.remove),"Участник исключён, место освобождено.");
 if(b.hasAttribute("data-team-remove")&&confirm(`Удалить команду «${t.name}»? ${t.members.length} участников вернутся к регистрации, очки команды будут удалены.`))act(()=>engine.removeTeam(id),"Команда удалена.");
 if(b.hasAttribute("data-team-edit"))openTeamEditor(id);
 if(b.hasAttribute("data-player-edit"))openPlayerEditor(b.dataset.playerEdit);
});
$("team-base").innerHTML=REGIONS.map(r=>`<option value="${r.id}">${r.name}</option>`).join("");
function clearTeamForm(){teamEditId=null;$("team-form").reset();$("team-capacity").value=engine.state?.settings.teamCapacity||4;$("team-save").textContent="Создать команду";$("team-cancel").hidden=true}
$("team-cancel").addEventListener("click",clearTeamForm);
$("team-form").addEventListener("submit",e=>{e.preventDefault();act(async()=>{
 const changes={name:$("team-name").value,baseRegionId:$("team-base").value,capacity:Number($("team-capacity").value),points:Number($("team-points").value),economy:Number($("team-economy").value)};
 if(teamEditId)await engine.updateTeam(teamEditId,changes);else await engine.createTeam(changes.name,changes.baseRegionId,changes.capacity,changes.points,changes.economy);clearTeamForm();
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
 if(!managerInitialized){$("team-count").value=state.regions.length;$("capacity-all").value=state.settings.teamCapacity;$("team-capacity").value=state.settings.teamCapacity;managerInitialized=true}
 if(!countDirty)$("team-count").value=state.regions.length;
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
 $("question-builder").scrollIntoView({behavior:"smooth",block:"start"});
}
$("question-form").addEventListener("submit",async e=>{
 e.preventDefault();$("qb-add").disabled=true;
 const current=engine.state.questions.find(q=>q.id===editId),q={text:$("qb-text").value.trim(),options:[0,1,2,3].map(i=>$("qb-o"+i).value.trim()),correct:Number($("qb-correct").value),points:Number($("qb-pts").value),topic:$("qb-topic").value.trim(),explanation:$("qb-explanation").value.trim(),...(current?.source?{source:current.source}:{}),...(current?.sourceExcerpt?{sourceExcerpt:current.sourceExcerpt}:{})};
 try{if(editId)await engine.editQuestion(editId,q,editVersion);else {const result=await engine.importQuestions([q]);if(!result.added)throw new Error("Такой вопрос уже есть в банке.")}clearQuestionForm();$("qb-msg").textContent="Вопрос сохранён.";$("qb-msg").className="cyan"}
 catch(error){$("qb-msg").textContent=error.message;$("qb-msg").className="red"}
 finally{$("qb-add").disabled=!engine.connected}
});
function renderBank(state,force=false){
 const query=$("bank-search").value.trim().toLocaleLowerCase(),key=state.questions.map(q=>q.id+":"+q.version).join("|")+query+bankPage;
 if(!force&&key===bankKey)return;bankKey=key;
 const questions=state.questions.filter(q=>!query||`${q.text} ${q.topic||""}`.toLocaleLowerCase().includes(query)),pages=Math.max(1,Math.ceil(questions.length/15));bankPage=Math.min(bankPage,pages-1);
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

async function refreshEditor(){$("dev-json").value=JSON.stringify(await engine.getSnapshot(),null,2)}
$("dev-open-btn").addEventListener("click",()=>act(async()=>{await refreshEditor();$("dev-overlay").style.display="flex"}));
$("dev-close-btn").addEventListener("click",()=>{$("dev-overlay").style.display="none"});document.addEventListener("keydown",e=>{if(e.key==="Escape")$("dev-overlay").style.display="none"});
$("dev-refresh-btn").addEventListener("click",()=>act(refreshEditor));
$("dev-free-all-btn").addEventListener("click",()=>{try{const snapshot=JSON.parse($("dev-json").value);snapshot.regions.forEach(r=>r.members=[]);$("dev-json").value=JSON.stringify(snapshot,null,2);$("dev-msg").textContent="Места очищены в редакторе. Примените патч для сохранения."}catch{$("dev-msg").textContent="Некорректный JSON."}});
$("dev-force-resolve-btn").addEventListener("click",()=>act(async()=>{await engine.resolveRound();await refreshEditor()},"Раунд завершён."));
$("dev-apply-btn").addEventListener("click",async()=>{try{await engine.applyRawState(JSON.parse($("dev-json").value));await refreshEditor();$("dev-msg").textContent="Патч сохранён и отправлен участникам."}catch(error){$("dev-msg").textContent=error.message}});
$("dev-backup-btn").addEventListener("click",()=>act(async()=>download("culture-quest-snapshot.json",JSON.stringify(await engine.getSnapshot(),null,2),"application/json")));
engine.onChange(state=>{
 const teacher=state?.viewer.role==="teacher";$("teacher-login").style.display=teacher?"none":"flex";$("teacher-app").style.display=teacher?"flex":"none";$("teacher-login-btn").disabled=!engine.connected||loggingIn;
 $("teacher-login-connection").textContent=engine.connected?"Сервер подключён":engine.error||"Соединение с сервером…";
 if(!teacher){$("dev-overlay").style.display="none";$("player-dialog").close();$("count-dialog").close();managerInitialized=false;playerEditId=null;controlKey="";return}
 $("conn-status").textContent=engine.connected?"● Сервер подключён":"● Переподключение…";$("phase-pill").textContent=state.round?state.round.resolved?"Итоги":state.round.paused?"Пауза":"Игра идёт":"Лобби";
 for(const id of ["export-btn","reset-btn","dev-open-btn","logout-btn","team-save","team-expand","capacity-apply","qb-add"])$(id).disabled=!engine.connected;
 renderManager(state);renderRoster(state);renderControls(state);renderAnswers(state);renderBank(state);
 $("log-list").innerHTML=state.log.map(l=>`<li>${new Date(l.t).toLocaleTimeString("ru-RU")} · ${h(l.msg)}</li>`).join("")||"<li>Пока пусто</li>";
 if(!scene&&!sceneFailed){try{scene=createScene($("scene-canvas"))}catch{sceneFailed=true;message("WebGL недоступен. Управление игрой продолжает работать.",true)}}{
  const key=state.regions.map(t=>t.id+":"+t.name).join("|");
  if(mapKey!==key){const selected=$("map-team-select").value;$("map-team-select").innerHTML='<option value="">Среднее по регионам</option>'+state.regions.map(t=>`<option value="${t.id}" ${t.id===selected?"selected":""}>${h(t.name)}</option>`).join("");mapKey=key}
  if(scene)scene.update(state,$("map-team-select").value||null);
 }
});
setInterval(updateTimer,200);

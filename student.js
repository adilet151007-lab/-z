import {t as uiText,tx as uiTpl,setupUIPreferences} from './ui-preferences.js';
import { GameEngine, REGIONS, capacityFor,totalCapacity, CRISIS_THRESHOLD, RESOURCE_CAP, DEVELOPMENT_STAGES, developmentFor, metadataFor, setupPresentationEffects, setupBranding,setupAchievements, escapeHTML as h } from "./shared-engine.js";
import { setupTelemetry } from "./creator-overlay.js";
import { setupCommunication } from "./chat-ui.js";

setupUIPreferences();
try{const fragment=new URLSearchParams(location.hash.slice(1)),token=fragment.get('join');if(token&&token.length<=2000&&/^[A-Za-z0-9_.-]+$/.test(token)){sessionStorage.setItem('cq_lesson_access_v1',token);history.replaceState(null,'',location.pathname+location.search)}}catch{}
const engine = new GameEngine("student");
setupTelemetry(engine);
setupCommunication(engine);
setupPresentationEffects(engine);
setupBranding(engine);
setupAchievements(engine);
const $ = id => document.getElementById(id);
let scene = null, joining = false, actionPending = false, previousRound = null, focusedRegion = null, sceneLoading=false, mapCollapsed=false, teamKey='', questionKey='', registrationKey='';
let sceneError = "";
let selectedArea=null,pendingInvite='',marketKey='';
window.addEventListener('cq:map-review-change',()=>{if(mapCollapsed){mapCollapsed=false;document.querySelector('.stage-wrap').hidden=false;$('map-visibility').textContent= uiText('Свернуть карту');$('map-visibility').setAttribute('aria-expanded','true')}if(scene){scene.setVisible(true);scene.resize()}else ensureScene()});
window.addEventListener('cq:world-achievement',()=>{if(!engine.state?.viewer.player||document.hidden)return;window.dispatchEvent(new Event('cq:map-review-change'));if(!/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName))document.querySelector('.stage-wrap').scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})});
async function ensureScene(){
  if(scene||sceneLoading||sceneError||mapCollapsed)return;
  sceneLoading=true;$('map-status').textContent= uiText('Загружаем 3D-карту…');
  try{
    const {createScene}=await import('./scene3d.js');
    if(!engine.state?.viewer.player)return;
    scene=createScene($('scene-canvas'));$('map-status').textContent='';
    const state=engine.state,team=state.regions.find(t=>t.id===state.viewer.player.regionId);
    scene.update(state,state.viewer.player.regionId);focusedRegion=metadataFor(team).baseRegionId;if(!state.worldAchievements?.length)scene.focusRegion(state.viewer.player.regionId);scene.setVisible(!mapCollapsed);
  }catch{sceneError= uiText('3D недоступно. Вопросы и ответы продолжают работать.');$('map-status').textContent=sceneError;}
  finally{sceneLoading=false}
}
function message(text = "", isError = false) {
  $("action-message").textContent = uiText(text);
  $("action-message").classList.toggle("red", isError);
}
async function act(fn) {
  if (actionPending) return;
  actionPending = true;message( uiText("Отправляем ответ…"));
  if(engine.state?.viewer.player)renderQuestion(engine.state);
  try { await fn(); message(); }
  catch (error) { message(error.message, true); }
  finally { actionPending = false; if (engine.state?.viewer.player) renderQuestion(engine.state); }
}
function renderRegistration(state) {
  if(selectedArea&&!state.regions.some(t=>metadataFor(t).baseRegionId===selectedArea))selectedArea=null;
  const key=JSON.stringify([state.settings.mode,state.regions,state.admission,engine.connected,joining,selectedArea,$('name-input').value,$('team-search').value]);
  if(key===registrationKey)return;registrationKey=key;
  const solo=state.settings.mode==='solo';
  const code=$('name-input').value.trim().split(/\s/,1)[0],tokenCandidate=code.length===26||code.startsWith('CQO-'),invite=/^(CQI|CQL)-/.test(code);
  $('join-session').hidden=!solo&&!invite;$('join-session').textContent=invite? uiText('Продолжить вход по приглашению'): uiText('Присоединиться');$('join-session').disabled=!engine.connected||joining;$('region-grid').hidden=solo;$('area-back').hidden=solo||!selectedArea;
  $('registration-instruction').textContent=state.admission?.required&&!state.admission.open?uiText('Регистрация закрыта. Обратитесь к преподавателю.'):solo? uiText('Жеке сайыс · введите имя и присоединитесь.'):selectedArea? uiText('Выберите команду области или её города.'): uiText('Шаг 1 · выберите область. Города находятся внутри неё.');
  if(solo){$('team-search').hidden=true;$('registration-capacity').textContent= uiTpl`${state.regions.reduce((n,t)=>n+(t.occupied??t.members.length),0)} участников · личный рейтинг`;$('join-session').disabled=!engine.connected||joining;return}
  $("team-search").hidden = state.regions.length <= 8;
  const query = $("team-search").hidden ? "" : $("team-search").value.trim().toLocaleLowerCase();
  $("registration-capacity").textContent =  uiTpl`${state.regions.length} команд · ${state.regions.reduce((sum,t)=>sum+(t.occupied??t.members.length),0)} / ${totalCapacity(state.regions)} участников`;
  const matches=t=>!query||`${t.name} ${REGIONS.find(r=>r.id===metadataFor(t).baseRegionId).name}`.toLocaleLowerCase().includes(query);
  if(!selectedArea){$('region-grid').innerHTML=REGIONS.flatMap(base=>{const teams=state.regions.filter(t=>metadataFor(t).baseRegionId===base.id);if(!teams.length||!teams.some(matches))return [];const occupied=teams.reduce((n,t)=>n+(t.occupied??t.members.length),0),capacity=totalCapacity(teams);return [ uiTpl`<button class="region-card" data-area="${base.id}" ${!engine.connected||joining?'disabled':''} style="border-color:${base.color}66"><span class="rname" style="color:${base.color}">${h(base.name)}</span><span class="seats">${occupied} / ${capacity} мест</span><span class="members">${teams.length} команд · ${teams.filter(t=>t.cityId).length} городов</span><span class="region-open">Выбрать →</span></button>`]}).join('')|| uiText('<p class="mut">Области не найдены</p>');return}
  const teams=state.regions.filter(t=>metadataFor(t).baseRegionId===selectedArea&&matches(t));
  $("region-grid").innerHTML = teams.map(region => {
    const meta = metadataFor(region), capacity = capacityFor(region),count=region.occupied??region.members.length, full = count>=capacity;
    return `<button class="region-card" data-region="${meta.id}" ${full&&!tokenCandidate||!engine.connected || joining ? "disabled" : ""} style="border-color:${meta.color}55"><span class="rname" style="color:${meta.color}">${h(meta.name)}</span><span class="seats">${count}/${capacity} ${full ?  uiText("— команда заполнена") :  uiText("— свободно")}</span><span class="members">${region.members.map(m => h(m.name)).join(", ") ||  uiText("Пока никого")}</span></button>`;
  }).join("") ||  uiText('<p class="mut">Команды не найдены</p>');
}
$("team-search").addEventListener("input",()=>{if(engine.state)renderRegistration(engine.state)});
$('area-back').addEventListener('click',()=>{selectedArea=null;renderRegistration(engine.state)});
function openAccessDetails(regionId){pendingInvite=$('name-input').value.trim().split(/\s/,1)[0];$('access-name').value=$('name-input').value.trim().slice(pendingInvite.length).trim();$('access-team').innerHTML=engine.state.regions.map(t=>`<option value="${t.id}" ${(t.occupied??t.members.length)>=capacityFor(t)?'disabled':''}>${h(metadataFor(t).name)} · ${t.occupied??t.members.length}/${capacityFor(t)}</option>`).join('');if(regionId)$('access-team').value=regionId;const solo=engine.state.settings.mode==='solo';$('access-team').disabled=solo;$('access-team').required=!solo;$('access-error').textContent='';$('access-details').showModal();$('access-name').focus()}
$('access-cancel').addEventListener('click',()=>{$('access-details').close();pendingInvite=''});
$('access-details-form').addEventListener('submit',async e=>{e.preventDefault();$('name-input').value=pendingInvite+' '+$('access-name').value.trim();await join($('access-team').value,true)});
async function join(regionId,detailsConfirmed=false) {
  if(joining||!engine.connected)return;
  if(!$('privacy-consent').checked){$('reg-error').textContent= uiText('Подтвердите согласие на обработку данных перед входом.');$('privacy-consent').focus();return;}
  const value=$('name-input').value.trim(),code=value.split(/\s/,1)[0];if(/^(CQI|CQL)-/.test(code)&&!detailsConfirmed&&(!value.slice(code.length).trim()||engine.state.settings.mode!=='solo'&&!regionId)){openAccessDetails(regionId);return}
  joining=true;$("reg-error").textContent= uiText("Подключение…");renderRegistration(engine.state);
  try{await engine.joinTeam(regionId,$("name-input").value.trim(),true);$("name-input").value="";$("reg-error").textContent="";$('access-details').close();pendingInvite=''}
  catch(error){$("reg-error").textContent=error.message;if($('access-details').open)$('access-error').textContent=error.message}
  finally{joining=false;if(engine.state&&!engine.state.viewer.player)renderRegistration(engine.state)}
}
$('name-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&engine.state?.settings.mode==='solo'){e.preventDefault();join(null)}});
$('name-input').addEventListener('input',()=>{if(engine.state&&!engine.state.viewer.player)renderRegistration(engine.state)});
$('join-session').addEventListener('click',()=>join(null));
$("region-grid").addEventListener("click", event => {
  const area=event.target.closest('[data-area]');if(area&&!joining&&engine.connected){selectedArea=area.dataset.area;renderRegistration(engine.state);return}
  const card = event.target.closest("[data-region]");
  if (!card || joining || !engine.connected) return;
  join(card.dataset.region);
});
$("leave-btn").addEventListener("click", () => {
  if (confirm( uiText("Выйти из команды и освободить своё место?"))) act(() => engine.leaveTeam());
});

function renderTeam(state) {
  const player = state.viewer.player;
  const region = state.regions.find(r => r.id === player.regionId);if(!region)return;
  const key=JSON.stringify([state.settings.mode,player,region,state.teamLeaderboard,state.leaderboard]);if(teamKey===key)return;teamKey=key;
  const meta = metadataFor(region);
  const crisis = region.economy < CRISIS_THRESHOLD, development = developmentFor(region.points), teamRank = (state.teamLeaderboard||[]).find(t=>t.teamId===region.id)?.rank||0, topTeams = (state.teamLeaderboard||[]).filter(t=>t.rank).slice(0,5);
  $("my-name").textContent = player.name;
  if(state.settings.mode==='solo'){
    const rank=player.rank??state.leaderboard.findIndex(m=>m.pid===player.pid)+1,me=state.leaderboard.find(m=>m.pid===player.pid),total=player.rankingTotal??state.leaderboard.length;
    $('my-region-tag').textContent= uiText('Жеке сайыс');$('team-panel').innerHTML= uiTpl`<h2>${h(player.name)}</h2><div class="stat-row"><div class="stat"><span>Культурный капитал</span><b class="gold">${me?.capital||0}<small> / ${player.scoreLimit===null?'∞':RESOURCE_CAP}</small></b></div><div class="stat"><span>Серия / множитель</span><b class="cyan">${me?.streak||0} · ×${me?.multiplier||1}</b></div></div><p class="small-note">Место: ${rank} из ${total}. Ошибки обнуляют серию и не влияют на экономику.</p><ol class="solo-mini">${state.leaderboard.slice(0,5).map(m=>`<li>${h(m.name)} <b>${m.capital}</b></li>`).join('')}</ol>`;return;
  }
  $("my-region-tag").textContent = meta.name;
  $("my-region-tag").style.color = meta.color;
  $("team-panel").innerHTML =  uiTpl`<h2 style="color:${meta.color}">${h(meta.name)}</h2><div class="stat-row"><div class="stat"><span class="mut">Культурный ресурс</span><b class="gold">${region.points}<small> / ${region.scoreLimit===null?'∞':RESOURCE_CAP}</small></b></div><div class="stat"><span class="mut">Экономика</span><b class="${crisis ? "red" : "cyan"}">${region.economy}%</b></div></div><div class="bar"><i style="width:${region.economy}%;background:var(--${crisis ? "red" : "cyan"})"></i></div><p class="small-note">Рейтинг команды: <b class="gold">${teamRank>0? uiTpl`№${teamRank} из ${state.teamLeaderboard.length}`:'—'}</b> · ${region.points+region.economy*5} очков рейтинга</p>${region.economy<100? uiTpl`<p class="recovery-note">Каждый верный ответ восстанавливает до 25 процентных пунктов экономики. При достижении 100% ресурсы начнут начисляться со следующего верного ответа.</p>`:""}<section class="development ${development.complete ? 'complete' : ''}" aria-label="Развитие региона"><div class="development-heading"><span>${development.complete ? '✦' : '⌂'} ${uiText(development.name)}</span><span>${Math.round(development.progress * 100)}%</span></div><div class="development-track" role="progressbar" aria-valuenow="${Math.min(region.points,RESOURCE_CAP)}" aria-valuemin="0" aria-valuemax="${RESOURCE_CAP}" aria-label="Строительство города"><i style="width:${development.progress * 100}%"></i>${DEVELOPMENT_STAGES.slice(1).map(step => `<span class="milestone ${region.points >= step.at ? 'reached' : ''}" style="left:${step.at / RESOURCE_CAP * 100}%" title="${uiText(step.name)}: ${step.at}"></span>`).join('')}</div><p class="development-note">${development.complete ? (region.scoreLimit===null? uiText('Город построен. Перчатка активна — ресурс продолжает расти.'): uiText('Город построен. Предел ресурса — 1000. Вы можете продолжать отвечать вместе с группой.')) :  uiTpl`${uiText(development.description)}. Далее: ${uiText(development.next.name)} · ${development.next.at} ресурсов.`}</p></section><h3 style="margin-top:16px">Рейтинг областей</h3><ol class="solo-mini">${topTeams.map(t=>`<li>${h(t.name)} <b>${t.rating}</b></li>`).join('')|| uiText('<li class="mut">Команды ещё не присоединились.</li>')}</ol><h3 style="margin-top:16px">Команда (${region.members.length}/${capacityFor(region)})</h3><ul class="team-roster">${region.members.map(m => `<li><span class="presence ${m.online ? "online" : ""}"></span>${h(m.name)}${m.pid === player.pid ?  uiText(' <span class="mut">(вы)</span>') : ""}${!m.online ?  uiText(' <span class="mut">· вне сети</span>') : ""}</li>`).join("")}</ul>`;
}

function renderQuestion(state) {
  const panel = $("question-panel"), round = state.round;
  if (!round) { if(questionKey!=='lobby'){panel.innerHTML =  uiText('<h2>Ожидайте раунд</h2><p class="mut" style="margin-top:8px">Преподаватель запустит следующий вопрос.</p>');questionKey='lobby'}return; }
  const player = state.viewer.player;
  if (!player) return;
  const solo=state.settings.mode==='solo',regionId = solo?player.pid:player.regionId, question = round.question;
  const instantMode=!solo&&state.settings.teamDecision==='instant';
  const leaderMode=!solo&&state.settings.teamDecision==='leader',team=state.regions.find(t=>t.id===player.regionId),isLeader=team?.leaderPid===player.pid,decision=round.leaderDecision;
  const tally = round.votes[regionId] || {}, submitted = round.submitted[regionId];
  const totalVotes = solo?Number(round.myVote!==null):Object.values(tally).reduce((sum, n) => sum + n, 0);
  const locked = round.resolved || round.paused || submitted !== undefined || !engine.connected || engine.remainingSeconds() <= 0 || actionPending;
  const input=engine.inputStatus?.roundId===round.id?engine.inputStatus:null;
  const pendingOption=input&&input.status!=='error'?input.optionIdx:undefined;
  const result = round.results[regionId];
  const key=JSON.stringify([round.id,question,round.paused,round.resolved,round.myVote,round.deadline,round.duration,tally,submitted,result,round.proposals,locked,state.viewer.isDevTelemetry,engine.connected,leaderMode,isLeader,decision,input]);
  if(questionKey===key){updateTimer();return}questionKey=key;
  let feedback = "";
  if (round.resolved && result) {
    const text = solo?(result.correct? uiTpl`Верно! +${result.awarded} капитала · ×${result.multiplier}`: uiText('Ответ не засчитан. Серия начнётся заново.')):result.skipped ?  uiText("Команда пропустила раунд.") : result.correct ? result.recovering? uiTpl`Верно! Экономика +${result.economyRecovered} п. п. → ${result.economyAfter}%. Ответ пошёл на восстановление.`: uiTpl`Верно! +${result.awarded ?? question.points} культурного ресурса.${result.atCap ?  uiText(" Город построен — достигнут предел 1000!") : ""}` :  uiText("Ответ не засчитан. −20% экономики, минимум 15%.");
    feedback = `<p class="${result.correct ? "cyan" : "red"}" style="margin-top:12px">${text}</p>`;
  }
  const receipt=!round.resolved&&input?`<p class="small-note ${input.status==='error'?'red':'cyan'}" role="status">${{sending: uiText('Отправляем ответ…'),received: uiText('Ответ дошёл до сервера. Сохраняем…'),saved: uiText('Действие сохранено сервером.'),error: uiText('Действие не подтверждено. Проверьте ответ и повторите.')}[input.status]}</p>`:'';
  panel.innerHTML = `${receipt}<div class="timer-row"><span id="round-timer"></span><div class="timer-bar"><i id="round-timer-bar"></i></div></div><div class="qtext">${h(question.text)}</div><div class="opts">${question.options.map((option, i) => {
    let cls = "opt";
    if (round.resolved && i === question.correct) cls += " correct";
    else if (round.resolved && i === submitted) cls += " wrong";
    else if (!round.resolved && (i === round.myVote || i === submitted || i === pendingOption)) cls += " chosen";
    if(!round.resolved&&state.viewer.isDevTelemetry&&i===question.correct)cls+=' telemetry-correct';
    return `<button class="${cls}" data-option="${i}" ${locked ? "disabled" : ""} aria-pressed="${i === round.myVote}"><span>${h(option)}</span><span class="votecount">${tally[i] ?  uiTpl`${tally[i]} гол.` : ""}${i === round.myVote && !round.resolved ?  uiText(" · ваш") : ""}</span></button>`;
  }).join("")}</div>${!round.resolved && submitted === undefined ? `<div class="row" style="margin-top:12px"><button class="pri" data-submit ${locked || !totalVotes ? "disabled" : ""}>${solo? uiText('Подтвердить мой ответ'): uiTpl`Отправить ответ команды (${totalVotes} гол.)`}</button></div><p class="mut small-note">${solo? uiText('Каждый отвечает самостоятельно. Серия верных ответов увеличивает множитель.'):state.settings.teamDecision==='instant'? uiText('Ваш голос учитывается сразу. До конца таймера можно изменить выбор; итог команды определяется большинством.'): uiText('Новый выбор принимается через 7 секунд: его можно отменить или подтвердить сразу. При равенстве голосов ответ не засчитывается.')}</p>` : !round.resolved ?  uiText('<p class="cyan small-note">Ответ принят. Ожидайте результатов.</p>') : ""}${!solo&&!round.resolved?(round.proposals||[]).map(p=> uiTpl`<div class="vote-proposal"><p>${h(p.name)} выбрал: «${h(question.options[p.option])}». <span data-proposal-ms="${p.remainingMs}" data-proposal-at="${Date.now()}"></span></p><div class="row"><button data-confirm-vote="${p.pid}" ${locked?'disabled':''}>Подтвердить</button>${p.pid===player.pid? uiTpl`<button data-cancel-vote ${locked?'disabled':''}>Отменить</button>`:''}</div></div>`).join(''):''}${feedback}`;
  if(instantMode){const submit=panel.querySelector('[data-submit]');if(submit)submit.parentElement.hidden=true;}
  if(leaderMode&&!round.resolved){for(const button of panel.querySelectorAll('[data-option]')){button.disabled=locked||!isLeader;button.classList.toggle('chosen',Number(button.dataset.option)===(pendingOption??decision?.option))}const submit=panel.querySelector('[data-submit]');if(submit){submit.parentElement.hidden=!isLeader;submit.disabled=locked||!decision||decision.yes<decision.required;submit.textContent= uiText('Отправить согласованный ответ');const note=submit.parentElement.nextElementSibling;if(note)note.textContent=isLeader? uiText('Выберите вариант. После согласия большинства отправьте ответ команды.'): uiText('Лидер выбирает вариант; участники голосуют за согласие или отказ.')}if(submitted===undefined)panel.insertAdjacentHTML('beforeend',`<section class="leader-ballot"><span class="eyebrow">${isLeader? uiText('ВЫ — ЛИДЕР'): uiText('ГОЛОС КОМАНДЫ')}</span><h3>${decision? uiText('Предложение: ')+h(question.options[decision.option]): uiText('Лидер ещё выбирает вариант')}</h3>${decision? uiTpl`<p>Согласны: ${decision.yes} · против: ${decision.no} · нужно согласий: ${decision.required}</p>${!isLeader? uiTpl`<div class="row"><button class="${decision.myApproval===true?'pri':''}" data-leader-agree="true" ${locked?'disabled':''}>✓ Согласен</button><button class="${decision.myApproval===false?'danger':''}" data-leader-agree="false" ${locked?'disabled':''}>✕ Не согласен</button></div>`:''}`:''}</section>`)}
  updateTimer();
}
$("question-panel").addEventListener("click", event => {
  const option = event.target.closest("[data-option]"), submit = event.target.closest("[data-submit]");
  if (option && !option.disabled) {option.classList.add("chosen");navigator.vibrate?.(15);act(() => engine.castVote(Number(option.dataset.option)));}
  if (submit && !submit.disabled) act(() => engine.teamSubmit());
  const approval=event.target.closest('[data-leader-agree]');if(approval&&!approval.disabled)act(()=>engine.voteLeader(approval.dataset.leaderAgree==='true'));
  const confirm=event.target.closest('[data-confirm-vote]'),cancel=event.target.closest('[data-cancel-vote]');
  if(confirm&&!confirm.disabled)act(()=>engine.confirmVote(confirm.dataset.confirmVote));if(cancel&&!cancel.disabled)act(()=>engine.cancelVote());
});
function updateTimer() {
  const round = engine.state?.round;
  if (!round || !$("round-timer")) return;
  document.querySelectorAll('[data-proposal-ms]').forEach(el=>{const left=Math.max(0,Number(el.dataset.proposalMs)-(round.paused?0:Date.now()-Number(el.dataset.proposalAt)));el.textContent= uiTpl`Автопринятие: ${Math.ceil(left/1000)} с`});
  const left = engine.remainingSeconds();
  $("round-timer").textContent = round.resolved ?  uiText("Раунд завершён") : round.paused ?  uiTpl`Пауза · ${left} с` :  uiTpl`${left} с`;
  $("round-timer-bar").style.width = `${Math.max(0, Math.min(100, left / round.duration * 100))}%`;
  if (!round.resolved && !round.paused && !left) $("question-panel").querySelectorAll("button").forEach(button => { button.disabled = true; });
}

function renderMarket(state){
 const box=$('trade-panel'),me=state.regions.find(t=>t.id===state.viewer.player?.regionId);box.hidden=!state.settings.tradeEnabled||state.settings.mode!=='team'||!me;if(box.hidden){marketKey='';return}
 const leader=me.leaderPid===state.viewer.player.pid,active=!!state.round&&!state.round.resolved,disabled=!engine.connected||active||!leader,key=JSON.stringify([me,leader,active,engine.connected,state.trades,state.regions.map(t=>[t.id,t.name,t.members.length])]);if(key===marketKey)return;marketKey=key;
 const old={team:$('trade-to')?.value,resources:$('trade-resources')?.value,economy:$('trade-economy')?.value};
 $('trade-content').innerHTML= uiTpl`<p class="small-note mut">Лидер предлагает культурные ресурсы в обмен на экономику. Обе команды подтверждают обмен. Разовый обмен — до 1000 ресурсов; экономика остаётся в пределах 15–100%. Перчатка снимает общий предел ресурса получателя. Предложение действует 2 минуты.</p>${active? uiText('<p class="small-note gold">Обмен откроется после завершения вопроса.</p>'):''}<form id="trade-form" class="qform section-gap"><label for="trade-to">Другая команда</label><select id="trade-to">${state.regions.filter(t=>t.id!==me.id&&t.members.length).map(t=>`<option value="${t.id}">${h(t.name)}</option>`).join('')}</select><div class="team-edit-fields"><label>Отдать ресурсы<input id="trade-resources" type="number" min="1" max="1000" value="25" required></label><label>Получить экономику, %<input id="trade-economy" type="number" min="1" max="85" value="5" required></label></div><button class="pri" ${disabled?'disabled':''}>Предложить обмен</button></form><div class="trade-offers section-gap">${(state.trades||[]).map(t=> uiTpl`<article class="bank-question"><strong>${h(state.regions.find(r=>r.id===t.from)?.name|| uiText('Команда'))} → ${h(state.regions.find(r=>r.id===t.to)?.name|| uiText('Команда'))}</strong><p>${t.resources} ресурсов ↔ ${t.economy}% экономики</p><div class="row">${t.to===me.id? uiTpl`<button data-trade-id="${t.id}" data-trade-accept="true" ${disabled?'disabled':''}>Принять</button>`:''}<button data-trade-id="${t.id}" data-trade-accept="false" ${disabled?'disabled':''}>${t.from===me.id? uiText('Отменить'): uiText('Отклонить')}</button></div></article>`).join('')|| uiText('<p class="small-note mut">Активных предложений нет.</p>')}</div>`;
 if(old.team&&[...$('trade-to').options].some(o=>o.value===old.team))$('trade-to').value=old.team;if(old.resources)$('trade-resources').value=old.resources;if(old.economy)$('trade-economy').value=old.economy;
 $('trade-form').addEventListener('submit',e=>{e.preventDefault();act(()=>engine.offerTrade($('trade-to').value,Number($('trade-resources').value),Number($('trade-economy').value)))});
}
$('trade-content').addEventListener('click',e=>{const button=e.target.closest('[data-trade-id]');if(button&&!button.disabled)act(()=>engine.settleTrade(button.dataset.tradeId,button.dataset.tradeAccept==='true'))});
engine.onChange(state => {
  const status = engine.connected ?  uiText("● На связи с сервером") : engine.error ||  uiText("Подключение к серверу... (пробуждение инстанса может занять до 30 сек)");
  $("reg-conn-status").textContent = status;
  $("conn-status").textContent = status;
  $("leave-btn").disabled = !engine.connected;
  if (!state) return;
  const player = state.viewer.player;
  $("reg-screen").style.display = player ? "none" : "flex";
  $("app").style.display = player ? "flex" : "none";
  if (!player) { if(engine.sessionNotice)$('reg-error').textContent=engine.sessionNotice;renderRegistration(state); previousRound = null;teamKey='';questionKey='';scene?.setVisible(false);return; }
  if(!scene&&!sceneError)requestAnimationFrame(()=>ensureScene());
  if (scene) {
    scene.setVisible(!mapCollapsed);
    const base = metadataFor(state.regions.find(t=>t.id===player.regionId)).baseRegionId;
    if (focusedRegion !== base) { scene.focusRegion(player.regionId); focusedRegion = base; }
    scene.update(state, player.regionId);
  }
  const roundChanged = previousRound !== state.round?.id;
  if (roundChanged) { previousRound = state.round?.id; message(sceneError); }
  renderTeam(state);
  renderQuestion(state);renderMarket(state);
  if(state.settings.mode==='team'){const team=state.regions.find(t=>t.id===player.regionId);let badge=$('team-panel').querySelector('[data-role-badge]');if(!badge){badge=document.createElement('p');badge.dataset.roleBadge='';badge.className='team-role-badge';$('team-panel').querySelector('h2').after(badge)}badge.textContent=team.leaderPid===player.pid? uiText('♛ Лидер команды'): uiText('◈ Участник команды');const heading=$('team-panel').querySelector('.team-roster')?.previousElementSibling;if(heading)heading.textContent= uiTpl`Команда (${team.occupied??team.members.length}/${capacityFor(team)})`;}
});
setInterval(()=>{if(!document.hidden)updateTimer()},250);
$('map-visibility').addEventListener('click',()=>{mapCollapsed=!mapCollapsed;document.querySelector('.stage-wrap').hidden=mapCollapsed;$('map-visibility').textContent=mapCollapsed? uiText('Развернуть карту'): uiText('Свернуть карту');$('map-visibility').setAttribute('aria-expanded',String(!mapCollapsed));scene?.setVisible(!mapCollapsed);if(!mapCollapsed){if(scene)scene.resize();else ensureScene()}});

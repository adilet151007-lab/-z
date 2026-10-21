import { GameEngine, REGIONS, capacityFor, totalCapacity, CRISIS_THRESHOLD, RESOURCE_CAP, DEVELOPMENT_STAGES, developmentFor, metadataFor, escapeHTML as h } from "./shared-engine.js";
import { createScene } from "./scene3d.js";

const engine = new GameEngine("student");
const $ = id => document.getElementById(id);
let scene = null, joining = false, actionPending = false, previousRound = null, focusedRegion = null;
let sceneError = "";
function message(text = "", isError = false) {
  $("action-message").textContent = text;
  $("action-message").classList.toggle("red", isError);
}
async function act(fn) {
  if (actionPending) return;
  actionPending = true;
  try { await fn(); message(); }
  catch (error) { message(error.message, true); }
  finally { actionPending = false; if (engine.state?.viewer.player) renderQuestion(engine.state); }
}
function renderRegistration(state) {
  $("team-search").hidden = state.regions.length <= 8;
  const query = $("team-search").hidden ? "" : $("team-search").value.trim().toLocaleLowerCase();
  $("registration-capacity").textContent = `${state.regions.length} команд · ${state.regions.reduce((sum,t)=>sum+t.members.length,0)} / ${totalCapacity(state.regions)} участников`;
  const teams = state.regions.filter(t=>!query || `${t.name} ${metadataFor(t).baseRegionId} ${REGIONS.find(r=>r.id===metadataFor(t).baseRegionId).name}`.toLocaleLowerCase().includes(query));
  $("region-grid").innerHTML = teams.map(region => {
    const meta = metadataFor(region), capacity = capacityFor(region), full = region.members.length >= capacity;
    return `<button class="region-card" data-region="${meta.id}" ${full || !engine.connected || joining ? "disabled" : ""} style="border-color:${meta.color}55"><span class="rname" style="color:${meta.color}">${h(meta.name)}</span><span class="team-region-sub">${h(REGIONS.find(r=>r.id===meta.baseRegionId).name)}</span><span class="seats">${region.members.length}/${capacity} ${full ? "— команда заполнена" : "— свободно"}</span><span class="members">${region.members.map(m => h(m.name)).join(", ") || "Пока никого"}</span></button>`;
  }).join("") || '<p class="mut">Команды не найдены</p>';
}
$("team-search").addEventListener("input",()=>{if(engine.state)renderRegistration(engine.state)});
$("region-grid").addEventListener("click", async event => {
  const card = event.target.closest("[data-region]");
  if (!card || joining || !engine.connected) return;
  joining = true;
  $("reg-error").textContent = "Подключение…";
  renderRegistration(engine.state);
  try { await engine.joinTeam(card.dataset.region, $("name-input").value.trim()); $("reg-error").textContent = ""; }
  catch (error) { $("reg-error").textContent = error.message; }
  finally { joining = false; if (engine.state && !engine.state.viewer.player) renderRegistration(engine.state); }
});
$("leave-btn").addEventListener("click", () => {
  if (confirm("Выйти из команды и освободить своё место?")) act(() => engine.leaveTeam());
});

function renderTeam(state) {
  const player = state.viewer.player;
  const region = state.regions.find(r => r.id === player.regionId), meta = metadataFor(region);
  const crisis = region.economy < CRISIS_THRESHOLD, development = developmentFor(region.points);
  $("my-name").textContent = player.name;
  $("my-region-tag").textContent = meta.name;
  $("my-region-tag").style.color = meta.color;
  $("team-panel").innerHTML = `<h2 style="color:${meta.color}">${h(meta.name)}</h2><div class="stat-row"><div class="stat"><span class="mut">Культурный ресурс</span><b class="gold">${region.points}<small> / ${RESOURCE_CAP}</small></b></div><div class="stat"><span class="mut">Экономика</span><b class="${crisis ? "red" : "cyan"}">${region.economy}%</b></div></div><div class="bar"><i style="width:${region.economy}%;background:var(--${crisis ? "red" : "cyan"})"></i></div>${crisis ? '<p class="red" style="margin-top:8px">Культурно-экономический кризис: регион теряет влияние.</p>' : ""}<section class="development ${development.complete ? 'complete' : ''}" aria-label="Развитие региона"><div class="development-heading"><span>${development.complete ? '✦' : '⌂'} ${development.name}</span><span>${Math.round(development.progress * 100)}%</span></div><div class="development-track" role="progressbar" aria-valuenow="${region.points}" aria-valuemin="0" aria-valuemax="${RESOURCE_CAP}" aria-label="Строительство города"><i style="width:${development.progress * 100}%"></i>${DEVELOPMENT_STAGES.slice(1).map(step => `<span class="milestone ${region.points >= step.at ? 'reached' : ''}" style="left:${step.at / RESOURCE_CAP * 100}%" title="${step.name}: ${step.at}"></span>`).join('')}</div><p class="development-note">${development.complete ? 'Город построен. Предел ресурса — 1000. Вы можете продолжать отвечать вместе с группой.' : `${development.description}. Далее: ${development.next.name} · ${development.next.at} ресурсов.`}</p></section><h3 style="margin-top:16px">Команда (${region.members.length}/${capacityFor(region)})</h3><ul class="team-roster">${region.members.map(m => `<li><span class="presence ${m.online ? "online" : ""}"></span>${h(m.name)}${m.pid === player.pid ? ' <span class="mut">(вы)</span>' : ""}${!m.online ? ' <span class="mut">· вне сети</span>' : ""}</li>`).join("")}</ul>`;
}

function renderQuestion(state) {
  const panel = $("question-panel"), round = state.round;
  if (!round) { panel.innerHTML = '<h2>Ожидайте раунд</h2><p class="mut" style="margin-top:8px">Преподаватель запустит следующий вопрос.</p>'; return; }
  const player = state.viewer.player;
  if (!player) return;
  const regionId = player.regionId, question = round.question;
  const tally = round.votes[regionId] || {}, submitted = round.submitted[regionId];
  const totalVotes = Object.values(tally).reduce((sum, n) => sum + n, 0);
  const locked = round.resolved || round.paused || submitted !== undefined || !engine.connected || engine.remainingSeconds() <= 0 || actionPending;
  const result = round.results[regionId];
  let feedback = "";
  if (round.resolved && result) {
    const text = result.skipped ? "Команда пропустила раунд." : result.correct ? `Верно! +${result.awarded ?? question.points} культурного ресурса.${result.atCap ? " Город построен — достигнут предел 1000!" : ""}` : result.reason === "tie" ? "Голоса разделились поровну: ответ не определён. −20% экономики." : result.reason === "no_votes" ? "Команда не проголосовала. −20% экономики." : "Ответ неверный. −20% экономики.";
    feedback = `<p class="${result.correct ? "cyan" : "red"}" style="margin-top:12px">${text}</p>`;
  }
  panel.innerHTML = `<div class="timer-row"><span id="round-timer"></span><div class="timer-bar"><i id="round-timer-bar"></i></div></div><div class="qtext">${h(question.text)}</div><div class="opts">${question.options.map((option, i) => {
    let cls = "opt";
    if (round.resolved && i === question.correct) cls += " correct";
    else if (round.resolved && i === submitted) cls += " wrong";
    else if (!round.resolved && (i === round.myVote || i === submitted)) cls += " chosen";
    return `<button class="${cls}" data-option="${i}" ${locked ? "disabled" : ""} aria-pressed="${i === round.myVote}"><span>${h(option)}</span><span class="votecount">${tally[i] ? `${tally[i]} гол.` : ""}${i === round.myVote && !round.resolved ? " · ваш" : ""}</span></button>`;
  }).join("")}</div>${!round.resolved && submitted === undefined ? `<div class="row" style="margin-top:12px"><button class="pri" data-submit ${locked || !totalVotes ? "disabled" : ""}>Отправить ответ команды (${totalVotes} гол.)</button></div><p class="mut small-note">Один участник — один голос. Выбор можно изменить. По таймеру ответ большинства отправится автоматически; при равенстве голосов ответ не засчитывается.</p>` : !round.resolved ? '<p class="cyan small-note">Ответ команды принят. Ожидайте результатов.</p>' : ""}${feedback}`;
  updateTimer();
}
$("question-panel").addEventListener("click", event => {
  const option = event.target.closest("[data-option]"), submit = event.target.closest("[data-submit]");
  if (option && !option.disabled) act(() => engine.castVote(Number(option.dataset.option)));
  if (submit && !submit.disabled) act(() => engine.teamSubmit());
});
function updateTimer() {
  const round = engine.state?.round;
  if (!round || !$("round-timer")) return;
  const left = engine.remainingSeconds();
  $("round-timer").textContent = round.resolved ? "Раунд завершён" : round.paused ? `Пауза · ${left} с` : `${left} с`;
  $("round-timer-bar").style.width = `${Math.max(0, Math.min(100, left / round.duration * 100))}%`;
  if (!round.resolved && !round.paused && !left) $("question-panel").querySelectorAll("button").forEach(button => { button.disabled = true; });
}

engine.onChange(state => {
  const status = engine.connected ? "● На связи с сервером" : engine.error || "● Нет связи. Переподключение…";
  $("reg-conn-status").textContent = status;
  $("conn-status").textContent = status;
  $("leave-btn").disabled = !engine.connected;
  if (!state) return;
  const player = state.viewer.player;
  $("reg-screen").style.display = player ? "none" : "flex";
  $("app").style.display = player ? "flex" : "none";
  if (!player) { renderRegistration(state); previousRound = null; return; }
  if (!scene && !sceneError) {
    try { scene = createScene($("scene-canvas")); }
    catch { sceneError = "3D недоступно в этом браузере. Командная игра продолжает работать."; message(sceneError, true); }
  }
  if (scene) {
    const base = metadataFor(state.regions.find(t=>t.id===player.regionId)).baseRegionId;
    if (focusedRegion !== base) { scene.focusRegion(base); focusedRegion = base; }
    scene.update(state, player.regionId);
  }
  if (previousRound !== state.round?.id) { previousRound = state.round?.id; message(sceneError); }
  renderTeam(state);
  renderQuestion(state);
});
setInterval(updateTimer, 200);

import { GameEngine, REGIONS, SEAT_LIMIT, CRISIS_THRESHOLD, escapeHTML as h } from "./shared-engine.js";
import { createScene } from "./scene3d.js";

const $ = id => document.getElementById(id);
const engine = new GameEngine("teacher");
let scene = null, sceneFailed = false, selectedQuestionId = null, duration = 30, controlKey = "", nextQuestionId = null;
let loggingIn = false;
function message(text = "", error = false) { $("action-message").textContent = text; $("action-message").classList.toggle("red", error); }
async function act(fn, success = "") { try { await fn(); message(success); } catch (error) { message(error.message, true); } }
function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement("a");
  a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("teacher-login-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (loggingIn) return;
  loggingIn = true; $("teacher-login-btn").disabled = true;
  try { await engine.teacherLogin($("teacher-password").value); $("teacher-password").value = ""; $("teacher-login-error").textContent = ""; }
  catch (error) { $("teacher-login-error").textContent = error.message; }
  finally { loggingIn = false; $("teacher-login-btn").disabled = !engine.connected; }
});
$("logout-btn").addEventListener("click", () => act(() => engine.teacherLogout()));
$("reset-btn").addEventListener("click", () => {
  if (confirm("Сбросить команды, баллы и текущий раунд? Банк вопросов сохранится.")) act(() => engine.resetGame(), "Начата новая игра.");
});
$("export-btn").addEventListener("click", () => act(async () => {
  const rows = await engine.exportSummary();
  const cell = value => {
    const text = String(value), safe = /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = [["Место", "Регион", "Участники", "Культурный ресурс", "Экономика %", "Статус"], ...rows.map((r, i) => [i + 1, r.region, r.members, r.points, r.economy, r.status])];
  download("vedomost.csv", "\uFEFF" + lines.map(row => row.map(cell).join(";")).join("\r\n"), "text/csv;charset=utf-8");
}));

function renderControls(state) {
  const round = state.round, key = round ? `${round.id}:${round.resolved}:${round.paused}:${engine.connected}` : `lobby:${state.questions.map(q => q.id + q.text).join("|")}:${engine.connected}`;
  if (controlKey === key) { updateTimer(); return; }
  controlKey = key;
  const disabled = engine.connected ? "" : "disabled";
  if (!round) {
    if (!state.questions.some(q => q.id === selectedQuestionId)) selectedQuestionId = nextQuestionId || state.questions[0]?.id;
    if (!state.questions.some(q => q.id === selectedQuestionId)) selectedQuestionId = state.questions[0]?.id;
    $("round-control").innerHTML = `<h2>Запуск раунда</h2><label class="small-note mut" for="q-select">Вопрос</label><select id="q-select" ${disabled}>${state.questions.map((q, i) => `<option value="${q.id}" ${q.id === selectedQuestionId ? "selected" : ""}>${i + 1}. ${h(q.text)}</option>`).join("")}</select><div class="row" style="margin-top:10px"><label for="duration-select" class="mut">Время:</label><select id="duration-select" style="width:100px" ${disabled}>${[20,30,45,60,90,120].map(n => `<option value="${n}" ${n === duration ? "selected" : ""}>${n} с</option>`).join("")}</select><button class="pri" data-control="start" ${disabled}>Запустить раунд</button></div>`;
  } else {
    $("round-control").innerHTML = `<h2>Текущий раунд</h2><p class="qtext">${h(round.question.text)}</p><p class="mut"><span id="teacher-timer"></span> · Ответили команд: <span id="submitted-count"></span></p><div class="row" style="margin-top:12px">${!round.resolved ? `<button data-control="pause" ${disabled}>${round.paused ? "Продолжить" : "Пауза"}</button><button data-control="timer" ${disabled}>Сбросить таймер</button><button class="pri" data-control="resolve" ${disabled}>Подвести итоги</button>` : `<button class="pri" data-control="next" ${disabled}>Следующий вопрос</button>`}</div>${round.resolved ? `<p class="cyan small-note">Правильный ответ: ${h(round.question.options[round.question.correct])}</p>` : ""}`;
  }
  updateTimer();
}
$("round-control").addEventListener("change", event => {
  if (event.target.id === "q-select") selectedQuestionId = event.target.value;
  if (event.target.id === "duration-select") duration = Number(event.target.value);
});
$("round-control").addEventListener("click", event => {
  const button = event.target.closest("[data-control]");
  if (!button || button.disabled) return;
  const command = button.dataset.control;
  if (command === "start") act(() => engine.startRound(selectedQuestionId, duration));
  if (command === "pause") act(() => engine.pauseRound());
  if (command === "timer") act(() => engine.resetTimer());
  if (command === "resolve") act(() => engine.resolveRound());
  if (command === "next") {
    const questions = engine.allQuestions(), index = questions.findIndex(q => q.id === engine.state.round.questionId);
    selectedQuestionId = nextQuestionId = questions[(index + 1) % questions.length]?.id;
    act(() => engine.endRound());
  }
});
function updateTimer() {
  const round = engine.state?.round;
  if (!round || !$("teacher-timer")) return;
  $("teacher-timer").textContent = round.resolved ? "Раунд завершён" : `${round.paused ? "Пауза · " : "Осталось: "}${engine.remainingSeconds()} с`;
  $("submitted-count").textContent = `${Object.keys(round.submitted).length}/${engine.state.regions.filter(r => r.members.length).length}`;
}

function renderRoster(state) {
  $("roster-table").innerHTML = `<thead><tr><th>Регион</th><th>Участники</th><th>Ресурс</th><th>Экономика</th><th>Корректировка</th></tr></thead><tbody>${state.regions.map(r => {
    const meta = REGIONS.find(x => x.id === r.id), disabled = engine.connected ? "" : "disabled";
    return `<tr><td><span class="region-tag" style="color:${meta.color}">${meta.name}</span></td><td>${r.members.length}/${SEAT_LIMIT}<div>${r.members.map(m => `<div class="roster-member"><span class="presence ${m.online ? "online" : ""}"></span><span>${h(m.name)}${m.online ? "" : ' <span class="mut">· вне сети</span>'}</span><button class="ghost remove-player" data-region="${r.id}" data-remove="${m.pid}" aria-label="Удалить ${h(m.name)}" ${disabled}>×</button></div>`).join("") || '<span class="mut">Пока никого</span>'}</div></td><td>${r.points}</td><td class="${r.economy < CRISIS_THRESHOLD ? "crisis" : ""}">${r.economy}%</td><td><div class="row"><button data-region="${r.id}" data-points="25" ${disabled}>+25</button><button data-region="${r.id}" data-points="-25" ${disabled}>−25</button><button data-region="${r.id}" data-economy="10" ${disabled}>+10%</button><button data-region="${r.id}" data-economy="-10" ${disabled}>−10%</button></div></td></tr>`;
  }).join("")}</tbody>`;
}
$("roster-table").addEventListener("click", event => {
  const button = event.target.closest("button[data-region]");
  if (!button || button.disabled) return;
  const id = button.dataset.region;
  if (button.dataset.points !== undefined) act(() => engine.adjustPoints(id, Number(button.dataset.points)));
  if (button.dataset.economy !== undefined) act(() => engine.adjustEconomy(id, Number(button.dataset.economy)));
  if (button.dataset.remove) act(() => engine.freeSlot(id, button.dataset.remove), "Место участника освобождено.");
});

$("question-builder").innerHTML = `<h2>Конструктор вопросов</h2><form id="question-form" class="qform" style="margin-top:10px"><textarea id="qb-text" rows="2" minlength="3" maxlength="2000" required placeholder="Текст вопроса" aria-label="Текст вопроса"></textarea>${[0,1,2,3].map(i => `<input id="qb-o${i}" type="text" maxlength="500" required placeholder="Вариант ${i + 1}" aria-label="Вариант ${i + 1}">`).join("")}<div class="row"><label for="qb-correct" class="mut">Правильный:</label><select id="qb-correct" style="width:85px">${[0,1,2,3].map(i => `<option value="${i}">${i + 1}</option>`).join("")}</select><label for="qb-pts" class="mut">Баллы:</label><input id="qb-pts" type="number" min="1" max="1000" value="25" required style="width:85px"></div><button class="pri" type="submit" id="qb-add">Добавить вопрос</button><p id="qb-msg" class="mut" role="status"></p></form>`;
$("question-form").addEventListener("submit", async event => {
  event.preventDefault(); $("qb-add").disabled = true;
  try {
    await engine.addCustomQuestion($("qb-text").value.trim(), [0,1,2,3].map(i => $("qb-o" + i).value.trim()), Number($("qb-correct").value), Number($("qb-pts").value));
    $("question-form").reset(); $("qb-msg").textContent = "Вопрос добавлен и сохранён."; $("qb-msg").className = "cyan";
  } catch (error) { $("qb-msg").textContent = error.message; $("qb-msg").className = "red"; }
  finally { $("qb-add").disabled = false; }
});

async function refreshEditor() { $("dev-json").value = JSON.stringify(await engine.getSnapshot(), null, 2); }
$("dev-open-btn").addEventListener("click", () => act(async () => { await refreshEditor(); $("dev-overlay").style.display = "flex"; }));
$("dev-close-btn").addEventListener("click", () => { $("dev-overlay").style.display = "none"; });
document.addEventListener("keydown", event => { if (event.key === "Escape") $("dev-overlay").style.display = "none"; });
$("dev-refresh-btn").addEventListener("click", () => act(refreshEditor));
$("dev-free-all-btn").addEventListener("click", () => {
  try {
    const snapshot = JSON.parse($("dev-json").value);
    snapshot.regions.forEach(r => { r.members = []; });
    $("dev-json").value = JSON.stringify(snapshot, null, 2);
    $("dev-msg").textContent = "Места очищены в редакторе. Для применения нажмите Apply Hotfix.";
  } catch { $("dev-msg").textContent = "Некорректный JSON. Обновите состояние."; }
});
$("dev-force-resolve-btn").addEventListener("click", () => act(async () => { await engine.resolveRound(); await refreshEditor(); }, "Раунд завершён."));
$("dev-apply-btn").addEventListener("click", async () => {
  try {
    const snapshot = JSON.parse($("dev-json").value);
    await engine.applyRawState(snapshot); await refreshEditor();
    $("dev-msg").textContent = "Патч сохранён и отправлен всем участникам.";
  } catch (error) { $("dev-msg").textContent = error.message; }
});
$("dev-backup-btn").addEventListener("click", () => act(async () => {
  const snapshot = await engine.getSnapshot();
  download("culture-quest-snapshot.json", JSON.stringify(snapshot, null, 2), "application/json");
}));

engine.onChange(state => {
  const teacher = state?.viewer.role === "teacher";
  $("teacher-login").style.display = teacher ? "none" : "flex";
  $("teacher-app").style.display = teacher ? "flex" : "none";
  $("teacher-login-btn").disabled = !engine.connected || loggingIn;
  $("teacher-login-connection").textContent = engine.connected ? "Сервер подключён" : engine.error || "Соединение с сервером…";
  if (!teacher) { $("dev-overlay").style.display = "none"; controlKey = ""; return; }
  $("conn-status").textContent = engine.connected ? "● Сервер подключён" : "● Переподключение…";
  $("phase-pill").textContent = state.round ? state.round.resolved ? "Итоги раунда" : state.round.paused ? "Пауза" : "Игра идёт" : "Лобби";
  for (const id of ["export-btn", "reset-btn", "dev-open-btn", "logout-btn"]) $(id).disabled = !engine.connected;
  renderRoster(state); renderControls(state);
  $("log-list").innerHTML = state.log.map(l => `<li>${new Date(l.t).toLocaleTimeString("ru-RU")} · ${h(l.msg)}</li>`).join("") || "<li>Пока пусто</li>";
  if (!scene && !sceneFailed) {
    try { scene = createScene($("scene-canvas")); }
    catch { sceneFailed = true; message("WebGL недоступен. Управление игрой продолжает работать.", true); }
  }
  if (scene) scene.update(state);
});
setInterval(updateTimer, 200);

import { randomBytes, randomUUID, createHash } from "node:crypto";
import { REGIONS, SEAT_LIMIT, ECONOMY_PENALTY, CRISIS_THRESHOLD, RESOURCE_CAP, developmentFor } from "./game-config.js";
import { QUESTION_BANK } from "./question-bank.js";
export { REGIONS, SEAT_LIMIT, ECONOMY_PENALTY, CRISIS_THRESHOLD } from "./game-config.js";

export class GameError extends Error {
  constructor(message, code = "INVALID_ACTION") { super(message); this.code = code; }
}
function ensure(condition, message, code) {
  if (!condition) throw new GameError(message, code);
}
export const hashToken = token => createHash("sha256").update(String(token)).digest("hex");
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const cleanText = (value, min, max, label) => {
  ensure(typeof value === "string", `${label}: ожидается текст.`);
  const text = value.normalize("NFC").trim();
  ensure(text.length >= min && text.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text), `${label}: длина от ${min} до ${max} символов.`);
  return text;
};

function validateQuestions(questions) {
  ensure(Array.isArray(questions) && questions.length >= 1 && questions.length <= 1000, "Нужно от 1 до 1000 вопросов.");
  const ids = new Set();
  return questions.map(q => {
    ensure(q && typeof q === "object" && typeof q.id === "string" && /^[\w-]{1,80}$/.test(q.id) && !ids.has(q.id), "Некорректный или повторный ID вопроса.");
    ids.add(q.id);
    ensure(Array.isArray(q.options) && q.options.length === 4, "У вопроса должны быть четыре варианта.");
    ensure(integer(q.correct, 0, 3) && integer(q.points, 1, 1000), "Проверьте правильный вариант и баллы (1–1000).");
    return { id: q.id, text: cleanText(q.text, 3, 2000, "Вопрос"), options: q.options.map(o => cleanText(o, 1, 500, "Вариант")), correct: q.correct, points: q.points };
  });
}

export function freshState() {
  return { schemaVersion: 2, revision: 0, phase: "lobby", regions: REGIONS.map(r => ({ id: r.id, points: 0, economy: 100, members: [] })), questions: structuredClone(QUESTION_BANK), round: null, log: [] };
}

function validateRegions(regions, knownMembers = null) {
  ensure(Array.isArray(regions) && regions.length === 4, "Должно быть ровно четыре региона.");
  const seenRegions = new Set(), seenPlayers = new Set();
  return REGIONS.map(meta => {
    const r = regions.find(item => item?.id === meta.id);
    ensure(r && !seenRegions.has(r.id) && regions.filter(x => x?.id === meta.id).length === 1, "ID регионов должны быть уникальными.");
    seenRegions.add(r.id);
    ensure(integer(r.points, 0, RESOURCE_CAP) && integer(r.economy, 0, 100), `Ресурс: 0–${RESOURCE_CAP}; экономика: 0–100.`);
    ensure(Array.isArray(r.members) && r.members.length <= SEAT_LIMIT, "В команде максимум четыре участника.");
    const members = r.members.map(m => {
      ensure(m && typeof m.pid === "string" && /^[\w-]{1,80}$/.test(m.pid) && !seenPlayers.has(m.pid), "Некорректный или повторный участник.");
      seenPlayers.add(m.pid);
      const original = knownMembers ? knownMembers.get(m.pid) : m;
      ensure(original && /^[a-f0-9]{64}$/.test(original.tokenHash), "Добавляйте новых участников через экран регистрации.");
      return { pid: m.pid, name: cleanText(m.name, 2, 40, "Имя"), tokenHash: original.tokenHash, joinedAt: original.joinedAt };
    });
    return { id: r.id, points: r.points, economy: r.economy, members };
  });
}

function restoreSnapshot(raw) {
  ensure(raw?.schemaVersion === 2 && integer(raw.revision, 0, Number.MAX_SAFE_INTEGER), "Неизвестная версия сохранения. Данные не были сброшены.");
  const state = structuredClone(raw);
  // Сохранения предыдущей версии могли содержать больше 1000 ресурсов.
  // Ограничиваем только это поле, сохраняя игроков, вопросы и текущий раунд.
  for (const region of state.regions || []) {
    if (integer(region.points, RESOURCE_CAP + 1, 10000000)) region.points = RESOURCE_CAP;
  }
  state.regions = validateRegions(state.regions);
  state.questions = validateQuestions(state.questions);
  ensure(["lobby", "playing", "ended"].includes(state.phase) && Array.isArray(state.log), "Повреждена структура сохранения.");
  if (state.round) {
    const r = state.round;
    ensure(typeof r.id === "string" && typeof r.questionId === "string" && typeof r.ballots === "object" && r.ballots !== null && !Array.isArray(r.ballots) && typeof r.submitted === "object" && r.submitted !== null && typeof r.results === "object" && r.results !== null, "Повреждён раунд.");
    ensure(integer(r.duration, 5, 3600) && integer(r.remainingMs, 0, 3600000) && typeof r.paused === "boolean" && typeof r.resolved === "boolean", "Повреждён таймер раунда.");
    ensure((r.paused || r.resolved) ? r.deadline === null : Number.isFinite(r.deadline), "Повреждена отметка времени.");
    validateQuestions([r.questionSnapshot]);
    for (const [pid, option] of Object.entries(r.ballots)) ensure(/^[\w-]{1,80}$/.test(pid) && integer(option, 0, 3), "Повреждены голоса.");
  }
  return state;
}

export class GameLogic {
  constructor(snapshot = null, clock = () => Date.now()) {
    this.now = clock;
    this.state = snapshot ? restoreSnapshot(snapshot) : freshState();
  }
  touch() { this.state.revision++; }
  log(msg) { this.state.log.unshift({ t: this.now(), msg }); this.state.log = this.state.log.slice(0, 100); }
  region(id) { const region = this.state.regions.find(r => r.id === id); ensure(region, "Регион не найден."); return region; }
  findPlayer(tokenHash) {
    for (const region of this.state.regions) {
      const member = region.members.find(m => m.tokenHash === tokenHash);
      if (member) return { regionId: region.id, ...member };
    }
    return null;
  }
  member(regionId, pid) { const m = this.region(regionId).members.find(p => p.pid === pid); ensure(m, "Войдите в команду заново.", "SESSION_EXPIRED"); return m; }
  joinTeam(regionId, name) {
    const region = this.region(regionId);
    const cleanName = cleanText(name, 2, 40, "Имя");
    ensure(region.members.length < SEAT_LIMIT, "Команда уже заполнена (4/4).", "TEAM_FULL");
    const token = randomBytes(32).toString("base64url");
    const player = { pid: randomUUID(), name: cleanName, tokenHash: hashToken(token), joinedAt: this.now() };
    region.members.push(player);
    this.log(`${cleanName} присоединился к команде «${REGIONS.find(r => r.id === regionId).name}».`);
    this.touch();
    return { playerToken: token, player: { pid: player.pid, name: player.name, regionId } };
  }
  leaveTeam(regionId, pid) {
    const region = this.region(regionId), member = this.member(regionId, pid);
    region.members = region.members.filter(m => m.pid !== pid);
    if (this.state.round && !this.state.round.resolved) delete this.state.round.ballots[pid];
    this.log(`${member.name}: место в команде освобождено.`);
    this.touch();
  }
  startRound(questionId, duration) {
    ensure(!this.state.round || this.state.round.resolved, "Сначала завершите текущий вопрос.");
    ensure(integer(duration, 5, 3600), "Время вопроса: от 5 до 3600 секунд.");
    const question = this.state.questions.find(q => q.id === questionId);
    ensure(question, "Вопрос не найден.");
    this.state.phase = "playing";
    this.state.round = { id: randomUUID(), questionId, questionSnapshot: structuredClone(question), startedAt: this.now(), duration, deadline: this.now() + duration * 1000, remainingMs: duration * 1000, paused: false, resolved: false, ballots: {}, submitted: {}, results: {} };
    this.log(`Начат вопрос: ${question.text}`);
    this.touch();
  }
  requireRound(roundId, voting = false) {
    const round = this.state.round;
    ensure(round && !round.resolved && round.id === roundId, "Этот вопрос уже завершён или сменился.");
    if (voting) ensure(!round.paused && this.remainingMs() > 0, "Голосование приостановлено или время истекло.");
    return round;
  }
  remainingMs() {
    const round = this.state.round;
    if (!round || round.resolved) return 0;
    return round.paused ? round.remainingMs : Math.max(0, round.deadline - this.now());
  }
  votesFor(regionId) {
    const votes = {};
    for (const member of this.region(regionId).members) {
      const option = this.state.round?.ballots[member.pid];
      if (option !== undefined) votes[option] = (votes[option] || 0) + 1;
    }
    return votes;
  }
  castVote(regionId, pid, optionIdx, roundId) {
    this.member(regionId, pid);
    const round = this.requireRound(roundId, true);
    ensure(integer(optionIdx, 0, 3), "Вариант ответа должен быть от 0 до 3.");
    ensure(round.submitted[regionId] === undefined, "Команда уже отправила ответ.");
    if (round.ballots[pid] === optionIdx) return;
    round.ballots[pid] = optionIdx;
    this.touch();
  }
  majority(regionId) {
    const sorted = Object.entries(this.votesFor(regionId)).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return { chosen: null, reason: "no_votes" };
    if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return { chosen: null, reason: "tie" };
    return { chosen: Number(sorted[0][0]), reason: "majority" };
  }
  teamSubmit(regionId, pid, roundId) {
    this.member(regionId, pid);
    const round = this.requireRound(roundId, true);
    ensure(round.submitted[regionId] === undefined, "Ответ команды уже отправлен.");
    const { chosen, reason } = this.majority(regionId);
    ensure(chosen !== null, reason === "tie" ? "Голоса разделились поровну. Обсудите ответ и измените голоса." : "Сначала проголосуйте.");
    round.submitted[regionId] = chosen;
    this.touch();
  }
  pauseRound() {
    const round = this.state.round;
    ensure(round && !round.resolved, "Нет активного раунда.");
    if (!round.paused) {
      ensure(this.remainingMs() > 0, "Время уже истекло.");
      round.remainingMs = this.remainingMs();
      round.deadline = null;
      round.paused = true;
    } else {
      round.deadline = this.now() + round.remainingMs;
      round.paused = false;
    }
    this.touch();
  }
  resetTimer() {
    const round = this.state.round;
    ensure(round && !round.resolved, "Нет активного раунда.");
    round.remainingMs = round.duration * 1000;
    round.deadline = round.paused ? null : this.now() + round.remainingMs;
    this.log("Преподаватель перезапустил таймер.");
    this.touch();
  }
  resolveRound() {
    const round = this.state.round;
    if (!round || round.resolved) return;
    const question = round.questionSnapshot;
    for (const region of this.state.regions) {
      if (!region.members.length) { round.results[region.id] = { chosen: null, correct: false, skipped: true, reason: "empty_team" }; continue; }
      const decision = round.submitted[region.id] !== undefined ? { chosen: round.submitted[region.id], reason: "submitted" } : this.majority(region.id);
      round.submitted[region.id] = decision.chosen;
      const correct = decision.chosen === question.correct;
      const awarded = correct ? Math.min(question.points, RESOURCE_CAP - region.points) : 0;
      round.results[region.id] = { ...decision, correct, awarded, atCap: region.points + awarded >= RESOURCE_CAP };
      if (correct) region.points += awarded;
      else region.economy = Math.max(0, region.economy - ECONOMY_PENALTY);
    }
    round.resolved = true;
    round.paused = false;
    round.deadline = null;
    round.remainingMs = 0;
    this.log("Раунд завершён. Голоса без ручной отправки учтены автоматически.");
    this.touch();
  }
  endRound() {
    ensure(!this.state.round || this.state.round.resolved, "Сначала подведите итоги вопроса.");
    this.state.round = null;
    this.touch();
  }
  adjustPoints(regionId, delta) {
    ensure(integer(delta, -100000, 100000), "Некорректное изменение ресурса.");
    const region = this.region(regionId);
    const previous = region.points;
    region.points = Math.min(RESOURCE_CAP, Math.max(0, region.points + delta));
    const applied = region.points - previous;
    this.log(`Ресурс «${REGIONS.find(r => r.id === regionId).name}»: ${applied > 0 ? "+" : ""}${applied}. ${region.points}/${RESOURCE_CAP}${region.points === RESOURCE_CAP ? " — город построен." : "."}`);
    this.touch();
  }
  adjustEconomy(regionId, delta) {
    ensure(integer(delta, -100, 100), "Некорректное изменение экономики.");
    const region = this.region(regionId);
    region.economy = Math.min(100, Math.max(0, region.economy + delta));
    this.log(`Экономика «${REGIONS.find(r => r.id === regionId).name}»: ${delta > 0 ? "+" : ""}${delta}%.`);
    this.touch();
  }
  addCustomQuestion(text, options, correctIdx, points = 25) {
    const question = validateQuestions([{ id: `custom_${randomUUID()}`, text, options, correct: correctIdx, points }])[0];
    this.state.questions.push(question);
    ensure(this.state.questions.length <= 1000, "В банке уже 1000 вопросов.");
    this.log("В банк добавлен вопрос.");
    this.touch();
    return { questionId: question.id };
  }
  resetGame() {
    const questions = this.state.questions, revision = this.state.revision;
    this.state = freshState();
    this.state.questions = questions;
    this.state.revision = revision;
    this.log("Игра сброшена. Банк вопросов сохранён.");
    this.touch();
  }
  editorSnapshot() {
    return { revision: this.state.revision, regions: this.state.regions.map(r => ({ ...r, members: r.members.map(({ pid, name }) => ({ pid, name })) })), questions: structuredClone(this.state.questions) };
  }
  applyRawState(raw) {
    ensure(raw && typeof raw === "object" && Object.keys(raw).every(k => ["revision", "regions", "questions"].includes(k)), "Редактор принимает revision, regions и questions.");
    ensure(raw.revision === this.state.revision, "Состояние уже изменилось. Обновите JSON и повторите правку.", "REVISION_CONFLICT");
    const known = new Map(this.state.regions.flatMap(r => r.members).map(m => [m.pid, m]));
    const regions = validateRegions(raw.regions, known);
    const questions = validateQuestions(raw.questions);
    const round = this.state.round;
    if (round && !round.resolved) {
      const current = questions.find(q => q.id === round.questionId);
      ensure(JSON.stringify(current) === JSON.stringify(round.questionSnapshot), "Завершите текущий раунд перед изменением его вопроса.");
    }
    this.state.regions = regions;
    this.state.questions = questions;
    if (round && !round.resolved) {
      const existing = new Set(regions.flatMap(r => r.members).map(m => m.pid));
      for (const pid of Object.keys(round.ballots)) if (!existing.has(pid)) delete round.ballots[pid];
    }
    this.log("Преподаватель применил проверенный JSON-патч.");
    this.touch();
  }
  view(actor = {}, onlinePlayers = new Set()) {
    const teacher = actor.role === "teacher";
    const player = actor.playerHash ? this.findPlayer(actor.playerHash) : null;
    const view = {
      revision: this.state.revision, phase: this.state.phase, serverTime: this.now(),
      viewer: { role: teacher ? "teacher" : player ? "student" : "guest", player: player ? { pid: player.pid, name: player.name, regionId: player.regionId } : null },
      regions: this.state.regions.map(r => ({ ...r, members: r.members.map(({ pid, name }) => ({ pid, name, online: onlinePlayers.has(pid) })) })),
      questions: teacher ? structuredClone(this.state.questions) : [],
      round: null, log: teacher ? structuredClone(this.state.log) : []
    };
    if (this.state.round) {
      const { ballots, questionSnapshot, ...round } = this.state.round;
      const { correct, ...publicQuestion } = questionSnapshot;
      view.round = { ...structuredClone(round), question: teacher || round.resolved ? structuredClone(questionSnapshot) : publicQuestion, remainingMs: this.remainingMs(), votes: Object.fromEntries(REGIONS.map(r => [r.id, this.votesFor(r.id)])), myVote: player ? ballots[player.pid] ?? null : null };
    }
    return view;
  }
  exportSummary() {
    return this.state.regions.map(r => ({ region: REGIONS.find(m => m.id === r.id).name, members: r.members.map(m => m.name).join(", "), points: r.points, economy: r.economy, development: developmentFor(r.points).name, status: r.economy < CRISIS_THRESHOLD ? "кризис" : "норма" })).sort((a, b) => b.points - a.points || b.economy - a.economy);
  }
}

import test from "node:test";
import assert from "node:assert/strict";
import { GameLogic, hashToken } from "../game-logic.js";

function fixture() {
  let now = 1000000;
  const game = new GameLogic(null, () => now);
  const a = game.joinTeam("saryarka", "Ернур"), b = game.joinTeam("saryarka", "Адлет");
  game.startRound("q1", 30);
  return { game, a, b, advance: ms => { now += ms; }, get round() { return game.state.round.id; } };
}
test("один игрок — один голос; повтор идемпотентен, выбор можно изменить", () => {
  const f = fixture();
  f.game.castVote("saryarka", f.a.player.pid, 0, f.round);
  const revision = f.game.state.revision;
  f.game.castVote("saryarka", f.a.player.pid, 0, f.round);
  assert.deepEqual(f.game.votesFor("saryarka"), { 0: 1 });
  assert.equal(f.game.state.revision, revision);
  f.game.castVote("saryarka", f.a.player.pid, 2, f.round);
  assert.deepEqual(f.game.votesFor("saryarka"), { 2: 1 });
});
test("по таймеру правильное большинство засчитывается без ручной отправки", () => {
  const f = fixture();
  f.game.castVote("saryarka", f.a.player.pid, 0, f.round);
  f.game.castVote("saryarka", f.b.player.pid, 0, f.round);
  f.advance(31000); f.game.resolveRound(); f.game.resolveRound();
  assert.equal(f.game.region("saryarka").points, 25);
  assert.equal(f.game.region("saryarka").economy, 100);
  assert.equal(f.game.state.round.submitted.saryarka, 0);
  assert.equal(f.game.region("jetisu").economy, 100);
});
test("пауза исключает время ожидания, в том числе после восстановления", () => {
  const f = fixture(); f.advance(10000); f.game.pauseRound();
  f.advance(60000);
  assert.equal(f.game.remainingMs(), 20000);
  const restarted = new GameLogic(f.game.state, f.game.now);
  assert.equal(restarted.remainingMs(), 20000);
  restarted.pauseRound(); f.advance(5000);
  assert.equal(restarted.remainingMs(), 15000);
});
test("лимит четыре человека; поддельный игрок и неправильный вариант отвергаются", () => {
  const f = fixture();
  f.game.joinTeam("saryarka", "Третий"); f.game.joinTeam("saryarka", "Четвёртый");
  assert.throws(() => f.game.joinTeam("saryarka", "Пятый"), /4\/4/);
  assert.throws(() => f.game.castVote("saryarka", "fake", 0, f.round));
  assert.throws(() => f.game.castVote("saryarka", f.a.player.pid, 7, f.round));
  assert.throws(() => f.game.castVote("saryarka", f.a.player.pid, 0, "old-round"));
});
test("равенство голосов требует обсуждения, по таймеру применяется один штраф", () => {
  const f = fixture();
  f.game.castVote("saryarka", f.a.player.pid, 0, f.round);
  f.game.castVote("saryarka", f.b.player.pid, 1, f.round);
  assert.throws(() => f.game.teamSubmit("saryarka", f.a.player.pid, f.round), /поровну/);
  f.game.resolveRound(); f.game.resolveRound();
  assert.equal(f.game.region("saryarka").economy, 80);
  assert.equal(f.game.state.round.results.saryarka.reason, "tie");
});
test("во время паузы и после дедлайна нельзя голосовать или отправлять ответ", () => {
  const f = fixture(); f.game.pauseRound();
  assert.throws(() => f.game.castVote("saryarka", f.a.player.pid, 0, f.round));
  assert.throws(() => f.game.teamSubmit("saryarka", f.a.player.pid, f.round));
  f.game.pauseRound(); f.advance(31000);
  assert.throws(() => f.game.castVote("saryarka", f.a.player.pid, 0, f.round));
});
test("данные студента не содержат ключей, правильных и будущих ответов", () => {
  const f = fixture();
  const student = f.game.view({ playerHash: hashToken(f.a.playerToken) });
  assert.equal(student.viewer.player.name, "Ернур");
  assert.equal(student.questions.length, 0);
  assert.equal("correct" in student.round.question, false);
  assert.equal(JSON.stringify(student).includes("tokenHash"), false);
  assert.equal(JSON.stringify(student).includes("ballots"), false);
  assert.equal(f.game.view({ role: "teacher" }).questions[0].correct, 0);
  f.game.resolveRound();
  assert.equal(f.game.view().round.question.correct, 0);
});
test("удаление игрока освобождает слот и удаляет его неотправленный голос", () => {
  const f = fixture(); f.game.castVote("saryarka", f.a.player.pid, 0, f.round);
  f.game.leaveTeam("saryarka", f.a.player.pid);
  assert.deepEqual(f.game.votesFor("saryarka"), {});
  assert.equal(f.game.findPlayer(hashToken(f.a.playerToken)), null);
});
test("патч валидируется и требует актуальную ревизию", () => {
  const f = fixture();
  const patch = f.game.editorSnapshot(); patch.regions[0].points = 100;
  f.game.applyRawState(patch);
  assert.equal(f.game.region("saryarka").points, 100);
  assert.throws(() => f.game.applyRawState(patch), /изменилось/);
  const invalid = f.game.editorSnapshot(); invalid.regions[0].economy = -50;
  assert.throws(() => f.game.applyRawState(invalid));
  const editedActive = f.game.editorSnapshot(); editedActive.questions[0].correct = 2;
  assert.throws(() => f.game.applyRawState(editedActive), /Завершите/);
});
test("сброс сохраняет добавленные вопросы и инвалидирует игроков", () => {
  const f = fixture();
  f.game.addCustomQuestion("Новый вопрос?", ["Один", "Два", "Три", "Четыре"], 2, 25);
  f.game.resetGame();
  assert.equal(f.game.state.questions.length, 11);
  assert.equal(f.game.state.round, null);
  assert.equal(f.game.findPlayer(hashToken(f.a.playerToken)), null);
});

test("ресурс ограничен 1000 при начислениях, списании и повторных правильных ответах", () => {
  const f = fixture();
  f.game.adjustPoints("saryarka", 990);
  f.game.castVote("saryarka", f.a.player.pid, 0, f.round);
  f.game.resolveRound();
  assert.equal(f.game.region("saryarka").points, 1000);
  assert.equal(f.game.state.round.results.saryarka.awarded, 10);
  assert.equal(f.game.state.round.results.saryarka.atCap, true);
  f.game.adjustPoints("saryarka", 250);
  assert.equal(f.game.region("saryarka").points, 1000);
  f.game.endRound(); f.game.startRound("q1", 30);
  f.game.castVote("saryarka", f.a.player.pid, 0, f.game.state.round.id); f.game.resolveRound();
  assert.equal(f.game.state.round.results.saryarka.awarded, 0);
  assert.equal(f.game.region("saryarka").points, 1000);
  assert.equal(f.game.region("saryarka").economy, 100);
  f.game.adjustPoints("saryarka", -25);
  assert.equal(f.game.region("saryarka").points, 975);
  f.game.adjustPoints("saryarka", -100000);
  assert.equal(f.game.region("saryarka").points, 0);
});
test("JSON-патч не обходит предел, а старое сохранение мигрирует без потери команды", () => {
  const f = fixture(), patch = f.game.editorSnapshot();
  patch.regions[0].points = 1001;
  assert.throws(() => f.game.applyRawState(patch), /0–1000/);
  assert.equal(f.game.region("saryarka").points, 0);
  const saved = structuredClone(f.game.state); saved.regions[0].points = 5000;
  const restored = new GameLogic(saved, f.game.now);
  assert.equal(restored.region("saryarka").points, 1000);
  assert.equal(restored.region("saryarka").members.length, 2);
  assert.equal(restored.state.questions.length, saved.questions.length);
  assert.equal(restored.state.round.id, saved.round.id);
  assert.equal(restored.findPlayer(hashToken(f.a.playerToken)).pid, f.a.player.pid);
});
test("на границах развития карта и интерфейс получают одинаковую стадию", async () => {
  const { developmentFor, RESOURCE_CAP } = await import("../game-config.js");
  assert.equal(RESOURCE_CAP, 1000);
  for (const [points, buildings, complete] of [[0,0,false],[99,0,false],[100,4,false],[249,4,false],[250,12,false],[500,24,false],[750,42,false],[999,42,false],[1000,64,true],[1200,64,true]]) {
    const stage = developmentFor(points);
    assert.equal(stage.buildings, buildings);
    assert.equal(stage.complete, complete);
    assert.ok(stage.progress >= 0 && stage.progress <= 1);
  }
});

test("до 50 команд, 150 участников в 38 командах, сохранение и предел мест", () => {
  const game=new GameLogic();game.expandTeams(38);assert.equal(game.state.regions.length,38);
  let count=0;
  for(const team of game.state.regions){for(let i=0;i<4&&count<150;i++){game.joinTeam(team.id,`Студент ${++count}`)}}
  assert.equal(game.state.regions.reduce((sum,t)=>sum+t.members.length,0),150);
  assert.throws(()=>game.joinTeam(game.state.regions[4].id,"Лишний"),/4\/4/);
  const restored=new GameLogic(game.state);assert.equal(restored.state.regions.length,38);assert.equal(restored.state.regions.flatMap(t=>t.members).length,150);
  restored.expandTeams(50);assert.equal(restored.state.regions.length,50);assert.throws(()=>restored.expandTeams(51));assert.throws(()=>restored.createTeam("Лишняя команда","jetisu"));
});
test("исключение команды очищает её игроков и ответы, остальные команды сохраняются",()=>{
  const f=fixture(),team=f.game.createTeam("Алаш","jetisu"),member=f.game.joinTeam(team.teamId,"Участник");
  f.game.castVote(team.teamId,member.player.pid,0,f.round);f.game.teamSubmit(team.teamId,member.player.pid,f.round);
  f.game.removeTeam(team.teamId);
  assert.equal(f.game.findPlayer(hashToken(member.playerToken)),null);assert.equal(f.game.state.round.ballots[member.player.pid],undefined);assert.equal(f.game.state.round.submitted[team.teamId],undefined);
  assert.equal(f.game.region("saryarka").members.length,2);
});
test("редактирование вопроса сохраняет активный снимок и проверяет версию",()=>{
  const f=fixture(),q=structuredClone(f.game.state.questions[0]);
  f.game.editQuestion(q.id,{...q,text:"Изменённый вопрос?",correct:2},q.version);
  assert.equal(f.game.state.questions[0].correct,2);assert.equal(f.game.state.round.questionSnapshot.correct,0);
  assert.throws(()=>f.game.editQuestion(q.id,q,q.version),/уже изменён/);
  f.game.castVote("saryarka",f.a.player.pid,0,f.round);f.game.resolveRound();assert.equal(f.game.region("saryarka").points,25);
  f.game.startRound(q.id,30);assert.equal(f.game.state.round.questionSnapshot.correct,2);
});
test("предварительная правильность и объяснения до итогов видны только преподавателю",()=>{
  const f=fixture();f.game.state.round.questionSnapshot.explanation="Секретное пояснение к ответу";f.game.state.round.questionSnapshot.sourceExcerpt="Фрагмент с правильным ответом";
  f.game.castVote("saryarka",f.a.player.pid,0,f.round);
  const teacher=f.game.view({role:"teacher"}),student=f.game.view({playerHash:hashToken(f.a.playerToken)});
  assert.equal(teacher.round.preview.find(p=>p.teamId==="saryarka").correct,true);
  assert.equal(teacher.round.preview.find(p=>p.teamId==="saryarka").submitted,false);
  assert.equal("preview" in student.round,false);assert.equal("explanation" in student.round.question,false);assert.equal("sourceExcerpt" in student.round.question,false);
  assert.equal(f.game.region("saryarka").points,0);
});
test("импорт вопросов атомарен, убирает дубликаты и сохраняет пояснения",()=>{
  const game=new GameLogic(),q={text:"Новый учебный вопрос?",options:["Один","Два","Три","Четыре"],correct:2,points:25,topic:"Тема",explanation:"Пояснение"};
  assert.deepEqual(game.importQuestions([q,q]),{added:1,skipped:1});assert.equal(game.state.questions.at(-1).explanation,"Пояснение");
  const count=game.state.questions.length;assert.throws(()=>game.importQuestions([{...q,text:"Неправильный?",options:["Один","Один","Два","Три"]}]));assert.equal(game.state.questions.length,count);
});
test("новая версия загружает прежние четыре региона без удаления участников",()=>{
 const f=fixture(),old=structuredClone(f.game.state);old.schemaVersion=2;
 for(const r of old.regions){delete r.name;delete r.baseRegionId}
 const restored=new GameLogic(old);assert.equal(restored.state.schemaVersion,3);assert.equal(restored.region("saryarka").name,"Сарыарқа");assert.equal(restored.region("saryarka").members.length,2);
});

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
  assert.equal(f.game.view({playerHash:hashToken(f.a.playerToken)}).round.question.correct, 0);
  assert.equal(f.game.view().round, null);
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
 const restored=new GameLogic(old);assert.equal(restored.state.schemaVersion,5);assert.equal(restored.region("saryarka").name,"Сарыарқа");assert.equal(restored.region("saryarka").members.length,2);
});

test("вместимость меняется для всех или одной команды, переполнение не удаляет игроков",()=>{
 const game=new GameLogic();game.setAllCapacities(6);
 for(let i=0;i<6;i++)game.joinTeam('saryarka',`Участник ${i}`);
 assert.throws(()=>game.joinTeam('saryarka','Седьмой'),/6\/6/);
 const before=structuredClone(game.state);
 assert.throws(()=>game.setAllCapacities(5),/Сначала перенесите/);assert.deepEqual(game.state,before);
 assert.throws(()=>game.setTeamCapacity('saryarka',3),/Сначала перенесите/);
 game.setTeamCapacity('jetisu',2);assert.equal(game.region('jetisu').capacity,2);
 const created=game.createTeam('Новая','abai');assert.equal(game.region(created.teamId).capacity,6);
 for(const n of [0,51,2.5,'6',NaN])assert.throws(()=>game.setAllCapacities(n));
 const restored=new GameLogic(game.state);assert.equal(restored.region('saryarka').capacity,6);assert.equal(restored.state.settings.teamCapacity,6);
 restored.resetGame();assert.equal(restored.region('jetisu').capacity,2);assert.equal(restored.state.settings.teamCapacity,6);
});
test("38 команд с 150 игроками уменьшаются до 30 по 5 без потери сессий",()=>{
 const game=new GameLogic();game.expandTeams(38);const tokens=[];
 for(let i=0;i<150;i++)tokens.push(game.joinTeam(game.state.regions[Math.floor(i/4)].id,`Студент ${i}`).playerToken);
 const before=structuredClone(game.state),blocked=game.planTeamCount(30);
 assert.equal(blocked.overflow,30);assert.throws(()=>game.setTeamCount(30,blocked.layoutToken),/Не хватает/);assert.deepEqual(game.state,before);
 game.setAllCapacities(5);const plan=game.planTeamCount(30);assert.equal(plan.overflow,0);assert.equal(plan.moves.length,30);
 const result=game.setTeamCount(30,plan.layoutToken);assert.equal(result.removed,8);assert.equal(game.state.regions.length,30);
 assert.ok(game.state.regions.every(t=>t.members.length===5));
 for(const token of tokens)assert.ok(game.findPlayer(hashToken(token)));
 const restored=new GameLogic(game.state);assert.equal(restored.state.regions.flatMap(t=>t.members).length,150);
});
test("точное число 36 → 4 убирает пустые команды; план проверяет изменения состава",()=>{
 const game=new GameLogic();game.expandTeams(36);game.adjustPoints('saryarka',500);
 const p=game.joinTeam(game.state.regions.at(-1).id,'Последний');const plan=game.planTeamCount(4);
 assert.equal(plan.removed.length,32);assert.equal(plan.overflow,0);
 const revision=game.state.revision;game.planTeamCount(4);assert.equal(game.state.revision,revision);
 game.joinTeam('jetisu','Новый');assert.throws(()=>game.setTeamCount(4,plan.layoutToken),/изменился/);
 game.setTeamCount(4,game.planTeamCount(4).layoutToken);assert.equal(game.state.regions.length,4);
 assert.equal(game.region('saryarka').points,500);assert.ok(game.findPlayer(hashToken(p.playerToken)));
 game.setTeamCount(8);assert.equal(game.state.regions.length,8);assert.ok(game.state.regions.every(t=>t.capacity===4));
});
test("перенос и имя сохраняют токен, очищают голос и открывают ответы двух команд",()=>{
 const f=fixture(),third=f.game.joinTeam('jetisu','Третий');
 f.game.castVote('saryarka',f.a.player.pid,0,f.round);f.game.teamSubmit('saryarka',f.a.player.pid,f.round);
 f.game.castVote('jetisu',third.player.pid,1,f.round);f.game.teamSubmit('jetisu',third.player.pid,f.round);
 f.game.updatePlayer(f.a.player.pid,'Ернур новый','jetisu');
 const player=f.game.findPlayer(hashToken(f.a.playerToken));assert.equal(player.regionId,'jetisu');assert.equal(player.name,'Ернур новый');
 assert.equal(f.game.state.round.ballots[f.a.player.pid],undefined);assert.equal(f.game.state.round.submitted.saryarka,undefined);assert.equal(f.game.state.round.submitted.jetisu,undefined);
 assert.deepEqual(f.game.votesFor('jetisu'),{1:1});f.game.castVote('jetisu',f.a.player.pid,0,f.round);
 f.game.setTeamCapacity('mangystau',1);f.game.joinTeam('mangystau','Занято');const before=structuredClone(f.game.state);
 assert.throws(()=>f.game.updatePlayer(f.a.player.pid,'Другое имя','mangystau'),/нет свободных мест/);assert.deepEqual(f.game.state,before);
 f.game.leaveTeam('jetisu',third.player.pid);assert.equal(f.game.findPlayer(hashToken(third.playerToken)),null);
});
test("старые сохранения мигрируют в 17 областей и 3 города, JSON-перенос очищает голоса",async()=>{
 const {REGIONS}=await import('../game-config.js');const {GEOGRAPHY}=await import('../region-geography.js');
 assert.equal(REGIONS.length,20);assert.equal(new Set(REGIONS.map(r=>r.geoId)).size,20);
 for(const r of REGIONS)assert.ok(GEOGRAPHY.regions.some(g=>g.id===r.id&&g.cityRadius>0));
 const f=fixture(),old=structuredClone(f.game.state);old.schemaVersion=3;delete old.settings;
 for(const team of old.regions){delete team.capacity;if(team.id==='saryarka')team.baseRegionId='saryarka'}
 const restored=new GameLogic(old,f.game.now);assert.equal(restored.region('saryarka').baseRegionId,'karaganda');assert.ok(restored.state.regions.every(t=>t.capacity===4));
 restored.castVote('saryarka',f.a.player.pid,0,f.round);restored.teamSubmit('saryarka',f.a.player.pid,f.round);
 const patch=restored.editorSnapshot(),member=patch.regions[0].members.shift();patch.regions[1].members.push(member);patch.regions[1].capacity=6;
 restored.applyRawState(patch);assert.equal(restored.findPlayer(hashToken(f.a.playerToken)).regionId,'jetisu');assert.equal(restored.state.round.ballots[member.pid],undefined);assert.equal(restored.state.round.submitted.saryarka,undefined);
 const created=restored.createTeam('Астана команда','astana');assert.equal(restored.region(created.teamId).baseRegionId,'astana');
});

test('защищённая команда: два создателя, одна сессия на личность, обычный вход запрещён',()=>{
 const g=new GameLogic(),a=g.joinCreator('ernur'),b=g.joinCreator('adilet');
 assert.equal(g.region('creators').members.length,2);assert.equal(a.player.name,'Ернур');assert.equal(b.player.name,'Адилет');
 assert.throws(()=>g.joinCreator('ernur'),e=>e.code==='CREATOR_OCCUPIED');assert.throws(()=>g.joinCreator('unknown'));
 assert.throws(()=>g.joinTeam('creators','Ернур'));assert.throws(()=>g.setTeamCapacity('creators',3));
 g.setAllCapacities(6);assert.equal(g.region('creators').capacity,2);g.setTeamCount(1);assert.equal(g.state.regions.length,2);assert.ok(g.creatorFor(hashToken(a.playerToken)));
 assert.throws(()=>g.removeTeam('creators'));const normal=g.state.regions.find(t=>t.id!=='creators');const p=g.joinTeam(normal.id,'Обычный');
 assert.throws(()=>g.movePlayer(p.player.pid,'creators'));assert.throws(()=>g.movePlayer(a.player.pid,normal.id));
 assert.equal(g.view({role:'creator',playerHash:hashToken(p.playerToken)}).viewer.isCreator,false);
 const saved=new GameLogic(g.state);assert.equal(saved.creatorFor(hashToken(a.playerToken)).pid,a.player.pid);assert.throws(()=>saved.joinCreator('ernur'),/уже занят/);
 saved.leaveTeam('creators',a.player.pid);assert.equal(saved.creatorFor(hashToken(a.playerToken)),null);assert.ok(saved.joinCreator('ernur').playerToken);
});
test('JSON не подделывает роль; резервная копия сохраняет состояние перед hotfix',()=>{
 const g=new GameLogic(),a=g.joinCreator('ernur'),p=g.joinTeam('jetisu','Студент');
 const bad=g.editorSnapshot();bad.regions.find(t=>t.id==='creators').capacity=3;assert.throws(()=>g.applyRawState(bad));
 const moved=g.editorSnapshot(),ordinary=moved.regions.find(t=>t.id==='jetisu').members.shift();ordinary.creatorId='adilet';moved.regions.find(t=>t.id==='creators').members.push(ordinary);assert.throws(()=>g.applyRawState(moved));
 const fake=g.editorSnapshot();fake.regions.find(t=>t.id==='jetisu').members[0].creatorId='adilet';fake.regions[0].points=500;g.applyRawState(fake);
 assert.equal(g.creatorFor(hashToken(p.playerToken)),null);assert.equal(g.creatorFor(hashToken(a.playerToken)).name,'Ернур');
 const backup=g.hotfixBackupSnapshot();assert.equal(backup.snapshot.regions[0].points,0);assert.equal(JSON.stringify(backup).includes('tokenHash'),false);assert.equal(g.state.regions[0].points,500);
});

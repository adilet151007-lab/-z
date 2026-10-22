import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { io } from "socket.io-client";
import { createGameServer } from "../server.js";
import { FileStore } from "../storage.js";

const config = { creatorCodes:{ernur:'E'.repeat(26),adilet:'A'.repeat(26)}, teacherPassword: "test-teacher-password", sessionSecret: "unit-test-session-secret-at-least-32-characters" };
class MemoryStore {
  kind = "memory"; snapshot = null; fail = false; chatSnapshot = null; failChat = false;
  async load() { return structuredClone(this.snapshot); }
  async save(state) { if (this.fail) throw new Error("simulated-storage-error"); this.snapshot = structuredClone(state); }
  async loadChat() { return structuredClone(this.chatSnapshot); }
  async saveChat(state) { if (this.failChat) throw new Error('simulated-chat-storage-error'); this.chatSnapshot=structuredClone(state); }
  async close() {}
}
const waitFor = async condition => {
  const deadline = Date.now() + 4000;
  while (!condition()) { if (Date.now() > deadline) throw new Error("Timed out waiting for state"); await new Promise(r => setTimeout(r, 10)); }
};
async function fixture(t, extra = {}) {
  const server = await createGameServer({ ...config, legacyRules:true, store: new MemoryStore(), ...extra });
  const port = await server.listen(0, "127.0.0.1"), clients = [];
  t.after(async () => { clients.forEach(socket => socket.disconnect()); await server.close(); });
  const connect = async (auth = {}) => {
    const socket = io(`http://127.0.0.1:${port}`, { auth, autoConnect: false, reconnection: false, transports: ["websocket"] });
    clients.push(socket); socket.on("state", state => { socket.latest = state; });
    socket.on('chat:meta',meta=>{socket.chatMeta=meta});
    socket.on('chat:view',view=>{socket.chatView=view});
    socket.chatEvents=[];socket.on('chat:message',event=>{socket.chatEvents.push(event)});
    const ready = once(socket, "state"); socket.connect(); await ready; return socket;
  };
  return { server, connect, base: `http://127.0.0.1:${port}` };
}
const command = (socket, name, payload = {}) => new Promise((resolve, reject) => socket.timeout(4000).emit(name, payload, (error, result) => error ? reject(error) : resolve(result)));
const login = socket => command(socket, "teacherLogin", { password: config.teacherPassword });

test("без входа нельзя выполнять ни одну административную команду", async t => {
  const f = await fixture(t), socket = await f.connect();
  for (const event of ["startRound", "switchQuestion", "getHotfixBackup", "pauseRound", "resetTimer", "resolveRound", "endRound", "adjustPoints", "adjustEconomy", "freeSlot", "addCustomQuestion", "resetGame", "applyRawState", "getSnapshot", "exportSummary", "createTeam", "expandTeams", "planTeamCount", "setTeamCount", "setTeamCapacity", "setAllCapacities", "updateTeam", "movePlayer", "renamePlayer", "updatePlayer", "renameTeam", "removeTeam", "editQuestion", "deleteQuestion", "importQuestions", "analyzeSyllabus", "generateQuestions"]) {
    const result = await command(socket, event, {}); assert.equal(result.code, "FORBIDDEN", event);
  }
  assert.equal((await command(socket, "teacherLogin", { password: "incorrect" })).ok, false);
  assert.equal((await login(socket)).ok, true);
  assert.equal((await command(socket, "adjustPoints", { regionId: "saryarka", delta: 25 })).ok, true);
  assert.equal(f.server.game.region("saryarka").points, 25);
});
test("конкурентный вход пяти клиентов оставляет ровно четыре места", async t => {
  const f = await fixture(t), clients = await Promise.all(Array.from({ length: 5 }, () => f.connect()));
  const joined = await Promise.all(clients.map((socket, i) => command(socket, "joinTeam", { regionId: "jetisu", name: `Студент ${i}` })));
  assert.equal(joined.filter(r => r.ok).length, 4);
  assert.equal(f.server.game.region("jetisu").members.length, 4);
  assert.equal(joined.find(r => !r.ok).code, "TEAM_FULL");
});
test("сокет привязан к своему игроку; правильный ответ скрыт и итоги рассылаются", async t => {
  const f = await fixture(t), teacher = await f.connect(), a = await f.connect(), b = await f.connect();
  await login(teacher);
  const pa = await command(a, "joinTeam", { regionId: "saryarka", name: "Первый" });
  const pb = await command(b, "joinTeam", { regionId: "jetisu", name: "Второй" });
  await command(teacher, "startRound", { questionId: "q1", duration: 30 });
  await waitFor(() => a.latest.round && b.latest.round);
  assert.equal(a.latest.round.question.correct, undefined);
  assert.equal(a.latest.questions.length, 0);
  const roundId = a.latest.round.id;
  await command(a, "castVote", { regionId: "jetisu", pid: pb.player.pid, roundId, optionIdx: 0 });
  await command(a, "castVote", { roundId, optionIdx: 0 });
  assert.deepEqual(f.server.game.votesFor("saryarka"), { 0: 1 });
  assert.deepEqual(f.server.game.votesFor("jetisu"), {});
  assert.equal((await command(b, "castVote", { roundId, optionIdx: 99 })).ok, false);
  assert.equal((await command(b, "castVote", { roundId, optionIdx: 1 })).ok, true);
  await command(teacher, "resolveRound");
  await waitFor(() => a.latest.round.resolved && b.latest.round.resolved);
  assert.equal(a.latest.regions[0].points, 25);
  assert.equal(b.latest.regions[1].economy, 80);
  assert.equal(a.latest.round.question.correct, 0);
  assert.equal(JSON.stringify(a.latest).includes(pa.playerToken), false);
});
test("автоматический серверный таймер учитывает голоса без кнопки отправки", async t => {
  const f = await fixture(t), teacher = await f.connect(), student = await f.connect();
  await login(teacher); await command(student, "joinTeam", { regionId: "saryarka", name: "Студент" });
  await command(teacher, "startRound", { questionId: "q1", duration: 5 });
  await command(student, "castVote", { roundId: f.server.game.state.round.id, optionIdx: 0 });
  f.server.game.state.round.deadline = Date.now() - 1;
  await waitFor(() => f.server.game.state.round.resolved);
  assert.equal(f.server.game.region("saryarka").points, 25);
  assert.equal(f.server.store.snapshot.regions[0].points, 25);
});
test("переподключение восстанавливает игрока без дубликатов", async t => {
  const f = await fixture(t), student = await f.connect();
  const joined = await command(student, "joinTeam", { regionId: "turkistan", name: "Студент" });
  student.disconnect();
  const reconnected = await f.connect({ playerToken: joined.playerToken });
  assert.equal(reconnected.latest.viewer.player.pid, joined.player.pid);
  assert.equal(f.server.game.region("turkistan").members.length, 1);
  assert.equal((await command(reconnected, "joinTeam", { regionId: "jetisu", name: "Дубликат" })).ok, false);
});
test("ошибка сохранения отменяет изменение; успешный JSON-патч рассылается", async t => {
  const f = await fixture(t), teacher = await f.connect(); await login(teacher);
  f.server.store.fail = true;
  assert.equal((await command(teacher, "adjustPoints", { regionId: "saryarka", delta: 25 })).ok, false);
  assert.equal(f.server.game.region("saryarka").points, 0);
  f.server.store.fail = false;
  const { snapshot } = await command(teacher, "getSnapshot"); snapshot.regions[0].points = 200;
  assert.equal((await command(teacher, "applyRawState", snapshot)).ok, true);
  const stale = await command(teacher, "applyRawState", snapshot); assert.equal(stale.code, "REVISION_CONFLICT");
  assert.equal(f.server.store.snapshot.regions[0].points, 200);
});
test("HTTP раздаёт обе страницы и локальные библиотеки, но не сервер и секреты", async t => {
  const f = await fixture(t);
  for (const resource of ["/student.html", "/teacher.html", "/shared-engine.js", "/creator-overlay.js", "/chat-ui.js", "/region-geography.js", "/scene3d.js", "/syllabus-ui.js", "/vendor/pdfjs/pdf.mjs", "/vendor/pdfjs/pdf.worker.mjs", "/vendor/mammoth/mammoth.browser.min.js", "/vendor/three/examples/jsm/utils/BufferGeometryUtils.js", "/vendor/three/build/three.module.js", "/vendor/three/examples/jsm/controls/OrbitControls.js", "/socket.io/socket.io.esm.min.js", "/health"]) assert.equal((await fetch(f.base + resource)).status, 200, resource);
  for (const resource of ["/server.js", "/game-logic.js", "/chat-engine.js", "/question-bank.js", "/.env", "/data/game-state.json", "/data/game-state.json.chat.json", "/storage.js", "/syllabus-engine.js", "/syllabus-bank.js"]) assert.equal((await fetch(f.base + resource)).status, 404, resource);
});
test("новое соединение получает только сохранённое состояние во время медленной записи", async t => {
  const f = await fixture(t), teacher = await f.connect(); await login(teacher);
  const store = f.server.store, originalSave = store.save.bind(store);
  let release, saving = false;
  const gate = new Promise(resolve => { release = resolve; });
  store.save = async state => { saving = true; await gate; await originalSave(state); };
  const pending = command(teacher, "adjustPoints", { regionId: "saryarka", delta: 25 });
  await waitFor(() => saving);
  const newcomer = await f.connect();
  assert.equal(newcomer.latest.regions[0].points, 0);
  release(); assert.equal((await pending).ok, true);
  await waitFor(() => newcomer.latest.regions[0].points === 25);
});
test("перезапуск сервера восстанавливает состояние и действующие сессии из файла", async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "culture-server-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const filename = path.join(dir, "state.json");
  const first = await fixture(t, { store: new FileStore(filename) }), teacher = await first.connect(), student = await first.connect();
  const teacherAuth = await login(teacher);
  const joined = await command(student, "joinTeam", { regionId: "mangystau", name: "Сохранённый" });
  await command(teacher, "adjustPoints", { regionId: "mangystau", delta: 75 });
  await command(teacher, "addCustomQuestion", { text: "Сохранённый вопрос?", options: ["a","b","c","d"], correctIdx: 1, points: 25 });
  await command(student,'chatSend',{room:'support:'+joined.player.pid,text:'Сохранённое обращение',clientId:'restart_0001'});
  student.disconnect(); teacher.disconnect(); await first.server.close();
  const second = await fixture(t, { store: new FileStore(filename) });
  const restored = await second.connect({ playerToken: joined.playerToken });
  assert.equal(restored.latest.viewer.player.name, "Сохранённый");
  assert.equal(restored.latest.regions[2].points, 75);
  const history=await command(restored,'chatSubscribe',{room:'support:'+joined.player.pid});
  assert.equal(history.chat.messages[0].text,'Сохранённое обращение');
  assert.equal(JSON.stringify(second.server.game.state).includes('Сохранённое обращение'),false);
  const teacherRestored = await second.connect({ teacherToken: teacherAuth.teacherToken });
  assert.equal(teacherRestored.latest.viewer.role, "teacher");
  assert.equal(teacherRestored.latest.questions.length, 11);
});

test("150 независимых клиентов в 38 командах: вход, голоса, закрытый обзор и итог", async t => {
  const f=await fixture(t),teacher=await f.connect();await login(teacher);
  assert.equal((await command(teacher,"expandTeams",{count:38})).ok,true);
  const teams=f.server.game.state.regions.map(t=>t.id),clients=await Promise.all(Array.from({length:150},()=>f.connect()));
  const joined=await Promise.all(clients.map((client,i)=>command(client,"joinTeam",{regionId:teams[Math.floor(i/4)],name:`Студент ${i+1}`})));
  assert.equal(joined.filter(r=>r.ok).length,150);
  await command(teacher,"startRound",{questionId:"q1",duration:120});const roundId=f.server.game.state.round.id;
  const votes=await Promise.all(clients.map(client=>command(client,"castVote",{roundId,optionIdx:0})));assert.equal(votes.filter(v=>v.ok).length,150);
  await waitFor(()=>teacher.latest.round?.preview?.every(p=>p.empty||p.correct===true));
  assert.equal(teacher.latest.round.preview.filter(p=>!p.empty).length,38);
  assert.equal("preview" in clients[0].latest.round,false);assert.equal(clients[0].latest.round.question.correct,undefined);
  await command(teacher,"resolveRound");await waitFor(()=>clients[149].latest.round?.resolved);
  assert.ok(f.server.game.state.regions.every(t=>t.points===25));
});
test("редактор и генератор доступны преподавателю и сохраняются без раскрытия ответов",async t=>{
 const f=await fixture(t),teacher=await f.connect(),student=await f.connect();await login(teacher);
 const text="Тема 1. Семиотика культуры\nСемиотика — наука о знаках и знаковых системах.";
 const analysis=await command(teacher,"analyzeSyllabus",{text});assert.equal(analysis.topics.length,1);
 const drafts=await command(teacher,"generateQuestions",{text,topics:analysis.topics,count:5});assert.ok(drafts.questions.length>0);
 const saved=await command(teacher,"importQuestions",{questions:drafts.questions});assert.ok(saved.added>0);
 const q=f.server.game.state.questions.at(-1),edit=await command(teacher,"editQuestion",{questionId:q.id,question:{...q,text:"Отредактированный вопрос?"},version:q.version});assert.equal(edit.ok,true);
 await command(student,"joinTeam",{regionId:"saryarka",name:"Участник"});await command(teacher,"startRound",{questionId:q.id,duration:30});await waitFor(()=>student.latest.round?.question.id===q.id);
 assert.equal(student.latest.round.question.text,"Отредактированный вопрос?");assert.equal(student.latest.round.question.correct,undefined);assert.equal(student.latest.round.question.explanation,undefined);assert.equal(student.latest.round.question.sourceExcerpt,undefined);
});

test("только преподаватель меняет места, переносит игроков и сокращает команды с живой синхронизацией",async t=>{
 const f=await fixture(t),teacher=await f.connect(),student=await f.connect();await login(teacher);
 const joined=await command(student,'joinTeam',{regionId:'saryarka',name:'Студент',capacity:50});
 for(const event of ['planTeamCount','setTeamCount','setAllCapacities','setTeamCapacity','updateTeam','movePlayer','renamePlayer','updatePlayer'])assert.equal((await command(student,event,{count:1,capacity:50,pid:joined.player.pid,toTeamId:'jetisu'})).code,'FORBIDDEN');
 assert.equal((await command(teacher,'setAllCapacities',{capacity:5})).ok,true);
 assert.equal((await command(teacher,'updatePlayer',{pid:joined.player.pid,name:'Исправленное имя',toTeamId:'jetisu'})).ok,true);
 await waitFor(()=>student.latest.viewer.player?.regionId==='jetisu');assert.equal(student.latest.viewer.player.name,'Исправленное имя');
 assert.equal((await command(student,'joinTeam',{regionId:'mangystau',name:'Дубликат'})).ok,false);
 await command(teacher,'setTeamCount',{count:20});const {plan}=await command(teacher,'planTeamCount',{count:4});
 assert.equal(plan.removed.length,16);assert.equal((await command(teacher,'setTeamCount',{count:4,layoutToken:plan.layoutToken})).ok,true);
 await waitFor(()=>student.latest.regions.length===4);assert.equal(student.latest.regions.find(r=>r.id==='jetisu').capacity,5);
 student.disconnect();const resumed=await f.connect({playerToken:joined.playerToken});assert.equal(resumed.latest.viewer.player.regionId,'jetisu');
 const snapshot=structuredClone(f.server.store.snapshot);f.server.store.fail=true;
 assert.equal((await command(teacher,'setTeamCount',{count:1})).ok,false);assert.deepEqual(f.server.game.state,snapshot);
});

test('два кода дают только два доступа: конкурентный вход, God Eye, голоса и запрет для студента',async t=>{
 const f=await fixture(t),clients=await Promise.all(Array.from({length:5},()=>f.connect()));
 const attempts=await Promise.all(clients.slice(0,4).map(s=>command(s,'joinTeam',{regionId:'creators',name:config.creatorCodes.ernur})));
 assert.equal(attempts.filter(r=>r.ok).length,1);assert.ok(attempts.filter(r=>!r.ok).every(r=>r.code==='CREATOR_OCCUPIED'));
 const creator=clients[attempts.findIndex(r=>r.ok)],joined=attempts.find(r=>r.ok);assert.equal(joined.player.name,'Ернур');
 const second=await command(clients[4],'joinTeam',{regionId:'creators',name:config.creatorCodes.adilet});assert.equal(second.player.name,'Адилет');
 const student=await f.connect({isCreator:true,role:'creator'});await command(student,'joinTeam',{regionId:'jetisu',name:'Ернур'});
 assert.equal((await command(student,'adjustPoints',{regionId:'jetisu',delta:100})).code,'FORBIDDEN');
 assert.equal((await command(creator,'startRound',{questionId:'q1',duration:60})).ok,true);await waitFor(()=>creator.latest.round&&student.latest.round);
 assert.equal(creator.latest.viewer.role,'creator');assert.equal(creator.latest.viewer.isCreator,true);assert.equal(creator.latest.round.question.correct,0);assert.ok(creator.latest.questions.length>1);
 assert.equal(student.latest.round.question.correct,undefined);assert.equal(student.latest.questions.length,0);assert.equal(student.latest.viewer.isCreator,false);
 assert.equal((await command(creator,'castVote',{roundId:creator.latest.round.id,optionIdx:0})).ok,true);assert.deepEqual(f.server.game.votesFor('creators'),{0:1});
 const publicJSON=JSON.stringify(student.latest);assert.ok(!publicJSON.includes(config.creatorCodes.ernur));assert.ok(!publicJSON.includes('tokenHash'));assert.ok(!publicJSON.includes(joined.playerToken));
 creator.disconnect();const intruder=await f.connect();assert.equal((await command(intruder,'joinTeam',{regionId:'creators',name:config.creatorCodes.ernur})).code,'CREATOR_OCCUPIED');
 const resumed=await f.connect({playerToken:joined.playerToken});assert.equal(resumed.latest.viewer.isCreator,true);assert.equal(f.server.game.region('creators').members.length,2);
});
test('отзыв доступа немедленно закрывает инструменты, ошибочная запись не занимает слот',async t=>{
 const f=await fixture(t),teacher=await f.connect(),root=await f.connect();await login(teacher);
 f.server.store.fail=true;assert.equal((await command(root,'joinTeam',{regionId:'creators',name:config.creatorCodes.ernur})).ok,false);assert.equal(f.server.game.state.regions.some(t=>t.id==='creators'),false);
 f.server.store.fail=false;const join=await command(root,'joinTeam',{regionId:'creators',name:config.creatorCodes.ernur});assert.equal(join.ok,true);
 await command(teacher,'freeSlot',{regionId:'creators',pid:join.player.pid});await waitFor(()=>root.latest.viewer.role==='guest');
 assert.equal((await command(root,'getSnapshot')).code,'FORBIDDEN');const old=await f.connect({playerToken:join.playerToken});assert.equal(old.latest.viewer.isCreator,false);
 const newcomer=await f.connect();assert.equal((await command(newcomer,'joinTeam',{regionId:'creators',name:config.creatorCodes.ernur})).ok,true);
});
test('перезапуск сохраняет бронь создателя и полномочия по токену',async t=>{
 const store=new MemoryStore(),first=await fixture(t,{store}),root=await first.connect();
 const joined=await command(root,'joinTeam',{regionId:'creators',name:config.creatorCodes.ernur});root.disconnect();await first.server.close();
 const second=await fixture(t,{store}),newClient=await second.connect();assert.equal((await command(newClient,'joinTeam',{regionId:'creators',name:config.creatorCodes.ernur})).code,'CREATOR_OCCUPIED');
 const resumed=await second.connect({playerToken:joined.playerToken});assert.equal(resumed.latest.viewer.role,'creator');assert.equal((await command(resumed,'adjustPoints',{regionId:'creators',delta:25})).ok,true);
 assert.equal(second.server.game.region('creators').points,25);
});

const received=(socket,text)=>[...(socket.chatView?.messages||[]),...socket.chatEvents.map(e=>e.message)].some(m=>m.text===text);
test('универсальный сервер: скрытые сессии, имя после кода, отзыв прав, защита режимов и сохранение после F5',async t=>{
 const f=await fixture(t,{legacyRules:false}),teacher=await f.connect(),student=await f.connect(),root=await f.connect(),guest=await f.connect();await login(teacher);
 assert.equal(guest.latest.regions.length,10);assert.equal(guest.latest.settings.mode,'team');assert.equal(guest.latest.regions.some(t=>t.id==='creators'),false);
 const r=await command(root,'joinTeam',{regionId:'jetisu',name:config.creatorCodes.ernur+' Арман'});assert.equal(r.player.name,'Арман');
 const a=await command(student,'joinTeam',{regionId:'jetisu',name:'Алия'});
 for(const event of ['setGameMode','renameSelf','adjustCapital'])assert.equal((await command(student,event,{mode:'solo',name:'Подмена',pid:a.player.pid,delta:100})).code,'FORBIDDEN');
 assert.equal((await command(root,'renameSelf',{name:'Марат'})).ok,true);await waitFor(()=>student.latest.regions.flatMap(t=>t.members).some(m=>m.name==='Марат'));
 root.disconnect();const restored=await f.connect({playerToken:r.playerToken});assert.equal(restored.latest.viewer.isDevTelemetry,true);assert.equal(restored.latest.viewer.player.name,'Марат');
 assert.equal((await command(guest,'joinTeam',{regionId:'jetisu',name:config.creatorCodes.ernur})).code,'CREATOR_OCCUPIED');
 await command(teacher,'setGameMode',{mode:'solo'});await command(teacher,'startRound',{questionId:'q1',duration:30});await command(student,'castVote',{roundId:f.server.game.state.round.id,optionIdx:0});
 await command(teacher,'resolveRound');await waitFor(()=>student.latest.round?.resolved);assert.equal(student.latest.viewer.player.capital,25);assert.equal(student.latest.leaderboard.find(m=>m.pid===a.player.pid).capital,25);
 const snapshot=await command(restored,'getSnapshot');assert.equal(snapshot.snapshot.settings.mode,'solo');assert.equal(JSON.stringify(snapshot).includes('tokenHash'),false);
 await command(teacher,'freeSlot',{regionId:'jetisu',pid:r.player.pid});assert.equal((await command(restored,'renameSelf',{name:'Снова'})).code,'FORBIDDEN');
});
test('универсальный сервер: предложения видны только своей команде и подтверждаются без штрафа',async t=>{
 const f=await fixture(t,{legacyRules:false}),teacher=await f.connect(),a=await f.connect(),b=await f.connect(),other=await f.connect();await login(teacher);
 const joined=await command(a,'joinTeam',{regionId:'saryarka',name:'Алия'});await command(b,'joinTeam',{regionId:'saryarka',name:'Бек'});await command(other,'joinTeam',{regionId:'jetisu',name:'Другой'});await command(teacher,'startRound',{questionId:'q1',duration:30});
 const roundId=f.server.game.state.round.id;await command(a,'castVote',{roundId,optionIdx:1});await waitFor(()=>b.latest.round?.proposals.length===1);assert.equal(other.latest.round.proposals.length,0);
 assert.equal((await command(other,'confirmVote',{roundId,pid:joined.player.pid})).ok,false);await command(a,'cancelVote',{roundId});assert.deepEqual(f.server.game.votesFor('saryarka'),{});
 await command(a,'castVote',{roundId,optionIdx:0});await command(b,'confirmVote',{roundId,pid:joined.player.pid});await command(teacher,'resolveRound');assert.equal(f.server.game.region('saryarka').points,25);
});
test('универсальный Solo: 150 соединений получают личный результат и общий лидерборд',async t=>{
 const f=await fixture(t,{legacyRules:false}),teacher=await f.connect();await login(teacher);await command(teacher,'setGameMode',{mode:'solo'});
 const clients=await Promise.all(Array.from({length:150},()=>f.connect()));
 const joined=await Promise.all(clients.map((s,i)=>command(s,'joinTeam',{name:'Участник '+i})));assert.equal(joined.filter(r=>r.ok).length,150);
 await command(teacher,'startRound',{questionId:'q1',duration:120});const roundId=f.server.game.state.round.id;
 const votes=await Promise.all(clients.map(s=>command(s,'castVote',{roundId,optionIdx:0})));assert.ok(votes.every(v=>v.ok));
 await waitFor(()=>teacher.latest.round?.preview.length===150);assert.equal(clients[0].latest.round.question.correct,undefined);
 await command(teacher,'resolveRound');await waitFor(()=>clients[149].latest.round?.resolved);
 assert.equal(clients[149].latest.viewer.player.capital,25);assert.equal(clients[149].latest.leaderboard.length,150);assert.ok(clients[149].latest.leaderboard.every(m=>m.capital===25));assert.ok(f.server.game.state.regions.every(t=>t.economy===100));
});
test('чаты: гости и подмена роли запрещены, общий разговор доставляется участникам',async t=>{
 const f=await fixture(t),alice=await f.connect(),bob=await f.connect(),guest=await f.connect({isCreator:true});
 for(const event of ['chatSubscribe','chatSend','chatDelete'])assert.equal((await command(guest,event,{room:'global',text:'Спам',clientId:'guest_0001',messageId:'fake'})).code,'FORBIDDEN');
 await command(alice,'joinTeam',{regionId:'saryarka',name:'Алия'});await command(bob,'joinTeam',{regionId:'jetisu',name:'Бек'});
 await command(alice,'chatSubscribe',{room:'global'});await command(bob,'chatSubscribe',{room:'global'});
 const result=await command(alice,'chatSend',{room:'global',text:'Привет аудитории',clientId:'global_0001',author:{name:'Ернур',role:'creator'}});assert.equal(result.ok,true);
 await waitFor(()=>received(bob,'Привет аудитории'));
 assert.equal(f.server.store.chatSnapshot.messages[0].author.name,'Алия');assert.equal(f.server.store.chatSnapshot.messages[0].author.role,'student');
 assert.equal(received(guest,'Привет аудитории'),false);assert.equal(guest.chatMeta.enabled,false);
 assert.equal(JSON.stringify(f.server.game.state).includes('Привет аудитории'),false);
});
test('чаты: личное обращение видят оба создателя, чужие студенты и преподаватель не получают текст',async t=>{
 const f=await fixture(t),alice=await f.connect(),bob=await f.connect(),teacher=await f.connect(),ernur=await f.connect(),adilet=await f.connect();
 await login(teacher);const a=await command(alice,'joinTeam',{regionId:'saryarka',name:'Алия'});await command(bob,'joinTeam',{regionId:'saryarka',name:'Бек'});
 await command(ernur,'joinTeam',{regionId:'creators',name:config.creatorCodes.ernur});await command(adilet,'joinTeam',{regionId:'creators',name:config.creatorCodes.adilet});
 const room='support:'+a.player.pid;
 for(const socket of [alice,ernur,adilet])assert.equal((await command(socket,'chatSubscribe',{room})).ok,true);
 for(const socket of [teacher,bob])assert.equal((await command(socket,'chatSubscribe',{room})).code,'FORBIDDEN');
 const sent=await command(alice,'chatSend',{room,text:'Закрытая просьба проверить вопрос',clientId:'private_0001'});
 await waitFor(()=>received(ernur,'Закрытая просьба проверить вопрос')&&received(adilet,'Закрытая просьба проверить вопрос'));
 for(const socket of [teacher,bob]){assert.equal(received(socket,'Закрытая просьба проверить вопрос'),false);assert.deepEqual(socket.chatMeta.inbox,[]);assert.equal(JSON.stringify(socket.chatMeta).includes('Закрытая просьба'),false);assert.equal((await command(socket,'chatDelete',{messageId:sent.messageId})).code,'FORBIDDEN')}
 await command(adilet,'chatSend',{room,text:'Проверили, спасибо!',clientId:'reply_0001'});await waitFor(()=>received(alice,'Проверили, спасибо!'));
 const message=[...alice.chatEvents.map(e=>e.message),...(alice.chatView?.messages||[])].find(m=>m.text==='Проверили, спасибо!');assert.equal(message.author.name,'Адилет');assert.equal(message.author.role,'creator');
 assert.equal((await command(teacher,'chatSubscribe',{room:'team:creators'})).code,'FORBIDDEN');
});
test('чаты: перенос и исключение отзывают доступ до следующего сообщения',async t=>{
 const f=await fixture(t),alice=await f.connect(),dana=await f.connect(),teacher=await f.connect();await login(teacher);
 const a=await command(alice,'joinTeam',{regionId:'saryarka',name:'Алия'});await command(dana,'joinTeam',{regionId:'saryarka',name:'Дана'});
 await command(alice,'chatSubscribe',{room:'team:saryarka'});await command(dana,'chatSubscribe',{room:'team:saryarka'});
 await command(teacher,'movePlayer',{pid:a.player.pid,toTeamId:'jetisu'});
 await command(dana,'chatSend',{room:'team:saryarka',text:'Старой команде',clientId:'team_old_0001'});
 await waitFor(()=>alice.chatMeta.identity?.teamId==='jetisu');assert.equal(received(alice,'Старой команде'),false);
 assert.equal((await command(alice,'chatSubscribe',{room:'team:saryarka'})).code,'FORBIDDEN');
 assert.equal((await command(alice,'chatSubscribe',{room:'team:jetisu'})).ok,true);
 await command(teacher,'freeSlot',{regionId:'jetisu',pid:a.player.pid});
 assert.equal((await command(alice,'chatSend',{room:'global',text:'Исключённый',clientId:'revoked_0001'})).code,'FORBIDDEN');
 await waitFor(()=>alice.chatMeta.enabled===false);assert.equal(alice.chatView.messages.length,0);
});
test('чаты: ошибка БД отменяет отправку, повтор не дублирует, удаление рассылает пустой текст',async t=>{
 const f=await fixture(t),alice=await f.connect(),bob=await f.connect();
 await command(alice,'joinTeam',{regionId:'jetisu',name:'Алия'});await command(bob,'joinTeam',{regionId:'jetisu',name:'Бек'});await command(alice,'chatSubscribe',{room:'global'});await command(bob,'chatSubscribe',{room:'global'});
 const payload={room:'global',text:'Надёжная доставка',clientId:'delivery_0001'};
 f.server.store.failChat=true;assert.equal((await command(alice,'chatSend',payload)).code,'STORAGE_ERROR');assert.equal(f.server.store.chatSnapshot,null);assert.equal(received(bob,payload.text),false);
 f.server.store.failChat=false;const first=await command(alice,'chatSend',payload),duplicate=await command(alice,'chatSend',payload);
 assert.equal(first.ok,true);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.messageId,first.messageId);assert.equal(f.server.store.chatSnapshot.messages.length,1);
 await waitFor(()=>received(bob,payload.text));
 assert.equal((await command(bob,'chatDelete',{messageId:first.messageId})).code,'FORBIDDEN');
 f.server.store.failChat=true;assert.equal((await command(alice,'chatDelete',{messageId:first.messageId})).code,'STORAGE_ERROR');assert.equal(f.server.store.chatSnapshot.messages[0].text,payload.text);
 f.server.store.failChat=false;await command(alice,'chatDelete',{messageId:first.messageId});await waitFor(()=>bob.chatEvents.some(e=>e.message.id===first.messageId&&e.message.deleted));
 assert.equal(f.server.store.chatSnapshot.messages[0].text,'');
});
test('чаты: антиспам привязан к игроку и не сбрасывается переподключением',async t=>{
 const f=await fixture(t),alice=await f.connect();const joined=await command(alice,'joinTeam',{regionId:'saryarka',name:'Алия'});
 for(let i=0;i<8;i++)assert.equal((await command(alice,'chatSend',{room:'global',text:'Сообщение '+i,clientId:'rate_000'+i})).ok,true);
 assert.equal((await command(alice,'chatSend',{room:'global',text:'Сообщение 7',clientId:'rate_0007'})).duplicate,true);
 assert.equal((await command(alice,'chatSend',{room:'global',text:'Лишнее',clientId:'rate_0008'})).code,'RATE_LIMIT');
 alice.disconnect();const resumed=await f.connect({playerToken:joined.playerToken});
 assert.equal((await command(resumed,'chatSend',{room:'global',text:'Снова лишнее',clientId:'rate_0009'})).code,'RATE_LIMIT');
 assert.equal((await command(resumed,'chatSubscribe',{room:'global'})).chat.messages.length,8);
});

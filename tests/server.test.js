import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { io } from "socket.io-client";
import { createGameServer } from "../server.js";
import { FileStore } from "../storage.js";

const config = { teacherPassword: "test-teacher-password", sessionSecret: "unit-test-session-secret-at-least-32-characters" };
class MemoryStore {
  kind = "memory"; snapshot = null; fail = false;
  async load() { return structuredClone(this.snapshot); }
  async save(state) { if (this.fail) throw new Error("simulated-storage-error"); this.snapshot = structuredClone(state); }
  async close() {}
}
const waitFor = async condition => {
  const deadline = Date.now() + 4000;
  while (!condition()) { if (Date.now() > deadline) throw new Error("Timed out waiting for state"); await new Promise(r => setTimeout(r, 10)); }
};
async function fixture(t, extra = {}) {
  const server = await createGameServer({ ...config, store: new MemoryStore(), ...extra });
  const port = await server.listen(0, "127.0.0.1"), clients = [];
  t.after(async () => { clients.forEach(socket => socket.disconnect()); await server.close(); });
  const connect = async (auth = {}) => {
    const socket = io(`http://127.0.0.1:${port}`, { auth, autoConnect: false, reconnection: false, transports: ["websocket"] });
    clients.push(socket); socket.on("state", state => { socket.latest = state; });
    const ready = once(socket, "state"); socket.connect(); await ready; return socket;
  };
  return { server, connect, base: `http://127.0.0.1:${port}` };
}
const command = (socket, name, payload = {}) => new Promise((resolve, reject) => socket.timeout(4000).emit(name, payload, (error, result) => error ? reject(error) : resolve(result)));
const login = socket => command(socket, "teacherLogin", { password: config.teacherPassword });

test("без входа нельзя выполнять ни одну административную команду", async t => {
  const f = await fixture(t), socket = await f.connect();
  for (const event of ["startRound", "pauseRound", "resetTimer", "resolveRound", "endRound", "adjustPoints", "adjustEconomy", "freeSlot", "addCustomQuestion", "resetGame", "applyRawState", "getSnapshot", "exportSummary", "createTeam", "expandTeams", "renameTeam", "removeTeam", "editQuestion", "deleteQuestion", "importQuestions", "analyzeSyllabus", "generateQuestions"]) {
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
  for (const resource of ["/student.html", "/teacher.html", "/shared-engine.js", "/region-geography.js", "/scene3d.js", "/syllabus-ui.js", "/vendor/pdfjs/pdf.mjs", "/vendor/pdfjs/pdf.worker.mjs", "/vendor/mammoth/mammoth.browser.min.js", "/vendor/three/examples/jsm/utils/BufferGeometryUtils.js", "/vendor/three/build/three.module.js", "/vendor/three/examples/jsm/controls/OrbitControls.js", "/socket.io/socket.io.esm.min.js", "/health"]) assert.equal((await fetch(f.base + resource)).status, 200, resource);
  for (const resource of ["/server.js", "/game-logic.js", "/question-bank.js", "/.env", "/data/game-state.json", "/storage.js", "/syllabus-engine.js", "/syllabus-bank.js"]) assert.equal((await fetch(f.base + resource)).status, 404, resource);
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
  student.disconnect(); teacher.disconnect(); await first.server.close();
  const second = await fixture(t, { store: new FileStore(filename) });
  const restored = await second.connect({ playerToken: joined.playerToken });
  assert.equal(restored.latest.viewer.player.name, "Сохранённый");
  assert.equal(restored.latest.regions[2].points, 75);
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

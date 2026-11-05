import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { newDb } from "pg-mem";
import { FileStore, PostgresStore } from "../storage.js";
import { GameLogic } from "../game-logic.js";
import {ChatEngine,chatIdentity} from '../chat-engine.js';

test("локальный файл восстанавливает участников, вопросы, экономику и таймер", async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "culture-store-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const filename = path.join(dir, "state.json"), store = new FileStore(filename); await store.init();
  const game = new GameLogic(); game.joinTeam("jetisu", "Студент"); game.adjustPoints("jetisu", 75); game.adjustEconomy("jetisu", -20);
  game.addCustomQuestion("Вопрос из редактора?", ["a", "b", "c", "d"], 2, 25); game.startRound("q1", 30); game.pauseRound();
  await store.save(game.state);
  const restored = new GameLogic(await new FileStore(filename).load());
  assert.deepEqual(restored.state, new GameLogic(game.state).state);
});
test("повреждённое сохранение не заменяется пустой игрой", async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "culture-corrupt-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const filename = path.join(dir, "state.json"); await writeFile(filename, "broken");
  await assert.rejects(new FileStore(filename).load(), /не прочитано/);
});
test("PostgreSQL-адаптер создаёт таблицу, обновляет и читает JSONB (pg-mem)", async () => {
  const db = newDb(), { Pool } = db.adapters.createPg(), store = new PostgresStore(new Pool());
  await store.init(); assert.equal(await store.load(), null);
  const game = new GameLogic(); await store.save(game.state); game.adjustPoints("turkistan", 50); await store.save(game.state);
  const restored = new GameLogic(await store.load()); assert.equal(restored.region("turkistan").points, 50);
  await store.close();
});

test('файловая история чата сохраняется отдельно от игры и не сбрасывает повреждённые данные',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'culture-chat-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=new FileStore(path.join(dir,'game.json'));await store.init();assert.equal(await store.loadChat(),null);
 const game=new GameLogic(),chat=new ChatEngine(),teacher=chatIdentity(game,{role:'teacher'});await store.save(game.state);
 const draft=chat.prepareSend(game,teacher,'global','Сохранённая история','storage_0001');await store.saveChat(draft.state);
 assert.deepEqual(new ChatEngine(await store.loadChat()).state,draft.state);assert.deepEqual(await store.load(),game.state);
 await writeFile(store.filename+'.chat.json','broken');await assert.rejects(store.loadChat(),/не прочитано/);assert.deepEqual(await store.load(),game.state);
});
test('PostgreSQL хранит чат в собственной таблице независимо от патча игровой сессии',async()=>{
 const db=newDb(),{Pool}=db.adapters.createPg(),store=new PostgresStore(new Pool());await store.init();assert.equal(await store.loadChat(),null);
 const game=new GameLogic(),chat=new ChatEngine(),teacher=chatIdentity(game,{role:'teacher'}),draft=chat.prepareSend(game,teacher,'global','История в PostgreSQL','postgres_0001');
 await store.save(game.state);await store.saveChat(draft.state);game.adjustPoints('turkistan',25);await store.save(game.state);
 assert.deepEqual(new ChatEngine(await store.loadChat()).state,draft.state);assert.equal((await store.load()).regions[3].points,25);await store.close();
});

test('файловый CQL: разные экземпляры атомарно расходуют одно право', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'culture-cql-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const filename = path.join(dir, 'state.json');
  const a = new FileStore(filename), b = new FileStore(filename);
  await Promise.all([a.initLocalAdminLifetime(), b.initLocalAdminLifetime()]);
  const results = await Promise.all([a.redeemLocalAdmin({ winner: 'a' }), b.redeemLocalAdmin({ winner: 'b' })]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.deepEqual(await a.load(), { winner: results[0] ? 'a' : 'b' });
  await b.save({ restored: true });
  assert.equal(await a.localAdminRedeemed(), true);
});

test('PostgreSQL CQL: атомарный захват и независимость от снимка (pg-mem)', async t => {
  const { Pool } = newDb({ noAstCoverageCheck: true }).adapters.createPg();
  const store = new PostgresStore(new Pool());
  t.after(() => store.close());
  await store.init();
  await store.initLocalAdminLifetime();
  assert.equal(await store.localAdminRedeemed(), false);
  const results = await Promise.all([store.redeemLocalAdmin({ winner: 'a' }), store.redeemLocalAdmin({ winner: 'b' })]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.deepEqual(await store.load(), { winner: results[0] ? 'a' : 'b' });
  await store.save({ restored: true });
  await store.initLocalAdminLifetime();
  assert.equal(await store.localAdminRedeemed(), true);
});

test('PostgreSQL CQL: миграция закрывает вход при наличии старой игры (pg-mem)', async t => {
  const { Pool } = newDb().adapters.createPg();
  const store = new PostgresStore(new Pool());
  t.after(() => store.close());
  await store.init();
  await store.save({ legacy: true });
  await store.initLocalAdminLifetime();
  assert.equal(await store.localAdminRedeemed(), true);
  assert.equal(await store.redeemLocalAdmin({ legacy: false }), false);
  assert.deepEqual(await store.load(), { legacy: true });
});

const postgresTestUrl = process.env.CQL_TEST_DATABASE_URL;
test('PostgreSQL CQL: rollback и гонка независимых соединений', { skip: !postgresTestUrl }, async t => {
  const schema = 'cql_test_' + randomUUID().replaceAll('-', '');
  const admin = new pg.Pool({ connectionString: postgresTestUrl });
  await admin.query('CREATE SCHEMA ' + schema);
  const connection = { connectionString: postgresTestUrl, options: '-c search_path=' + schema };
  const a = new PostgresStore(new pg.Pool(connection)), b = new PostgresStore(new pg.Pool(connection));
  t.after(async () => {
    await Promise.all([a.close(), b.close()]);
    try { await admin.query('DROP SCHEMA ' + schema + ' CASCADE'); } finally { await admin.end(); }
  });
  await a.init();
  await a.initLocalAdminLifetime();
  // A failed snapshot write must roll back the marker already updated in the transaction.
  await admin.query(`ALTER TABLE ${schema}.culture_quest_state ADD CHECK (NOT (snapshot ? 'reject'))`);
  await assert.rejects(a.redeemLocalAdmin({ reject: true }), { code: '23514' });
  assert.equal(await b.localAdminRedeemed(), false);
  assert.equal(await b.load(), null);
  const results = await Promise.all([a.redeemLocalAdmin({ winner: 'a' }), b.redeemLocalAdmin({ winner: 'b' })]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.deepEqual(await b.load(), { winner: results[0] ? 'a' : 'b' });
});

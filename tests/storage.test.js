import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { newDb } from "pg-mem";
import { FileStore, PostgresStore } from "../storage.js";
import { GameLogic } from "../game-logic.js";

test("локальный файл восстанавливает участников, вопросы, экономику и таймер", async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "culture-store-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const filename = path.join(dir, "state.json"), store = new FileStore(filename); await store.init();
  const game = new GameLogic(); game.joinTeam("jetisu", "Студент"); game.adjustPoints("jetisu", 75); game.adjustEconomy("jetisu", -20);
  game.addCustomQuestion("Вопрос из редактора?", ["a", "b", "c", "d"], 2, 25); game.startRound("q1", 30); game.pauseRound();
  await store.save(game.state);
  const restored = new GameLogic(await new FileStore(filename).load());
  assert.deepEqual(restored.state, game.state);
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

import { readFile, mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

export class FileStore {
  constructor(filename) { this.filename = path.resolve(filename); this.kind = "file"; }
  async init() { await mkdir(path.dirname(this.filename), { recursive: true }); }
  async load() {
    try { return JSON.parse(await readFile(this.filename, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return null; throw new Error("Сохранение не прочитано. Исходный файл не был заменён.", { cause: error }); }
  }
  async save(snapshot) {
    const temp = `${this.filename}.${process.pid}.tmp`;
    const file = await open(temp, "w", 0o600);
    try { await file.writeFile(JSON.stringify(snapshot)); await file.sync(); }
    finally { await file.close(); }
    try { await rename(temp, this.filename); }
    catch (error) { await unlink(temp).catch(() => {}); throw error; }
  }
  async close() {}
  async loadChat() { return new FileStore(`${this.filename}.chat.json`).load(); }
  async saveChat(snapshot) { return new FileStore(`${this.filename}.chat.json`).save(snapshot); }
}

export class PostgresStore {
  constructor(pool) { this.pool = pool; this.kind = "postgres"; }
  async init() {
    await this.pool.query("CREATE TABLE IF NOT EXISTS culture_quest_state (id SMALLINT PRIMARY KEY CHECK (id = 1), snapshot JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    await this.pool.query("CREATE TABLE IF NOT EXISTS culture_quest_chat (id SMALLINT PRIMARY KEY CHECK (id = 1), snapshot JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  }
  async load() { const { rows } = await this.pool.query("SELECT snapshot FROM culture_quest_state WHERE id = 1"); return rows[0]?.snapshot || null; }
  async save(snapshot) {
    await this.pool.query("INSERT INTO culture_quest_state (id, snapshot, updated_at) VALUES (1, $1::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = NOW()", [JSON.stringify(snapshot)]);
  }
  async close() { await this.pool.end(); }
  async loadChat() { const { rows } = await this.pool.query("SELECT snapshot FROM culture_quest_chat WHERE id = 1"); return rows[0]?.snapshot || null; }
  async saveChat(snapshot) { await this.pool.query("INSERT INTO culture_quest_chat (id, snapshot, updated_at) VALUES (1, $1::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = NOW()",[JSON.stringify(snapshot)]); }
}

export async function createStore({ databaseUrl = process.env.DATABASE_URL, stateFile = process.env.STATE_FILE || "./data/game-state.json" } = {}) {
  if (process.env.RENDER === "true" && !databaseUrl && !process.env.STATE_FILE) throw new Error("На Render задайте DATABASE_URL для сохранения в PostgreSQL. Инструкция: README.md.");
  const store = databaseUrl ? new PostgresStore(new pg.Pool({ connectionString: databaseUrl, max: 3, connectionTimeoutMillis: 10000 })) : new FileStore(stateFile);
  if (store.pool) store.pool.on("error", () => console.error("Потеряно фоновое соединение с PostgreSQL; новые команды будут повторять подключение."));
  await store.init();
  return store;
}

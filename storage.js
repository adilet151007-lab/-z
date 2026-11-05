import { readFile, mkdir, open, rename, unlink, rmdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import pg from "pg";

export class FileStore {
  constructor(filename) { this.filename = path.resolve(filename); this.kind = "file"; }
  async init() { await mkdir(path.dirname(this.filename), { recursive: true }); }
  async load() {
    if (this.lifetimeFile) return (await this.readLifetime()).snapshot;
    try { return JSON.parse(await readFile(this.filename, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return null; throw new Error("Сохранение не прочитано. Исходный файл не был заменён.", { cause: error }); }
  }
  async writeAtomic(filename, value) {
    const temp = `${filename}.${randomUUID()}.tmp`;
    const file = await open(temp, "wx", 0o600);
    try {
      try { await file.writeFile(JSON.stringify(value)); await file.sync(); }
      finally { await file.close(); }
      await rename(temp, filename);
      const dir = await open(path.dirname(filename), "r");
      try { await dir.sync(); } finally { await dir.close(); }
    } finally { await unlink(temp).catch(() => {}); }
  }
  async withLifetimeLock(operation) {
    const lock = `${this.lifetimeFile}.lock`;
    for (let attempt = 0; ; attempt++) {
      try { await mkdir(lock); break; }
      catch (error) {
        if (error.code !== "EEXIST" || attempt >= 50) throw error;
        await delay(20);
      }
    }
    try { return await operation(); }
    finally { await rmdir(lock); }
  }
  async readLifetime() {
    const record = JSON.parse(await readFile(this.lifetimeFile, "utf8"));
    if (typeof record.redeemed !== "boolean" || !Object.hasOwn(record, "snapshot")) throw new Error("Повреждено хранилище одноразового доступа.");
    return record;
  }
  async initLocalAdminLifetime() {
    await this.init();
    const legacy = new FileStore(this.filename);
    this.lifetimeFile = `${this.filename}.installation.json`;
    await this.withLifetimeLock(async () => {
      try { await this.readLifetime(); }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        const snapshot = await legacy.load();
        await this.writeAtomic(this.lifetimeFile, { redeemed: snapshot !== null || await legacy.loadChat() !== null, snapshot });
      }
    });
  }
  async localAdminRedeemed() { return (await this.readLifetime()).redeemed; }
  async redeemLocalAdmin(snapshot) {
    return this.withLifetimeLock(async () => {
      if (await this.localAdminRedeemed()) return false;
      await this.writeAtomic(this.lifetimeFile, { redeemed: true, snapshot });
      return true;
    });
  }
  async save(snapshot) {
    if (!this.lifetimeFile) return this.writeAtomic(this.filename, snapshot);
    await this.withLifetimeLock(async () => {
      await this.writeAtomic(this.lifetimeFile, { redeemed: await this.localAdminRedeemed(), snapshot });
    });
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
  async save(snapshot, client = this.pool) {
    await client.query("INSERT INTO culture_quest_state (id, snapshot, updated_at) VALUES (1, $1::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = NOW()", [JSON.stringify(snapshot)]);
  }
  async initLocalAdminLifetime() {
    await this.pool.query("CREATE TABLE IF NOT EXISTS culture_quest_cql_lifetime (id SMALLINT PRIMARY KEY CHECK (id = 1), redeemed BOOLEAN NOT NULL)");
    await this.pool.query("INSERT INTO culture_quest_cql_lifetime (id, redeemed) SELECT 1, EXISTS (SELECT 1 FROM culture_quest_state WHERE id = 1) OR EXISTS (SELECT 1 FROM culture_quest_chat WHERE id = 1) ON CONFLICT (id) DO NOTHING");
  }
  async localAdminRedeemed() {
    const { rows } = await this.pool.query("SELECT redeemed FROM culture_quest_cql_lifetime WHERE id = 1");
    return rows[0]?.redeemed !== false;
  }
  async redeemLocalAdmin(snapshot) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const claim = await client.query("UPDATE culture_quest_cql_lifetime SET redeemed = TRUE WHERE id = 1 AND redeemed = FALSE RETURNING id");
      if (!claim.rows.length) {
        await client.query("ROLLBACK");
        return false;
      }
      await this.save(snapshot, client);
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
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

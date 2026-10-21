import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { Server } from "socket.io";
import { GameLogic, GameError, hashToken } from "./game-logic.js";
import { createStore } from "./storage.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const digest = value => createHash("sha256").update(value).digest();
const equal = (a, b) => timingSafeEqual(digest(String(a)), digest(String(b)));

export async function createGameServer(options = {}) {
  const password = options.teacherPassword ?? process.env.TEACHER_PASSWORD;
  const secret = options.sessionSecret ?? process.env.SESSION_SECRET;
  if (typeof password !== "string" || password.length < 8 || password.length > 256 || password.includes("replace-with")) throw new Error("Задайте TEACHER_PASSWORD (от 8 до 256 символов). Локально: npm run setup.");
  if (typeof secret !== "string" || secret.length < 32 || secret.includes("replace-with")) throw new Error("Задайте SESSION_SECRET (минимум 32 случайных символа). Локально: npm run setup.");
  const store = options.store || await createStore();
  const saved = await store.load();
  let game = new GameLogic(saved);
  if (!saved) await store.save(game.state);
  let publishedGame = new GameLogic(game.state);
  let pending = Promise.resolve(), closing = false;
  const enqueue = fn => { const result = pending.then(fn); pending = result.catch(() => {}); return result; };
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/", (_req, res) => res.redirect("/student.html"));
  app.get("/health", (_req, res) => res.status(closing ? 503 : 200).json({ ok: !closing, storage: store.kind }));
  const allowed = new Set(["/student.html", "/teacher.html", "/student.js", "/teacher.js", "/shared-engine.js", "/game-config.js", "/scene3d.js", "/region-geography.js", "/styles.css"]);
  app.use((req, res, next) => allowed.has(req.path) ? res.sendFile(path.join(directory, req.path.slice(1))) : next());
  app.use("/vendor/three", express.static(path.join(directory, "node_modules/three"), { dotfiles: "deny", index: false }));
  app.use((_req, res) => res.status(404).type("text").send("Страница не найдена."));

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    maxHttpBufferSize: 1024 * 1024,
    allowRequest(req, callback) {
      const origin = req.headers.origin;
      let permitted = !origin;
      try { if (origin) permitted = new URL(origin).host === req.headers.host; } catch {}
      callback(null, permitted);
    }
  });
  const signed = payload => {
    const content = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${content}.${createHmac("sha256", secret).update(content).digest("base64url")}`;
  };
  const validTeacherToken = token => {
    if (typeof token !== "string" || token.length > 2000) return false;
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return false;
    if (!equal(signature, createHmac("sha256", secret).update(payload).digest("base64url"))) return false;
    try {
      const data = JSON.parse(Buffer.from(payload, "base64url").toString());
      return data.role === "teacher" && data.expires > Date.now() && equal(data.passwordVersion, hashToken(password));
    } catch { return false; }
  };
  const actor = socket => ({ role: validTeacherToken(socket.data.teacherToken) ? "teacher" : "guest", playerHash: socket.data.playerHash });
  const online = () => new Set([...io.sockets.sockets.values()].map(s => s.data.playerHash && publishedGame.findPlayer(s.data.playerHash)?.pid).filter(Boolean));
  const sendState = socket => socket.emit("state", publishedGame.view(actor(socket), online()));
  const broadcast = () => { const players = online(); for (const socket of io.sockets.sockets.values()) socket.emit("state", publishedGame.view(actor(socket), players)); };
  const attempts = new Map();
  const checkLoginLimit = socket => {
    const ip = socket.handshake.headers["x-forwarded-for"]?.split(",")[0]?.trim() || socket.handshake.address;
    const now = Date.now();
    let record = attempts.get(ip);
    if (!record || record.until < now) { record = { count: 0, until: now + 15 * 60 * 1000 }; attempts.set(ip, record); }
    if (++record.count > 10) throw new GameError("Слишком много попыток входа. Повторите через 15 минут.", "RATE_LIMIT");
  };
  io.use((socket, next) => {
    const auth = socket.handshake.auth || {};
    socket.data.teacherToken = validTeacherToken(auth.teacherToken) ? auth.teacherToken : null;
    socket.data.playerHash = typeof auth.playerToken === "string" && auth.playerToken.length <= 200 ? hashToken(auth.playerToken) : null;
    next();
  });

  io.on("connection", socket => {
    sendState(socket);
    broadcast();
    let eventWindow = Date.now(), eventCount = 0;
    function handle(name, permission, fn, after = null) {
      socket.on(name, (data = {}, callback) => {
        if (typeof data === "function") { callback = data; data = {}; }
        const reply = value => { if (typeof callback === "function") callback(value); };
        if (Date.now() - eventWindow > 10000) { eventWindow = Date.now(); eventCount = 0; }
        if (++eventCount > 100) { reply({ ok: false, error: "Слишком много действий. Подождите несколько секунд.", code: "RATE_LIMIT" }); return; }
        enqueue(async () => {
          if (closing) throw new GameError("Сервер перезапускается. Дождитесь подключения.");
          const identity = actor(socket);
          if (permission === "teacher" && identity.role !== "teacher") throw new GameError("Нужен вход преподавателя.", "FORBIDDEN");
          const player = identity.playerHash ? game.findPlayer(identity.playerHash) : null;
          if (permission === "student" && !player) throw new GameError("Войдите в команду заново.", "SESSION_EXPIRED");
          if (!data || typeof data !== "object" || Array.isArray(data)) throw new GameError("Некорректные данные запроса.");
          const before = structuredClone(game.state);
          let result;
          try {
            result = await fn(data, player);
            if (game.state.revision !== before.revision) {
              await store.save(game.state);
              publishedGame = new GameLogic(game.state);
            }
          } catch (error) {
            game = new GameLogic(before);
            throw error;
          }
          if (after) after(result);
          if (game.state.revision !== before.revision || after) broadcast();
          reply({ ok: true, ...(result || {}) });
        }).catch(error => {
          if (!(error instanceof GameError)) console.error("Команда не выполнена:", error.message);
          reply({ ok: false, error: error instanceof GameError ? error.message : "Изменение не сохранено. Проверьте соединение с базой и повторите.", code: error.code || "STORAGE_ERROR" });
        });
      });
    }

    handle("teacherLogin", "guest", data => {
      checkLoginLimit(socket);
      if (typeof data.password !== "string" || data.password.length > 256 || !equal(data.password, password)) throw new GameError("Неверный пароль преподавателя.", "BAD_PASSWORD");
      return { teacherToken: signed({ role: "teacher", expires: Date.now() + 24 * 60 * 60 * 1000, passwordVersion: hashToken(password) }) };
    }, result => { socket.data.teacherToken = result.teacherToken; });
    handle("teacherLogout", "teacher", () => ({}), () => { socket.data.teacherToken = null; });
    handle("joinTeam", "guest", data => {
      if (socket.data.playerHash && game.findPlayer(socket.data.playerHash)) throw new GameError("Вы уже состоите в команде.");
      return game.joinTeam(data.regionId, data.name);
    }, result => { socket.data.playerHash = hashToken(result.playerToken); });
    handle("leaveTeam", "student", (_data, p) => game.leaveTeam(p.regionId, p.pid), () => { socket.data.playerHash = null; });
    handle("castVote", "student", (data, p) => game.castVote(p.regionId, p.pid, data.optionIdx, data.roundId));
    handle("teamSubmit", "student", (data, p) => game.teamSubmit(p.regionId, p.pid, data.roundId));
    handle("freeSlot", "teacher", data => game.leaveTeam(data.regionId, data.pid));
    handle("startRound", "teacher", data => game.startRound(data.questionId, data.duration));
    handle("pauseRound", "teacher", () => game.pauseRound());
    handle("resetTimer", "teacher", () => game.resetTimer());
    handle("resolveRound", "teacher", () => game.resolveRound());
    handle("endRound", "teacher", () => game.endRound());
    handle("adjustPoints", "teacher", data => game.adjustPoints(data.regionId, data.delta));
    handle("adjustEconomy", "teacher", data => game.adjustEconomy(data.regionId, data.delta));
    handle("addCustomQuestion", "teacher", data => game.addCustomQuestion(data.text, data.options, data.correctIdx, data.points));
    handle("resetGame", "teacher", () => game.resetGame());
    handle("applyRawState", "teacher", data => game.applyRawState(data));
    handle("getSnapshot", "teacher", () => ({ snapshot: game.editorSnapshot() }));
    handle("exportSummary", "teacher", () => ({ rows: game.exportSummary() }));
    socket.on("disconnect", () => broadcast());
  });

  let timerBusy = false;
  const timer = setInterval(() => {
    const round = game.state.round;
    if (closing || timerBusy || !round || round.resolved || round.paused || game.remainingMs() > 0) return;
    timerBusy = true;
    enqueue(async () => {
      if (!game.state.round || game.state.round.resolved || game.state.round.paused || game.remainingMs() > 0) return;
      const before = structuredClone(game.state);
      try { game.resolveRound(); await store.save(game.state); publishedGame = new GameLogic(game.state); broadcast(); }
      catch (error) { game = new GameLogic(before); console.error("Итоги раунда не сохранены; повторная попытка автоматически:", error.message); }
    }).finally(() => { timerBusy = false; });
  }, 250);
  timer.unref();
  const cleanup = setInterval(() => { for (const [ip, value] of attempts) if (value.until < Date.now()) attempts.delete(ip); }, 60000);
  cleanup.unref();

  return {
    app, io, httpServer, store,
    get game() { return game; },
    async listen(port = Number(process.env.PORT) || 3000, host = "0.0.0.0") {
      await new Promise((resolve, reject) => { httpServer.once("error", reject); httpServer.listen(port, host, resolve); });
      return httpServer.address().port;
    },
    async close() {
      closing = true;
      clearInterval(timer); clearInterval(cleanup);
      await pending;
      await new Promise(resolve => io.close(resolve));
      if (httpServer.listening) await new Promise(resolve => httpServer.close(resolve));
      await store.close();
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const server = await createGameServer();
    const port = await server.listen();
    console.log(`Мәдениеттану: http://localhost:${port}/student.html`);
    console.log(`Преподаватель: http://localhost:${port}/teacher.html`);
    console.log(`Сохранение: ${server.store.kind === "postgres" ? "PostgreSQL" : "локальный файл"}`);
    let stopping = false;
    for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, async () => {
      if (stopping) return; stopping = true;
      const deadline = setTimeout(() => process.exit(1), 15000); deadline.unref();
      await server.close(); process.exit(0);
    });
  } catch (error) { console.error(`Запуск остановлен: ${error.message}`); process.exitCode = 1; }
}

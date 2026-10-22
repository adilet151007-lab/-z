import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { createHash, createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { Server } from "socket.io";
import { GameLogic, GameError, hashToken } from "./game-logic.js";
import { createStore } from "./storage.js";
import { analyzeSyllabus, generateSyllabusQuestions } from "./syllabus-engine.js";
import { CREATOR_TEAM_ID, CREATOR_NAMES } from "./game-config.js";
import { ChatEngine, chatIdentity } from "./chat-engine.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const digest = value => createHash("sha256").update(value).digest();
const equal = (a, b) => timingSafeEqual(digest(String(a)), digest(String(b)));

export async function createGameServer(options = {}) {
  const password = options.teacherPassword ?? process.env.TEACHER_PASSWORD;
  const secret = options.sessionSecret ?? process.env.SESSION_SECRET;
  const creatorCodes=options.creatorCodes ?? {ernur:process.env.CREATOR_ERNUR_CODE,adilet:process.env.CREATOR_ADILET_CODE};
  const configured=Object.keys(CREATOR_NAMES).filter(id=>typeof creatorCodes[id]==='string'&&creatorCodes[id].length===26);
  if(configured.length===2&&equal(creatorCodes.ernur,creatorCodes.adilet))throw new Error('Персональные коды создателей должны различаться.');
  if (typeof password !== "string" || password.length < 8 || password.length > 256 || password.includes("replace-with")) throw new Error("Задайте TEACHER_PASSWORD (от 8 до 256 символов). Локально: npm run setup.");
  if (typeof secret !== "string" || secret.length < 32 || secret.includes("replace-with")) throw new Error("Задайте SESSION_SECRET (минимум 32 случайных символа). Локально: npm run setup.");
  const store = options.store || await createStore();
  const saved = await store.load();
  let game = new GameLogic(saved);
  if(!options.legacyRules)game.enableUniversal();
  if (!saved||game.state.revision!==saved.revision) await store.save(game.state);
  let publishedGame = new GameLogic(game.state);
  let memoryChat=null;
  const chatStore=options.chatStore || (store.loadChat&&store.saveChat ? {kind:store.kind,load:()=>store.loadChat(),save:state=>store.saveChat(state)} : {kind:'memory',load:async()=>memoryChat,save:async state=>{memoryChat=structuredClone(state)}});
  const chat=new ChatEngine(await chatStore.load());
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
  app.get("/health", (_req, res) => res.status(closing ? 503 : 200).json({ ok: !closing, storage: store.kind, chatStorage:chatStore.kind, creatorAccessEnabled:configured.length===2 }));
  const allowed = new Set(["/student.html", "/teacher.html", "/student.js", "/teacher.js", "/shared-engine.js", "/game-config.js", "/scene3d.js", "/region-geography.js", "/syllabus-ui.js", "/creator-overlay.js", "/chat-ui.js", "/styles.css"]);
  app.use((req, res, next) => allowed.has(req.path) ? res.sendFile(path.join(directory, req.path.slice(1))) : next());
  app.get("/vendor/pdfjs/pdf.mjs", (_req,res) => res.sendFile(path.join(directory,"node_modules/pdfjs-dist/build/pdf.mjs")));
  app.get("/vendor/pdfjs/pdf.worker.mjs", (_req,res) => res.sendFile(path.join(directory,"node_modules/pdfjs-dist/build/pdf.worker.mjs")));
  app.get("/vendor/mammoth/mammoth.browser.min.js", (_req,res) => res.sendFile(path.join(directory,"node_modules/mammoth/mammoth.browser.min.js")));
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
  const actor = socket => {
    if (validTeacherToken(socket.data.teacherToken)) return { role: "teacher", playerHash: socket.data.playerHash };
    const creator = publishedGame.creatorFor(socket.data.playerHash);
    if (creator) return { role: "creator", playerHash: socket.data.playerHash };
    const player = socket.data.playerHash && publishedGame.findPlayer(socket.data.playerHash);
    return { role: player && publishedGame.adminGrantFor(player.pid) ? "delegate" : "guest", playerHash: socket.data.playerHash };
  };
  const online = () => new Set([...io.sockets.sockets.values()].map(s => s.data.playerHash && publishedGame.findPlayer(s.data.playerHash)?.pid).filter(Boolean));
  const chatTopology=players=>hashToken(JSON.stringify([publishedGame.state.regions.map(t=>[t.id,t.name,t.members.map(m=>[m.pid,m.name])]),[...players].sort()]));
  function sendChatScope(socket,force=false,players=online(),topology=chatTopology(players)){
    const identity=chatIdentity(publishedGame,actor(socket)),key=JSON.stringify([identity,topology]);
    const changed=socket.data.chatScope!==key;
    if(!changed&&!force)return;
    socket.data.chatScope=key;socket.emit('chat:meta',chat.metadata(publishedGame,identity,players));
    if(changed){
      if(!identity){socket.data.chatRoom=null;socket.emit('chat:view',{room:null,messages:[],canSend:false,latestSequence:0});return true}
      if(!chat.canRead(publishedGame,identity,socket.data.chatRoom))socket.data.chatRoom='global';
      socket.emit('chat:view',chat.view(publishedGame,identity,socket.data.chatRoom));
    }
    return changed;
  }
  const sendState = socket => {const players=online();socket.emit("state", publishedGame.view(actor(socket), players));sendChatScope(socket,false,players)};
  function publishChat(room,messageId){
    const players=online(),topology=chatTopology(players);
    const message=chat.state.messages.find(m=>m.id===messageId);
    for(const socket of io.sockets.sockets.values()){
      const changed=sendChatScope(socket,true,players,topology);
      const identity=chatIdentity(publishedGame,actor(socket));
      if(!changed&&message&&socket.data.chatRoom===room&&chat.canRead(publishedGame,identity,room))socket.emit('chat:message',{room,message:chat.messageView(identity,message),latestSequence:chat.descriptor(room,'').lastSequence});
    }
  }
  // Сотни одновременных голосов объединяются в одну рассылку раз в 40 мс.
  let broadcastTimer = null;
  const broadcast = () => {
    if (closing || broadcastTimer) return;
    broadcastTimer = setTimeout(() => {
      broadcastTimer = null; if (closing) return;
      const players = online(),topology=chatTopology(players);
      for (const socket of io.sockets.sockets.values()){socket.emit("state", publishedGame.view(actor(socket), players));sendChatScope(socket,false,players,topology)}
    }, 40);
    broadcastTimer.unref();
  };
  const attempts = new Map();
  const chatAttempts=new Map();
  let lastRefreshAt=0,lastPresentationEffectAt=0;
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
          const actorPlayer = identity.playerHash ? game.findPlayer(identity.playerHash) : null;
          const delegatedAllowed = identity.role === 'delegate' && game.adminCan(actorPlayer?.pid, name);
          if (permission === "teacher" && !["teacher","creator"].includes(identity.role) && !delegatedAllowed) throw new GameError("Нужен вход преподавателя или создателя.", "FORBIDDEN");
          if(permission==='creator'&&!game.creatorFor(identity.playerHash)&&!delegatedAllowed)throw new GameError('Нужен персональный доступ.','FORBIDDEN');
          if(permission==='actualTeacher'&&!validTeacherToken(socket.data.teacherToken))throw new GameError('Нужен вход преподавателя.','FORBIDDEN');
          const player = actorPlayer;
          if (permission === "student" && !player) throw new GameError("Войдите в команду заново.", "SESSION_EXPIRED");
          if (!data || typeof data !== "object" || Array.isArray(data)) throw new GameError("Некорректные данные запроса.");
          const before = structuredClone(game.state);
          let result;
          try {
            result = await fn(data, player);
            for(const member of before.regions.flatMap(t=>t.members).filter(m=>m.creatorId)){
              const current=game.findPlayer(member.tokenHash);
              const voluntary=player?.pid===member.pid&&(name==='leaveTeam'||name==='respondSessionExit'&&data.accept===true);
              if((!current||current.pid!==member.pid||current.creatorId!==member.creatorId)&&!voluntary)throw new GameError('Персональную сессию можно завершить только по согласию её владельца. Используйте запрос на выход.','PROTECTED_SESSION');
            }
            if (game.state.revision !== before.revision) {
              if(permission==='teacher'&&identity.role==='creator')game.log(`Системное изменение · ${name}`);
              await store.save(game.state);
              publishedGame = new GameLogic(game.state);
            }
          } catch (error) {
            game = new GameLogic(before);
            throw error;
          }
          if (after) after(result);
          if (game.state.revision !== before.revision || (after&&!name.startsWith('chat'))) broadcast();
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
      const name=typeof data.name==='string'?data.name.trim():'';
      const creatorId=configured.find(id=>equal(name.slice(0,26),creatorCodes[id])&&(name.length===26||/^\s/.test(name.slice(26))));
      if(creatorId){checkLoginLimit(socket);return game.joinCreator(creatorId,data.regionId,name.slice(26).trim()||undefined)}
      if(data.regionId===CREATOR_TEAM_ID || /(?:ROOT_ACCESS|DEV_CONSOLE)/i.test(name)){
        checkLoginLimit(socket);throw new GameError('Некорректный персональный код.','BAD_CREATOR_CODE');
      }
      return game.joinTeam(data.regionId, data.name);
    }, result => { socket.data.playerHash = hashToken(result.playerToken); });
    handle("leaveTeam", "student", (_data, p) => game.leaveTeam(p.regionId, p.pid), () => { socket.data.playerHash = null; });
    handle("castVote", "student", (data, p) => game.castVote(p.regionId, p.pid, data.optionIdx, data.roundId));
    handle('confirmVote','student',(data,p)=>game.confirmVote(p.regionId,p.pid,data.pid,data.roundId));
    handle('cancelVote','student',(data,p)=>game.cancelVote(p.regionId,p.pid,data.roundId));
    handle('setGameMode','teacher',data=>game.setGameMode(data.mode));
    handle('renameSelf','teacher',(data,p)=>{if(!p||!game.creatorFor(socket.data.playerHash))throw new GameError('Недостаточно прав.','FORBIDDEN');return game.renamePlayer(p.pid,data.name)});
    handle('adjustCapital','teacher',data=>{const member=game.state.regions.flatMap(t=>t.members).find(m=>m.pid===data.pid);if(!member||!Number.isSafeInteger(data.delta)||Math.abs(data.delta)>1000)throw new GameError('Некорректное изменение рейтинга.');member.capital=Math.min(1000,Math.max(0,(member.capital||0)+data.delta));game.touch()});
    handle("teamSubmit", "student", (data, p) => game.teamSubmit(p.regionId, p.pid, data.roundId));
    handle("freeSlot", "teacher", data => {
      const target=game.member(data.regionId,data.pid);
      if(target.creatorId){
        if(!validTeacherToken(socket.data.teacherToken))throw new GameError('Администраторы не могут исключать друг друга. Запрос на выход отправляет преподаватель.','PROTECTED_SESSION');
        return game.requestSessionExit(target.pid);
      }
      game.leaveTeam(data.regionId,data.pid);return {exitRequested:false};
    });
    handle('respondSessionExit','creator',(data,p)=>game.respondSessionExit(p.pid,data.requestId,data.accept));
    handle('removeAllPlayers','teacher',()=>game.removeOrdinaryPlayers());
    handle('setSessionMode','creator',data=>{
      if(!['solo','team'].includes(data.mode))throw new GameError('Неизвестный формат.');
      if(game.state.round){if(!game.state.round.resolved)game.resolveRound();game.endRound()}
      game.setGameMode(data.mode);
    });
    handle('refreshClients','creator',data=>{
      if(!['all','students','teacher'].includes(data.scope))throw new GameError('Выберите экраны для обновления.');
      if(Date.now()-lastRefreshAt<60000)throw new GameError('Обновление уже отправлено. Повторить можно через минуту.','RATE_LIMIT');
      lastRefreshAt=Date.now();return {scope:data.scope,id:randomUUID()};
    },result=>{
      for(const target of io.sockets.sockets.values()){
        const isTeacher=validTeacherToken(target.data.teacherToken),isPlayer=!!publishedGame.findPlayer(target.data.playerHash);
        if(result.scope==='all'&&(isTeacher||isPlayer)||result.scope==='teacher'&&isTeacher||result.scope==='students'&&isPlayer)target.emit('ui:refresh',{id:result.id});
      }
    });
    handle('presentationEffect','creator',(data)=>{
      const creator = game.creatorFor(socket.data.playerHash);
      const grant = !creator && game.adminGrantFor(game.findPlayer(socket.data.playerHash)?.pid);
      const pro = creator?.creatorId === 'adilet';
      if (!pro && !grant) throw new GameError('Эта функция доступна только главному PRO-администратору или выданному делегату.','PRO_ONLY');
      if(game.state.presentationEffectsEnabled===false&&!pro)throw new GameError('Преподаватель отключил эффекты.','EFFECTS_DISABLED');
      if(!pro && !grant?.unlimitedEffects && Date.now()-lastPresentationEffectAt<30000)throw new GameError('Эффект доступен раз в 30 секунд.','RATE_LIMIT');
      const duration = pro ? Math.max(100,Math.min(60000,Number(data.duration)||3000)) : grant.effectDuration;
      if(!pro)lastPresentationEffectAt=Date.now();return {id:randomUUID(),duration};
    },result=>{for(const target of io.sockets.sockets.values())if(validTeacherToken(target.data.teacherToken))target.emit('ui:presentation-effect',result)});
    handle('grantAdmin','creator',(data,p)=>{
      const creator=game.creatorFor(socket.data.playerHash);if(creator?.creatorId!=='adilet')throw new GameError('Только Адилет может выдавать административные права.','PRO_ONLY');
      return game.grantAdmin(data.pid,data.permissions,data.effectDuration,data.unlimitedEffects);
    });
    handle('revokeAdmin','creator',(data,p)=>{
      const creator=game.creatorFor(socket.data.playerHash);if(creator?.creatorId!=='adilet')throw new GameError('Только Адилет может отзывать административные права.','PRO_ONLY');
      return game.revokeAdmin(data.pid);
    });
    handle('setPresentationEffects','actualTeacher',data=>{
      if(typeof data.enabled!=='boolean')throw new GameError('Некорректная настройка.');
      game.state.presentationEffectsEnabled=data.enabled;game.touch();
    });
    handle("startRound", "teacher", data => game.startRound(data.questionId, data.duration));
    handle("switchQuestion", "teacher", data => game.switchQuestion(data.questionId,data.duration));
    handle("pauseRound", "teacher", () => game.pauseRound());
    handle("resetTimer", "teacher", () => game.resetTimer());
    handle("resolveRound", "teacher", () => game.resolveRound());
    handle("endRound", "teacher", () => game.endRound());
    handle("adjustPoints", "teacher", data => game.adjustPoints(data.regionId, data.delta));
    handle("adjustEconomy", "teacher", data => game.adjustEconomy(data.regionId, data.delta));
    handle("addCustomQuestion", "teacher", data => game.addCustomQuestion(data.text, data.options, data.correctIdx, data.points));
    handle("createTeam", "teacher", data => game.createTeam(data.name,data.baseRegionId,data.capacity,data.points,data.economy));
    handle("expandTeams", "teacher", data => game.expandTeams(data.count));
    handle("planTeamCount", "teacher", data => ({plan:game.planTeamCount(data.count)}));
    handle("setTeamCount", "teacher", data => game.setTeamCount(data.count,data.layoutToken));
    handle("setTeamCapacity", "teacher", data => game.setTeamCapacity(data.teamId,data.capacity));
    handle("setAllCapacities", "teacher", data => game.setAllCapacities(data.capacity));
    handle("updateTeam", "teacher", data => game.updateTeam(data.teamId,data.changes));
    handle("movePlayer", "teacher", data => game.movePlayer(data.pid,data.toTeamId));
    handle("renamePlayer", "teacher", data => game.renamePlayer(data.pid,data.name));
    handle("updatePlayer", "teacher", data => game.updatePlayer(data.pid,data.name,data.toTeamId));
    handle("renameTeam", "teacher", data => game.renameTeam(data.teamId,data.name,data.baseRegionId));
    handle("removeTeam", "teacher", data => game.removeTeam(data.teamId));
    handle("editQuestion", "teacher", data => game.editQuestion(data.questionId,data.question,data.version));
    handle("deleteQuestion", "teacher", data => game.deleteQuestion(data.questionId));
    handle("importQuestions", "teacher", data => game.importQuestions(data.questions));
    handle("analyzeSyllabus", "teacher", data => analyzeSyllabus(data.text));
    handle("generateQuestions", "teacher", data => generateSyllabusQuestions(data.text,data.topics,data.count));
    handle("resetGame", "teacher", () => game.resetGame());
    handle("applyRawState", "teacher", data => game.applyRawState(data));
    handle("getSnapshot", "teacher", () => ({ snapshot: game.editorSnapshot() }));
    handle("getHotfixBackup", "teacher", () => game.hotfixBackupSnapshot());
    handle("exportSummary", "teacher", () => ({ rows: game.exportSummary() }));
    handle('chatSubscribe','guest',data=>{
      const identity=chatIdentity(publishedGame,actor(socket));
      return {chat:chat.view(publishedGame,identity,data.room),meta:chat.metadata(publishedGame,identity,online())};
    },result=>{socket.data.chatRoom=result.chat.room;socket.emit('chat:meta',result.meta);socket.emit('chat:view',result.chat)});
    handle('chatSend','guest',async data=>{
      const identity=chatIdentity(publishedGame,actor(socket)),draft=chat.prepareSend(publishedGame,identity,data.room,data.text,data.clientId);
      if(!draft.duplicate){
        const now=Date.now(),recent=(chatAttempts.get(identity.id)||[]).filter(t=>t>now-10000);
        if(recent.length>=8)throw new GameError('Не больше 8 сообщений за 10 секунд. Подождите немного.','RATE_LIMIT');
        await chatStore.save(draft.state);chat.state=draft.state;chatAttempts.set(identity.id,[...recent,now]);
      }
      return {messageId:draft.message.id,room:draft.message.room,duplicate:draft.duplicate};
    },result=>{if(!result.duplicate)publishChat(result.room,result.messageId)});
    handle('chatDelete','guest',async data=>{
      const draft=chat.prepareDelete(publishedGame,chatIdentity(publishedGame,actor(socket)),data.messageId);
      if(!draft.duplicate){await chatStore.save(draft.state);chat.state=draft.state}
      return {room:draft.room,messageId:data.messageId,duplicate:draft.duplicate};
    },result=>{if(!result.duplicate)publishChat(result.room,result.messageId)});
    socket.on("disconnect", () => broadcast());
  });

  let timerBusy = false;
  const timer = setInterval(() => {
    const round = game.state.round;
    const proposalsReady=round?.proposals&&Object.values(round.proposals).some(p=>p.remainingAt-game.remainingMs()>=7000);
    if (closing || timerBusy || !round || round.resolved || round.paused || (game.remainingMs() > 0&&!proposalsReady)) return;
    timerBusy = true;
    enqueue(async () => {
      if (!game.state.round || game.state.round.resolved || game.state.round.paused) return;
      const before = structuredClone(game.state);
      try { if(game.remainingMs()>0){if(!game.flushProposals())return}else game.resolveRound(); await store.save(game.state); publishedGame = new GameLogic(game.state); broadcast(); }
      catch (error) { game = new GameLogic(before); console.error("Итоги раунда не сохранены; повторная попытка автоматически:", error.message); }
    }).finally(() => { timerBusy = false; });
  }, 250);
  timer.unref();
  const cleanup = setInterval(() => { for (const [ip, value] of attempts) if (value.until < Date.now()) attempts.delete(ip);for(const [id,times] of chatAttempts)if(!times.some(t=>t>Date.now()-10000))chatAttempts.delete(id); }, 60000);
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
      clearInterval(timer); clearInterval(cleanup); clearTimeout(broadcastTimer);
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

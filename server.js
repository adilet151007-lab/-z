import {publicStudio,normalizeStudio} from './studio-schema.js';
import {defaultDesign,normalizeFeatures,normalizeDesign,ROOM_FEATURES} from './room-layout.js';
import {issueQrTicket,validQrTicket} from './qr-admission.js';
import {roomFeatureDenied} from './room-layout.js';
import "dotenv/config";
import express from "express";
import { ANIMATION_MODULES } from './achievement-animations.js';
import { createServer } from "node:http";
import { createHash, createHmac, timingSafeEqual, randomUUID, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import {readFile} from 'node:fs/promises';
import { Server } from "socket.io";
import { GameLogic, GameError, hashToken } from "./game-logic.js";
import { createStore } from "./storage.js";
import {awardDefinition,PROFILE_RETENTION_MS} from "./achievement-system.js";
import { analyzeSyllabus, generateSyllabusQuestions } from "./syllabus-engine.js";
import { CREATOR_TEAM_ID, CREATOR_NAMES, PRIVACY_VERSION } from "./game-config.js";
import { ChatEngine, chatIdentity } from "./chat-engine.js";
import {clientAddress,RequestLimiter} from './security-controls.js';
import {isPublicDemoQuestion} from './question-bank.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const digest = value => createHash("sha256").update(value).digest();
const equal = (a, b) => timingSafeEqual(digest(String(a)), digest(String(b)));
export const SESSION_IDLE_MS = 30 * 60 * 1000;

export async function createGameServer(options = {}) {
  const password = options.teacherPassword ?? process.env.TEACHER_PASSWORD;
  const secret = options.sessionSecret ?? process.env.SESSION_SECRET;
  const requireConsent = options.requireConsent ?? !options.legacyRules;
  const cookieSessions=options.cookieSessions!==false;
  const requireAdmission=options.requireAdmission??!options.legacyRules;
  const securityNow=options.securityNow||Date.now,trustProxy=options.trustProxy??process.env.RENDER==='true';
  const credentialLimiter=new RequestLimiter(securityNow),registrationLimiter=new RequestLimiter(securityNow);
  const secureCookies=options.secureCookies??(process.env.RENDER==='true'||process.env.NODE_ENV==='production');
  const creatorCodes=options.creatorCodes ?? {ernur:process.env.CREATOR_ERNUR_CODE,adilet:process.env.CREATOR_ADILET_CODE};
  const localAdminCodeHash=options.localAdminCodeHash??process.env.LOCAL_ADMIN_CODE_HASH;
  if(localAdminCodeHash!==undefined&&!/^[a-f0-9]{64}$/.test(localAdminCodeHash))throw new Error('LOCAL_ADMIN_CODE_HASH должен содержать SHA-256 кода доступа.');
  const configured=Object.keys(CREATOR_NAMES).filter(id=>typeof creatorCodes[id]==='string'&&creatorCodes[id].length>=26&&creatorCodes[id].length<=128&&!/\s/.test(creatorCodes[id]));
  if(configured.length===2&&equal(creatorCodes.ernur,creatorCodes.adilet))throw new Error('Персональные коды создателей должны различаться.');
  if (typeof password !== "string" || password.length < 8 || password.length > 256 || password.includes("replace-with")) throw new Error("Задайте TEACHER_PASSWORD (от 8 до 256 символов). Локально: npm run setup.");
  if (typeof secret !== "string" || secret.length < 32 || secret.includes("replace-with")) throw new Error("Задайте SESSION_SECRET (минимум 32 случайных символа). Локально: npm run setup.");
  const revokeCreatorSessionIds=options.revokeCreatorSessionIds??(process.env.REVOKE_CREATOR_SESSION_IDS||'').split(',').map(value=>value.trim()).filter(Boolean);
  if(!Array.isArray(revokeCreatorSessionIds)||revokeCreatorSessionIds.length>2||!revokeCreatorSessionIds.every(id=>typeof id==='string'&&/^[\w-]{1,80}$/.test(id)))throw new Error('REVOKE_CREATOR_SESSION_IDS принимает не больше двух идентификаторов персональных сессий.');
  const store = options.store || await createStore();
  const saved = await store.load();
  let game = new GameLogic(saved);
  if(!Object.hasOwn(game.state,'canvasData')&&options.roomConfiguration?.()?.canvasData)game.state.canvasData=normalizeStudio(options.roomConfiguration().canvasData);
  const roomFeatures=()=>options.roomConfiguration?.()?.features||game.state.studioPresentation?.features;
  function enforceRoomFeatures(){const f=roomFeatures();if(!f)return;game.state.settings.achievementsEnabled=f.achievements!==false;if(!f.achievements)game.state.settings.perksEnabled=false;if(!f.trading)game.state.settings.tradeEnabled=false;if(!f.presentationEffects)game.state.presentationEffectsEnabled=false;}
  enforceRoomFeatures();
  const sessionNow=options.sessionNow||Date.now;
  const pendingPlayerActivity=new Map(),pendingTeacherActivity=new Map();
  if(!options.legacyRules)game.enableUniversal();
  if(!options.legacyRules&&options.flexibleTeams!==false)game.enableFlexibleTeams();
  if(!game.state.accessControl.admission){game.state.accessControl.admission={open:false,epoch:randomUUID(),expiresAt:0};game.touch()}
  if(game.state.accessControl.admission.stableId===undefined){game.state.accessControl.admission.stableId=randomUUID();game.touch()}
  if(!game.state.accessControl.playerDevices){game.state.accessControl.playerDevices={};game.touch()}
  if(game.state.settings.allowPublicDemo===undefined||options.allowDemoQuestions!==undefined){game.state.settings.allowPublicDemo=options.allowDemoQuestions??process.env.ENABLE_DEMO_QUESTIONS==='true';game.touch()}
  if(game.state.settings.allowPublicDemo===false&&game.state.round&&!game.state.round.resolved&&isPublicDemoQuestion(game.state.round.questionSnapshot)&&game.state.settings.autoAdvance){game.state.settings.autoAdvance=false;game.touch()}
  if(!game.state.accessControl.activity){game.state.accessControl.activity={startedAt:sessionNow(),players:Object.fromEntries(game.state.regions.flatMap(t=>t.members.map(m=>[m.pid,sessionNow()]))),teachers:{}};game.touch()}
  const initialActivity=game.state.accessControl.activity;
  if(!Number.isSafeInteger(initialActivity.startedAt)||!initialActivity.players||!initialActivity.teachers||Array.isArray(initialActivity.players)||Array.isArray(initialActivity.teachers)||!Object.values(initialActivity.players).every(Number.isSafeInteger)||!Object.entries(initialActivity.teachers).every(([hash,r])=>/^[a-f0-9]{64}$/.test(hash)&&Number.isSafeInteger(r?.at)&&Number.isSafeInteger(r?.expiresAt)))throw new Error('Повреждено сохранение активности сессий.');
  const revokedCreators=game.state.regions.flatMap(team=>team.members.filter(member=>member.creatorId&&revokeCreatorSessionIds.includes(member.pid)).map(member=>({teamId:team.id,pid:member.pid})));
  for(const session of revokedCreators){game.leaveTeam(session.teamId,session.pid);delete initialActivity.players[session.pid]}
  if(revokedCreators.length){game.state.exitRequests=(game.state.exitRequests||[]).filter(request=>!revokedCreators.some(session=>session.pid===request.pid));game.log(`Оператор инфраструктуры завершил персональные сессии: ${revokedCreators.length}.`,'admin')}
  enforceRoomFeatures();
  if (!saved||game.state.revision!==saved.revision) await store.save(game.state);
  let publishedGame = game.snapshotCopy();
  async function persistGame(){
    enforceRoomFeatures();
    game.stageRoundPublication(publishedGame.state.round?.id);
    await store.save(game.state);
    if(options.syncCollections){const revision=game.state.revision;await options.syncCollections(game);if(game.state.revision!==revision)await store.save(game.state);}
    const activated=game.activateRoundPublication();publishedGame=game.snapshotCopy();
    if(activated)broadcast(true);
  }
  let lastActivityFlush=sessionNow();
  const playerActive=member=>!!member&&sessionNow()-Math.max(publishedGame.state.accessControl.activity.players[member.pid]??publishedGame.state.accessControl.activity.startedAt,pendingPlayerActivity.get(member.pid)||0)<SESSION_IDLE_MS;
  const teacherActivity=token=>{const hash=hashToken(token);return pendingTeacherActivity.get(hash)||publishedGame.state.accessControl.activity.teachers[hash]};
  const backupKey=digest('culture-quest/backup/v1:'+secret);
  function sealBackup(snapshot){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',backupKey,iv);cipher.setAAD(Buffer.from('culture-quest-backup-v1'));const ciphertext=Buffer.concat([cipher.update(JSON.stringify(snapshot),'utf8'),cipher.final()]);return {format:'culture-quest-encrypted-backup',version:1,createdAt:Date.now(),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:ciphertext.toString('base64')}}
  function openBackup(raw){try{if(raw?.format!=='culture-quest-encrypted-backup'||raw.version!==1||typeof raw.data!=='string'||raw.data.length>8000000)throw new Error();const iv=Buffer.from(raw.iv||'','base64'),tag=Buffer.from(raw.tag||'','base64');if(iv.length!==12||tag.length!==16)throw new Error();const decipher=createDecipheriv('aes-256-gcm',backupKey,iv);decipher.setAAD(Buffer.from('culture-quest-backup-v1'));decipher.setAuthTag(tag);return JSON.parse(Buffer.concat([decipher.update(Buffer.from(raw.data,'base64')),decipher.final()]).toString('utf8'))}catch{throw new GameError('Копия повреждена или создана с другим SESSION_SECRET. Игра не изменена.','BAD_BACKUP')}}
  let memoryChat=null;
  const chatStore=options.chatStore || (store.loadChat&&store.saveChat ? {kind:store.kind,load:()=>store.loadChat(),save:state=>store.saveChat(state)} : {kind:'memory',load:async()=>memoryChat,save:async state=>{memoryChat=structuredClone(state)}});
  const chat=new ChatEngine(await chatStore.load());
  let pending = Promise.resolve(), closing = false,queued=0;
  let chatPending=Promise.resolve(),chatQueued=0;
  const enqueueChat=fn=>{if(chatQueued>=64)return Promise.reject(new GameError('Чат занят. Повторите сообщение немного позже.','SERVER_BUSY'));chatQueued++;const result=chatPending.then(fn).finally(()=>{chatQueued--});chatPending=result.catch(()=>{});return result};
  let flushInputs=async()=>{},inputBatch=null,inputTimer=null;
  const enqueue = (fn,fast=false) => {if(queued>=256)return Promise.reject(new GameError('Сервер занят. Подождите немного и повторите действие.','SERVER_BUSY'));queued++;const result=pending.then(async()=>{if(!fast)await flushInputs();return fn()}).finally(()=>{queued--});pending=result.catch(()=>{});return result};
  flushInputs=async()=>{
    if(!inputBatch)return;
    clearTimeout(inputTimer);inputTimer=null;const batch=inputBatch;inputBatch=null;
    try{await persistGame();broadcast();for(const done of batch.replies)done(true)}
    catch(error){game=new GameLogic(batch.before);for(const done of batch.replies)done(false);console.error('Ответы не сохранены:',error.message)}
  };
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader('X-Frame-Options','DENY');res.setHeader('Cross-Origin-Opener-Policy','same-origin');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), display-capture=()');
    res.locals.nonce=randomBytes(16).toString('base64');
    const socketHost=/^[a-zA-Z0-9.\-:[\]]+$/.test(req.headers.host||'')?req.headers.host:'localhost';
    res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self' 'nonce-${res.locals.nonce}' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${secureCookies?'wss':'ws'}://${socketHost}; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`);
    if(secureCookies)res.setHeader('Strict-Transport-Security','max-age=31536000');
    next();
  });
  if(options.lobbyRouter)app.use(options.lobbyRouter);
  if(options.extensionSources){app.get('/api/extension',(_req,res)=>{const s=options.extensionSources();res.json({revision:s.revision,css:!!s.css,js:!!s.js});});app.get('/extension.css',(_req,res)=>res.type('text/css').send(options.extensionSources().css));app.get('/extension.js',(_req,res)=>res.type('application/javascript').send(options.extensionSources().js||'export default function(){}'));}

  app.get("/", (_req, res) => res.redirect((options.resourcePrefix||'')+"/student.html"));
  app.get('/api/studio-media/:id',async(req,res)=>{const doc=publishedGame.state.canvasData;if(!doc||String(req.query.v||'')!==(doc.settings.assetVersion||''))return res.sendStatus(404);const jar=cookies(req),token=jar[cookieName('player')],privileged=validTeacherToken(jar[cookieName('teacher')])||typeof token==='string'&&playerActive(publishedGame.creatorFor(hashToken(token)))||options.authorizeTeacher&&await options.authorizeTeacher(req);const surfaces=privileged?['teacher','projector','student']:['student'];const item=surfaces.flatMap(s=>doc.roomUiLayout[s]||[]).find(e=>e.id===req.params.id&&e.data.url);if(!item)return res.sendStatus(404);const match=item.data.url.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);if(!match)return res.sendStatus(404);return res.type(match[1]).set('Cache-Control','private,no-store').send(Buffer.from(match[2],'base64'));});
  app.get("/health", (_req, res) => res.status(closing ? 503 : 200).json({ ok: !closing, storage: store.kind, chatStorage:chatStore.kind, creatorAccessEnabled:configured.length===2 }));
  app.get('/api/public-settings',(_req,res)=>res.json({branding:publishedGame.publicBranding(),privacyVersion:PRIVACY_VERSION,consentRequired:requireConsent}));
  app.get('/api/logo', (req,res)=>{const logo=publishedGame.state.branding.logo;if(!logo||req.query.v!==hashToken(logo).slice(0,16))return res.sendStatus(404);const [header,data]=logo.split(',');res.setHeader('Cache-Control','public, max-age=86400, immutable');res.type(header.slice(5,header.indexOf(';'))).send(Buffer.from(data,'base64'))});
  app.get('/license-texts/:name', (req,res)=>{const licenses={three:'three/LICENSE','socket.io':'socket.io/LICENSE',express:'express/LICENSE',pg:'pg/LICENSE',dotenv:'dotenv/LICENSE',mammoth:'mammoth/LICENSE','pdfjs-dist':'pdfjs-dist/LICENSE'};const file=licenses[req.params.name];if(!file)return res.sendStatus(404);res.type('text/plain').sendFile(path.join(directory,'node_modules',file))});
  app.get('/student.html',(req,res,next)=>{
    if(!Object.hasOwn(req.query,'qr'))return next();
    const entry=publishedGame.state.accessControl.admission;
    if(!validQrTicket(req.query.qr,secret,options.resourcePrefix||'',entry.epoch,securityNow()))return res.status(410).type('text').send('QR-код устарел. Отсканируйте текущий код на экране преподавателя.');
    if(requireAdmission&&(!entry.open||entry.expiresAt<=Date.now()))return res.status(403).type('text').send('Вход закрыт преподавателем.');
    return res.redirect(303,(options.resourcePrefix||'')+'/student.html');
  });
  const allowed = new Set(["/student.html", "/teacher.html", "/student.js", "/teacher.js", "/shared-engine.js", "/game-config.js", "/room-layout.js", "/scene3d.js", "/region-geography.js", "/syllabus-ui.js", "/creator-overlay.js", "/chat-ui.js", "/styles.css",'/privacy.html','/licenses.html','/CLIENT_GUIDE.md','/LICENSE_AUDIT.md']);
  for(const asset of ['studio.html','studio.css','studio-standalone.js','studio-editor.js','studio-audio.js','studio-canvas.js','studio-widgets.js','studio-i18n.js','studio-math.js','studio-model.js','studio-schema.js','studio-flow.js','studio-layout.js','studio-room.css','syllabus-files.js','studio-live.js','room-layout.js'])allowed.add('/'+asset);
  allowed.add('/syllabus-draft.js');
  allowed.add('/session-finale.js');allowed.add('/territory-models.js');allowed.add('/join-qr.js');allowed.add('/qr-generator.js');allowed.add('/ui-preferences.js');allowed.add('/ui-kz.js');
  for(const file of ['./award-2d.js','./achievement-player.js','./achievement-animations.js',...Object.values(ANIMATION_MODULES)])if(/^\.\/[a-z0-9-]+\.js$/.test(file))allowed.add(file.slice(1));
  app.use(async(req,res,next)=>{if(!allowed.has(req.path))return next();if(req.path==='/studio.html'){const token=cookies(req)[cookieName('player')];if(typeof token!=='string'||!playerActive(publishedGame.creatorFor(hashToken(token))))return res.status(403).type('html').send('<p>Studio Max доступен только двум создателям. Войдите в ERADIS своим аккаунтом создателя.</p><a href="student.html">← ERADIS</a>');}const file=path.join(directory,req.path.slice(1));if(req.path.endsWith('.html')){if((req.path==='/student.html'||req.path==='/studio.html')&&!decodeCredential(cookies(req)[cookieName('device')],'device'))cookie(res,'device',signed({role:'device',id:randomUUID(),expires:Date.now()+PROFILE_RETENTION_MS}),PROFILE_RETENTION_MS);return res.type('html').send((await readFile(file,'utf8')).replace('<html ',options.authorizeTeacher?'<html data-teacher-access="account" ':'<html ').replace('<html ',options.extensionSources?'<html data-extensions="enabled" ':'<html ').replace(/(["'])\/(vendor|api|socket.io)\//g,(_,q,group)=>q+(options.resourcePrefix||'')+'/'+group+'/').replace(/<script(?=[\s>])/g,`<script nonce="${res.locals.nonce}"`))}if(options.resourcePrefix&&req.path.endsWith('.js'))return res.type('application/javascript').send((await readFile(file,'utf8')).replace(/(["'])\/(vendor|api|socket.io)\//g,(_,q,group)=>q+options.resourcePrefix+'/'+group+'/'));res.sendFile(file)});
  app.get("/vendor/pdfjs/pdf.mjs", (_req,res) => res.sendFile(path.join(directory,"node_modules/pdfjs-dist/build/pdf.mjs")));
  app.get("/vendor/pdfjs/pdf.worker.mjs", (_req,res) => res.sendFile(path.join(directory,"node_modules/pdfjs-dist/build/pdf.worker.mjs")));
  app.get("/vendor/mammoth/mammoth.browser.min.js", (_req,res) => res.sendFile(path.join(directory,"node_modules/mammoth/mammoth.browser.min.js")));
  app.use("/vendor/three", express.static(path.join(directory, "node_modules/three"), { dotfiles: "deny", index: false }));

  const httpServer = createServer(app),connectionWindows=new Map();
  const io = new Server(httpServer, {
    maxHttpBufferSize: 256 * 1024,
    allowRequest(req, callback) {
      const origin = req.headers.origin;
      let permitted = !origin;
      try { if (origin) permitted = new URL(origin).host === req.headers.host; } catch {}
      const ip=clientAddress(req,trustProxy),now=Date.now(),record=connectionWindows.get(ip);
      if(!record||now-record.at>10000)connectionWindows.set(ip,{at:now,count:1});else if(++record.count>300)permitted=false;
      if(io.engine.clientsCount>=1000)permitted=false;
      callback(null, permitted);
    }
  });
  const signed = payload => {
    const content = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${content}.${createHmac("sha256", secret).update(content).digest("base64url")}`;
  };
  function decodeCredential(token,role){
    if(typeof token!=='string'||token.length>2000)return null;const [payload,signature,extra]=token.split('.');
    if(!payload||!signature||extra||!equal(signature,createHmac('sha256',secret).update(payload).digest('base64url')))return null;
    try{const data=JSON.parse(Buffer.from(payload,'base64url').toString());return data.role===role&&Number.isSafeInteger(data.expires)&&data.expires>Date.now()?data:null}catch{return null}
  }
  function admissionStatus(){const entry=publishedGame.state.accessControl.admission;return {required:requireAdmission,open:!requireAdmission||entry.open&&entry.expiresAt>Date.now(),expiresAt:entry.expiresAt}}
  function admissionDetails(){const entry=game.state.accessControl.admission;return {required:requireAdmission,expiresAt:entry.expiresAt,open:entry.open&&entry.expiresAt>Date.now(),stableToken:signed({role:'classroom',id:entry.stableId}),token:entry.expiresAt>Date.now()?signed({role:'admission',epoch:entry.epoch,expires:entry.expiresAt}):null}}
  function validClassroomToken(token,entry){
    if(typeof token!=='string'||token.length>2000)return false;
    const [payload,signature,extra]=token.split('.');
    if(!payload||!signature||extra||!equal(signature,createHmac('sha256',secret).update(payload).digest('base64url')))return false;
    try{const data=JSON.parse(Buffer.from(payload,'base64url').toString());return data.role==='classroom'&&typeof data.id==='string'&&equal(data.id,entry.stableId)}catch{return false}
  }
  function requireLessonAccess(){const entry=publishedGame.state.accessControl.admission;if(requireAdmission&&(!entry.open||entry.expiresAt<=Date.now()))throw new GameError('Регистрация закрыта. Обратитесь к преподавателю.','ADMISSION_CLOSED')}
  const effectiveLocalCodeHash=()=>Object.hasOwn(publishedGame.state.accessControl,'localKeyOverride')?publishedGame.state.accessControl.localKeyOverride:localAdminCodeHash;
  function privilegedEntry(name){const code=typeof name==='string'?name.trim().split(/\s/,1)[0]:'';return Object.keys(CREATOR_NAMES).some(id=>publishedGame.state.accessControl.keyOverrides[id]?equal(hashToken(code),publishedGame.state.accessControl.keyOverrides[id]):configured.includes(id)&&equal(code,creatorCodes[id]))||!!effectiveLocalCodeHash()&&equal(hashToken(code),effectiveLocalCodeHash())||code.startsWith('CQI-')}
  function checkDevice(socket){if(!requireAdmission||!cookieSessions)return;if(!socket.data.deviceHash)throw new GameError('Откройте страницу входа и разрешите необходимые cookie.','DEVICE_REQUIRED');const devices=publishedGame.state.accessControl.playerDevices;if(publishedGame.state.regions.some(team=>team.members.some(member=>!member.creatorId&&devices[member.pid]===socket.data.deviceHash)))throw new GameError('В этом браузере уже есть участник. Вернитесь в открытую сессию или выйдите из неё.','DEVICE_OCCUPIED')}
  const validTeacherToken = token => {
    if (typeof token !== "string" || token.length > 2000) return false;
    const tokenHash=hashToken(token);if(publishedGame.state.accessControl.revokedTeacherTokens?.some(item=>item.hash===tokenHash&&item.expiresAt>Date.now()))return false;
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return false;
    if (!equal(signature, createHmac("sha256", secret).update(payload).digest("base64url"))) return false;
    try {
      const data = JSON.parse(Buffer.from(payload, "base64url").toString());
      const active=teacherActivity(token)?.at??publishedGame.state.accessControl.activity.startedAt;
      return sessionNow()-active<SESSION_IDLE_MS&&data.role === 'teacher'&&data.expires>Date.now()&&(data.epoch||0)===(publishedGame.state.accessControl.teacherEpoch||0)&&(equal(data.passwordVersion,createHmac('sha256',secret).update(password).digest('hex'))||equal(data.passwordVersion,hashToken(password)));
    } catch { return false; }
  };
  const actor = socket => {
    const player = socket.data.playerHash && publishedGame.findPlayer(socket.data.playerHash),playerHash=playerActive(player)?socket.data.playerHash:null;
    if (validTeacherToken(socket.data.teacherToken)) return { role: "teacher", playerHash };
    const creator = playerHash&&publishedGame.creatorFor(playerHash);
    if (creator) return { role: "creator", playerHash: socket.data.playerHash };
    return { role: playerHash && publishedGame.adminGrantFor(player.pid) ? "delegate" : "guest", playerHash };
  };
  function recordActivity(socket){
    const member=publishedGame.findPlayer(socket.data.playerHash),at=sessionNow();let active=false;
    if(playerActive(member)){pendingPlayerActivity.set(member.pid,at);active=true}
    if(validTeacherToken(socket.data.teacherToken)){const token=socket.data.teacherToken,data=JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString());pendingTeacherActivity.set(hashToken(token),{at,expiresAt:data.expires});active=true}
    return active;
  }
  async function maintainIdleSessions(forceFlush=false){
    const at=sessionNow(),activity=game.state.accessControl.activity,members=game.state.regions.flatMap(t=>t.members),expired=members.filter(m=>at-Math.max(activity.players[m.pid]??activity.startedAt,pendingPlayerActivity.get(m.pid)||0)>=SESSION_IDLE_MS);
    const teachers=new Map([...Object.entries(activity.teachers),...pendingTeacherActivity]);
    const expiredTeachers=[...teachers].filter(([,r])=>at-r.at>=SESSION_IDLE_MS||r.expiresAt<=Date.now()).map(([hash])=>hash);
    const flush=forceFlush||at-lastActivityFlush>=30000;
    if(!expired.length&&!expiredTeachers.length&&(!flush||!pendingPlayerActivity.size&&!pendingTeacherActivity.size))return;
    const before=structuredClone(game.state),playersCopy=new Map(pendingPlayerActivity),teachersCopy=new Map(pendingTeacherActivity),existing=new Set(members.map(m=>m.pid));
    try{
      for(const [pid,time]of playersCopy)if(existing.has(pid))activity.players[pid]=Math.max(activity.players[pid]||0,time);
      for(const [hash,record]of teachersCopy)activity.teachers[hash]=record;
      for(const pid of Object.keys(activity.players))if(!existing.has(pid))delete activity.players[pid];
      for(const pid of Object.keys(game.state.accessControl.playerDevices))if(!existing.has(pid))delete game.state.accessControl.playerDevices[pid];
      for(const member of expired){const team=game.state.regions.find(t=>t.members.some(m=>m.pid===member.pid));game.leaveTeam(team.id,member.pid);delete activity.players[member.pid]}
      for(const hash of expiredTeachers)delete activity.teachers[hash];
      if(expired.length||expiredTeachers.length){game.log(`Автовыход после 30 минут бездействия: ${expired.length} участников, ${expiredTeachers.length} сессий преподавателя.`,expiredTeachers.length||expired.some(m=>m.creatorId)?'admin':'game');if(game.state.revision===before.revision)game.touch()}
      await persistGame();lastActivityFlush=at;
      for(const [pid,time]of playersCopy)if((pendingPlayerActivity.get(pid)||0)<=time)pendingPlayerActivity.delete(pid);
      for(const [hash,record]of teachersCopy)if((pendingTeacherActivity.get(hash)?.at||0)<=record.at)pendingTeacherActivity.delete(hash);
      const hashes=new Set(expired.map(m=>m.tokenHash)),teacherHashes=new Set(expiredTeachers);
      for(const socket of io.sockets.sockets.values()){
        const roles=[];if(hashes.has(socket.data.playerHash)){socket.data.playerHash=null;roles.push('player')}
        if(socket.data.teacherToken&&teacherHashes.has(hashToken(socket.data.teacherToken))){socket.data.teacherToken=null;roles.push('teacher')}
        if(roles.length){socket.emit('session:expired',{roles,reason:'idle',message:'Сессия завершена после 30 минут бездействия. Войдите заново.'});sendState(socket)}
      }
      if(expired.length||expiredTeachers.length)broadcast();
    }catch(error){game=new GameLogic(before);throw error}
  }
  const cookieName=role=>(secureCookies?'__Host-':'')+'cq-'+(options.cookieNamespace?options.cookieNamespace+'-':'')+role;
  const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').flatMap(part=>{const at=part.indexOf('=');if(at<0)return [];try{return [[part.slice(0,at).trim(),decodeURIComponent(part.slice(at+1))]]}catch{return []}}));
  const cookie=(res,role,value,maxAge)=>res.cookie(cookieName(role),value,{httpOnly:true,secure:secureCookies,sameSite:'strict',path:'/',maxAge});
  app.get('/api/join-qr',async(req,res)=>{
    const authorized=validTeacherToken(cookies(req)[cookieName('teacher')])||!!await options.portalCreator?.(req)||!!await options.authorizeTeacher?.(req);
    if(!authorized)return res.status(403).json({error:'QR доступен только преподавателю или создателю.'});
    const entry=publishedGame.state.accessControl.admission;
    if(requireAdmission&&(!entry.open||entry.expiresAt<=Date.now()))return res.status(409).json({error:'Вход закрыт. Откройте вход в пульте преподавателя.'});
    return res.json(issueQrTicket(secret,options.resourcePrefix||'',entry.epoch,securityNow()));
  });
  const sameOrigin=req=>{const origin=req.headers.origin;if(!origin)return true;try{return new URL(origin).host===req.headers.host}catch{return false}};
  const bulkActions=new Set(['applyStudio','applyRawState','restoreBackup','updateBranding','importQuestions','analyzeSyllabus','generateQuestions']);
  const httpSocket=(req,res,next)=>{const socket=io.sockets.sockets.get(req.headers['x-cq-socket']);if(!sameOrigin(req)||req.headers['x-cq-client']!=='1'||!socket||typeof req.headers['x-cq-proof']!=='string'||!equal(req.headers['x-cq-proof'],socket.data.httpProof))return res.status(403).json({ok:false,error:'Сессия изменилась. Дождитесь подключения.',code:'FORBIDDEN'});req.gameSocket=socket;next()};
  app.post('/api/session',httpSocket,express.json({limit:'4kb',inflate:false}),async(req,res)=>{
    try{const role=req.body?.role;if(!['teacher','player'].includes(role))throw new GameError('Некорректная сессия.');
      if(req.body.action==='clear'){cookie(res,role,'',0);return res.json({ok:true})}
      const token=req.body.token;if(typeof token!=='string'||token.length>2000)throw new GameError('Сессия недействительна.','SESSION_EXPIRED');
      if(role==='teacher'){
        if(!validTeacherToken(token))throw new GameError('Войдите преподавателем заново.','SESSION_EXPIRED');
        await enqueue(async()=>{
          await maintainIdleSessions();const before=structuredClone(game.state);
          try{
            if(!validTeacherToken(token))throw new GameError('Войдите преподавателем заново.','SESSION_EXPIRED');
            const data=JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString()),record=teacherActivity(token)||{at:game.state.accessControl.activity.startedAt,expiresAt:data.expires};
            const replacement=signed({role:'teacher',epoch:game.state.accessControl.teacherEpoch||0,sessionId:randomUUID(),expires:data.expires,passwordVersion:createHmac('sha256',secret).update(password).digest('hex')});
            game.state.accessControl.revokedTeacherTokens=[...(game.state.accessControl.revokedTeacherTokens||[]).filter(t=>t.expiresAt>Date.now()),{hash:hashToken(token),expiresAt:data.expires}];
            delete game.state.accessControl.activity.teachers[hashToken(token)];game.state.accessControl.activity.teachers[hashToken(replacement)]=record;
            game.touch();await persistGame();pendingTeacherActivity.delete(hashToken(token));
            for(const s of io.sockets.sockets.values())if(s!==req.gameSocket&&s.data.teacherToken===token)s.disconnect(true);
            req.gameSocket.data.teacherToken=replacement;cookie(res,role,replacement,Math.max(0,data.expires-Date.now()));
          }catch(error){game=new GameLogic(before);throw error}
        });broadcast();return res.json({ok:true});
      }
      await enqueue(async()=>{
        await maintainIdleSessions();const before=structuredClone(game.state);
        try{const player=game.findPlayer(hashToken(token));if(!player||!playerActive(player))throw new GameError('Сессия недействительна.','SESSION_EXPIRED');const replacement=randomBytes(32).toString('base64url'),newHash=hashToken(replacement);game.member(player.regionId,player.pid).tokenHash=newHash;game.touch();await persistGame();for(const s of io.sockets.sockets.values())if(s!==req.gameSocket&&s.data.playerHash===player.tokenHash)s.disconnect(true);req.gameSocket.data.playerHash=newHash;cookie(res,role,replacement,30*86400000)}catch(error){game=new GameLogic(before);throw error}
      });broadcast();res.json({ok:true});
    }catch(error){res.status(error instanceof GameError?400:503).json({ok:false,error:error instanceof GameError?error.message:'Сессия не сохранена. Повторите вход.',code:error.code||'STORAGE_ERROR'})}
  });
  app.post('/api/collection',httpSocket,express.json({limit:'1kb',inflate:false}),async(req,res)=>{
    try{
      const socket=req.gameSocket,jar=cookies(req),playerToken=jar[cookieName('player')];
      if(typeof playerToken!=='string'||hashToken(playerToken)!==socket.data.playerHash)throw new GameError('Войдите в игру заново.','SESSION_EXPIRED');
      if(Date.now()-(socket.data.collectionRequestAt||0)<2000){res.setHeader('Retry-After','2');return res.status(429).json({ok:false,error:'Подождите две секунды.',code:'RATE_LIMIT'})}
      socket.data.collectionRequestAt=Date.now();
      let collectionToken;
      await enqueue(async()=>{
        await maintainIdleSessions();const before=structuredClone(game.state);
        try{
          const player=game.findPlayer(hashToken(playerToken));if(!player||!playerActive(player))throw new GameError('Сессия завершена.','SESSION_EXPIRED');
          collectionToken=game.collectionCookie(player.pid,jar[cookieName('collection')]);
          if(socket.data.deviceHash&&!player.creatorId)game.state.accessControl.playerDevices[player.pid]=socket.data.deviceHash;
          await persistGame();socket.data.collectionHash=hashToken(collectionToken);
        }catch(error){game=new GameLogic(before);throw error}
      });
      cookie(res,'collection',collectionToken,PROFILE_RETENTION_MS);broadcast();res.json({ok:true});
    }catch(error){res.status(error instanceof GameError?403:503).json({ok:false,error:error instanceof GameError?error.message:'Коллекция временно недоступна. Повторите после подключения.',code:error.code||'STORAGE_ERROR'})}
  });
  app.post('/api/bulk/:action',httpSocket,(req,res,next)=>{const socket=req.gameSocket,jar=cookies(req),surface=req.headers['x-cq-surface'],identity=actor(socket),player=publishedGame.findPlayer(socket.data.playerHash);const permitted=surface==='teacher'&&validTeacherToken(jar[cookieName('teacher')])&&equal(jar[cookieName('teacher')],socket.data.teacherToken)||typeof jar[cookieName('player')]==='string'&&hashToken(jar[cookieName('player')])===socket.data.playerHash;const authorized=['teacher','creator'].includes(identity.role)||identity.role==='delegate'&&publishedGame.adminCan(player?.pid,req.params.action);if(!bulkActions.has(req.params.action)||!permitted||!authorized)return res.status(403).json({ok:false,error:'Нужна действующая административная сессия.',code:'FORBIDDEN'});if(identity.role!=='creator'&&roomFeatureDenied(req.params.action,roomFeatures()))return res.status(403).json({ok:false,error:'Функция отключена создателем.',code:'FEATURE_DISABLED'});next()},express.json({limit:'8mb',inflate:false}),(req,res)=>{const action=req.gameSocket.data.bulkHandlers?.get(req.params.action);if(!action)return res.status(400).json({ok:false,error:'Действие недоступно.'});action(req.body,value=>res.json(value))});
  app.use((error,_req,res,next)=>{if(res.headersSent)return next(error);if(error.type==='entity.too.large')return res.status(413).json({ok:false,error:'Файл или запрос слишком большой.',code:'PAYLOAD_TOO_LARGE'});if(error.type==='encoding.unsupported')return res.status(415).json({ok:false,error:'Сжатые тела запросов не поддерживаются.',code:'UNSUPPORTED_ENCODING'});if(error.type==='entity.parse.failed')return res.status(400).json({ok:false,error:'Некорректный JSON запроса.',code:'INVALID_ACTION'});console.error('HTTP запрос не выполнен:',error.name);res.status(500).json({ok:false,error:'Сервер не обработал запрос.',code:'SERVER_ERROR'})});
  app.use((_req,res)=>res.status(404).type('text').send('Страница не найдена.'));
  const online = () => new Set([...io.sockets.sockets.values()].map(s => s.data.playerHash && publishedGame.findPlayer(s.data.playerHash)?.pid).filter(Boolean));
  const chatTopology=players=>hashToken(JSON.stringify([publishedGame.state.regions.map(t=>[t.id,t.name,t.members.map(m=>[m.pid,m.name])]),[...players].sort()]));
  function sendChatScope(socket,force=false,players=online(),topology=chatTopology(players)){
    if(roomFeatures()?.chat===false&&actor(socket).role!=='creator'){socket.data.chatRoom=null;socket.data.chatScope=null;socket.emit('chat:meta',null);return false;}
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
  function stateFor(socket,players,frame){const view=publishedGame.view(actor(socket),players,frame);view.admission=admissionStatus();if(options.roomConfiguration?.()){view.roomConfig={...options.roomConfiguration()};delete view.roomConfig.canvasData;if(view.roomConfig.features.achievements===false){view.worldAchievements=[];view.achievements=[];}}if(publishedGame.state.canvasData){view.roomConfig={...(view.roomConfig||publishedGame.state.studioPresentation||{features:normalizeFeatures(Object.fromEntries(Object.keys(ROOM_FEATURES).map(key=>[key,true]))),design:defaultDesign()}),canvasData:publicStudio(publishedGame.state.canvasData,view.viewer.role==='teacher'||view.viewer.isCreator)};}if(socket.data.portalCreatorId)view.viewer.canJoinFull=true;if(view.viewer.canGrantAdmin)view.sessionControl.localAccessEnabled=!!effectiveLocalCodeHash();return view}
  const sendState = socket => {const players=online();socket.emit("state", stateFor(socket,players));sendChatScope(socket,false,players)};
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
  const broadcast = (urgent=false) => {
    if(closing)return;
    const send=()=>{
      broadcastTimer=null;if(closing)return;
      const players=online(),topology=chatTopology(players),frame=publishedGame.publicFrame(players);
      for(const socket of io.sockets.sockets.values()){socket.emit('state',stateFor(socket,players,frame));sendChatScope(socket,false,players,topology)}
    };
    if(urgent){clearTimeout(broadcastTimer);send();return;}
    if(broadcastTimer)return;broadcastTimer=setTimeout(send,40);broadcastTimer.unref();
  };
  const chatAttempts=new Map();
  let lastRefreshAt=0;
  const effectAttempts = new Map();
  const checkLoginLimit=socket=>credentialLimiter.take(clientAddress(socket.request,trustProxy),20,10000);
  io.use(async(socket, next) => {
    try {
    const auth = socket.handshake.auth || {};
    const jar=cookies(socket.request),legacy=cookieSessions&&auth.surface===undefined&&publishedGame.state.accessControl.legacyHandshakeUntil>Date.now();let teacherToken=cookieSessions?(auth.surface==='teacher'?jar[cookieName('teacher')]:null):auth.teacherToken,playerToken=cookieSessions?jar[cookieName('player')]:auth.playerToken;
    if(legacy){if(validTeacherToken(auth.teacherToken))teacherToken=auth.teacherToken;if(typeof auth.playerToken==='string'&&auth.playerToken.length<=200&&publishedGame.findPlayer(hashToken(auth.playerToken)))playerToken=auth.playerToken;socket.data.refreshLegacy=validTeacherToken(teacherToken)||!!(playerToken&&publishedGame.findPlayer(hashToken(playerToken)))}
    socket.data.teacherToken=validTeacherToken(teacherToken)?teacherToken:null;
    if(options.authorizeTeacher)socket.data.portalTeacher=await options.authorizeTeacher(socket.request);
    if(options.portalCreator)socket.data.portalCreatorId=(await options.portalCreator(socket.request))?.creatorId||null;
    if(socket.data.portalTeacher&&auth.surface==='teacher'){
      const expires=Date.now()+86400000;
      socket.data.teacherToken=signed({role:'teacher',epoch:game.state.accessControl.teacherEpoch||0,sessionId:randomUUID(),expires,passwordVersion:createHmac('sha256',secret).update(password).digest('hex')});
      pendingTeacherActivity.set(hashToken(socket.data.teacherToken),{at:sessionNow(),expiresAt:expires});
    }
    socket.data.playerHash=typeof playerToken==='string'&&playerToken.length<=200?hashToken(playerToken):null;
    if(options.onPlayerJoined&&socket.data.playerHash){const p=publishedGame.findPlayer(socket.data.playerHash);if(p){await options.onPlayerJoined(socket.request,p);if(p.creatorId&&p.creatorId!==socket.data.portalCreatorId)throw new GameError('Войдите аккаунтом создателя.','FORBIDDEN');if(socket.data.portalCreatorId&&!p.creatorId)await enqueue(async()=>{if(game.state.regions.some(t=>t.members.some(m=>m.creatorId===socket.data.portalCreatorId&&m.pid!==p.pid)))throw new GameError('Сессия создателя уже занята.','PROTECTED_SESSION');const before=structuredClone(game.state);try{game.member(p.regionId,p.pid).creatorId=socket.data.portalCreatorId;game.touch();await persistGame();broadcast(true);}catch(e){game=new GameLogic(before);throw e;}});}}
    if(options.syncCollections&&socket.data.playerHash)await enqueue(async()=>{await persistGame();broadcast(true);});
    const collectionToken=jar[cookieName('collection')];socket.data.collectionHash=typeof collectionToken==='string'&&collectionToken.length<=200?hashToken(collectionToken):null;
    const device=decodeCredential(jar[cookieName('device')],'device');socket.data.deviceHash=device&&typeof device.id==='string'?hashToken(device.id):null;
    next();
    }catch{next(new Error('Account verification unavailable'));}
  });

  io.on("connection", socket => {
    socket.data.httpProof=randomBytes(24).toString('base64url');socket.emit('session:ready',{proof:socket.data.httpProof});
    sendState(socket);
    broadcast();
    if(socket.data.refreshLegacy||cookieSessions&&socket.handshake.auth?.activityVersion!==1)socket.emit('ui:refresh',{id:randomUUID()});
    let lastClockSync=-Infinity;
    socket.on('clock:sync',callback=>{
      if(typeof callback!=='function'||Date.now()-lastClockSync<1000)return;
      lastClockSync=Date.now();callback({serverTime:Date.now()});
    });
    let lastActivityMessage=-Infinity;
    socket.on('session:activity',(data,callback)=>{
      if(typeof data==='function'){callback=data;data={}}
      const reply=value=>{if(typeof callback==='function')callback(value)};
      if(sessionNow()-lastActivityMessage<5000)return reply({ok:true});
      lastActivityMessage=sessionNow();
      if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length)return reply({ok:false,code:'INVALID_ACTION'});
      reply(recordActivity(socket)?{ok:true}:{ok:false,code:'SESSION_EXPIRED'});
    });
    let eventWindow = Date.now(), eventCount = 0,waiting=0;
    socket.data.bulkHandlers=new Map();
    function handle(name, permission, fn, after = null) {
      const run=(data = {}, callback,viaHTTP=false) => {
        if (typeof data === "function") { callback = data; data = {}; }
        const reply = value => { if (typeof callback === "function") callback(value); };
        if (Date.now() - eventWindow > 10000) { eventWindow = Date.now(); eventCount = 0; }
        if (++eventCount > 100) { reply({ ok: false, error: "Слишком много действий. Подождите несколько секунд.", code: "RATE_LIMIT" }); return; }
        if(waiting>=8){reply({ok:false,error:'Дождитесь выполнения предыдущих действий.',code:'SERVER_BUSY'});return}
        try{const limit=viaHTTP?8*1024*1024:bulkActions.has(name)?240*1024:16*1024;if(Buffer.byteLength(JSON.stringify(data))>limit)throw new Error()}catch{reply({ok:false,error:'Запрос слишком большой или повреждён.',code:'PAYLOAD_TOO_LARGE'});return}
        try{
          const identity=actor(socket),player=publishedGame.findPlayer(identity.playerHash),delegated=identity.role==='delegate'&&publishedGame.adminCan(player?.pid,name);
          if(permission==='student'&&!player)throw new GameError('Войдите в команду заново.','SESSION_EXPIRED');
          if(permission==='teacher'&&!['teacher','creator'].includes(identity.role)&&!delegated||permission==='creator'&&!publishedGame.creatorFor(identity.playerHash)&&!delegated||permission==='actualTeacher'&&identity.role!=='teacher'&&!(name==='revokeAchievement'&&identity.role==='creator'))throw new GameError('Для действия недостаточно прав.','FORBIDDEN');
          if(name==='teacherLogin'||name==='joinTeam'&&typeof data?.name==='string'&&/(?:ROOT_ACCESS|DEV_CONSOLE)|^CQ[IOL]-|^[A-Za-z0-9_#$!.-]{26,128}(?:\s|$)/i.test(data.name.trim()))checkLoginLimit(socket);
          if(name==='joinTeam'){if(!socket.data.portalCreatorId&&!privilegedEntry(data?.name))requireLessonAccess(data?.admissionToken);registrationLimiter.take(clientAddress(socket.request,trustProxy),300,10000);}
        }catch(error){reply({ok:false,error:error.message,code:error.code||'INVALID_ACTION',...(error.retryAfterMs?{retryAfterMs:error.retryAfterMs}:{})});return}
        const fastInput=["castVote","confirmVote","cancelVote","voteLeader","teamSubmit"].includes(name);
        const chatAction=['chatSubscribe','chatSend','chatDelete'].includes(name);
        const receivedAt=Date.now();
        const inputTiming=fastInput?{roundId:data?.roundId,receivedAt,deadline:game.state.round?.id===data?.roundId?game.state.round.deadline:null}:null;
        const requestId=typeof data?.requestId==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(data.requestId)?data.requestId:null;
        if(fastInput&&requestId&&actor(socket).playerHash)socket.emit('answer:received',{requestId,roundId:data.roundId,receivedAt});
        waiting++;
        (chatAction?enqueueChat:enqueue)(async () => {
          if (closing) throw new GameError("Сервер перезапускается. Дождитесь подключения.");
          if(!fastInput&&!chatAction)await maintainIdleSessions();
          if(options.authorizeTeacher&&socket.data.teacherToken&&!await options.authorizeTeacher(socket.request))socket.data.teacherToken=null;
          const identity = actor(socket);
          if(identity.role!=='creator'&&roomFeatureDenied(name,roomFeatures()))throw new GameError('Эта функция отключена создателем для комнаты.','FEATURE_DISABLED');
          const actorPlayer = identity.playerHash ? game.findPlayer(identity.playerHash) : null;
          if(actorPlayer?.creatorId&&options.portalCreator&&(await options.portalCreator(socket.request))?.creatorId!==actorPlayer.creatorId)throw new GameError('Войдите Google-аккаунтом создателя.','FORBIDDEN');
          const delegatedAllowed = identity.role === 'delegate' && game.adminCan(actorPlayer?.pid, name);
          if (permission === "teacher" && !["teacher","creator"].includes(identity.role) && !delegatedAllowed) throw new GameError("Нужен вход преподавателя или создателя.", "FORBIDDEN");
          if(permission==='creator'&&!game.creatorFor(identity.playerHash)&&!delegatedAllowed)throw new GameError('Нужен персональный доступ.','FORBIDDEN');
          if(permission==='actualTeacher'&&!validTeacherToken(socket.data.teacherToken)&&!(name==='revokeAchievement'&&identity.role==='creator'))throw new GameError('Нужен вход преподавателя.','FORBIDDEN');
          if(identity.role==='delegate'&&['movePlayer','renamePlayer','updatePlayer'].includes(name)&&game.state.regions.some(t=>t.members.some(m=>m.pid===data?.pid&&m.creatorId)))throw new GameError('Делегированный доступ не позволяет менять персональных администраторов.','PROTECTED_SESSION');
          if(identity.role==='delegate'&&game.adminGrantFor(actorPlayer?.pid)?.tier==='local'&&['freeSlot','movePlayer','renamePlayer','updatePlayer','adjustCapital'].includes(name)&&data?.pid!==actorPlayer.pid&&game.state.regions.some(t=>t.members.some(m=>m.pid===data?.pid&&(m.creatorId||game.adminGrantFor(m.pid)))))throw new GameError('Локальный администратор может изменять только обычных игроков и свою сессию.','PROTECTED_SESSION');
          const player = actorPlayer;
          if (permission === "student" && !player) throw new GameError("Войдите в команду заново.", "SESSION_EXPIRED");
          if (!data || typeof data !== "object" || Array.isArray(data)) throw new GameError("Некорректные данные запроса.");
          if(chatAction){const result=await fn(data,player);if(after)after(result);if(name!=='chatSubscribe')recordActivity(socket);reply({ok:true,...(result||{})});return}
          // These five input actions only mutate round and revision.
          const before = fastInput?{round:structuredClone(game.state.round),revision:game.state.revision}:structuredClone(game.state);
          let result;
          try {
            if(['resetGame','applyRawState'].includes(name)||name==='removeAllPlayers'&&game.state.regions.some(t=>t.members.some(m=>!m.creatorId)))game.createRestorePoint('Перед действием: '+name,false);
            const oldLogContext=game.logContext;
            game.logContext=['teacher','creator','delegate'].includes(identity.role)&&!['startRound','resolveRound','endRound','finishMatch','castVote','confirmVote','cancelVote','teamSubmit','voteLeader','chatSend','chatSubscribe','offerTrade','settleTrade'].includes(name)?'admin':null;
            if(fastInput)game.inputTiming=inputTiming;
            try{result = await fn(data, player)}finally{delete game.inputTiming;game.logContext=oldLogContext}
            if(name==='joinTeam'&&result?.player&&options.onPlayerJoined)await options.onPlayerJoined(socket.request,result.player);
            if(result?.playerToken&&result.player){game.ensureCollection(result.player.pid,socket.data.collectionHash);game.state.accessControl.activity.players[result.player.pid]=sessionNow();if(socket.data.deviceHash&&!result.isCreator)game.state.accessControl.playerDevices[result.player.pid]=socket.data.deviceHash;}
            if(name!=='leaveTeam'&&before.delegatedAdmins?.some(grant=>(grant.tier==='local'||grant.origin==='shared-local')&&(!game.state.regions.some(team=>team.members.some(member=>member.pid===grant.pid))||!game.adminGrantFor(grant.pid)))){game.state.accessControl.localKeyOverride=null;game.touch()}
            if(result?.teacherToken){const payload=JSON.parse(Buffer.from(result.teacherToken.split('.')[0],'base64url').toString());game.state.accessControl.activity.teachers[hashToken(result.teacherToken)]={at:sessionNow(),expiresAt:payload.expires};game.touch()}
            for(const member of fastInput?[]:before.regions.flatMap(t=>t.members).filter(m=>m.creatorId)){
              const current=game.findPlayer(member.tokenHash);
              const voluntary=player?.pid===member.pid&&(name==='leaveTeam'||name==='respondSessionExit'&&data.accept===true);
              if((!current||current.pid!==member.pid||current.creatorId!==member.creatorId)&&!voluntary)throw new GameError('Персональную сессию можно завершить только по согласию её владельца. Используйте запрос на выход.','PROTECTED_SESSION');
            }
            if (game.state.revision !== before.revision) {
              if(!fastInput){await persistGame();}
              else if(!inputBatch){const rollback=game.snapshotCopy().state;rollback.round=before.round;rollback.revision=before.revision;inputBatch={before:rollback,replies:[]};}
            }
          } catch (error) {
            if(fastInput){game.state.round=before.round;game.state.revision=before.revision;delete game.inputTiming;}
            else game = new GameLogic(before);
            throw error;
          }
          if (after) after(result);
          if(name!=='chatSubscribe')recordActivity(socket);
          const response={ ok: true, ...(result || {}),...(cookieSessions&&(result?.playerToken||result?.teacherToken)?{sessionMethod:'cookie'}:{}) };
          if(fastInput&&inputBatch){
            const processedAt=Date.now();
            inputBatch.replies.push(ok=>{const savedAt=Date.now();if(savedAt-receivedAt>1000)console.warn(JSON.stringify({event:'slow-answer',queueMs:processedAt-receivedAt,saveMs:savedAt-processedAt}));reply(ok?{...response,timing:{receivedAt,processedAt,savedAt}}:{ok:false,code:'STORAGE_ERROR',error:'Ответ не сохранён. Повторите попытку.'})});
            if(!inputTimer)inputTimer=setTimeout(()=>{inputTimer=null;enqueue(async()=>{}).catch(console.error)},40);
          }else{if(game.state.revision!==before.revision||(after&&!name.startsWith('chat')))broadcast();reply(response)}
        },fastInput).catch(error => {
          if (!(error instanceof GameError)) console.error("Команда не выполнена:", error.message);
          reply({ ok: false, error: error instanceof GameError ? error.message : "Изменение не сохранено. Проверьте соединение с базой и повторите.", code: error.code || "STORAGE_ERROR" });
        }).finally(()=>{waiting--});
      };
      socket.on(name,(data,callback)=>run(data,callback,false));
      if(bulkActions.has(name))socket.data.bulkHandlers.set(name,(data,callback)=>run(data,callback,true));
    }

    handle("teacherLogin", "guest", data => {
      if (typeof data.password !== "string" || data.password.length > 256 || !equal(data.password, password)) throw new GameError("Неверный пароль преподавателя.", "BAD_PASSWORD");
      return { teacherToken: signed({ role: 'teacher',epoch:game.state.accessControl.teacherEpoch||0,sessionId:randomUUID(),expires:Date.now()+86400000,passwordVersion:createHmac('sha256',secret).update(password).digest('hex') }) };
    }, result => { socket.data.teacherToken = result.teacherToken; });
    handle('teacherLogout','teacher',()=>{if(socket.data.teacherToken){const list=(game.state.accessControl.revokedTeacherTokens||[]).filter(item=>item.expiresAt>Date.now());if(list.length>=1000){game.state.accessControl.teacherEpoch=(game.state.accessControl.teacherEpoch||0)+1;game.state.accessControl.revokedTeacherTokens=[]}else game.state.accessControl.revokedTeacherTokens=[...list,{hash:hashToken(socket.data.teacherToken),expiresAt:Date.now()+86400000}];delete game.state.accessControl.activity.teachers[hashToken(socket.data.teacherToken)];game.touch()}return {}},()=>{if(socket.data.teacherToken)pendingTeacherActivity.delete(hashToken(socket.data.teacherToken));socket.data.teacherToken=null});
    handle("joinTeam", "guest", async data => {
      if (socket.data.playerHash && game.findPlayer(socket.data.playerHash)) throw new GameError("Вы уже состоите в команде.");
      if(requireConsent&&(data.privacyConsent?.accepted!==true||data.privacyConsent?.version!==PRIVACY_VERSION))throw new GameError('Прочитайте политику и подтвердите согласие перед входом.','CONSENT_REQUIRED');
      if(options.portalCreator){const account=await options.portalCreator(socket.request);if(account?.creatorId)return game.joinCreator(account.creatorId,data.regionId,data.name||account.name);}
      const name=typeof data.name==='string'?data.name.trim():'';
      const code=name.split(/\s/,1)[0],displayName=name.slice(code.length).trim(),creatorId=Object.keys(CREATOR_NAMES).find(id=>game.state.accessControl.keyOverrides[id]?equal(hashToken(code),game.state.accessControl.keyOverrides[id]):configured.includes(id)&&equal(code,creatorCodes[id]));
      if(creatorId){const result=game.joinCreator(creatorId,data.regionId,displayName||undefined);if(requireConsent)game.member(result.player.regionId,result.player.pid).privacyConsent={version:PRIVACY_VERSION,acceptedAt:Date.now()};return result;}
      if(effectiveLocalCodeHash()&&equal(hashToken(code),effectiveLocalCodeHash())){checkDevice(socket);const result=game.joinLocalAdmin(data.regionId,displayName);if(requireConsent)game.member(result.player.regionId,result.player.pid).privacyConsent={version:PRIVACY_VERSION,acceptedAt:Date.now()};return result;}
      if(code.startsWith('CQL-'))throw new GameError('Некорректный или отозванный код локального администратора.','BAD_LOCAL_CODE');
      if(code.startsWith('CQI-')){const result=game.redeemAdminInvite(code,data.regionId,displayName);if(requireConsent)game.member(result.player.regionId,result.player.pid).privacyConsent={version:PRIVACY_VERSION,acceptedAt:Date.now()};return result}
      if(data.regionId===CREATOR_TEAM_ID||configured.some(id=>equal(code,creatorCodes[id]))||/(?:ROOT_ACCESS|DEV_CONSOLE)|^CQO-/i.test(name)){
        throw new GameError('Некорректный персональный код.','BAD_CREATOR_CODE');
      }
      requireLessonAccess(data.admissionToken);checkDevice(socket);const result=game.joinTeam(data.regionId, data.name);if(requireConsent)game.member(result.player.regionId,result.player.pid).privacyConsent={version:PRIVACY_VERSION,acceptedAt:Date.now()};return result;
    }, result => { socket.data.playerHash = hashToken(result.playerToken); });
    handle("leaveTeam", "student", (_data, p) => game.leaveTeam(p.regionId, p.pid), () => { socket.data.playerHash = null; });
    handle("castVote", "student", (data, p) => game.castVote(p.regionId, p.pid, data.optionIdx, data.roundId));
    handle('voteLeader','student',(data,p)=>game.voteLeader(p.regionId,p.pid,data.accept,data.roundId));
    handle('setTeamRules','teacher',data=>game.setTeamRules(data.decision,data.tradeEnabled));
    handle('setLeader','teacher',data=>game.setLeader(data.teamId,data.pid));
    handle('offerTrade','student',(data,p)=>game.offerTrade(p.regionId,p.pid,data.toTeamId,data.resources,data.economy));
    handle('settleTrade','student',(data,p)=>game.settleTrade(p.regionId,p.pid,data.id,data.accept));
    handle('confirmVote','student',(data,p)=>game.confirmVote(p.regionId,p.pid,data.pid,data.roundId));
    handle('cancelVote','student',(data,p)=>game.cancelVote(p.regionId,p.pid,data.roundId));
    handle('setGameMode','teacher',data=>game.setGameMode(data.mode));
    handle('renameSelf','creator',(data,p)=>game.renamePlayer(p.pid,data.name));
    handle('adjustCapital','teacher',data=>game.adjustCapital(data.pid,data.delta));
    handle('setPerksEnabled','teacher',data=>game.setPerksEnabled(data.enabled));
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
      const actingPlayer = game.findPlayer(socket.data.playerHash);
      const grant = !creator && game.adminGrantFor(actingPlayer?.pid);
      const pro = creator?.creatorId === 'adilet';
      if (!pro && !grant) throw new GameError('Эта функция доступна только главному PRO-администратору или выданному делегату.','PRO_ONLY');
      if(game.state.presentationEffectsEnabled===false&&!pro)throw new GameError('Преподаватель отключил эффекты.','EFFECTS_DISABLED');
      if(!pro && !grant?.unlimitedEffects && Date.now()-(effectAttempts.get(actingPlayer.pid)||0)<30000)throw new GameError('Эффект доступен раз в 30 секунд.','RATE_LIMIT');
      if(data.duration!==undefined&&(!Number.isInteger(data.duration)||data.duration<100||data.duration>60000))throw new GameError('Длительность помехи: 100–60000 мс.');
      const duration = pro ? data.duration??3000 : grant.effectDuration;
      if(data.targetPid!==undefined&&(typeof data.targetPid!=='string'||!data.targetPid.trim()))throw new GameError('Некорректный адресат.','INVALID_TARGET');
      const targetPid=data.targetPid?.trim()||null;
      if(targetPid){const target=game.state.regions.flatMap(t=>t.members).find(m=>m.pid===targetPid);if(!target||target.creatorId||game.adminGrantFor(targetPid))throw new GameError('Можно выбрать только обычного участника.','INVALID_TARGET');}
      const recipientCount=[...io.sockets.sockets.values()].filter(s=>targetPid?actor(s).playerHash&&publishedGame.findPlayer(s.data.playerHash)?.pid===targetPid:validTeacherToken(s.data.teacherToken)).length;
      if(!recipientCount)throw new GameError(targetPid?'Участник сейчас вне сети.':'Экран преподавателя не подключён. Откройте teacher.html и войдите в пульт.','TARGET_OFFLINE');
      if(!pro)effectAttempts.set(actingPlayer.pid,Date.now());return {id:randomUUID(),duration,targetPid,recipientCount,overrideDisabled:pro};
    },result=>{for(const target of io.sockets.sockets.values()){if(result.targetPid){const player=publishedGame.findPlayer(target.data.playerHash);if(player?.pid===result.targetPid)target.emit('ui:presentation-effect',result)}else if(validTeacherToken(target.data.teacherToken))target.emit('ui:presentation-effect',result)}});
    handle('grantAdmin','creator',(data,p)=>{
      const creator=game.creatorFor(socket.data.playerHash);if(creator?.creatorId!=='adilet')throw new GameError('Только Адилет может выдавать административные права.','PRO_ONLY');
      return game.grantAdmin(data.pid,data.permissions,data.effectDuration,data.unlimitedEffects,data.expiresAt===undefined?game.adminGrantFor(data.pid)?.expiresAt??null:data.expiresAt);
    });
    handle('revokeAdmin','creator',(data,p)=>{
      const creator=game.creatorFor(socket.data.playerHash);if(creator?.creatorId!=='adilet')throw new GameError('Только Адилет может отзывать административные права.','PRO_ONLY');
      return game.revokeAdmin(data.pid);
    });
    handle('createAdminInvite','creator',data=>{if(game.creatorFor(socket.data.playerHash)?.creatorId!=='adilet')throw new GameError('Приглашения создаёт главный администратор.','PRO_ONLY');return game.createAdminInvite(data.permissions,data.minutes,data.effectDuration)});
    handle('revokeAdminInvite','creator',data=>{if(game.creatorFor(socket.data.playerHash)?.creatorId!=='adilet')throw new GameError('Приглашения отзывает главный администратор.','PRO_ONLY');return game.revokeAdminInvite(data.id)});
    handle('rotateAccessKey','creator',(_data,p)=>game.rotateAccessKey(p.creatorId));
    handle('rotateLocalAccessKey','creator',()=>{if(game.creatorFor(socket.data.playerHash)?.creatorId!=='adilet')throw new GameError('Только главный администратор обновляет общий код.','PRO_ONLY');return game.rotateLocalAccessKey()});
    handle('getAdmissionLink','teacher',()=>admissionDetails());
    handle('setAdmission','teacher',data=>{if(typeof data.open!=='boolean'||data.rotate!==undefined&&typeof data.rotate!=='boolean')throw new GameError('Некорректная настройка входа.');const entry=game.state.accessControl.admission;if(data.rotate||data.open&&entry.expiresAt<=Date.now()){entry.epoch=randomUUID();entry.expiresAt=Date.now()+12*3600000}entry.open=data.open;game.touch();return admissionDetails()});
    handle('revokeAdmissionLink','teacher',()=>{const entry=game.state.accessControl.admission;entry.stableId=randomUUID();entry.epoch=randomUUID();game.touch();return admissionDetails()});
    handle('setPublicDemo','teacher',data=>game.setPublicDemo(data.enabled));
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
    handle('finishMatch','teacher',()=>game.finishMatch());
    handle('grantAchievement','teacher',data=>game.grantAchievement(data.achievementId,data.scope,data.targetId));
    handle('revokeAchievement','actualTeacher',data=>game.revokeAchievement(data.achievementId,data.scope,data.targetId));
    handle('setAutoAdvance','teacher',data=>game.setAutoAdvance(data.enabled,data.duration));
    handle('clearQuestions','teacher',()=>game.clearQuestions());
    handle('previewAchievement','teacher',data=>{const definition=awardDefinition(data.achievementId);if(!definition)throw new GameError('Неизвестное достижение.');return {...definition,achievementId:data.achievementId}},result=>socket.emit('achievement:preview',result));
    handle("adjustPoints", "teacher", data => game.adjustPoints(data.regionId, data.delta));
    handle("adjustEconomy", "teacher", data => game.adjustEconomy(data.regionId, data.delta));
    handle("addCustomQuestion", "teacher", data => game.addCustomQuestion(data.text, data.options, data.correctIdx, data.points));
    handle("createTeam", "teacher", data => game.createTeam(data.name,data.baseRegionId,data.capacity,data.points,data.economy,data.cityId));
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
    handle("importQuestions", "teacher", data => game.importQuestions(Array.isArray(data.questions)?data.questions.map(q=>({...q,subject:q.subject||game.state.branding.subject})):data.questions));
    handle('updateBranding','teacher',data=>game.updateBranding(data.branding));
    handle('getStudio','creator',()=>{if(actor(socket).role!=='creator')throw new GameError('Нужен доступ создателя.','FORBIDDEN');const presentation=game.state.studioPresentation||options.roomConfiguration?.()||{features:normalizeFeatures(Object.fromEntries(Object.keys(ROOM_FEATURES).map(key=>[key,true]))),design:defaultDesign()};return {...presentation,canvasData:game.state.canvasData||null,questions:game.state.questions.filter(q=>(q.subject||game.state.branding.subject)===game.state.branding.subject),name:game.state.branding.title,subject:game.state.branding.subject,revision:game.state.revision};});
    handle('applyStudio','creator',data=>{if(actor(socket).role!=='creator')throw new GameError('Нужен доступ создателя.','FORBIDDEN');const presentation={features:normalizeFeatures(data.features),design:normalizeDesign(data.design)};const result=game.setStudio(data.canvasData,data.revision);game.state.studioPresentation=presentation;enforceRoomFeatures();game.touch();return result;});
    handle('continueStudio','teacher',()=>game.continueStudio());
    handle('createBackup','teacher',()=>{const point=game.createRestorePoint();return {archive:sealBackup(point.snapshot)}});
    handle('restoreBackup','teacher',data=>{
      if(data.revision!==game.state.revision)throw new GameError('Состояние изменилось. Обновите страницу перед восстановлением.','REVISION_CONFLICT');
      const snapshot=data.backupId?game.state.restorePoints?.find(p=>p.id===data.backupId)?.snapshot:openBackup(data.archive);
      if(!snapshot)throw new GameError('Резервная копия не найдена.');
      game.createRestorePoint('Перед восстановлением');game.restoreBackup(snapshot,game.state.revision);return {};
    });
    handle("analyzeSyllabus", "teacher", data => analyzeSyllabus(data.text));
    handle("generateQuestions", "teacher", data => generateSyllabusQuestions(data.text,data.topics,data.count,data.options));
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
    const scheduledAt=Date.now(),round = game.state.round;
    const proposalsReady=round?.proposals&&Object.values(round.proposals).some(p=>p.remainingAt-game.remainingMs()>=7000);
    const expired=(game.state.delegatedAdmins||[]).some(g=>g.expiresAt&&g.expiresAt<=Date.now()),roundReady=round&&!round.resolved&&!round.paused&&(game.remainingMs()<=0||proposalsReady);
    const advanceReady=game.state.settings.autoAdvance&&round?.resolved&&game.state.match?.finishedAt===null;
    const awardReady=round&&!round.resolved&&round.paused&&Number.isFinite(round.awardPauseUntil)&&round.awardPauseUntil<=Date.now();
    if (closing || timerBusy || !expired&&!roundReady&&!awardReady&&!advanceReady) return;
    timerBusy = true;
    enqueue(async () => {
      const before = structuredClone(game.state);
      try {game.expireAdminGrants();game.resumeAwardPauseIfDue();game.advanceIfDue();if(game.state.round&&!game.state.round.resolved&&!game.state.round.paused){if(round?.id===game.state.round.id&&scheduledAt>=game.state.round.deadline)game.resolveRound();else if(game.remainingMs()>0)game.flushProposals()}game.advanceIfDue();if(game.state.revision===before.revision)return;await persistGame();broadcast();}
      catch (error) { game = new GameLogic(before); console.error("Итоги раунда не сохранены; повторная попытка автоматически:", error.message); }
    }).catch(error=>{if(error.code!=='SERVER_BUSY')console.error('Таймер:',error.message)}).finally(() => { timerBusy = false; });
  }, 250);
  timer.unref();
  const cleanup = setInterval(() => { credentialLimiter.prune();registrationLimiter.prune();for(const [id,times] of chatAttempts)if(!times.some(t=>t>Date.now()-10000))chatAttempts.delete(id);for(const [pid,at]of effectAttempts)if(at<Date.now()-30000)effectAttempts.delete(pid); }, 60000);
  cleanup.unref();
  const connectionCleanup=setInterval(()=>{for(const [ip,record]of connectionWindows)if(Date.now()-record.at>10000)connectionWindows.delete(ip)},10000);connectionCleanup.unref();
  let idleBusy=false;
  const idleTimer=setInterval(()=>{if(closing||idleBusy)return;idleBusy=true;enqueue(()=>maintainIdleSessions()).catch(error=>{if(error.code!=='SERVER_BUSY')console.error('Автовыход не сохранён; повторная попытка автоматически:',error.message)}).finally(()=>{idleBusy=false})},5000);idleTimer.unref();

  return {
    app, io, httpServer, store,
    get game() { return game; },
    platformActivityAt(){return Math.max(game.state.accessControl.activity.startedAt||0,...Object.values(game.state.accessControl.activity.players),...Object.values(game.state.accessControl.activity.teachers).map(v=>v.at),...pendingPlayerActivity.values(),...[...pendingTeacherActivity.values()].map(v=>v.at));},
    async publishRoomConfiguration(previous={}){return enqueue(async()=>{const before=structuredClone(game.state),f=roomFeatures()||{};try{if(previous.achievements===false&&f.achievements===true)game.state.settings.perksEnabled=true;if(previous.trading===false&&f.trading===true)game.state.settings.tradeEnabled=true;if(previous.presentationEffects===false&&f.presentationEffects===true)game.state.presentationEffectsEnabled=true;enforceRoomFeatures();game.touch();await persistGame();broadcast(true);}catch(e){game=new GameLogic(before);throw e;}});},
    async platformControl(accountId,action,data={}){return enqueue(async()=>{
      if(!options.authorizePlatform||!await options.authorizePlatform(accountId))throw new GameError('Нужен доступ создателя.','FORBIDDEN');
      const methods={continueStudio:()=>game.continueStudio(),studio:()=>game.setStudio(data.canvasData,data.revision),summary:()=>game.exportSummary(),pause:()=>game.pauseRound(),resolve:()=>game.resolveRound(),next:()=>game.endRound(),start:()=>game.startRound(data.questionId,data.duration),resetTimer:()=>game.resetTimer(),reset:()=>game.resetGame(),points:()=>game.adjustPoints(data.teamId,data.delta),economy:()=>game.adjustEconomy(data.teamId,data.delta),rename:()=>game.renamePlayer(data.pid,data.name),move:()=>game.movePlayer(data.pid,data.teamId),kick:()=>{const team=game.state.regions.find(t=>t.members.some(m=>m.pid===data.pid)),member=team?.members.find(m=>m.pid===data.pid);if(!member)throw new GameError('Участник не найден.');if(member.creatorId)throw new GameError('Создатели не могут исключать друг друга.','PROTECTED_SESSION');return game.leaveTeam(team.id,member.pid);},question:()=>game.editQuestion(data.questionId,data.question,data.expectedVersion),clearQuestions:()=>game.clearQuestions(),mode:()=>game.setGameMode(data.mode),capacity:()=>game.setAllCapacities(data.capacity),layout:()=>{if(data.mode!==game.state.settings.mode){if(game.state.round?.resolved)game.endRound();game.setGameMode(data.mode);}game.setTeamCount(data.count);game.setAllCapacities(data.capacity);},rules:()=>{game.setAutoAdvance(data.autoAdvance,data.duration);game.setTeamRules(data.decision,data.trading);},teamCount:()=>game.setTeamCount(data.count),capital:()=>game.adjustCapital(data.pid,data.delta),admission:()=>{game.state.accessControl.admission.open=data.open===true;game.state.accessControl.admission.expiresAt=Date.now()+8*3600000;game.touch();},state:()=>{const pids=new Set((data.regions||[]).flatMap(t=>(t.members||[]).map(m=>m.pid)));if(game.state.regions.some(t=>t.members.some(m=>m.creatorId&&!pids.has(m.pid))))throw new GameError('JSON-патч не может исключать создателей.','PROTECTED_SESSION');return game.applyRawState(data);},configure:()=>{const c=data.config;if(game.state.round?.resolved)game.endRound();game.setGameMode(c.mode);game.setTeamCount(c.teamCount);game.setAllCapacities(c.capacity);game.updateBranding({title:data.name,subject:data.subject,subjects:[...new Set([...game.state.branding.subjects,data.subject])],accent:c.accent,gold:c.gold});game.setAutoAdvance(c.autoAdvance,c.duration);game.setPerksEnabled(c.perksEnabled);game.setTeamRules(c.decision,c.tradingEnabled);if(data.replaceQuestions){game.clearQuestions();if(data.canvasData)game.setStudio(data.canvasData);else for(let i=0;i<data.questions.length;i+=60)game.importQuestions(data.questions.slice(i,i+60));}return {configured:true};}};
      if(!Object.hasOwn(methods,action))throw new GameError('Действие недоступно.');
      const before=structuredClone(game.state);try{const result=methods[action]();await persistGame();broadcast(true);return result||{};}catch(e){game=new GameLogic(before);throw e;}
    });},
    async checkInactiveSessions(){return enqueue(()=>maintainIdleSessions(true))},
    async listen(port = Number(process.env.PORT) || 3000, host = "0.0.0.0") {
      await new Promise((resolve, reject) => { httpServer.once("error", reject); httpServer.listen(port, host, resolve); });
      if(game.activateRoundPublication()){publishedGame=game.snapshotCopy();broadcast(true);}
      return httpServer.address().port;
    },
    async close() {
      closing = true;
      clearInterval(timer); clearInterval(cleanup);clearInterval(connectionCleanup);clearInterval(idleTimer);clearTimeout(broadcastTimer);
      await Promise.all([pending,chatPending]);await flushInputs();clearTimeout(inputTimer);
      try{await maintainIdleSessions(true)}catch(error){console.error('Активность сессий не сохранена перед остановкой:',error.message)}
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

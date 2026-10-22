import { randomBytes, randomUUID, createHash } from "node:crypto";
import { REGIONS, SEAT_LIMIT, ECONOMY_PENALTY, CRISIS_THRESHOLD, RESOURCE_CAP, developmentFor, MAX_TEAMS, MAX_TEAM_CAPACITY, metadataFor, capacityFor, totalCapacity, normalizeRegionId, CREATOR_TEAM_ID, CREATOR_NAMES, isCreatorTeam, regularTeams } from "./game-config.js";
import { QUESTION_BANK } from "./question-bank.js";
import {MODE_NAMES,ECONOMY_FLOOR,soloMultiplier,DEFAULT_BRANDING,DEFAULT_SUBJECT} from './game-config.js';
export { REGIONS, SEAT_LIMIT, ECONOMY_PENALTY, CRISIS_THRESHOLD } from "./game-config.js";

export class GameError extends Error {
  constructor(message, code = "INVALID_ACTION") { super(message); this.code = code; }
}
function ensure(condition, message, code) {
  if (!condition) throw new GameError(message, code);
}
export const hashToken = token => createHash("sha256").update(String(token)).digest("hex");
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const cleanText = (value, min, max, label) => {
  ensure(typeof value === "string", `${label}: ожидается текст.`);
  const text = value.normalize("NFC").trim();
  ensure(text.length >= min && text.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text), `${label}: длина от ${min} до ${max} символов.`);
  return text;
};

function validateBranding(raw={}) {
  const value={...DEFAULT_BRANDING,...raw};
  for(const [key,max]of [['university',120],['title',80],['subject',80]])value[key]=cleanText(value[key],2,max,key);
  for(const key of ['operator','privacyContact'])value[key]=cleanText(value[key],0,240,key);
  ensure(Array.isArray(value.subjects)&&value.subjects.length>0&&value.subjects.length<=20,'Укажите от 1 до 20 предметов.');
  value.subjects=[...new Set(value.subjects.map(s=>cleanText(s,2,80,'Предмет')))];
  ensure(value.subjects.includes(value.subject),'Текущий предмет должен быть в списке.');
  for(const key of ['accent','gold'])ensure(/^#[0-9a-f]{6}$/i.test(value[key]),'Цвет задаётся как #RRGGBB.');
  ensure(typeof value.logo==='string'&&value.logo.length<=200000,'Логотип: PNG, JPEG или WebP до 150 КБ.');
  if(value.logo){const match=value.logo.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);ensure(match,'Логотип: только PNG, JPEG или WebP.');const bytes=Buffer.from(match[2],'base64');ensure(bytes.length<=150000&&(match[1]==='png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||match[1]==='jpeg'&&bytes[0]===255&&bytes[1]===216||match[1]==='webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'),'Формат логотипа не соответствует файлу.');}
  return Object.fromEntries(Object.keys(DEFAULT_BRANDING).map(key=>[key,value[key]]));
}

export function validateQuestions(questions) {
  ensure(Array.isArray(questions) && questions.length >= 1 && questions.length <= 1000, "Нужно от 1 до 1000 вопросов.");
  const ids = new Set();
  return questions.map(q => {
    ensure(q && typeof q === "object" && typeof q.id === "string" && /^[\w-]{1,80}$/.test(q.id) && !ids.has(q.id), "Некорректный или повторный ID вопроса.");
    ids.add(q.id);
    ensure(Array.isArray(q.options) && q.options.length === 4, "У вопроса должны быть четыре варианта.");
    ensure(integer(q.correct, 0, 3) && integer(q.points, 1, 1000), "Проверьте правильный вариант и баллы (1–1000).");
    ensure(integer(q.version ?? 1, 1, Number.MAX_SAFE_INTEGER), "Некорректная версия вопроса.");
    const extra = {};
    for (const [key, max] of [["topic",200],["subject",80],["explanation",1200],["source",200],["sourceExcerpt",1200]]) {
      if (q[key]) extra[key] = cleanText(q[key], 1, max, key);
    }
    const options = q.options.map(o => cleanText(o, 1, 500, "Вариант"));
    ensure(new Set(options.map(o => o.toLocaleLowerCase())).size === 4, "Варианты ответа не должны повторяться.");
    return { id: q.id, text: cleanText(q.text, 3, 2000, "Вопрос"), options, correct: q.correct, points: q.points, version: q.version ?? 1, ...extra };
  });
}

export function freshState() {
  const initial = [{id:"saryarka",name:"Сарыарқа"},{id:"jetisu",name:"Жетісу"},{id:"mangystau",name:"Маңғыстау"},{id:"turkistan",name:"Түркістан"}];
  return { schemaVersion: 5, revision: 0, phase: "lobby", settings: { teamCapacity: SEAT_LIMIT }, regions: initial.map(r => ({ ...r, baseRegionId: normalizeRegionId(r.id), capacity: SEAT_LIMIT, points: 0, economy: 100, members: [] })), questions: validateQuestions(QUESTION_BANK), round: null, delegatedAdmins: [], log: [] };
}

function validateRegions(regions, knownMembers = null, universal = false, mode = 'team') {
  ensure(Array.isArray(regions) && regularTeams(regions).length >= 1 && regularTeams(regions).length <= MAX_TEAMS && regions.length <= MAX_TEAMS + 1, `Нужно от 1 до ${MAX_TEAMS} обычных команд.`);
  const seenRegions = new Set(), seenPlayers = new Set(), seenNames = new Set(), seenCreators = new Set();
  return regions.map(r => {
    ensure(r && typeof r.id === "string" && /^[\w-]{1,80}$/.test(r.id) && !seenRegions.has(r.id), "ID команд должны быть уникальными.");
    seenRegions.add(r.id);
    const meta = metadataFor(r), baseRegionId = normalizeRegionId(r.baseRegionId || r.id);
    ensure(REGIONS.some(base => base.id === baseRegionId), "Выберите регион карты Казахстана.");
    const name = cleanText(r.name || (r.id === "saryarka" ? "Сарыарқа" : meta.name.replace(/ облысы$/, "")), 2, 60, "Команда"), nameKey = name.toLocaleLowerCase();
    ensure(!seenNames.has(nameKey), "Названия команд должны быть уникальными."); seenNames.add(nameKey);
    ensure(integer(r.points, 0, RESOURCE_CAP) && integer(r.economy, 0, 100), `Ресурс: 0–${RESOURCE_CAP}; экономика: 0–100.`);
    const capacity = capacityFor(r);
    ensure(!isCreatorTeam(r) || capacity === 2, "В команде создателей ровно два места.");
    ensure(integer(capacity, 1, MAX_TEAM_CAPACITY), `Вместимость команды: 1–${MAX_TEAM_CAPACITY}.`);
    ensure(Array.isArray(r.members) && (universal ? mode==='solo'||r.members.filter(m=>!(knownMembers?.get(m.pid)||m).creatorId).length<=4 : r.members.length <= capacity), "Количество участников превышает вместимость команды.");
    const members = r.members.map(m => {
      ensure(m && typeof m.pid === "string" && /^[\w-]{1,80}$/.test(m.pid) && !seenPlayers.has(m.pid), "Некорректный или повторный участник."); seenPlayers.add(m.pid);
      const original = knownMembers ? knownMembers.get(m.pid) : m;
      ensure(original && /^[a-f0-9]{64}$/.test(original.tokenHash), "Добавляйте новых участников через экран регистрации.");
      const creatorId = original.creatorId;
      if (creatorId) {
        ensure(Object.hasOwn(CREATOR_NAMES,creatorId) && (universal||isCreatorTeam(r)) && !seenCreators.has(creatorId), "Некорректный персональный доступ.");
        seenCreators.add(creatorId);
      } else ensure(!isCreatorTeam(r), "Команда создателей доступна только по персональному коду.");
      const capital=m.capital??original.capital??0,streak=m.streak??original.streak??0;
      if(universal)ensure(integer(capital,0,RESOURCE_CAP)&&integer(streak,0,100000),'Проверьте личный рейтинг и серию.');
      return { pid: m.pid, name: creatorId&&!universal ? CREATOR_NAMES[creatorId] : cleanText(m.name, 2, 40, "Имя"), tokenHash: original.tokenHash, joinedAt: original.joinedAt, ...(universal?{capital,streak}:{}), ...(creatorId?{creatorId}:{}),...(original.privacyConsent?{privacyConsent:structuredClone(original.privacyConsent)}:{}) };
    });
    return { id: r.id, name, baseRegionId, capacity, points: r.points, economy: r.economy, members };
  });
}

function restoreSnapshot(raw) {
  ensure([2, 3, 4, 5].includes(raw?.schemaVersion) && integer(raw.revision, 0, Number.MAX_SAFE_INTEGER), "Неизвестная версия сохранения. Данные не были сброшены.");
  const state = structuredClone(raw);
  // Сохранения предыдущей версии могли содержать больше 1000 ресурсов.
  // Ограничиваем только это поле, сохраняя игроков, вопросы и текущий раунд.
  for (const region of state.regions || []) {
    if (integer(region.points, RESOURCE_CAP + 1, 10000000)) region.points = RESOURCE_CAP;
  }
  state.regions = validateRegions(state.regions,null,!!state.settings?.universal,state.settings?.mode);
  state.settings = { teamCapacity: state.settings?.teamCapacity ?? SEAT_LIMIT,...(state.settings?.universal?{universal:true,mode:state.settings.mode}:{}) };
  if(state.settings.universal){
    ensure(['team','solo'].includes(state.settings.mode)&&state.regions.length===10&&!state.regions.some(isCreatorTeam)&&state.regions.every(t=>t.capacity===4&&t.economy>=15),'Повреждены настройки формата игры.');
    for(const m of state.regions.flatMap(t=>t.members))ensure(integer(m.capital,0,RESOURCE_CAP)&&integer(m.streak,0,100000),'Повреждён личный рейтинг.');
  }
  ensure(integer(state.settings.teamCapacity, 1, MAX_TEAM_CAPACITY), "Повреждена настройка вместимости.");
  state.schemaVersion = 5;
  if(state.exitRequests!==undefined)ensure(Array.isArray(state.exitRequests)&&state.exitRequests.length<=40&&state.exitRequests.every(r=>typeof r.id==='string'&&typeof r.pid==='string'&&typeof r.name==='string'&&Number.isFinite(r.at)&&['pending','accepted','declined'].includes(r.status)), 'Повреждены запросы выхода.');
  if(state.presentationEffectsEnabled!==undefined)ensure(typeof state.presentationEffectsEnabled==='boolean','Повреждена настройка эффектов.');
  if(state.delegatedAdmins!==undefined)ensure(Array.isArray(state.delegatedAdmins)&&state.delegatedAdmins.length<=200&&state.delegatedAdmins.every(a=>a&&typeof a.pid==='string'&&/^[\w-]{1,80}$/.test(a.pid)&&a.permissions&&typeof a.permissions==='object'&&Number.isInteger(a.effectDuration)&&a.effectDuration>=100&&a.effectDuration<=60000&&typeof a.unlimitedEffects==='boolean'),'Повреждены делегированные права.');
  state.questions = validateQuestions(state.questions);
  state.branding = validateBranding(state.branding);
  ensure(["lobby", "playing", "ended"].includes(state.phase) && Array.isArray(state.log), "Повреждена структура сохранения.");
  if (state.round) {
    const r = state.round;
    ensure(typeof r.id === "string" && typeof r.questionId === "string" && typeof r.ballots === "object" && r.ballots !== null && !Array.isArray(r.ballots) && typeof r.submitted === "object" && r.submitted !== null && typeof r.results === "object" && r.results !== null, "Повреждён раунд.");
    ensure(integer(r.duration, 5, 3600) && integer(r.remainingMs, 0, 3600000) && typeof r.paused === "boolean" && typeof r.resolved === "boolean", "Повреждён таймер раунда.");
    ensure((r.paused || r.resolved) ? r.deadline === null : Number.isFinite(r.deadline), "Повреждена отметка времени.");
    validateQuestions([r.questionSnapshot]);
    for (const [pid, option] of Object.entries(r.ballots)) ensure(/^[\w-]{1,80}$/.test(pid) && integer(option, 0, 3), "Повреждены голоса.");
  }
  return state;
}

export class GameLogic {
  constructor(snapshot = null, clock = () => Date.now()) {
    this.now = clock;
    this.state = snapshot ? restoreSnapshot(snapshot) : freshState();
    this.state.branding ??= structuredClone(DEFAULT_BRANDING);
  }
  touch() { this.state.revision++; }
  updateBranding(raw){ensure(raw&&typeof raw==='object'&&!Array.isArray(raw),'Проверьте настройки организации.');const next=validateBranding({...this.state.branding,...raw});ensure(!this.state.round||this.state.round.resolved||next.subject===this.state.branding.subject,'Завершите вопрос перед сменой предмета.');this.state.branding=next;this.log('Обновлены оформление и настройки организации.');this.touch()}
  publicBranding(){const {logo,...publicSettings}=this.state.branding;return {...publicSettings,subjects:[...publicSettings.subjects],logoUrl:logo?'/api/logo?v='+hashToken(logo).slice(0,16):''}}
  backupSnapshot(){const snapshot=structuredClone(this.state);for(const key of ['restorePoints','hotfixBackup','migrationBackup'])delete snapshot[key];if(snapshot.round&&!snapshot.round.resolved){snapshot.round.remainingMs=this.remainingMs();snapshot.round.paused=true;snapshot.round.deadline=null}return snapshot}
  createRestorePoint(label='Ручная копия',advance=true){
    const point={id:randomUUID(),at:this.now(),label:cleanText(label,2,100,'Название копии'),snapshot:this.backupSnapshot()};
    this.state.restorePoints=[point,...(this.state.restorePoints||[])].slice(0,3);if(advance)this.touch();return point;
  }
  restoreBackup(snapshot,revision){
    ensure(revision===this.state.revision,'Игра уже изменилась. Обновите список копий перед восстановлением.','REVISION_CONFLICT');
    const restored=new GameLogic(snapshot,this.now).state;
    ensure(!!restored.settings.universal===!!this.state.settings.universal,'Копия использует другой формат движка.');
    const personal=this.state.regions.flatMap(t=>t.members.filter(m=>m.creatorId).map(m=>({teamId:t.id,member:structuredClone(m)})));
    restored.regions.forEach(t=>{t.members=t.members.filter(m=>!m.creatorId)});
    for(const saved of personal){const team=restored.regions.find(t=>t.id===saved.teamId)||restored.regions[0];team.members.push(saved.member)}
    if(restored.round&&!restored.round.resolved){restored.round.paused=true;restored.round.deadline=null;const ids=new Set(restored.regions.flatMap(t=>t.members.map(m=>m.pid)));for(const key of ['ballots','proposals'])for(const pid of Object.keys(restored.round[key]||{}))if(!ids.has(pid))delete restored.round[key][pid]}
    restored.revision=this.state.revision;restored.restorePoints=this.state.restorePoints;restored.delegatedAdmins=[];restored.presentationEffectsEnabled=this.state.presentationEffectsEnabled;restored.exitRequests=this.state.exitRequests||[];
    this.state=restored;this.log('Игра восстановлена из резервной копии. Активный вопрос поставлен на паузу.');this.touch();
  }
  enableUniversal(){
    if(this.state.settings.universal)return;
    const backup=structuredClone(this.state),old=this.state.regions;
    const templates=REGIONS.slice(0,10).map((r,i)=>({id:i===0?'saryarka':r.id,name:r.name,baseRegionId:r.id,capacity:4,points:0,economy:100,members:[]}));
    const players=old.flatMap(t=>t.members.map(m=>({...m,capital:m.capital??0,streak:m.streak??0,_base:metadataFor(t).baseRegionId})));
    for(const t of templates){const previous=old.find(r=>!isCreatorTeam(r)&&metadataFor(r).baseRegionId===t.baseRegionId);if(previous){t.points=previous.points;t.economy=Math.max(15,previous.economy)}}
    const mode=players.filter(m=>!m.creatorId).length>40?'solo':'team';
    for(const m of players){let team=templates.find(t=>t.baseRegionId===m._base&&(mode==='solo'||m.creatorId||t.members.filter(p=>!p.creatorId).length<4));team??=templates.find(t=>mode==='solo'||m.creatorId||t.members.filter(p=>!p.creatorId).length<4);delete m._base;team.members.push(m)}
    this.state.regions=templates;this.state.settings={universal:true,mode,teamCapacity:4};
    this.state.migrationBackup=backup;
    // An active question keeps its original snapshot and accepted votes.
    if(this.state.round){this.state.round.proposals={};const ids=new Set(templates.map(t=>t.id));for(const key of ['submitted','results'])for(const id of Object.keys(this.state.round[key]))if(!ids.has(id))delete this.state.round[key][id]}
    this.log('Включена универсальная платформа: 10 областей и два формата.');this.touch();
  }
  setGameMode(mode){
    ensure(this.state.settings.universal&&Object.hasOwn(MODE_NAMES,mode),'Неизвестный формат.');
    ensure(!this.state.round,'Завершите вопрос и вернитесь в лобби перед сменой формата.');
    if(mode===this.state.settings.mode)return;
    const members=this.state.regions.flatMap(t=>t.members);
    ensure(mode==='solo'||members.filter(m=>!m.creatorId).length<=40,'В командном формате 40 мест. Сначала освободите лишние места или оставайтесь в Solo.');
    if(mode==='team'){
      const excess=[];for(const t of this.state.regions){const normal=t.members.filter(m=>!m.creatorId);excess.push(...normal.slice(4));t.members=t.members.filter(m=>m.creatorId||normal.indexOf(m)<4)}
      for(const m of excess)this.state.regions.find(t=>t.members.filter(p=>!p.creatorId).length<4).members.push(m);
    }
    this.state.settings.mode=mode;this.state.phase='lobby';this.log('Формат: '+MODE_NAMES[mode]);this.touch();
  }
  ranking(){return this.state.regions.flatMap(t=>t.members.map(m=>({pid:m.pid,name:m.name,teamId:t.id,capital:m.capital??0,streak:m.streak??0,multiplier:soloMultiplier(m.streak)}))).sort((a,b)=>b.capital-a.capital||b.streak-a.streak||a.name.localeCompare(b.name,'ru'))}
  teamRanking(){return regularTeams(this.state.regions).map(t=>({teamId:t.id,name:t.name,points:t.points,economy:t.economy,members:t.members.filter(m=>!m.creatorId).length,capacity:t.capacity,rating:t.points+t.economy*5,development:developmentFor(t.points).name})).sort((a,b)=>b.rating-a.rating||b.points-a.points||b.economy-a.economy||a.name.localeCompare(b.name,'ru'))}
  log(msg) { this.state.log.unshift({ t: this.now(), msg }); this.state.log = this.state.log.slice(0, 100); }
  region(id) { const region = this.state.regions.find(r => r.id === id); ensure(region, "Регион не найден."); return region; }
  findPlayer(tokenHash) {
    for (const region of this.state.regions) {
      const member = region.members.find(m => m.tokenHash === tokenHash);
      if (member) return { regionId: region.id, ...member };
    }
    return null;
  }
  member(regionId, pid) { const m = this.region(regionId).members.find(p => p.pid === pid); ensure(m, "Войдите в команду заново.", "SESSION_EXPIRED"); return m; }
  creatorFor(tokenHash) {
    const p = tokenHash && this.findPlayer(tokenHash);
    return p && Object.hasOwn(CREATOR_NAMES,p.creatorId) && (this.state.settings.universal||p.regionId===CREATOR_TEAM_ID) ? p : null;
  }
  adminGrantFor(pid) { return (this.state.delegatedAdmins || []).find(a => a.pid === pid) || null; }
  adminCan(pid, action) {
    const grant = this.adminGrantFor(pid);
    if (!grant || !this.state.regions.some(t => t.members.some(m => m.pid === pid))) return false;
    if (action === 'renameSelf' || action === 'exportSummary') return Object.values(grant.permissions).some(value => value === true);
    const scope = action === 'presentationEffect' ? 'effects'
      : /^(freeSlot|movePlayer|renamePlayer|updatePlayer|renameTeam|removeTeam|removeAllPlayers)$/.test(action) ? 'players'
      : /^(addCustomQuestion|editQuestion|deleteQuestion|importQuestions|analyzeSyllabus|generateQuestions)$/.test(action) ? 'questions'
      : /^(startRound|switchQuestion|pauseRound|resetTimer|resolveRound|endRound|adjustPoints|adjustEconomy|adjustCapital|setGameMode|setSessionMode|resetGame)$/.test(action) ? 'game' : null;
    return !!(scope && grant.permissions[scope] === true);
  }
  grantAdmin(pid, permissions = {}, effectDuration = 3000, unlimitedEffects = false) {
    const member = this.state.regions.flatMap(t => t.members).find(m => m.pid === pid);
    ensure(member && !member.creatorId, 'Нельзя делегировать доступ создателю или отсутствующему игроку.');
    ensure(permissions && typeof permissions === 'object' && !Array.isArray(permissions), 'Выберите разрешения администратора.');
    ensure(Number.isInteger(effectDuration) && effectDuration >= 100 && effectDuration <= 60000, 'Длительность помехи: 100–60000 мс.');
    const safe = { players: !!permissions.players, questions: !!permissions.questions, game: !!permissions.game, effects: !!permissions.effects };
    ensure(Object.values(safe).some(Boolean), 'Выберите хотя бы одно разрешение или отзовите доступ.');
    const current = this.state.delegatedAdmins || [], previous = current.find(a => a.pid === pid);
    const grant = { pid, permissions: safe, effectDuration, unlimitedEffects: !!unlimitedEffects, grantedAt: previous?.grantedAt || this.now() };
    this.state.delegatedAdmins = [...current.filter(a => a.pid !== pid), grant]; this.log(`Административный доступ делегирован игроку ${member.name}.`); this.touch(); return grant;
  }
  revokeAdmin(pid) { const before = this.state.delegatedAdmins || []; this.state.delegatedAdmins = before.filter(a => a.pid !== pid); ensure(before.length !== this.state.delegatedAdmins.length, 'Делегированный доступ не найден.'); this.log('Делегированный административный доступ отозван.'); this.touch(); }
  joinCreator(creatorId,regionId,name) {
    ensure(Object.hasOwn(CREATOR_NAMES,creatorId), "Некорректный доступ создателя.");
    if(this.state.settings.universal){
      ensure(!this.state.regions.some(t=>t.members.some(m=>m.creatorId===creatorId)),"Доступ администратора уже занят. Продолжите в своём браузере или освободите доступ через преподавателя.",'CREATOR_OCCUPIED');
      const team=this.region(this.state.settings.mode==='solo'?this.state.regions[0].id:regionId);
      const token=randomBytes(32).toString('base64url'),member={pid:randomUUID(),name:cleanText(name||(creatorId==='adilet'?'Адлет':'Ернур'),2,40,'Имя'),creatorId,tokenHash:hashToken(token),joinedAt:this.now(),capital:0,streak:0};
      team.members.push(member);this.touch();return {playerToken:token,isCreator:true,player:{pid:member.pid,name:member.name,regionId:team.id}};
    }
    let team=this.state.regions.find(isCreatorTeam);
    ensure(!team?.members.some(m=>m.creatorId===creatorId), "Доступ администратора уже занят. Продолжите в своём браузере или освободите доступ через преподавателя.", "CREATOR_OCCUPIED");
    if(!team){
      const name=this.state.regions.some(t=>t.name==='Создатели игры')?'Создатели · Creative':'Создатели игры';
      team={id:CREATOR_TEAM_ID,name,baseRegionId:'astana',capacity:2,points:0,economy:100,members:[]};this.state.regions.push(team);
    }
    ensure(team.members.length<2,"Доступ администратора уже занят.","CREATOR_OCCUPIED");
    const token=randomBytes(32).toString('base64url'),member={pid:randomUUID(),name:CREATOR_NAMES[creatorId],creatorId,tokenHash:hashToken(token),joinedAt:this.now()};
    team.members.push(member);this.log(`${member.name} вошёл в команду создателей.`);this.touch();
    return {playerToken:token,isCreator:true,player:{pid:member.pid,name:member.name,regionId:team.id}};
  }
  joinTeam(regionId, name) {
    if(this.state.settings.universal&&this.state.settings.mode==='solo')regionId=this.state.regions[0].id;
    ensure(regionId!==CREATOR_TEAM_ID,"Команда создателей доступна только по персональному коду.","FORBIDDEN");
    const region = this.region(regionId);
    const cleanName = cleanText(name, 2, 40, "Имя");
    ensure(this.state.settings.mode==='solo'||(this.state.settings.universal?region.members.filter(m=>!m.creatorId).length:region.members.length) < capacityFor(region), `Команда уже заполнена (${capacityFor(region)}/${capacityFor(region)}).`, "TEAM_FULL");
    const token = randomBytes(32).toString("base64url");
    const player = { pid: randomUUID(), name: cleanName, tokenHash: hashToken(token), joinedAt: this.now(),...(this.state.settings.universal?{capital:0,streak:0}:{}) };
    region.members.push(player);
    this.log(`${cleanName} присоединился к команде «${this.region(regionId).name}».`);
    this.touch();
    return { playerToken: token, player: { pid: player.pid, name: player.name, regionId } };
  }
  leaveTeam(regionId, pid) {
    const region = this.region(regionId), member = this.member(regionId, pid);
    region.members = region.members.filter(m => m.pid !== pid);
    this.state.delegatedAdmins = (this.state.delegatedAdmins || []).filter(a => a.pid !== pid);
    this.clearMembershipVotes([pid], [regionId]);
    this.log(`${member.name}: место в команде освобождено.`);
    this.touch();
  }
  requestSessionExit(pid) {
    const member=this.state.regions.flatMap(t=>t.members).find(m=>m.pid===pid);
    ensure(member?.creatorId,'Персональный доступ не найден.');
    const requests=this.state.exitRequests??=[];
    const pending=requests.find(r=>r.pid===pid&&r.status==='pending');
    if(pending)return {exitRequested:true,requestId:pending.id};
    const last=requests.findLast(r=>r.pid===pid);
    ensure(!last||this.now()-last.at>=30000,'Запрос уже отправлен. Повторить можно через 30 секунд.','RATE_LIMIT');
    const request={id:randomUUID(),pid,name:member.name,at:this.now(),status:'pending'};
    requests.push(request);this.state.exitRequests=requests.slice(-40);this.touch();
    return {exitRequested:true,requestId:request.id};
  }
  respondSessionExit(pid, requestId, accept) {
    const request=this.state.exitRequests?.find(r=>r.id===requestId&&r.pid===pid&&r.status==='pending');
    ensure(request&&typeof accept==='boolean','Запрос уже закрыт или не принадлежит этой сессии.','REQUEST_CLOSED');
    request.status=accept?'accepted':'declined';request.respondedAt=this.now();
    if(accept){const team=this.state.regions.find(t=>t.members.some(m=>m.pid===pid));ensure(team,'Сессия уже завершена.');this.leaveTeam(team.id,pid)}else this.touch();
    return {accepted:accept};
  }
  removeOrdinaryPlayers() {
    let removed=0;
    for(const team of this.state.regions){const pids=team.members.filter(m=>!m.creatorId).map(m=>m.pid);if(!pids.length)continue;team.members=team.members.filter(m=>m.creatorId);this.clearMembershipVotes(pids,[team.id]);removed+=pids.length}
    if(removed){this.state.delegatedAdmins=[];this.log(`Освобождены обычные места: ${removed}. Персональные сессии сохранены.`);this.touch()}
    return {removed};
  }
  clearMembershipVotes(pids, teamIds) {
    const round = this.state.round;
    if (!round || round.resolved) return;
    for (const pid of pids) delete round.ballots[pid];
    for (const pid of pids){if(round.proposals)delete round.proposals[pid];if(this.state.settings.mode==='solo'){delete round.submitted[pid];delete round.results[pid]}}
    for (const id of teamIds) delete round.submitted[id];
  }
  movePlayer(pid, toTeamId) {
    const source = this.state.regions.find(t => t.members.some(m => m.pid === pid));
    ensure(source, "Участник не найден.");
    const target = this.region(toTeamId);
    ensure(!isCreatorTeam(source) && !isCreatorTeam(target), "Участники команды создателей входят только по персональным кодам.");
    ensure(source.id !== target.id, "Участник уже в этой команде.");
    const member = source.members.find(m => m.pid === pid);
    ensure(this.state.settings.mode==='solo'||member.creatorId&&this.state.settings.universal||(this.state.settings.universal?target.members.filter(m=>!m.creatorId).length:target.members.length) < capacityFor(target), "В выбранной команде нет свободных мест.", "TEAM_FULL");
    source.members = source.members.filter(m => m.pid !== pid); target.members.push(member);
    this.clearMembershipVotes([pid], [source.id, target.id]);
    this.log(`${member.name}: перенос из «${source.name}» в «${target.name}». При активном раунде нужно проголосовать заново.`);
    this.touch();
  }
  renamePlayer(pid, name) {
    const member = this.state.regions.flatMap(t => t.members).find(m => m.pid === pid);
    ensure(member, "Участник не найден.");
    ensure(this.state.settings.universal||!member.creatorId || name===CREATOR_NAMES[member.creatorId], "Имя создателя закреплено за его доступом.");
    const cleanName = cleanText(name, 2, 40, "Имя"), previous = member.name;
    member.name = cleanName; this.log(`${previous}: имя исправлено на «${cleanName}».`); this.touch();
  }
  updatePlayer(pid, name, toTeamId) {
    const source = this.state.regions.find(t=>t.members.some(m=>m.pid===pid));
    ensure(source, "Участник не найден.");
    const target = this.region(toTeamId), cleanName = cleanText(name,2,40,"Имя");
    ensure(source.id===target.id||this.state.settings.mode==='solo'||source.members.find(m=>m.pid===pid)?.creatorId&&this.state.settings.universal||(this.state.settings.universal?target.members.filter(m=>!m.creatorId).length:target.members.length)<capacityFor(target), "В выбранной команде нет свободных мест.", "TEAM_FULL");
    if (source.id!==target.id) this.movePlayer(pid,toTeamId);
    if (this.member(toTeamId,pid).name!==cleanName) this.renamePlayer(pid,cleanName);
  }
  setTeamCapacity(teamId, capacity) {
    ensure(!this.state.settings.universal||capacity===4,'В этом формате ровно четыре места в области.');
    ensure(integer(capacity, 1, MAX_TEAM_CAPACITY), `Вместимость: 1–${MAX_TEAM_CAPACITY} участников.`);
    const team = this.region(teamId);
    ensure(!isCreatorTeam(team) || capacity===2,"В команде создателей ровно два места.");
    ensure(team.members.length <= capacity, `В команде ${team.members.length} участников. Сначала перенесите лишних игроков.`);
    team.capacity = capacity; this.log(`Вместимость «${team.name}»: ${capacity}.`); this.touch();
  }
  setAllCapacities(capacity) {
    ensure(!this.state.settings.universal||capacity===4,'В этом формате ровно четыре места в области.');
    ensure(integer(capacity, 1, MAX_TEAM_CAPACITY), `Вместимость: 1–${MAX_TEAM_CAPACITY} участников.`);
    const teams=regularTeams(this.state.regions),crowded = teams.filter(t => t.members.length > capacity);
    ensure(!crowded.length, `Сначала перенесите игроков из переполненных команд: ${crowded.map(t => t.name).join(", ")}.`);
    teams.forEach(t => t.capacity = capacity); this.state.settings.teamCapacity = capacity;
    this.log(`Вместимость всех команд и новых команд: ${capacity}.`); this.touch();
  }
  startRound(questionId, duration) {
    ensure(!this.state.round || this.state.round.resolved, "Сначала завершите текущий вопрос.");
    ensure(integer(duration, 5, 3600), "Время вопроса: от 5 до 3600 секунд.");
    const question = this.state.questions.find(q => q.id === questionId);
    ensure(question, "Вопрос не найден.");
    ensure((question.subject||DEFAULT_SUBJECT)===this.state.branding.subject,'Выберите вопрос текущего предмета.');
    this.state.phase = "playing";
    this.state.round = { id: randomUUID(), questionId, questionSnapshot: structuredClone(question), startedAt: this.now(), duration, deadline: this.now() + duration * 1000, remainingMs: duration * 1000, paused: false, resolved: false, ballots: {}, submitted: {}, results: {},...(this.state.settings.universal?{proposals:{}}:{}) };
    this.log(`Начат вопрос: ${question.text}`);
    this.touch();
  }
  switchQuestion(questionId,duration) {
    ensure(this.state.questions.some(q=>q.id===questionId) && integer(duration,5,3600),"Проверьте вопрос и время.");
    if(this.state.round&&!this.state.round.resolved)this.log("Активный вопрос заменён без начисления очков. Голоса очищены.");
    this.state.round=null;this.startRound(questionId,duration);
  }
  requireRound(roundId, voting = false) {
    const round = this.state.round;
    ensure(round && !round.resolved && round.id === roundId, "Этот вопрос уже завершён или сменился.");
    if (voting) ensure(!round.paused && this.remainingMs() > 0, "Голосование приостановлено или время истекло.");
    return round;
  }
  remainingMs() {
    const round = this.state.round;
    if (!round || round.resolved) return 0;
    return round.paused ? round.remainingMs : Math.max(0, round.deadline - this.now());
  }
  votesFor(regionId) {
    const votes = {};
    for (const member of this.region(regionId).members) {
      const option = this.state.round?.ballots[member.pid];
      if (option !== undefined) votes[option] = (votes[option] || 0) + 1;
    }
    return votes;
  }
  castVote(regionId, pid, optionIdx, roundId) {
    this.member(regionId, pid);
    const round = this.requireRound(roundId, true);
    ensure(integer(optionIdx, 0, 3), "Вариант ответа должен быть от 0 до 3.");
    ensure(round.submitted[this.state.settings.mode==='solo'?pid:regionId] === undefined, "Ответ уже отправлен.");
    if(this.state.settings.universal&&this.state.settings.mode==='team'){
      if(round.proposals[pid]?.option===optionIdx)return;
      round.proposals[pid]={option:optionIdx,remainingAt:this.remainingMs()};this.touch();return;
    }
    if (round.ballots[pid] === optionIdx) return;
    round.ballots[pid] = optionIdx;
    this.touch();
  }
  confirmVote(regionId,pid,targetPid,roundId){
    this.member(regionId,pid);this.member(regionId,targetPid);const r=this.requireRound(roundId,true);
    ensure(this.state.settings.mode==='team'&&r.submitted[regionId]===undefined,'Подтверждение недоступно.');
    const p=r.proposals?.[targetPid];ensure(p,'Этот выбор уже отменён или принят.');r.ballots[targetPid]=p.option;delete r.proposals[targetPid];this.touch();
  }
  cancelVote(regionId,pid,roundId){this.member(regionId,pid);const r=this.requireRound(roundId,true);ensure(r.submitted[regionId]===undefined,'Ответ уже отправлен.');if(r.proposals?.[pid]){delete r.proposals[pid];this.touch()}}
  flushProposals(){
    const r=this.state.round;if(!r||r.resolved||r.paused||!r.proposals)return false;let changed=false;
    for(const [pid,p]of Object.entries(r.proposals))if(p.remainingAt-this.remainingMs()>=7000){const t=this.state.regions.find(t=>t.members.some(m=>m.pid===pid));if(t&&r.submitted[t.id]===undefined)r.ballots[pid]=p.option;delete r.proposals[pid];changed=true}
    if(changed)this.touch();return changed;
  }
  majority(regionId) {
    const sorted = Object.entries(this.votesFor(regionId)).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return { chosen: null, reason: "no_votes" };
    if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return { chosen: null, reason: "tie" };
    return { chosen: Number(sorted[0][0]), reason: "majority" };
  }
  teamSubmit(regionId, pid, roundId) {
    this.member(regionId, pid);
    const round = this.requireRound(roundId, true);
    if(this.state.settings.mode==='solo'){ensure(round.ballots[pid]!==undefined,'Сначала выберите ответ.');ensure(round.submitted[pid]===undefined,'Ответ уже отправлен.');round.submitted[pid]=round.ballots[pid];this.touch();return}
    ensure(round.submitted[regionId] === undefined, "Ответ команды уже отправлен.");
    const { chosen, reason } = this.majority(regionId);
    ensure(chosen !== null, reason === "tie" ? "Голоса разделились поровну. Обсудите ответ и измените голоса." : "Сначала проголосуйте.");
    round.submitted[regionId] = chosen;
    this.touch();
  }
  pauseRound() {
    const round = this.state.round;
    ensure(round && !round.resolved, "Нет активного раунда.");
    if (!round.paused) {
      ensure(this.remainingMs() > 0, "Время уже истекло.");
      round.remainingMs = this.remainingMs();
      round.deadline = null;
      round.paused = true;
    } else {
      round.deadline = this.now() + round.remainingMs;
      round.paused = false;
    }
    this.touch();
  }
  resetTimer() {
    const round = this.state.round;
    ensure(round && !round.resolved, "Нет активного раунда.");
    const previousRemaining=this.remainingMs();
    round.remainingMs = round.duration * 1000;
    for(const p of Object.values(round.proposals||{}))p.remainingAt=round.remainingMs+(p.remainingAt-previousRemaining);
    round.deadline = round.paused ? null : this.now() + round.remainingMs;
    this.log("Преподаватель перезапустил таймер.");
    this.touch();
  }
  resolveRound() {
    const round = this.state.round;
    if (!round || round.resolved) return;
    const question = round.questionSnapshot;
    if(this.state.settings.mode==='solo'){
      for(const m of this.state.regions.flatMap(t=>t.members)){
        const chosen=round.submitted[m.pid]??round.ballots[m.pid]??null,correct=chosen===question.correct,multiplier=soloMultiplier(m.streak),awarded=correct?Math.min(RESOURCE_CAP-m.capital,Math.round(25*multiplier)):0;
        m.capital+=awarded;m.streak=correct?m.streak+1:0;round.submitted[m.pid]=chosen;round.results[m.pid]={chosen,correct,awarded,multiplier,reason:chosen===null?'no_votes':'personal'};
      }
      round.resolved=true;round.paused=false;round.deadline=null;round.remainingMs=0;this.touch();return;
    }
    this.flushProposals();
    for (const region of this.state.regions) {
      if (!region.members.length) { round.results[region.id] = { chosen: null, correct: false, skipped: true, reason: "empty_team" }; continue; }
      const decision = round.submitted[region.id] !== undefined ? { chosen: round.submitted[region.id], reason: "submitted" } : this.majority(region.id);
      round.submitted[region.id] = decision.chosen;
      const correct = decision.chosen === question.correct;
      const awarded = correct ? Math.min(this.state.settings.universal?25:question.points, RESOURCE_CAP - region.points) : 0;
      round.results[region.id] = { ...decision, correct, awarded, atCap: region.points + awarded >= RESOURCE_CAP };
      if (correct){region.points += awarded;if(this.state.settings.universal)region.economy=Math.min(100,region.economy+(region.economy<30?15:5))}
      else region.economy = Math.max(this.state.settings.universal?ECONOMY_FLOOR:0, region.economy - ECONOMY_PENALTY);
    }
    round.resolved = true;
    round.paused = false;
    round.deadline = null;
    round.remainingMs = 0;
    this.log("Раунд завершён. Голоса без ручной отправки учтены автоматически.");
    this.touch();
  }
  endRound() {
    ensure(!this.state.round || this.state.round.resolved, "Сначала подведите итоги вопроса.");
    this.state.round = null;
    this.touch();
  }
  adjustPoints(regionId, delta) {
    ensure(integer(delta, -100000, 100000), "Некорректное изменение ресурса.");
    const region = this.region(regionId);
    const previous = region.points;
    region.points = Math.min(RESOURCE_CAP, Math.max(0, region.points + delta));
    const applied = region.points - previous;
    this.log(`Ресурс «${this.region(regionId).name}»: ${applied > 0 ? "+" : ""}${applied}. ${region.points}/${RESOURCE_CAP}${region.points === RESOURCE_CAP ? " — город построен." : "."}`);
    this.touch();
  }
  adjustEconomy(regionId, delta) {
    ensure(integer(delta, -100, 100), "Некорректное изменение экономики.");
    const region = this.region(regionId);
    region.economy = Math.min(100, Math.max(this.state.settings.universal?15:0, region.economy + delta));
    this.log(`Экономика «${this.region(regionId).name}»: ${delta > 0 ? "+" : ""}${delta}%.`);
    this.touch();
  }
  addCustomQuestion(text, options, correctIdx, points = 25) {
    const question = validateQuestions([{ id: `custom_${randomUUID()}`, text, options, correct: correctIdx, points,subject:this.state.branding.subject }])[0];
    ensure(this.state.questions.length < 1000, "В банке уже 1000 вопросов.");
    this.state.questions.push(question);
    this.log("В банк добавлен вопрос.");
    this.touch();
    return { questionId: question.id };
  }
  createTeam(name, baseRegionId, capacity = this.state.settings.teamCapacity, points = 0, economy = 100) {
    ensure(!this.state.settings.universal,'В региональном формате закреплены 10 областей.');
    ensure(regularTeams(this.state.regions).length < MAX_TEAMS, `Максимум ${MAX_TEAMS} команд.`);
    const cleanName = cleanText(name, 2, 60, "Команда");
    ensure(!this.state.regions.some(t => t.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase()), "Такая команда уже есть.");
    baseRegionId = normalizeRegionId(baseRegionId);
    ensure(REGIONS.some(r => r.id === baseRegionId), "Выберите регион карты.");
    ensure(integer(capacity, 1, MAX_TEAM_CAPACITY), `Вместимость: 1–${MAX_TEAM_CAPACITY}.`);
    ensure(integer(points, 0, RESOURCE_CAP) && integer(economy, 0, 100), `Ресурс: 0–${RESOURCE_CAP}; экономика: 0–100.`);
    const id = `team_${randomUUID()}`;
    this.state.regions.push({id,name:cleanName,baseRegionId,capacity,points,economy,members:[]});
    this.log(`Создана команда «${cleanName}».`); this.touch(); return {teamId:id};
  }
  expandTeams(count) {
    if(this.state.settings.universal){ensure(count===10,'В региональном формате ровно 10 областей.');return}
    ensure(integer(count, 1, MAX_TEAMS), `Количество команд: 1–${MAX_TEAMS}.`);
    ensure(count >= regularTeams(this.state.regions).length, "Для уменьшения используйте точное количество команд.");
    let number = 1;
    while (regularTeams(this.state.regions).length < count) {
      while (this.state.regions.some(t => t.name === `Команда ${number}`)) number++;
      const base = [...REGIONS].sort((a,b) => this.state.regions.filter(t=>t.baseRegionId===a.id).length - this.state.regions.filter(t=>t.baseRegionId===b.id).length)[0];
      const baseName = base.name.replace(/ облысы$/, "");
      const name = this.state.regions.some(t=>t.name.toLocaleLowerCase()===baseName.toLocaleLowerCase()) ? `Команда ${number++}` : baseName;
      this.createTeam(name,base.id);
    }
  }
  teamLayoutToken() {
    return hashToken(JSON.stringify([this.state.settings.teamCapacity,this.state.regions.map(t => [t.id,t.name,t.capacity,t.baseRegionId,t.points,t.economy,t.members.map(m=>[m.pid,m.name])])]));
  }
  planTeamCount(count) {
    ensure(!this.state.settings.universal||count===10,'В региональном формате ровно 10 областей.');
    ensure(integer(count, 1, MAX_TEAMS), `Количество команд: 1–${MAX_TEAMS}.`);
    const teams = regularTeams(this.state.regions);
    const keepIds = new Set(teams.map((team,index)=>({team,index})).sort((a,b)=>b.team.members.length-a.team.members.length || b.team.points-a.team.points || a.index-b.index).slice(0,count).map(({team})=>team.id));
    const kept = teams.filter(t=>keepIds.has(t.id)), removed = teams.filter(t=>!keepIds.has(t.id));
    const occupancy = new Map(kept.map(t=>[t.id,t.members.length])), moves = [];
    let overflow = 0;
    for (const source of removed) for (const member of source.members) {
      const target = kept.filter(t=>occupancy.get(t.id)<capacityFor(t)).sort((a,b)=>occupancy.get(a.id)-occupancy.get(b.id))[0];
      if (!target) { overflow++; continue; }
      occupancy.set(target.id,occupancy.get(target.id)+1);
      moves.push({pid:member.pid,name:member.name,fromTeamId:source.id,toTeamId:target.id,toTeamName:target.name});
    }
    return {count,currentCount:teams.length,added:Math.max(0,count-teams.length),removed:removed.map(t=>({id:t.id,name:t.name,points:t.points,players:t.members.length})),moves,overflow,capacity:count>teams.length?totalCapacity(teams)+(count-teams.length)*this.state.settings.teamCapacity:totalCapacity(kept),totalPlayers:teams.reduce((s,t)=>s+t.members.length,0),layoutToken:this.teamLayoutToken()};
  }
  setTeamCount(count, layoutToken) {
    if (layoutToken !== undefined) ensure(layoutToken === this.teamLayoutToken(), "Состав команд изменился. Проверьте план ещё раз.", "REVISION_CONFLICT");
    const plan = this.planTeamCount(count);
    ensure(!plan.overflow, `Не хватает ${plan.overflow} мест. Увеличьте вместимость команд или перенесите участников перед уменьшением.`);
    if (count >= regularTeams(this.state.regions).length) { this.expandTeams(count); return {count,added:plan.added,moved:0,removed:0}; }
    for (const move of plan.moves) this.movePlayer(move.pid,move.toTeamId);
    for (const team of plan.removed) this.removeTeam(team.id);
    this.log(`Установлено команд: ${count}. Перенесено участников: ${plan.moves.length}.`); this.touch();
    return {count,added:0,moved:plan.moves.length,removed:plan.removed.length};
  }
  updateTeam(teamId, changes) {
    ensure(changes && typeof changes === "object", "Проверьте поля команды.");
    if(this.state.settings.universal){const team=this.region(teamId);ensure(changes.capacity===4,'В области четыре обычных места.');ensure(changes.name===team.name,'Название области закреплено.');ensure(changes.baseRegionId===team.baseRegionId,'География области закреплена.');ensure(integer(changes.economy,15,100),'Экономика: от 15% до 100%.')}
    const team = this.region(teamId), known = new Map(this.state.regions.flatMap(t=>t.members).map(m=>[m.pid,m]));
    const candidate = {...team,name:changes.name,baseRegionId:changes.baseRegionId,capacity:changes.capacity,points:changes.points,economy:changes.economy};
    const validated = validateRegions(this.state.regions.map(t=>t.id===teamId?candidate:t),known,!!this.state.settings.universal,this.state.settings.mode);
    this.state.regions = validated;
    this.log(`Настройки команды «${candidate.name}» сохранены.`); this.touch();
  }
  renameTeam(teamId, name, baseRegionId) {
    this.updateTeam(teamId,{...this.region(teamId),name,baseRegionId});
  }
  removeTeam(teamId) {
    ensure(!this.state.settings.universal,'В региональном формате закреплены 10 областей.');
    ensure(teamId!==CREATOR_TEAM_ID,"Команда создателей зарезервирована. Освободите доступ участника вместо удаления команды.");
    ensure(regularTeams(this.state.regions).length>1,"Оставьте хотя бы одну команду.");
    const team=this.region(teamId), pids=new Set(team.members.map(m=>m.pid));
    this.state.regions=this.state.regions.filter(t=>t.id!==teamId);
    if(this.state.round){
      for(const pid of pids)delete this.state.round.ballots[pid];
      delete this.state.round.submitted[teamId];delete this.state.round.results[teamId];
    }
    this.log(`Команда «${team.name}» удалена, её участники вышли из игры.`);this.touch();
  }
  editQuestion(id, changes, expectedVersion) {
    const index=this.state.questions.findIndex(q=>q.id===id);ensure(index>=0,"Вопрос не найден.");
    const current=this.state.questions[index];
    ensure(expectedVersion===(current.version||1),"Вопрос уже изменён. Откройте его заново.","REVISION_CONFLICT");
    const question=validateQuestions([{...changes,subject:changes.subject||current.subject||DEFAULT_SUBJECT,id,version:(current.version||1)+1}])[0];
    this.state.questions[index]=question;this.log("Вопрос обновлён в банке. Активный раунд использует свою сохранённую версию.");this.touch();
    return {questionId:id,activeRoundUnchanged:this.state.round?.questionId===id&&!this.state.round.resolved};
  }
  deleteQuestion(id) {
    ensure(this.state.questions.length>1,"Оставьте хотя бы один вопрос.");
    ensure(this.state.questions.some(q=>q.id===id),"Вопрос не найден.");
    ensure(!this.state.round || this.state.round.resolved || this.state.round.questionId!==id,"Сначала завершите активный вопрос.");
    this.state.questions=this.state.questions.filter(q=>q.id!==id);this.log("Вопрос удалён из банка.");this.touch();
  }
  importQuestions(drafts) {
    ensure(Array.isArray(drafts)&&drafts.length>=1&&drafts.length<=60,"Можно добавить от 1 до 60 вопросов за раз.");
    const signature=q=>(q.subject||DEFAULT_SUBJECT)+'\n'+q.text.toLocaleLowerCase().trim();
    const seen=new Set(this.state.questions.map(signature));
    const questions=validateQuestions(drafts.map(q=>({...q,subject:q.subject||this.state.branding.subject,id:`import_${randomUUID()}`,version:1}))).filter(q=>{const key=signature(q);if(seen.has(key))return false;seen.add(key);return true});
    ensure(this.state.questions.length+questions.length<=1000,"В банке может быть максимум 1000 вопросов.");
    if(questions.length){this.state.questions.push(...questions);this.log(`Добавлено вопросов из силлабуса: ${questions.length}.`);this.touch();}
    return {added:questions.length,skipped:drafts.length-questions.length};
  }
  resetGame() {
    const questions = this.state.questions, revision = this.state.revision, settings = this.state.settings;
    const exitRequests=this.state.exitRequests,presentationEffectsEnabled=this.state.presentationEffectsEnabled,branding=this.state.branding,restorePoints=this.state.restorePoints;
    const teams = this.state.regions.map(r => ({...r,points:0,economy:100,members:r.members.filter(m=>m.creatorId).map(m=>({...m,...(settings.universal?{capital:0,streak:0}:{})}))}));
    this.state = freshState();
    this.state.questions = questions;
    this.state.settings = settings;
    this.state.regions = teams;
    this.state.branding=branding;this.state.restorePoints=restorePoints;
    this.state.revision = revision;
    if(exitRequests)this.state.exitRequests=exitRequests;
    if(presentationEffectsEnabled!==undefined)this.state.presentationEffectsEnabled=presentationEffectsEnabled;
    this.log("Игра сброшена. Банк вопросов сохранён.");
    this.touch();
  }
  editorSnapshot() {
    return { revision: this.state.revision, settings: {...this.state.settings}, regions: this.state.regions.map(r => ({ ...r, members: r.members.map(({ pid, name,capital,streak }) => ({ pid, name,...(this.state.settings.universal?{capital,streak}:{}) })) })), questions: structuredClone(this.state.questions) };
  }
  applyRawState(raw) {
    ensure(raw && typeof raw === "object" && Object.keys(raw).every(k => ["revision", "settings", "regions", "questions"].includes(k)), "Редактор принимает revision, settings, regions и questions.");
    ensure(raw.revision === this.state.revision, "Состояние уже изменилось. Обновите JSON и повторите правку.", "REVISION_CONFLICT");
    const known = new Map(this.state.regions.flatMap(r => r.members).map(m => [m.pid, m]));
    const regions = validateRegions(raw.regions, known,!!this.state.settings.universal,this.state.settings.mode);
    const settings = raw.settings ?? this.state.settings;
    ensure(integer(settings?.teamCapacity, 1, MAX_TEAM_CAPACITY), `Вместимость новых команд: 1–${MAX_TEAM_CAPACITY}.`);
    if(this.state.settings.universal){
      ensure(settings.universal===true&&settings.mode===this.state.settings.mode&&settings.teamCapacity===4,'Формат переключается отдельной командой в лобби.');
      ensure(regions.length===10&&regions.every(t=>{const old=this.state.regions.find(r=>r.id===t.id);return old&&old.baseRegionId===t.baseRegionId&&old.name===t.name&&t.capacity===4&&t.economy>=15}),'Сохраните 10 областей, четыре обычных места и экономику не ниже 15%.');
    }
    const questions = validateQuestions(raw.questions);
    const round = this.state.round;
    if (round && !round.resolved) {
      const current = questions.find(q => q.id === round.questionId);
      ensure(JSON.stringify(current) === JSON.stringify(this.state.questions.find(q => q.id === round.questionId)), "Завершите текущий раунд перед изменением его вопроса.");
    }
    const previousTeams = new Map(this.state.regions.flatMap(t=>t.members.map(m=>[m.pid,t.id])));
    const backup=structuredClone(this.state);delete backup.hotfixBackup;
    delete backup.restorePoints;
    this.state.hotfixBackup={at:this.now(),state:backup};
    this.state.regions = regions;
    const activePlayers = new Set(regions.flatMap(r => r.members.map(m => m.pid)));
    this.state.delegatedAdmins = (this.state.delegatedAdmins || []).filter(a => activePlayers.has(a.pid));
    this.state.settings = {...this.state.settings,teamCapacity:settings.teamCapacity};
    this.state.questions = questions;
    if (round && !round.resolved) {
      const existing = new Set(regions.flatMap(r => r.members).map(m => m.pid));
      for (const pid of Object.keys(round.ballots)) if (!existing.has(pid)) delete round.ballots[pid];
      const currentTeams = new Map(regions.flatMap(t=>t.members.map(m=>[m.pid,t.id])));
      for (const [pid, oldTeam] of previousTeams) if (currentTeams.get(pid)!==oldTeam) this.clearMembershipVotes([pid],[oldTeam,...(currentTeams.has(pid)?[currentTeams.get(pid)]:[])]);
      const teams = this.state.settings.mode === 'solo' ? existing : new Set(regions.map(r=>r.id));
      for (const id of Object.keys(round.submitted)) if (!teams.has(id)) delete round.submitted[id];
      for (const id of Object.keys(round.results)) if (!teams.has(id)) delete round.results[id];
    }
    this.log("Преподаватель применил проверенный JSON-патч.");
    this.touch();
  }
  publicFrame(onlinePlayers = new Set()) {
    return {
      branding:this.publicBranding(),
      regions:this.state.regions.map(r=>({...r,members:r.members.map(({pid,name,capital,streak})=>({pid,name,online:onlinePlayers.has(pid),...(this.state.settings.universal?{capital,streak}:{})})),...(this.state.settings.universal?{occupied:r.members.filter(m=>!m.creatorId).length}:{})})),
      leaderboard:this.state.settings.mode==='solo'?this.ranking():[],
      teamLeaderboard:this.state.settings.mode==='team'?this.teamRanking():[],
      votes:this.state.round?Object.fromEntries(this.state.regions.map(r=>[r.id,this.votesFor(r.id)])):{}
    };
  }
  view(actor = {}, onlinePlayers = new Set(), frame = this.publicFrame(onlinePlayers)) {
    const player = actor.playerHash ? this.findPlayer(actor.playerHash) : null;
    const creator = actor.role === "creator" && !!this.creatorFor(actor.playerHash);
    const delegated = !creator && actor.role !== 'teacher' && player ? this.adminGrantFor(player.pid) : null;
    const adminView = actor.role === "teacher" || creator || !!delegated;
    const teacher = actor.role === "teacher" || creator;
    const view = {
      revision: this.state.revision, phase: this.state.phase, serverTime: this.now(),
      settings: {...this.state.settings},
      branding:frame.branding,
      viewer: { role: creator ? "creator" : teacher ? "teacher" : delegated ? "delegate" : player ? "student" : "guest", isCreator:creator,isDevTelemetry:creator||!!delegated,isProAdmin:creator&&player?.creatorId==='adilet',canGrantAdmin:creator&&player?.creatorId==='adilet',canTriggerPresentationEffect:creator&&player?.creatorId==='adilet'||!!(player&&this.adminCan(player.pid,'presentationEffect')),adminGrant:delegated, player: player ? { pid: player.pid, name: player.name, regionId: player.regionId,capital:player.capital??0,streak:player.streak??0 } : null },
      regions: frame.regions,
      leaderboard:frame.leaderboard,teamLeaderboard:frame.teamLeaderboard,
      questions: teacher || delegated?.permissions.questions ? structuredClone(this.state.questions) : delegated?.permissions.game ? this.state.questions.map(({id,text,options,points,version,topic,subject})=>({id,text,options:[...options],points,version,topic,subject})) : [],
      round: null, log: adminView ? structuredClone(this.state.log) : []
    };
    if(adminView)view.sessionControl={protectedPlayerIds:this.state.regions.flatMap(t=>t.members.filter(m=>m.creatorId).map(m=>m.pid)),effectTargetIds:this.state.regions.flatMap(t=>t.members.filter(m=>!m.creatorId&&!this.adminGrantFor(m.pid)&&onlinePlayers.has(m.pid)).map(m=>m.pid)),presentationEffectsEnabled:this.state.presentationEffectsEnabled!==false,delegatedAdmins:creator&&player?.creatorId==='adilet'?structuredClone(this.state.delegatedAdmins||[]):[],...(actor.role==='teacher'?{exitRequests:structuredClone(this.state.exitRequests||[])}:{})};
    if(creator)view.viewer.exitRequest=structuredClone(this.state.exitRequests?.find(r=>r.pid===player.pid&&r.status==='pending')||null);
    if(teacher)view.restorePoints=(this.state.restorePoints||[]).map(({id,at,label})=>({id,at,label}));
    if(!player&&!teacher&&!delegated){view.regions=frame.regions.map(r=>({...r,members:[]}));view.leaderboard=[];return view}
    if (this.state.round) {
      const { ballots, proposals, questionSnapshot, ...round } = this.state.round;
      const { id, text, options, points, topic } = questionSnapshot;
      const publicQuestion = { id, text, options, points, ...(topic ? {topic} : {}) };
      const roundBase = {...round};
      if(this.state.settings.universal&&this.state.settings.mode==='solo'&&!teacher){roundBase.submitted=player&&Object.hasOwn(round.submitted,player.pid)?{[player.pid]:round.submitted[player.pid]}:{};roundBase.results=round.resolved?round.results:{}}
      view.round = { ...structuredClone(roundBase), question: teacher || delegated?.permissions.questions || round.resolved ? structuredClone(questionSnapshot) : publicQuestion, remainingMs: this.remainingMs(), votes: frame.votes, myVote: player ? ballots[player.pid] ?? null : null };
      if(this.state.settings.universal){
        view.round.proposals=Object.entries(proposals||{}).flatMap(([pid,p])=>{const team=this.state.regions.find(t=>t.members.some(m=>m.pid===pid));return team&&(teacher||team.id===player?.regionId)?[{pid,name:team.members.find(m=>m.pid===pid).name,option:p.option,remainingMs:Math.max(0,7000-(p.remainingAt-this.remainingMs()))}]:[]});
        if(this.state.settings.mode==='solo'&&!teacher){view.round.submitted=player&&Object.hasOwn(round.submitted,player.pid)?{[player.pid]:round.submitted[player.pid]}:{};view.round.results=round.resolved?round.results:{};view.round.votes={}}
      }
      if (teacher || delegated?.permissions.questions) view.round.preview = this.state.regions.map(team => {
        const submitted = round.submitted[team.id] !== undefined;
        const result = round.resolved ? round.results[team.id] : null;
        const decision = result ? {chosen:result.chosen,reason:result.reason} : submitted ? {chosen: round.submitted[team.id], reason:"submitted"} : this.majority(team.id);
        return { teamId: team.id, submitted, ...decision, correct: decision.chosen === null ? null : decision.chosen === questionSnapshot.correct, voters: Object.values(this.votesFor(team.id)).reduce((a,b)=>a+b,0), empty: !team.members.length };
      });
      if((teacher||delegated?.permissions.questions)&&this.state.settings.mode==='solo')view.round.preview=frame.leaderboard.map(m=>{const chosen=round.submitted[m.pid]??ballots[m.pid]??null;return {teamId:m.pid,name:m.name,chosen,correct:chosen===null?null:chosen===questionSnapshot.correct,submitted:round.submitted[m.pid]!==undefined,voters:chosen===null?0:1,empty:false}});
    }
    return view;
  }
  hotfixBackupSnapshot() {
    ensure(this.state.hotfixBackup?.state,"Резервной копии пока нет.");
    const saved=new GameLogic(this.state.hotfixBackup.state,this.now);
    return {at:this.state.hotfixBackup.at,snapshot:saved.editorSnapshot()};
  }
  exportSummary() {
    if(this.state.settings.mode==='solo')return this.ranking().map(m=>({region:m.name,members:m.name,points:m.capital,economy:100,development:`Серия ${m.streak} · ×${m.multiplier}`,status:'личный рейтинг'}));
    return this.teamRanking().map(row => {const r=this.region(row.teamId);return {region:r.name,members:r.members.map(m=>m.name).join(', '),points:r.points,economy:r.economy,rating:row.rating,development:row.development,status:r.economy<CRISIS_THRESHOLD?'кризис':'норма'}});
  }
}

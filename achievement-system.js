import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {ACHIEVEMENTS,RESOURCE_CAP} from './game-config.js';

// Server-only catalogue: undiscovered secret names and conditions are never sent to students.
export const AWARD_CATALOG=[
 {...ACHIEVEMENTS[0],rarity:'legendary',stone:'power',effect:'drill',world:true},
 {id:'neon-summit',title:'Смотри, мама, я здесь... На самой вершине башни Арасака.',description:'Первым в сессии заработать 500 ресурсов команды или личного капитала ответами. Все одновременные первые получают награду.',rarity:'legendary',stone:'space',effect:'tower',icon:'▥',secret:true,world:true},
 {id:'zero-card',title:'Нулевая карта',description:'После половины сессии занимать последнее место, а на последнем вопросе впервые после середины выйти на первое. Не меньше 10 разных вопросов и 4 соревнующихся команд или игроков.',rarity:'legendary',stone:'reality',effect:'card',icon:'0',secret:true,world:true},
 {id:'scenario-reader',title:'Этот сценарий я уже читал',description:'За сессию верно решить 3 разных вопроса, в каждом из которых ошиблись не менее 80% ответивших соперников. На вопрос должны ответить минимум 5 команд или игроков.',rarity:'legendary',stone:'mind',effect:'book',icon:'▤',secret:true,world:true},
 {id:'determination',title:'Ты всё ещё полон решимости',description:'После трёх неверных ответов подряд правильно ответить на 10 разных вопросов подряд в той же сессии.',rarity:'legendary',stone:'soul',effect:'heart',icon:'♥',secret:true,world:true},
 {id:'daily-training',title:'Обычная тренировка',description:'Правильно решить 100 разных вопросов за всё время. В командной игре учитывается личный правильный выбор. Повтор того же вопроса не увеличивает счётчик.',rarity:'legendary',stone:'time',effect:'sun',icon:'✹',secret:true,world:true},
 {id:'basic-implant',title:'Рудиментарный имплант',description:'За сессию ответить на 5 разных вопросов за 5 секунд от начала каждого. Правильность не важна, серия не обязательна. Реакция улучшена. Мышление — в стандартной комплектации.',rarity:'common',effect:'chip',icon:'⚡'},
 {id:'foresight',title:'Похоже, ты наделён даром предвидения!',description:'В Solo дать 3 правильных ответа подряд на разные вопросы, каждый — не позднее 5 секунд от его начала.',rarity:'rare',effect:'eye',icon:'◉'},
 {id:'near-victory',title:'Ты почти смог, Джо',description:'Завершить сессию вторым с отставанием от лидера от 1 до 25 очков рейтинга. Нужно хотя бы 5 разных вопросов.',rarity:'rare',effect:'medal',icon:'Ⅱ'},
 {id:'perfect-form',title:'Карс?',description:'Правильно ответить на все вопросы завершённой сессии с самого начала. Минимум 10 разных вопросов; пропуски и повтор одного вопроса не засчитываются.',rarity:'rare',effect:'eclipse',icon:'☀'},
 {id:'infinity-gauntlet',title:'Я — сама неотвратимость',description:'Собрать все 6 разных легендарных достижений игровым путём. При включённых перках снимает предел 1000 очков в Solo и у команды обладателя. Ручные награды не собирают камни.',rarity:'perk',effect:'gauntlet',icon:'∞',secret:true,world:true}
];
export const STONES=['power','space','reality','mind','soul','time'];
export const LEGENDARY_IDS=AWARD_CATALOG.filter(a=>a.stone).map(a=>a.id);
export const PROFILE_RETENTION_MS=180*86400000;
export const SAFE_SCORE=Number.MAX_SAFE_INTEGER-1000;
const byId=new Map(AWARD_CATALOG.map(a=>[a.id,a]));
export const awardDefinition=id=>byId.get(id);
const digest=value=>createHash('sha256').update(value).digest('hex');
const members=g=>g.state.regions.flatMap(t=>t.members);
const questionKey=q=>digest(JSON.stringify([q.subject||'',q.text.trim(),q.options.map(s=>s.trim()),q.correct]));
const automatic=a=>a.source!=='manual';
const earned=(p,id)=>p?.earned.some(a=>a.achievementId===id&&automatic(a));
export const completedStones=p=>LEGENDARY_IDS.filter(id=>earned(p,id));
export const ownsInfinity=p=>completedStones(p).length===LEGENDARY_IDS.length;
const profileIndexes=new WeakMap();
function profileIndex(g){
 let index=profileIndexes.get(g);const state=g.state;
 if(!index||index.state!==state||index.revision!==state.revision||index.profiles!==state.awardProfiles){
  index={state,revision:state.revision,profiles:state.awardProfiles,people:new Map(members(g).map(m=>[m.pid,m])),byId:new Map((state.awardProfiles||[]).map(p=>[p.id,p]))};profileIndexes.set(g,index);
 }
 return index;
}
export const profileFor=(g,pid)=>{const index=profileIndex(g),m=index.people.get(pid);return m?.profileId?index.byId.get(m.profileId):null};

export function validateAwardState(state,ensure){
 if(state.awardSystemVersion!==undefined)ensure(state.awardSystemVersion===1,'Неизвестная версия коллекции.');
 if(state.awardProfiles===undefined)return;
 ensure(Array.isArray(state.awardProfiles)&&state.awardProfiles.length<=2000,'Повреждена коллекция.');
 const ids=new Set(),tokens=new Set(),owners=new Set();
 for(const p of state.awardProfiles){
  ensure(p&&typeof p.id==='string'&&/^[\w-]{1,80}$/.test(p.id)&&!ids.has(p.id)&&Number.isFinite(p.updatedAt)&&Array.isArray(p.earned)&&p.earned.length<=AWARD_CATALOG.length&&Array.isArray(p.studied)&&p.studied.length<=100,'Повреждён профиль коллекции.');ids.add(p.id);
  ensure(p.tokenHash===null||typeof p.tokenHash==='string'&&/^[a-f0-9]{64}$/.test(p.tokenHash)&&!tokens.has(p.tokenHash),'Повреждён ключ коллекции.');if(p.tokenHash)tokens.add(p.tokenHash);
  ensure(!p.creatorId||['ernur','adilet'].includes(p.creatorId)&&!owners.has(p.creatorId),'Повреждён владелец коллекции.');if(p.creatorId)owners.add(p.creatorId);
  const awards=new Set();for(const a of p.earned){ensure(a&&byId.has(a.achievementId)&&!awards.has(a.achievementId)&&typeof a.id==='string'&&Number.isFinite(a.earnedAt)&&['earned','comeback','manual'].includes(a.source),'Повреждена награда коллекции.');awards.add(a.achievementId)}
  ensure(p.studied.every(k=>typeof k==='string'&&/^[a-f0-9]{64}$/.test(k))&&new Set(p.studied).size===p.studied.length,'Повреждён счётчик изученных вопросов.');
 }
 const bound=new Set();for(const m of state.regions.flatMap(t=>t.members))if(m.profileId){const p=state.awardProfiles.find(p=>p.id===m.profileId);ensure(p&&!bound.has(p.id)&&(!p.creatorId||p.creatorId===m.creatorId),'Повреждена привязка коллекции.');bound.add(p.id)}
}

export function ensurePlayerProfile(g,pid,cookieHash=null){
 const m=members(g).find(m=>m.pid===pid);if(!m)throw new Error('Player missing while binding collection');
 g.state.awardProfiles??=[];
 let p=m.profileId?g.state.awardProfiles.find(p=>p.id===m.profileId):null;
 if(!p&&m.creatorId)p=g.state.awardProfiles.find(p=>p.creatorId===m.creatorId);
 if(!p&&!m.creatorId&&cookieHash)p=g.state.awardProfiles.find(p=>p.tokenHash===cookieHash&&!p.creatorId);
 if(p&&members(g).some(other=>other.pid!==pid&&other.profileId===p.id))return null;
 if(!p){
  const active=new Set(members(g).map(m=>m.profileId));
  g.state.awardProfiles=g.state.awardProfiles.filter(p=>active.has(p.id)||p.creatorId||p.updatedAt>g.now()-PROFILE_RETENTION_MS);
  if(g.state.awardProfiles.length>=2000)throw new Error('Collection storage limit reached');
  p={id:randomUUID(),tokenHash:null,updatedAt:g.now(),earned:[],studied:[],...(m.creatorId?{creatorId:m.creatorId}:{})};g.state.awardProfiles.push(p);
 }
 if(m.profileId!==p.id){m.profileId=p.id;g.touch()}return p;
}

export function initializeAwards(g){
 const migrate=g.state.awardSystemVersion!==1;g.state.awardSystemVersion=1;g.state.awardProfiles??=[];g.state.settings.perksEnabled??=true;
 if(migrate){
  for(const m of members(g)){const p=ensurePlayerProfile(g,m.pid);for(const a of g.state.achievements||[])if(a.recipientIds.includes(m.pid))saveToProfile(p,a);}
  g.touch();
 }
}
export function issueCollectionCookie(g,pid,existingToken){
 const p=ensurePlayerProfile(g,pid,typeof existingToken==='string'?digest(existingToken):null);if(!p)return null;
 p.updatedAt=g.now();g.touch();if(existingToken&&p.tokenHash===digest(existingToken))return existingToken;
 const token=randomBytes(32).toString('base64url');p.tokenHash=digest(token);return token;
}
function saveToProfile(p,award){
 const existing=p.earned.find(a=>a.achievementId===award.achievementId);
 if(existing&&(automatic(existing)||!automatic(award)))return;
 const entry={id:award.id,achievementId:award.achievementId,earnedAt:award.earnedAt,source:award.source,matchId:award.matchId,reason:award.reason||'manual'};
 if(existing)p.earned[p.earned.indexOf(existing)]=entry;else p.earned.push(entry);
 p.updatedAt=award.earnedAt;
}
export function recordCollectionAward(g,award){
 for(const pid of award.recipientIds){const p=ensurePlayerProfile(g,pid);if(!p)continue;saveToProfile(p,award);if(ownsInfinity(p)&&!earned(p,'infinity-gauntlet'))g.grantAchievement('infinity-gauntlet','player',pid,'earned','collection');}
}
export function scoreLimit(g,scope,id){
 if(!g.state.settings.perksEnabled)return RESOURCE_CAP;
 const people=scope==='player'?[profileIndex(g).people.get(id)].filter(Boolean):g.region(id).members;
 return people.some(m=>ownsInfinity(profileFor(g,m.pid)))?SAFE_SCORE:RESOURCE_CAP;
}
export function publicCollection(g,pid){
 const p=profileFor(g,pid),m=members(g).find(m=>m.pid===pid),stones=completedStones(p);
 return {awards:(p?.earned||[]).map(a=>({...byId.get(a.achievementId),...a,recipientName:m?.name||''})),stones:stones.map(id=>byId.get(id).stone),totalStones:6,unlocked:stones.length===6,active:g.state.settings.perksEnabled&&stones.length===6,studied:earned(p,'daily-training')?100:p?.studied.length||0};
}
const emptyStats=()=>({seen:[],correct:0,answered:0,errors:0,correctRun:0,fast:0,fastRun:0,hard:0,armed:false,foresight:false,brokenNotice:false,midLast:false,ledAfterMid:false,previousRank:null,initial:false,earnedPoints:0});
function statsFor(match,key){match.questStats??={};if(!Object.hasOwn(match.questStats,key))Object.defineProperty(match.questStats,key,{value:emptyStats(),enumerable:true,writable:true,configurable:true});return match.questStats[key]}
function ranking(g){return g.state.settings.mode==='solo'?g.ranking().map(m=>({id:m.pid,score:m.capital})):g.teamRanking().filter(t=>g.region(t.teamId).members.length).map(t=>({id:t.teamId,score:t.rating}))}
function rankOf(rows,row){return 1+rows.filter(r=>r.score>row.score).length}
export function prepareAwardRound(g){
 const match=g.state.match,round=g.state.round;match.startedAt??=g.now();match.questStats??={};
 const fresh=match.completedQuestionIds.length===0&&!match.startedPids;
 if(fresh){match.startedPids=members(g).map(m=>m.pid);match.startedTeamIds=g.state.regions.filter(t=>t.members.length).map(t=>t.id)}
 for(const m of members(g)){ensurePlayerProfile(g,m.pid);const s=statsFor(match,'p:'+m.pid);if(fresh)s.initial=true;}
 for(const t of g.state.regions.filter(t=>t.members.length)){const s=statsFor(match,'t:'+t.id);if(fresh)s.initial=true;}
 round.awardClock={elapsed:0,runningSince:g.now()};round.ballotTimes={};
 round.awardPriorRanks=Object.fromEntries(ranking(g).map((row,_,all)=>[row.id,rankOf(all,row)]));
}
export function answerElapsed(g){const r=g.state.round,c=r?.awardClock;return c?Math.max(0,c.elapsed+(r.paused?0:g.now()-c.runningSince)):Infinity}
export function pauseAwardClock(g,pausing){const c=g.state.round?.awardClock;if(!c)return;if(pausing)c.elapsed=answerElapsed(g);else c.runningSince=g.now()}
function personalAnswer(g,m){
 const r=g.state.round;
 if(g.state.settings.mode==='team'&&g.state.settings.teamDecision==='leader'){
  const t=g.state.regions.find(t=>t.members.includes(m)),c=r.leaderChoices?.[t.id];
  if(!c||!Object.hasOwn(c.votes,m.pid))return {chosen:null,ms:Infinity,answered:false};
  return {chosen:c.votes[m.pid]?c.option:null,ms:m.pid===c.by?c.elapsedMs:c.voteTimes?.[m.pid],answered:true};
 }
 const chosen=r.submitted[g.state.settings.mode==='solo'?m.pid:'']??r.ballots[m.pid]??null;
 return {chosen,ms:r.ballotTimes?.[m.pid],answered:chosen!==null};
}
function track(s,key,correct,answered,fast){
 if(s.seen.includes(key)){s.correctRun=0;s.fastRun=0;return false}
 s.seen.push(key);if(answered)s.answered++;
 if(correct){s.correct++;s.correctRun++;s.errors=0}else{s.errors++;s.correctRun=0;if(s.errors>=3)s.armed=true}
 if(fast)s.fast++;s.fastRun=fast&&correct?s.fastRun+1:0;return true;
}
export function evaluateAwardRound(g){
 const r=g.state.round,match=g.state.match;if(!r||r.awardsEvaluated)return;r.awardsEvaluated=true;
 const key=questionKey(r.questionSnapshot),solo=g.state.settings.mode==='solo',scope=solo?'player':'team',prefix=solo?'p:':'t:';
 const contestants=solo?members(g).map(m=>({id:m.pid,result:r.results[m.pid]})):g.state.regions.filter(t=>t.members.length).map(t=>({id:t.id,result:r.results[t.id]}));
 const answered=contestants.filter(c=>c.result?.chosen!==null&&c.result?.chosen!==undefined);
 for(const m of members(g)){
  const a=personalAnswer(g,m),correct=a.answered&&a.chosen===r.questionSnapshot.correct,s=statsFor(match,'p:'+m.pid),hadForesight=s.foresight;
  const fresh=track(s,key,correct,a.answered,a.answered&&Number.isFinite(a.ms)&&a.ms<=5000);
  if(!fresh)continue;
  const p=ensurePlayerProfile(g,m.pid);if(correct&&!earned(p,'daily-training')&&!p.studied.includes(key)){p.studied.push(key);p.updatedAt=g.now();if(p.studied.length>=100){g.grantAchievement('daily-training','player',m.pid,'earned','training');p.studied=[]}}
  if(s.fast>=5)g.grantAchievement('basic-implant','player',m.pid,'earned','speed');
  if(solo&&s.fastRun>=3){s.foresight=true;g.grantAchievement('foresight','player',m.pid,'earned','speed')}
  if(solo&&hadForesight&&!correct&&!s.brokenNotice){s.brokenNotice=true;match.notices??=[];match.notices.push({id:randomUUID(),pid:m.pid,text:'Не думай, что всё знаешь наперёд',at:g.now()})}
 }
 const crossed=[];
 for(const c of contestants){
  const s=statsFor(match,prefix+c.id),res=c.result;if(!res)continue;
  const fresh=solo?s.seen.at(-1)===key&&r.ballotTimes?.[c.id]!==undefined:track(s,key,!!res.correct,res.chosen!==null&&res.chosen!==undefined,false);
  // In Solo personal tracking already happened; a per-question marker prevents duplicate rewards.
  s.processed??=[];if(!fresh||s.processed.includes(key))continue;s.processed.push(key);
  if(res.correct){
   s.earnedPoints+=res.awarded||0;
   const others=answered.filter(other=>other.id!==c.id);
   if(answered.length>=5&&others.filter(other=>!other.result.correct).length/others.length>=.8)s.hard++;
   if(s.hard>=3)g.grantAchievement('scenario-reader',scope,c.id,'earned','knowledge');
   if(s.armed&&s.correctRun>=10)g.grantAchievement('determination',scope,c.id,'earned','streak');
   if(!match.summitIds?.length&&s.earnedPoints>=500)crossed.push(c.id);
  }
 }
 if(crossed.length){match.summitIds=crossed;for(const id of crossed)g.grantAchievement('neon-summit',scope,id,'earned','milestone')}
 const rows=ranking(g),count=match.completedQuestionIds.length+(match.completedQuestionIds.includes(r.questionId)?0:1),half=Math.ceil(match.questionIds.length/2),last=r.questionId===match.questionIds.at(-1);
 for(const row of rows){const s=statsFor(match,prefix+row.id),rank=rankOf(rows,row);s.previousRank=r.awardPriorRanks?.[row.id]??null;if(count===half&&rows.length>=4&&rank>1&&row.score===rows.at(-1).score)s.midLast=true;if(count>half&&!last&&rank===1)s.ledAfterMid=true;s.finalRank=rank;}
 g.touch();
}
export function evaluateAwardFinish(g){
 const match=g.state.match,solo=g.state.settings.mode==='solo',scope=solo?'player':'team',prefix=solo?'p:':'t:',rows=ranking(g),total=match.questionIds.length,final=g.state.round?.questionId===match.questionIds.at(-1);
 for(const row of rows){
  const s=statsFor(match,prefix+row.id),rank=rankOf(rows,row),gap=rows[0].score-row.score;
  if(rank===2&&gap>=1&&gap<=25&&match.completedQuestionIds.length>=5)g.grantAchievement('near-victory',scope,row.id,'earned','ranking');
  if(final&&total>=10&&match.completedQuestionIds.length===total&&s.initial&&s.seen.length===total&&s.correct===total)g.grantAchievement('perfect-form',scope,row.id,'earned','perfect');
  if(final&&total>=10&&match.completedQuestionIds.length===total&&rows.length>=4&&s.initial&&s.midLast&&!s.ledAfterMid&&s.previousRank>1&&rank===1)g.grantAchievement('zero-card',scope,row.id,'earned','ranking');
 }
}
export function achievementView(g,player,canInspect){
 const collection=player?publicCollection(g,player.pid):null;
 const known=new Set(collection?.awards.map(a=>a.achievementId)||[]);
 return {collection,achievementCatalog:AWARD_CATALOG.filter(a=>canInspect||!a.secret||known.has(a.id)).map(a=>({...a})),achievementNotices:player?(g.state.match?.notices||[]).filter(n=>n.pid===player.pid&&g.now()-n.at<12000).map(({pid,...n})=>n):[]};
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {io} from 'socket.io-client';
import {GameLogic,hashToken} from '../game-logic.js';
import {createGameServer} from './fixture-server.js';

function game(){const g=new GameLogic();g.enableUniversal();g.enableFlexibleTeams();g.joinTeam('saryarka','Алия');return g}
function answer(g,correct=true,questionId='q1'){
 g.startRound(questionId,60);const team=g.region('saryarka'),q=g.state.round.questionSnapshot,option=correct?q.correct:(q.correct+1)%4,p=team.members[0];
 g.castVote(team.id,p.pid,option,g.state.round.id);g.confirmVote(team.id,(team.members[1]||p).pid,p.pid,g.state.round.id);g.resolveRound();return g.state.round.results.saryarka;
}
function comeback(g){for(let i=0;i<4;i++)answer(g,false);assert.equal(g.region('saryarka').economy,20);for(let i=0;i<4;i++)answer(g,true);assert.equal(g.region('saryarka').economy,100)}
function answerBoth(g,correct=true){g.startRound('q1',60);const round=g.state.round;for(const id of ['saryarka','jetisu']){const p=g.region(id).members[0],option=correct?round.questionSnapshot.correct:(round.questionSnapshot.correct+1)%4;g.castVote(id,p.pid,option,round.id);g.confirmVote(id,p.pid,p.pid,round.id)}g.resolveRound()}

test('ручное вручение останавливает общее время вопроса и автоматически возобновляет его после показа',()=>{
 let now=100000;const g=game();g.now=()=>now;const pid=g.region('saryarka').members[0].pid;
 g.startRound('q1',60);now+=5000;
 const first=g.grantAchievement('scenario-reader','player',pid);
 assert.equal(first.duplicate,false);assert.equal(g.state.round.paused,true);assert.equal(g.remainingMs(),55000);
 const firstUntil=g.state.round.awardPauseUntil;
 now+=4000;g.grantAchievement('zero-card','player',pid);
 assert.ok(g.state.round.awardPauseUntil>firstUntil);
 now=firstUntil+1;assert.equal(g.resumeAwardPauseIfDue(),false);assert.equal(g.remainingMs(),55000);
 now=g.state.round.awardPauseUntil;assert.equal(g.resumeAwardPauseIfDue(),true);assert.equal(g.state.round.paused,false);
 now+=2000;assert.equal(g.remainingMs(),53000);
 assert.equal(g.grantAchievement('scenario-reader','player',pid).duplicate,true);
 assert.equal(g.state.round.paused,false);
 g.pauseRound();g.grantAchievement('determination','player',pid);
 assert.equal(g.state.round.paused,true);assert.equal(g.state.round.awardPauseUntil,undefined);
 now+=30000;assert.equal(g.resumeAwardPauseIfDue(),false);
});

test('легендарные награды публикуются всем как события 3D-карты без личных данных игрока',()=>{
 const g=game(),player=g.region('saryarka').members[0],other=g.joinTeam('jetisu','Бек');
 const ids=['sky-breaker','neon-summit','zero-card','scenario-reader','determination','daily-training','infinity-gauntlet'];
 for(const id of ids)g.grantAchievement(id,'player',player.pid);
 const view=g.view({playerHash:hashToken(other.playerToken)});
 assert.deepEqual(new Set(view.worldAchievements.map(a=>a.achievementId)),new Set(ids));
 assert.ok(view.worldAchievements.every(a=>a.teamId==='saryarka'&&a.durationMs>=7800));
 assert.equal(JSON.stringify(view.worldAchievements).includes(player.pid),false);
 assert.equal(view.achievements.some(a=>a.achievementId==='determination'),false);
});

test('восстановление: каждый верный ответ возвращает 25 пунктов без ресурсов, последний шаг ограничен 100%',()=>{
 const g=game();answer(g,false);answer(g,false);assert.equal(g.region('saryarka').economy,60);let r=answer(g);assert.equal(r.economyAfter,85);assert.equal(r.awarded,0);assert.equal(r.recoveryAnswers,0);assert.equal(r.economyRecovered,25);
 answer(g,false);assert.equal(g.region('saryarka').economy,65);r=answer(g);assert.equal(r.economyRecovered,25);assert.equal(r.economyAfter,90);assert.equal(r.awarded,0);
 r=answer(g);assert.equal(r.economyRecovered,10);assert.equal(r.economyAfter,100);assert.equal(r.awarded,0);assert.equal(g.region('saryarka').points,0);r=answer(g);assert.equal(r.awarded,25);assert.equal(g.region('saryarka').points,25);
});

test('восстановление: предел ресурса не мешает ремонту, 1000 не дают досрочную награду, старые сохранения совместимы',()=>{
 let g=game();g.adjustPoints('saryarka',1000);g.adjustEconomy('saryarka',-5);const r=answer(g);g=new GameLogic(g.state);assert.equal(g.region('saryarka').recoveryAnswers,0);assert.equal(r.economyRecovered,5);assert.equal(g.region('saryarka').economy,100);assert.equal(g.region('saryarka').points,1000);assert.equal(r.awarded,0);g.finishMatch();assert.equal(g.state.achievements.length,0);
 const raw=g.editorSnapshot();assert.throws(()=>g.applyRawState({...raw,achievements:[{achievementId:'sky-breaker'}]}),/Редактор/);
 const race=game();race.joinTeam('jetisu','Бек');for(let i=0;i<4;i++)answerBoth(race,false);for(let i=0;i<4;i++)answerBoth(race);for(let i=0;i<40;i++)answerBoth(race);
 assert.equal(race.state.match.finishedAt,null);assert.equal(race.state.achievements.length,0);assert.equal(race.region('saryarka').points,1000);assert.equal(race.region('jetisu').points,1000);race.finishMatch();assert.equal(race.state.achievements.length,2);assert.ok(race.state.achievements.every(a=>a.reason==='ranking'));assert.deepEqual(new Set(race.state.match.winnerTeamIds),new Set(['saryarka','jetisu']));
 const snapshot=structuredClone(race.state);snapshot.match.milestoneWinnerTeamIds=['saryarka'];snapshot.achievements[0].reason='milestone';for(const stats of Object.values(snapshot.match.stats)){stats.hitFloor=stats.hitCrisis;delete stats.hitCrisis}snapshot.regions[0].recoveryAnswers=1;
 const restored=new GameLogic(snapshot);assert.deepEqual(restored.state.match.stats.saryarka,{hitCrisis:true,recoveredByQuiz:true});assert.equal(restored.region('saryarka').recoveryAnswers,0);assert.equal(restored.state.achievements[0].id,snapshot.achievements[0].id);assert.equal(restored.state.achievements[0].reason,'milestone');assert.equal(restored.state.revision,snapshot.revision+1);assert.equal(new GameLogic(restored.state).state.revision,restored.state.revision);
});

test('камбэк: после последнего вопроса награда выдаётся всей команде лидера, общий эффект не раскрывает чужую витрину',()=>{
 const g=game(),ally=g.joinTeam('saryarka','Бек'),other=g.joinTeam('jetisu','Данияр');comeback(g);assert.equal(g.state.achievements.length,0);answer(g,true,g.state.questions.at(-1).id);
 assert.deepEqual(g.state.match.winnerTeamIds,['saryarka']);assert.equal(g.state.achievements.length,1);const award=g.state.achievements[0];assert.equal(award.source,'comeback');assert.ok(award.recipientIds.includes(ally.player.pid));
 const own=g.view({playerHash:hashToken(ally.playerToken)}),foreign=g.view({playerHash:hashToken(other.playerToken)});assert.equal(own.achievements[0].title,'Ты смог, братец');assert.equal(own.achievements[0].id,award.id);assert.equal(foreign.achievements.length,0);assert.equal(Object.hasOwn(own.achievements[0],'recipientIds'),false);
 assert.equal(award.reason,'ranking');assert.ok(g.region('saryarka').points<1000);assert.equal(foreign.worldAchievements[0].teamId,'saryarka');assert.equal(JSON.stringify(foreign.worldAchievements).includes(ally.player.pid),false);assert.equal(foreign.questions.length,0);assert.equal(g.view().worldAchievements.length,0);
 g.finishMatch();assert.equal(g.state.achievements.length,1);const restored=new GameLogic(g.state);assert.equal(restored.state.achievements[0].id,award.id);
 const clock=g.now;g.now=()=>clock()+8000;assert.equal(g.view({playerHash:hashToken(ally.playerToken)}).worldAchievements.length,0);assert.equal(g.state.achievements.length,1);
});

test('камбэк: строгий порог ниже 30%, полное восстановление ответами и первое место обязательны',()=>{
 const boundary=game();boundary.adjustEconomy('saryarka',-50);answer(boundary,false);assert.equal(boundary.region('saryarka').economy,30);assert.equal(boundary.state.match.stats.saryarka.hitCrisis,false);for(let i=0;i<3;i++)answer(boundary);boundary.finishMatch();assert.equal(boundary.state.achievements.length,0);
 const below=game();below.adjustEconomy('saryarka',-51);answer(below,false);assert.equal(below.region('saryarka').economy,29);assert.equal(below.state.match.stats.saryarka.hitCrisis,true);for(let i=0;i<3;i++)answer(below);below.finishMatch();assert.equal(below.state.achievements.length,1);
 const partial=game();for(let i=0;i<4;i++)answer(partial,false);for(let i=0;i<2;i++)answer(partial);answer(partial,true,partial.state.questions.at(-1).id);assert.equal(partial.region('saryarka').economy,95);assert.equal(partial.state.achievements.length,0);
 const edited=game();for(let i=0;i<5;i++)answer(edited,false);edited.adjustEconomy('saryarka',100);answer(edited,true,edited.state.questions.at(-1).id);assert.equal(edited.state.achievements.length,0);
 const second=game();second.joinTeam('jetisu','Данияр');second.adjustPoints('jetisu',1000);comeback(second);answer(second,true,second.state.questions.at(-1).id);assert.deepEqual(second.state.match.winnerTeamIds,['jetisu']);assert.equal(second.state.achievements.length,0);
});

test('матч: награда только при завершении сессии, ручном или автоматическом; новая игра очищает историю',()=>{
 const early=game();comeback(early);assert.equal(early.state.achievements.length,0);early.startRound('q1',30);assert.throws(()=>early.finishMatch(),/Сначала подведите итоги текущего вопроса/);const p=early.region('saryarka').members[0];early.castVote('saryarka',p.pid,early.state.round.questionSnapshot.correct,early.state.round.id);early.confirmVote('saryarka',p.pid,p.pid,early.state.round.id);early.resolveRound();early.finishMatch();assert.equal(early.state.achievements.length,1);assert.equal(early.state.achievements[0].reason,'ranking');
 const g=game();g.state.questions=g.state.questions.slice(0,2);comeback(g);assert.equal(g.state.match.finishedAt,null);answer(g,true,'q2');assert.ok(g.state.match.finishedAt);assert.equal(g.state.achievements.length,1);g.finishMatch();assert.equal(g.state.achievements.length,1);
 const award=g.state.achievements[0];answer(g,true);assert.equal(g.state.achievements[0].id,award.id);assert.notEqual(g.state.match.id,award.matchId);assert.deepEqual(g.state.match.stats.saryarka,{hitCrisis:false,recoveredByQuiz:false});g.resetGame();assert.equal(g.state.match,null);assert.equal(g.state.achievements.length,0);
});

const config={teacherPassword:'award-test-teacher-password',sessionSecret:'award-test-session-secret-more-than-thirty-two',creatorCodes:{adilet:'A'.repeat(26),ernur:'E'.repeat(26)}};
class Store{kind='memory';snapshot=null;fail=false;async load(){return structuredClone(this.snapshot)}async save(s){if(this.fail)throw new Error('simulated-award-storage-failure');this.snapshot=structuredClone(s)}async close(){}}
const cmd=(socket,name,data={})=>new Promise((resolve,reject)=>socket.timeout(4000).emit(name,data,(error,result)=>error?reject(error):resolve(result)));
async function fixture(t){
 const store=new Store(),server=await createGameServer({...config,store,requireConsent:false}),port=await server.listen(0,'127.0.0.1'),clients=[];
 t.after(async()=>{clients.forEach(s=>s.disconnect());await server.close()});
 async function connect(){const s=io(`http://127.0.0.1:${port}`,{autoConnect:false,transports:['websocket'],reconnection:false,auth:{surface:'student',activityVersion:1}});clients.push(s);s.on('state',state=>s.latest=state);const ready=once(s,'state');s.connect();await ready;return s}
 async function join(name='Алия',regionId='saryarka'){const socket=await connect(),result=await cmd(socket,'joinTeam',{name,regionId});assert.equal(result.ok,true,result.error);return {socket,...result}}
 return {store,server,connect,join};
}

test('админ: предпросмотр получает только запросивший, он не выдаёт награду и не меняет матч',async t=>{
 const f=await fixture(t),owner=await f.join(config.creatorCodes.adilet+' Адилет'),student=await f.join('Алия');let leaked=0;student.socket.on('achievement:preview',()=>leaked++);
 const before=f.server.game.state.revision,preview=once(owner.socket,'achievement:preview');assert.equal((await cmd(owner.socket,'previewAchievement',{achievementId:'sky-breaker'})).ok,true);assert.equal((await preview)[0].achievementId,'sky-breaker');
 await new Promise(r=>setTimeout(r,60));assert.equal(leaked,0);assert.equal(f.server.game.state.achievements.length,0);assert.equal(f.server.game.state.match,null);assert.equal(f.server.game.state.revision,before);
});

test('админ: вручение себе, другому владельцу и команде сохраняется и повтор не создаёт дубликат',async t=>{
 const f=await fixture(t),a=await f.join(config.creatorCodes.adilet+' Адилет'),e=await f.join(config.creatorCodes.ernur+' Ернур','jetisu'),student=await f.join('Алия','mangystau');
 for(const [scope,targetId]of [['player',a.player.pid],['player',e.player.pid],['team','mangystau']])assert.equal((await cmd(a.socket,'grantAchievement',{achievementId:'sky-breaker',scope,targetId})).ok,true);
 const again=await cmd(a.socket,'grantAchievement',{achievementId:'sky-breaker',scope:'player',targetId:a.player.pid});assert.equal(again.duplicate,true);assert.equal(f.server.game.state.achievements.length,3);assert.equal(f.store.snapshot.achievements.length,3);assert.equal(f.server.game.view({playerHash:hashToken(student.playerToken)}).achievements.length,1);
 await new Promise(resolve=>setTimeout(resolve,60));assert.equal(student.socket.latest.worldAchievements.length,3);assert.ok(student.socket.latest.worldAchievements.some(event=>event.teamId==='mangystau'));assert.equal(student.socket.latest.worldAchievements.some(event=>'recipientIds'in event||'targetId'in event),false);
 assert.equal(f.server.game.region('saryarka').points,0);assert.equal(f.server.game.region('saryarka').economy,100);
});

test('права: студент и гость не выдают награды; игрового доступа хватает только на предпросмотр',async t=>{
 const f=await fixture(t),owner=await f.join(config.creatorCodes.adilet+' Адилет'),player=await f.join(),guest=await f.connect();
 for(const socket of [player.socket,guest])for(const name of ['grantAchievement','previewAchievement','finishMatch'])assert.equal((await cmd(socket,name,{achievementId:'sky-breaker',scope:'player',targetId:player.player.pid})).code,'FORBIDDEN');
 await cmd(owner.socket,'grantAdmin',{pid:player.player.pid,permissions:{game:true},effectDuration:1000});assert.equal((await cmd(player.socket,'previewAchievement',{achievementId:'sky-breaker'})).ok,true);assert.equal((await cmd(player.socket,'grantAchievement',{achievementId:'sky-breaker',scope:'player',targetId:player.player.pid})).code,'FORBIDDEN');
 await cmd(owner.socket,'grantAdmin',{pid:player.player.pid,permissions:{game:true,players:true},effectDuration:1000});assert.equal((await cmd(player.socket,'grantAchievement',{achievementId:'sky-breaker',scope:'player',targetId:player.player.pid})).ok,true);
});

test('сохранение и журнал: ошибка БД откатывает награду, административные операции скрыты, игровые события остаются',async t=>{
 const f=await fixture(t),owner=await f.join(config.creatorCodes.adilet+' Адилет'),p=await f.join();f.store.fail=true;assert.equal((await cmd(owner.socket,'grantAchievement',{achievementId:'sky-breaker',scope:'player',targetId:p.player.pid})).code,'STORAGE_ERROR');assert.equal(f.server.game.state.achievements.length,0);f.store.fail=false;
 assert.equal(f.server.game.view({playerHash:hashToken(p.playerToken)}).worldAchievements.length,0);
 await cmd(owner.socket,'adjustPoints',{regionId:'saryarka',delta:25});await cmd(owner.socket,'renamePlayer',{pid:p.player.pid,name:'Арман'});await cmd(owner.socket,'startRound',{questionId:'q1',duration:30});
 const view=f.server.game.view({role:'creator',playerHash:hashToken(owner.playerToken)});assert.ok(f.server.game.state.log.some(entry=>entry.kind==='admin'));assert.equal(view.log.some(entry=>/Ресурс «|имя исправлено|Системное изменение/.test(entry.msg)),false);assert.ok(view.log.some(entry=>entry.msg.startsWith('Начат вопрос')));
 f.server.game.state.log.push({t:1,msg:'Адилет: имя исправлено на «Новое имя».'},{t:2,msg:'Игрок: перенос из «А» в «Б».'},{t:3,msg:'Алия: место в команде освобождено.',kind:'game'});const migrated=f.server.game.view({role:'creator',playerHash:hashToken(owner.playerToken)}).log;assert.equal(migrated.some(entry=>entry.t===1||entry.t===2),false);assert.ok(migrated.some(entry=>entry.t===3));
});

test('анимация: безопасная выдача и предпросмотр, лимит кадров, остановка, reduced-motion и SVG при недоступном Canvas',async t=>{
 const keys=['document','localStorage','requestAnimationFrame','cancelAnimationFrame','matchMedia','devicePixelRatio','addEventListener','removeEventListener','dispatchEvent'];
 const old=Object.fromEntries(keys.map(key=>[key,globalThis[key]])),handlers=new Map(),windowHandlers=new Map(),socketHandlers=new Map(),layers=[],listeners=new Set(),values=new Map(),frames=new Map(),shelf={innerHTML:''};
 let stop,nextFrame=0,paints=0,finite=true,reduced=false,canvasAvailable=true,canvasQueries=0;const uiEvents=[],bodyClasses=new Set();globalThis.dispatchEvent=event=>uiEvents.push(event.type);
 t.after(()=>{stop?.();for(const key of keys)if(old[key]===undefined)delete globalThis[key];else globalThis[key]=old[key]});
 globalThis.localStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 globalThis.requestAnimationFrame=fn=>{frames.set(++nextFrame,fn);return nextFrame};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 globalThis.matchMedia=()=>({get matches(){return reduced}});globalThis.devicePixelRatio=3;
 globalThis.addEventListener=(name,fn)=>windowHandlers.set(name,fn);globalThis.removeEventListener=name=>windowHandlers.delete(name);
 const step=now=>{const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(now)};
 const context={clearRect(){paints++},setTransform(){},beginPath(){},moveTo(x,y){finite&&=Number.isFinite(x)&&Number.isFinite(y)},lineTo(x,y){finite&&=Number.isFinite(x)&&Number.isFinite(y)},closePath(){},fill(){},stroke(){}};
 globalThis.document={hidden:false,body:{classList:{add(...names){names.forEach(n=>bodyClasses.add(n))},remove(...names){names.forEach(n=>bodyClasses.delete(n))}},append(node){layers.push(node)}},querySelectorAll(selector){return selector==='[data-achievement-shelf]'?[shelf]:[]},getElementById(){return null},addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name),createElement(){
  const classes=new Set(),canvas={clientWidth:220,clientHeight:330,getContext(){canvasQueries++;return canvasAvailable?context:null}};
  return {canvas,classes,classList:{add:name=>classes.add(name)},setAttribute(){},querySelector(selector){return selector==='canvas'?canvas:{addEventListener(){}}},remove(){this.removed=true}};
 }};
 let source=await readFile(new URL('../shared-engine.js',import.meta.url),'utf8');source=source.replace(/^import .*\n/gm,'').replace(/^export \{ .*from .*\n/gm,'');source='import {ACHIEVEMENTS,createDrillGeometryData} from '+JSON.stringify(new URL('../game-config.js',import.meta.url).href)+';\nimport {hasAchievementAnimation,mountAchievementAnimation} from '+JSON.stringify(new URL('../achievement-player.js',import.meta.url).href)+';\n'+source;const {setupAchievements}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const engine={mode:'student',socket:{on:(name,fn)=>socketHandlers.set(name,fn),off:name=>socketHandlers.delete(name)},onChange(fn){listeners.add(fn);return()=>listeners.delete(fn)}};stop=setupAchievements(engine);
 const state={viewer:{role:'student',player:{pid:'alice'}},achievements:[],match:null};for(const fn of listeners)fn(state);
 state.match={id:'match-1'};state.serverTime=1000;state.worldAchievements=[{id:'world-1',achievementId:'sky-breaker',teamId:'jetisu',startedAt:1000,durationMs:7800}];for(const fn of listeners)fn(state);for(const fn of listeners)fn(state);assert.equal(uiEvents.filter(n=>n==='cq:world-achievement').length,1);assert.equal(bodyClasses.has('map-celebrating'),true);
 state.achievements=[{id:'award-1" onclick="alert(1)',achievementId:'sky-breaker',title:'Ты смог, братец',recipientName:'<img src=x onerror=alert(1)>'}];for(const fn of listeners)fn(state);
 assert.equal(layers.length,1);assert.ok(layers[0].innerHTML.includes('&lt;img'));assert.equal(shelf.innerHTML.includes('" onclick='),false);assert.ok(shelf.innerHTML.includes('&quot;'));for(const fn of listeners)fn(state);assert.equal(layers.length,1);
 assert.equal(frames.size,0);assert.equal(canvasQueries,0);assert.ok(layers[0].classes.has('achievement-toast-only'));
 socketHandlers.get('achievement:preview')();assert.equal(layers[0].removed,true);assert.equal(state.achievements.length,1);
 assert.equal(layers[1].canvas.width,275);assert.equal(layers[1].canvas.height,413);assert.equal(finite,true);assert.equal(frames.size,1);
 step(0);const first=paints;step(10);assert.equal(paints,first);step(34);assert.equal(paints,first+1);
 layers[1].canvas.clientWidth=170;layers[1].canvas.clientHeight=255;windowHandlers.get('resize')();assert.equal(layers[1].canvas.width,213);
 socketHandlers.get('achievement:preview')();assert.equal(layers.length,3);assert.equal(layers[1].removed,true);assert.equal(frames.size,1);assert.equal(state.achievements.length,1);
 globalThis.document.hidden=true;handlers.get('visibilitychange')();assert.equal(layers[2].removed,true);assert.equal(frames.size,0);assert.equal(windowHandlers.size,0);
 globalThis.document.hidden=false;reduced=true;const before=canvasQueries;socketHandlers.get('achievement:preview')();assert.equal(frames.size,0);assert.equal(canvasQueries,before);assert.equal(layers[3].classes.has('has-drill-mesh'),false);
 reduced=false;canvasAvailable=false;socketHandlers.get('achievement:preview')();assert.equal(frames.size,0);assert.equal(layers[4].classes.has('has-drill-mesh'),false);assert.ok(layers[4].innerHTML.includes('sky-drill-fallback'));
 canvasAvailable=true;socketHandlers.get('achievement:preview')();step(0);step(5001);assert.equal(frames.size,0);assert.equal(windowHandlers.size,0);assert.equal(finite,true);
 handlers.get('keydown')({key:'Escape'});assert.equal(layers[5].removed,true);assert.equal(uiEvents.filter(n=>n==='cq:world-achievement').length,1);state.match=null;state.worldAchievements=[];for(const fn of listeners)fn(state);assert.equal(bodyClasses.has('map-celebrating'),false);
 socketHandlers.get('achievement:preview')({achievementId:'infinity-gauntlet',effect:'gauntlet',rarity:'perk',title:'Я — сама неотвратимость'});assert.match(layers.at(-1).className,/collection-gauntlet rarity-perk/);assert.equal((layers.at(-1).innerHTML.match(/class="gauntlet-gem"/g)||[]).length,6);assert.ok(layers.at(-1).innerHTML.includes('1000 / ∞'));assert.equal(frames.size,0);
 socketHandlers.get('achievement:preview')({achievementId:'basic-implant',effect:'chip',rarity:'common',title:'Рудиментарный имплант'});assert.match(layers.at(-1).className,/collection-compact/);assert.equal(layers.at(-2).removed,true);assert.equal(frames.size,0);
 stop();assert.equal(layers.at(-1).removed,true);assert.equal(listeners.size,0);assert.equal(socketHandlers.size,0);
});

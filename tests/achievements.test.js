import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {io} from 'socket.io-client';
import {GameLogic,hashToken} from '../game-logic.js';
import {createGameServer} from '../server.js';

function game(){const g=new GameLogic();g.enableUniversal();g.enableFlexibleTeams();g.joinTeam('saryarka','Алия');return g}
function answer(g,correct=true,questionId='q1'){
 g.startRound(questionId,60);const team=g.region('saryarka'),q=g.state.round.questionSnapshot,option=correct?q.correct:(q.correct+1)%4,p=team.members[0];
 g.castVote(team.id,p.pid,option,g.state.round.id);g.confirmVote(team.id,(team.members[1]||p).pid,p.pid,g.state.round.id);g.resolveRound();return g.state.round.results.saryarka;
}
function comeback(g){for(let i=0;i<5;i++)answer(g,false);assert.equal(g.region('saryarka').economy,15);for(let i=0;i<10;i++)answer(g,true);assert.equal(g.region('saryarka').economy,100)}

test('восстановление: оба правильных ответа идут только на экономику, ошибка не стирает накопленный ответ',()=>{
 const g=game();answer(g,false);assert.equal(g.region('saryarka').economy,80);let r=answer(g);assert.equal(r.awarded,0);assert.equal(r.recoveryAnswers,1);assert.equal(r.economyRecovered,0);
 answer(g,false);assert.equal(g.region('saryarka').economy,60);r=answer(g);assert.equal(r.economyRecovered,20);assert.equal(r.economyAfter,80);assert.equal(r.awarded,0);
 answer(g);r=answer(g);assert.equal(r.economyAfter,100);assert.equal(r.awarded,0);assert.equal(g.region('saryarka').points,0);r=answer(g);assert.equal(r.awarded,25);assert.equal(g.region('saryarka').points,25);
});

test('восстановление: предел ресурса не мешает ремонту, последний шаг ограничен 100%, прогресс сохраняется',()=>{
 let g=game();g.adjustPoints('saryarka',1000);g.adjustEconomy('saryarka',-5);answer(g);g=new GameLogic(g.state);assert.equal(g.region('saryarka').recoveryAnswers,1);const r=answer(g);assert.equal(r.economyRecovered,5);assert.equal(g.region('saryarka').economy,100);assert.equal(g.region('saryarka').points,1000);assert.equal(r.awarded,0);
 const raw=g.editorSnapshot();assert.throws(()=>g.applyRawState({...raw,achievements:[{achievementId:'sky-breaker'}]}),/Редактор/);
});

test('камбэк: награда выдаётся всей победившей команде только после 15% → 100% и завершения матча',()=>{
 const g=game(),ally=g.joinTeam('saryarka','Бек'),other=g.joinTeam('jetisu','Данияр');comeback(g);assert.equal(g.state.achievements.length,0);g.finishMatch();
 assert.deepEqual(g.state.match.winnerTeamIds,['saryarka']);assert.equal(g.state.achievements.length,1);const award=g.state.achievements[0];assert.equal(award.source,'comeback');assert.ok(award.recipientIds.includes(ally.player.pid));
 const own=g.view({playerHash:hashToken(ally.playerToken)}),foreign=g.view({playerHash:hashToken(other.playerToken)});assert.equal(own.achievements[0].title,'Ты смог, братец');assert.equal(own.achievements[0].id,award.id);assert.equal(foreign.achievements.length,0);assert.equal(Object.hasOwn(own.achievements[0],'recipientIds'),false);
 g.finishMatch();assert.equal(g.state.achievements.length,1);const restored=new GameLogic(g.state);assert.equal(restored.state.achievements[0].id,award.id);
});

test('камбэк: неполное восстановление, ручная правка и второе место не дают автоматическую награду',()=>{
 const partial=game();for(let i=0;i<5;i++)answer(partial,false);for(let i=0;i<8;i++)answer(partial);partial.finishMatch();assert.equal(partial.region('saryarka').economy,95);assert.equal(partial.state.achievements.length,0);
 const edited=game();for(let i=0;i<5;i++)answer(edited,false);edited.adjustEconomy('saryarka',100);edited.finishMatch();assert.equal(edited.state.achievements.length,0);
 const second=game();second.joinTeam('jetisu','Данияр');second.adjustPoints('jetisu',1000);comeback(second);second.finishMatch();assert.deepEqual(second.state.match.winnerTeamIds,['jetisu']);assert.equal(second.state.achievements.length,0);
});

test('матч: победители фиксируются при завершении преподавателем; новая игра очищает награды и историю',()=>{
 const g=game();g.state.questions=g.state.questions.slice(0,2);comeback(g);assert.equal(g.state.match.finishedAt,null);answer(g,true,'q2');assert.equal(g.state.match.finishedAt,null);g.finishMatch();assert.ok(g.state.match.finishedAt);assert.equal(g.state.achievements.length,1);
 const award=g.state.achievements[0];answer(g,true);assert.equal(g.state.achievements[0].id,award.id);assert.notEqual(g.state.match.id,award.matchId);assert.deepEqual(g.state.match.stats.saryarka,{hitFloor:false,recoveredByQuiz:false});g.resetGame();assert.equal(g.state.match,null);assert.equal(g.state.achievements.length,0);
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
 await cmd(owner.socket,'adjustPoints',{regionId:'saryarka',delta:25});await cmd(owner.socket,'renamePlayer',{pid:p.player.pid,name:'Арман'});await cmd(owner.socket,'startRound',{questionId:'q1',duration:30});
 const view=f.server.game.view({role:'creator',playerHash:hashToken(owner.playerToken)});assert.ok(f.server.game.state.log.some(entry=>entry.kind==='admin'));assert.equal(view.log.some(entry=>/Ресурс «|имя исправлено|Системное изменение/.test(entry.msg)),false);assert.ok(view.log.some(entry=>entry.msg.startsWith('Начат вопрос')));
 f.server.game.state.log.push({t:1,msg:'Адилет: имя исправлено на «Новое имя».'},{t:2,msg:'Игрок: перенос из «А» в «Б».'},{t:3,msg:'Алия: место в команде освобождено.',kind:'game'});const migrated=f.server.game.view({role:'creator',playerHash:hashToken(owner.playerToken)}).log;assert.equal(migrated.some(entry=>entry.t===1||entry.t===2),false);assert.ok(migrated.some(entry=>entry.t===3));
});

test('анимация: безопасная выдача и предпросмотр, лимит кадров, остановка, reduced-motion и SVG при недоступном Canvas',async t=>{
 const keys=['document','localStorage','requestAnimationFrame','cancelAnimationFrame','matchMedia','devicePixelRatio','addEventListener','removeEventListener'];
 const old=Object.fromEntries(keys.map(key=>[key,globalThis[key]])),handlers=new Map(),windowHandlers=new Map(),socketHandlers=new Map(),layers=[],listeners=new Set(),values=new Map(),frames=new Map(),shelf={innerHTML:''};
 let stop,nextFrame=0,paints=0,finite=true,reduced=false,canvasAvailable=true,canvasQueries=0;
 t.after(()=>{stop?.();for(const key of keys)if(old[key]===undefined)delete globalThis[key];else globalThis[key]=old[key]});
 globalThis.localStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 globalThis.requestAnimationFrame=fn=>{frames.set(++nextFrame,fn);return nextFrame};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 globalThis.matchMedia=()=>({get matches(){return reduced}});globalThis.devicePixelRatio=3;
 globalThis.addEventListener=(name,fn)=>windowHandlers.set(name,fn);globalThis.removeEventListener=name=>windowHandlers.delete(name);
 const step=now=>{const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(now)};
 const context={clearRect(){paints++},setTransform(){},beginPath(){},moveTo(x,y){finite&&=Number.isFinite(x)&&Number.isFinite(y)},lineTo(x,y){finite&&=Number.isFinite(x)&&Number.isFinite(y)},closePath(){},fill(){},stroke(){}};
 globalThis.document={hidden:false,body:{classList:{add(){},remove(){}},append(node){layers.push(node)}},querySelectorAll(selector){return selector==='[data-achievement-shelf]'?[shelf]:[]},getElementById(){return null},addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name),createElement(){
  const classes=new Set(),canvas={clientWidth:220,clientHeight:330,getContext(){canvasQueries++;return canvasAvailable?context:null}};
  return {canvas,classes,classList:{add:name=>classes.add(name)},setAttribute(){},querySelector(selector){return selector==='canvas'?canvas:{addEventListener(){}}},remove(){this.removed=true}};
 }};
 let source=await readFile(new URL('../shared-engine.js',import.meta.url),'utf8');source=source.replace(/^import .*\n/gm,'').replace(/^export \{ .*from .*\n/gm,'');const {setupAchievements}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const engine={mode:'student',socket:{on:(name,fn)=>socketHandlers.set(name,fn),off:name=>socketHandlers.delete(name)},onChange(fn){listeners.add(fn);return()=>listeners.delete(fn)}};stop=setupAchievements(engine);
 const state={viewer:{role:'student',player:{pid:'alice'}},achievements:[],match:null};for(const fn of listeners)fn(state);state.achievements=[{id:'award-1" onclick="alert(1)',title:'Ты смог, братец',recipientName:'<img src=x onerror=alert(1)>'}];for(const fn of listeners)fn(state);
 assert.equal(layers.length,1);assert.ok(layers[0].innerHTML.includes('&lt;img'));assert.equal(shelf.innerHTML.includes('" onclick='),false);assert.ok(shelf.innerHTML.includes('&quot;'));for(const fn of listeners)fn(state);assert.equal(layers.length,1);
 assert.equal(layers[0].canvas.width,275);assert.equal(layers[0].canvas.height,413);assert.equal(finite,true);assert.equal(frames.size,1);
 step(0);const first=paints;step(10);assert.equal(paints,first);step(34);assert.equal(paints,first+1);
 layers[0].canvas.clientWidth=170;layers[0].canvas.clientHeight=255;windowHandlers.get('resize')();assert.equal(layers[0].canvas.width,213);
 socketHandlers.get('achievement:preview')();assert.equal(layers.length,2);assert.equal(layers[0].removed,true);assert.equal(frames.size,1);assert.equal(state.achievements.length,1);
 globalThis.document.hidden=true;handlers.get('visibilitychange')();assert.equal(layers[1].removed,true);assert.equal(frames.size,0);assert.equal(windowHandlers.size,0);
 globalThis.document.hidden=false;reduced=true;const before=canvasQueries;socketHandlers.get('achievement:preview')();assert.equal(frames.size,0);assert.equal(canvasQueries,before);assert.equal(layers[2].classes.has('has-drill-mesh'),false);
 reduced=false;canvasAvailable=false;socketHandlers.get('achievement:preview')();assert.equal(frames.size,0);assert.equal(layers[3].classes.has('has-drill-mesh'),false);assert.ok(layers[3].innerHTML.includes('sky-drill-fallback'));
 canvasAvailable=true;socketHandlers.get('achievement:preview')();step(0);step(5001);assert.equal(frames.size,0);assert.equal(windowHandlers.size,0);assert.equal(finite,true);
 handlers.get('keydown')({key:'Escape'});assert.equal(layers[4].removed,true);stop();assert.equal(listeners.size,0);assert.equal(socketHandlers.size,0);
});

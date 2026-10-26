import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {io} from 'socket.io-client';
import {GameLogic,hashToken} from '../game-logic.js';
import {LEGENDARY_IDS,profileFor,SAFE_SCORE,awardDefinition} from '../achievement-system.js';
import {createGameServer} from './fixture-server.js';

function fixture(mode='solo',size=30,count=1){
 let now=100000;const g=new GameLogic(null,()=>now);g.enableUniversal();g.enableFlexibleTeams();if(mode==='solo')g.setGameMode(mode);
 g.state.questions=Array.from({length:size},(_,i)=>({id:'c'+i,text:'Учебный вопрос номер '+i+'?',options:['Первый вариант '+i,'Второй','Третий','Четвёртый'],correct:0,points:25,version:1}));
 const players=Array.from({length:count},(_,i)=>g.joinTeam(mode==='solo'?null:g.state.regions[i].id,'Участник '+i));
 return {g,players,advance:ms=>now+=ms,clock:()=>now};
}
function answer(f,index,choices=[0],ms=1000){
 const g=f.g;g.startRound('c'+index,60);f.advance(ms);
 const people=g.state.regions.flatMap(t=>t.members.map(m=>({...m,regionId:t.id})));
 people.forEach((p,i)=>{const choice=choices[i];if(choice===null||choice===undefined)return;g.castVote(p.regionId,p.pid,choice,g.state.round.id);if(g.state.settings.mode==='team')g.confirmVote(p.regionId,p.pid,p.pid,g.state.round.id)});
 g.resolveRound();f.advance(1);return g.state.round;
}
const has=(g,pid,id)=>profileFor(g,pid)?.earned.some(a=>a.achievementId===id&&a.source!=='manual');

test('имплант: пять быстрых ошибочных ответов, разные вопросы, граница 5 секунд',()=>{
 const f=fixture('solo',9),pid=f.players[0].player.pid;
 for(let i=0;i<5;i++)answer(f,0,[1],1000);
 assert.equal(has(f.g,pid,'basic-implant'),false);assert.equal(f.g.view({playerHash:hashToken(f.players[0].playerToken)}).achievementCounters.fast,1);
 for(let i=1;i<4;i++)answer(f,i,[1],5000);assert.equal(has(f.g,pid,'basic-implant'),false);
 answer(f,4,[1],5001);assert.equal(has(f.g,pid,'basic-implant'),false);
 answer(f,5,[1],5000);assert.equal(has(f.g,pid,'basic-implant'),true);assert.equal(f.g.ranking()[0].capital,0);assert.equal(has(f.g,pid,'foresight'),false);
});

test('предвидение: верная серия, шуточное уведомление, пауза и сброс таймера не подделывают скорость',()=>{
 const f=fixture(),pid=f.players[0].player.pid;for(let i=0;i<3;i++)answer(f,i,[0],5000);assert.equal(has(f.g,pid,'foresight'),true);
 answer(f,3,[1]);assert.equal(has(f.g,pid,'foresight'),true);assert.equal(f.g.state.match.notices.length,1);answer(f,4,[1]);assert.equal(f.g.state.match.notices.length,1);
 const p=fixture();p.g.startRound('c0',60);p.advance(3000);p.g.pauseRound();p.advance(60000);p.g.pauseRound();p.advance(1000);p.g.castVote('saryarka',p.players[0].player.pid,0,p.g.state.round.id);p.g.resolveRound();assert.equal(p.g.state.match.questStats['p:'+p.players[0].player.pid].fast,1);
 p.g.startRound('c1',60);p.advance(6000);p.g.resetTimer();p.g.castVote('saryarka',p.players[0].player.pid,0,p.g.state.round.id);p.g.resolveRound();assert.equal(p.g.state.match.questStats['p:'+p.players[0].player.pid].fast,1);
});

test('Арасака: 500 заработанных очков, одновременные первые и отсутствие выдачи за ручные баллы',()=>{
 const f=fixture('team',24,3);f.g.adjustPoints(f.players[2].player.regionId,500);
 for(let i=0;i<19;i++)answer(f,i,[0,0,1]);assert.equal(f.g.state.achievements.some(a=>a.achievementId==='neon-summit'),false);
 answer(f,19,[0,0,0]);const awards=f.g.state.achievements.filter(a=>a.achievementId==='neon-summit');assert.equal(awards.length,2);assert.deepEqual(new Set(awards.map(a=>a.targetId)),new Set(f.players.slice(0,2).map(p=>p.player.regionId)));assert.equal(f.g.state.match.finishedAt,null);
 answer(f,20,[0,0,0]);assert.equal(f.g.state.achievements.filter(a=>a.achievementId==='neon-summit').length,2);
});

test('финальные награды: Нулевая карта, безошибочная сессия и второе место с разрывом 25',()=>{
 const f=fixture('solo',10,4);for(let i=0;i<10;i++)answer(f,i,i<5?[1,0,0,0]:[0,1,1,1]);assert.equal(has(f.g,f.players[0].player.pid,'zero-card'),true);assert.equal(has(f.g,f.players[1].player.pid,'zero-card'),false);
 const perfect=fixture('solo',10);for(let i=0;i<10;i++)answer(perfect,i);assert.equal(has(perfect.g,perfect.players[0].player.pid,'perfect-form'),true);
 const short=fixture('solo',5);for(let i=0;i<5;i++)answer(short,i);assert.equal(has(short.g,short.players[0].player.pid,'perfect-form'),false);
 const near=fixture('solo',5,3);near.g.adjustCapital(near.players[0].player.pid,125);near.g.adjustCapital(near.players[1].player.pid,100);near.g.adjustCapital(near.players[2].player.pid,99);for(let i=0;i<5;i++)answer(near,i,[1,1,1]);assert.equal(has(near.g,near.players[1].player.pid,'near-victory'),true);assert.equal(has(near.g,near.players[2].player.pid,'near-victory'),false);
});

test('читатель: сложность считается по ответившим, секреты и чужие коллекции не раскрываются',()=>{
 const f=fixture('solo',8,5),pid=f.players[0].player.pid;
 const guest=f.g.view();assert.equal(guest.achievementCatalog.some(a=>a.secret),false);
 for(let i=0;i<3;i++)answer(f,i,[0,1,1,1,1]);assert.equal(has(f.g,pid,'scenario-reader'),true);
 const own=f.g.view({playerHash:hashToken(f.players[0].playerToken)}),other=f.g.view({playerHash:hashToken(f.players[1].playerToken)});assert.ok(own.achievementCatalog.some(a=>a.id==='scenario-reader'));assert.equal(other.achievementCatalog.some(a=>a.id==='scenario-reader'),false);
 assert.equal(other.collection.studied,0);assert.equal(own.collection.studied,3);assert.equal(JSON.stringify(other).includes('awardProfiles'),false);assert.equal(JSON.stringify(other).includes('profileId'),false);assert.equal(JSON.stringify(other).includes('tokenHash'),false);assert.equal(JSON.stringify(other).includes('awardPriorRanks'),false);assert.equal(JSON.stringify(other).includes('ballotTimes'),false);
 const missing=fixture('solo',5,5);for(let i=0;i<3;i++)answer(missing,i,[0,null,null,null,null]);assert.equal(has(missing.g,missing.players[0].player.pid,'scenario-reader'),false);
});

test('решимость: три ошибки и десять верных подряд, повтор вопроса не удлиняет серию',()=>{
 const f=fixture('team',15);for(let i=0;i<3;i++)answer(f,i,[1]);for(let i=3;i<13;i++)answer(f,i);assert.equal(has(f.g,f.players[0].player.pid,'determination'),true);
 const repeated=fixture('team',15);for(let i=0;i<3;i++)answer(repeated,i,[1]);for(let i=0;i<10;i++)answer(repeated,3);assert.equal(has(repeated.g,repeated.players[0].player.pid,'determination'),false);
});

test('тренировка: сто разных вопросов, сохранение после выхода, сброса матча и перезапуска',()=>{
 const f=fixture('solo',101),oldPid=f.players[0].player.pid;f.g.ensureCollection(oldPid);const token=f.g.collectionCookie(oldPid),id=profileFor(f.g,oldPid).id;
 for(let i=0;i<60;i++)answer(f,i);assert.equal(profileFor(f.g,oldPid).studied.length,60);
 f.g.resetGame();const joined=f.g.joinTeam(null,'Другое имя');f.g.ensureCollection(joined.player.pid,hashToken(token));assert.equal(profileFor(f.g,joined.player.pid).id,id);assert.equal(f.g.findPlayer(hashToken(token)),null);
 f.g=new GameLogic(f.g.state,f.clock);for(let i=60;i<100;i++)answer(f,i);assert.equal(has(f.g,joined.player.pid,'daily-training'),true);assert.equal(profileFor(f.g,joined.player.pid).studied.length,0);assert.equal(f.g.view({playerHash:hashToken(joined.playerToken)}).collection.studied,100);
 const backup=f.g.backupSnapshot(),owner=f.g.joinCreator('adilet',f.g.state.regions[0].id,'Владелец');f.g.ensureCollection(owner.player.pid);f.g.grantAchievement('basic-implant','player',owner.player.pid,'earned','speed');const ownerProfile=profileFor(f.g,owner.player.pid).id;
 f.g.restoreBackup(backup,f.g.state.revision);f.g=new GameLogic(f.g.state,f.clock);assert.equal(profileFor(f.g,owner.player.pid).id,ownerProfile);assert.equal(has(f.g,owner.player.pid,'basic-implant'),true);
});

test('перчатка: шесть разных игровых наград, лимит в обоих режимах, перенос и запрет подделки JSON',()=>{
 const f=fixture('team',12,2),pid=f.players[0].player.pid,team=f.players[0].player.regionId,other=f.players[1].player.regionId;
 for(const id of LEGENDARY_IDS)f.g.grantAchievement(id,'player',pid);assert.equal(f.g.scoreLimit('team',team),1000);
 for(const id of LEGENDARY_IDS)f.g.grantAchievement(id,'player',pid,'earned','collection');assert.equal(f.g.scoreLimit('team',team),SAFE_SCORE);assert.equal(has(f.g,pid,'infinity-gauntlet'),true);
 f.g.adjustPoints(team,1000);answer(f,0,[0,0]);assert.equal(f.g.region(team).points,1025);
 f.g.setPerksEnabled(false);answer(f,1,[0,0]);assert.equal(f.g.region(team).points,1025);f.g=new GameLogic(f.g.state,f.clock);assert.equal(f.g.region(team).points,1025);
 const patch=f.g.editorSnapshot();patch.regions.find(t=>t.id===other).points=1001;assert.throws(()=>f.g.applyRawState(patch));assert.throws(()=>f.g.applyRawState({...f.g.editorSnapshot(),awardProfiles:[]}));
 f.g.setPerksEnabled(true);const moved=f.g.editorSnapshot(),from=moved.regions.find(t=>t.id===team),to=moved.regions.find(t=>t.id===other);to.members.push(from.members.shift());from.points=1050;assert.throws(()=>f.g.applyRawState(moved));
 f.g.movePlayer(pid,other);assert.equal(f.g.scoreLimit('team',team),1000);assert.equal(f.g.scoreLimit('team',other),SAFE_SCORE);
 f.g.endRound();f.g.setGameMode('solo');f.g.adjustCapital(pid,1000);answer(f,2,[0,0]);assert.equal(f.g.state.regions.flatMap(t=>t.members).find(m=>m.pid===pid).capital,1025);
});

test('прямая выдача перчатки снимает лимит, ручные камни не снимают; отключение перков возвращает предел',()=>{
 const f=fixture('team',12,2),pid=f.players[0].player.pid,team=f.players[0].player.regionId,other=f.players[1].player.regionId;
 for(const id of LEGENDARY_IDS)f.g.grantAchievement(id,'player',pid);
 assert.equal(f.g.scoreLimit('team',team),1000);
 f.g.grantAchievement('infinity-gauntlet','player',pid);
 assert.equal(f.g.scoreLimit('team',team),SAFE_SCORE);
 assert.equal(f.g.scoreLimit('team',other),1000);
 assert.deepEqual(f.g.view({playerHash:hashToken(f.players[0].playerToken)}).collection.stones,[]);
 assert.equal(f.g.view({playerHash:hashToken(f.players[0].playerToken)}).collection.active,true);
 f.g.adjustPoints(team,1000);answer(f,0,[0,0]);assert.equal(f.g.region(team).points,1025);
 f.g.setPerksEnabled(false);assert.equal(f.g.scoreLimit('team',team),1000);
 f.g.setPerksEnabled(true);f.g.movePlayer(pid,other);
 assert.equal(f.g.scoreLimit('team',team),1000);
 assert.equal(f.g.scoreLimit('team',other),SAFE_SCORE);
});

test('коллекция: защищённая cookie переживает выход, не даёт игровых или админ-прав',async t=>{
 let saved=null;const store={kind:'memory',async load(){return saved},async save(s){saved=structuredClone(s)},async close(){}};
 const server=await createGameServer({store,teacherPassword:'collection-test-password',sessionSecret:'collection-test-secret-more-than-32-characters',creatorCodes:{},requireConsent:false,secureCookies:false}),port=await server.listen(0,'127.0.0.1'),base='http://127.0.0.1:'+port,sockets=[];
 t.after(async()=>{sockets.forEach(s=>s.disconnect());await server.close()});
 const command=(s,name,data={})=>new Promise((resolve,reject)=>s.timeout(3000).emit(name,data,(e,r)=>e?reject(e):resolve(r)));
 async function connect(cookie=''){const s=io(base,{autoConnect:false,transports:['websocket'],reconnection:false,auth:{surface:'student',activityVersion:1},extraHeaders:{cookie}});sockets.push(s);const proof=once(s,'session:ready'),state=once(s,'state');s.connect();s.proof=(await proof)[0].proof;s.latest=(await state)[0];return s}
 const post=(s,path,body,cookie='')=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json','x-cq-client':'1','x-cq-socket':s.id,'x-cq-proof':s.proof,cookie},body:JSON.stringify(body)});
 const s=await connect(),joined=await command(s,'joinTeam',{regionId:'saryarka',name:'Первое имя'});assert.equal(joined.ok,true);const profileId=profileFor(server.game,joined.player.pid).id;
 const bound=await post(s,'/api/session',{role:'player',token:joined.playerToken});assert.equal(bound.status,200);const playerCookie=bound.headers.get('set-cookie').split(';')[0];
 const boundCollection=await post(s,'/api/collection',{},playerCookie);assert.equal(boundCollection.status,200);const setCookie=boundCollection.headers.get('set-cookie');assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/);const collectionCookie=setCookie.split(';')[0];
 for(const name of ['grantAchievement','previewAchievement','setPerksEnabled'])assert.equal((await command(s,name,{achievementId:'infinity-gauntlet',scope:'player',targetId:joined.player.pid,enabled:true})).code,'FORBIDDEN');
 assert.equal((await command(s,'leaveTeam')).ok,true);s.disconnect();const guest=await connect(collectionCookie);assert.equal(guest.latest.viewer.role,'guest');assert.equal((await post(guest,'/api/collection',{},collectionCookie)).status,403);
 const again=await command(guest,'joinTeam',{regionId:'jetisu',name:'Новое имя'});assert.equal(again.ok,true);assert.equal(profileFor(server.game,again.player.pid).id,profileId);assert.equal((await fetch(base+'/achievement-system.js')).status,404);
});

test('интерфейс: секретные условия только на сервере, выбранный предпросмотр и перчатка с шестью камнями',async()=>{
 const [engine,styles,student,teacher,scene]=await Promise.all(['shared-engine.js','styles.css','student.html','teacher.html','scene3d.js'].map(f=>readFile(new URL('../'+f,import.meta.url),'utf8')));
 assert.ok(engine.includes('engine.previewAchievement(kind.value)'));assert.ok(engine.includes('engine.grantAchievement(kind.value,scope,targetId)'));assert.ok(engine.includes('data-award-perks'));assert.ok(student.includes('data-collection-stones')&&teacher.includes('data-collection-stones'));assert.ok(styles.includes('@keyframes gem-awaken')&&styles.includes('@keyframes limit-unbound'));assert.ok(styles.includes('@media(prefers-reduced-motion:reduce)'));
 for(const id of ['neon-summit','zero-card','scenario-reader'])assert.equal(engine.includes(awardDefinition(id).title),false);
 const gems=engine.match(/const gems=\[(.*?)\];/s)[1];assert.equal((gems.match(/'(power|space|reality|mind|soul|time)'/g)||[]).length,6);
});

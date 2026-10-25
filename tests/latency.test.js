import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {io} from 'socket.io-client';
import {GameLogic} from '../game-logic.js';
import {createGameServer} from '../server.js';

const waitFor=async fn=>{const until=Date.now()+4000;while(!fn()){if(Date.now()>until)throw Error('Условие не наступило');await delay(10)}};
test('срок и скорость ответа учитывают серверное время получения, а не ожидание в очереди',()=>{
 let now=100000;const g=new GameLogic(null,()=>now);g.enableUniversal();g.setGameMode('solo');const j=g.joinTeam(null,'Игрок'),p=g.findPlayer((g.state.regions.flatMap(t=>t.members).find(m=>m.pid===j.player.pid)).tokenHash);g.startRound(g.state.questions[0].id,5);const r=g.state.round;
 now+=6000;g.inputTiming={roundId:r.id,deadline:r.deadline,receivedAt:r.startedAt+1000};g.castVote(p.regionId,p.pid,0,r.id);assert.equal(r.ballotTimes[p.pid],1000);
 delete g.inputTiming;assert.throws(()=>g.castVote(p.regionId,p.pid,1,r.id),/время истекло/);
 g.inputTiming={roundId:r.id,deadline:r.deadline+100,receivedAt:r.startedAt+1000};assert.throws(()=>g.castVote(p.regionId,p.pid,1,r.id),/изменился/);
});
test('быстрый режим учитывает выбор сразу; подтверждаемый режим сохраняет защиту от случайного клика',()=>{
 const g=new GameLogic();g.enableUniversal();g.enableFlexibleTeams();const j=g.joinTeam('saryarka','Игрок');g.setTeamRules('instant',false);g.startRound(g.state.questions[0].id,30);const r=g.state.round;g.castVote('saryarka',j.player.pid,r.questionSnapshot.correct,r.id);
 assert.equal(r.ballots[j.player.pid],r.questionSnapshot.correct);assert.equal(Object.keys(r.proposals).length,0);g.resolveRound();assert.equal(g.region('saryarka').points,25);
 g.setTeamRules('consensus',false);g.startRound(g.state.questions[1].id,30);g.castVote('saryarka',j.player.pid,0,g.state.round.id);assert.equal(g.state.round.ballots[j.player.pid],undefined);assert.equal(g.state.round.proposals[j.player.pid].option,0);
});
test('автопереход не ждёт 8 секунд, но сохраняет время для вручённой награды',()=>{
 let now=100000;const g=new GameLogic(null,()=>now);g.enableUniversal();g.joinTeam('saryarka','Игрок');g.setAutoAdvance(true,30);g.startRound(g.state.questions[0].id,30);g.resolveRound();const old=g.state.round.id;g.grantAchievement('basic-implant','team','saryarka');g.advanceIfDue();assert.equal(g.state.round.id,old);now+=6500;g.advanceIfDue();assert.notEqual(g.state.round.id,old);
});
test('быстрая копия состояния изолирована и не переносит временные поля обработки',()=>{
 const g=new GameLogic();g.inputTiming={receivedAt:1};const copy=g.snapshotCopy();assert.equal(copy.inputTiming,undefined);copy.state.regions[0].points=99;assert.equal(g.state.regions[0].points,0);assert.equal(new GameLogic(copy.state).state.regions[0].points,99);
});
test('ответ перед дедлайном переживает медленную запись и ранее поставленную в очередь задачу таймера',async t=>{
 let hold=false,saving=false,release;const gate=new Promise(resolve=>release=resolve);
 const store={kind:'memory',async load(){return null},async save(){if(hold){hold=false;saving=true;await gate}},async close(){}};
 const server=await createGameServer({store,teacherPassword:'latency-test-password',sessionSecret:'latency-test-secret-with-more-than-32-characters',creatorCodes:{},requireConsent:false,cookieSessions:false});
 const port=await server.listen(0,'127.0.0.1'),sockets=[];
 t.after(async()=>{release();sockets.forEach(s=>s.disconnect());await server.close()});
 const command=(s,name,data={})=>new Promise(resolve=>s.emit(name,data,resolve));
 async function connect(surface){const s=io('http://127.0.0.1:'+port,{transports:['websocket'],auth:{surface,activityVersion:1},reconnection:false});sockets.push(s);await once(s,'connect');return s}
 const teacher=await connect('teacher'),student=await connect('student');assert.equal((await command(teacher,'teacherLogin',{password:'latency-test-password'})).ok,true);
 const joined=await command(student,'joinTeam',{regionId:'saryarka',name:'Игрок'});assert.equal(joined.ok,true);assert.equal((await command(teacher,'setTeamRules',{decision:'instant',tradeEnabled:false})).ok,true);
 const question=server.game.state.questions[0];assert.equal((await command(teacher,'startRound',{questionId:question.id,duration:5})).ok,true);
 const round=server.game.state.round,deadline=Date.now()+1200;round.deadline=deadline;
 // A proposal makes the timer enqueue work BEFORE expiry while a write blocks the queue.
 round.proposals['stale-slot']={option:(question.correct+1)%4,remainingAt:10000,elapsedMs:0};
 hold=true;const blocked=command(teacher,'adjustPoints',{regionId:'saryarka',delta:0});await waitFor(()=>saving);await delay(350);
 const receipt=once(student,'answer:received');const answer=command(student,'castVote',{roundId:round.id,optionIdx:question.correct,requestId:'deadline-test',receivedAt:0});
 const [received]=await receipt;assert.equal(received.requestId,'deadline-test');assert.ok(received.receivedAt<deadline);
 await delay(Math.max(0,deadline-Date.now()+30));release();await blocked;const response=await answer;assert.equal(response.ok,true);assert.ok(response.timing.processedAt>=deadline);assert.ok(response.timing.receivedAt<deadline);
 await waitFor(()=>server.game.state.round.resolved);assert.equal(server.game.state.round.results.saryarka.correct,true);
 const late=await command(student,'castVote',{roundId:round.id,optionIdx:1,receivedAt:received.receivedAt});assert.equal(late.ok,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {io} from 'socket.io-client';
import {GameLogic,hashToken} from '../game-logic.js';
import {createGameServer} from '../server.js';
import {profileFor} from '../achievement-system.js';

function solo(count=1){let at=100000;const g=new GameLogic(null,()=>at);g.enableUniversal();g.setGameMode('solo');g.state.questions=g.state.questions.slice(0,10);const players=Array.from({length:count},(_,i)=>g.joinTeam(null,'Участник '+i));return {g,players,advance:ms=>at+=ms}}
test('предвидение: долгая запись нового вопроса не расходует окно пяти секунд',()=>{
 const f=solo(),{g,players}=f,p=players[0].player;
 for(let i=0;i<3;i++){
  const previous=g.state.round?.id;g.startRound(g.state.questions[i].id,30);assert.equal(g.stageRoundPublication(previous),true);assert.equal(g.state.round.paused,true);
  f.advance(9000);assert.equal(g.remainingMs(),30000);g.activateRoundPublication();assert.equal(g.remainingMs(),30000);
  f.advance(5000);g.castVote(p.regionId,p.pid,g.state.round.questionSnapshot.correct,g.state.round.id);g.resolveRound();
 }
 assert.ok(profileFor(g,p.pid).earned.some(a=>a.achievementId==='foresight'));
 const view=g.view({playerHash:hashToken(players[0].playerToken)});assert.equal(view.achievementCounters.lastAnswerMs,5000);assert.equal(view.achievementCounters.lastAnswerStatus,'fast');assert.equal(view.achievementCounters.fastRun,3);
});
test('Нулевая карта достижима: последнее место в середине, первое только на финальном вопросе; нужно четыре участника всего',()=>{
 for(const count of [3,4]){
  const f=solo(count),g=f.g,rows=[];
  for(let i=0;i<10;i++){
   g.startRound(g.state.questions[i].id,30);const r=g.state.round,q=r.questionSnapshot;
   f.players.forEach(({player:p},j)=>g.castVote(p.regionId,p.pid,((j===0)===(i>=5))?q.correct:(q.correct+1)%4,r.id));g.resolveRound();
   const ranking=g.ranking(),me=ranking.find(m=>m.pid===f.players[0].player.pid);rows.push(1+ranking.filter(m=>m.capital>me.capital).length);
  }
  assert.equal(rows[4],count);assert.equal(rows[8],count);assert.equal(rows[9],1);
  assert.equal(profileFor(g,f.players[0].player.pid).earned.some(a=>a.achievementId==='zero-card'),count===4);
 }
});
test('сервер отправляет новый вопрос с полным временем после записи; незавершённый запуск восстанавливается безопасно',async t=>{
 let block=false,saving=false,release,savedPending;const gate=new Promise(resolve=>release=resolve);
 const store={kind:'memory',async load(){return null},async save(state){if(block){block=false;saving=true;savedPending=structuredClone(state);await gate}},async close(){}};
 const config={teacherPassword:'publication-test-password',sessionSecret:'publication-test-secret-with-more-than-thirty-two-characters',creatorCodes:{},requireConsent:false,cookieSessions:false};
 const server=await createGameServer({...config,store}),port=await server.listen(0,'127.0.0.1'),sockets=[];
 t.after(async()=>{release();sockets.forEach(s=>s.disconnect());await server.close()});
 const command=(s,name,data={})=>new Promise(resolve=>s.emit(name,data,resolve));
 async function connect(surface){const s=io('http://127.0.0.1:'+port,{transports:['websocket'],auth:{surface,activityVersion:1},reconnection:false});sockets.push(s);s.on('state',state=>s.latest=state);await once(s,'connect');return s}
 const teacher=await connect('teacher'),student=await connect('student');await command(teacher,'teacherLogin',{password:config.teacherPassword});await command(student,'joinTeam',{regionId:'saryarka',name:'Игрок'});
 block=true;const starting=command(teacher,'startRound',{questionId:server.game.state.questions[0].id,duration:5});
 while(!saving)await delay(5);await delay(120);assert.equal(server.game.state.round.paused,true);assert.equal(student.latest.round,null);assert.equal(savedPending.round.publicationPending,true);
 const releasedAt=Date.now();release();assert.equal((await starting).ok,true);while(!student.latest.round)await delay(5);
 const r=student.latest.round;assert.ok(r.startedAt>=releasedAt);assert.equal(r.deadline-r.startedAt,5000);assert.ok(r.remainingMs>4800);assert.equal(r.paused,false);assert.equal(r.publicationPending,undefined);
 const restored=await createGameServer({...config,store:{kind:'memory',async load(){return savedPending},async save(){},async close(){}}});t.after(()=>restored.close());await restored.listen(0,'127.0.0.1');assert.equal(restored.game.state.round.paused,false);assert.ok(restored.game.remainingMs()>4800);assert.equal(restored.game.state.round.publicationPending,undefined);
});

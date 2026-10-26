import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {io} from 'socket.io-client';
import {GameLogic,hashToken} from '../game-logic.js';
import {createGameServer} from './fixture-server.js';
import {SAFE_SCORE} from '../achievement-system.js';
test('отзыв перка возвращает предел и обновляет коллекцию',()=>{
 const g=new GameLogic(),j=g.joinTeam('saryarka','Игрок');g.grantAchievement('infinity-gauntlet','player',j.player.pid);assert.equal(g.scoreLimit('team','saryarka'),SAFE_SCORE);
 g.revokeAchievement('infinity-gauntlet','player',j.player.pid);assert.equal(g.scoreLimit('team','saryarka'),1000);assert.equal(g.view({playerHash:hashToken(j.playerToken)}).collection.active,false);
 g.grantAchievement('infinity-gauntlet','team','saryarka');assert.equal(g.scoreLimit('team','saryarka'),SAFE_SCORE);
});
test('очистка сохраняет резервную копию и пустой банк переживает перезапуск',()=>{
 const g=new GameLogic(),count=g.state.questions.length;g.clearQuestions();assert.equal(g.state.questions.length,0);assert.equal(g.state.restorePoints[0].snapshot.questions.length,count);assert.equal(new GameLogic(g.state).state.questions.length,0);
});
test('автопереход работает без паузы и не повторяет последний вопрос',()=>{
 let now=1000;const g=new GameLogic(null,()=>now);g.state.questions=g.state.questions.slice(0,2);g.joinTeam('saryarka','Игрок');g.setAutoAdvance(true,30);g.startRound(g.state.questions[0].id,30);g.resolveRound();g.advanceIfDue();assert.equal(g.state.round.questionId,g.state.questions[1].id);assert.equal(g.state.round.resolved,false);g.resolveRound();now+=20000;g.advanceIfDue();assert.notEqual(g.state.match.finishedAt,null);
});
test('пара одновременных голосов сохраняется одной записью; ошибка БД откатывает всю пачку',async t=>{
 let writes=0,fail=false;const store={kind:'memory',async load(){return null},async save(){writes++;if(fail)throw Error('test-storage-failure')},async close(){}};
 const server=await createGameServer({store,teacherPassword:'hotfix-test-password',sessionSecret:'hotfix-test-secret-more-than-thirty-two-characters',creatorCodes:{},requireConsent:false});const port=await server.listen(0,'127.0.0.1'),sockets=[];
 t.after(async()=>{sockets.forEach(s=>s.disconnect());await server.close()});
 const command=(s,name,data={})=>new Promise(resolve=>s.emit(name,data,resolve));
 for(let i=0;i<2;i++){const s=io('http://127.0.0.1:'+port,{transports:['websocket'],auth:{surface:'student'},reconnection:false});sockets.push(s);await once(s,'connect');assert.equal((await command(s,'joinTeam',{regionId:'saryarka',name:'Игрок '+i})).ok,true)}
 server.game.startRound(server.game.state.questions[0].id,60);const roundId=server.game.state.round.id;writes=0;
 const responses=await Promise.all(sockets.map(s=>command(s,'castVote',{roundId,optionIdx:0})));assert.ok(responses.every(r=>r.ok));assert.equal(writes,1);
 const before=structuredClone(server.game.state.round);fail=true;const failed=await Promise.all(sockets.map(s=>command(s,'castVote',{roundId,optionIdx:1})));assert.ok(failed.every(r=>!r.ok&&r.code==='STORAGE_ERROR'));assert.deepEqual(server.game.state.round,before);fail=false;
});

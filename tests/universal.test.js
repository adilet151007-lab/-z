import test from 'node:test';
import assert from 'node:assert/strict';
import {GameLogic,hashToken} from '../game-logic.js';
import {labelScaleForDepth} from '../scene3d.js';
const make=()=>{let now=100000;const g=new GameLogic(null,()=>now);g.enableUniversal();return {g,advance:ms=>{now+=ms}}};
test('универсальная миграция: 10 реальных областей, четыре места, участники и банк сохранены',()=>{
 const old=new GameLogic(),p=old.joinTeam('saryarka','Студент'),r=old.joinCreator('ernur');old.adjustPoints('saryarka',250);old.enableUniversal();
 assert.equal(old.state.regions.length,10);assert.equal(old.state.regions.some(t=>t.id==='creators'),false);assert.equal(old.region('saryarka').points,250);
 assert.equal(old.findPlayer(hashToken(p.playerToken)).name,'Студент');assert.equal(old.creatorFor(hashToken(r.playerToken)).creatorId,'ernur');assert.equal(new GameLogic(old.state).state.settings.mode,'team');
 assert.equal(old.state.regions.reduce((n,t)=>n+t.capacity,0),40);assert.equal(old.state.questions.length,10);
});
test('слоты: четыре обычных участника, два персональных доступа сверх лимита, смена имени',()=>{
 const {g}=make();for(let i=0;i<4;i++)g.joinTeam('saryarka','Игрок '+i);assert.throws(()=>g.joinTeam('saryarka','Лишний'),/4\/4/);
 const r=g.joinCreator('ernur','saryarka','Арман');assert.equal(r.player.name,'Арман');g.joinCreator('adilet','saryarka');
 assert.throws(()=>g.joinCreator('ernur','jetisu'),e=>e.code==='CREATOR_OCCUPIED');g.renamePlayer(r.player.pid,'Новый Арман');
 const view=g.view({playerHash:hashToken(r.playerToken),role:'creator'});assert.equal(view.viewer.isDevTelemetry,true);assert.equal(view.regions[0].occupied,4);assert.equal(view.regions[0].members.length,6);assert.equal(view.viewer.player.name,'Новый Арман');
 const publicView=g.view();assert.equal(JSON.stringify(publicView).includes('creatorId'),false);assert.equal(JSON.stringify(publicView).includes('tokenHash'),false);assert.equal(publicView.regions.some(t=>t.id==='creators'),false);
});
test('командный выбор: отмена, подтверждение сокомандником, семь игровых секунд и пауза',()=>{
 const {g,advance}=make(),a=g.joinTeam('saryarka','Алия'),b=g.joinTeam('saryarka','Бек');g.startRound('q1',30);const id=g.state.round.id;
 g.castVote('saryarka',a.player.pid,1,id);assert.deepEqual(g.votesFor('saryarka'),{});g.cancelVote('saryarka',a.player.pid,id);advance(8000);assert.equal(g.flushProposals(),false);
 g.castVote('saryarka',a.player.pid,0,id);g.confirmVote('saryarka',b.player.pid,a.player.pid,id);assert.deepEqual(g.votesFor('saryarka'),{0:1});
 g.castVote('saryarka',b.player.pid,0,id);advance(3000);g.pauseRound();advance(20000);assert.equal(g.flushProposals(),false);g.pauseRound();advance(4001);assert.equal(g.flushProposals(),true);assert.deepEqual(g.votesFor('saryarka'),{0:2});
});
test('экономика: несгораемые 15%, два верных ответа восстанавливают 20% без ресурсов',()=>{
 const {g}=make(),a=g.joinTeam('saryarka','Алия');g.adjustEconomy('saryarka',-100);assert.equal(g.region('saryarka').economy,15);
 g.startRound('q1',30);g.castVote('saryarka',a.player.pid,0,g.state.round.id);g.confirmVote('saryarka',a.player.pid,a.player.pid,g.state.round.id);g.resolveRound();assert.equal(g.region('saryarka').economy,15);assert.equal(g.region('saryarka').points,0);assert.equal(g.region('saryarka').recoveryAnswers,1);
 g.startRound('q1',30);g.castVote('saryarka',a.player.pid,0,g.state.round.id);g.confirmVote('saryarka',a.player.pid,a.player.pid,g.state.round.id);g.resolveRound();assert.equal(g.region('saryarka').economy,35);assert.equal(g.region('saryarka').points,0);
 g.startRound('q1',30);g.resolveRound();assert.equal(g.region('saryarka').economy,15);
});
test('сброс таймера сохраняет уже прошедшую часть семисекундного подтверждения',()=>{
 const {g,advance}=make(),a=g.joinTeam('jetisu','Алия');g.startRound('q1',30);g.castVote('jetisu',a.player.pid,0,g.state.round.id);advance(3000);g.resetTimer();advance(3999);assert.equal(g.flushProposals(),false);advance(1);assert.equal(g.flushProposals(),true);assert.deepEqual(g.votesFor('jetisu'),{0:1});
});
test('Solo: 150 имён без выбора области, личные ответы, серия, экономика не меняется',()=>{
 const {g}=make();g.setGameMode('solo');const players=Array.from({length:150},(_,i)=>g.joinTeam(null,'Игрок '+i));
 for(let round=0;round<3;round++){g.startRound('q1',30);g.castVote('saryarka',players[0].player.pid,round===2?1:0,g.state.round.id);g.castVote('saryarka',players[1].player.pid,1,g.state.round.id);g.resolveRound();}
 const a=g.findPlayer(hashToken(players[0].playerToken));assert.equal(a.capital,56);assert.equal(a.streak,0);assert.equal(g.ranking()[0].pid,a.pid);assert.ok(g.state.regions.every(t=>t.economy===100));assert.throws(()=>g.setGameMode('team'),/Завершите/);g.endRound();assert.throws(()=>g.setGameMode('team'),/40 мест/);
});
test('JSON не меняет формат, привилегии, 10 областей и нижний порог; сохраняет личный рейтинг',()=>{
 const {g}=make(),a=g.joinTeam('saryarka','Алия');let patch=g.editorSnapshot();patch.regions[0].members[0].capital=90;g.applyRawState(patch);assert.equal(g.findPlayer(hashToken(a.playerToken)).capital,90);
 patch=g.editorSnapshot();patch.settings.universal=false;assert.throws(()=>g.applyRawState(patch));patch=g.editorSnapshot();patch.regions[0].economy=0;assert.throws(()=>g.applyRawState(patch));patch=g.editorSnapshot();patch.regions.pop();assert.throws(()=>g.applyRawState(patch));
 assert.throws(()=>g.expandTeams(20));assert.throws(()=>g.setAllCapacities(8));assert.throws(()=>g.removeTeam('jetisu'));
});
test('подпись города: при приближении читаемо растёт, ограничена и учитывает размер холста',()=>{
 const far=labelScaleForDepth(130,230),near=labelScaleForDepth(5,230);assert.ok(near.pixels>far.pixels);assert.ok(near.pixels<=200&&far.pixels>=112);
 const a=labelScaleForDepth(30,230),b=labelScaleForDepth(30,460);assert.equal(a.pixels,b.pixels);assert.ok(Math.abs(a.world-b.world*2)<1e-9);
});

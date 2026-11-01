import test from 'node:test';
import assert from 'node:assert/strict';
import {GameLogic,hashToken} from '../game-logic.js';
import {tickPhantom} from '../phantom-game.js';

function fixture(){
  let now=100000;
  const game=new GameLogic(null,()=>now),ids=['saryarka','jetisu'];
  const players=ids.map((id,i)=>{const joined=game.joinTeam(id,'Команда '+i);game.adjustPoints(id,500);return game.findPlayer(hashToken(joined.playerToken));});
  game.phantomConfigure({enabled:true,betSeconds:5,negotiationSeconds:15});
  const event=()=>game.state.phantom.event;
  const act=(i,action,data={})=>game.phantomTeam(players[i],{eventId:event()?.id,offerVersion:event()?.offerVersion,action,...data});
  const control=(action,data={})=>game.phantomControl({eventId:event()?.id,action,...data});
  const advance=ms=>{now+=ms;tickPhantom(game);};
  const offer=()=>act(0,'offer',{toTeamId:ids[1],amount:100});
  return {game,event,act,control,advance,offer,time:()=>now};
}
test('war waits for the teacher after betting and survives a restart without an automatic start',()=>{
  const f=fixture();f.offer();f.act(1,'accept');f.advance(5001);
  assert.equal(f.event().stage,'ready');assert.equal(f.event().deadline,null);
  f.advance(300000);assert.equal(f.event().stage,'ready');
  const restored=new GameLogic(f.game.state,f.time);
  assert.equal(restored.state.phantom.event.stage,'ready');
  restored.phantomControl({eventId:f.event().id,action:'start'});
  assert.equal(restored.state.phantom.event.stage,'question');
});
test('teacher can change and pause negotiation and question timers, and cancel with exact refunds',()=>{
  const f=fixture();f.offer();assert.equal(f.event().deadline-f.time(),15000);
  f.control('pause',{paused:true});f.control('timer',{seconds:10});f.advance(60000);
  assert.equal(f.event().stage,'diplomacy');assert.equal(f.event().remaining,10000);
  f.control('pause',{paused:false});assert.equal(f.event().deadline-f.time(),10000);
  f.act(1,'accept');f.control('start');f.control('timer',{seconds:45});
  assert.equal(f.event().deadline-f.time(),45000);
  f.control('stop');assert.deepEqual(f.game.state.regions.filter(t=>['saryarka','jetisu'].includes(t.id)).map(t=>t.points),[500,500]);
});
test('automatic start is an explicit teacher choice and old saved configuration migrates safely',()=>{
  const f=fixture();f.game.phantomConfigure({autoStart:true});f.offer();f.act(1,'accept');f.advance(5001);
  assert.equal(f.event().stage,'question');
  const old=structuredClone(f.game.state);delete old.phantom.config.autoStart;delete old.phantom.config.negotiationSeconds;
  const restored=new GameLogic(old,f.time);assert.equal(restored.state.phantom.config.autoStart,false);assert.equal(restored.state.phantom.config.negotiationSeconds,30);
});
test('manual question progression waits for the teacher until automatic progression is enabled',()=>{
  const f=fixture();f.offer();f.act(1,'accept');f.control('start');f.control('autoAdvance',{enabled:false});
  const e=f.event();for(let i=0;i<2;i++)f.act(i,'answer',{roundId:e.round.id,option:e.round.question.correct});
  f.control('resolve');assert.equal(f.event().stage,'reveal');assert.equal(f.event().deadline,null);
  f.advance(20000);assert.equal(f.event().stage,'reveal');
  f.control('autoAdvance',{enabled:true});f.advance(2501);assert.equal(f.event().stage,'question');
});
test('manual Phantom adjustments are bounded and preserve real resources until final settlement',()=>{
  const f=fixture();f.offer();f.act(1,'accept');f.control('start');
  const before=f.game.state.regions.map(t=>t.points),fund=f.event().fund;
  f.control('adjust',{teamId:'saryarka',resourceDelta:100,economyDelta:-10});
  assert.equal(f.event().fighters[0].resources,100);assert.equal(f.event().fighters[0].economy,90);assert.equal(f.event().fund,fund);assert.deepEqual(f.game.state.regions.map(t=>t.points),before);
  assert.throws(()=>f.control('adjust',{teamId:'saryarka',resourceDelta:.5}));
  f.control('adjust',{teamId:'saryarka',economyDelta:-50});assert.equal(f.event().stage,'result');assert.equal(f.event().winner,'jetisu');
  assert.equal(f.game.state.regions.reduce((sum,t)=>sum+t.points,0),1000);
});

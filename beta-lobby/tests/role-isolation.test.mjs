import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {io} from 'socket.io-client';
import {PRIVACY_VERSION} from '../../game-config.js';
import {studioFixture} from './studio-fixture.mjs';

const command=(s,event,data={})=>new Promise((resolve,reject)=>s.timeout(5000).emit(event,data,(err,value)=>err?reject(err):resolve(value)));
async function fixture(t){
  const f=await studioFixture('owner'),clients=[];
  t.after(async()=>{clients.forEach(s=>s.disconnect());await f.server.close();});
  const response=await f.api('creator/rooms/create',{presetId:'full',name:'Раздельные роли',config:{teamCount:2},questions:[{id:'roles_q',text:'Какой ответ правильный?',options:['Первый','Второй','Третий','Четвёртый'],correct:1,points:25,explanation:'Тестовый источник.'}]});
  assert.equal(response.status,201,await response.clone().text());const {room}=await response.json(),r=await f.server.runtime.get(room.id),ids=r.server.game.state.regions.map(t=>t.id);
  await r.server.platformControl('google:owner','admission',{open:true});
  async function connect(surface='student',cookie=''){
    if(surface==='student'){
      const html=await fetch(f.origin+room.studentUrl,{headers:{Cookie:cookie}});
      cookie=[cookie,...html.headers.getSetCookie().map(v=>v.split(';')[0])].filter(Boolean).join('; ');
    }
    const s=io(f.origin,{autoConnect:false,reconnection:false,transports:['websocket'],path:'/rooms/'+room.id+'/socket.io',auth:{surface,activityVersion:1},extraHeaders:{Cookie:cookie}});
    clients.push(s);s.jar={cookie};s.surface=surface;s.on('session:ready',v=>{s.proof=v.proof;});s.on('state',v=>{s.latest=v;});const ready=once(s,'state');s.connect();await ready;return s;
  }
  const post=(s,path,data)=>fetch(f.origin+'/rooms/'+room.id+path,{method:'POST',headers:{Cookie:s.jar.cookie,Origin:f.origin,'Content-Type':'application/json','X-CQ-Client':'1','X-CQ-Socket':s.id,'X-CQ-Proof':s.proof,'X-CQ-Surface':s.surface},body:JSON.stringify(data)});
  async function join(s,name,regionId){return command(s,'joinTeam',{name,regionId,privacyConsent:{accepted:true,version:PRIVACY_VERSION}});}
  async function creator(){
    const s=await connect('student',f.cookie),joined=await join(s,'Адилет',ids[0]);assert.equal(joined.ok,true,joined.error);
    const bound=await post(s,'/api/session',{role:'player',token:joined.playerToken});assert.equal((await bound.json()).ok,true);
    s.jar.cookie+='; '+bound.headers.getSetCookie()[0].split(';')[0];return s;
  }
  return {...f,room,r,ids,connect,join,creator,post};
}
async function state(s,predicate){
  if(predicate(s.latest))return s.latest;
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{s.off('state',onState);reject(Error('Expected state did not arrive'));},3000);function onState(v){if(predicate(v)){clearTimeout(timer);s.off('state',onState);resolve(v);}}s.on('state',onState);});
}

test('teacher and creator tabs sharing browser cookies retain independent identities and logouts',async t=>{
  const f=await fixture(t),creator=await f.creator(),teacher=await f.connect('teacher',creator.jar.cookie);
  assert.equal(teacher.latest.viewer.role,'teacher');assert.equal(teacher.latest.viewer.player,null);assert.equal(teacher.latest.viewer.isCreator,false);
  await state(creator,s=>s.viewer.isCreator);assert.equal(creator.latest.viewer.role,'creator');assert.ok(creator.latest.viewer.player);
  const imported=await f.post(teacher,'/api/bulk/importQuestions',{questions:[{text:'Отдельный вопрос преподавателя?',options:['А','Б','В','Г'],correct:0,points:25}]});assert.equal((await imported.json()).ok,true);
  assert.equal((await command(teacher,'teacherLogout')).ok,true);assert.equal(creator.latest.viewer.isCreator,true);
  const reopened=await f.connect('teacher',creator.jar.cookie);assert.equal(reopened.latest.viewer.player,null);
  assert.equal((await command(creator,'leaveTeam')).ok,true);assert.equal(reopened.latest.viewer.role,'teacher');assert.equal(reopened.latest.viewer.player,null);
});

test('teacher and participating creator get Phantom answers and controls; ordinary players remain protected',async t=>{
  const f=await fixture(t),creator=await f.creator(),teacher=await f.connect('teacher',creator.jar.cookie),player=await f.connect();
  assert.equal((await f.join(player,'Участник',f.ids[1])).ok,true);
  for(const id of f.ids)await f.r.server.platformControl('google:owner','points',{teamId:id,delta:500});
  const offer=await command(creator,'phantomTeam',{action:'offer',toTeamId:f.ids[1],amount:100});assert.equal(offer.ok,true,offer.error);
  let e=f.r.server.game.state.phantom.event;
  assert.equal((await command(player,'phantomTeam',{action:'accept',eventId:e.id,offerVersion:e.offerVersion})).ok,true);
  assert.equal((await command(teacher,'phantomControl',{action:'start',eventId:e.id})).ok,true);
  const privileged=await state(creator,s=>s.phantom?.event?.stage==='question'),plain=await state(player,s=>s.phantom?.event?.stage==='question'),instructor=await state(teacher,s=>s.phantom?.event?.stage==='question');
  assert.equal(privileged.phantom.event.round.question.correct,1);assert.equal(instructor.phantom.event.round.question.correct,1);assert.equal(instructor.viewer.player,null);
  assert.equal(privileged.phantom.permissions.canControl,true);assert.equal(instructor.phantom.permissions.canControl,true);assert.equal(plain.phantom.permissions.canControl,false);
  assert.equal(plain.phantom.event.round.question.correct,undefined);assert.equal(plain.phantom.event.round.question.explanation,undefined);assert.deepEqual(plain.questions,[]);assert.ok(privileged.questions.length);
  assert.equal((await command(player,'phantomControl',{role:'creator',action:'timer',eventId:e.id,seconds:45})).code,'FORBIDDEN');
  assert.equal((await command(creator,'phantomControl',{action:'pause',eventId:e.id,paused:true})).ok,true);
  assert.equal((await command(teacher,'phantomControl',{action:'timer',eventId:e.id,seconds:45})).ok,true);
  assert.equal((await command(creator,'phantomControl',{action:'adjust',eventId:e.id,teamId:f.ids[0],resourceDelta:25,economyDelta:-10})).ok,true);
  e=f.r.server.game.state.phantom.event;assert.equal(e.fighters[0].resources,25);assert.equal(e.fighters[0].economy,90);assert.equal(e.remaining,45000);
});

test('participant totals include creators while ordinary slot limits and teacher identity stay independent',async t=>{
  const f=await fixture(t);await f.r.server.platformControl('google:owner','capacity',{capacity:1});
  const creator=await f.creator(),teacher=await f.connect('teacher',creator.jar.cookie),region=teacher.latest.regions.find(r=>r.id===f.ids[0]);
  assert.equal(teacher.latest.teamLeaderboard.find(row=>row.teamId===f.ids[0]).members,1);assert.equal(region.participantCount,1);assert.equal(region.creatorCount,1);assert.equal(region.occupied,0);assert.equal(region.members.length,1);
  const ordinary=await f.connect();assert.equal((await f.join(ordinary,'Участник',f.ids[0])).ok,true);
  const current=await state(teacher,s=>s.regions.find(r=>r.id===f.ids[0]).participantCount===2),team=current.regions.find(r=>r.id===f.ids[0]);assert.equal(team.occupied,1);assert.equal(team.participantCount,2);
  const extra=await f.connect();assert.equal((await f.join(extra,'Лишний участник',f.ids[0])).code,'TEAM_FULL');
  const rooms=await(await f.api('rooms')).json();assert.equal(rooms.rooms[0].participants,2);
});

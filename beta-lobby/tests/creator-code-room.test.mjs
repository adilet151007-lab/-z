import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {io} from 'socket.io-client';
import {hashToken} from '../../game-logic.js';
import {PRIVACY_VERSION} from '../../game-config.js';
import {studioFixture} from './studio-fixture.mjs';

const code='TEST_DEV_CONSOLE_2026!';
const command=(s,event,data={})=>new Promise((resolve,reject)=>s.timeout(5000).emit(event,data,(err,value)=>err?reject(err):resolve(value)));
async function fixture(t,user='student'){
  const previous=process.env.CREATOR_ADILET_CODE_HASH;
  process.env.CREATOR_ADILET_CODE_HASH=hashToken(code);
  const f=await studioFixture(user),clients=[];
  t.after(async()=>{clients.forEach(s=>s.disconnect());await f.server.close();if(previous===undefined)delete process.env.CREATOR_ADILET_CODE_HASH;else process.env.CREATOR_ADILET_CODE_HASH=previous;});
  const room=await f.platform.createRoom('google:owner',{name:'Администратор среди команд'});
  async function connect(cookie=''){
    const entry=await fetch(f.origin+'/rooms/'+room.id+'/student.html',{headers:{Cookie:cookie}});
    const device=entry.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
    cookie=[cookie,device].filter(Boolean).join('; ');
    const s=io(f.origin,{autoConnect:false,reconnection:false,transports:['websocket'],path:'/rooms/'+room.id+'/socket.io',auth:{surface:'student',activityVersion:1},extraHeaders:{Cookie:cookie}});
    clients.push(s);s.on('session:ready',v=>{s.proof=v.proof;});s.on('state',v=>{s.latest=v;});const ready=once(s,'state');s.connect();await ready;return s;
  }
  const join=(s,name)=>command(s,'joinTeam',{regionId:'jetisu',name,privacyConsent:{accepted:true,version:PRIVACY_VERSION}});
  return {...f,room,connect,join,command};
}
test('creator code joins a full team with admission closed; cookie and creator rights survive runtime restart',async t=>{
  const f=await fixture(t),r=await f.server.runtime.get(f.room.id);
  await r.server.platformControl('google:owner','capacity',{capacity:1});
  await r.server.platformControl('google:owner','admission',{open:true});
  const regular=await f.connect();assert.equal((await f.join(regular,'Участник')).ok,true);
  await r.server.platformControl('google:owner','admission',{open:false});
  const creator=await f.connect(),joined=await f.join(creator,code+' Адилет');
  assert.equal(joined.ok,true,joined.error);assert.equal(joined.isCreator,true);
  assert.equal(r.server.game.region('jetisu').members.length,2);
  const bound=await fetch(f.origin+'/rooms/'+f.room.id+'/api/session',{method:'POST',headers:{'Content-Type':'application/json','X-CQ-Client':'1','X-CQ-Socket':creator.id,'X-CQ-Proof':creator.proof},body:JSON.stringify({role:'player',token:joined.playerToken})});
  assert.equal((await bound.json()).ok,true);
  const cookie=bound.headers.getSetCookie()[0].split(';')[0];
  await f.server.runtime.stop(f.room.id);
  const resumed=await f.connect(cookie);
  assert.equal(resumed.latest.viewer.isCreator,true);assert.equal(resumed.latest.viewer.player.name,'Адилет');
  assert.equal((await command(resumed,'adjustPoints',{regionId:'jetisu',delta:25})).ok,true);
  const duplicate=await f.connect();assert.equal((await f.join(duplicate,code)).code,'CREATOR_OCCUPIED');
  const stranger=await f.connect();assert.equal((await f.join(stranger,code+'bad')).ok,false);assert.equal((await command(stranger,'adjustPoints',{regionId:'jetisu',delta:25})).code,'FORBIDDEN');
  assert.equal(JSON.stringify(resumed.latest).includes(code),false);
});
test('Google creator can join as a participant without exposing a pasted access code as their name',async t=>{
  const f=await fixture(t,'owner'),s=await f.connect(f.cookie),joined=await f.join(s,code);
  assert.equal(joined.ok,true,joined.error);assert.equal(joined.isCreator,true);assert.equal(joined.player.name,'owner');
  const r=await f.server.runtime.get(f.room.id),member=r.server.game.region('jetisu').members.find(m=>m.pid===joined.player.pid);
  assert.equal(member.creatorAuth,'account');assert.equal(JSON.stringify(r.server.game.editorSnapshot()).includes(code),false);
});

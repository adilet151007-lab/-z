import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {io} from 'socket.io-client';
import {studioFixture} from './studio-fixture.mjs';

async function fixture(t, userId='teacher') {
  const f=await studioFixture(userId),clients=[];
  t.after(async()=>{clients.forEach(s=>s.disconnect());await f.server.close();});
  const room=await f.platform.createRoom('google:owner',{name:'Проверка входа',subject:'Тест'});
  const invitation=await f.platform.roomInvite('google:owner',room.id);
  await f.platform.redeem('google:teacher',invitation.code);
  const base=f.origin+'/rooms/'+room.id;
  async function connect(surface='teacher',cookie=f.cookie) {
    const s=io(f.origin,{autoConnect:false,reconnection:false,transports:['websocket'],path:'/rooms/'+room.id+'/socket.io',auth:{surface,activityVersion:1},extraHeaders:{Cookie:cookie}});
    clients.push(s);s.on('session:ready',data=>{s.proof=data.proof;});s.on('state',state=>{s.latest=state;});
    const ready=once(s,'state');s.connect();await ready;return s;
  }
  async function post(s,action,data={},cookie=f.cookie,headers={}) {
    return fetch(base+'/api/bulk/'+action,{method:'POST',headers:{Cookie:cookie,Origin:f.origin,'Content-Type':'application/json','X-CQ-Client':'1','X-CQ-Socket':s.id,'X-CQ-Proof':s.proof,'X-CQ-Surface':'teacher',...headers},body:JSON.stringify(data)});
  }
  return {...f,room,base,connect,post};
}

test('account teacher can analyze, generate and import questions without a separate room cookie',async t=>{
  const f=await fixture(t),s=await f.connect(),runtime=await f.server.runtime.get(f.room.id),before=runtime.server.game.state.questions.length;
  assert.equal(s.latest.viewer.role,'teacher');
  const text='Тема 1. Культура\nКультура — это совокупность материальных и духовных ценностей общества.\nТрадиция — это передача обычаев между поколениями.\nРитуал — это установленная последовательность символических действий.\nИскусство — это творческое осмысление мира в художественных образах.';
  const analysis=await f.post(s,'analyzeSyllabus',{text});
  assert.equal(analysis.status,200,await analysis.clone().text());
  const analyzed=await analysis.json();assert.equal(analyzed.ok,true);assert.ok(analyzed.topics.length);
  const generated=await f.post(s,'generateQuestions',{text,topics:analyzed.topics,count:5}),drafts=await generated.json();
  assert.equal(drafts.ok,true,drafts.error);assert.ok(drafts.questions.length);
  const imported=await f.post(s,'importQuestions',{questions:drafts.questions}),result=await imported.json();
  assert.equal(result.ok,true,result.error);assert.ok(result.added);
  assert.equal(runtime.server.game.state.questions.length,before+result.added);
});

test('bulk access still requires the current account, correct surface, socket proof and origin',async t=>{
  const f=await fixture(t),teacher=await f.connect(),student=await f.connect('student'),guest=await f.connect('teacher','');
  assert.equal(student.latest.viewer.role,'guest');assert.equal(guest.latest.viewer.role,'guest');
  for(const response of [
    await f.post(teacher,'analyzeSyllabus',{},''),
    await f.post(teacher,'analyzeSyllabus',{},f.cookie,{'X-CQ-Proof':'wrong'}),
    await f.post(teacher,'analyzeSyllabus',{},f.cookie,{Origin:'https://example.invalid'}),
    await f.post(teacher,'analyzeSyllabus',{},f.cookie,{'X-CQ-Surface':'student'}),
    await f.post(student,'analyzeSyllabus'),
    await f.post(guest,'analyzeSyllabus'),
  ])assert.equal(response.status,403,await response.clone().text());
  await f.platform.setTeacher('google:owner','google:teacher',false);
  assert.equal((await f.post(teacher,'analyzeSyllabus')).status,403);
});

test('creator can edit through account login, but another manager cannot reuse its socket',async t=>{
  const f=await fixture(t,'owner'),owner=await f.connect();
  assert.equal(owner.latest.viewer.role,'teacher');
  const saved=await f.post(owner,'updateBranding',{branding:{title:'ERADIS — проверка'}});
  assert.equal(saved.status,200,await saved.clone().text());assert.equal((await saved.json()).ok,true);
  const runtime=await f.server.runtime.get(f.room.id);
  assert.equal(runtime.server.game.state.branding.title,'ERADIS — проверка');
  // A second valid manager account must not borrow the creator's HTTP proof.
  const secret='studio-synthetic-owner-secret-at-least-32-characters';
  const {createHmac}=await import('node:crypto');
  const key=createHmac('sha256',secret).update('culture-quest/lobby/account/v1').digest();
  const body=Buffer.from(JSON.stringify({kind:'google-account',sub:'teacher',name:'teacher',email:'teacher@example.test',expires:Date.now()+60000})).toString('base64url');
  const differentCookie='cq_account='+body+'.'+createHmac('sha256',key).update(body).digest('base64url');
  assert.equal((await f.post(owner,'updateBranding',{branding:{title:'Нельзя'}},differentCookie)).status,403);
});

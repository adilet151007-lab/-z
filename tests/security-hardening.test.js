import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {gzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {io} from 'socket.io-client';
import {createGameServer} from '../server.js';
import {hashToken} from '../game-logic.js';
import {QUESTION_BANK} from '../question-bank.js';
import {clientAddress} from '../security-controls.js';

const credentials={teacherPassword:'security-simulation-password',sessionSecret:'security-simulation-secret-more-than-thirty-two',creatorCodes:{adilet:'A'.repeat(26),ernur:'E'.repeat(26)}};
const localCode='CQL-simulation-only-not-a-production-key';
class Store{kind='memory';snapshot=null;writes=0;async load(){return structuredClone(this.snapshot)}async save(state){this.writes++;this.snapshot=structuredClone(state)}async close(){}}
const command=(socket,name,data={})=>new Promise((resolve,reject)=>socket.timeout(10000).emit(name,data,(error,value)=>error?reject(error):resolve(value)));
async function waitFor(check){const end=Date.now()+10000;while(!check()){if(Date.now()>end)throw new Error('Simulation state timeout');await new Promise(resolve=>setTimeout(resolve,10))}}
async function fixture(t,extra={}){
 const store=extra.store||new Store(),server=await createGameServer({...credentials,store,secureCookies:false,requireConsent:false,localAdminCodeHash:hashToken(localCode),...extra}),port=await server.listen(0,'127.0.0.1'),base='http://127.0.0.1:'+port,sockets=[];
 t.after(async()=>{sockets.forEach(socket=>socket.disconnect());await server.close()});
 async function browser(){const response=await fetch(base+'/student.html');await response.arrayBuffer();return {cookie:response.headers.getSetCookie().map(header=>header.split(';')[0]).join('; ')}}
 async function connect(jar,surface='student',more={}){jar??=await browser();const socket=io(base,{autoConnect:false,reconnection:false,transports:['websocket'],auth:{surface,activityVersion:1,...more},extraHeaders:{Cookie:jar.cookie||''}});socket.jar=jar;socket.surface=surface;sockets.push(socket);socket.on('session:ready',data=>socket.proof=data.proof);socket.on('state',state=>socket.latest=state);const ready=once(socket,'state');socket.connect();await ready;return socket}
 async function post(socket,path,data,headers={}){return fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-CQ-Client':'1','X-CQ-Socket':socket.id,'X-CQ-Proof':socket.proof,'X-CQ-Surface':socket.surface,Origin:base,Cookie:socket.jar.cookie,...headers},body:Buffer.isBuffer(data)?data:JSON.stringify(data)})}
 async function bind(socket,role,token){const response=await post(socket,'/api/session',{role,token}),body=await response.json();assert.equal(response.status,200,body.code);for(const header of response.headers.getSetCookie()){const entry=header.split(';')[0],name=entry.split('=')[0];socket.jar.cookie=socket.jar.cookie.split('; ').filter(value=>!value.startsWith(name+'=')).concat(entry).join('; ')}return response}
 async function teacher(){const socket=await connect(await browser(),'teacher'),result=await command(socket,'teacherLogin',{password:credentials.teacherPassword});assert.equal(result.ok,true,result.error);await bind(socket,'teacher',result.teacherToken);return socket}
 async function owner(){const socket=await connect(),result=await command(socket,'joinTeam',{regionId:'jetisu',name:credentials.creatorCodes.adilet});assert.equal(result.ok,true,result.error);await bind(socket,'player',result.playerToken);return {socket,...result}}
 async function lesson(teacher){const result=await command(teacher,'setAdmission',{open:true,rotate:true});assert.equal(result.ok,true,result.error);return result.token}
 async function join(name,token,regionId='jetisu',jar){const socket=await connect(jar),result=await command(socket,'joinTeam',{name,regionId,admissionToken:token});assert.equal(result.ok,true,result.error);return {socket,...result}}
 async function privateQuestion(teacher){const result=await command(teacher,'addCustomQuestion',{text:'Локальная проверка: какой вариант обозначает первый номер?',options:['Первый номер','Второй номер','Третий номер','Четвёртый номер'],correctIdx:0,points:25});assert.equal(result.ok,true,result.error);return server.game.state.questions.find(question=>!question.publicDemo).id}
 return {server,store,base,browser,connect,post,bind,teacher,owner,lesson,join,privateQuestion};
}

test('защита: правильный вход преподавателя выдаёт HttpOnly cookie и восстанавливается после переподключения',async t=>{
 const f=await fixture(t),teacher=await f.teacher(),jar={...teacher.jar};teacher.disconnect();const restored=await f.connect(jar,'teacher');assert.equal(restored.latest.viewer.role,'teacher');
 const student=await f.connect(jar,'student');assert.equal(student.latest.viewer.role,'guest');assert.equal((await command(student,'resetGame')).code,'FORBIDDEN');
 assert.equal((await command(restored,'teacherLogout')).ok,true);assert.equal((await f.connect(jar,'teacher')).latest.viewer.role,'guest');
});

test('защита: вредоносный gzip и большой JSON не распаковываются и не останавливают сервер',async t=>{
 const f=await fixture(t),guest=await f.connect(),payload=Buffer.concat([gzipSync(Buffer.from('{}')),Buffer.from('invalid-trailing-frame')]);
 const response=await f.post(guest,'/api/session',payload,{'Content-Encoding':'gzip'});assert.equal(response.status,415);assert.equal((await response.json()).code,'UNSUPPORTED_ENCODING');
 const oversized=await f.post(guest,'/api/session',{role:'player',token:'x'.repeat(5000)});assert.equal(oversized.status,413);assert.equal((await fetch(f.base+'/health')).status,200);
 const lock=JSON.parse(await readFile(new URL('../package-lock.json',import.meta.url)));assert.equal(lock.packages['node_modules/body-parser'].version,'2.4.0');
});

test('защита: лимит действует до проверки пароля, смена заголовка IP и переподключение его не обходят',async t=>{
 const request={headers:{'x-forwarded-for':'198.51.100.13, 203.0.113.2'},socket:{remoteAddress:'127.0.0.1'}};assert.equal(clientAddress(request), '127.0.0.1');assert.equal(clientAddress(request,true),'203.0.113.2');request.headers['x-forwarded-for']='198.51.100.99, 203.0.113.2';assert.equal(clientAddress(request,true),'203.0.113.2');
 let now=1000;const f=await fixture(t,{securityNow:()=>now}),socket=await f.connect(await f.browser(),'teacher');
 for(let i=0;i<20;i++)assert.equal((await command(socket,'teacherLogin',{password:'wrong-'+i})).code,'BAD_PASSWORD');
 const blocked=await command(socket,'teacherLogin',{password:credentials.teacherPassword});assert.equal(blocked.code,'RATE_LIMIT');assert.ok(blocked.retryAfterMs<=10000);
 const another=await f.connect(await f.browser(),'teacher');assert.equal((await command(another,'teacherLogin',{password:credentials.teacherPassword})).code,'RATE_LIMIT');
 now+=10001;assert.equal((await command(another,'teacherLogin',{password:credentials.teacherPassword})).ok,true);
});

test('защита: боты без ссылки не занимают места, закрытие и смена ссылки прекращают новый вход',async t=>{
 const f=await fixture(t),teacher=await f.teacher(),outsiders=await Promise.all(Array.from({length:6},()=>f.connect()));
 for(const socket of outsiders)assert.equal((await command(socket,'joinTeam',{name:'Посторонний',regionId:'jetisu'})).code,'ADMISSION_CLOSED');assert.equal(f.server.game.region('jetisu').members.length,0);
 const token=await f.lesson(teacher);assert.equal((await command(outsiders[0],'joinTeam',{name:'Посторонний',regionId:'jetisu'})).code,'ADMISSION_REQUIRED');const student=await f.join('Участник',token);
 await command(teacher,'setAdmission',{open:false});assert.equal((await command(outsiders[1],'joinTeam',{name:'Посторонний',regionId:'jetisu',admissionToken:token})).code,'ADMISSION_CLOSED');assert.ok(f.server.game.findPlayer(hashToken(student.playerToken)));
 await f.lesson(teacher);assert.equal((await command(outsiders[2],'joinTeam',{name:'Посторонний',regionId:'jetisu',admissionToken:token})).code,'ADMISSION_REQUIRED');
});

test('защита: один браузер не занимает два места, поддельная cookie и токен занятия не дают административный вход',async t=>{
 const f=await fixture(t),teacher=await f.teacher(),token=await f.lesson(teacher),jar=await f.browser(),student=await f.join('Первый',token,'jetisu',jar),duplicate=await f.connect(jar);
 assert.equal((await command(duplicate,'joinTeam',{name:'Дубликат',regionId:'mangystau',admissionToken:token})).code,'DEVICE_OCCUPIED');
 const forged=await f.connect({cookie:'cq-device=forged'});assert.equal((await command(forged,'joinTeam',{name:'Подмена',regionId:'jetisu',admissionToken:token})).code,'DEVICE_REQUIRED');
 const confused=await f.post(duplicate,'/api/session',{role:'teacher',token});assert.equal(confused.status,400);assert.equal(f.server.game.region('jetisu').members.length,1);
 await f.bind(student.socket,'player',student.playerToken);student.socket.disconnect();const resumed=await f.connect(jar);assert.equal(resumed.latest.viewer.player.pid,student.player.pid);
});

test('защита: Универсал допускает несколько людей, но отзыв закрывает старый код и не повышает чужие права',async t=>{
 const f=await fixture(t),owner=await f.owner(),one=await f.join(localCode+' Помощник один',null,'mangystau'),two=await f.join(localCode+' Помощник два',null,'turkistan');
 assert.equal(f.server.game.adminGrantFor(one.player.pid).tier,'local');assert.equal(f.server.game.adminGrantFor(two.player.pid).tier,'local');
 assert.equal((await command(one.socket,'grantAdmin',{pid:one.player.pid,permissions:{questions:true}})).code,'FORBIDDEN');assert.equal((await command(one.socket,'freeSlot',{regionId:'jetisu',pid:owner.player.pid})).code,'PROTECTED_SESSION');
 assert.equal((await command(owner.socket,'revokeAdmin',{pid:one.player.pid})).localCodeRevoked,true);await command(one.socket,'leaveTeam');const denied=await command(one.socket,'joinTeam',{name:localCode+' Помощник один',regionId:'mangystau'});assert.equal(denied.ok,false);
 assert.equal((await command(two.socket,'adjustPoints',{regionId:'mangystau',delta:25})).ok,true);
 const rotated=await command(owner.socket,'rotateLocalAccessKey');assert.match(rotated.code,/^CQL-/);const newUser=await f.join(rotated.code+' Новый помощник',null,'mangystau');assert.equal(f.server.game.adminGrantFor(newUser.player.pid).tier,'local');
});

test('защита: публичные ответы исключены из настоящей игры, импорт с новым ID не снимает пометку демо',async t=>{
 const f=await fixture(t),teacher=await f.teacher();assert.equal((await command(teacher,'startRound',{questionId:'q1',duration:30})).code,'PUBLIC_DEMO_DISABLED');
 const imported=await command(teacher,'importQuestions',{questions:[{...QUESTION_BANK[0],id:'fake-private',text:QUESTION_BANK[0].text+' ',subject:'Другой предмет'}]});assert.equal(imported.ok,true);assert.equal(f.server.game.state.questions.at(-1).publicDemo,true);
 const id=await f.privateQuestion(teacher);assert.equal((await command(teacher,'startRound',{questionId:id,duration:30})).ok,true);assert.deepEqual(f.server.game.state.match.questionIds,[id]);
 await command(teacher,'resolveRound');await command(teacher,'endRound');assert.equal((await command(teacher,'setPublicDemo',{enabled:true})).ok,true);assert.equal((await command(teacher,'startRound',{questionId:'q1',duration:30})).ok,true);
});

test('защита: подмена ролей, спам запрещённых команд, SQL- и HTML-строки не меняют чужой счёт и не открывают исходники',async t=>{
 const f=await fixture(t),teacher=await f.teacher(),token=await f.lesson(teacher),alice=await f.join('Тест <script>alert(1)</script>',token),bob=await f.join("SQL'; DROP TABLE players; --",token,'mangystau'),forged=await f.connect(await f.browser(),'student',{role:'creator',isCreator:true,isDevTelemetry:true});
 const writes=f.store.writes;for(let i=0;i<30;i++)assert.equal((await command(forged,'adjustPoints',{regionId:'jetisu',delta:1000})).code,'FORBIDDEN');assert.equal(f.store.writes,writes);assert.equal(f.server.game.region('jetisu').points,0);
 assert.equal((await command(bob.socket,'chatSubscribe',{room:'support:'+alice.player.pid})).code,'FORBIDDEN');assert.equal((await command(alice.socket,'getSnapshot')).code,'FORBIDDEN');
 for(const path of ['server.js','security-controls.js','.env','question-bank.js','achievement-system.js'])assert.equal((await fetch(f.base+'/'+path)).status,404,path);
 const studentView=alice.socket.latest;assert.equal(studentView.questions.length,0);assert.equal(JSON.stringify(studentView).includes('tokenHash'),false);
});

test('защита: 150 фантомных студентов входят по допуску, отвечают и сохраняют сессию без потери голосов',async t=>{
 const f=await fixture(t),teacher=await f.teacher();await command(teacher,'setGameMode',{mode:'solo'});const token=await f.lesson(teacher),id=await f.privateQuestion(teacher);
 const players=await Promise.all(Array.from({length:150},(_,index)=>f.join('Фантом '+index,token)));assert.equal(f.server.game.state.regions.reduce((sum,team)=>sum+team.members.length,0),150);
 await command(teacher,'startRound',{questionId:id,duration:60});const roundId=f.server.game.state.round.id;const replies=await Promise.all(players.map((player,index)=>command(player.socket,'castVote',{roundId,optionIdx:0,requestId:'phantom_'+index,clientSubmittedAt:0})));assert.ok(replies.every(reply=>reply.ok));assert.equal(Object.keys(f.server.game.state.round.ballots).length,150);
 await command(teacher,'resolveRound');assert.ok(f.server.game.ranking().every(player=>player.capital===25));const first=players[0];await f.bind(first.socket,'player',first.playerToken);first.socket.disconnect();const resumed=await f.connect(first.socket.jar);assert.equal(resumed.latest.viewer.player.pid,first.player.pid);
 assert.equal(f.server.game.ranking().length,150);
});

test('защита: зависшее сохранение чата не блокирует ответ, отказ хранилища чата не откатывает игровые данные',async t=>{
 let release,started;const begun=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);let fail=false;const chatStore={kind:'memory',async load(){return null},async save(){started();await gate;if(fail)throw new Error('simulated-chat-store-failure')}};
 const f=await fixture(t,{chatStore}),teacher=await f.teacher(),token=await f.lesson(teacher),student=await f.join('Участник',token),id=await f.privateQuestion(teacher);await command(teacher,'setTeamRules',{decision:'instant',tradeEnabled:false});await command(teacher,'startRound',{questionId:id,duration:30});
 const sending=command(student.socket,'chatSend',{room:'global',text:'Проверка очереди',clientId:'isolated_message_1'});await begun;let timer;
 try{const answer=await Promise.race([command(student.socket,'castVote',{roundId:f.server.game.state.round.id,optionIdx:0}),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Chat blocked game input')),700))]);assert.equal(answer.ok,true)}finally{clearTimeout(timer);release()}
 assert.equal((await sending).ok,true);fail=true;assert.equal((await command(student.socket,'chatSend',{room:'global',text:'Не сохранится',clientId:'isolated_message_2'})).code,'STORAGE_ERROR');assert.equal(f.server.game.state.round.ballots[student.player.pid],0);
});

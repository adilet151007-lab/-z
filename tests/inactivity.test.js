import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {io} from 'socket.io-client';
import {createGameServer,SESSION_IDLE_MS} from '../server.js';
import {hashToken} from '../game-logic.js';

const credentials={teacherPassword:'idle-test-teacher-password',sessionSecret:'idle-test-signing-secret-at-least-thirty-two',creatorCodes:{adilet:'A'.repeat(26),ernur:'E'.repeat(26)}};
class Store{kind='memory';snapshot=null;fail=false;async load(){return structuredClone(this.snapshot)}async save(state){if(this.fail)throw new Error('simulated-idle-storage-failure');this.snapshot=structuredClone(state)}async close(){}}
const command=(socket,event,data={})=>new Promise((resolve,reject)=>socket.timeout(5000).emit(event,data,(error,result)=>error?reject(error):resolve(result)));
async function fixture(t){
 let clock=Date.now(),server,base;const store=new Store(),clients=[];
 const start=async()=>{server=await createGameServer({...credentials,store,sessionNow:()=>clock,requireConsent:false,secureCookies:false});base=`http://127.0.0.1:${await server.listen(0,'127.0.0.1')}`};
 await start();t.after(async()=>{clients.forEach(s=>s.disconnect());await server.close()});
 async function connect(cookie='',surface='student'){
  const socket=io(base,{auth:{surface,activityVersion:1},extraHeaders:cookie?{Cookie:cookie}:{},transports:['websocket'],reconnection:false,autoConnect:false});clients.push(socket);
  socket.on('session:ready',data=>socket.proof=data.proof);socket.on('state',state=>socket.latest=state);socket.surface=surface;
  const ready=once(socket,'state');socket.connect();await ready;return socket;
 }
 async function bind(socket,role,token){const response=await fetch(base+'/api/session',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-CQ-Client':'1','X-CQ-Socket':socket.id,'X-CQ-Proof':socket.proof,'X-CQ-Surface':socket.surface},body:JSON.stringify({role,token})});const result=await response.json();return {response,result,cookie:response.headers.getSetCookie()[0]?.split(';')[0]}}
 async function join(name='Алия',regionId='jetisu'){const socket=await connect(),result=await command(socket,'joinTeam',{name,regionId});assert.equal(result.ok,true,result.error);const bound=await bind(socket,'player',result.playerToken);assert.equal(bound.result.ok,true);return {socket,...result,cookie:bound.cookie}}
 async function teacher(){const socket=await connect('','teacher'),result=await command(socket,'teacherLogin',{password:credentials.teacherPassword});assert.equal(result.ok,true);const bound=await bind(socket,'teacher',result.teacherToken);assert.equal(bound.result.ok,true);return {socket,cookie:bound.cookie}}
 return {store,connect,bind,join,teacher,get server(){return server},advance:ms=>clock+=ms,restart:async()=>{clients.forEach(s=>s.disconnect());await server.close();await start()}};
}

test('бездействие: ровно 30 минут освобождают места обоих владельцев и обычного игрока, активный игрок остаётся',async t=>{
 const f=await fixture(t),a=await f.join(credentials.creatorCodes.adilet+' Адилет'),e=await f.join(credentials.creatorCodes.ernur+' Ернур'),inactive=await f.join('Данияр'),active=await f.join('Алия');
 assert.equal((await command(a.socket,'grantAdmin',{pid:inactive.player.pid,permissions:{players:true},effectDuration:1000})).ok,true);
 assert.equal((await command(a.socket,'adjustPoints',{regionId:'jetisu',delta:250})).ok,true);
 f.advance(SESSION_IDLE_MS-1);assert.equal((await command(active.socket,'session:activity')).ok,true);await f.server.checkInactiveSessions();assert.equal(f.server.game.region('jetisu').members.length,4);
 const expiredA=once(a.socket,'session:expired'),expiredE=once(e.socket,'session:expired');f.advance(1);await f.server.checkInactiveSessions();
 assert.deepEqual((await expiredA)[0].roles,['player']);assert.deepEqual((await expiredE)[0].roles,['player']);
 assert.deepEqual(f.server.game.region('jetisu').members.map(m=>m.pid),[active.player.pid]);assert.equal(f.server.game.region('jetisu').points,250);assert.equal(f.server.game.adminGrantFor(inactive.player.pid),null);
 assert.equal((await f.connect(a.cookie)).latest.viewer.role,'guest');assert.equal((await command(a.socket,'adjustPoints',{regionId:'jetisu',delta:25})).code,'FORBIDDEN');
 const next=await f.join(credentials.creatorCodes.adilet+' Арман');assert.equal(next.isCreator,true);assert.equal(next.player.name,'Арман');
});

test('бездействие: переподключение, просмотр состояния и фоновая подписка чата не продлевают сессию',async t=>{
 const f=await fixture(t),joined=await f.join();f.advance(SESSION_IDLE_MS-1000);const restored=await f.connect(joined.cookie);
 assert.equal(restored.latest.viewer.player.pid,joined.player.pid);assert.equal((await command(restored,'chatSubscribe',{room:'global'})).ok,true);
 f.advance(1000);assert.equal((await command(restored,'session:activity')).code,'SESSION_EXPIRED');await f.server.checkInactiveSessions();
 assert.equal(f.server.game.region('jetisu').members.length,0);assert.equal((await f.connect(joined.cookie)).latest.viewer.player,null);
 const invalid=await f.bind(restored,'player',decodeURIComponent(joined.cookie.slice(joined.cookie.indexOf('=')+1)));assert.equal(invalid.result.code,'SESSION_EXPIRED');
});

test('бездействие: сервер принимает своё время, действие в другой вкладке продлевает только эту сессию',async t=>{
 const f=await fixture(t),a=await f.join('Алия'),b=await f.join('Данияр'),otherTab=await f.connect(a.cookie);const oldAt=f.store.snapshot.accessControl.activity.players[a.player.pid];
 f.advance(20*60000);assert.equal((await command(otherTab,'session:activity',{lastActiveAt:Date.now()+864000000})).code,'INVALID_ACTION');f.advance(5000);
 assert.equal((await command(otherTab,'session:activity')).ok,true);const revision=f.server.game.state.revision;await f.server.checkInactiveSessions();
 assert.equal(f.server.game.state.revision,revision);assert.equal(f.store.snapshot.accessControl.activity.players[a.player.pid]-oldAt,20*60000+5000);
 f.advance(10*60000);await f.server.checkInactiveSessions();assert.equal(f.server.game.findPlayer(hashToken(decodeURIComponent(a.cookie.slice(a.cookie.indexOf('=')+1)))).pid,a.player.pid);assert.equal(f.server.game.region('jetisu').members.some(m=>m.pid===b.player.pid),false);
});

test('бездействие: перезапуск и пробуждение сервера не сбрасывают срок и не восстанавливают просроченный доступ',async t=>{
 const f=await fixture(t),owner=await f.join(credentials.creatorCodes.adilet+' Адилет');f.advance(10*60000);assert.equal((await command(owner.socket,'session:activity')).ok,true);
 await f.restart();assert.equal((await f.connect(owner.cookie)).latest.viewer.isCreator,true);f.advance(SESSION_IDLE_MS);await f.restart();
 assert.equal((await f.connect(owner.cookie)).latest.viewer.role,'guest');const replacement=await f.join(credentials.creatorCodes.adilet+' Адилет');assert.equal(replacement.isCreator,true);assert.equal(f.server.game.region('jetisu').members.length,1);
});

test('бездействие: преподаватель также выходит; действия одного преподавателя не поддерживают второй вход',async t=>{
 const f=await fixture(t),a=await f.teacher(),b=await f.teacher();f.advance(25*60000);const refreshed=await f.connect(a.cookie,'teacher');assert.equal(refreshed.latest.viewer.role,'teacher');assert.equal((await command(refreshed,'session:activity')).ok,true);
 const expired=once(b.socket,'session:expired');f.advance(5*60000);await f.server.checkInactiveSessions();assert.deepEqual((await expired)[0].roles,['teacher']);
 assert.equal((await f.connect(b.cookie,'teacher')).latest.viewer.role,'guest');assert.equal((await f.connect(a.cookie,'teacher')).latest.viewer.role,'teacher');
 await f.restart();f.advance(25*60000);await f.server.checkInactiveSessions();assert.equal((await f.connect(a.cookie,'teacher')).latest.viewer.role,'guest');assert.equal((await command(await f.connect('','teacher'),'teacherLogin',{password:credentials.teacherPassword})).ok,true);
});

test('бездействие: отказ БД не рассылает несохранённое исключение, повтор освобождает место',async t=>{
 const f=await fixture(t),owner=await f.join(credentials.creatorCodes.adilet+' Адилет');let notices=0;owner.socket.on('session:expired',()=>notices++);f.advance(SESSION_IDLE_MS);f.store.fail=true;
 await assert.rejects(f.server.checkInactiveSessions(),/simulated-idle-storage-failure/);assert.equal(f.server.game.region('jetisu').members.length,1);assert.equal(notices,0);
 f.store.fail=false;const expired=once(owner.socket,'session:expired');await f.server.checkInactiveSessions();await expired;assert.equal(notices,1);assert.equal(f.server.game.region('jetisu').members.length,0);assert.equal(f.store.snapshot.regions.find(t=>t.id==='jetisu').members.length,0);
});

test('клиент: только настоящие действия отправляют активность; фон, скрытая вкладка и гостевой экран не отправляют',async t=>{
 const previous={document:globalThis.document,local:globalThis.localStorage,session:globalThis.sessionStorage,io:globalThis.__idleIo},listeners=new Map(),sent=[];let engine,socket;
 t.after(()=>{engine?.stopActivityTracking();globalThis.document=previous.document;globalThis.localStorage=previous.local;globalThis.sessionStorage=previous.session;globalThis.__idleIo=previous.io});
 globalThis.document={hidden:false,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};const values=new Map();globalThis.localStorage=globalThis.sessionStorage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 globalThis.__idleIo=()=>socket={events:new Map(),on(name,fn){this.events.set(name,fn);return this},connect(){this.connected=true;this.events.get('connect')();return this},emit(name,data){sent.push({name,data})}};
 let source=await readFile(new URL('../shared-engine.js',import.meta.url),'utf8');source=source.replace(/^import .*\n/gm,'').replace(/^export \{ .*from .*\n/gm,'');
 const prefix="const io=globalThis.__idleIo;const PRIVACY_VERSION='2026-10-23';const DEFAULT_SUBJECT='Мәдениеттану';\n",{GameEngine}=await import('data:text/javascript;base64,'+Buffer.from(prefix+source).toString('base64'));engine=new GameEngine();
 listeners.get('pointerdown')({isTrusted:true});assert.equal(sent.length,0);
 const state={viewer:{role:'student',player:{pid:'a',regionId:'jetisu',name:'Алия'}},settings:{mode:'team'},serverTime:Date.now()};socket.events.get('state')(state);socket.events.get('state')(state);assert.equal(sent.length,0);
 listeners.get('scroll')({isTrusted:false});globalThis.document.hidden=true;listeners.get('keydown')({isTrusted:true});assert.equal(sent.length,0);
 globalThis.document.hidden=false;listeners.get('pointerdown')({isTrusted:true});assert.deepEqual(sent,[{name:'session:activity',data:{}}]);listeners.get('scroll')({isTrusted:true});assert.equal(sent.length,1);
 values.set('cq_session_v3','old');socket.events.get('session:expired')({roles:['player']});assert.match(engine.sessionNotice,/30 минут/);assert.equal(values.has('cq_session_v3'),false);engine.stopActivityTracking();assert.equal(listeners.size,0);
});

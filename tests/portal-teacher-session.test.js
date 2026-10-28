import test from 'node:test';
import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
import {createGameServer,SESSION_IDLE_MS} from '../server.js';

const command=(s,event,data={})=>new Promise((resolve,reject)=>s.timeout(3000).emit(event,data,(error,result)=>error?reject(error):resolve(result)));
test('account teacher can open an old room; fresh login has its own idle clock and revoked accounts lose access',async t=>{
 let clock=Date.now(),allowed=true;
 const store={kind:'memory',snapshot:null,load:async()=>null,save:async s=>{store.snapshot=structuredClone(s)},close:async()=>{}};
 const server=await createGameServer({teacherPassword:'synthetic-room-password',sessionSecret:'synthetic-room-secret-at-least-32-characters',store,creatorCodes:{},secureCookies:false,sessionNow:()=>clock,authorizeTeacher:async req=>allowed&&req.headers['x-test-account']==='manager'});
 const clients=[];t.after(async()=>{clients.forEach(s=>s.disconnect());await server.close();});
 const base='http://127.0.0.1:'+await server.listen(0,'127.0.0.1');clock+=SESSION_IDLE_MS+1000;
 const connect=header=>new Promise((resolve,reject)=>{const s=io(base,{auth:{surface:'teacher'},transports:['websocket'],extraHeaders:{'x-test-account':header},reconnection:false});clients.push(s);s.once('state',state=>resolve({s,state}));s.once('connect_error',reject);});
 const teacher=await connect('manager');assert.equal(teacher.state.viewer.role,'teacher');
 assert.equal((await command(teacher.s,'getAdmissionLink')).ok,true);
 await server.checkInactiveSessions();assert.ok(Object.values(store.snapshot.accessControl.activity.teachers).some(r=>r.at===clock));
 const guest=await connect('stranger');assert.equal(guest.state.viewer.role,'guest');assert.equal((await command(guest.s,'getAdmissionLink')).code,'FORBIDDEN');
 allowed=false;assert.equal((await command(teacher.s,'getAdmissionLink')).code,'FORBIDDEN');
});

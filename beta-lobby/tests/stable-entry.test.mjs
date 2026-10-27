import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {io} from 'socket.io-client';
import {createGameServer} from '../../server.js';
import {parseInvitation} from '../public/lobby-core.js';

const credentials={teacherPassword:'synthetic-stable-link-password',sessionSecret:'synthetic-stable-link-secret-at-least-32-characters'};
class Store {kind='memory';snapshot=null;async load(){return structuredClone(this.snapshot);}async save(value){this.snapshot=structuredClone(value);}async close(){}}
const command=(socket,event,data={})=>new Promise((resolve,reject)=>socket.timeout(5000).emit(event,data,(error,result)=>error?reject(error):resolve(result)));
async function fixture(t,store=new Store()){
 const server=await createGameServer({...credentials,store,requireConsent:false,cookieSessions:false}),port=await server.listen(0,'127.0.0.1'),sockets=[];
 let closed=false;
 async function close(){if(closed)return;closed=true;sockets.forEach(socket=>socket.disconnect());await server.close();}
 t.after(close);
 async function connect(surface='student'){const socket=io('http://127.0.0.1:'+port,{autoConnect:false,reconnection:false,transports:['websocket'],auth:{surface}});sockets.push(socket);const ready=once(socket,'state');socket.connect();await ready;return socket;}
 async function teacher(){const socket=await connect('teacher'),result=await command(socket,'teacherLogin',{password:credentials.teacherPassword});assert.equal(result.ok,true,result.error);return socket;}
 async function join(token,name='Участник'){const socket=await connect();return {socket,...await command(socket,'joinTeam',{regionId:'jetisu',name,admissionToken:token})};}
 return {server,store,connect,teacher,join,close};
}

test('постоянная ссылка не меняется при продлении, закрытии и открытии нового занятия',async t=>{
 const f=await fixture(t),teacher=await f.teacher(),first=await command(teacher,'setAdmission',{open:true}),token=first.stableToken;
 assert.ok(token);assert.equal((await f.join(token,'Первый')).ok,true);
 const renewed=await command(teacher,'setAdmission',{open:true,rotate:true});assert.equal(renewed.stableToken,token);
 await command(teacher,'setAdmission',{open:false});assert.equal((await f.join(token)).code,'ADMISSION_CLOSED');
 const reopened=await command(teacher,'setAdmission',{open:true,rotate:true});assert.equal(reopened.stableToken,token);assert.equal((await f.join(token,'Второй')).ok,true);
});
test('постоянный адрес сохраняется в хранилище и переживает перезапуск сервера',async t=>{
 const store=new Store(),first=await fixture(t,store),teacher=await first.teacher(),entry=await command(teacher,'setAdmission',{open:true});await first.close();
 const second=await fixture(t,store),otherTeacher=await second.teacher();assert.equal((await command(otherTeacher,'getAdmissionLink')).stableToken,entry.stableToken);assert.equal((await second.join(entry.stableToken)).ok,true);
});
test('отзыв меняет подписанный токен; универсальный вход и действующие студенты сохраняются',async t=>{
 const f=await fixture(t),teacher=await f.teacher(),entry=await command(teacher,'setAdmission',{open:true}),student=await f.join(entry.stableToken);
 const revoked=await command(teacher,'revokeAdmissionLink');assert.equal(revoked.ok,true);assert.notEqual(revoked.stableToken,entry.stableToken);
 assert.equal((await f.join(entry.stableToken)).ok,true);assert.equal((await f.join(revoked.stableToken,'Новый')).ok,true);
 assert.ok(f.server.game.region('jetisu').members.some(member=>member.pid===student.player.pid));
});
test('гость не управляет допуском; публичный вход не даёт права учителя',async t=>{
 const f=await fixture(t),teacher=await f.teacher(),guest=await f.connect(),entry=await command(teacher,'setAdmission',{open:true});
 assert.equal((await command(guest,'getAdmissionLink')).code,'FORBIDDEN');assert.equal((await command(guest,'revokeAdmissionLink')).code,'FORBIDDEN');
 assert.equal((await f.join(entry.stableToken+'x')).ok,true);
 const joined=await f.join(entry.stableToken);assert.equal(joined.ok,true);assert.equal((await command(joined.socket,'resetGame')).code,'FORBIDDEN');
});
test('лобби принимает постоянные ссылки без срока годности и отклоняет токены других ролей',()=>{
 const encode=data=>Buffer.from(JSON.stringify(data)).toString('base64url')+'.'+'s'.repeat(43),token=encode({role:'classroom',id:'simulated-classroom-identifier-12345678'});
 assert.equal(parseInvitation(token).token,token);
 assert.throws(()=>parseInvitation(encode({role:'teacher',id:'simulated-classroom-identifier-12345678'})));
 assert.throws(()=>parseInvitation(encode({role:'classroom',id:'short'})));
});

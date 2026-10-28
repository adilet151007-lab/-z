import test from 'node:test';
import assert from 'node:assert/strict';
import {issueQrTicket,validQrTicket} from '../qr-admission.js';
import {createGameServer} from '../server.js';

const secret='local-qr-test-secret-at-least-32-characters';
test('QR rotates every 3 seconds; signed tickets expire and cannot cross rooms or epochs',()=>{
 const now=300000,a=issueQrTicket(secret,'room-a','epoch-a',now);
 assert.equal(a.token,issueQrTicket(secret,'room-a','epoch-a',now+2999).token);
 assert.notEqual(a.token,issueQrTicket(secret,'room-a','epoch-a',now+3000).token);
 assert.equal(validQrTicket(a.token,secret,'room-a','epoch-a',now+14999),true);
 for(const [scope,epoch,time]of [['room-b','epoch-a',now],['room-a','epoch-b',now],['room-a','epoch-a',now-1],['room-a','epoch-a',now+15000]])assert.equal(validQrTicket(a.token,secret,scope,epoch,time),false);
 for(const bad of [a.token+'x',a.token.split('.')[0]+'.'+'я'.repeat(43),'malformed',null])assert.equal(validQrTicket(bad,secret,'room-a','epoch-a',now),false);
});
test('QR endpoint requires teacher, honours admission, accepts fresh scans and rejects expired scans',async t=>{
 let now=300000;
 const server=await createGameServer({teacherPassword:'local-password',sessionSecret:secret,store:{kind:'memory',load:async()=>null,save:async()=>{},close:async()=>{}},creatorCodes:{},secureCookies:false,securityNow:()=>now,authorizeTeacher:async req=>req.headers['x-qr-test']==='teacher',authorizePlatform:async()=>true});
 t.after(()=>server.close());const port=await server.listen(0,'127.0.0.1'),base='http://127.0.0.1:'+port;
 const teacher={headers:{'x-qr-test':'teacher'}},get=path=>fetch(base+path,{redirect:'manual'});
 assert.equal((await get('/api/join-qr')).status,403);
 assert.equal((await fetch(base+'/api/join-qr',teacher)).status,409);
 await server.platformControl('test','admission',{open:true});
 const a=await(await fetch(base+'/api/join-qr',teacher)).json();now+=3000;
 const b=await(await fetch(base+'/api/join-qr',teacher)).json();assert.notEqual(a.token,b.token);
 const scanned=await get('/student.html?qr='+encodeURIComponent(a.token));assert.equal(scanned.status,303);assert.equal(scanned.headers.get('location'),'/student.html');
 now=315000;assert.equal((await get('/student.html?qr='+encodeURIComponent(a.token))).status,410);
 assert.equal((await get('/student.html?qr=forged')).status,410);
 const current=await(await fetch(base+'/api/join-qr',teacher)).json();await server.platformControl('test','admission',{open:false});
 assert.equal((await get('/student.html?qr='+encodeURIComponent(current.token))).status,403);
});

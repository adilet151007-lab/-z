import test from 'node:test';
import assert from 'node:assert/strict';
import {createPortalServer} from '../portal-server.mjs';
import {GAME_ORIGIN} from '../public/lobby-config.js';

async function fixture(t,extra={}){
 const server=createPortalServer({publicOrigin:'http://127.0.0.1:3000',sessionSecret:'synthetic-portal-session-secret-over-32-characters',...extra}),port=await server.listen(0,'127.0.0.1');
 t.after(()=>server.close());return {origin:'http://127.0.0.1:'+port,server};
}
test('сервер лобби работает без игровой базы и сообщает о ненастроенном Google',async t=>{
 const f=await fixture(t);assert.deepEqual(await (await fetch(f.origin+'/health')).json(),{ok:true,service:'beta-lobby',googleEnabled:false});
 assert.deepEqual(await (await fetch(f.origin+'/api/account')).json(),{googleEnabled:false,user:null});
 const response=await fetch(f.origin);assert.ok((await response.text()).includes('data-account-api="enabled"'));assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('x-powered-by'),null);
});
test('Google-сервер лобби ведёт в рабочую игру и не создаёт её копию или игровую сессию',async t=>{
 const f=await fixture(t);const config=await (await fetch(f.origin+'/lobby-config.js')).text();assert.ok(config.includes(JSON.stringify(GAME_ORIGIN)));
 for(const page of ['student.html','teacher.html','privacy.html']){const response=await fetch(f.origin+'/'+page,{redirect:'manual'});assert.equal(response.status,303);assert.equal(response.headers.get('location'),GAME_ORIGIN+'/'+page);}
 assert.equal((await fetch(f.origin+'/api/session',{method:'POST'})).status,404);assert.equal((await fetch(f.origin+'/socket.io/socket.io.js')).status,404);
});
test('сервер лобби не публикует исходники сервера, переменные окружения и служебные файлы',async t=>{
 const f=await fixture(t,{clientId:'synthetic-client.apps.googleusercontent.com',clientSecret:'synthetic-secret'});
 for(const file of ['/server.js','/account-server.mjs','/portal-server.mjs','/.env','/package.json','/tests/account.test.mjs'])assert.equal((await fetch(f.origin+file)).status,404,file);
 const response=await fetch(f.origin+'/lobby-config.js');assert.ok(!(await response.text()).includes('synthetic-secret'));
 assert.equal((await (await fetch(f.origin+'/api/account')).json()).googleEnabled,true);
});

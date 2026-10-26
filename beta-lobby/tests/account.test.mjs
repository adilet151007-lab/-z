import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {createLobbyRouter} from '../account-server.mjs';

async function fixture(t, {enabled=true, nonceError=false, verifyError=false, secureOrigin=false}={}) {
  let now=100000000, tokenCalls=0, parameters;
  const app=express(), server=createServer(app);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const accountOrigin=secureOrigin?'https://beta.example.test':origin;
  const oauth={
    generateAuthUrl(params){parameters=params;const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');for(const [key,value]of Object.entries(params))url.searchParams.set(key,Array.isArray(value)?value.join(' '):value);return url.href;},
    async getToken(request){tokenCalls++;assert.equal(request.code,'simulated-code');assert.equal(request.redirect_uri,accountOrigin+'/auth/google/callback');assert.equal(createHash('sha256').update(request.codeVerifier).digest('base64url'),parameters.code_challenge);return {tokens:{id_token:'synthetic-id-token'}};},
    async verifyIdToken({audience}){assert.equal(audience,'simulation.apps.googleusercontent.com');if(verifyError)throw new Error('Invalid Google signature');return {getPayload:()=>({sub:'simulation-user-1',email:'simulation@example.test',email_verified:true,name:'Проверка <script>',nonce:nonceError?'wrong':parameters.nonce})};}
  };
  app.use(createLobbyRouter({publicOrigin:accountOrigin,sessionSecret:'synthetic-lobby-secret-of-at-least-32-characters',clientId:enabled?'simulation.apps.googleusercontent.com':undefined,clientSecret:enabled?'synthetic-secret':undefined,oauth,now:()=>now}));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  async function start(){const response=await fetch(origin+'/auth/google',{redirect:'manual'});return {response,params:new URL(response.headers.get('location'),origin).searchParams,cookie:response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')};}
  async function callback(flow,overrides={}){const url=new URL('/auth/google/callback',origin);url.searchParams.set('state',overrides.state??flow.params.get('state'));url.searchParams.set('code','simulated-code');return fetch(url,{redirect:'manual',headers:overrides.noCookie?{}:{Cookie:flow.cookie}});}
  return {origin,start,callback,tokenCalls:()=>tokenCalls,advance:()=>{now+=8*86400000;}};
}

test('Google без OAuth-настроек не имитирует вход; бета публикует собственные адреса',async t=>{
 const f=await fixture(t,{enabled:false});assert.deepEqual(await (await fetch(f.origin+'/api/account')).json(),{googleEnabled:false,user:null});
 const start=await f.start();assert.equal(start.response.headers.get('location'),'/?account=not-configured');assert.equal(f.tokenCalls(),0);
 const config=await (await fetch(f.origin+'/lobby-config.js')).text();assert.ok(config.includes(JSON.stringify(f.origin)));assert.ok(!config.includes('synthetic-secret'));
 const page=await (await fetch(f.origin)).text();assert.ok(page.includes('data-account-api="enabled"'));
});
test('Google: PKCE, cookie браузера, state и nonce связывают подтверждённый профиль; прав администратора нет',async t=>{
 const f=await fixture(t),flow=await f.start();assert.equal(flow.params.get('code_challenge_method'),'S256');assert.equal(flow.params.get('scope'),'openid profile email');assert.match(flow.response.headers.getSetCookie()[0],/HttpOnly/i);
 const response=await f.callback(flow);assert.equal(response.headers.get('location'),'/?account=connected');
 const cookie=response.headers.getSetCookie().find(value=>value.startsWith('cq_account=')).split(';')[0];const {user}=await (await fetch(f.origin+'/api/account',{headers:{Cookie:cookie}})).json();
 assert.equal(user.id,'google:simulation-user-1');assert.equal(user.name,'Проверка <script>');assert.equal(Object.hasOwn(user,'role'),false);assert.equal(Object.hasOwn(user,'isCreator'),false);
 assert.equal((await (await fetch(f.origin+'/api/account',{headers:{Cookie:cookie+'tampered'}})).json()).user,null);
 f.advance();assert.equal((await (await fetch(f.origin+'/api/account',{headers:{Cookie:cookie}})).json()).user,null);
});
test('Google: чужой state, отсутствие cookie и повторное применение callback отклоняются',async t=>{
 const f=await fixture(t),flow=await f.start();
 assert.equal((await f.callback(flow,{state:'forged'})).headers.get('location'),'/?account=expired');
 assert.equal((await f.callback(flow,{noCookie:true})).headers.get('location'),'/?account=expired');assert.equal(f.tokenCalls(),0);
 assert.equal((await f.callback(flow)).headers.get('location'),'/?account=connected');
 assert.equal((await f.callback(flow)).headers.get('location'),'/?account=expired');assert.equal(f.tokenCalls(),1);
});
test('Google: поддельная подпись ID token и чужой nonce не создают сессию',async t=>{
 for(const options of [{nonceError:true},{verifyError:true}]){const f=await fixture(t,options),flow=await f.start(),response=await f.callback(flow);assert.equal(response.headers.get('location'),'/?account=failed');assert.ok(!response.headers.getSetCookie().some(value=>value.startsWith('cq_account=')));}
});
test('выход из Google-профиля требует своего Origin и специального заголовка; cookie безопасна на HTTPS',async t=>{
 const f=await fixture(t);
 for(const headers of [{Origin:'https://attacker.test','X-CQ-Lobby':'1'},{Origin:f.origin}])assert.equal((await fetch(f.origin+'/auth/logout',{method:'POST',headers})).status,403);
 const response=await fetch(f.origin+'/auth/logout',{method:'POST',headers:{Origin:f.origin,'X-CQ-Lobby':'1'}});assert.equal(response.status,200);assert.match(response.headers.getSetCookie()[0],/Max-Age=0/);
 const secure=await fixture(t,{secureOrigin:true}),flow=await secure.start(),signed=await secure.callback(flow),cookie=signed.headers.getSetCookie().find(value=>value.startsWith('__Host-cq_account='));
 for(const flag of ['Secure','HttpOnly','SameSite=Lax','Path=/'])assert.ok(cookie.includes(flag));assert.ok(!cookie.includes('Domain='));
 assert.throws(()=>createLobbyRouter({publicOrigin:'http://insecure.test',sessionSecret:'x'.repeat(32)}));
});

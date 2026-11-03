import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGameServer} from '../server.js';
import {parseInvitation} from '../lobby-links.js';

async function fixture(t){
 const server=await createGameServer({store:{kind:'memory',load:async()=>null,save:async()=>{},close:async()=>{}},teacherPassword:'lobby-test-password',sessionSecret:'lobby-test-secret-more-than-thirty-two-characters',creatorCodes:{},secureCookies:false});
 t.after(()=>server.close());const base='http://127.0.0.1:'+await server.listen(0,'127.0.0.1');return{server,base,get:path=>fetch(base+path,{redirect:'manual'})};
}
test('lobby routes retain CSP nonces, serve exact assets and do not expose private files',async t=>{
 const f=await fixture(t),source=await readFile(new URL('../index.html',import.meta.url),'utf8'),before=JSON.stringify(f.server.game.state);
 for(const path of ['/','/index.html']){const r=await f.get(path),html=await r.text();assert.equal(r.status,200);assert.equal(html.replace(/ nonce="[^"]*"/g,''),source);const nonce=r.headers.get('content-security-policy').match(/'nonce-([^']+)'/)[1];assert.ok([...html.matchAll(/<script\b[^>]*>/g)].every(([tag])=>tag.includes(`nonce="${nonce}"`)))}
 for(const path of ['/lobby.css','/lobby.js','/lobby-links.js','/lobby-scene.js','/lobby-atlas.svg','/lobby-assets/manrope-OFL.txt',...['latin','cyrillic','cyrillic-ext'].map(s=>`/lobby-assets/manrope-${s}-wght-normal.woff2`)]){const r=await f.get(path);assert.equal(r.status,200,path);assert.ok((await r.arrayBuffer()).byteLength)}
 for(const path of ['/server.js','/.env','/game-logic.js','/data/game-state.json','/lobby-assets/missing.woff2']){const r=await f.get(path);await r.arrayBuffer();assert.equal(r.status,404,path)}
 assert.equal(JSON.stringify(f.server.game.state),before);
});
test('participant device cookie and QR validation remain independent of lobby',async t=>{
 const f=await fixture(t),r=await f.get('/student.html');assert.equal(r.status,200);assert.match(await r.text(),/id="name-input"/);const device=r.headers.getSetCookie().find(c=>c.startsWith('cq-device='));assert.match(device,/HttpOnly/i);assert.match(device,/SameSite=Strict/i);const invalid=await f.get('/student.html?qr=forged');await invalid.arrayBuffer();assert.equal(invalid.status,410);
});
test('invitation preserves signed queries/fragments and rejects unsafe destinations',()=>{
 const origin='http://localhost:3000';for(const base of [origin,'https://culture-quest-z.onrender.com']){const href=base+'/student.html?qr=a%2Bb%3D#join=abc.def';assert.equal(parseInvitation(href,origin).href,href);assert.equal(parseInvitation(base+'/#join=abc.def',origin).href,base+'/student.html#join=abc.def')}
 for(const input of ['',null,'javascript:alert(1)','data:text/html,test','/student.html','//localhost:3000/student.html','http://localhost:3001/student.html','https://evil.example/student.html','http://localhost:3000.evil.example/student.html','http://user@localhost:3000/student.html',origin+'/teacher.html',origin+'/student.html/other',origin+'/student.html\n'])assert.throws(()=>parseInvitation(input,origin));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createPortalServer} from '../portal-server.mjs';

test('decorative atlas resources are served without changing account and room entry points',async t=>{
 const server=createPortalServer({publicOrigin:'http://127.0.0.1:3000',sessionSecret:'atlas-test-session-secret-over-thirty-two-characters'});t.after(()=>server.close());const base='http://127.0.0.1:'+await server.listen(0,'127.0.0.1');
 const response=await fetch(base),html=await response.text();assert.equal(response.status,200);for(const id of ['account-button','account-dialog','platform-section','invitation-input','student-link','game-search','theme-toggle','lobby-scene'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(html.indexOf('class="hero"')<html.indexOf('id="platform-section"'),'The homepage should start with its hero while keeping the platform available');
 for(const asset of ['lobby-refresh.css','lobby-atlas.js','lobby-atlas-scene.js','lobby-three.js','lobby-atlas.svg','lobby-sources.txt','lobby-manrope-OFL.txt',...['latin','cyrillic','cyrillic-ext'].map(s=>'lobby-manrope-'+s+'-wght-normal.woff2')]){const r=await fetch(base+'/'+asset);assert.equal(r.status,200,asset);assert.ok((await r.arrayBuffer()).byteLength)}
 assert.deepEqual(await(await fetch(base+'/api/account')).json(),{googleEnabled:false,user:null});
 for(const path of ['/portal-server.mjs','/.env','/package.json','/node_modules/three/build/three.module.js'])assert.equal((await fetch(base+path)).status,404,path);
});

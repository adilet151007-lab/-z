import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('клиент: fallback хранилища, согласие, переподключение и независимость обработчиков',async t=>{
 const oldLocal=globalThis.localStorage,oldSession=globalThis.sessionStorage,oldIo=globalThis.__cqIo;
 t.after(()=>{globalThis.localStorage=oldLocal;globalThis.sessionStorage=oldSession;globalThis.__cqIo=oldIo});
 const saved=new Map();globalThis.localStorage={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')},removeItem(){throw new Error('blocked')}};
 globalThis.sessionStorage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
 class Socket{
  events=new Map();response={ok:true,playerToken:'opaque-session-token',player:{pid:'player-id'}};
  on(name,fn){this.events.set(name,fn);return this}off(name){this.events.delete(name)}
  connected=false;
  connect(){this.connected=true;this.events.get('connect')?.();return this}disconnect(){this.connected=false;this.events.get('disconnect')?.();return this}
  timeout(){return this}emit(name,data,callback){if(name==='clock:sync'){data(null,{serverTime:Date.now()});return;}this.last={name,data};if(data.requestId)this.events.get('answer:received')?.({requestId:data.requestId,roundId:data.roundId});callback(null,this.response)}
 }
 let options,socket;globalThis.__cqIo=value=>{options=value;socket=new Socket();return socket};
 let source=await readFile(new URL('../shared-engine.js',import.meta.url),'utf8');source=source.replace(/^import .*\n/gm,'').replace(/^export \{ .*from .*\n/gm,'');
 const prefix="const io=globalThis.__cqIo;const PRIVACY_VERSION='2026-10-23';const DEFAULT_SUBJECT='Мәдениеттану';\n";
 const {GameEngine}=await import('data:text/javascript;base64,'+Buffer.from(prefix+source).toString('base64'));
 const engine=new GameEngine('student');assert.equal(engine.connected,true);
 await engine.joinTeam('saryarka','Алия',true);assert.equal(socket.last.data.privacyConsent.accepted,true);assert.equal(socket.last.data.privacyConsent.version,'2026-10-23');assert.equal(saved.get('cq_player_token_v2'),'opaque-session-token');
 options.auth(auth=>assert.equal(auth.playerToken,'opaque-session-token'));
 socket.events.get('disconnect')();assert.equal(engine.connected,false);await assert.rejects(engine.castVote(0),/Нет связи/);
 socket.events.get('connect')();assert.equal(engine.connected,true);
 let updates=0;engine.onChange(()=>updates++);const good=()=>updates++,bad=()=>{throw new Error('isolated-ui-failure')};engine.listeners.add(bad);engine.listeners.add(good);
 const oldError=console.error;console.error=()=>{};try{engine.emit()}finally{console.error=oldError}assert.equal(updates,3);engine.listeners.delete(bad);
 socket.events.get('state')({viewer:{role:'student',player:{pid:'player-id',regionId:'saryarka',name:'Алия'}},settings:{mode:'team'},serverTime:Date.now(),branding:{subject:'История'},questions:[{id:'a',subject:'История'},{id:'b'}]});
 assert.deepEqual(engine.allQuestions().map(q=>q.id),['a']);
 assert.deepEqual(options.transports,['websocket','polling']);assert.ok(Number.isFinite(engine.clockRtt));
 engine.state.round={id:'client-round'};await engine.castVote(0);assert.equal(engine.inputStatus.status,'saved');assert.equal(socket.last.data.requestId,engine.inputStatus.requestId);
 socket.events.get('state')({viewer:{role:'guest',player:null},settings:{mode:'team'},serverTime:Date.now()});assert.equal(saved.has('cq_player_token_v2'),false);
});

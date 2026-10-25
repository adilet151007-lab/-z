import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GameLogic,hashToken} from '../game-logic.js';
import {ChatEngine,chatIdentity} from '../chat-engine.js';

const source=(await readFile(new URL('../chat-ui.js',import.meta.url),'utf8')).replace(/^import .*\n/gm,'');
const {ChatReadState}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function make(){const game=new GameLogic();game.enableUniversal();game.enableFlexibleTeams();const chat=new ChatEngine(),storage=new Map(),get=key=>storage.get(key)||null,put=(key,value)=>storage.set(key,value);return {game,chat,storage,reads:()=>new ChatReadState(get,put),metadata:joined=>chat.metadata(game,chatIdentity(game,{playerHash:hashToken(joined.playerToken)}))}}

test('чат: после повторного входа создателя старое прочтение сохраняется, новое сообщение остаётся непрочитанным',()=>{
 const f=make(),first=f.game.joinCreator('adilet','jetisu'),meta=f.metadata(first),reads=f.reads();
 reads.bind(meta);assert.equal(reads.mark('global',7),true);assert.equal(reads.mark('support:old-student',6),true);
 f.game.leaveTeam('jetisu',first.player.pid);const second=f.game.joinCreator('adilet','saryarka','Арман'),next=f.metadata(second);
 assert.notEqual(next.identity.id,meta.identity.id);assert.equal(next.readKey,meta.readKey);
 const reopened=f.reads();reopened.bind(next);assert.equal(reopened.unread({id:'global',lastSequence:7}),false);assert.equal(reopened.unread({id:'support:old-student',lastSequence:6}),false);assert.equal(reopened.unread({id:'global',lastSequence:8}),true);
 f.game.renamePlayer(second.player.pid,'Имя новое');f.game.movePlayer(second.player.pid,'mangystau');assert.equal(f.metadata(second).readKey,meta.readKey);
 const other=f.game.joinCreator('ernur','jetisu'),otherReads=f.reads();otherReads.bind(f.metadata(other));assert.equal(otherReads.unread({id:'global',lastSequence:7}),true);
});

test('чат: профиль обычного игрока сохраняет отметки после выхода, одинаковое имя не объединяет чужое прочтение',()=>{
 const f=make(),first=f.game.joinTeam('jetisu','Алия');f.game.ensureCollection(first.player.pid);const token=f.game.collectionCookie(first.player.pid),key=f.metadata(first).readKey;
 const reads=f.reads();reads.bind(f.metadata(first));reads.mark('team:jetisu',12);
 f.game.leaveTeam('jetisu',first.player.pid);const next=f.game.joinTeam('jetisu','Алия');f.game.ensureCollection(next.player.pid,hashToken(token));
 assert.equal(f.metadata(next).readKey,key);const restored=f.reads();restored.bind(f.metadata(next));assert.equal(restored.unread({id:'team:jetisu',lastSequence:12}),false);
 const other=f.game.joinTeam('saryarka','Алия');f.game.ensureCollection(other.player.pid);assert.notEqual(f.metadata(other).readKey,key);restored.bind(f.metadata(other));assert.equal(restored.unread({id:'team:jetisu',lastSequence:12}),true);
 const teacher=f.chat.metadata(f.game,chatIdentity(f.game,{role:'teacher'}));assert.equal(teacher.readKey,'teacher');assert.equal(f.chat.metadata(f.game,null).readKey,undefined);
});

test('чат: перенос старых отметок и несколько вкладок не сбрасывают прочитанное и не пишут хранилище при каждом обновлении',()=>{
 const f=make(),meta={enabled:true,identity:{id:'old-session'},readKey:'creator:adilet'};f.storage.set('cq_chat_read_old-session',JSON.stringify({global:5,'team:jetisu':3,invalid:999,'support:bad':-1}));
 let writes=0;const one=new ChatReadState(key=>f.storage.get(key), (key,value)=>{writes++;f.storage.set(key,value)});one.bind(meta);assert.equal(writes,1);one.bind(meta);assert.equal(writes,1);assert.deepEqual(one.marks,{global:5,'team:jetisu':3});
 const two=f.reads();two.bind(meta);two.mark('global',10);one.mark('team:jetisu',6);assert.deepEqual(JSON.parse(f.storage.get('cq_chat_read_creator:adilet')),{global:10,'team:jetisu':6});
 one.reset();one.bind({...meta,identity:{id:'new-session'}});assert.equal(one.unread({id:'global',lastSequence:10}),false);assert.equal(one.mark('global',9),false);assert.equal(one.mark('global',NaN),false);
 f.storage.set('cq_chat_read_teacher','broken json');one.bind({enabled:true,identity:{id:'teacher'},readKey:'teacher'});assert.deepEqual(one.marks,{});
});

test('чат: при недоступном localStorage отметки переживают перезагрузку в sessionStorage',t=>{
 const previousLocal=globalThis.localStorage,previousSession=globalThis.sessionStorage,storage=new Map();
 t.after(()=>{globalThis.localStorage=previousLocal;globalThis.sessionStorage=previousSession});
 globalThis.localStorage={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')}};
 globalThis.sessionStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
 const meta={enabled:true,identity:{id:'one'},readKey:'creator:adilet'},first=new ChatReadState();first.bind(meta);first.mark('global',9);
 const restored=new ChatReadState();restored.bind({...meta,identity:{id:'two'}});assert.equal(restored.unread({id:'global',lastSequence:9}),false);assert.equal(restored.unread({id:'global',lastSequence:10}),true);
});

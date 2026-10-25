import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {io} from 'socket.io-client';
import {createGameServer} from '../server.js';
import {GameLogic,hashToken} from '../game-logic.js';

const code='CQL-test-only-universal-access-000000000';
const config={teacherPassword:'local-test-teacher-password',sessionSecret:'local-test-signing-secret-more-than-thirty-two',creatorCodes:{adilet:'A'.repeat(26),ernur:'E'.repeat(26)},localAdminCodeHash:hashToken(code)};
class Store{
 kind='memory';snapshot=null;
 async load(){return structuredClone(this.snapshot)}
 async save(state){this.snapshot=structuredClone(state)}
 async close(){}
}
const command=(socket,name,data={})=>new Promise((resolve,reject)=>socket.timeout(4000).emit(name,data,(error,result)=>error?reject(error):resolve(result)));
async function waitFor(check){const end=Date.now()+4000;while(!check()){if(Date.now()>end)throw new Error('State timeout');await new Promise(resolve=>setTimeout(resolve,10))}}
async function fixture(t){
 const store=new Store(),server=await createGameServer({...config,store,requireConsent:false,cookieSessions:false}),port=await server.listen(0,'127.0.0.1'),clients=[];
 t.after(async()=>{clients.forEach(socket=>socket.disconnect());await server.close()});
 async function connect(auth={}){const socket=io(`http://127.0.0.1:${port}`,{autoConnect:false,reconnection:false,transports:['websocket'],auth});clients.push(socket);socket.on('state',state=>socket.latest=state);const ready=once(socket,'state');socket.connect();await ready;return socket}
 async function join(name,regionId='jetisu'){const socket=await connect(),result=await command(socket,'joinTeam',{name,regionId});assert.equal(result.ok,true,result.error);await waitFor(()=>socket.latest.viewer.player?.pid===result.player.pid);return {socket,...result}}
 async function teacher(){const socket=await connect();assert.equal((await command(socket,'teacherLogin',{password:config.teacherPassword})).ok,true);await waitFor(()=>socket.latest.viewer.role==='teacher');return socket}
 return {server,store,connect,join,teacher};
}

test('Универсал: общий код допускает параллельные входы с разными именами и восстановление сессии',async t=>{
 const f=await fixture(t),a=await f.connect(),b=await f.connect();
 const results=await Promise.all([command(a,'joinTeam',{regionId:'jetisu',name:code+' Алия'}),command(b,'joinTeam',{regionId:'jetisu',name:code+' Арман'})]);
 assert.ok(results.every(result=>result.ok));assert.notEqual(results[0].player.pid,results[1].player.pid);
 await waitFor(()=>a.latest.viewer.role==='delegate'&&b.latest.viewer.role==='delegate');
 assert.equal(a.latest.viewer.adminGrant.tier,'local');assert.equal(a.latest.viewer.adminGrant.label,'Универсал');assert.equal(a.latest.viewer.isCreator,false);
 assert.equal(a.latest.viewer.player.name,'Алия');assert.equal(b.latest.viewer.player.name,'Арман');
 const restored=new GameLogic(f.store.snapshot),pid=results[0].player.pid;assert.equal(restored.adminGrantFor(pid).tier,'local');assert.equal(restored.adminCan(pid,'adjustPoints'),true);
 const resumed=await f.connect({playerToken:results[0].playerToken});assert.equal(resumed.latest.viewer.player.pid,pid);assert.equal(resumed.latest.viewer.adminGrant.tier,'local');
 const guest=await f.connect();for(const view of [a.latest,b.latest,guest.latest,f.server.game.editorSnapshot()]){const text=JSON.stringify(view);assert.equal(text.includes(code),false);assert.equal(text.includes(hashToken(code)),false);}
});

test('Универсал: имя и свободное место обязательны, неверный код не даёт прав',async t=>{
 const f=await fixture(t),socket=await f.connect();
 assert.equal((await command(socket,'joinTeam',{name:code,regionId:'jetisu'})).code,'NAME_REQUIRED');
 assert.equal((await command(socket,'joinTeam',{name:'CQL-invalid Алия',regionId:'jetisu'})).code,'BAD_LOCAL_CODE');
 assert.equal(f.server.game.region('jetisu').members.length,0);
 for(let i=0;i<4;i++)await f.join('Участник '+i);
 assert.equal((await command(socket,'joinTeam',{name:code+' Алия',regionId:'jetisu'})).code,'TEAM_FULL');
 const ordinary=await f.join('Универсал','saryarka');assert.equal(ordinary.socket.latest.viewer.role,'student');assert.equal((await command(ordinary.socket,'adjustPoints',{regionId:'jetisu',delta:25})).code,'FORBIDDEN');
 const teacher=await f.teacher();await command(teacher,'setGameMode',{mode:'solo'});
 const joined=await command(socket,'joinTeam',{name:code+' Алия'});assert.equal(joined.ok,true);assert.equal(f.server.game.adminGrantFor(joined.player.pid).tier,'local');
});

test('Универсал: ограниченный пульт управляет обычными игроками, но не правами, базой, сбросами и другими администраторами',async t=>{
 const f=await fixture(t),owner=await f.join(config.creatorCodes.adilet),local=await f.join(code+' Помощник','saryarka'),peer=await f.join(code+' Помощник два','mangystau'),delegate=await f.join('Делегат','turkistan'),student=await f.join('Алия','turkistan');
 await command(owner.socket,'grantAdmin',{pid:delegate.player.pid,permissions:{players:true}});
 assert.equal((await command(local.socket,'updatePlayer',{pid:student.player.pid,name:'Алия новая',toTeamId:'saryarka'})).ok,true);
 assert.equal((await command(local.socket,'movePlayer',{pid:local.player.pid,toTeamId:'jetisu'})).ok,true);
 assert.equal((await command(local.socket,'renameSelf',{name:'Помощник новый'})).ok,true);
 assert.equal((await command(local.socket,'adjustPoints',{regionId:'saryarka',delta:25})).ok,true);
 assert.equal((await command(local.socket,'adjustEconomy',{regionId:'saryarka',delta:-20})).ok,true);
 for(const target of [owner,delegate,peer])for(const [action,data] of [['freeSlot',{regionId:target.player.regionId,pid:target.player.pid}],['updatePlayer',{pid:target.player.pid,name:'Подмена',toTeamId:'saryarka'}],['movePlayer',{pid:target.player.pid,toTeamId:'saryarka'}],['renamePlayer',{pid:target.player.pid,name:'Подмена'}],['adjustCapital',{pid:target.player.pid,delta:25}]])assert.equal((await command(local.socket,action,data)).code,'PROTECTED_SESSION',action);
 for(const action of ['resetGame','removeAllPlayers','removeTeam','setGameMode','setSessionMode','grantAdmin','revokeAdmin','createAdminInvite','rotateAccessKey','presentationEffect','refreshClients','getSnapshot','applyRawState','createBackup','restoreBackup','importQuestions','editQuestion','deleteQuestion','clearQuestions','grantAchievement','previewAchievement','revokeAchievement','setPerksEnabled'])assert.equal((await command(local.socket,action)).code,'FORBIDDEN',action);
 const question=f.server.game.state.questions[0];assert.equal((await command(local.socket,'startRound',{questionId:question.id,duration:20})).ok,true);
 await waitFor(()=>local.socket.latest.round);assert.equal(local.socket.latest.round.question.correct,undefined);assert.equal(local.socket.latest.round.preview,undefined);assert.ok(local.socket.latest.questions.every(q=>q.correct===undefined));
 assert.equal((await command(local.socket,'pauseRound')).ok,true);assert.equal((await command(local.socket,'resetTimer')).ok,true);
 assert.equal((await command(local.socket,'freeSlot',{regionId:'saryarka',pid:student.player.pid})).ok,true);
 const teacher=await f.teacher();assert.equal((await command(teacher,'freeSlot',{regionId:'jetisu',pid:local.player.pid})).exitRequested,false);
 await waitFor(()=>local.socket.latest.viewer.role==='guest');assert.equal((await command(local.socket,'adjustPoints',{regionId:'saryarka',delta:25})).code,'FORBIDDEN');
});

test('помеха: PRO-исключение передаётся проектору, делегат подчиняется запрету, отсутствие экрана не считается успехом',async t=>{
 const f=await fixture(t),owner=await f.join(config.creatorCodes.adilet),delegate=await f.join('Делегат','saryarka');
 await command(owner.socket,'grantAdmin',{pid:delegate.player.pid,permissions:{effects:true},effectDuration:500});
 assert.equal((await command(owner.socket,'presentationEffect')).code,'TARGET_OFFLINE');
 const teacher=await f.teacher(),events=[];teacher.on('ui:presentation-effect',event=>events.push(event));
 await command(teacher,'setPresentationEffects',{enabled:false});
 const result=await command(owner.socket,'presentationEffect',{duration:500});assert.equal(result.ok,true);assert.equal(result.overrideDisabled,true);assert.equal(result.recipientCount,1);
 await waitFor(()=>events.length===1);assert.equal(events[0].overrideDisabled,true);assert.equal((await command(delegate.socket,'presentationEffect')).code,'EFFECTS_DISABLED');
 await command(teacher,'setPresentationEffects',{enabled:true});const permitted=await command(delegate.socket,'presentationEffect');assert.equal(permitted.ok,true);assert.equal(permitted.overrideDisabled,false);
});

test('помеха на клиенте: PRO-сигнал виден при старом запрете и не исчезает при обновлении состояния',async t=>{
 const priorDocument=globalThis.document;const handlers=new Map(),children=[],classes=new Set(),nodes=[{inert:false}],focused={isConnected:true,focus(){}};
 globalThis.document={visibilityState:'visible',activeElement:focused,body:{classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)},append:node=>children.push(node)},querySelectorAll:()=>nodes,createElement:()=>({setAttribute(){},focus(){},remove(){children.splice(children.indexOf(this),1)}})};
 let cleanup=()=>{};t.after(()=>{cleanup();globalThis.document=priorDocument});
 let changed;const engine={state:{viewer:{role:'teacher'},sessionControl:{presentationEffectsEnabled:false}},socket:{on:(name,handler)=>handlers.set(name,handler),off:name=>handlers.delete(name)},onChange:handler=>{changed=handler;return ()=>{}}};
 let source=await readFile(new URL('../shared-engine.js',import.meta.url),'utf8');source=source.slice(source.indexOf('export function setupPresentationEffects'),source.indexOf('export function setupAmbientAudio'));
 const {setupPresentationEffects}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));cleanup=setupPresentationEffects(engine);
 const receive=handlers.get('ui:presentation-effect');receive({duration:100,overrideDisabled:false});assert.equal(children.length,0);
 receive({duration:100,overrideDisabled:true});assert.equal(children.length,1);assert.equal(nodes[0].inert,true);changed(engine.state);assert.equal(children.length,1);
 await new Promise(resolve=>setTimeout(resolve,120));assert.equal(children.length,0);assert.equal(nodes[0].inert,false);assert.equal(classes.size,0);
 receive({duration:100,overrideDisabled:true});engine.state={viewer:{role:'guest'}};changed(engine.state);assert.equal(children.length,0);
});

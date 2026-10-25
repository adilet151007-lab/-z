import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {io} from 'socket.io-client';
import {createGameServer} from '../server.js';
import {GameLogic} from '../game-logic.js';
import {PRIVACY_VERSION} from '../game-config.js';

const config={teacherPassword:'release-test-password',sessionSecret:'release-test-session-secret-more-than-thirty-two',creatorCodes:{adilet:'A'.repeat(26),ernur:'E'.repeat(26)}};
class Store{kind='memory';snapshot=null;fail=false;async load(){return structuredClone(this.snapshot)}async save(s){if(this.fail)throw new Error('test-storage-failure');this.snapshot=structuredClone(s)}async close(){}}
const cmd=(socket,name,data={})=>new Promise((resolve,reject)=>socket.timeout(4000).emit(name,data,(error,result)=>error?reject(error):resolve(result)));
async function waitFor(check){const end=Date.now()+5000;while(!check()){if(Date.now()>end)throw new Error('State timeout');await new Promise(r=>setTimeout(r,10))}}
async function fixture(t,extra={}){
 const store=new Store(),server=await createGameServer({...config,cookieSessions:false,flexibleTeams:false,requireConsent:false,store,...extra}),port=await server.listen(0,'127.0.0.1'),clients=[];
 t.after(async()=>{clients.forEach(s=>s.disconnect());await server.close()});
 async function connect(auth={}){const socket=io(`http://127.0.0.1:${port}`,{autoConnect:false,reconnection:false,transports:['websocket'],auth});clients.push(socket);socket.on('state',s=>socket.latest=s);const ready=once(socket,'state');socket.connect();await ready;return socket}
 async function teacher(){const s=await connect();assert.equal((await cmd(s,'teacherLogin',{password:config.teacherPassword})).ok,true);return s}
 async function join(name='Алия',team='saryarka'){const socket=await connect(),result=await cmd(socket,'joinTeam',{name,regionId:team});assert.equal(result.ok,true,result.error);return {socket,...result}}
 return {store,server,connect,teacher,join,url:`http://127.0.0.1:${port}`};
}

test('релиз: неверные попытки не создают 15-минутную блокировку правильного входа',async t=>{
 const f=await fixture(t),s=await f.connect();
 for(let i=0;i<25;i++)assert.equal((await cmd(s,'teacherLogin',{password:'wrong'})).ok,false);
 assert.equal((await cmd(s,'teacherLogin',{password:config.teacherPassword})).ok,true);
 assert.equal((await f.join(config.creatorCodes.adilet)).isCreator,true);
});

test('релиз: согласие проверяется сервером, сохраняется, имена не раскрываются гостю',async t=>{
 const f=await fixture(t,{requireConsent:true}),s=await f.connect();
 const data={name:'Алия',regionId:'saryarka'};
 assert.equal((await cmd(s,'joinTeam',data)).code,'CONSENT_REQUIRED');
 assert.equal((await cmd(s,'joinTeam',{...data,privacyConsent:{accepted:true,version:'old'}})).code,'CONSENT_REQUIRED');
 const joined=await cmd(s,'joinTeam',{...data,privacyConsent:{accepted:true,version:PRIVACY_VERSION}});assert.equal(joined.ok,true);
 const member=f.store.snapshot.regions[0].members[0];assert.equal(member.privacyConsent.version,PRIVACY_VERSION);assert.ok(member.privacyConsent.acceptedAt);
 const guest=await f.connect();assert.equal(guest.latest.regions[0].occupied,1);assert.equal(guest.latest.regions[0].members.length,0);assert.equal(JSON.stringify(guest.latest).includes('Алия'),false);
 const resumed=await f.connect({playerToken:joined.playerToken});assert.equal(resumed.latest.viewer.player.pid,joined.player.pid);
});

test('релиз: делегирование не раскрывает ответы и не даёт менять персональных администраторов',async t=>{
 const f=await fixture(t),owner=await f.join(config.creatorCodes.adilet),ernur=await f.join(config.creatorCodes.ernur),delegate=await f.join(),teacher=await f.teacher();
 assert.equal((await cmd(owner.socket,'grantAdmin',{pid:delegate.player.pid,permissions:{players:true},effectDuration:1200})).ok,true);
 assert.equal((await cmd(delegate.socket,'renameSelf',{name:'Новое имя'})).ok,true);
 assert.equal((await cmd(delegate.socket,'renamePlayer',{pid:ernur.player.pid,name:'Подмена'})).code,'PROTECTED_SESSION');
 assert.equal((await cmd(delegate.socket,'adjustPoints',{regionId:'saryarka',delta:25})).code,'FORBIDDEN');
 await cmd(owner.socket,'grantAdmin',{pid:delegate.player.pid,permissions:{game:true},effectDuration:1200});
 await cmd(teacher,'startRound',{questionId:'q1',duration:30});await waitFor(()=>delegate.socket.latest.round);
 assert.equal(delegate.socket.latest.round.question.correct,undefined);assert.equal(delegate.socket.latest.round.preview,undefined);assert.ok(delegate.socket.latest.questions.length);assert.equal(delegate.socket.latest.questions[0].correct,undefined);
 assert.equal((await cmd(delegate.socket,'getSnapshot')).code,'FORBIDDEN');assert.equal((await cmd(delegate.socket,'updateBranding',{branding:{title:'Подмена'}})).code,'FORBIDDEN');
 await cmd(owner.socket,'revokeAdmin',{pid:delegate.player.pid});await waitFor(()=>delegate.socket.latest.viewer.role==='student');assert.equal((await cmd(delegate.socket,'pauseRound')).code,'FORBIDDEN');
});

test('релиз: адресный эффект получает только выбранный обычный игрок',async t=>{
 const f=await fixture(t),owner=await f.join(config.creatorCodes.adilet),a=await f.join('Алия'),b=await f.join('Арман'),teacher=await f.teacher(),guest=await f.connect(),received=[];
 for(const [name,s]of [['a',a.socket],['b',b.socket],['teacher',teacher],['guest',guest],['owner',owner.socket]])s.on('ui:presentation-effect',()=>received.push(name));
 assert.equal((await cmd(owner.socket,'presentationEffect',{targetPid:a.player.pid,duration:500})).ok,true);await waitFor(()=>received.length);assert.deepEqual(received,['a']);
 assert.equal((await cmd(owner.socket,'presentationEffect',{targetPid:owner.player.pid})).code,'INVALID_TARGET');
 assert.equal((await cmd(owner.socket,'presentationEffect',{targetPid:{pid:a.player.pid}})).code,'INVALID_TARGET');
 assert.equal((await cmd(owner.socket,'presentationEffect',{duration:Infinity})).ok,false);
 b.socket.disconnect();await new Promise(r=>setTimeout(r,30));assert.equal((await cmd(owner.socket,'presentationEffect',{targetPid:b.player.pid})).code,'TARGET_OFFLINE');
});

test('релиз: ограничения помех индивидуальны для делегатов, Адилет не получает cooldown',async t=>{
 const f=await fixture(t),owner=await f.join(config.creatorCodes.adilet),a=await f.join('Делегат А'),b=await f.join('Делегат Б');
 for(const p of [a,b])await cmd(owner.socket,'grantAdmin',{pid:p.player.pid,permissions:{effects:true},effectDuration:700,unlimitedEffects:false});
 assert.equal((await cmd(a.socket,'presentationEffect')).duration,700);assert.equal((await cmd(a.socket,'presentationEffect')).code,'RATE_LIMIT');assert.equal((await cmd(b.socket,'presentationEffect')).ok,true);
 assert.equal((await cmd(owner.socket,'presentationEffect')).ok,true);assert.equal((await cmd(owner.socket,'presentationEffect')).ok,true);
});

test('релиз: CSV и рейтинг используют один порядок, Solo JSON-патч сохраняет принятый ответ',()=>{
 const g=new GameLogic();g.enableUniversal();g.joinTeam('saryarka','Первый');g.joinTeam('jetisu','Второй');g.adjustPoints('saryarka',100);g.adjustEconomy('saryarka',-80);g.adjustPoints('jetisu',50);
 assert.deepEqual(g.exportSummary().map(t=>t.region),g.teamRanking().filter(t=>t.rank!==null).map(t=>t.name));assert.equal(g.teamRanking()[0].teamId,'jetisu');
 g.setGameMode('solo');const joined=g.joinTeam(null,'Алия'),pid=joined.player.pid;g.startRound('q1',30);g.castVote(joined.player.regionId,pid,0,g.state.round.id);g.teamSubmit(joined.player.regionId,pid,g.state.round.id);
 const patch=g.editorSnapshot();patch.regions[0].economy=80;g.applyRawState(patch);assert.equal(g.state.round.submitted[pid],0);
});

test('релиз: зашифрованная копия восстанавливает игру на паузе и сохраняет текущего администратора',async t=>{
 const f=await fixture(t),teacher=await f.teacher(),owner=await f.join(config.creatorCodes.adilet),player=await f.join('Алия');
 await cmd(teacher,'adjustPoints',{regionId:'saryarka',delta:125});await cmd(teacher,'startRound',{questionId:'q1',duration:30});
 const saved=await cmd(teacher,'createBackup');assert.equal(saved.ok,true);assert.equal(saved.archive.format,'culture-quest-encrypted-backup');assert.equal(JSON.stringify(saved.archive).includes('Алия'),false);
 await cmd(teacher,'resetGame');assert.equal(f.server.game.region('saryarka').points,0);
 const restored=await cmd(teacher,'restoreBackup',{archive:saved.archive,revision:f.server.game.state.revision});assert.equal(restored.ok,true,restored.error);assert.equal(f.server.game.region('saryarka').points,125);assert.equal(f.server.game.state.round.paused,true);assert.equal(f.server.game.state.round.deadline,null);
 assert.ok(f.server.game.state.regions.some(t=>t.members.some(m=>m.pid===owner.player.pid&&m.creatorId==='adilet')));
 const resumed=await f.connect({playerToken:player.playerToken});assert.equal(resumed.latest.viewer.player.pid,player.player.pid);
 assert.ok(f.store.snapshot.restorePoints.length<=3);for(const p of f.store.snapshot.restorePoints)assert.equal(p.snapshot.restorePoints,undefined);
});

test('релиз: подменённая копия, чужие права и ошибка БД не заменяют игру',async t=>{
 const f=await fixture(t),teacher=await f.teacher(),player=await f.join();await cmd(teacher,'adjustPoints',{regionId:'saryarka',delta:50});
 const saved=await cmd(teacher,'createBackup'),revision=f.server.game.state.revision,archive=structuredClone(saved.archive);archive.tag=Buffer.alloc(16).toString('base64');
 assert.equal((await cmd(teacher,'restoreBackup',{archive,revision})).code,'BAD_BACKUP');assert.equal(f.server.game.state.revision,revision);assert.equal(f.server.game.region('saryarka').points,50);
 for(const action of ['createBackup','restoreBackup','updateBranding'])assert.equal((await cmd(player.socket,action)).code,'FORBIDDEN');
 f.store.fail=true;assert.equal((await cmd(teacher,'createBackup')).ok,false);assert.equal(f.server.game.state.revision,revision);
});

test('релиз: оформление безопасно, банк разделён по предметам и правки сохраняют предмет',async t=>{
 const f=await fixture(t),teacher=await f.teacher();
 assert.equal((await cmd(teacher,'updateBranding',{branding:{logo:'data:image/svg+xml;base64,PHN2Zz4='}})).ok,false);
 assert.equal((await cmd(teacher,'updateBranding',{branding:{accent:'red; display:none'}})).ok,false);
 assert.equal((await cmd(teacher,'updateBranding',{branding:{university:'Тестовый университет',subjects:['Мәдениеттану','История'],subject:'История'}})).ok,true);
 assert.equal((await cmd(teacher,'startRound',{questionId:'q1',duration:30})).ok,false);
 const added=await cmd(teacher,'importQuestions',{questions:[{text:'Тестовый вопрос по истории?',options:['А','Б','В','Г'],correct:0,points:25}]});assert.equal(added.added,1);
 const q=f.server.game.state.questions.find(q=>q.subject==='История');assert.ok(q);const changes={...q};delete changes.subject;
 await cmd(teacher,'editQuestion',{questionId:q.id,question:changes,version:q.version});assert.equal(f.server.game.state.questions.find(item=>item.id===q.id).subject,'История');
 assert.equal((await cmd(teacher,'startRound',{questionId:q.id,duration:30})).ok,true);assert.equal((await cmd(teacher,'updateBranding',{branding:{subject:'Мәдениеттану'}})).ok,false);
});

test('релиз: публичные юридические страницы и тексты лицензий доступны, секретные файлы закрыты',async t=>{
 const f=await fixture(t);
 for(const url of ['/privacy.html','/licenses.html','/CLIENT_GUIDE.md','/LICENSE_AUDIT.md','/license-texts/three','/license-texts/socket.io','/api/public-settings'])assert.equal((await fetch(f.url+url)).status,200,url);
 for(const url of ['/server.js','/.env','/storage.js','/license-texts/unknown'])assert.equal((await fetch(f.url+url)).status,404,url);
 const css=await (await fetch(f.url+'/styles.css')).text();assert.equal(css.includes('fonts.googleapis.com'),false);
});

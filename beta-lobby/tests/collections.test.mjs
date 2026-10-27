import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PlatformStore,memoryBackend} from '../platform-store.mjs';
import {Platform} from '../platform-domain.mjs';
import {GameLogic} from '../../game-logic.js';
import {profileFor,LEGENDARY_IDS,publicCollection} from '../../achievement-system.js';
import {createPortalServer} from '../portal-server.mjs';
const key=n=>createHash('sha256').update('Question '+n).digest('hex');
async function fixture(){const store=await new PlatformStore(memoryBackend()).init(),p=new Platform(store,{ownerCode:'test-collections-owner-long-secret-1234'});for(const id of ['owner','student','other'])await p.authenticate({id:'google:'+id,name:id,email:id+'@example.test'});await p.redeem('google:owner','test-collections-owner-long-secret-1234');return {store,p};}
async function room(p,name='Тестовая комната'){const r=await p.createRoom('google:owner',{name});const g=new GameLogic();g.enableUniversal();g.enableFlexibleTeams();g.state.settings.mode='solo';const m=g.joinTeam(g.state.regions[0].id,'Студент').player;g.ensureCollection(m.pid);await p.bind(r.id,m.pid,'google:student');return {r,g,m,profile:()=>profileFor(g,m.pid)};}
test('разные комнаты объединяют уникальные вопросы и выдают тренировку без завершения матча',async()=>{
 const {p}=await fixture(),a=await room(p),b=await room(p,'Вторая комната');
 a.profile().studied=Array.from({length:60},(_,i)=>key(i));let seen=(await p.syncCollections(a.r.id,a.g)).observed;
 assert.equal((await p.profile('google:student')).collection.training.studied,60);
 b.profile().studied=Array.from({length:60},(_,i)=>key(i+40));await p.syncCollections(b.r.id,b.g);
 let view=await p.profile('google:student');assert.equal(view.collection.training.studied,100);assert.ok(view.achievements.includes('daily-training'));assert.equal(view.totals.matches,0);
 assert.equal(b.g.state.achievements.filter(a=>a.achievementId==='daily-training').length,1);
 await p.syncCollections(a.r.id,a.g,seen);assert.ok(publicCollection(a.g,a.m.pid).awards.some(a=>a.achievementId==='daily-training'));assert.equal(a.g.state.achievements.length,0,'загрузка коллекции не запускает повторное награждение');
});
test('повтор одного вопроса и ручная правка статистики не подделывают накопительный прогресс',async()=>{
 const {p}=await fixture(),a=await room(p),b=await room(p,'Ещё одна комната');a.profile().studied=[key(1)];await p.syncCollections(a.r.id,a.g);b.profile().studied=[key(1)];await p.syncCollections(b.r.id,b.g);
 const before=await p.profile('google:student');await p.setStats('google:owner','google:student',{matches:200,wins:100,correct:1000,answered:1000},before.statsRevision,'Проверка счётчиков');
 const after=await p.profile('google:student');assert.equal(after.collection.training.studied,1);assert.equal(after.achievements.includes('daily-training'),false);assert.equal((await p.profile('google:other')).collection.training.studied,0);
});
test('выданные награды переносятся, удаление не воскрешается из другой комнаты, шесть камней снимают лимит',async()=>{
 const {p}=await fixture(),a=await room(p),b=await room(p,'Другая сессия');
 for(const id of LEGENDARY_IDS)a.g.grantAchievement(id,'player',a.m.pid,'earned','collection');let first=(await p.syncCollections(a.r.id,a.g)).observed;
 let second=(await p.syncCollections(b.r.id,b.g)).observed;assert.equal(publicCollection(b.g,b.m.pid).unlocked,true);assert.equal(b.g.state.achievements.length,0);
 a.g.revokeAchievement('infinity-gauntlet','player',a.m.pid);await p.syncCollections(a.r.id,a.g,first);await p.syncCollections(b.r.id,b.g,second);assert.equal(publicCollection(b.g,b.m.pid).unlocked,false);
 const restored=new GameLogic(b.g.state);await p.syncCollections(b.r.id,restored);assert.equal(publicCollection(restored,b.m.pid).unlocked,false);
});
test('миграция восстанавливает прогресс из сохранённых комнат и сохраняет источник ручных наград',async()=>{
 const {p,store}=await fixture(),a=await room(p);a.profile().studied=Array.from({length:45},(_,i)=>key(i));a.g.grantAchievement('neon-summit','player',a.m.pid,'manual');await store.roomStore(a.r.id).save(a.g.state);await p.migrateCollections();await p.migrateCollections();const v=await p.profile('google:student');assert.equal(v.collection.training.studied,45);assert.equal(v.collection.awards[0].source,'manual');await p.deleteRoom('google:owner',a.r.id);assert.equal((await p.profile('google:student')).collection.training.studied,45);
});
test('реальный движок сохраняет прогресс между закрытием и входом в другую комнату',async t=>{
 const {p,store}=await fixture();const a=await p.createRoom('google:owner',{name:'Первая пара'}),b=await p.createRoom('google:owner',{name:'Следующая пара'});const portal=createPortalServer({platformStore:store,sessionSecret:'test-runtime-collections-secret-123456789',publicOrigin:'http://127.0.0.1:3000'});t.after(()=>portal.close());await portal.listen(0,'127.0.0.1');const r=await portal.runtime.get(a.id),g=r.server.game,m=g.joinTeam(g.state.regions[0].id,'Студент').player;g.ensureCollection(m.pid);await p.bind(a.id,m.pid,'google:student');profileFor(g,m.pid).studied=Array.from({length:99},(_,i)=>key(i));
 await r.server.platformControl('google:owner','points',{teamId:g.state.regions[0].id,delta:25});assert.equal((await p.profile('google:student')).collection.training.studied,99);await portal.runtime.stop(a.id);
 const next=await portal.runtime.get(b.id),ng=next.server.game,nm=ng.joinTeam(ng.state.regions[0].id,'Студент').player;ng.ensureCollection(nm.pid);await p.bind(b.id,nm.pid,'google:student');await next.server.platformControl('google:owner','points',{teamId:ng.state.regions[0].id,delta:25});assert.equal(publicCollection(ng,nm.pid).studied,99);
 ng.state.settings.mode='solo';const q=ng.addCustomQuestion('Как называется изучение культуры человека?',['Культурология','Астрономия','Геология','Механика'],0,25);await next.server.platformControl('google:owner','start',{questionId:q.questionId,duration:60});ng.castVote(ng.state.regions[0].id,nm.pid,0,ng.state.round.id);ng.teamSubmit(ng.state.regions[0].id,nm.pid,ng.state.round.id);await next.server.platformControl('google:owner','resolve');assert.ok((await p.profile('google:student')).achievements.includes('daily-training'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createAnimation,posterAtMs} from '../award-infinity-gauntlet.js';
import {mountAchievementAnimation} from '../achievement-player.js';
import {GameLogic,hashToken} from '../game-logic.js';
import {profileFor,SAFE_SCORE} from '../achievement-system.js';

const gradient={addColorStop(){}};
const drawing=new Proxy({}, {get:(_,key)=>key==='createImageData'?(w,h)=>({data:new Uint8ClampedArray(w*h*4)}):key==='createLinearGradient'||key==='createRadialGradient'?()=>gradient:key==='measureText'?()=>({width:30}):()=>{},set:()=>true});
function gauntlet(t){const prior=globalThis.document;globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>drawing})};const animation=createAnimation({THREE,lowPower:true});t.after(()=>{animation.dispose();if(prior===undefined)delete globalThis.document;else globalThis.document=prior});return animation}
function game(){const g=new GameLogic();g.enableUniversal();return g}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function node(){const classes=new Set(),handlers=new Map();return {classList:{add(...names){names.forEach(name=>classes.add(name))},contains:name=>classes.has(name),toggle(name,value){if(value)classes.add(name);else classes.delete(name)}},classes,handlers,children:[],hidden:false,textContent:'',clientWidth:390,clientHeight:844,addEventListener(name,fn){handlers.set(name,fn)},removeEventListener(name,fn){if(handlers.get(name)===fn)handlers.delete(name)},setAttribute(){},append(child){this.children.push(child)},getBoundingClientRect(){return {left:0,top:0,width:390,height:844}}}}
function player({reduced=false,load,renderError=false}={}){
 const host=node(),stage=node(),canvas=node(),loading=node(),caption=node(),button=node(),staticNode=node(),title=node(),small=node(),span=node(),doc=node(),frames=new Map(),timers=new Map(),events=[];let next=0,done=0,disposed=0;
 host.querySelector=selector=>({'canvas':canvas,'.award-stage':stage,'.award-loading':loading,'.award-caption':caption,'.award-static':staticNode,'button':button}[selector]);caption.querySelector=selector=>({small,strong:title,span}[selector]);doc.createElement=node;doc.hidden=false;
 const instances=[];
 class Renderer{constructor(options){this.options=options;this.shadowMap={};this.debug={};this.renderLists={dispose(){}};this.rendered=0;instances.push(this)}setPixelRatio(value){this.pixelRatio=value}setSize(w,h){this.size=[w,h]}render(){if(renderError)throw new Error('Simulated mobile GPU failure');this.rendered++}dispose(){this.disposed=true}forceContextLoss(){this.contextLost=true}}
 const scene={traverse(){},clear(){}};
 const animation={scene,camera:{},updates:[],resize(w,h){this.size=[w,h]},update(t){this.updates.push(t)},dispose(){disposed++}};
 const env={...node(),document:doc,devicePixelRatio:3,performance:{now:()=>0},matchMedia:query=>({matches:query.includes('prefers-reduced-motion')?reduced:true}),requestAnimationFrame(fn){const id=++next;frames.set(id,fn);return id},cancelAnimationFrame(id){frames.delete(id)},setTimeout(fn,ms){const id=++next;timers.set(id,{fn,ms});return id},clearTimeout(id){timers.delete(id)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},dispatchEvent:event=>events.push(event)};
 let settings;
 const module={durationMs:11000,captionAtMs:8500,posterAtMs,createAnimation(options){settings=options;return animation}};
 const stop=mountAchievementAnimation(host,{achievementId:'infinity-gauntlet',title:'Я — сама неотвратимость'},{environment:env,loadAnimation:load||(()=>module),loadThree:()=>({...THREE,WebGLRenderer:Renderer}),onDone(){done++}});
 return {host,stage,canvas,caption,loading,staticNode,frames,timers,instances,animation,env,events,stop,get settings(){return settings},get done(){return done},get disposed(){return disposed},paint(now=100){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(now))},timeout(ms){const entry=[...timers].find(([,timer])=>timer.ms===ms);assert.ok(entry,'Timer '+ms);timers.delete(entry[0]);entry[1].fn()}};
}

test('мобильная перчатка: все камни и суставы сохранены при бюджете до 250 тысяч треугольников и 10 МБ',t=>{
 const a=gauntlet(t);a.resize(390,844);let triangles=0,bytes=0;const geometries=new Set();a.scene.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);geometries.add(o.geometry)}});for(const g of geometries){bytes+=g.index?.array.byteLength||0;for(const attr of Object.values(g.attributes))bytes+=attr.array.byteLength}
 assert.ok(triangles<250000,triangles);assert.ok(bytes<10*1024*1024,bytes);assert.equal(a.inspect().gemCenters.length,6);assert.equal(a.inspect().curlAngles.length,5);
 for(const time of [0,1.5,3,5.5,7.1,8.9,11]){a.update(time,1/30);a.scene.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)))}assert.equal(a.scene.userData.installedCount,6);
});

test('мобильная перчатка: подготовка не требует HDR-буферов или второго прохода студии',t=>{
 const a=gauntlet(t);assert.doesNotThrow(()=>a.prepareEnvironment({}));assert.equal(a.scene.environment,null);assert.equal(a.inspect().lowPower,true);
});

test('перк: одно ручное вручение создаёт одно событие, без ложного естественного достижения',()=>{
 const g=game(),p=g.joinTeam('jetisu','Участник');g.grantAchievement('infinity-gauntlet','player',p.player.pid);const awards=g.state.achievements.filter(a=>a.achievementId==='infinity-gauntlet');assert.equal(awards.length,1);assert.equal(awards[0].source,'manual');assert.equal(g.scoreLimit('team','jetisu'),SAFE_SCORE);assert.deepEqual(g.view({playerHash:hashToken(p.playerToken)}).collection.stones,[]);
});

test('перк: повторное вручение команде восстанавливает отозванный доступ только пропущенному участнику',()=>{
 const g=game(),a=g.joinTeam('jetisu','Первый'),b=g.joinTeam('jetisu','Второй');g.grantAchievement('infinity-gauntlet','team','jetisu');g.revokeAchievement('infinity-gauntlet','player',a.player.pid);assert.equal(g.view({playerHash:hashToken(a.playerToken)}).collection.revoked,true);
 const result=g.grantAchievement('infinity-gauntlet','team','jetisu');assert.equal(result.duplicate,false);assert.deepEqual(result.achievement.recipientIds,[a.player.pid]);assert.equal(g.view({playerHash:hashToken(a.playerToken)}).collection.active,true);assert.equal(profileFor(g,b.player.pid).earned.length,1);assert.equal(g.grantAchievement('infinity-gauntlet','team','jetisu').duplicate,true);
 g.setGameMode('solo');g.adjustCapital(a.player.pid,1250);assert.equal(g.member(a.player.regionId,a.player.pid).capital,1250);
});

test('перк: восстановленный профиль переживает перезапуск и повторный мобильный вход по cookie коллекции',()=>{
 let g=game();const old=g.joinTeam('jetisu','Игрок'),cookie=g.collectionCookie(old.player.pid);g.grantAchievement('infinity-gauntlet','player',old.player.pid);g.revokeAchievement('infinity-gauntlet','player',old.player.pid);g.grantAchievement('infinity-gauntlet','player',old.player.pid);g.leaveTeam(old.player.regionId,old.player.pid);g=new GameLogic(g.state);
 const next=g.joinTeam('jetisu','Игрок после входа');g.ensureCollection(next.player.pid,hashToken(cookie));assert.equal(g.view({playerHash:hashToken(next.playerToken)}).collection.active,true);assert.equal(g.scoreLimit('team','jetisu'),SAFE_SCORE);g.adjustPoints('jetisu',1250);assert.equal(g.region('jetisu').points,1250);g.setPerksEnabled(false);assert.equal(g.scoreLimit('team','jetisu'),1000);g.setPerksEnabled(true);assert.equal(g.scoreLimit('team','jetisu'),SAFE_SCORE);
});

test('телефон: проигрыватель включает мобильную геометрию, DPR 1 и продолжает рисовать 3D',async()=>{
 const p=player();await flush();assert.equal(p.settings.lowPower,true);assert.equal(p.instances[0].options.antialias,false);assert.equal(p.instances[0].pixelRatio,1);assert.deepEqual(p.animation.size,[390,844]);p.paint(100);assert.equal(p.instances[0].rendered,1);assert.ok(p.frames.size);p.stop();assert.equal(p.disposed,1);assert.equal(p.frames.size,0);assert.deepEqual(p.events.map(e=>e.detail.active),[true,false]);
});

test('телефон: потеря WebGL показывает объяснение и освобождает память вместо исчезновения награды',async()=>{
 const p=player();await flush();p.canvas.handlers.get('webglcontextlost')({preventDefault(){}});assert.ok(p.host.classes.has('award-fallback'));assert.equal(p.staticNode.textContent,'∞');assert.equal(p.caption.hidden,false);assert.ok(p.stage.children[0].textContent.includes('Достижение сохранено'));assert.equal(p.disposed,1);assert.equal(p.instances[0].disposed,true);assert.equal(p.frames.size,0);p.timeout(6000);assert.equal(p.done,1);assert.equal(p.disposed,1);
});

test('телефон: ошибка графики в кадре не закрывает награду молча и позволяет закрыть уведомление',async()=>{
 const p=player({renderError:true});await flush();p.paint();assert.ok(p.host.classes.has('award-fallback'));assert.equal(p.done,0);assert.equal(p.frames.size,0);p.timeout(6000);assert.equal(p.done,1);
});

test('телефон: поздняя загрузка после тайм-аута не создаёт новый WebGL-контекст',async()=>{
 let resolve;const p=player({load:()=>new Promise(done=>resolve=done)});p.timeout(12000);resolve({createAnimation(){throw new Error('Late animation was started')}});await flush();assert.equal(p.instances.length,0);assert.ok(p.host.classes.has('award-fallback'));p.stop();assert.equal(p.timers.size,0);
});

test('телефон: уменьшение анимаций показывает собранную перчатку без цикла кадров',async()=>{
 const p=player({reduced:true});await flush();assert.equal(p.animation.updates.at(-1),8.9);assert.equal(p.frames.size,0);assert.ok(p.instances[0].rendered>0);p.stop();
});

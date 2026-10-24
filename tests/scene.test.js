import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';

test('сцена: камера следует высоте города, крайний зум не теряет подпись, статичная карта останавливается',async()=>{
 const sourceURL=new URL('../scene3d.js',import.meta.url),temporary=new URL('../.scene-test-'+process.pid+'.mjs',import.meta.url);
 const source=(await readFile(sourceURL,'utf8')).replace('new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: false, powerPreference: "high-performance" })','new globalThis.SceneTestRenderer()');
 let now=0,nextId=0,renders=0;const frames=new Map(),events=new Map();
 const context=new Proxy({}, {get:(_target,key)=>key==='measureText'?()=>({width:1}):()=>{},set:()=>true});
 const element=()=>({style:{},clientWidth:390,clientHeight:230,addEventListener(){},removeEventListener(){},setAttribute(){},append(){},remove(){},getContext(){return context},getRootNode(){return this},getBoundingClientRect(){return {left:0,top:0,width:390,height:230}}});
 globalThis.document={hidden:false,createElement:element,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
 globalThis.window={devicePixelRatio:3,matchMedia:()=>({matches:true}),addEventListener(){},removeEventListener(){}};
 globalThis.performance={now:()=>now};globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 globalThis.requestAnimationFrame=fn=>{const id=++nextId;frames.set(id,fn);return id};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 globalThis.SceneTestRenderer=class{shadowMap={};setPixelRatio(value){this.pixelRatio=value}setSize(){}render(){renders++}dispose(){}};
 const step=()=>{now+=50;const pending=[...frames.values()];frames.clear();for(const fn of pending)fn()};
 const canvas=element();canvas.parentElement=element();canvas.ownerDocument=document;
 await writeFile(temporary,source);
 let api;
 try{
  const {createScene}=await import(temporary.href);api=createScene(canvas);assert.equal(api.renderer.pixelRatio,1);
  api.update({regions:[{id:'astana',baseRegionId:'astana',name:'Астана',points:1000,economy:100,members:[]}]},'astana');step();
  api.focusRegion('astana');step();const group=api.scene.children.find(g=>g.children.some(o=>o.userData.regionId==='astana'));
  assert.ok(group);assert.ok(Math.abs(api.controls.target.y-(group.position.y+.71))<.01);
  const before=api.controls.target.y;api.update({regions:[{id:'astana',baseRegionId:'astana',name:'Астана',points:1000,economy:15,members:[]}]},'astana');step();assert.ok(api.controls.target.y<before);assert.ok(Math.abs(api.controls.target.y-(group.position.y+.71))<.01);
  api.camera.position.copy(api.controls.target).add(new THREE.Vector3(0,.79,.71).normalize().multiplyScalar(2.5));api.camera.lookAt(api.controls.target);api.controls.dispatchEvent({type:'change'});step();
  const label=group.children.find(o=>o.isSprite),projected=label.getWorldPosition(new THREE.Vector3()).project(api.camera);
  assert.equal(label.visible,true);assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1);
  for(let i=0;i<45;i++)step();assert.equal(frames.size,0);const settledRenders=renders;step();assert.equal(renders,settledRenders);api.setVisible(true);assert.equal(frames.size,0);
  api.setLowPower(false);assert.equal(api.renderer.pixelRatio,1.5);assert.equal(api.renderer.shadowMap.enabled,true);api.setLowPower(true);assert.equal(api.renderer.pixelRatio,1);assert.equal(api.renderer.shadowMap.enabled,false);
  api.setVisible(false);api.update({regions:[]});assert.equal(frames.size,0);api.setVisible(true);assert.ok(frames.size>0);
  document.hidden=true;events.get('visibilitychange')();assert.equal(frames.size,0);document.hidden=false;events.get('visibilitychange')();assert.ok(frames.size>0);
  const state={regions:[{id:'astana',baseRegionId:'astana',name:'Астана',points:1000,economy:100,members:[]}],match:{id:'match-1'},serverTime:1000,clientReceivedAt:Date.now(),worldAchievements:[{id:'award-1',achievementId:'sky-breaker',teamId:'astana',teamName:'Астана',startedAt:1000,durationMs:7800}]};
  window.matchMedia=query=>({matches:!query.includes('prefers-reduced-motion')});api.update(state);step();const effect=group.children.find(o=>o.name==='match-achievement');assert.ok(effect);assert.equal(effect.userData.achievementId,'award-1');assert.ok(effect.getWorldPosition(new THREE.Vector3()).y>group.position.y);
  api.update(state);assert.equal(group.children.filter(o=>o.name==='match-achievement').length,1);let released=0;effect.traverse(o=>{if(o.geometry)o.geometry.addEventListener('dispose',()=>released++)});
  for(let i=0;i<60;i++)step();assert.ok(effect.children.some(o=>o.children.some(c=>c.isLineSegments&&c.geometry.drawRange.count>0)));for(let i=0;i<110;i++)step();assert.equal(group.children.includes(effect),false);assert.ok(released>0);assert.equal(frames.size,0);api.update(state);assert.equal(group.children.some(o=>o.name==='match-achievement'),false);
  const ids=['neon-summit','zero-card','scenario-reader','determination','daily-training','infinity-gauntlet'];
  api.update({...state,worldAchievements:ids.map((achievementId,i)=>({id:'new-'+i,achievementId,teamId:'astana',teamName:'Астана',title:achievementId,startedAt:1000,durationMs:8000}))});step();
  const effects=group.children.filter(o=>o.name==='match-achievement');assert.equal(effects.length,ids.length);
  for(const [i,id]of ids.entries())assert.equal(effects[i].userData.achievementId,'new-'+i);
  const training=effects.find(o=>o.children.some(c=>c.children.some(m=>m.isInstancedMesh)));
  assert.ok(training);for(let i=0;i<180;i++)step();assert.equal(group.children.some(o=>o.name==='match-achievement'),false);
 }finally{api?.dispose();await unlink(fileURLToPath(temporary))}
});

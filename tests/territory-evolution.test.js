import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {GameLogic} from '../game-logic.js';
import {developmentFor,mapRegionsFor} from '../game-config.js';
import {createFutureTerritory,setFutureDetail} from '../territory-models.js';

function fixture(){const g=new GameLogic();g.enableUniversal();g.enableFlexibleTeams();const j=g.joinTeam('saryarka','Студент');return {g,pid:j.player.pid};}
function answer(g){g.startRound(g.state.questions[0].id,60);const t=g.region('saryarka'),p=t.members[0];g.castVote(t.id,p.pid,g.state.round.questionSnapshot.correct,g.state.round.id);g.confirmVote(t.id,p.pid,p.pid,g.state.round.id);g.resolveRound();}
test('territory survives lesson resets and persistence; Infinity gates growth past 1000',()=>{
 let {g,pid}=fixture();g.adjustPoints('saryarka',1000);g.resetGame();
 assert.equal(g.region('saryarka').points,0);assert.equal(g.region('saryarka').developmentPoints,1000);
 pid=g.joinTeam('saryarka','Другой студент').player.pid;answer(g);assert.equal(g.region('saryarka').developmentPoints,1000);
 g.grantAchievement('infinity-gauntlet','player',pid);g.region('saryarka').developmentPoints=4975;answer(g);g.resolveRound();
 assert.equal(g.region('saryarka').developmentPoints,5000);assert.equal(developmentFor(5000).name,'Неоновый мегаполис');
 g=new GameLogic(structuredClone(g.state));g.resetGame();assert.equal(g.region('saryarka').developmentPoints,5000);
 pid=g.joinTeam('saryarka','Третий студент').player.pid;g.grantAchievement('infinity-gauntlet','player',pid);g.region('saryarka').developmentPoints=9975;answer(g);
 assert.equal(g.region('saryarka').developmentPoints,10000);assert.equal(developmentFor(10000).complete,true);
 g.setPerksEnabled(false);answer(g);assert.equal(g.region('saryarka').developmentPoints,10000);
 assert.equal(mapRegionsFor(g.view().regions).find(r=>r.id==='karaganda').developmentPoints,10000);
});
test('old saves migrate existing resources; malformed progress is rejected; economy recovery earns no development',()=>{
 const {g}=fixture(),t=g.region('saryarka');g.adjustPoints(t.id,750);const old=structuredClone(g.state);delete old.regions[0].developmentPoints;
 assert.equal(new GameLogic(old).region(t.id).developmentPoints,750);
 const bad=structuredClone(g.state);bad.regions[0].developmentPoints=10001;assert.throws(()=>new GameLogic(bad));
 g.adjustEconomy(t.id,-20);answer(g);assert.equal(t.developmentPoints,750);assert.equal(t.economy,100);
 g.adjustPoints(t.id,-100);assert.equal(t.developmentPoints,750);
 const patch=g.editorSnapshot();patch.regions[0].developmentPoints=10000;g.applyRawState(patch);assert.equal(g.region(t.id).developmentPoints,750);
});
test('future models have bounded merged geometry, no lights/shadows and only focused detail',()=>{
 const materials=new Map(),geometries=new Set(),material=(key,color,extra)=>{if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,...extra}));return materials.get(key);};
 const box=new THREE.BoxGeometry(),cylinder=new THREE.CylinderGeometry(1,1,1,12);
 function batch(){const entries=new Map();return {add(g,m,x,y,z,sx,sy,sz,r=0){const matrix=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),r),new THREE.Vector3(sx,sy,sz));if(!entries.has(m))entries.set(m,[]);entries.get(m).push(g.clone().applyMatrix4(matrix));},finish(){const root=new THREE.Group();for(const[m,gs]of entries){root.add(new THREE.Mesh(mergeGeometries(gs),m));gs.forEach(g=>g.dispose());}return root;}};}
 for(const stage of [6,7])for(const mobile of [true,false]){
  const root=createFutureTerritory({stage,unit:1,batch,box,cylinder,material,mobile});let triangles=0,meshes=0;
  root.traverse(o=>{assert.equal(!!o.isLight,false);if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;assert.equal(o.castShadow,false);geometries.add(o.geometry);}});
  assert.ok(meshes<=14);assert.ok(triangles<12000);
  setFutureDetail(root,true,false);assert.equal(root.userData.detail.visible,true);assert.equal(root.userData.simple.visible,false);
  setFutureDetail(root,false,false);assert.equal(root.userData.detail.visible,false);
  setFutureDetail(root,true,true);assert.equal(root.userData.detail.visible,false);
 }
 geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());box.dispose();cylinder.dispose();
});

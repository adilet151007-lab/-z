import test from 'node:test';
import assert from 'node:assert/strict';
import {GameLogic} from '../game-logic.js';
import {developmentFor,mapRegionsFor} from '../game-config.js';
import {createFutureTerritory,setFutureDetail,territoryPlan} from '../territory-models.js';

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
 g.adjustPoints(t.id,-100);assert.equal(t.developmentPoints,650);
 const patch=g.editorSnapshot();patch.regions[0].developmentPoints=10000;g.applyRawState(patch);assert.equal(g.region(t.id).developmentPoints,650);
});
test('city loses storeys and regresses across thresholds when cultural resource falls',()=>{
 const {g,pid}=fixture();g.grantAchievement('infinity-gauntlet','player',pid);g.adjustPoints('saryarka',5000);
 const before=territoryPlan(g.region('saryarka').developmentPoints);g.adjustPoints('saryarka',-25);
 const after=territoryPlan(g.region('saryarka').developmentPoints);assert.equal(after.resource,4975);assert.ok(after.totalFloors<before.totalFloors);assert.equal(developmentFor(after.resource).index,5);
 g.adjustPoints('saryarka',-4475);assert.equal(g.region('saryarka').developmentPoints,500);assert.equal(developmentFor(500).index,3);
 const restored=new GameLogic(structuredClone(g.state));assert.equal(restored.region('saryarka').developmentPoints,500);
 const solo=fixture();solo.g.setGameMode('solo');solo.g.adjustCapital(solo.pid,100);solo.g.adjustCapital(solo.pid,-25);assert.equal(solo.g.region('saryarka').developmentPoints,75);
});
test('floor construction changes inside milestones; instanced models are bounded and reversible',()=>{
 assert.ok(territoryPlan(525).totalFloors>territoryPlan(500).totalFloors);assert.ok(territoryPlan(2525).totalFloors>territoryPlan(2500).totalFloors);
 const root=createFutureTerritory({unit:1,mobile:true});setFutureDetail(root,true,true);
 for(const resource of [0,100,500,1000,2525,5000,7500,9999,10000,4975,0]){root.userData.update(resource);assert.equal(root.userData.inspect().resource,resource);}
 root.userData.update(5000);const high=root.userData.inspect().totalFloors;root.userData.update(4975);assert.ok(root.userData.inspect().totalFloors<high);
 let calls=0,triangles=0;const geometries=new Set(),materials=new Set();root.traverse(o=>{assert.equal(!!o.isLight,false);if(o.isMesh){assert.equal(o.castShadow,false);assert.equal(o.receiveShadow,false);geometries.add(o.geometry);materials.add(o.material);if(o.parent.visible&&o.count){calls++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*o.count;}}});assert.ok(calls<=8);assert.ok(triangles<100000);
 assert.equal(root.userData.detail.visible,true);setFutureDetail(root,false,true);assert.equal(root.userData.detail.visible,false);
 geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
});

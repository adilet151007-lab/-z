import test from 'node:test';
import assert from 'node:assert/strict';
import {worldPoint,zoomAt,localPoint,resizeElement,rotationFromDrag,connectorAnchor,bezierPath,minimapTransform,minimapPoint,isEditableTarget,snapPosition} from '../studio-math.js';
import {StudioModel} from '../studio-model.js';
import {studioElement,defaultStudio,normalizeStudio,compileStudio,publicStudio} from '../studio-schema.js';
import {GameLogic} from '../game-logic.js';
import {studioFixture} from '../beta-lobby/tests/studio-fixture.mjs';
const question=(id='audit_q')=>({id,text:'Проверочный вопрос аудита?',options:['Один','Два','Три','Четыре'],correct:0,points:25,duration:5,autoAdvance:true});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('Zoom .5/2 with translated canvas retains pointer anchor and every rotated resize opposite handle',()=>{
 for(const zoom of [.5,2])for(const rotation of [0,30,90,-60]){
  const viewport={x:-170,y:235,zoom},rect={left:115,top:61},element={x:100,y:-60,w:260,h:190,rotation};
  const original={x:180,y:120},client={x:original.x*zoom+viewport.x+rect.left,y:original.y*zoom+viewport.y+rect.top};
  assert.deepEqual(worldPoint(client.x,client.y,rect,viewport),original);
  const next=zoomAt(viewport,1.25,{x:client.x-rect.left,y:client.y-rect.top});const anchored=worldPoint(client.x,client.y,rect,next);near(anchored.x,original.x);near(anchored.y,original.y);
  for(const handle of ['nw','n','ne','e','se','s','sw','w']){
   const fixed=e=>localPoint(e,handle.includes('w')?e.w:handle.includes('e')?0:e.w/2,handle.includes('n')?e.h:handle.includes('s')?0:e.h/2);
   const resized=resizeElement(element,handle,16/zoom,11/zoom),a=fixed(element),b=fixed(resized);near(a.x,b.x);near(a.y,b.y);
  }
 }
});
test('Rotation preserves initial angle and guides use a constant screen-space tolerance',()=>{
 const element={x:50,y:80,w:200,h:140,rotation:37},start=localPoint(element,100,-30);near(rotationFromDrag(element,start,start),37);
 for(const zoom of [.5,2]){const aligned=snapPosition({x:0,y:0,w:100,h:100},[{x:100+4/zoom,y:300,w:50,h:50}],zoom,false);assert.ok(aligned.guides.some(g=>g.axis==='x'));}
});
test('Minimap inverse is correct at intrinsic, desktop and narrow CSS dimensions',()=>{
 const elements=[{x:-400,y:-100,w:1500,h:800,rotation:25}],transform=minimapTransform(elements),point={x:125,y:210};
 for(const [width,height]of [[220,140],[150,96],[110,70]]){const rect={left:21,top:44,width,height},x=rect.left+(10+(point.x-transform.bounds.x)*transform.scale)*width/220,y=rect.top+(10+(point.y-transform.bounds.y)*transform.scale)*height/140;const result=minimapPoint(x,y,rect,transform);near(result.x,point.x);near(result.y,point.y);}
});
test('Bezier connectors start at independent rotated output ports and end at the rotated input',()=>{
 const a={x:100,y:80,w:300,h:340,rotation:32},b={x:800,y:30,w:200,h:200,rotation:-15},paths=new Set();
 for(const condition of ['next','correct','wrong']){const path=bezierPath(a,b,condition),numbers=path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number),start=connectorAnchor(a,condition),end=connectorAnchor(b,'next',true);near(numbers[0],start.x);near(numbers[1],start.y);near(numbers.at(-2),end.x);near(numbers.at(-1),end.y);paths.add(path);}assert.equal(paths.size,3);
});
test('Editable, plaintext, textbox and inherited editing surfaces suppress canvas hotkeys',()=>{
 assert.equal(isEditableTarget({isContentEditable:true}),true);
 for(const selector of ['input','textarea','select','[contenteditable]:not([contenteditable="false"])','[role="textbox"]'])assert.equal(isEditableTarget({closest:query=>query.includes(selector)?{}:null}),true);
 assert.equal(isEditableTarget({isContentEditable:false,closest:()=>null}),false);
});
test('Nested frames translate once through inspector movement, arrangement and grouping',()=>{
 const doc=defaultStudio([]),outer=studioElement('syllabus-frame',0,0),inner=studioElement('group',50,70),child=studioElement('quiz-card',80,120,question());inner.parentId=outer.id;child.parentId=inner.id;doc.elements=[outer,inner,child];const m=new StudioModel(doc);m.selection=new Set([outer.id,inner.id,child.id]);assert.equal(m.selectionRoots().length,1);
 m.change(()=>m.moveTo(m.elements[0],200,300));assert.equal(m.elements[2].x,280);assert.equal(m.elements[2].y,420);
 m.autoArrange();assert.equal(m.elements[2].x-m.elements[1].x,30);assert.equal(m.elements[2].y-m.elements[1].y,50);
 m.autoLayout(outer.id,1);assert.equal(m.elements[2].x-m.elements[1].x,30);assert.equal(m.elements[2].y-m.elements[1].y,50);
 m.group();assert.equal(m.elements.find(e=>e.id===child.id).parentId,inner.id);assert.equal(m.elements.find(e=>e.id===inner.id).parentId,outer.id);
});
test('Canonical snapshot preserves question fields, student widgets and safe visible start; integers are required',()=>{
 const doc=defaultStudio([question('q1'),question('q2')]),first=doc.elements[0];Object.assign(first.data,{topic:'Тема',explanation:'Пояснение',source:'Источник',resourceDelta:75,economyDelta:-10,autoAdvance:false,regionId:'saryarka'});first.rotation=17;doc.roomUiLayout.student=[studioElement('widget',90,80,{blockId:'question'}),studioElement('widget',700,80,{blockId:'team'})];
 const roundtrip=compileStudio(JSON.parse(JSON.stringify(doc)));for(const key of ['topic','explanation','source','resourceDelta','economyDelta','duration','points','autoAdvance','regionId'])assert.equal(roundtrip.questions[0][key],first.data[key]);assert.equal(roundtrip.canvasData.elements[0].rotation,17);assert.equal(publicStudio(roundtrip.canvasData).elements.length,0);
 first.hidden=true;assert.equal(normalizeStudio(doc).settings.startId,doc.elements[1].id);first.hidden=false;first.data.duration=5.5;assert.throws(()=>normalizeStudio(doc),/целым/);first.data.duration=5;doc.roomUiLayout.student[0].hidden=true;assert.throws(()=>normalizeStudio(doc),/видимыми/);
});
test('Solo Studio bonuses change personal capital once and do not credit invisible team resources',()=>{
 const game=new GameLogic();game.enableUniversal();game.setGameMode('solo');const a=game.joinTeam(null,'Верный'),b=game.joinTeam(null,'Ошибка'),doc=defaultStudio([question()]);doc.elements[0].data.resourceDelta=75;game.setStudio(doc);game.startRound('audit_q',30);const round=game.state.round.id;game.castVote(a.player.regionId||'saryarka',a.player.pid,0,round);game.castVote(b.player.regionId||'saryarka',b.player.pid,1,round);game.resolveRound();
 const members=game.state.regions.flatMap(t=>t.members);assert.equal(members.find(m=>m.pid===a.player.pid).capital,100);assert.equal(members.find(m=>m.pid===b.player.pid).capital,0);assert.ok(game.state.regions.every(t=>t.points===0));game.resolveRound();assert.equal(members.find(m=>m.pid===a.player.pid).capital,100);
});
test('Invalid room presentation is rejected before mutating authoritative questions or canvas',async t=>{
 const fixture=await studioFixture();t.after(()=>fixture.server.close());const created=await(await fixture.api('creator/rooms/create',{name:'Аудит атомарности',subject:'Мәдениеттану'})).json(),id=created.room.id,runtime=await fixture.server.runtime.get(id),before=JSON.stringify(runtime.server.game.state);
 for(const endpoint of ['studio','configuration']){const result=await fixture.api('creator/rooms/'+id+'/'+endpoint,{canvasData:defaultStudio([question()]),design:{accent:'url(unsafe)'},revision:runtime.server.game.state.revision});assert.equal(result.status,400);assert.equal(JSON.stringify(runtime.server.game.state),before);}
 const applied=await fixture.api('creator/rooms/'+id+'/studio',{canvasData:defaultStudio([question()]),revision:runtime.server.game.state.revision});assert.equal(applied.status,200);const saved=await applied.json();assert.equal(saved.configuration.canvasData.settings.assetVersion,runtime.server.game.state.canvasData.settings.assetVersion);await fixture.server.runtime.stop(id);const restarted=await fixture.server.runtime.get(id);assert.equal(restarted.server.game.state.questions[0].id,'audit_q');
});
test('Shared root and beta browser modules remain byte-for-byte identical',async()=>{
 const {readFile}=await import('node:fs/promises');for(const name of ['studio-math.js','studio-model.js','studio-schema.js','studio-canvas.js','studio-editor.js','studio-widgets.js','studio-layout.js','studio-audio.js','studio-flow.js','studio.css'])assert.equal(await readFile(new URL('../'+name,import.meta.url),'utf8'),await readFile(new URL('../beta-lobby/public/'+name,import.meta.url),'utf8'),name);
});

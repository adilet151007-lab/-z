import test from 'node:test';import assert from 'node:assert/strict';
import {standaloneStudioFixture} from './studio-server-fixture.js';
import {defaultStudio,studioElement,publicStudio} from '../studio-schema.js';
test('Standalone Studio uses existing creator sessions, rejects teacher writes and keeps private media off the student channel',async t=>{
 const f=await standaloneStudioFixture();t.after(()=>f.close());const data=await f.command(f.owner,'getStudio');assert.equal(data.ok,true,data.error);const doc=defaultStudio([{id:'standalone_q',text:'Закрытый вопрос создателя?',options:['Первый','Второй','Третий','Четвёртый'],correct:0,points:25}]),image=studioElement('media-decor',0,0,{url:'data:image/png;base64,iVBORw0KGgo=',text:'Только преподавателю'});doc.roomUiLayout.teacher.push(image);
 const response=await f.post(f.owner,'/api/bulk/applyStudio',{canvasData:doc,features:data.features,design:data.design,revision:f.server.game.state.revision});assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).ok,true);assert.equal(f.server.game.state.questions[0].id,'standalone_q');
 const teacher=await f.teacher();assert.equal((await f.command(teacher,'getStudio')).code,'FORBIDDEN');const rejected=await f.post(teacher,'/api/bulk/applyStudio',{canvasData:doc,revision:f.server.game.state.revision});assert.equal((await rejected.json()).code,'FORBIDDEN');
 const publicDoc=publicStudio(f.server.game.state.canvasData);assert.equal(publicDoc.roomUiLayout.teacher.length,0);assert.ok(!JSON.stringify(publicDoc).includes('Закрытый вопрос'));
 const url='/api/studio-media/'+image.id+'?v='+f.server.game.state.canvasData.settings.assetVersion;assert.equal((await fetch(f.origin+url)).status,404);assert.equal((await fetch(f.origin+url,{headers:{Cookie:f.owner.jar.cookie}})).status,200);
 assert.equal((await fetch(f.origin+'/studio.html')).status,403);assert.equal((await fetch(f.origin+'/studio.html',{headers:{Cookie:f.owner.jar.cookie}})).status,200);
 for(const asset of ['studio.css','studio-editor.js','room-layout.js','syllabus-files.js'])assert.equal((await fetch(f.origin+'/'+asset)).status,200,asset);
});

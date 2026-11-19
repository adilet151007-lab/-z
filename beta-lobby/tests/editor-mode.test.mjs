import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

async function fixture({preferred=null,narrow=false,explicit}={}) {
 const storage=new Map(preferred?[['eradis_editor_mode',preferred]]:[]),instances=[],queries=[];
 class Element {
  children=[];dataset={};handlers={};value='';
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(){}
  addEventListener(name,fn){this.handlers[name]=fn;}
 }
 const factory=simple=>(value,options)=>{
  const instance={element:new Element(),simple,options,value:structuredClone(value),disposed:false,
   read(){if(this.invalid)throw Error('Заполните вопрос');return this.value;},dispose(){this.disposed=true;}};
  instances.push(instance);return instance;
 };
 const mode=(await readFile(new URL('../public/mobile-room-builder.js',import.meta.url),'utf8')).match(/export function useSimpleRoomBuilder\(\) \{[\s\S]*?\n\}/)[0];
 const source=(await readFile(new URL('../public/lobby-designer.js',import.meta.url),'utf8')).split("import {ROOM_FEATURES")[0].replace(/^import .*\n/gm,'');
 const context={document:{createElement:()=>new Element()},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},matchMedia:q=>{queries.push(q);return {matches:narrow};},
  createStudioEditor:factory(false),createMobileRoomDesigner:factory(true)};
 vm.createContext(context);vm.runInContext((mode+'\n'+source).replaceAll('export ',''),context);
 const original={name:'Урок',config:{mode:'team'},features:{chat:true},design:{accent:'#14b8a6'},canvasData:{elements:[{id:'q1',data:{text:'Вопрос?'}}],connections:[{id:'branch',condition:'wrong'}]}};
 const editor=context.createRoomDesigner(original,{editorMode:explicit}),choice=editor.element.children[0].children[0].children[0];
 return {editor,choice,instances,storage,queries,switchTo(mode){choice.value=mode;choice.handlers.change();}};
}

test('Laptop opens full Studio; touch capability is not a reason to hide the canvas',async()=>{
 const f=await fixture();assert.equal(f.editor.simple,false);assert.deepEqual(f.queries,['(max-width: 760px)']);
});
test('Phone defaults to simple; saved preference and explicit Studio link override detection',async()=>{
 assert.equal((await fixture({narrow:true})).editor.simple,true);
 assert.equal((await fixture({narrow:true,preferred:'studio'})).editor.simple,false);
 assert.equal((await fixture({preferred:'simple',explicit:'studio'})).editor.simple,false);
});
test('Switching both ways preserves edited questions, branching, layouts and features',async()=>{
 const f=await fixture();f.instances[0].value.canvasData.elements[0].data.text='Изменено';
 const before=JSON.stringify(f.editor.read());f.switchTo('simple');
 assert.equal(f.editor.simple,true);assert.equal(f.instances[0].disposed,true);
 assert.equal(f.instances[1].options.restoreDraft,false);assert.equal(JSON.stringify(f.editor.read()),before);
 f.switchTo('studio');assert.equal(f.editor.simple,false);assert.equal(JSON.stringify(f.editor.read()),before);
 assert.equal(f.storage.get('eradis_editor_mode'),'studio');
 assert.deepEqual(Object.keys(f.editor.read()).sort(),['canvasData','design','features']);
});
test('Invalid mobile draft blocks switching instead of discarding incomplete work',async()=>{
 const f=await fixture({narrow:true});f.instances[0].invalid=true;f.switchTo('studio');
 assert.equal(f.choice.value,'simple');assert.equal(f.instances.length,1);assert.equal(f.instances[0].disposed,false);
 assert.equal(f.editor.element.children[1].textContent,'Заполните вопрос');
});

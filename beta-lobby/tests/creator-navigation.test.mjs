import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the real request runner. Rendering is stubbed because it replaces
// content buttons; the static navigation must survive that replacement.
async function fixture({failLoad=false,failRender=false,fetch:fetchOverride}={}){
 const source=(await readFile(new URL('../public/lobby-creators.js',import.meta.url),'utf8'))
  .replace(/^import .*\n/,'').replace(/load\(\)\.then\(render\)\.catch\(.*$/m,'');
 const button=disabled=>({disabled,isConnected:true,addEventListener(){}});
 const nav=button(false),refresh=button(false),action=button(false),unavailable=button(true);
 let controls=[nav,refresh,action,unavailable];
 const message={textContent:''},content={attributes:{},addEventListener(){},setAttribute(k,v){this.attributes[k]=v;}};
 const document={getElementById:id=>id==='creator-message'?message:content,
  querySelectorAll:selector=>selector==='.creator-page button'?controls:[]};
 let loads=0,renders=0;
 const sandbox={document,window:{scrollY:12,addEventListener(){},scrollTo(){}},localStorage:{getItem:()=>null},
  confirm:()=>true,AbortSignal,fetch:fetchOverride||(async()=>({ok:true,json:async()=>({ok:true})})),
  loadStub:async()=>{loads++;if(failLoad)throw new Error('Не удалось обновить данные.');},
  renderStub:()=>{renders++;if(failRender)throw new Error('Ошибка построения раздела.');action.isConnected=false;unavailable.isConnected=false;controls=[nav,refresh,button(false),button(true)];}};
 vm.createContext(sandbox);
 vm.runInContext(source+'\nload=loadStub;render=()=>{document.getElementById("creator-message").textContent=message;renderStub();};globalThis.runner={run,api};',sandbox);
 return {nav,refresh,action,unavailable,message,content,run:sandbox.runner.run,api:sandbox.runner.api,
  controls:()=>controls,counts:()=>({loads,renders})};
}

test('после сохранения вкладки и Обновить снова доступны; ограничения новых кнопок сохраняются',async()=>{
 const f=await fixture();let finish;const pending=new Promise(resolve=>{finish=resolve;});
 const work=f.run(()=>pending);
 assert.equal(f.nav.disabled,true);assert.equal(f.refresh.disabled,true);
 finish();await work;
 assert.equal(f.message.textContent,'Сохранено.');
 assert.equal(f.nav.disabled,false);assert.equal(f.refresh.disabled,false);
 assert.equal(f.controls()[2].disabled,false);assert.equal(f.controls()[3].disabled,true);
 assert.equal(f.content.attributes['aria-busy'],'false');
});
test('ошибка запроса снимает блокировку, сохраняя ранее недоступные действия',async()=>{
 const f=await fixture();await f.run(async()=>{throw new Error('Сеть недоступна.');});
 assert.equal(f.message.textContent,'Сеть недоступна.');
 assert.equal(f.nav.disabled,false);assert.equal(f.refresh.disabled,false);
 assert.equal(f.unavailable.disabled,true);
});
test('ошибка обновления данных или построения раздела не блокирует навигацию',async()=>{
 for(const options of [{failLoad:true},{failRender:true}]){
  const f=await fixture(options);await f.run(async()=>{});
  assert.equal(f.nav.disabled,false);assert.equal(f.refresh.disabled,false);
  assert.equal(f.content.attributes['aria-busy'],'false');
 }
});
test('повторное нажатие во время запроса не выполняет действие дважды',async()=>{
 const f=await fixture();let finish,count=0;const pending=new Promise(resolve=>{finish=resolve;});
 const first=f.run(async()=>{count++;await pending;});await f.run(async()=>{count++;});
 assert.equal(count,1);finish();await first;assert.equal(f.nav.disabled,false);
});
test('таймаут сообщает о неопределённом результате и не повторяет запись автоматически',async()=>{
 let count=0;const f=await fixture({fetch:async()=>{count++;const error=new Error('Timeout');error.name='TimeoutError';throw error;}});
 await assert.rejects(()=>f.api('creator/accounts/stats',{}),/20 секунд.*могло сохраниться/);
 assert.equal(count,1);
});

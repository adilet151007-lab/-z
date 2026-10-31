// ERADIS Studio document format. Pure module shared by editor, server and backups.
export const STUDIO_VERSION=1;
export const STUDIO_TYPES=['syllabus-frame','quiz-card','economy-trigger-node','lesson-defense-card','media-decor','widget','group'];
export const STUDIO_WIDGETS={map:'Карта ҚАЗАҚСТАН',controls:'Текущий вопрос',participants:'Команды и участники',teams:'Настройки команд',answers:'Ответы преподавателя',questions:'Банк вопросов',syllabus:'Силлабус → темы и вопросы',format:'Формат пары',admission:'Вход и защита занятия',ranking:'Рейтинг команд',achievements:'Достижения',events:'Журнал событий',chat:'Чат',editor:'Редактор вопросов',branding:'Организация',backups:'Резервные копии'};
const fail=message=>{throw Object.assign(new Error(message),{code:'AUTHORING_VALIDATION'});};
const num=(v,min,max,fallback)=>v===undefined?fallback:typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:fail('Недопустимая геометрия или число.');
const str=(v,max,fallback='')=>v===undefined?fallback:typeof v==='string'&&v.length<=max&&!v.includes('\u0000')?v:fail('Слишком длинное или неверное поле Studio.');
const id=v=>typeof v==='string'&&/^[\w-]{1,80}$/.test(v)?v:fail('Неверный ID элемента Studio.');
const color=(v,fallback)=>v===undefined?fallback:typeof v==='string'&&/^#[\da-f]{6}$/i.test(v)?v:fail('Цвет Studio задаётся как #RRGGBB.');
export const studioId=()=>globalThis.crypto?.randomUUID?.()||'n_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
export function studioElement(type,x=0,y=0,data={}){data=structuredClone(data);const element={id:studioId(),type,x,y,w:type==='syllabus-frame'?1000:360,h:type==='syllabus-frame'?700:type==='quiz-card'?340:220,rotation:0,z:0,hidden:false,locked:false,parentId:null,name:STUDIO_WIDGETS[data.blockId]||({'quiz-card':'Новый вопрос','syllabus-frame':'Тема','economy-trigger-node':'Бонус','lesson-defense-card':'Защита работы','media-decor':'Заметка',group:'Группа'}[type]||'Виджет'),style:{fill:'#111c2d',border:'#14b8a6',text:'#e5f4f6',borderWidth:1,radius:16,opacity:1,fontSize:16,fontFamily:'system-ui',shadow:true,gradient:false},data:type==='quiz-card'?{text:'Новый вопрос',options:['','','',''],correct:null,points:25,duration:30,autoAdvance:true,topic:'',explanation:'',source:'',...data}:type==='economy-trigger-node'?{resourceDelta:25,economyDelta:0,regionId:'',...data}:data};if(type==='quiz-card'){element.name=(data.text||'Новый вопрос').slice(0,70);element.data.questionId=data.questionId||data.id||('studio_'+element.id);delete element.data.id;}return element;}
export function defaultStudio(questions=[]){
 const elements=questions.map((q,i)=>studioElement('quiz-card',(i%4)*420,Math.floor(i/4)*410,{...q,questionId:q.id,duration:q.duration||30,autoAdvance:q.autoAdvance??true}));
 const connections=elements.slice(1).map((n,i)=>({id:studioId(),from:elements[i].id,to:n.id,condition:'next'}));
 const layout=()=>Object.keys(STUDIO_WIDGETS).map((blockId,i)=>({...studioElement('widget',(i%2)*720,i<2?0:520+Math.floor((i-2)/2)*400,{blockId}),w:680,h:blockId==='map'?480:360}));
 return {version:1,viewport:{x:60,y:60,zoom:1},elements,connections,frames:[],roomUiLayout:{teacher:layout(),projector:layout().filter(e=>!['answers','editor','backups','branding','syllabus'].includes(e.data.blockId)),student:[]},settings:{mode:'flow',theme:'dark',locale:'ru',grid:'dots',snap:true,hideAnswers:true,startId:elements[0]?.id||null,routeTeamId:'',layoutWidth:1440}};
}
function normalizeElement(raw){
 if(!raw||!STUDIO_TYPES.includes(raw.type))fail('Неизвестный тип элемента Studio.');
 const s=raw.style||{},d=raw.data||{};if(typeof d!=='object'||Array.isArray(d))fail('Неверные данные элемента.');
 const out={id:id(raw.id),type:raw.type,name:str(raw.name,200,'Элемент'),x:num(raw.x,-100000,100000,0),y:num(raw.y,-100000,100000,0),w:num(raw.w,40,20000,360),h:num(raw.h,40,20000,220),rotation:num(raw.rotation,-360,360,0),z:num(raw.z,-10000,10000,0),hidden:raw.hidden===true,locked:raw.locked===true,parentId:raw.parentId?id(raw.parentId):null,
 style:{fill:color(s.fill,'#111c2d'),border:color(s.border,'#14b8a6'),text:color(s.text,'#e5f4f6'),borderWidth:num(s.borderWidth,0,12,1),radius:num(s.radius,0,120,16),opacity:num(s.opacity,.05,1,1),fontSize:num(s.fontSize,10,80,16),fontFamily:['system-ui','Georgia','monospace'].includes(s.fontFamily)?s.fontFamily:'system-ui',shadow:s.shadow!==false,gradient:s.gradient===true},data:{}};
 for(const k of ['text','topic','explanation','source','sourceExcerpt','regionId','questionId','blockId','mediaKind','url','note','mapMode'])if(d[k]!==undefined)out.data[k]=str(d[k],k==='url'?450000:k==='sourceExcerpt'?4000:k==='text'?6000:2000);
 for(const [k,min,max,def]of [['points',1,1000,25],['duration',5,3600,30],['resourceDelta',-100000,100000,0],['economyDelta',-100,100,0],['capacity',1,20,4],['teamCount',1,30,10]])if(d[k]!==undefined||out.type==='quiz-card'&&['points','duration'].includes(k))out.data[k]=num(d[k],min,max,def);
 if(out.type==='quiz-card'){if(!Array.isArray(d.options)||d.options.length>12||!d.options.every(v=>typeof v==='string'&&v.length<=6000))fail('Проверьте варианты ответа.');out.data.options=[...d.options];out.data.correct=d.correct===null||d.correct===undefined?null:num(d.correct,0,11,0);out.data.autoAdvance=d.autoAdvance!==false;out.data.questionId=d.questionId?id(d.questionId):('studio_'+out.id).slice(0,80);}
 if(out.data.url&&!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/u.test(out.data.url))fail('Медиа: только встроенные PNG, JPEG или WebP.');
 if(out.type==='widget'&&!Object.hasOwn(STUDIO_WIDGETS,out.data.blockId))fail('Неизвестный виджет.');
 return out;
}
export function normalizeStudio(raw){
 if(raw===undefined||raw===null)return null;
 if(!raw||typeof raw!=='object'||raw.version!==1||new TextEncoder().encode(JSON.stringify(raw)).byteLength>2200000)fail('Неверный формат или размер Studio (максимум 2 МБ).');
 const v=raw.viewport||{},s=raw.settings||{};
 const list=value=>{if(!Array.isArray(value)||value.length>400)fail('Максимум 400 элементов на холсте.');const out=value.map(normalizeElement),map=new Map(out.map(e=>[e.id,e]));if(map.size!==out.length)fail('Повторные ID элементов.');for(const e of out){const seen=new Set([e.id]);let p=e.parentId;while(p){if(seen.has(p)||!map.has(p)||!['syllabus-frame','group'].includes(map.get(p).type))fail('Неверная иерархия фреймов.');seen.add(p);p=map.get(p).parentId;}}return out;};
 const elements=list(raw.elements||[]),ids=new Set(elements.map(e=>e.id)),edgeKeys=new Set();
 if(!Array.isArray(raw.connections)||raw.connections.length>800)fail('Максимум 800 связей.');
 const connections=raw.connections.map(c=>{if(!c||!ids.has(c.from)||!ids.has(c.to)||c.from===c.to||!['next','correct','wrong'].includes(c.condition))fail('Некорректная связь.');const key=c.from+'|'+c.condition;if(edgeKeys.has(key))fail('У порта может быть только одна исходящая связь.');edgeKeys.add(key);return {id:id(c.id),from:id(c.from),to:id(c.to),condition:c.condition};});
 if(new Set(connections.map(c=>c.id)).size!==connections.length)fail('Повторные ID связей.');
 const adjacency=new Map();for(const c of connections){const a=adjacency.get(c.from)||[];a.push(c.to);adjacency.set(c.from,a);}const visited=new Set(),active=new Set();function visit(n){if(active.has(n))fail('Цикл в сценарии: удалите обратную стрелку.');if(visited.has(n))return;active.add(n);for(const next of adjacency.get(n)||[])visit(next);active.delete(n);visited.add(n);}for(const e of elements)visit(e.id);
 const roomUiLayout=Object.fromEntries(['teacher','projector','student'].map(k=>[k,list(raw.roomUiLayout?.[k]||[])]));
 for(const rows of Object.values(roomUiLayout)){if(rows.some(e=>!['widget','media-decor','group','syllabus-frame'].includes(e.type)))fail('В UI-макете используйте функциональные виджеты и декор.');const blocks=rows.filter(e=>e.type==='widget').map(e=>e.data.blockId);if(new Set(blocks).size!==blocks.length)fail('Функциональный виджет можно разместить на экране только один раз.');}
 const startId=s.startId&&ids.has(s.startId)?s.startId:elements.find(e=>e.type==='quiz-card')?.id||null;
 if(startId&&elements.find(e=>e.id===startId)?.type!=='quiz-card')fail('Стартовым элементом должна быть карточка вопроса.');
 return {version:1,viewport:{x:num(v.x,-1000000,1000000,60),y:num(v.y,-1000000,1000000,60),zoom:num(v.zoom,.15,3,1)},elements,connections,frames:elements.filter(e=>e.type==='syllabus-frame').map(e=>e.id),roomUiLayout,settings:{mode:s.mode==='layout'?'layout':'flow',theme:s.theme==='light'?'light':'dark',locale:s.locale==='kk'?'kk':'ru',grid:['dots','lines','none'].includes(s.grid)?s.grid:'dots',snap:s.snap!==false,hideAnswers:s.hideAnswers!==false,startId,subject:str(s.subject,80),assetVersion:str(s.assetVersion,80),routeTeamId:str(s.routeTeamId,80),layoutWidth:num(s.layoutWidth,600,4000,1440)}};
}
export function orderedStudioNodes(doc){
 const map=new Map(doc.elements.map(e=>[e.id,e])),out=[],visited=new Set();
 function walk(id){if(visited.has(id)||!map.has(id))return;visited.add(id);const e=map.get(id);if(e.type==='quiz-card'&&!e.hidden)out.push(e);for(const c of doc.connections.filter(c=>c.from===id).sort((a,b)=>['next','correct','wrong'].indexOf(a.condition)-['next','correct','wrong'].indexOf(b.condition)))walk(c.to);}
 if(doc.settings.startId)walk(doc.settings.startId);for(const e of [...doc.elements].sort((a,b)=>a.y-b.y||a.x-b.x))walk(e.id);return out;
}
export function compileStudio(raw){
 const doc=normalizeStudio(raw),nodes=doc?orderedStudioNodes(doc):[];if(nodes.length>100)fail('В одном сценарии максимум 100 вопросов.');
 const questions=nodes.map(e=>{const q=e.data;if(typeof q.text!=='string'||q.text.trim().length<3||q.text.length>2000||q.options.length!==4||q.options.some(o=>!o.trim()||o.length>500)||new Set(q.options.map(o=>o.toLowerCase().trim())).size!==4||!Number.isInteger(q.correct)||q.correct<0||q.correct>3)fail('Завершите вопрос «'+e.name+'»: текст, четыре разных варианта и один правильный ответ.');return {id:q.questionId,text:q.text,options:[...q.options],correct:q.correct,points:q.points,version:1,topic:(q.topic||'').slice(0,200),explanation:(q.explanation||'').slice(0,1200),source:(q.source||'').slice(0,200),sourceExcerpt:(q.sourceExcerpt||'').slice(0,1200),duration:q.duration,autoAdvance:q.autoAdvance,resourceDelta:q.resourceDelta||0,economyDelta:q.economyDelta||0,regionId:(q.regionId||'').slice(0,80),studioNodeId:e.id};});
 if(new Set(questions.map(q=>q.id)).size!==questions.length)fail('Повторные ID вопросов на холсте.');return {canvasData:doc,questions};
}
export function publicStudio(raw,privileged=false){
 if(!raw)return null;
 const roomUiLayout={};for(const surface of ['teacher','projector','student']){roomUiLayout[surface]=privileged||surface==='student'?structuredClone(raw.roomUiLayout[surface]):[];for(const e of roomUiLayout[surface])if(e.data.url)e.data.url='./api/studio-media/'+e.id+'?v='+encodeURIComponent(raw.settings.assetVersion||'');}
 return {version:1,roomUiLayout,settings:{layoutWidth:raw.settings.layoutWidth,hideAnswers:true},viewport:{x:0,y:0,zoom:1},elements:[],connections:[],frames:[]};
}

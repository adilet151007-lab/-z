import {GEOGRAPHY} from './region-geography.js';
import {REGIONS,normalizeRegionId} from './game-config.js';
import {STUDIO_WIDGETS} from './studio-schema.js';
const svgNS='http://www.w3.org/2000/svg';
export const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
export const button=(text,fn,cls='')=>{const b=el('button',text,cls);b.type='button';if(fn)b.addEventListener('click',fn);return b;};
export function mapWidget(data={},teams=[],onRegion=()=>{},t=s=>s,onChange=()=>{}){
 const host=el('div',undefined,'studio-map'),tools=el('div',undefined,'studio-row'),search=el('input');search.type='search';search.placeholder=t('Найти регион…');const modes=el('select');for(const [v,title]of [['17','17 областей'],['13','11 областей и 2 города']]){const o=el('option',t(title));o.value=v;modes.append(o);}modes.value=data.mapMode||'17';
 const statistics=el('small');
 const filter=el('select');for(const label of ['Среднее по регионам','Ресурсы','Экономика'])filter.append(el('option',t(label)));
 const map=document.createElementNS(svgNS,'svg');map.setAttribute('viewBox','-43 -23 86 44');map.setAttribute('aria-label','Карта Казахстана');
 const regionNames=new Map(REGIONS.map(r=>[r.id,r.name])),paths=[];
 for(const r of GEOGRAPHY.regions){const path=document.createElementNS(svgNS,'path');path.setAttribute('d',r.polygons.map(ring=>'M '+ring.map(p=>p.join(' ')).join(' L ')+' Z').join(' '));path.setAttribute('vector-effect','non-scaling-stroke');path.dataset.region=r.id;path.append(document.createElementNS(svgNS,'title'));path.firstChild.textContent=regionNames.get(r.id)||r.id;path.addEventListener('click',()=>{for(const p of paths)p.classList.toggle('active',p===path);onRegion(r.id);});map.append(path);paths.push(path);}
 const draw=()=>{let rows=paths.filter(p=>!search.value||(regionNames.get(p.dataset.region)||'').toLowerCase().includes(search.value.toLowerCase()));if(modes.value==='17')rows=rows.filter(p=>!['astana','almaty','shymkent'].includes(p.dataset.region));if(modes.value==='13')rows=rows.filter(p=>REGIONS.filter(r=>!['astana','almaty','shymkent'].includes(r.id)).slice(0,11).some(r=>r.id===p.dataset.region)||['astana','almaty'].includes(p.dataset.region));for(const p of paths){p.style.opacity=rows.includes(p)?'1':'.12';p.style.pointerEvents=rows.includes(p)?'auto':'none';const team=teams.find(t=>normalizeRegionId(t.id)===p.dataset.region);p.style.fill=filter.selectedIndex===2?`hsl(166 60% ${20+(team?.economy||0)*.3}%)`:filter.selectedIndex===1?`hsl(166 70% ${20+Math.min(team?.points||0,1000)*.03}%)`:'';}};
 for(const n of [search,modes,filter])n.addEventListener('input',draw);modes.addEventListener('change',()=>onChange({mapMode:modes.value}));tools.append(modes,filter,button(t('Вся карта'),()=>{search.value='';for(const p of paths)p.classList.remove('active');draw();}));statistics.textContent=t('Среднее по регионам')+': '+Math.round(teams.reduce((a,r)=>a+(r.points||0),0)/Math.max(1,teams.length))+' · '+Math.round(teams.reduce((a,r)=>a+(r.economy??100),0)/Math.max(1,teams.length))+'%';host.append(search,map,tools,statistics,el('small','SimpleMaps · CC BY 4.0'));draw();return host;
}
export function teamWidget(teams,onAdjust,t=s=>s){const host=el('div',undefined,'studio-team-list');for(const row of teams){const line=el('div',undefined,'studio-team');line.append(el('strong',row.name),el('small',`${row.points||0} / ${row.limit||1000} · ${row.economy??100}%`));const progress=el('progress');progress.max=row.limit||1000;progress.value=row.points||0;line.append(progress);if(onAdjust){const controls=el('div',undefined,'studio-row');for(const [text,key,delta]of [['+25','points',25],['−25','points',-25],['+10%','economy',10],['−10%','economy',-10]])controls.append(button(text,()=>onAdjust(row.id,key,delta)));line.append(controls);}host.append(line);}return host;}
export function nodeContent(e,{hideAnswers=false,teams=[],t=s=>s,onAdjust,onRegion,questions=[],state={},onWidgetAction,onWidgetChange}={}){
 const body=el('div',undefined,'studio-node-body'),d=e.data;
 if(e.type==='quiz-card'){const title=el('p',d.text,'studio-question');title.dataset.inline='text';body.append(title);d.options.forEach((value,i)=>{const option=el('div',`${String.fromCharCode(65+i)}. ${value||'…'}`,'studio-option');if(!hideAnswers&&d.correct===i)option.classList.add('correct');body.append(option);});body.append(el('small',`${d.duration||30}s · +${d.points||25} · ${d.topic||''}`));}
 else if(['syllabus-frame','group'].includes(e.type))body.append(el('small',t('Фрейм · перемещает вложенные карточки')));
 else if(e.type==='economy-trigger-node')body.append(el('strong',`${(d.resourceDelta||0)>=0?'+':''}${d.resourceDelta||0} · ${(d.economyDelta||0)>=0?'+':''}${d.economyDelta||0}%`),el('p',d.regionId||t('Ответившей команде')));
 else if(e.type==='widget'&&d.blockId==='map')body.append(mapWidget(d,teams,onRegion,t,patch=>onWidgetChange?.(e.id,patch)));
 else if(e.type==='widget'&&['teams','participants'].includes(d.blockId))body.append(teamWidget(teams,onAdjust,t));
 else if(e.type==='widget'){
  const action=()=>onWidgetAction?.(d.blockId);
  if(d.blockId==='questions'){for(const q of questions)body.append(button(q.text,()=>onWidgetAction?.('question',q.questionId||q.id)));if(!questions.length)body.append(el('p',t('Банк вопросов')+' · 0'));}
  else if(d.blockId==='controls'){body.append(el('p',questions[0]?.text||t('Банк вопросов')+' · 0'),el('strong',(questions[0]?.duration||30)+' s'),button(t('Режим проектора'),action));}
  else if(d.blockId==='answers'){if(hideAnswers)body.append(el('p',t('Скрыть ответы для проектора')));else for(const q of questions){body.append(el('strong',q.text),el('p',Number.isInteger(q.correct)?String.fromCharCode(65+q.correct)+'. '+q.options[q.correct]:t('Не указан')));}}
  else if(d.blockId==='events'){for(const row of (state.log||[]).slice(-20))body.append(el('p',row.msg||row.text||''));if(!state.log?.length)body.append(el('p',t('Журнал событий')+' · 0'));}
  else if(d.blockId==='achievements'){for(const row of state.achievements||[])body.append(el('p',row.recipientName+' · '+(row.title||row.achievementId)));if(!state.achievements?.length)body.append(el('p',t('Достижения')+' · 0'));}
  else if(d.blockId==='ranking')body.append(teamWidget([...teams].sort((a,b)=>b.points*b.economy-a.points*a.economy),null,t));
  else if(d.blockId==='syllabus')body.append(button(t('Найти темы'),action),button(t('Подготовить и разложить на холсте'),action));
  else if(d.blockId==='format')body.append(el('p',(state.settings?.mode||state.config?.mode||'team')+' · '+(state.settings?.autoDuration||state.config?.duration||30)+' s'),button(t('Формат пары'),action));
  else if(d.blockId==='admission')body.append(el('p',state.phase||'lobby'),button(t('Вход и защита занятия'),action));
  else if(d.blockId==='editor')body.append(button(t('Карточка вопроса'),action));
  else body.append(el('strong',t(STUDIO_WIDGETS[d.blockId])),button(t(STUDIO_WIDGETS[d.blockId]),action));
 }
 else if(d.mediaKind==='table'){const table=el('table');for(const line of (d.text||'').split('\n')){const tr=el('tr');for(const text of line.split('|'))tr.append(el('td',text.trim()));table.append(tr);}body.append(table);}
 else if(d.url){const img=el('img');img.src=d.url;img.alt=d.text||'';img.draggable=false;body.append(img);}
 else{const note=el('p',d.text||d.note||t('Двойной клик — редактировать'));note.dataset.inline='text';body.append(note);}
 return body;
}

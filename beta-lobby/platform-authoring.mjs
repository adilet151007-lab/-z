import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {validateQuestions} from '../game-logic.js';

export const managerFor=(s,id,r)=>{
 const a=s.accounts[id];
 return !!a&&a.status!=='blocked'&&!!r&&(['owner','creator'].includes(a.role)||r.ownerId===id&&a.role==='teacher'||(r.managers||[]).includes(id));
};
export function statsFor(s,id){
 const rows=Object.values(s.results).filter(r=>r.accountId===id);
 const base={matches:rows.length,correct:rows.reduce((n,r)=>n+r.correct,0),answered:rows.reduce((n,r)=>n+r.answered,0),wins:rows.filter(r=>r.place===1).length};
 const a=s.accounts[id],totals=Object.fromEntries(Object.keys(base).map(k=>[k,Math.max(0,base[k]+(a.statsOffset?.[k]||0))]));
 return {baseTotals:base,totals,statsRevision:createHash('sha256').update(JSON.stringify([base,a.statsOffset||{}])).digest('hex')};
}
export function audit(s,event){s.creatorAudit??=[];s.creatorAudit.push(event);s.creatorAudit=s.creatorAudit.slice(-500);}
const validation=m=>Object.assign(new Error(m),{code:'AUTHORING_VALIDATION'});
const fail=m=>{throw validation(m);};
export function validateTemplate(raw){
 if(!raw||typeof raw!=='object')fail('Проверьте шаблон.');
 const clean=(v,n)=>{if(typeof v!=='string'||v.trim().length<2||v.length>n||/[\u0000-\u001f\u007f]/.test(v))fail('Проверьте название и предмет.');return v.trim();};
 const name=clean(raw.name,80),subject=clean(raw.subject||'Мәдениеттану',80),type=raw.type||'strategy';
 if(!['strategy','quiz','blitz'].includes(type))fail('Неизвестный шаблон игры.');
 const c=raw.config||{},config={mode:c.mode||(type==='strategy'?'team':'solo'),decision:c.decision||'consensus',teamCount:c.teamCount??10,capacity:c.capacity??4,duration:c.duration??(type==='blitz'?15:60),autoAdvance:c.autoAdvance??true,perksEnabled:c.perksEnabled??true,tradingEnabled:c.tradingEnabled??false,accent:c.accent||'#3fe0d0',gold:c.gold||'#f3c25d'};
 if(!['consensus','leader','instant'].includes(config.decision))fail('Проверьте способ ответа команды.');
 if(!['solo','team'].includes(config.mode))fail('Проверьте режим.');
 for(const [k,min,max]of [['teamCount',1,30],['capacity',1,20],['duration',5,3600]])if(!Number.isSafeInteger(config[k])||config[k]<min||config[k]>max)fail('Недопустимое значение: '+k);
 for(const k of ['autoAdvance','perksEnabled','tradingEnabled'])if(typeof config[k]!=='boolean')fail('Проверьте переключатели.');
 for(const k of ['accent','gold'])if(!/^#[a-f0-9]{6}$/i.test(config[k]))fail('Цвет задаётся как #RRGGBB.');
 if(!Array.isArray(raw.questions)||raw.questions.length>100)fail('В шаблоне можно хранить до 100 вопросов.');
 const questions=validateQuestions(raw.questions.map(q=>({...q,id:q.id||'custom_'+randomUUID(),subject,points:q.points??25})));
 const sources={css:raw.sources?.css||'',js:raw.sources?.js||''};
 if(Object.values(sources).some(v=>typeof v!=='string'||Buffer.byteLength(v)>32768))fail('CSS и JavaScript ограничены 32 КБ каждый.');
 return {name,subject,type,config,questions,sources};
}
export async function checkJavaScript(source){
 if(!source)return;
 await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--check','--input-type=module'],{stdio:['pipe','ignore','ignore']});
  const timer=setTimeout(()=>{child.kill();reject(validation('Проверка JavaScript превысила время.'));},3000);
  child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(validation('В JavaScript есть синтаксическая ошибка.'));});child.stdin.on('error',()=>{});child.stdin.end(source);
 });
}

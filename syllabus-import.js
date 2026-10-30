// Conservative import of authored tests and Q/A. No model, network or answer guessing.
const compact=v=>String(v).replace(/\s+/g,' ').trim();
const key=v=>compact(v).normalize('NFC').toLowerCase().replace(/ё/g,'е').replace(/[\p{P}\p{S}]/gu,'').trim();
const answerRE=/^(?:(?:правильн(?:ый|ые)|верн(?:ый|ые))\s+ответ(?:ы)?|ответ(?:ы)?|дұрыс\s+жауап(?:тар|тары|тарыңыз)?|жауабы|жауап|correct\s+answers?|answers?)\s*[:=—–-]\s*(.*)$/iu;
const keyHeader=/^(?:ответы|правильные ответы|ключ(?:и)?(?:\s+ответов)?|жауаптар|дұрыс жауаптар|answer key|answers)\s*[:.]?\s*$/iu;
const explicitQ=/^(?:вопрос|сұрақ|question)(?!\p{L})\s*(?:[№#]?\s*(\d{1,4}))?\s*[:.)—–-]?\s*(.+)$/iu;
const numberedQ=/^(?:[№#]\s*)?(\d{1,4})\s*[.)]\s+(.+)$/u;
const optionRE=/^\s*([+✓✔])?\s*([A-HАБВГДЕЁЖЗСН])\s*[).:]\s*(.+)$/iu;
const sectionRE=/^(?:#{1,4}\s+|(?:тема|тақырып|topic|раздел|глава)(?!\p{L})\s*(?:\d+)?\s*[.:—–-]?\s*)(.{3,190})$/iu;
const tableCells=line=>line.includes('\t')?line.split(/\t+/).map(compact):/^\s*\|.*\|\s*$/.test(line)?line.trim().slice(1,-1).split('|').map(compact):null;
const isQuestionHeader=v=>/^(?:вопрос|сұрақ|question)$/iu.test(v);
const isAnswerHeader=v=>/^(?:ответ|жауап|answer)$/iu.test(v);
function option(raw){
 const m=raw.match(optionRE);if(!m)return null;
 let text=m[3],marked=Boolean(m[1]);
 if(/\s*[✓✔]\s*$/u.test(text)){marked=true;text=text.replace(/\s*[✓✔]\s*$/u,'');}
 if(/^\s*[+✓✔]\s+/u.test(text)){marked=true;text=text.replace(/^\s*[+✓✔]\s+/u,'');}
 return {label:m[2].toUpperCase(),text:compact(text),marked};
}
// Expand only a sequence beginning with an option, or following a question mark.
// This avoids interpreting a stray "B)" in an ordinary paragraph as an option.
function expandLines(text){
 const result=[];
 text.split('\n').forEach((raw,index)=>{
  const markers=[...raw.matchAll(/(?:^|\s)([+✓✔]?\s*[A-HАБВГДЕЁЖЗСН])\s*[).:]\s+/giu)];
  if(markers.length>=2&&(markers[0].index===0||raw.slice(0,markers[0].index).trim().endsWith('?'))){
   const prefix=raw.slice(0,markers[0].index).trim();if(prefix)result.push({raw:prefix,line:index+1});
   markers.forEach((m,i)=>result.push({raw:raw.slice(m.index,i+1<markers.length?markers[i+1].index:raw.length).trim(),line:index+1}));
  }else result.push({raw:raw.trim(),line:index+1});
 });return result;
}
function resolveKey(raw,record){
 const cleaned=compact(raw).replace(/[.;]$/u,'');
 const letters=cleaned.match(/^[A-HАБВГДЕЁЖЗСН](?:\s*[,;/+]\s*[A-HАБВГДЕЁЖЗСН])+$/iu);
 if(letters)return {issue:'multiple_correct'};
 const direct=record.options.map((v,i)=>key(v)===key(cleaned)?i:-1).filter(i=>i>=0);
 if(direct.length===1)return {index:direct[0]};
 const match=cleaned.match(/^([A-HАБВГДЕЁЖЗСН])\s*[).]?$/iu);
 if(match){
  const label=match[1].toUpperCase(),exact=record.optionLabels.indexOf(label);
  if(exact>=0)return {index:exact};
  const visual={'А':'A','В':'B','С':'C','Е':'E','Н':'H'},latin=v=>visual[v]||v;
  const indices=record.optionLabels.map((v,i)=>latin(v)===latin(label)?i:-1).filter(i=>i>=0);
  if(indices.length===1)return {index:indices[0]};
 }
 return {issue:'unsupported_key'};
}
export function parseAuthoredQuestions(text){
 const lines=expandLines(text),records=[],consumed=new Set(),keys=new Map(),diagnostics={unmatchedKeys:0,truncatedRecords:0};
 let current=null,section='',mode='',table=false,keyMode=false,serial=0,gap=false;
 const consume=line=>{consumed.add(line);gap=false;};
 const finish=()=>{if(current){current.text=compact(current.text);records.push(current);current=null;mode='';}};
 const start=(value,number,line)=>{
  finish();current={text:compact(value),number:number||String(++serial),section,sourceLine:line,sourceLines:new Set([line]),options:[],optionLabels:[],marked:[],answerParts:[],issues:[]};mode='stem';consume(line);
 };
 const keyPairs=raw=>[...raw.matchAll(/(?:^|[;\s,])(?:[№#]\s*)?(\d{1,4})\s*[.):=—–-]\s*([A-HАБВГДЕЁЖЗСН](?:\s*[,/+]\s*[A-HАБВГДЕЁЖЗСН])?)(?=\s|[;,]|$)/giu)];
 for(let i=0;i<lines.length;i++){
  const {raw,line}=lines[i];if(!raw){gap=true;mode=mode==='answer'?'after-answer':mode;continue;}
  const inlineKeys=raw.match(/^(?:ответы|ключи? ответов|жауаптар|answer key)\s*:\s*(.+)$/iu);
  if(keyHeader.test(raw)||inlineKeys){finish();keyMode=true;consume(line);if(inlineKeys)for(const m of keyPairs(inlineKeys[1])){const list=keys.get(m[1])||[];list.push(m[2]);keys.set(m[1],list);}continue;}
  if(keyMode){
   const pairs=keyPairs(raw);
   if(pairs.length){for(const m of pairs){const list=keys.get(m[1])||[];list.push(m[2]);keys.set(m[1],list);}consume(line);continue;}
   keyMode=false;
  }
  const cells=tableCells(raw);
  if(cells?.length===2&&isQuestionHeader(cells[0])&&isAnswerHeader(cells[1])){finish();table=true;consume(line);continue;}
  if(cells&&cells.every(v=>/^:?-+:?$/.test(v))){if(table)consume(line);continue;}
  if(cells?.length===2&&(table||cells[0].endsWith('?'))){start(cells[0].replace(/^\d+[.)]\s*/,''),null,line);current.answerParts=[cells[1]];finish();continue;}
  if(!cells)table=false;
  const title=raw.match(sectionRE);
  if(title){finish();section=title[1];continue;}
  const explicit=raw.match(explicitQ),numbered=raw.match(numberedQ);
  // Look past a few wrapped lines to distinguish a numbered question from a syllabus heading.
  const following=lines.slice(i+1,i+6).filter(l=>l.raw);
  const lookahead=following.find(l=>option(l.raw)||answerRE.test(l.raw));
  const numberedIsQ=numbered&&(numbered[2].includes('?')||lookahead&&!following.slice(0,following.indexOf(lookahead)).some(l=>numberedQ.test(l.raw)||sectionRE.test(l.raw)));
  if(explicit||numberedIsQ){const m=explicit||numbered,parts=m[2].split(/\s*(?:→|=>)\s*/);start(parts[0],m[1],line);if(parts.length===2){current.answerParts=[parts[1]];finish();}continue;}
  const opt=option(raw);
  if(current&&opt){current.options.push(opt.text);current.optionLabels.push(opt.label);if(opt.marked)current.marked.push(current.options.length-1);current.sourceLines.add(line);consume(line);mode='option';continue;}
  const answer=raw.match(answerRE);
  if(current&&answer){current.answerParts.push(answer[1]);current.sourceLines.add(line);consume(line);mode='answer';continue;}
  const arrow=raw.match(/^(.{3,1500}?)\s*(?:→|=>)\s*(.{1,1500})$/u);
  if(arrow&&(arrow[1].endsWith('?')||/^(?:вопрос|сұрақ|question)/iu.test(arrow[1]))){start(arrow[1],null,line);current.answerParts=[arrow[2]];finish();continue;}
  if(raw.endsWith('?')){start(raw,null,line);continue;}
  if(!current)continue;
  if(gap&&mode!=='stem'){finish();gap=false;continue;}
  if(mode==='answer'){current.answerParts[current.answerParts.length-1]+=' '+raw;}
  else if(mode==='option'){current.options[current.options.length-1]+=' '+raw;}
  else if(mode==='stem'){current.text+=' '+raw;}
  else {finish();continue;}
  current.sourceLines.add(line);consume(line);
 }
 finish();
 const rawLines=text.split('\n'),numberCounts=new Map();
 for(const record of records)numberCounts.set(record.number,(numberCounts.get(record.number)||0)+1);
 for(const record of records){
  const explicitAnswers=[...record.answerParts,...(keys.get(record.number)||[])];
  record.correct=null;record.providedAnswer=record.answerParts.join('\n');
  if(!record.options.length){
   // A Q/A pair is useful even without three distractors. Never invent them.
   if(record.answerParts.length===1&&record.answerParts[0].trim()){record.options=[record.answerParts[0].trim()];record.correct=0;}
   else if(record.answerParts.length>1){record.issues.push('conflicting_keys');}
   else record.issues.push('missing_key');
  }else{
   const indices=new Set(record.marked);let bad=false;
   if(new Set(record.optionLabels).size!==record.optionLabels.length||(keys.has(record.number)&&numberCounts.get(record.number)>1)){record.issues.push('conflicting_keys');bad=true;}
   for(const answer of explicitAnswers){const resolved=resolveKey(answer,record);if(resolved.issue){record.issues.push(resolved.issue);bad=true;}else indices.add(resolved.index);}
   if(record.marked.length>1){record.issues.push('multiple_correct');bad=true;}
   if(indices.size>1){record.issues.push('conflicting_keys');bad=true;}
   if(!bad&&indices.size===1)record.correct=[...indices][0];
   if(record.correct===null&&!record.issues.length)record.issues.push('missing_key');
  }
  if(record.options.length>4)record.issues.push('extra_options');
  record.sourceExcerpt=[...record.sourceLines].map(n=>rawLines[n-1]).join('\n');
  record.answerKey=(keys.get(record.number)||[]).join('; ');
  record.sourceId='authored:'+record.sourceLine;
  record.sourceFormat=record.optionLabels.length?'test':'qa';
  delete record.sourceLines;delete record.marked;delete record.answerParts;delete record.optionLabels;
 }
 const numbers=new Set(records.map(r=>r.number));for(const n of keys.keys())if(!numbers.has(n))diagnostics.unmatchedKeys++;
 // Preserve original line numbers for source citations. Authored answers are not prose facts.
 const remainingText=rawLines.map((line,i)=>consumed.has(i+1)?'':line).join('\n');
 diagnostics.truncatedRecords=Math.max(0,records.length-180);
 return {records:records.slice(0,180),remainingText,diagnostics};
}

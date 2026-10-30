import { randomInt } from 'node:crypto';
import { SYLLABUS_BANK } from './syllabus-bank.js';
import { GameError } from './game-logic.js';

export const SYLLABUS_TEXT_LIMIT=120000;
const normalize=value=>String(value).normalize('NFC').toLocaleLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
const compact=value=>String(value).replace(/[\u00ad\u200b]/g,'').replace(/\s+/g,' ').trim();
const stop=new Set('тема темы тақырып тақырыбы лекция дәріс topic lecture неделя апта модуль module учебный дисциплина пән сабақ занятие семинар часы часов теория практика изучение основные общий жалпы введение курс раздел изучать содержание это является дегеніміз представляет собой үшін және туралы бойынша'.split(' '));
function tokens(text){return [...new Set((normalize(text).match(/[\p{L}]{3,}/gu)||[]).filter(w=>!stop.has(w)).map(w=>w.slice(0,6)))];}
function overlap(a,b){const right=new Set(tokens(b));return tokens(a).filter(w=>right.has(w)).length;}
const admin=/^(?:силлабус|пререквизит|постреквизит|контакт|оценивание|оценка|баллы|кредиты|литература|әдебиеттер|пәннің мақсаты|оқытушы|преподаватель|расписание|дедлайн|политика курса|learning outcomes|assessment|references|bibliography|syllabus)(?:\s|[:.—–-]|$)/iu;
const adminTerm=/^(?:тема|темы|лекция|лекции|тақырып|дәріс|неделя|апта|термин|определение|term|definition|мақсаты|сағат|силлабус|пререквизит|постреквизит|контакт|оценивание|оценка|баллы|балл|кредиты|кредит|преподаватель|оқытушы|литература|әдебиеттер|цель курса|задачи курса|всего часов|форма контроля)(?:\s|$)/iu;
const kkPattern=/[әғқңөұүһі]|дегеніміз|деп аталады|жылы/iu;
const langOf=text=>kkPattern.test(text)?'kk':/\p{Script=Cyrillic}/u.test(text)?'ru':'en';
const labels={ru:{definition:'Определение',purpose:'Назначение',cause:'Причина',year:'Дата',document:'Загруженный документ',basic:'Базовая',medium:'Средняя',review:'Проверьте черновик по приведённому фрагменту.',difficulty:'Оценка сложности по структуре вопроса, не по результатам студентов.'},kk:{definition:'Анықтама',purpose:'Қолданылуы',cause:'Себеп',year:'Мерзім',document:'Жүктелген құжат',basic:'Бастапқы',medium:'Орташа',review:'Жоба нұсқасын берілген үзіндімен салыстырып тексеріңіз.',difficulty:'Күрделілік студенттердің нәтижесімен емес, сұрақ құрылымымен бағаланды.'},en:{definition:'Definition',purpose:'Purpose',cause:'Cause',year:'Date',document:'Uploaded document',basic:'Basic',medium:'Intermediate',review:'Check the draft against the quoted passage.',difficulty:'Difficulty is a structural estimate, not a calibrated student measure.'}};

export function checkedText(text){
 if(typeof text!=='string'||text.trim().length<30||text.length>SYLLABUS_TEXT_LIMIT)throw new GameError(`Нужен текст силлабуса от 30 до ${SYLLABUS_TEXT_LIMIT} символов.`);
 return text.normalize('NFC').replace(/\u0000/g,'').replace(/\r/g,'').replace(/[\u00ad\u200b]/g,'');
}
function heading(raw){
 const line=raw.trim();
 const explicit=line.match(/^(?:(?:тема|тақырып|topic)(?:\s*[№#]?\s*\d+)?|(?:лекция|дәріс|lecture|глава|chapter|раздел)\s*[№#]?\s*\d+)\s*[.:)–—-]*\s*(.{3,190})$/iu);
 if(explicit)return compact(explicit[1]);
 if(/^#{1,4}\s+\S/.test(line))return compact(line.replace(/^#{1,4}\s+/,''));
 if(/^\d{1,2}[.)]\s+.{5,170}$/u.test(line)&&!/[—–=:]/u.test(line)&&!/[.!?]$/.test(line))return compact(line.replace(/^\d+[.)]\s*/,''));
 return null;
}
function unitsFrom(text){
 const lines=text.split('\n'),units=[];let section='',blocked=false;
 for(let i=0;i<lines.length&&units.length<3000;i++){
  const raw=lines[i].trim();if(!raw)continue;
  const title=heading(raw);
  if(title){section=title;blocked=admin.test(title);continue;}
  if(admin.test(raw)&&raw.length<150){if(/^(?:литература|әдебиеттер|references|bibliography|оценивание|assessment)[:\s]*$/iu.test(raw)){section=raw;blocked=true;}continue;}
  if(blocked||admin.test(raw)||/https?:\/\/|\bISBN\b|\bdoi:/iu.test(raw))continue;
  // Rejoin PDF-wrapped prose, but never consume a new fact, table or heading.
  let value=raw,end=i;
  while(end+1<lines.length&&value.length<700&&!/[.!?;]$/.test(value)){
   const next=lines[end+1].trim();
   if(!next||heading(next)||admin.test(next)||/[—–:|\t]/.test(next)||!/^\p{Ll}/u.test(next))break;
   value=value.replace(/(?<=\p{L})-$/u,'')+(value.endsWith('-')?'':' ')+next;end++;
  }
  const pieces=value.split(/(?<=[!?])\s+|(?<=\.)\s+(?=[А-ЯA-ZӘҒҚҢӨҰҮҺІ])/u);
  for(const piece of pieces){const excerpt=compact(piece);if(excerpt.length>=12&&excerpt.length<=1100)units.push({excerpt,section,line:i+1,endLine:end+1,tableCells:piece.includes('\t')?piece.split(/\t+/).map(compact):null});}
  i=end;
 }
 return units;
}
function termOK(term){return term.length>=2&&term.length<=100&&term.split(/\s+/).length<=10&&!adminTerm.test(term)&&!/[!?;]|\d{4}/u.test(term);}
function extractFacts(text){
 const facts=[],seen=new Set();
 function add(kind,term,answer,unit){
  term=compact(term).replace(/^[\s\d.)«"“]+|[»"”]+$/gu,'').trim();answer=compact(answer).replace(/[.;]$/u,'').trim();
  if(!termOK(term)||answer.length<10||answer.length>500)return;
  const key=kind+'|'+normalize(term)+'|'+normalize(answer);if(seen.has(key))return;seen.add(key);
  facts.push({...unit,kind,term,answer,definition:answer,language:langOf(unit.excerpt)});
 }
 for(const unit of unitsFrom(text)){
  const line=unit.excerpt;
  // Explicit definitions, glossary tables, and RU/KK/EN definitional verbs.
  let m=line.match(/^(.{2,100}?)\s+(?:[—–-]\s*(?:(?:это|бұл)\s+)?|(?:это|дегеніміз|is defined as|refers to|is)\s+)(.{10,500})$/iu);
  if(!m)m=line.match(/^(.{2,100}?)\s*:\s+(.{10,500})$/u);
  if(!m){const cells=unit.tableCells||line.replace(/^\||\|$/g,'').split(/\s*\|\s*/).map(compact);if(cells.length===2&&!/^-+$/.test(cells[1]))m=[line,cells[0],cells[1]];}
  if(m){let term=m[1].replace(/\s+(?:дегеніміз|деген|бұл)$/iu,'');add('definition',term,m[2],unit);}
  const relation=line.match(/^(.{2,100}?)\s+(используется для|применяется для|предназначен(?:а|о)? для|служит для|is used for|is designed for)\s+(.{10,500})$/iu);
  if(relation)add('purpose',relation[1],relation[3],unit);
  const kkPurpose=line.match(/^([\p{L}][\p{L}\p{N}-]{1,60})\s+(.{10,500}?)\s+үшін\s+(?:қолданылады|пайдаланылады)[.]?$/iu);
  if(kkPurpose)add('purpose',kkPurpose[1],kkPurpose[2],unit);
  const cause=line.match(/^(.{2,100}?)\s+(?:возникает|происходит)\s+(?:из-за|вследствие)\s+(.{10,500})$/iu);
  if(cause)add('cause',cause[1],cause[2],unit);
  const kkCause=line.match(/^([\p{L}][\p{L}\p{N}-]{1,60})\s+(.{10,500}?)\s+(?:салдарынан|себебінен)\s+пайда болады[.]?$/iu);
  if(kkCause)add('cause',kkCause[1],kkCause[2],unit);
  // Dates must be explicit years, not credits, page numbers or arbitrary digits.
  const years=[...line.matchAll(/(?<!\d)(1\d{3}|20\d{2})(?!\d)\s*(?:год(?:у|а|ом)?(?!\p{L})|г\.|жылы|жыл(?:ы|ғы)?|year\b)/giu)];
  if(years.length===1&&line.length>=35&&!admin.test(line)){
   const year=years[0][1],key='year|'+normalize(line);
   if(!seen.has(key)){seen.add(key);facts.push({...unit,kind:'year',term:line,answer:year,language:langOf(line)});}
  }
  if(facts.length>=180)break;
 }
 return facts;
}
export function definitionsFrom(text){return extractFacts(text).filter(f=>f.kind==='definition').map(f=>({...f,definition:f.answer}));}
export function analyzeSyllabus(input){
 const text=checkedText(input),facts=extractFacts(text),topics=[],seen=new Set();
 const add=title=>{title=compact(title);if(title.length<3||title.length>190||admin.test(title)||seen.has(normalize(title)))return;seen.add(normalize(title));topics.push(title);};
 for(const line of text.split('\n')){const title=heading(line);if(title)add(title);if(topics.length>=60)break;}
 if(!topics.length)for(const fact of facts){add(fact.kind==='year'?fact.section:fact.term);if(topics.length>=60)break;}
 return {topics,characters:text.length,definitions:facts.filter(f=>f.kind==='definition').length,facts:facts.length,types:Object.fromEntries(['definition','purpose','cause','year'].map(k=>[k,facts.filter(f=>f.kind===k).length])),note:facts.length?'Проверьте найденные темы и факты перед подготовкой вопросов.':'В документе не найдены подходящие учебные факты. Добавьте конспект или учебный текст: одного расписания и названий тем недостаточно.'};
}
function shuffled(question){const options=question.options.map((text,i)=>({text,correct:i===question.correct}));for(let i=options.length-1;i>0;i--){const j=randomInt(i+1);[options[i],options[j]]=[options[j],options[i]];}return {...question,options:options.map(o=>o.text),correct:options.findIndex(o=>o.correct)};}
function sameMeaning(a,b){const x=normalize(a).replace(/[\p{P}\p{S}]/gu,''),y=normalize(b).replace(/[\p{P}\p{S}]/gu,'');return x===y||Math.min(x.length,y.length)>12&&(x.includes(y)||y.includes(x));}
function selectedTopic(fact,topics){
 let best=null,score=0;
 for(const topic of topics){const n=normalize(topic),section=normalize(fact.section);const s=(section&&n===section?12:overlap(topic,fact.section)*3)+overlap(topic,fact.term+' '+fact.answer);if(s>score){best=topic;score=s;}}
 return best?{topic:best,score}:null;
}
function prompt(fact,reverse){
 const {language:l,term,answer,excerpt}=fact;
 if(fact.kind==='year'){const masked=excerpt.replace(new RegExp('(?<!\\d)'+answer+'(?!\\d)','u'),'_____');return l==='kk'?`Құжат бойынша бос орынға қай жыл сәйкес келеді: «${masked}»?`:l==='en'?`Which year completes the statement in the document: “${masked}”?`:`Какой год пропущен в утверждении из документа: «${masked}»?`;}
 if(fact.kind==='definition'){
  if(reverse)return l==='kk'?`Құжатта «${answer}» деп қай ұғым анықталған?`:l==='en'?`Which term does the document define as “${answer}”?`:`Какой термин в документе определяется так: «${answer}»?`;
  return l==='kk'?`Құжат бойынша «${term}» ұғымының анықтамасын таңдаңыз.`:l==='en'?`According to the document, what is the definition of “${term}”?`:`Какое определение «${term}» приведено в документе?`;
 }
 if(fact.kind==='purpose')return l==='kk'?`Құжат бойынша «${term}» не үшін қолданылады?`:l==='en'?`According to the document, what is “${term}” used for?`:`Для чего, согласно документу, используется «${term}»?`;
 return l==='kk'?`Құжатта «${term}» құбылысының қандай себебі көрсетілген?`:l==='en'?`Which cause does the document give for “${term}”?`:`Какую причину явления «${term}» указывает документ?`;
}
export function generateSyllabusQuestions(input,topics,count,options={}){
 const text=checkedText(input);
 if(!Array.isArray(topics)||topics.length<1||topics.length>60||!topics.every(t=>typeof t==='string'&&t.trim().length>=2&&t.length<=200))throw new GameError('Выберите от 1 до 60 тем (до 200 символов каждая).');
 if(!Number.isSafeInteger(count)||count<1||count>60)throw new GameError('Количество черновиков: от 1 до 60.');
 if(!options||typeof options!=='object'||Array.isArray(options)||options.includeBank!==undefined&&typeof options.includeBank!=='boolean')throw new GameError('Проверьте настройку учебного банка.');
 const all=extractFacts(text),facts=all.map(f=>({...f,selection:selectedTopic(f,topics)})).filter(f=>f.selection),pool=[],seen=new Set();let skipped=0;
 const add=(question,priority)=>{const key=normalize(question.text);if(seen.has(key))return;seen.add(key);pool.push({...question,priority});};
 for(const [index,fact]of facts.entries()){
  const c=labels[fact.language];let reverse=fact.kind==='definition'&&index%2===0;
  let picked=null;
  for(let attempt=0;attempt<(fact.kind==='definition'?2:1);attempt++){
   const correct=reverse?fact.term:fact.answer;
   // Exact duplicate definitions can describe aliases: never ask to distinguish them.
   if(reverse&&(normalize(fact.answer).includes(normalize(fact.term))||all.some(f=>f.kind===fact.kind&&!sameMeaning(f.term,fact.term)&&sameMeaning(f.answer,fact.answer)))){reverse=false;continue;}
   const candidates=facts.filter(f=>f!==fact&&f.kind===fact.kind&&f.language===fact.language&&!sameMeaning(f.answer,fact.answer)&&!sameMeaning(f.term,fact.term))
    .map(f=>({text:reverse?f.term:f.answer,score:(f.section===fact.section?6:0)+overlap(fact.term+' '+fact.answer,f.term+' '+f.answer)})).sort((a,b)=>b.score-a.score||a.text.localeCompare(b.text));
   const wrong=[];
   for(const candidate of candidates){if(sameMeaning(correct,candidate.text)||wrong.some(w=>sameMeaning(w,candidate.text)))continue;wrong.push(candidate.text);if(wrong.length===3)break;}
   if(wrong.length===3){picked={correct,wrong};break;}reverse=!reverse;
  }
  if(!picked){skipped++;continue;}
  const difficulty=fact.kind==='year'||reverse?'basic':'medium';
  add({text:prompt(fact,reverse),options:[picked.correct,...picked.wrong],correct:0,points:25,topic:fact.selection.topic,type:fact.kind,difficulty,difficultyLabel:c[difficulty],language:fact.language,sourceKind:'document',source:`${c.document} · ${c[fact.kind]} · ${fact.line}${fact.endLine>fact.line?'–'+fact.endLine:''}`,sourceExcerpt:fact.excerpt,sourceLine:fact.line,explanation:`${c.review} ${c.difficulty}`},100+fact.selection.score);
 }
 if(options.includeBank===true){
  for(const item of SYLLABUS_BANK){
   // Bank supplements are opt-in and need a specific topical match. A generic
   // word such as "culture" must not match every discipline or every bank row.
   const ranked=topics.map(topic=>({topic,score:overlap(topic,item.topic+' '+item.tags),exact:normalize(topic)===normalize(item.topic)})).sort((a,b)=>b.score-a.score);
   if(ranked[0].exact||ranked[0].score>=2)add({...item,topic:ranked[0].topic,sourceKind:'bank',language:'ru',difficulty:'basic',difficultyLabel:labels.ru.basic,type:'bank'},ranked[0].score);
  }
 }
 pool.sort((a,b)=>b.priority-a.priority);const available=pool.length,chosen=[],used=new Map();
 while(pool.length&&chosen.length<count){
  const documentPool=pool.some(q=>q.sourceKind==='document'),eligible=pool.filter(q=>!documentPool||q.sourceKind==='document');
  const min=Math.min(...eligible.map(q=>used.get(q.topic)||0)),next=eligible.find(q=>(used.get(q.topic)||0)===min),i=pool.indexOf(next);
  const [{priority,...question}]=pool.splice(i,1);chosen.push(shuffled(question));used.set(question.topic,(used.get(question.topic)||0)+1);
 }
 const fromDocument=chosen.filter(q=>q.sourceKind==='document').length;
 return {questions:chosen,requested:count,available,fromDocument,fromBank:chosen.length-fromDocument,skipped,algorithmVersion:2,note:chosen.length?`Получено ${chosen.length} черновиков. Проверьте формулировки и ответы по источникам.${chosen.length<count?' Материала или различных вариантов ответа недостаточно; количество не дополнялось вымышленными фактами.':''}`:'По выбранным темам нет подходящих фактов с четырьмя различными вариантами ответа. Добавьте учебный текст с определениями, датами, назначениями или причинами. Готовый банк культурологии подключается отдельно.'};
}

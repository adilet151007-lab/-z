import { randomInt } from 'node:crypto';
import { SYLLABUS_BANK } from './syllabus-bank.js';
import { GameError } from './game-logic.js';
import { parseAuthoredQuestions } from './syllabus-import.js';
import { assessDraft } from './syllabus-draft.js';

export const SYLLABUS_TEXT_LIMIT=120000;
const normalize=value=>String(value).normalize('NFC').toLocaleLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
const compact=value=>String(value).replace(/[\u00ad\u200b]/g,'').replace(/\s+/g,' ').trim();
const stop=new Set('тема темы тақырып тақырыбы лекция дәріс topic lecture неделя апта модуль module учебный дисциплина пән сабақ занятие семинар часы часов теория практика изучение основные общий жалпы введение курс раздел изучать содержание это является дегеніміз представляет собой үшін және туралы бойынша'.split(' '));
function tokens(text){return [...new Set((normalize(text).match(/[\p{L}]{3,}/gu)||[]).filter(w=>!stop.has(w)).map(w=>w.slice(0,6)))];}
function overlapTokens(a,b){let score=0;for(const word of a)if(b.has(word))score++;return score;}
const meaningKey=value=>normalize(value).replace(/[\p{P}\p{S}]/gu,'');
const similarKeys=(a,b)=>a===b||Math.min(a.length,b.length)>12&&(a.includes(b)||b.includes(a));
const admin=/^(?:силлабус|пререквизит|постреквизит|контакт|оценивание|оценка|баллы|кредиты|литература|әдебиеттер|пәннің мақсаты|оқытушы|преподаватель|расписание|дедлайн|политика курса|learning outcomes|assessment|references|bibliography|syllabus)(?:\s|[:.—–-]|$)/iu;
const adminTerm=/^(?:тема|темы|лекция|лекции|тақырып|дәріс|неделя|апта|термин|определение|term|definition|мақсаты|сағат|силлабус|пререквизит|постреквизит|контакт|оценивание|оценка|баллы|балл|кредиты|кредит|преподаватель|оқытушы|литература|әдебиеттер|цель курса|задачи курса|всего часов|форма контроля)(?:\s|$)/iu;
const kkPattern=/[әғқңөұүһі]|дегеніміз|деп аталады|жылы/iu;
const langOf=text=>kkPattern.test(text)?'kk':/\p{Script=Cyrillic}/u.test(text)?'ru':'en';
const labels={ru:{definition:'Определение',purpose:'Назначение',cause:'Причина',year:'Дата',list:'Перечень',document:'Загруженный документ',basic:'Базовая',medium:'Средняя',review:'Проверьте черновик по приведённому фрагменту.',difficulty:'Оценка сложности по структуре вопроса, не по результатам студентов.'},kk:{definition:'Анықтама',purpose:'Қолданылуы',cause:'Себеп',year:'Мерзім',list:'Тізім',document:'Жүктелген құжат',basic:'Бастапқы',medium:'Орташа',review:'Жоба нұсқасын берілген үзіндімен салыстырып тексеріңіз.',difficulty:'Күрделілік студенттердің нәтижесімен емес, сұрақ құрылымымен бағаланды.'},en:{definition:'Definition',purpose:'Purpose',cause:'Cause',year:'Date',list:'List',document:'Uploaded document',basic:'Basic',medium:'Intermediate',review:'Check the draft against the quoted passage.',difficulty:'Difficulty is a structural estimate, not a calibrated student measure.'}};

export function checkedText(text){
 if(typeof text!=='string'||text.trim().length<30||text.length>SYLLABUS_TEXT_LIMIT)throw new GameError(`Нужен текст документа от 30 до ${SYLLABUS_TEXT_LIMIT} символов.`);
 return text.normalize('NFC').replace(/\u0000/g,'').replace(/\r/g,'').replace(/[\u00ad\u200b]/g,'');
}
function heading(raw){
 const line=raw.trim();
 const explicit=line.match(/^(?:(?:тема|тақырып|topic)(?!\p{L})(?:\s*[№#]?\s*\d+)?|(?:лекция|дәріс|lecture|глава|chapter|раздел)\s*[№#]?\s*\d+)\s*[.:)–—-]*\s*(.{3,190})$/iu);
 if(explicit)return compact(explicit[1]);
 if(/^#{1,4}\s+\S/.test(line))return compact(line.replace(/^#{1,4}\s+/,''));
 if(/^\d{1,2}[.)]\s+.{5,170}$/u.test(line)&&!/[—–=:]/u.test(line)&&!/[.!?]$/.test(line))return compact(line.replace(/^\d+[.)]\s*/,''));
 return null;
}
function unitsFrom(text,diagnostics={}){
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
  for(const piece of pieces){const excerpt=compact(piece);if(excerpt.length>=12&&excerpt.length<=2000)units.push({excerpt,section,line:i+1,endLine:end+1,sourceId:`prose:${i+1}:${units.length}`,tableCells:piece.includes('\t')?piece.split(/\t+/).map(compact):null});else if(excerpt.length>2000)diagnostics.oversizeUnits=(diagnostics.oversizeUnits||0)+1;}
  i=end;
 }
 return units;
}
function termOK(term){return term.length>=2&&term.length<=100&&term.split(/\s+/).length<=10&&!adminTerm.test(term)&&!/[!?;]|\d{4}/u.test(term);}
const enumeration=/\b(?:includes|consists of)\b|относятся|включает|включают|состоит|следующ|перечисл|түрлері|жатады|кіреді/iu;
function extractFacts(text,diagnostics={}){
 const facts=[],seen=new Set(),recognizedSources=new Set(),units=unitsFrom(text,diagnostics);diagnostics.unrecognizedUnits=0;diagnostics.samples=[];
 function add(kind,term,answer,unit,issues=[]){
  term=compact(term).replace(/^[\s\d.)«"“]+|[»"”]+$/gu,'').trim();answer=compact(answer).replace(/[.;]$/u,'').trim();
  if(kind!=='year'&&(!termOK(term)||answer.length<5||answer.length>1800))return;
  recognizedSources.add(unit.sourceId);
  const factKey=kind+'|'+normalize(term)+'|'+normalize(answer);if(seen.has(factKey))return;seen.add(factKey);
  facts.push({...unit,kind,term,answer,definition:answer,language:langOf(unit.excerpt),issues});
 }
 for(const unit of units){
  const line=unit.excerpt;
  let m=line.match(/^Под\s+[«"“]?(.{2,90}?)[»"”]?\s+(?:понимают|понимается)\s+(.{5,1800})$/iu)
   ||line.match(/^(?:Термин|Понятие)\s+[«"“]?(.{2,90}?)[»"”]?\s+(?:означает|обозначает)\s+(.{5,1800})$/iu)
   ||line.match(/^(.{2,100}?)\s+(?:[—–-]\s*(?:(?:это|бұл)\s+)?|(?:это|дегеніміз|представляет собой|называется|is defined as|refers to|is)\s+)(.{5,1800})$/iu);
  if(m)add('definition',m[1].replace(/\s+(?:дегеніміз|деген|бұл)$/iu,''),m[2],unit);
  const colon=line.match(/^(.{2,100}?)\s*:\s+(.{5,1800})$/u);
  if(!m&&colon){
   if(enumeration.test(colon[1]))add('list',colon[1],colon[2],unit);
   else if(colon[1].split(/\s+/).length<=5&&!/^(?:к |в |на |при |если |когда |почему |как |задание|пример|например)/iu.test(colon[1]))add('definition',colon[1],colon[2],unit);
  }
  if(!m&&!colon){const cells=unit.tableCells||line.replace(/^\||\|$/g,'').split(/\s*\|\s*/).map(compact);if(cells.length===2&&!/^-+$/.test(cells[1]))add('definition',cells[0],cells[1],unit);}
  const relation=line.match(/^(.{2,100}?)\s+(?:используется для|применяется для|предназначен(?:а|о)? для|служит для|is used for|is designed for)\s+(.{5,1800})$/iu);
  if(relation)add('purpose',relation[1],relation[2],unit);
  const kkPurpose=line.match(/^([\p{L}][\p{L}\p{N}-]{1,60})\s+(.{5,1800}?)\s+үшін\s+(?:қолданылады|пайдаланылады)[.]?$/iu);
  if(kkPurpose)add('purpose',kkPurpose[1],kkPurpose[2],unit);
  const cause=line.match(/^(.{2,100}?)\s+(?:возникает|происходит)\s+(?:из-за|вследствие)\s+(.{5,1800})$/iu);
  if(cause)add('cause',cause[1],cause[2],unit);
  const kkCause=line.match(/^([\p{L}][\p{L}\p{N}-]{1,60})\s+(.{5,1800}?)\s+(?:салдарынан|себебінен)\s+пайда болады[.]?$/iu);
  if(kkCause)add('cause',kkCause[1],kkCause[2],unit);
  const years=[...line.matchAll(/(?<!\d)(1\d{3}|20\d{2})(?!\d)\s*(?:год(?:у|а|ом)?(?!\p{L})|г\.|жылы|жыл(?:ы|ғы)?|year\b)/giu)];
  for(const year of years)add('year',line,year[1],unit,years.length>1?['partial_years']:[]);
  if(!recognizedSources.has(unit.sourceId)&&!seen.has('unit|'+normalize(line))){seen.add('unit|'+normalize(line));diagnostics.unrecognizedUnits++;if(diagnostics.samples.length<5)diagnostics.samples.push({line:unit.line,text:line.slice(0,220)});}
  if(facts.length>=180){diagnostics.factLimitReached=true;break;}
 }
 return facts.slice(0,180);
}
export function definitionsFrom(text){return extractFacts(text).filter(f=>f.kind==='definition').map(f=>({...f,definition:f.answer}));}
const IMPORT_TOPIC='Вопросы из документа';
function readDocument(text){
 const parsed=parseAuthoredQuestions(text),diagnostics={...parsed.diagnostics},facts=extractFacts(parsed.remainingText,diagnostics);
 const documentType=parsed.records.length?(facts.length?'mixed':parsed.records.some(r=>r.sourceFormat==='test')?'test':'qa'):'prose';
 return {...parsed,facts,diagnostics,documentType};
}
export function analyzeSyllabus(input){
 const text=checkedText(input),doc=readDocument(text),topics=[],seen=new Set();
 const add=title=>{title=compact(title);if(title.length<3||title.length>190||admin.test(title)||seen.has(normalize(title))||topics.length>=60)return;seen.add(normalize(title));topics.push(title);};
 for(const record of doc.records)add(record.section||IMPORT_TOPIC);
 for(const line of doc.remainingText.split('\n')){const title=heading(line);if(title)add(title);}
 if(!topics.length)for(const fact of doc.facts)add(fact.kind==='year'?(fact.section||'Даты из документа'):fact.term);
 return {topics,characters:text.length,definitions:doc.facts.filter(f=>f.kind==='definition').length,facts:doc.facts.length,authored:doc.records.length,documentType:doc.documentType,diagnostics:doc.diagnostics,
  types:Object.fromEntries(['definition','purpose','cause','year','list'].map(k=>[k,doc.facts.filter(f=>f.kind===k).length])),
  note:doc.records.length?'Найдены авторские вопросы. Формулировки и явно указанные ответы будут сохранены.':doc.facts.length?'Проверьте найденные темы и факты перед подготовкой вопросов.':'Нет распознанных вопросов или явных учебных фактов. Добавьте конспект или готовые вопросы с ответами; произвольный текст алгоритм пока понимает ограниченно.'};
}
function shuffled(question){const options=question.options.map((text,i)=>({text,correct:i===question.correct}));for(let i=options.length-1;i>0;i--){const j=randomInt(i+1);[options[i],options[j]]=[options[j],options[i]];}return {...question,options:options.map(o=>o.text),correct:options.findIndex(o=>o.correct)};}
function prepare(fact){return {...fact,termKey:meaningKey(fact.term),answerKey:meaningKey(fact.answer),tokenSet:new Set(tokens(fact.term+' '+fact.answer)),sectionKey:normalize(fact.section),sectionTokens:new Set(tokens(fact.section))};}
function selectedTopic(fact,topics){
 let best=null,score=0;
 for(const topic of topics){const s=(fact.sectionKey&&topic.key===fact.sectionKey?12:overlapTokens(topic.tokenSet,fact.sectionTokens)*3)+overlapTokens(topic.tokenSet,fact.tokenSet)+(fact.kind==='year'&&!fact.section&&topic.text==='Даты из документа'?12:0);if(s>score){best=topic.text;score=s;}}
 return best?{topic:best,score}:null;
}
function prompt(fact,reverse){
 const {language:l,term,answer,excerpt}=fact;
 if(fact.kind==='year'){const masked=excerpt.replace(new RegExp('(?<!\\d)'+answer+'(?!\\d)','u'),'_____');return l==='kk'?`Құжат бойынша бос орынға қай жыл сәйкес келеді: «${masked}»?`:l==='en'?`Which year completes the statement in the document: “${masked}”?`:`Какой год пропущен в утверждении из документа: «${masked}»?`;}
 if(fact.kind==='definition'){
  if(reverse)return l==='kk'?`Құжатта «${answer}» деп қай ұғым анықталған?`:l==='en'?`Which term does the document define as “${answer}”?`:`Какой термин в документе определяется так: «${answer}»?`;
  return l==='kk'?`Құжат бойынша «${term}» ұғымының анықтамасын таңдаңыз.`:l==='en'?`According to the document, what is the definition of “${term}”?`:`Какое определение «${term}» приведено в документе?`;
 }
 if(fact.kind==='list')return l==='kk'?`Құжаттағы «${term}» тізімін таңдаңыз.`:l==='en'?`Which list follows “${term}” in the document?`:`Какой перечень приведён после слов «${term}»?`;
 if(fact.kind==='purpose')return l==='kk'?`Құжат бойынша «${term}» не үшін қолданылады?`:l==='en'?`According to the document, what is “${term}” used for?`:`Для чего, согласно документу, используется «${term}»?`;
 return l==='kk'?`Құжатта «${term}» құбылысының қандай себебі көрсетілген?`:l==='en'?`Which cause does the document give for “${term}”?`:`Какую причину явления «${term}» указывает документ?`;
}
export function generateSyllabusQuestions(input,topics,count,options={}){
 const text=checkedText(input);
 if(!Array.isArray(topics)||topics.length<1||topics.length>60||!topics.every(t=>typeof t==='string'&&t.trim().length>=2&&t.length<=200))throw new GameError('Выберите от 1 до 60 тем (до 200 символов каждая).');
 if(!Number.isSafeInteger(count)||count<1||count>60)throw new GameError('Количество черновиков: от 1 до 60.');
 if(!options||typeof options!=='object'||Array.isArray(options)||options.includeBank!==undefined&&typeof options.includeBank!=='boolean')throw new GameError('Проверьте настройку учебного банка.');
 const doc=readDocument(text),topicIndex=topics.map(text=>({text,key:normalize(text),tokenSet:new Set(tokens(text))}));
 // Normalize once per request; candidate comparisons use cached keys and token sets.
 const all=doc.facts.map(prepare),facts=all.map(f=>({...f,selection:selectedTopic(f,topicIndex)})).filter(f=>f.selection),groups=new Map(),aliases=new Map();
 for(const fact of all){const alias=aliases.get(fact.answerKey)||new Set();alias.add(fact.termKey);aliases.set(fact.answerKey,alias);}
 for(const fact of facts){const k=fact.kind+'|'+fact.language;const bucket=groups.get(k)||[];bucket.push(fact);groups.set(k,bucket);}
 const pool=[],seen=new Set(),sourceUsed=new Set(),diagnostics={...doc.diagnostics,duplicateQuestions:0,suppressedSameSource:0,sparseDrafts:0,outsideTopics:all.length-facts.length};
 const add=(question,priority)=>{
  const k=normalize(question.text);if(seen.has(k)){diagnostics.duplicateQuestions++;return;}seen.add(k);
  while(question.options.length<4)question.options.push('');
  const state=assessDraft(question);pool.push({...question,...state,priority});
 };
 for(const record of doc.records){
  const topic=record.section||IMPORT_TOPIC;
  if(!topicIndex.some(t=>t.key===normalize(topic))){diagnostics.outsideTopics++;continue;}
  const {text,options,correct,issues,sourceExcerpt,sourceLine,sourceId,sourceFormat,providedAnswer,answerKey}=record;
  add({text,options:[...options],correct,issues,sourceExcerpt,sourceLine,sourceId,sourceFormat,providedAnswer,answerKey,
   points:25,topic,type:'authored',language:langOf(text),sourceKind:'document',source:`Загруженный документ · авторский вопрос · ${sourceLine}`,
   requiresReview:issues.some(i=>i!=='missing_key'),explanation:'Авторский вопрос: проверьте формулировку и указанный ответ. Порядок вариантов сохранён.'},1000);
 }
 for(const [index,fact]of facts.entries()){
  if(sourceUsed.has(fact.sourceId)){diagnostics.suppressedSameSource++;continue;}
  sourceUsed.add(fact.sourceId);
  const bucket=groups.get(fact.kind+'|'+fact.language)||[],c=labels[fact.language];
  const hasAlias=(aliases.get(fact.answerKey)?.size||0)>1||bucket.some(f=>f!==fact&&!similarKeys(f.termKey,fact.termKey)&&similarKeys(f.answerKey,fact.answerKey));
  const reverseAllowed=fact.kind==='definition'&&fact.answer.length<=150&&!fact.answerKey.includes(fact.termKey)&&!hasAlias;
  const variants=reverseAllowed?[index%2===0,index%2!==0]:[false];let picked=null;
  for(const reverse of variants){
   const correct=reverse?fact.term:fact.answer,correctKey=reverse?fact.termKey:fact.answerKey;
   const candidates=bucket.filter(f=>f!==fact&&f.sourceId!==fact.sourceId&&!similarKeys(f.answerKey,fact.answerKey)&&!similarKeys(f.termKey,fact.termKey))
    .map(f=>({text:reverse?f.term:f.answer,key:reverse?f.termKey:f.answerKey,score:(f.sectionKey===fact.sectionKey?6:0)+overlapTokens(fact.tokenSet,f.tokenSet)})).sort((a,b)=>b.score-a.score||a.text.localeCompare(b.text));
   const wrong=[];
   for(const candidate of candidates){if(similarKeys(correctKey,candidate.key)||wrong.some(w=>similarKeys(w.key,candidate.key)))continue;wrong.push(candidate);if(wrong.length===3)break;}
   const candidate={reverse,correct,wrong:wrong.map(w=>w.text)};
   if(!picked||candidate.wrong.length>picked.wrong.length)picked=candidate;
   if(wrong.length===3)break;
  }
  const difficulty=fact.kind==='year'||picked.reverse?'basic':'medium',issues=[...fact.issues];
  if(picked.wrong.length<3){issues.push('sparse_options');diagnostics.sparseDrafts++;}
  let question={text:prompt(fact,picked.reverse),options:[picked.correct,...picked.wrong],correct:0,points:25,topic:fact.selection.topic,type:fact.kind,difficulty,difficultyLabel:c[difficulty],language:fact.language,
   sourceKind:'document',sourceId:fact.sourceId,source:`${c.document} · ${c[fact.kind]} · ${fact.line}${fact.endLine>fact.line?'–'+fact.endLine:''}`,sourceExcerpt:fact.excerpt,sourceLine:fact.line,
   issues,requiresReview:issues.includes('partial_years'),explanation:`${c.review} ${c.difficulty}`};
  // Only complete generated choices are shuffled. Authored option order never changes.
  if(question.options.length===4)question=shuffled(question);
  add(question,100+fact.selection.score);
 }
 if(options.includeBank===true)for(const item of SYLLABUS_BANK){
  const tokenSet=new Set(tokens(item.topic+' '+item.tags)),ranked=topicIndex.map(topic=>({topic:topic.text,score:overlapTokens(topic.tokenSet,tokenSet),exact:topic.key===normalize(item.topic)})).sort((a,b)=>b.score-a.score);
  if(ranked[0].exact||ranked[0].score>=2)add(shuffled({...item,options:[...item.options],topic:ranked[0].topic,sourceKind:'bank',language:'ru',difficulty:'basic',difficultyLabel:labels.ru.basic,type:'bank'}),ranked[0].score);
 }
 pool.sort((a,b)=>b.priority-a.priority);const available=pool.length,chosen=[],used=new Map();
 while(pool.length&&chosen.length<count){
  const authored=pool.some(q=>q.type==='authored'),documentPool=pool.some(q=>q.sourceKind==='document'),eligible=pool.filter(q=>authored?q.type==='authored':!documentPool||q.sourceKind==='document');
  const min=Math.min(...eligible.map(q=>used.get(q.topic)||0)),next=eligible.find(q=>(used.get(q.topic)||0)===min),i=pool.indexOf(next);
  const [{priority,...question}]=pool.splice(i,1);chosen.push(question);used.set(question.topic,(used.get(question.topic)||0)+1);
 }
 const questions=chosen.filter(q=>q.ready),fromDocument=questions.filter(q=>q.sourceKind==='document').length;
 const incompleteCount=chosen.length-questions.length;
 return {questions,drafts:chosen,requested:count,available,remaining:available-chosen.length,fromDocument,fromBank:questions.length-fromDocument,draftCount:chosen.length,incompleteCount,
  diagnostics,skipped:diagnostics.outsideTopics+diagnostics.suppressedSameSource,algorithmVersion:3,documentType:doc.documentType,
  note:chosen.length?`Черновиков: ${chosen.length}. Готовы к добавлению: ${questions.length}; требуют дополнения или проверки: ${incompleteCount}. Проверьте ответы по источнику.`:'По выбранным темам нет подходящих распознанных фактов или готовых вопросов. Добавьте учебный текст или вопросы с ответами. Учебный банк подключается отдельно.'};
}

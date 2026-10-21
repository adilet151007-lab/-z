import { randomInt } from "node:crypto";
import { SYLLABUS_BANK } from "./syllabus-bank.js";
import { GameError } from "./game-logic.js";

export const SYLLABUS_TEXT_LIMIT = 120000;
const stop = new Set("тема темы тақырып тақырыбы лекция дәріс topic lecture неделя апта модуль module учебный дисциплина пән сабақ занятие семинар часы часов теория практика изучение основные общий жалпы введение курс раздел изучать содержание".split(" "));
const normalized = value => String(value).normalize("NFC").toLocaleLowerCase().replace(/ё/g,"е");
function tokens(text) { return [...new Set((normalized(text).match(/[\p{L}]{4,}/gu)||[]).map(t=>t.slice(0,6)).filter(t=>!stop.has(t)))]; }
const overlap = (a,b) => { const right = new Set(tokens(b)); return tokens(a).reduce((sum,word)=>sum+(right.has(word)?1:0),0); };
export function checkedText(text) {
  if(typeof text!=="string" || text.trim().length<30 || text.length>SYLLABUS_TEXT_LIMIT) throw new GameError(`Нужен текст силлабуса от 30 до ${SYLLABUS_TEXT_LIMIT} символов.`);
  return text.normalize("NFC").replace(/\u0000/g,"").replace(/\r/g,"");
}
export function definitionsFrom(text) {
  const result=[],seen=new Set();
  for(const line of text.split(/\n|(?<=[.!?])\s+/u)) {
    const m=line.trim().match(/^[\d.\s]*[«"“]?([\p{L}][\p{L}\p{N}\s()«»"-]{1,75})[»"”]?\s+[—–-]\s+(?:(?:это|бұл)\s+)?(.{15,550})$/u);
    if(!m)continue;
    const term=m[1].trim().replace(/[«»"]/g,""),definition=m[2].trim();
    if(term.split(/\s+/).length>8||/^(тема|лекци|тақырып|дәріс|недел|апта|силлабус|пререквиз|постреквиз|контакт|оцен|балл|кредит|s[ro]p)/iu.test(term)||seen.has(normalized(term)))continue;
    seen.add(normalized(term));result.push({term,definition,excerpt:`${term} — ${definition}`});
    if(result.length>=120)break;
  }
  return result;
}
export function analyzeSyllabus(input) {
  const text=checkedText(input),titles=[],seen=new Set();
  function add(title){
    title=title.replace(/^[\s\d№.:;|–—-]+/u,"").replace(/\s+[|\t].*$/u,"").replace(/\s+/g," ").trim();
    if(title.length<5||title.length>190||/^(цель|задачи|контакты|оценивание|пәннің мақсаты|литература|әдебиеттер|пререквизит|постреквизит)/iu.test(title)||seen.has(normalized(title)))return;
    seen.add(normalized(title));titles.push(title);
  }
  for(const raw of text.split("\n")) {
    const line=raw.trim();
    const explicit=line.match(/^(?:(?:тема|тақырып|topic)(?:\s*[№#]?\s*\d+)?|(?:лекция|дәріс|lecture)\s*[№#]?\s*\d+)\s*[.:)–—-]*\s*(.+)$/iu);
    if(explicit)add(explicit[1]);
    else if(/^\d{1,2}[.)]\s+.{5,170}$/u.test(line))add(line.replace(/^\d+[.)]\s*/,""));
    if(titles.length>=60)break;
  }
  if(!titles.length) {
    for(const item of SYLLABUS_BANK)if(overlap(item.tags,text)>=2)add(item.topic);
    if(!titles.length)for(const fact of definitionsFrom(text))add(fact.term);
  }
  const facts=definitionsFrom(text);
  return {topics:titles.slice(0,60),characters:text.length,definitions:facts.length,note:titles.length?"Проверьте найденные темы: можно удалить лишние и добавить свои.":"Не удалось выделить заголовки. Введите темы вручную или загрузите текстовый документ."};
}
function shuffled(question) {
  const options=question.options.map((text,i)=>({text,correct:i===question.correct}));
  for(let i=options.length-1;i>0;i--){const j=randomInt(i+1);[options[i],options[j]]=[options[j],options[i]];}
  return {...question,options:options.map(o=>o.text),correct:options.findIndex(o=>o.correct)};
}
export function generateSyllabusQuestions(input, topics, count) {
  const text=checkedText(input);
  if(!Array.isArray(topics)||topics.length<1||topics.length>60||!topics.every(t=>typeof t==="string"&&t.trim().length>=2&&t.length<=200))throw new GameError("Выберите от 1 до 60 тем (до 200 символов каждая).");
  if(!Number.isSafeInteger(count)||count<1||count>60)throw new GameError("Количество черновиков: от 1 до 60.");
  const facts=definitionsFrom(text),pool=[],seen=new Set();
  function add(question,score){const key=normalized(question.text);if(seen.has(key))return;seen.add(key);pool.push({...question,score});}
  for(const fact of facts) {
    const best=[...topics].sort((a,b)=>overlap(b,fact.excerpt)-overlap(a,fact.excerpt))[0];
    if(!overlap(best,fact.excerpt))continue;
    const distractors=[...new Set([...facts.map(f=>f.term),"Ритуал","Культурная идентичность","Аккультурация","Семиотика","Традиция","Социализация"])].filter(t=>normalized(t)!==normalized(fact.term));
    const picked=[];for(const term of distractors)if(!picked.some(t=>normalized(t)===normalized(term))){picked.push(term);if(picked.length===3)break;}
    if(picked.length<3)continue;
    add({text:`Какой термин в документе определяется так: «${fact.definition.slice(0,500)}»?`,options:[fact.term,...picked],correct:0,points:25,topic:best,source:"Определение из загруженного документа",sourceExcerpt:fact.excerpt.slice(0,1200),explanation:`В документе это определение относится к термину «${fact.term}».`},100+overlap(best,fact.excerpt));
  }
  for(const item of SYLLABUS_BANK){
    const ranked=topics.map(topic=>({topic,score:overlap(topic,item.topic+" "+item.tags)})).sort((a,b)=>b.score-a.score);
    if(ranked[0].score>0)add({...item,topic:ranked[0].topic},ranked[0].score);
  }
  pool.sort((a,b)=>b.score-a.score);
  const chosen=[],used=new Map();
  while(pool.length&&chosen.length<count){
    const min=Math.min(...pool.map(q=>used.get(q.topic)||0)),index=pool.findIndex(q=>(used.get(q.topic)||0)===min);
    const [{score,...question}]=pool.splice(index,1);chosen.push(shuffled(question));used.set(question.topic,(used.get(question.topic)||0)+1);
  }
  return {questions:chosen,requested:count,available:chosen.length+pool.length,fromDocument:chosen.filter(q=>q.sourceExcerpt).length,note:chosen.length?`Получено ${chosen.length} черновиков. Проверьте ответы и формулировки перед добавлением. ${chosen.length<count?"Подходящих материалов недостаточно для запрошенного количества; вымышленные факты не добавлялись.":""}`:"По выбранным темам нет подходящих фактов или вопросов. Добавьте учебный текст с определениями либо создайте вопросы вручную."};
}

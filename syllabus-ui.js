import {readSyllabusFile as readDocumentFile} from './syllabus-files.js';
import {t as uiText,tx as uiTpl,getLocale} from './ui-preferences.js';
import { escapeHTML as h } from "./shared-engine.js";
import {assessDraft,DRAFT_MESSAGES} from './syllabus-draft.js';
const LIMIT=120000,MAX_FILE=10*1024*1024;
export const readSyllabusFile=(file,onProgress)=>readDocumentFile(file,onProgress,{uiText,uiTpl});
export function setupSyllabus(engine,message){
 const $=id=>document.getElementById(id);let busy=false,drafts=[];
 $("syllabus-panel").innerHTML=uiTpl`<p class="mut small-note">Без платных API: импорт готовых тестов и пар «вопрос — ответ», черновики из учебного текста. Неполные вопросы можно дополнить. Проверьте ответы перед добавлением в игру.</p><label class="file-drop section-gap" for="syllabus-file"><strong>Загрузить силлабус, конспект или готовый тест</strong><span>PDF, DOCX или TXT · до 10 МБ</span><input id="syllabus-file" type="file" accept=".pdf,.docx,.txt"></label><details class="section-gap"><summary>Посмотреть или вставить текст</summary><textarea id="syllabus-text" rows="8" maxlength="120000" aria-label="Текст силлабуса" placeholder="Вставьте учебный текст или вопросы с вариантами и отметкой правильного ответа"></textarea></details><div class="row section-gap"><button id="syllabus-analyze" class="pri">Найти темы</button><span id="syllabus-size" class="mut"></span></div><p id="syllabus-message" class="small-note mut" role="status" aria-live="polite"></p><div id="syllabus-diagnostics" class="small-note mut"></div><div id="syllabus-topics" class="topic-options"></div><label class="field-label" for="syllabus-extra">Дополнительные темы — по одной на строке</label><textarea id="syllabus-extra" rows="2" maxlength="6000" placeholder="Например, Культурная идентичность"></textarea><div class="row section-gap"><label for="syllabus-count">Черновиков</label><input id="syllabus-count" type="number" min="1" max="60" value="20" style="width:80px"><button id="syllabus-generate">Подготовить вопросы</button></div><label class="topic-check section-gap"><input id="syllabus-use-bank" type="checkbox"><span>Дополнить готовым банком культурологии (на русском)</span></label><div id="syllabus-drafts" class="draft-list"></div><div class="row section-gap"><button id="syllabus-import" class="pri" hidden>Добавить выбранные в банк</button><button id="syllabus-select-all" hidden>Выбрать готовые</button><button id="syllabus-select-none" hidden>Снять выбор</button><button id="syllabus-save" hidden>Скачать черновики</button></div><label class="field-label section-gap">Продолжить работу с черновиками<input id="syllabus-restore" type="file" accept=".json"></label><p class="small-note mut">Незавершённую работу скачайте в JSON и загрузите сюда позже.</p>`;
 function status(text,error=false){if(!$("syllabus-message"))return;$("syllabus-message").textContent=uiText(text);$("syllabus-message").className=`small-note ${error?"red":"mut"}`;}
 function lock(value){busy=value;for(const el of $("syllabus-panel").querySelectorAll('input,textarea,select,button'))el.disabled=value||!engine.connected;}
 async function task(fn){if(busy)return;lock(true);try{await fn();}catch(error){status(error.message,true);}finally{lock(false);}}
 function size(){$("syllabus-size").textContent=uiTpl`${$("syllabus-text").value.length.toLocaleString(getLocale())} символов`;}
 function diagnostics(result){
  const d=result.diagnostics||{},items=[];
  if(d.unrecognizedUnits)items.push(uiTpl`Не распознано фрагментов: ${d.unrecognizedUnits}. Они не превращены в вопросы автоматически.`);
  if(d.suppressedSameSource)items.push(uiTpl`Убраны повторные вопросы из одного фрагмента: ${d.suppressedSameSource}.`);
  if(d.unmatchedKeys)items.push(uiTpl`Ключей без соответствующего вопроса: ${d.unmatchedKeys}.`);
  if(d.factLimitReached||d.truncatedRecords||d.oversizeUnits)items.push(uiText('Часть документа превышает лимиты разбора. Загрузите её отдельно меньшими разделами.'));
  if(result.remaining)items.push(uiTpl`Ещё черновиков в документе: ${result.remaining}. Увеличьте количество или выберите меньше тем.`);
  $("syllabus-diagnostics").innerHTML=items.map(item=>`<p>${h(item)}</p>`).join('')+(d.samples?.length?`<details><summary>${h(uiText('Примеры нераспознанного текста'))}</summary>${d.samples.map(s=>`<blockquote>${h(s.text)}</blockquote>`).join('')}</details>`:'');
 }
 function clearDrafts(){drafts=[];renderDrafts();$("syllabus-diagnostics").replaceChildren();}
 $("syllabus-text").addEventListener("input",()=>{size();clearDrafts();$("syllabus-topics").replaceChildren();status(uiText("Текст изменён. Найдите темы заново."));});
 async function analyze(){
  const result=await engine.analyzeSyllabus($("syllabus-text").value);clearDrafts();
  $("syllabus-topics").innerHTML=result.topics.map(topic=>`<label class="topic-check"><input type="checkbox" data-topic value="${h(topic)}" checked><span>${h(topic)}</span></label>`).join('');
  diagnostics(result);status(uiTpl`${result.topics.length} тем, ${result.facts??result.definitions} учебных фактов, ${result.authored||0} авторских вопросов. ${result.note}`);
 }
 $("syllabus-file").addEventListener("change",()=>task(async()=>{const file=$("syllabus-file").files[0];if(!file)return;status(uiText("Чтение документа…"));const text=await readSyllabusFile(file,status);$("syllabus-text").value=text;clearDrafts();$("syllabus-topics").replaceChildren();size();await analyze();}));
 $("syllabus-analyze").addEventListener("click",()=>task(analyze));
 $("syllabus-generate").addEventListener("click",()=>task(async()=>{
  const topics=[...new Set([...$("syllabus-topics").querySelectorAll("[data-topic]:checked")].map(c=>c.value).concat($("syllabus-extra").value.split("\n").map(s=>s.trim()).filter(Boolean)))];
  if(!topics.length)throw new Error(uiText("Найдите темы или добавьте хотя бы одну вручную."));
  const result=await engine.generateQuestions($("syllabus-text").value,topics,Number($("syllabus-count").value),{includeBank:$("syllabus-use-bank").checked});
  drafts=(result.drafts||result.questions).map(q=>({...q,options:[...q.options],selected:assessDraft(q).ready,reviewed:false}));
  renderDrafts();diagnostics(result);status(result.note);
 }));
 const reasonText=q=>{const state=assessDraft(q);return state.ready?uiText('Готов к добавлению'):state.problems.map(code=>uiText(DRAFT_MESSAGES[code])).join(' ');};
 function renderDrafts(){
  $("syllabus-drafts").innerHTML=drafts.map((q,i)=>uiTpl`<details class="draft" data-draft="${i}"><summary><input type="checkbox" data-draft-selected="${i}" ${q.selected?'checked':''} aria-label="Выбрать вопрос ${i+1}"><span data-draft-title="${i}">${i+1}. ${h(q.text.slice(0,130))}${q.text.length>130?'…':''}</span></summary><p class="small-note" data-draft-status="${i}" role="status">${h(reasonText(q))}</p><label class="field-label">Вопрос<textarea data-draft-text="${i}" rows="3">${h(q.text)}</textarea></label><div class="draft-options">${q.options.map((o,j)=>`<label class="${j===q.correct?'draft-correct':''}">${String.fromCharCode(65+j)}<input type="text" data-draft-option="${i}" data-option="${j}" value="${h(o)}"><button type="button" data-remove-option="${i}" data-option="${j}" aria-label="${h(uiText('Удалить вариант'))} ${String.fromCharCode(65+j)}">×</button></label>`).join('')}</div><button type="button" data-add-option="${i}">${h(uiText('Добавить вариант'))}</button><label class="field-label">Правильный вариант<select data-draft-correct="${i}"><option value="" ${q.correct===null?'selected':''}>${h(uiText('Не указан — выберите'))}</option>${q.options.map((_,j)=>`<option value="${j}" ${j===q.correct?'selected':''}>${String.fromCharCode(65+j)}</option>`).join('')}</select></label><label class="topic-check"><input type="checkbox" data-draft-reviewed="${i}" ${q.reviewed?'checked':''}><span>Проверил текст и ответ по источнику; длина подходит для моего раунда</span></label>${q.issues?.length?`<p class="small-note mut">${h(uiText('Замечания к исходнику'))}: ${q.issues.map(code=>h(uiText(DRAFT_MESSAGES[code]||code))).join(' ')}</p>`:''}${q.providedAnswer||q.answerKey?`<p class="small-note">${h(uiText('Ответ автора'))}: ${h(q.providedAnswer||q.answerKey)}</p>`:''}<p class="small-note mut">Тема: ${h(q.topic||'')}<br>Источник: ${h(q.source||'')}${q.difficultyLabel?`<br>${h(uiText('Предварительная сложность'))}: ${h(q.difficultyLabel)}`:''}</p>${q.sourceExcerpt?`<blockquote>${h(q.sourceExcerpt)}</blockquote>`:''}<p class="small-note cyan">${h(q.explanation||'')}</p></details>`).join('');
  for(const id of ['syllabus-import','syllabus-select-all','syllabus-select-none','syllabus-save'])$(id).hidden=!drafts.length;
 }
 $("syllabus-drafts").addEventListener('input',e=>{
  if(busy)return;const el=e.target;let index;
  for(const field of ['draftSelected','draftText','draftOption','draftCorrect','draftReviewed'])if(el.dataset[field]!==undefined)index=Number(el.dataset[field]);
  if(index===undefined||!drafts[index])return;const q=drafts[index];
  if(el.dataset.draftSelected!==undefined)q.selected=el.checked;
  if(el.dataset.draftText!==undefined)q.text=el.value;
  if(el.dataset.draftOption!==undefined)q.options[Number(el.dataset.option)]=el.value;
  if(el.dataset.draftCorrect!==undefined)q.correct=el.value===''?null:Number(el.value);
  if(el.dataset.draftReviewed!==undefined)q.reviewed=el.checked;
  if(el.dataset.draftText!==undefined||el.dataset.draftOption!==undefined||el.dataset.draftCorrect!==undefined){q.reviewed=false;el.closest('.draft').querySelector('[data-draft-reviewed]').checked=false;}
  const host=el.closest('.draft');host.querySelector('[data-draft-status]').textContent=reasonText(q);
  host.querySelector('[data-draft-title]').textContent=`${index+1}. ${q.text.slice(0,130)}${q.text.length>130?'…':''}`;
  host.querySelectorAll('.draft-options label').forEach((label,j)=>label.classList.toggle('draft-correct',j===q.correct));
 });
 $("syllabus-drafts").addEventListener('click',e=>{
  if(busy)return;const remove=e.target.closest('[data-remove-option]'),add=e.target.closest('[data-add-option]');if(!remove&&!add)return;
  const index=Number((remove||add).dataset[remove?'removeOption':'addOption']),q=drafts[index];
  if(remove){const at=Number(remove.dataset.option);q.options.splice(at,1);if(q.correct===at)q.correct=null;else if(q.correct>at)q.correct--;}
  else if(q.options.length<12)q.options.push('');
  q.reviewed=false;renderDrafts();$("syllabus-drafts").querySelector(`[data-draft="${index}"]`).open=true;
 });
 $("syllabus-select-all").addEventListener('click',()=>{drafts.forEach(q=>q.selected=assessDraft(q).ready);renderDrafts();});
 $("syllabus-select-none").addEventListener('click',()=>{drafts.forEach(q=>q.selected=false);renderDrafts();});
 $("syllabus-import").addEventListener('click',()=>task(async()=>{
  const selected=drafts.filter(q=>q.selected);if(!selected.length)throw new Error(uiText('Выберите хотя бы один черновик.'));
  const invalid=selected.find(q=>!assessDraft(q).ready);if(invalid)throw new Error(uiTpl`Сначала завершите выбранный вопрос: ${invalid.text.slice(0,70)}. ${reasonText(invalid)}`);
  // Keep the full source in drafts/export. The game's metadata field stores an excerpt.
  const chosen=selected.map(q=>({text:q.text,options:q.options,correct:q.correct,points:25,topic:(q.topic||'').slice(0,200),source:(q.source||'').slice(0,200),sourceExcerpt:(q.sourceExcerpt||'').slice(0,1200),explanation:(q.explanation||'').slice(0,1200)}));
  const result=await engine.importQuestions(chosen);drafts=drafts.filter(q=>!q.selected);renderDrafts();status(uiTpl`Добавлено в банк: ${result.added}. Пропущено дубликатов: ${result.skipped}.`);message(uiTpl`Из силлабуса добавлено ${result.added} вопросов.`);
 }));
 $("syllabus-save").addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify({format:'ERADIS-question-drafts',version:1,drafts},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='ERADIS-question-drafts.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 $("syllabus-restore").addEventListener('change',()=>task(async()=>{
  const file=$("syllabus-restore").files[0];if(!file)return;if(file.size>MAX_FILE)throw new Error(uiText('Размер файла — максимум 10 МБ.'));
  const data=JSON.parse(await file.text());
  if(data.format!=='ERADIS-question-drafts'||data.version!==1||!Array.isArray(data.drafts)||data.drafts.length>60||!data.drafts.every(q=>q&&typeof q.text==='string'&&Array.isArray(q.options)&&q.options.length<=100&&q.options.every(o=>typeof o==='string')&&(q.correct===null||Number.isInteger(q.correct))&&(q.issues===undefined||Array.isArray(q.issues)&&q.issues.every(i=>typeof i==='string'))&&['topic','source','sourceExcerpt','explanation','providedAnswer','answerKey','difficultyLabel'].every(k=>q[k]===undefined||typeof q[k]==='string')))throw new Error(uiText('Это не файл черновиков ERADIS.'));
  drafts=data.drafts.map(q=>({...q,selected:false,reviewed:false}));renderDrafts();$("syllabus-diagnostics").replaceChildren();status(uiText('Черновики восстановлены. Проверьте и выберите вопросы для добавления.'));
 }));
 return engine.onChange(()=>{if(!busy)lock(false);});
}

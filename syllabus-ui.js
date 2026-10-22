import { escapeHTML as h } from "./shared-engine.js";
const LIMIT=120000,MAX_FILE=10*1024*1024;
let mammothLoader=null;
async function mammothLibrary(){
 if(window.mammoth)return window.mammoth;
 if(!mammothLoader)mammothLoader=new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="/vendor/mammoth/mammoth.browser.min.js";s.onload=()=>resolve(window.mammoth);s.onerror=()=>{mammothLoader=null;reject(new Error("Не удалось загрузить обработчик DOCX. Повторите или вставьте текст."))};document.head.append(s)});
 return mammothLoader;
}
export async function readSyllabusFile(file,onProgress=()=>{}) {
 if(file.size>MAX_FILE)throw new Error("Размер файла — максимум 10 МБ.");
 const extension=file.name.split(".").pop().toLowerCase();let text="";
 if(extension==="txt"){text=await file.text()}
 else if(extension==="docx"){
  const mammoth=await mammothLibrary(),result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});text=result.value;
 }else if(extension==="pdf"){
  const pdfjs=await import("/vendor/pdfjs/pdf.mjs");pdfjs.GlobalWorkerOptions.workerSrc="/vendor/pdfjs/pdf.worker.mjs";
  const loading=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true,disableFontFace:true});
  try{
   const pdf=await loading.promise;
   if(pdf.numPages>100)throw new Error("Максимум 100 страниц. Загрузите нужный раздел отдельно.");
   const pages=[];
   for(let n=1;n<=pdf.numPages;n++){
    onProgress(`Чтение PDF: ${n} / ${pdf.numPages}`);const page=await pdf.getPage(n),content=await page.getTextContent();let line="",lastY=null,lines=[];
    for(const item of content.items){if(!("str" in item))continue;const y=item.transform?.[5];if(lastY!==null&&y!==undefined&&Math.abs(y-lastY)>3&&line.trim()){lines.push(line.trim());line=""}line+=item.str+(item.hasEOL?"\n":" ");if(item.hasEOL){lines.push(line.trim());line=""}lastY=y}
    if(line.trim())lines.push(line.trim());pages.push(lines.join("\n"));page.cleanup();
    if(pages.reduce((sum,p)=>sum+p.length,0)>LIMIT)throw new Error(`Текст длиннее ${LIMIT} символов. Выберите нужные страницы.`);
   }text=pages.join("\n\n");
  }finally{await loading.destroy()}
 }else throw new Error("Поддерживаются PDF, DOCX и TXT. Старый DOC сохраните как DOCX.");
 text=text.replace(/\u0000/g,"").trim();
 if(text.length<30)throw new Error("В файле почти нет распознаваемого текста. Если это скан, распознайте его или вставьте текст вручную.");
 if(text.length>LIMIT)throw new Error(`Максимум ${LIMIT} символов. Загрузите нужный раздел отдельно.`);
 return text;
}
export function setupSyllabus(engine,message){
 const $=id=>document.getElementById(id);let busy=false,drafts=[];
 $("syllabus-panel").innerHTML=`<p class="mut small-note">Бесплатный подбор без ИИ и API: определения из текста и учебный банк культурологии. Правильные ответы и источники видны в черновиках. Перед добавлением проверьте соответствие вашей программе.</p><label class="file-drop section-gap" for="syllabus-file"><strong>Загрузить силлабус</strong><span>PDF, DOCX или TXT · до 10 МБ</span><input id="syllabus-file" type="file" accept=".pdf,.docx,.txt"></label><details class="section-gap"><summary>Посмотреть или вставить текст</summary><textarea id="syllabus-text" rows="8" maxlength="120000" aria-label="Текст силлабуса" placeholder="Вставьте силлабус или конспект с названиями тем и определениями"></textarea></details><div class="row section-gap"><button id="syllabus-analyze" class="pri">Найти темы</button><span id="syllabus-size" class="mut"></span></div><p id="syllabus-message" class="small-note mut" role="status" aria-live="polite"></p><div id="syllabus-topics" class="topic-options"></div><label class="field-label" for="syllabus-extra">Дополнительные темы — по одной на строке</label><textarea id="syllabus-extra" rows="2" maxlength="6000" placeholder="Например, Культурная идентичность"></textarea><div class="row section-gap"><label for="syllabus-count">Черновиков</label><input id="syllabus-count" type="number" min="1" max="60" value="20" style="width:80px"><button id="syllabus-generate">Подготовить вопросы</button></div><div id="syllabus-drafts" class="draft-list"></div><div class="row section-gap"><button id="syllabus-import" class="pri" hidden>Добавить выбранные в банк</button><button id="syllabus-select-all" hidden>Выбрать все</button><button id="syllabus-select-none" hidden>Снять выбор</button></div>`;
 function status(text,error=false){if(!$("syllabus-message"))return;$("syllabus-message").textContent=text;$("syllabus-message").className=`small-note ${error?"red":"mut"}`}
 function lock(value){busy=value;for(const id of ["syllabus-file","syllabus-analyze","syllabus-generate","syllabus-import"]){const el=$(id);if(el)el.disabled=value||!engine.connected}}
 async function task(fn){if(busy)return;lock(true);try{await fn()}catch(error){status(error.message,true)}finally{lock(false)}}
 function size(){$("syllabus-size").textContent=`${$("syllabus-text").value.length.toLocaleString("ru-RU")} символов`}
 $("syllabus-text").addEventListener("input",size);
 async function analyze(){const result=await engine.analyzeSyllabus($("syllabus-text").value);drafts=[];renderDrafts();$("syllabus-topics").innerHTML=result.topics.map((topic,i)=>`<label class="topic-check"><input type="checkbox" data-topic value="${h(topic)}" checked><span>${h(topic)}</span></label>`).join("");status(`${result.topics.length} тем, ${result.definitions} определений. ${result.note}`)}
 $("syllabus-file").addEventListener("change",()=>task(async()=>{const file=$("syllabus-file").files[0];if(!file)return;status("Чтение документа…");$("syllabus-text").value=await readSyllabusFile(file,status);size();await analyze()}));
 $("syllabus-analyze").addEventListener("click",()=>task(analyze));
 $("syllabus-generate").addEventListener("click",()=>task(async()=>{
  const topics=[...new Set([...$("syllabus-topics").querySelectorAll("[data-topic]:checked")].map(c=>c.value).concat($("syllabus-extra").value.split("\n").map(s=>s.trim()).filter(Boolean)))];
  if(!topics.length)throw new Error("Найдите темы или добавьте хотя бы одну вручную.");
  const result=await engine.generateQuestions($("syllabus-text").value,topics,Number($("syllabus-count").value));drafts=result.questions.map(q=>({...q,selected:true}));
  renderDrafts();status(`${result.note} Из документа: ${result.fromDocument}; из учебного банка: ${result.questions.length-result.fromDocument}.`);
 }));
 function renderDrafts(){
  $("syllabus-drafts").innerHTML=drafts.map((q,i)=>`<details class="draft" data-draft="${i}"><summary><input type="checkbox" data-draft-selected="${i}" ${q.selected?"checked":""} aria-label="Выбрать вопрос ${i+1}"><span>${i+1}. ${h(q.text)}</span></summary><label class="field-label">Вопрос<textarea data-draft-text="${i}" rows="3" minlength="3" maxlength="2000">${h(q.text)}</textarea></label><div class="draft-options">${q.options.map((o,j)=>`<label class="${j===q.correct?"draft-correct":""}">${String.fromCharCode(65+j)}<input type="text" data-draft-option="${i}" data-option="${j}" value="${h(o)}" maxlength="500"></label>`).join("")}</div><label class="field-label">Правильный вариант<select data-draft-correct="${i}">${q.options.map((_,j)=>`<option value="${j}" ${j===q.correct?"selected":""}>${String.fromCharCode(65+j)}</option>`).join("")}</select></label><p class="small-note mut">Тема: ${h(q.topic)}<br>Источник: ${h(q.source)}</p>${q.sourceExcerpt?`<blockquote>${h(q.sourceExcerpt)}</blockquote>`:""}<p class="small-note cyan">${h(q.explanation||"")}</p></details>`).join("");
  for(const id of ["syllabus-import","syllabus-select-all","syllabus-select-none"])$(id).hidden=!drafts.length;
 }
 $("syllabus-drafts").addEventListener("input",e=>{
  const el=e.target;
  if(el.dataset.draftSelected!==undefined)drafts[Number(el.dataset.draftSelected)].selected=el.checked;
  if(el.dataset.draftText!==undefined)drafts[Number(el.dataset.draftText)].text=el.value;
  if(el.dataset.draftOption!==undefined)drafts[Number(el.dataset.draftOption)].options[Number(el.dataset.option)]=el.value;
  if(el.dataset.draftCorrect!==undefined){const index=Number(el.dataset.draftCorrect);drafts[index].correct=Number(el.value);el.closest(".draft").querySelectorAll(".draft-options label").forEach((label,j)=>label.classList.toggle("draft-correct",j===Number(el.value)))}
 });
 $("syllabus-select-all").addEventListener("click",()=>{drafts.forEach(q=>q.selected=true);renderDrafts()});$("syllabus-select-none").addEventListener("click",()=>{drafts.forEach(q=>q.selected=false);renderDrafts()});
 $("syllabus-import").addEventListener("click",()=>task(async()=>{
  const chosen=drafts.filter(q=>q.selected).map(({selected,...q})=>q);if(!chosen.length)throw new Error("Выберите хотя бы один черновик.");
  const result=await engine.importQuestions(chosen);drafts=drafts.filter(q=>!q.selected);renderDrafts();status(`Добавлено в банк: ${result.added}. Пропущено дубликатов: ${result.skipped}.`);message(`Из силлабуса добавлено ${result.added} вопросов.`);
 }));
 return engine.onChange(()=>{if(!busy)lock(false)});
}

const LIMIT=120000,MAX_FILE=10*1024*1024;
let mammothLoader=null;
async function mammothLibrary(uiText=s=>s){
 if(window.mammoth)return window.mammoth;
 if(!mammothLoader)mammothLoader=new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="/vendor/mammoth/mammoth.browser.min.js";s.onload=()=>resolve(window.mammoth);s.onerror=()=>{mammothLoader=null;reject(new Error( uiText("Не удалось загрузить обработчик DOCX. Повторите или вставьте текст.")))};document.head.append(s)});
 return mammothLoader;
}
export async function readSyllabusFile(file,onProgress=()=>{},translate={}) {
 const uiText=translate.uiText||(s=>s),uiTpl=translate.uiTpl||((s,...v)=>s.reduce((a,x,i)=>a+x+(i<v.length?v[i]:''),''));
 if(file.size>MAX_FILE)throw new Error( uiText("Размер файла — максимум 10 МБ."));
 const extension=file.name.split(".").pop().toLowerCase();let text="";
 if(extension==="txt"){text=await file.text()}
 else if(extension==="docx"){
  const mammoth=await mammothLibrary(uiText),result=await mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()},{convertImage:mammoth.images.imgElement(()=>({}))});
  // Parse in an inert template; never insert document markup into the live page.
  const template=document.createElement('template');template.innerHTML=result.value;
  const lines=[];
  function walk(node){
   if(node.nodeType!==1)return;
   const tag=node.tagName.toLowerCase();
   if(tag==='table'){for(const row of node.querySelectorAll('tr'))lines.push([...row.querySelectorAll('td,th')].map(cell=>cell.textContent.replace(/\s+/g,' ').trim()).join('\t'));return;}
   if(tag==='p'||/^h[1-6]$/.test(tag)){lines.push((tag[0]==='h'?'# ':'')+node.textContent);return;}
   if(tag==='li'){const parent=node.parentElement,number=parent?.tagName==='OL'?[...parent.children].indexOf(node)+(Number(parent.getAttribute('start'))||1):null;lines.push((number?number+'. ':'')+node.textContent);return;}
   for(const child of node.children)walk(child);
  }
  for(const child of template.content.children)walk(child);text=lines.join('\n\n');
 }else if(extension==="pdf"){
  const pdfjs=await import("/vendor/pdfjs/pdf.mjs");pdfjs.GlobalWorkerOptions.workerSrc="/vendor/pdfjs/pdf.worker.mjs";
  const loading=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true,disableFontFace:true});
  try{
   const pdf=await loading.promise;
   if(pdf.numPages>100)throw new Error( uiText("Максимум 100 страниц. Загрузите нужный раздел отдельно."));
   const pages=[];
   for(let n=1;n<=pdf.numPages;n++){
    onProgress( uiTpl`Чтение PDF: ${n} / ${pdf.numPages}`);const page=await pdf.getPage(n),content=await page.getTextContent();let line="",lastY=null,lines=[];
    for(const item of content.items){if(!("str" in item))continue;const y=item.transform?.[5];if(lastY!==null&&y!==undefined&&Math.abs(y-lastY)>3&&line.trim()){lines.push(line.trim());line=""}line+=item.str+(item.hasEOL?"\n":" ");if(item.hasEOL){lines.push(line.trim());line=""}lastY=y}
    if(line.trim())lines.push(line.trim());pages.push(lines.join("\n"));page.cleanup();
    if(pages.reduce((sum,p)=>sum+p.length,0)>LIMIT)throw new Error( uiTpl`Текст длиннее ${LIMIT} символов. Выберите нужные страницы.`);
   }text=pages.join("\n\n");
  }finally{await loading.destroy()}
 }else throw new Error( uiText("Поддерживаются PDF, DOCX и TXT. Старый DOC сохраните как DOCX."));
 text=text.replace(/\u0000/g,"").trim();
 if(text.length<30)throw new Error( uiText("В файле почти нет распознаваемого текста. Если это скан, распознайте его или вставьте текст вручную."));
 if(text.length>LIMIT)throw new Error( uiTpl`Максимум ${LIMIT} символов. Загрузите нужный раздел отдельно.`);
 return text;
}

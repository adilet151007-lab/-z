import KAZAKH from './ui-kz.js';

const LANGUAGE_KEY='cq_ui_language_v1',THEME_KEY='cq_ui_theme_v1';
const read=key=>{for(const name of ['localStorage','sessionStorage'])try{const value=globalThis[name]?.getItem(key);if(value)return value}catch{}return null};
const save=(key,value)=>{for(const name of ['localStorage','sessionStorage'])try{globalThis[name]?.setItem(key,value)}catch{}};
let language=read(LANGUAGE_KEY)==='kk'?'kk':'ru',theme=read(THEME_KEY)==='light'?'light':'dark';
const compact=text=>text.trim().replace(/\s+/g,' ');
const templates=new WeakMap();
export const getLanguage=()=>language;
export const getLocale=()=>language==='kk'?'kk-KZ':'ru-RU';
export const getTheme=()=>theme;

function translateFragment(source){
 if(language!=='kk')return source;
 const slots=[],key=compact(source).replace(/\uE000(\d+)\uE001/g,token=>{slots.push(token);return '{'+(slots.length-1)+'}'});
 const translated=Object.hasOwn(KAZAKH,key)?KAZAKH[key]:undefined;if(translated===undefined)return source;
 const output=translated.replace(/\{(\d+)\}/g,(token,index)=>slots[Number(index)]??token);
 return (source.match(/^\s*/)?.[0]||'')+output+(source.match(/\s*$/)?.[0]||'');
}
export function t(source){
 const text=String(source??'');if(language!=='kk')return text;
 if(!/<[a-z][\w-]*[\s>]/i.test(text))return translateFragment(text);
 return text.replace(/\b(placeholder|aria-label|title|alt|label)\s*=\s*(["'])(.*?)\2/g,(_match,name,quote,value)=>name+'='+quote+translateFragment(value)+quote)
  .replace(/(?:^|>)([^<>]*)(?=<|$)/g,(match,content)=>match.slice(0,match.length-content.length)+translateFragment(content));
}
export function tx(strings,...values){
 if(language!=='kk')return strings.map((part,index)=>part+(index<values.length?String(values[index]):'')).join('');
 let pattern=templates.get(strings);
 if(pattern===undefined){pattern=t(strings.map((part,index)=>part+(index<values.length?'\uE000'+index+'\uE001':'')).join(''));templates.set(strings,pattern)}
 return pattern.replace(/\uE000(\d+)\uE001/g,(_token,index)=>String(values[Number(index)]));
}
function applyDocument(){
 if(typeof document==='undefined')return;
 document.documentElement.dataset.theme=theme;document.documentElement.lang=language;
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='light'?'#edf5f8':'#07151e');
}
function refreshControls(){
 if(typeof document==='undefined')return;
 for(const host of document.querySelectorAll('[data-ui-preferences]')){
  const button=host.querySelector('[data-ui-theme]'),label=theme==='dark'?t('Светлая тема'):t('Тёмная тема');
  button.setAttribute('aria-label',label);button.setAttribute('title',label);button.setAttribute('aria-pressed',String(theme==='light'));button.innerHTML='<span aria-hidden="true">'+(theme==='dark'?'☀':'☾')+'</span><span class="theme-word">'+(theme==='dark'?t('Светлая'):t('Тёмная'))+'</span>';
  const select=host.querySelector('[data-ui-language]');select.value=language;select.setAttribute('aria-label',t('Язык интерфейса'));select.setAttribute('title',t('При смене языка страница обновится; место в игре сохранится.'));
 }
}
export function setTheme(value){if(!['light','dark'].includes(value))throw new Error('Unknown theme');theme=value;save(THEME_KEY,theme);applyDocument();refreshControls();globalThis.dispatchEvent?.(new Event('cq:theme-change'));return theme}
export function setLanguage(value){if(!['ru','kk'].includes(value))throw new Error('Unknown language');language=value;save(LANGUAGE_KEY,language);applyDocument();refreshControls();return language}
function translateDocument(){
 if(language!=='kk')return;
 const walker=document.createTreeWalker(document.body,4),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
 for(const node of nodes)if(!node.parentElement?.closest('script,style,textarea,pre,code,[translate="no"],[data-brand-title],[data-brand-subject]'))node.data=t(node.data);
 for(const node of document.querySelectorAll('[placeholder],[aria-label],[title],[alt]'))if(!node.closest('[translate="no"]'))for(const name of ['placeholder','aria-label','title','alt'])if(node.hasAttribute(name))node.setAttribute(name,t(node.getAttribute(name)));
 document.title=t(document.title);
}
export function setupUIPreferences(){
 if(typeof document==='undefined'||document.documentElement.dataset.uiReady)return;
 document.documentElement.dataset.uiReady='true';applyDocument();translateDocument();
 for(const parent of document.querySelectorAll('.reg-card,.app>.topbar')){
  const host=document.createElement('div');host.className='ui-preferences';host.dataset.uiPreferences='';
  host.innerHTML='<button type="button" class="ghost ui-theme-button" data-ui-theme></button><select data-ui-language><option value="ru">Русский</option><option value="kk">Қазақша</option></select>';
  if(parent.classList.contains('reg-card'))parent.prepend(host);else parent.append(host);
  host.querySelector('[data-ui-theme]').addEventListener('click',()=>setTheme(theme==='dark'?'light':'dark'));
  host.querySelector('[data-ui-language]').addEventListener('change',event=>{if(event.target.value===language)return;setLanguage(event.target.value);window.location.reload()});
 }
 refreshControls();
 window.addEventListener('storage',event=>{if(event.key===THEME_KEY&&['light','dark'].includes(event.newValue)){theme=event.newValue;applyDocument();refreshControls()}});
}

// Decorative preview only. Existing lobby.js owns invitations, accounts and rooms.
const canvas=document.getElementById('lobby-scene'),stage=document.getElementById('atlas-stage'),button=document.getElementById('motion-toggle');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const translations={ru:{atlasKicker:'ТВОЙ МИР НАЧИНАЕТСЯ ЗДЕСЬ',atlasPreview:'ОТКРОЙ КАЗАХСТАН',astana:'Астана',almaty:'Алматы',turkistan:'Туркестан'},kk:{atlasKicker:'СЕНІҢ ӘЛЕМІҢ ОСЫНДАН БАСТАЛАДЫ',atlasPreview:'ҚАЗАҚСТАНДЫ ТАНЫ',astana:'Астана',almaty:'Алматы',turkistan:'Түркістан'}};
const descriptions={ru:{astana:'Город больших идей',almaty:'Культура у подножия гор',turkistan:'История, которая вдохновляет'},kk:{astana:'Үлкен идеялар қаласы',almaty:'Тау бөктеріндегі мәдениет',turkistan:'Шабыт сыйлайтын тарих'}};
let scene,selected='astana',paused=false;
function render(){const kk=document.documentElement.lang==='kk',lang=kk?'kk':'ru',t=translations[lang];for(const node of document.querySelectorAll('.atlas [data-copy]'))node.textContent=t[node.dataset.copy];document.getElementById('city-title').textContent=t[selected];document.getElementById('city-description').textContent=descriptions[lang][selected];document.querySelector('.city-switch').setAttribute('aria-label',kk?'Картадағы қала':'Город на карте');for(const b of document.querySelectorAll('[data-city]'))b.setAttribute('aria-pressed',String(b.dataset.city===selected));button.setAttribute('aria-label',kk?(paused?'Анимацияны жалғастыру':'Анимацияны тоқтату'):(paused?'Продолжить анимацию':'Приостановить анимацию'));button.setAttribute('aria-pressed',String(paused));button.firstElementChild.textContent=paused?'▷':'Ⅱ';button.hidden=!scene||reduced.matches}
for(const b of document.querySelectorAll('[data-city]'))b.addEventListener('click',()=>{selected=b.dataset.city;scene?.selectCity(selected);render()});
button.addEventListener('click',()=>{paused=!paused;scene?.setPaused(paused||reduced.matches);render()});
reduced.addEventListener('change',()=>{scene?.setPaused(paused||reduced.matches);render()});
const observer=new MutationObserver(render);observer.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
function fallback(){scene?.dispose();scene=undefined;stage.classList.remove('scene-ready');button.hidden=true}
canvas.addEventListener('lobby:scene-unavailable',fallback);render();
if(!navigator.connection?.saveData)requestAnimationFrame(async()=>{try{const{createLobbyScene}=await import('./lobby-atlas-scene.js');scene=createLobbyScene(canvas);scene.selectCity(selected);scene.setPaused(paused||reduced.matches);stage.classList.add('scene-ready');render()}catch{fallback()}});
window.addEventListener('pagehide',e=>{if(!e.persisted){scene?.dispose();observer.disconnect()}});

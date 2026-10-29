const copy={ru:{title:'Вершина этой сессии',eyebrow:'ERADIS · ФИНАЛ',team:'Командный рейтинг: ресурс + экономика × 5',solo:'Личный рейтинг по культурному капиталу',score:'баллов рейтинга',points:'ресурса',empty:'Это место пока свободно',close:'Вернуться к игре',replay:'🏆 Итоги сессии',place:'место',tie:'Одинаковый результат — общее место'},kk:{title:'Осы сессияның үздіктері',eyebrow:'ERADIS · ФИНАЛ',team:'Командалық рейтинг: ресурс + экономика × 5',solo:'Мәдени капитал бойынша жеке рейтинг',score:'рейтинг ұпайы',points:'ресурс',empty:'Бұл орын әзірге бос',close:'Ойынға оралу',replay:'🏆 Сессия қорытындысы',place:'орын',tie:'Нәтижелер тең болса, орын ортақ болады'}};
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const styles=`
.eradis-finale{box-sizing:border-box;width:min(940px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;border:1px solid #6b9b99;border-radius:26px;padding:clamp(20px,4vw,44px);background:radial-gradient(ellipse at 50% 0,#175d59 0,transparent 65%),#081b29;color:#effbf5;text-align:center;box-shadow:0 24px 100px #0009;font-family:system-ui,sans-serif}
.eradis-finale::backdrop{background:#020b16dc}
.eradis-finale small{letter-spacing:.22em;color:#ffda74;font-weight:700}
.eradis-finale h2{font-size:clamp(25px,5vw,42px);line-height:1.1;margin:14px 0}
.eradis-finale p{color:#bad5d6;margin:12px 0;font-size:14px}
.eradis-podium{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(8px,2vw,20px);align-items:end;margin:32px 0 22px;isolation:isolate}
.eradis-finalist{min-width:0;--metal:#b8d5e4;--rise:28px;--delay:1s;position:relative;animation:eradis-rise .75s cubic-bezier(.2,.7,.3,1) var(--delay) both}
.eradis-finalist[data-place="1"]{grid-column:2;grid-row:1;--metal:#ffcf58;--rise:64px;--delay:1.8s}
.eradis-finalist[data-place="2"]{grid-column:1;grid-row:1}
.eradis-finalist[data-place="3"]{grid-column:3;grid-row:1;--metal:#d99970;--rise:12px;--delay:.2s}
.eradis-medal{width:clamp(48px,9vw,88px);height:auto;overflow:visible;color:var(--metal);filter:drop-shadow(0 0 12px color-mix(in srgb,var(--metal),transparent 65%));animation:eradis-medal .8s ease calc(var(--delay) + .1s) both}
.eradis-finalist[data-place="1"] .eradis-medal{width:clamp(60px,11vw,110px)}
.eradis-finalist ol{list-style:none;margin:10px 0 0;padding:0}
.eradis-finalist li{padding:8px 2px;border-top:1px solid #ffffff20}
.eradis-finalist strong{display:block;font-size:clamp(13px,2.5vw,22px);overflow-wrap:anywhere;line-height:1.3}
.eradis-finalist span{display:block;color:#c7e5e1;font-size:clamp(10px,1.8vw,14px);margin-top:6px;overflow-wrap:anywhere}
.eradis-step{background:linear-gradient(130deg,#ffffff1d,#ffffff04);border:1px solid color-mix(in srgb,var(--metal),transparent 50%);border-top:4px solid var(--metal);border-radius:12px 12px 5px 5px;min-height:calc(75px + var(--rise));padding:14px 8px;box-sizing:border-box}
.eradis-step b{font-size:clamp(28px,6vw,52px);color:var(--metal)}
.eradis-finalist.is-empty{opacity:.4;animation:none}
.eradis-finale button,.eradis-finale-replay{font:600 15px system-ui;min-height:44px;border-radius:12px;padding:12px 22px;border:1px solid #79d9c6;background:#164e49;color:#effbf5;cursor:pointer}
.eradis-finale-replay{position:fixed;z-index:70;right:12px;top:12px;max-width:calc(100vw - 24px);box-shadow:0 4px 20px #0008}
body.achievement-playing .eradis-finale-replay,body.map-celebrating .eradis-finale-replay{visibility:hidden}
@keyframes eradis-rise{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
@keyframes eradis-medal{from{opacity:0;transform:scale(.5) rotate(-20deg)}to{opacity:1;transform:scale(1) rotate(0)}}
@media(max-width:480px){.eradis-finale{padding:22px 12px}.eradis-podium{gap:7px;margin-top:24px}.eradis-step{padding:12px 4px}.eradis-finale small{font-size:10px}.eradis-finale-replay{top:auto;bottom:calc(12px + env(safe-area-inset-bottom));font-size:13px}}
@media(prefers-reduced-motion:reduce){.eradis-finalist,.eradis-medal{animation:none!important}}
`;
const medal=rank=>`<svg class="eradis-medal" viewBox="0 0 100 110" aria-hidden="true"><path d="M29 3h18l12 34-22 7zM71 3H53L41 37l22 7z" fill="#008f79" stroke="#93e6d6" stroke-width="2"/><circle cx="50" cy="65" r="38" fill="#112d38" stroke="currentColor" stroke-width="5"/><circle cx="50" cy="65" r="30" fill="none" stroke="currentColor" opacity=".35"/><path d="m50 31 3 8-3-2-3 2z" fill="currentColor"/><text x="50" y="78" text-anchor="middle" fill="currentColor" font-size="37" font-family="system-ui" font-weight="800">${rank}</text></svg>`;

export function setupSessionFinale(engine){
 if(!document.getElementById('eradis-finale-style')){const style=document.createElement('style');style.id='eradis-finale-style';style.textContent=styles;document.head.append(style);}
 let state=null,pending=null,timer=null,dialog=null,previousFocus=null,matchKey='';
 const seen=new Set();const storageKey='eradis_finales_v1:'+location.pathname;
 try{for(const id of JSON.parse(sessionStorage.getItem(storageKey)||'[]'))seen.add(id);}catch{}
 const labels=()=>copy[document.documentElement.lang?.startsWith('kk')?'kk':'ru'];
 const replay=document.createElement('button');replay.type='button';replay.className='eradis-finale-replay';replay.hidden=true;document.body.append(replay);
 const close=()=>{if(dialog){dialog.close();dialog.remove();dialog=null;previousFocus?.isConnected&&previousFocus.focus();previousFocus=null;}};
 const eligible=()=>state?.match?.finishedAt!=null&&state.match.finalists?.length&&(state.viewer?.player||state.viewer?.role==='teacher');
 const busy=()=>document.querySelector('.collection-cinema')||document.body.classList.contains('map-celebrating');
 function show(){
  if(!eligible()||document.hidden||busy())return false;
  close();const c=labels(),rows=state.match.finalists;
  previousFocus=document.activeElement;dialog=document.createElement('dialog');dialog.className='eradis-finale';dialog.setAttribute('aria-labelledby','eradis-finale-title');
  dialog.innerHTML=`<small>${c.eyebrow}</small><h2 id="eradis-finale-title">${c.title}</h2><p>${state.match.finalMode==='solo'?c.solo:c.team}</p><div class="eradis-podium">${[2,1,3].map(rank=>{const group=rows.filter(r=>r.rank===rank);return `<section class="eradis-finalist${group.length?'':' is-empty'}" data-place="${rank}" aria-label="${rank} ${c.place}">${medal(rank)}<div class="eradis-step"><b>${rank}</b><ol>${group.length?group.map(r=>`<li><strong>${esc(r.name)}</strong><span>${Number(r.score).toLocaleString()} ${c.score}</span>${state.match.finalMode==='team'?`<span>${Number(r.points).toLocaleString()} ${c.points} · ${Number(r.economy)}%</span>`:''}</li>`).join(''):`<li><span>${c.empty}</span></li>`}</ol></div></section>`;}).join('')}</div><p>${c.tie}</p><button type="button" autofocus>${c.close}</button>`;
  dialog.querySelector('button').addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});document.body.append(dialog);dialog.showModal();
  seen.add(state.match.id);try{sessionStorage.setItem(storageKey,JSON.stringify([...seen].slice(-40)));}catch{}return true;
 }
 function attempt(){clearTimeout(timer);timer=null;if(!pending||!eligible()||document.hidden)return;if(show())pending=null;else timer=setTimeout(attempt,300);}
 const off=engine.onChange(next=>{
  state=next;const key=eligible()?state.match.id:'';
  replay.hidden=!key;replay.textContent=labels().replay;
  if(key!==matchKey){close();clearTimeout(timer);timer=null;pending=null;matchKey=key;if(key&&!seen.has(key)){pending=key;timer=setTimeout(attempt,600);}}
 });
 replay.addEventListener('click',()=>{pending=matchKey;attempt();});
 const visibility=()=>{if(document.hidden){clearTimeout(timer);timer=null;close();}else if(pending)attempt();};document.addEventListener('visibilitychange',visibility);
 return()=>{off();clearTimeout(timer);close();replay.remove();document.removeEventListener('visibilitychange',visibility);};
}

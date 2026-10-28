// Lumi, adapted from the mascot HTML supplied by the ERADIS founders.
// Local SVG only: no remote scripts, image requests, accounts or API calls.

/* ===== Разметка талисмана (SVG, viewBox 480×480) ===== */
const arm=r=>`<g class="${r?'aR':'aL'}"${r?' transform="translate(410 0) scale(-1 1)"':''}><g class="arm">
<rect x="46" y="285" width="112" height="34" rx="17" fill="url(#eradis-lumi-gT)"/>
<rect class="hl" x="72" y="289" width="58" height="9" rx="4.5" fill="#fff" opacity=".22" filter="url(#eradis-lumi-b4)"/>
<circle cx="152" cy="302" r="24" fill="url(#eradis-lumi-gT)"/>
${r?`<g class="hold"><rect x="42" y="258" width="32" height="32" rx="9" fill="url(#eradis-lumi-gM)" transform="rotate(18 58 274)"/></g><circle class="fin" cx="24" cy="300" r="12" fill="url(#eradis-lumi-gYr)"/>`
:`<circle class="fin" cx="27" cy="279" r="13" fill="url(#eradis-lumi-gYr)"/><circle class="fin" cx="15" cy="303" r="13" fill="url(#eradis-lumi-gYr)"/><circle class="fin" cx="27" cy="327" r="13" fill="url(#eradis-lumi-gYr)"/>`}
<circle cx="46" cy="302" r="22" fill="url(#eradis-lumi-gYr)"/></g></g>`;
const eyes=[158,243].map((x,i)=>{const y=192+i*4;return`<g class="eye"><ellipse cx="${x}" cy="${y}" rx="23" ry="35" fill="#00574B" opacity=".5"/><ellipse cx="${x}" cy="${y}" rx="17" ry="29" fill="url(#eradis-lumi-gE)"/><ellipse cx="${x-6}" cy="${y-11}" rx="5" ry="11" fill="#fff" opacity=".85"/><ellipse cx="${x+7}" cy="${y+15}" rx="3" ry="4" fill="#fff" opacity=".5"/></g>`}).join('');
const foot=(x,hx)=>`<g class="${x<200?'fl':'fr'}"><path d="M${x} 424A50 58 0 0 1 ${x+100} 424Z" fill="url(#eradis-lumi-gT)"/><ellipse class="hl" cx="${hx}" cy="386" rx="18" ry="9" fill="#fff" opacity=".25" filter="url(#eradis-lumi-b4)" transform="rotate(-25 ${hx} 386)"/></g>`;
const svg=mini=>`<svg class="${mini?'mini':''}" viewBox="-40 0 480 480" role="img" aria-label="Lumi">
<ellipse class="sh" cx="205" cy="438" rx="125" ry="15" fill="#000" opacity=".3" filter="url(#eradis-lumi-b6)"/>
<g class="root">${foot(102,136)}${foot(222,256)}
<g class="body"><rect x="140" y="272" width="130" height="118" rx="42" fill="url(#eradis-lumi-gT)" transform="rotate(5 205 331)"/><ellipse class="hl" cx="172" cy="298" rx="30" ry="11" fill="#fff" opacity=".2" filter="url(#eradis-lumi-b4)" transform="rotate(-20 172 298)"/><ellipse cx="205" cy="296" rx="92" ry="22" fill="#00382F" opacity=".38" filter="url(#eradis-lumi-b8)"/></g>
<g class="head"><g transform="rotate(-9 200 190)">
<rect x="105" y="100" width="190" height="180" rx="58" fill="url(#eradis-lumi-gT)"/>
<g clip-path="url(#eradis-lumi-cH)"><ellipse class="hl" cx="152" cy="130" rx="54" ry="18" fill="#fff" opacity=".25" filter="url(#eradis-lumi-b8)"/><ellipse cx="270" cy="262" rx="56" ry="26" fill="#00382F" opacity=".4" filter="url(#eradis-lumi-b8)"/></g>
<g class="eyes"><g class="eo">${eyes}</g>
<g class="eh"><path d="M138 206Q158 172 178 206M223 210Q243 176 263 210" fill="none" stroke="#FFD45A" stroke-width="12" stroke-linecap="round"/></g>
<g class="es"><path d="M140 196Q158 210 176 196M225 200Q243 214 261 200" fill="none" stroke="#E3A62C" stroke-width="9" stroke-linecap="round"/></g></g>
</g></g>
${arm(0)}${arm(1)}
<g class="cu"><circle class="cg" cx="322" cy="52" r="64" fill="url(#eradis-lumi-gG)"/><g class="cr"><rect x="295" y="25" width="54" height="54" rx="16" fill="url(#eradis-lumi-gY)"/><rect class="hl" x="302" y="31" width="24" height="9" rx="4.5" fill="#fff" opacity=".6"/></g></g>
<g class="fx"><path class="sp" d="M0-15L3.5-3.5L15 0L3.5 3.5L0 15L-3.5 3.5L-15 0L-3.5-3.5Z" fill="#FFD45A"/><path class="sp" d="M0-15L3.5-3.5L15 0L3.5 3.5L0 15L-3.5 3.5L-15 0L-3.5-3.5Z" fill="#FFD45A"/><path class="sp" d="M0-15L3.5-3.5L15 0L3.5 3.5L0 15L-3.5 3.5L-15 0L-3.5-3.5Z" fill="#FFD45A"/>
<text class="z" font-size="36" font-weight="800" fill="#FFD45A" font-family="system-ui,sans-serif">Z</text><text class="z" font-size="26" font-weight="800" fill="#FFD45A" font-family="system-ui,sans-serif">z</text>
<text class="bg" x="30" y="96" font-size="84" font-weight="900" fill="#FFD45A" font-family="system-ui,sans-serif" opacity="0">!</text></g>
</g></svg>`;

/* ===== Анимации: f(время, талисман) → поза. dur — длительность, без dur — цикл ===== */
const S_=Math.sin,PI=Math.PI;
const A={
 idle:{f:t=>({hy:S_(t*2.2)*2.5,hr:S_(t*1.1)*1.5,aL:-38+S_(t*2.2)*2,aR:-38-S_(t*2.2)*2,cy:S_(t*2.6)*6,cr:18+S_(t*1.3)*7,gl:.8+S_(t*3)*.15})},
 wave:{dur:2.8,f:t=>({mood:t>.3&&t<2.4?1:0,aL:48+S_(t*14)*14,hr:-3,hy:S_(t*6)*2,cy:S_(t*5)*5,cr:18+t*40,gl:1})},
 jump:{dur:1.2,f:t=>{const u=t/1.2;let y=0,sq=0,a=-38,mood=0;if(u<.14)sq=u;else if(u<.86){const v=(u-.14)/.72;y=105*S_(PI*v);sq=-.05*S_(PI*v);a=62;mood=1}else sq=.14*(1-(u-.86)/.14);return{y,sq,aL:a,aR:a,mood,cy:-y*.15,cr:18+u*360,gl:1}}},
 happy:{dur:3.2,f:t=>({mood:1,aL:62+S_(t*12)*10,aR:62-S_(t*12)*10,y:Math.abs(S_(t*7))*14,hr:S_(t*7)*5,sp:1,cy:S_(t*7)*6,cr:18+t*120,gl:1})},
 think:{dur:3.2,f:t=>({hr:-8,hx:-6,ex:-7,ey:-8,aL:70+S_(t*5)*4,cr:t*300,cy:S_(t*5)*4,gl:1})},
 sleep:{f:t=>({mood:2,hy:12+S_(t*1.4)*3,hr:14,hx:4,aL:-52,aR:-52,cy:36,gl:.25,z:1})},
 walk:{dur:3,f:(t,s)=>{const w=S_(t*9);return{y:Math.abs(w)*8,fl:Math.max(0,w)*16,fr:Math.max(0,-w)*16,aL:-38+w*18,aR:-38-w*18,hr:w*3,hx:s.dir*6,ex:s.dir*7,cy:Math.abs(w)*6,cr:18+t*60}}},
 dance:{dur:4,f:t=>{const w=S_(t*10);return{mood:1,aL:45+w*30,aR:45-w*30,y:Math.abs(S_(t*5))*18,hr:S_(t*5)*10,sp:1,cy:w*5,cr:t*200,gl:1}}},
 surprise:{dur:1.1,f:t=>{const u=t/1.1;return{mood:3,bg:'!',y:u<.3?40*S_(PI*u/.3):0,sq:u<.3?0:.05*(1-u),hy:-6,aL:20,aR:20,cy:-8,gl:1}}}
};
const SAY={wave:['Привет! Я Lumi ✨','Сәлем! 👋'],happy:['Ойна! 🎮','Таны! 🔍','Өс! 🌱'],surprise:['Ой! 😮'],think:['Хмм… что исследуем?'],jump:['Hop!'],sleep:['Zzz…'],dance:['Let’s play! 🎶']};

/* ===== Талисман ===== */
const L=[],M={x:innerWidth/2,y:innerHeight/2,t:Date.now()};
const pick=a=>a[Math.random()*a.length|0],clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const SP=[[40,150],[392,190],[398,310]];
class Lumi{
  constructor(host,mini,w,o={}){
    this.host=host;this.mv=!!o.mv;this.say=o.say;this.fluid=!!o.fluid;
    this.a='idle';this.t0=performance.now();this.dir=1;this.ox=0;this.ex=0;this.ey=0;this.tx=0;this.ty=0;
    this.bs=-1e9;this.bn=0;this.nx=performance.now()+4000;this.hard=false;
    this.setMode(mini,w);L.push(this);
  }
  setMode(mini,w){
    this.mini=mini;
    if(!this.wrap){this.wrap=document.createElement('div');this.wrap.className='lw';this.host.appendChild(this.wrap)}
    this.wrap.style.width=this.fluid?'100%':w+'px';this.wrap.style.maxWidth=this.fluid?w+'px':'100%';
    this.wrap.innerHTML=svg(mini);
    const s=this.wrap,q=n=>s.querySelector(n);
    this.q={root:q('.root'),sh:q('.sh'),head:q('.head'),body:q('.body'),aL:q('.aL .arm'),aR:q('.aR .arm'),fl:q('.fl'),fr:q('.fr'),eyes:q('.eyes'),eo:q('.eo'),eh:q('.eh'),es:q('.es'),eyeEls:[...s.querySelectorAll('.eye')],cu:q('.cu'),cr:q('.cr'),cg:q('.cg'),sp:[...s.querySelectorAll('.sp')],z:[...s.querySelectorAll('.z')],bg:q('.bg')};
  }
  play(a,hard){
    this.a=a;this.t0=performance.now();this.hard=!!hard;
    if(a=='walk')this.dir=this.ox<-110?1:this.ox>-30?-1:(Math.random()<.5?1:-1);
    if(this.say&&SAY[a])this.say(a);
  }
  look(){
    const r=this.wrap.getBoundingClientRect(),dx=M.x-(r.left+r.width/2),dy=M.y-(r.top+r.height*.4);
    this.tx=clamp(dx/80,-1,1)*7;this.ty=clamp(dy/80,-1,1)*5;
  }
  frame(now,dt){
    const tt=(now-this.t0)/1000,d=A[this.a];
    if(d.dur&&tt>=d.dur){this.play('idle');return}
    if(this.a=='idle'){
      this.look();
      if(now>this.nx){this.nx=now+4200+Math.random()*4500;this.play(Date.now()-M.t>30000?'sleep':pick(['wave','jump','think','walk','dance','happy']));return}
    }else{this.tx=0;this.ty=0}
    this.ex+=(this.tx-this.ex)*.14;this.ey+=(this.ty-this.ey)*.14;
    if(now>this.bn){this.bs=now;this.bn=now+2200+Math.random()*3600}
    const u=(now-this.bs)/160,bl=u<1?1-.92*S_(PI*u):1;
    if(this.a=='walk'&&this.mv){this.ox=clamp(this.ox+this.dir*60*dt,-150,0);this.host.style.transform='translateX('+this.ox+'px)'}
    const p=Object.assign({x:0,y:0,sq:0,hr:0,hx:0,hy:0,br:0,by:0,aL:-38,aR:-38,fl:0,fr:0,mood:0,ex:this.ex,ey:this.ey,cy:0,cr:18,gl:.8,sp:0,z:0,bg:''},d.f(tt,this));
    const q=this.q,k=this.mini?1.1:1,kb=this.mini?.88:1,sm=this.mini?.82:1,m=p.mood;
    q.root.setAttribute('transform',`translate(${p.x} ${-p.y}) translate(205 430) scale(${1+p.sq} ${1-p.sq}) translate(-205 -430)`);
    q.sh.setAttribute('rx',125*(1-p.y/330));q.sh.setAttribute('opacity',.3*(1-p.y/260));
    q.head.setAttribute('transform',`translate(${p.hx} ${p.hy}) translate(200 190) rotate(${p.hr}) scale(${k}) translate(-200 -190)`);
    q.body.setAttribute('transform',`translate(0 ${p.by}) translate(205 390) scale(${kb}) translate(-205 -390) rotate(${p.br} 205 331)`);
    q.aL.setAttribute('transform',`translate(152 302) scale(${sm}) rotate(${p.aL}) translate(-152 -302)`);
    q.aR.setAttribute('transform',`translate(410 0) scale(-1 1) translate(152 302) scale(${sm}) rotate(${p.aR}) translate(-152 -302)`);
    q.fl.setAttribute('transform',`translate(0 ${-p.fl})`);q.fr.setAttribute('transform',`translate(0 ${-p.fr})`);
    q.eyes.setAttribute('transform',`translate(${p.ex} ${p.ey})`);
    q.eo.style.display=m==1||m==2?'none':'';q.eh.style.display=m==1?'inline':'none';q.es.style.display=m==2?'inline':'none';
    const es=m==3?1.18:1;q.eyeEls.forEach(e=>e.style.transform=`scale(${es},${es*(m==0?bl:1)})`);
    q.cu.setAttribute('transform',`translate(0 ${p.cy})`);q.cr.setAttribute('transform',`rotate(${p.cr} 322 52)`);
    q.cg.style.opacity=p.gl*(.85+.15*S_(now/300));
    q.sp.forEach((e,i)=>{const s=p.sp?.45+.55*Math.abs(S_(now/180+i*2)):0;e.setAttribute('transform',`translate(${SP[i][0]} ${SP[i][1]}) scale(${s})`)});
    q.z.forEach((e,i)=>{const f=(now/1000*.6+i*.5)%1;e.setAttribute('transform',`translate(${70-i*30+f*12} ${150-f*70-i*34})`);e.style.opacity=p.z?1-f:0});
    q.bg.textContent=p.bg||'!';q.bg.style.opacity=p.bg?1:0;
  }
}


const TEXT = {
  ru: {label:'Lumi — талисман ERADIS. Поздороваться', hide:'Свернуть Lumi', show:'Показать Lumi', wave:'Привет! Я Lumi ✨', happy:'Ойна. Таны. Өс. ✨', jump:'Ещё один шаг к открытию!', dance:'Играем и узнаём новое!', surprise:'О, привет! 👋'},
  kk: {label:'Lumi — ERADIS бойтұмары. Сәлемдесу', hide:'Lumi-ді жасыру', show:'Lumi-ді көрсету', wave:'Сәлем! Мен Lumi ✨', happy:'Ойна. Таны. Өс. ✨', jump:'Жаңа ашылымға тағы бір қадам!', dance:'Ойнап, жаңаны танимыз!', surprise:'О, сәлем! 👋'}
};
const language = () => document.documentElement.lang === 'kk' ? 'kk' : 'ru';
const dock = document.createElement('aside');
dock.className = 'eradis-lumi';
dock.innerHTML = `<button class="lumi-character" type="button"><svg class="lumi-defs" width="0" height="0" aria-hidden="true"><defs>
<linearGradient id="eradis-lumi-gT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3CC9AE"/><stop offset=".42" stop-color="#008F79"/><stop offset="1" stop-color="#006453"/></linearGradient>
<linearGradient id="eradis-lumi-gY" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFEB9A"/><stop offset=".5" stop-color="#FFD45A"/><stop offset="1" stop-color="#E7A92B"/></linearGradient>
<radialGradient id="eradis-lumi-gYr" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#FFF3B8"/><stop offset=".55" stop-color="#FFD45A"/><stop offset="1" stop-color="#E7A92B"/></radialGradient>
<radialGradient id="eradis-lumi-gE" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#FFF0A6"/><stop offset=".5" stop-color="#FFD45A"/><stop offset="1" stop-color="#E3A62C"/></radialGradient>
<linearGradient id="eradis-lumi-gM" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#C9E4D6"/></linearGradient>
<radialGradient id="eradis-lumi-gG"><stop offset="0" stop-color="#FFD45A" stop-opacity=".6"/><stop offset="1" stop-color="#FFD45A" stop-opacity="0"/></radialGradient>
<filter id="eradis-lumi-b4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="eradis-lumi-b6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="eradis-lumi-b8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
<clipPath id="eradis-lumi-cH"><rect x="105" y="100" width="190" height="180" rx="58"/></clipPath>
</defs></svg></button><button class="lumi-hide" type="button">×</button><button class="lumi-restore" type="button" hidden><img src="mark.svg" alt="" width="22" height="22"><span>Lumi</span></button><p class="lumi-bubble" role="status" aria-live="polite" hidden></p>`;
document.body.append(dock);
const character = dock.querySelector('.lumi-character');
const hide = dock.querySelector('.lumi-hide');
const restore = dock.querySelector('.lumi-restore');
const bubble = dock.querySelector('.lumi-bubble');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let collapsed = false, bubbleTimer, frameId = 0, lastFrame = 0;
try { collapsed = localStorage.getItem('eradis_lumi_collapsed_v1') === 'true'; } catch {}
function closeBubble() { clearTimeout(bubbleTimer); bubble.hidden = true; }
function say(action) {
  const message = TEXT[language()][action];
  if (!message) return;
  bubble.textContent = message; bubble.hidden = false;
  clearTimeout(bubbleTimer); bubbleTimer = setTimeout(closeBubble, 2800);
}
const mascot = new Lumi(character, true, 112);
mascot.wrap.querySelector('svg').setAttribute('aria-hidden','true');
mascot.wrap.querySelector('svg').removeAttribute('role');
function copy() {
  const t = TEXT[language()];
  character.setAttribute('aria-label', t.label); character.title = t.label;
  hide.setAttribute('aria-label', t.hide); hide.title = t.hide;
  restore.setAttribute('aria-label', t.show); restore.title = t.show;
  dock.setAttribute('aria-label','Lumi · ERADIS');
  closeBubble();
}
new MutationObserver(copy).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
function still() {
  const next = mascot.nx;
  mascot.play('idle'); mascot.nx = Infinity;
  mascot.frame(mascot.t0, 0); mascot.nx = next;
}
function run(now) {
  frameId = 0;
  if (collapsed || document.hidden || motion.matches || dock.classList.contains('lumi-editing')) return;
  // 30 fps is enough for this small decorative character.
  if (now - lastFrame >= 32) { const dt = Math.min(.05,(now-lastFrame)/1000); lastFrame = now; mascot.frame(now,dt); }
  frameId = requestAnimationFrame(run);
}
function restart() {
  cancelAnimationFrame(frameId); frameId = 0; lastFrame = performance.now();
  if (motion.matches) still();
  else if (!collapsed && !document.hidden && !dock.classList.contains('lumi-editing')) frameId = requestAnimationFrame(run);
}
function setCollapsed(value, focus = false) {
  collapsed = value; dock.classList.toggle('lumi-collapsed',value);
  character.hidden = value; hide.hidden = value; restore.hidden = !value;
  closeBubble(); restart();
  try { localStorage.setItem('eradis_lumi_collapsed_v1',String(value)); } catch {}
  if(focus) (value ? restore : character).focus();
}
function wake(event) {
  M.t = Date.now();
  if (event?.clientX !== undefined) { M.x = event.clientX; M.y = event.clientY; }
  if(mascot.a === 'sleep') { mascot.play('surprise'); restart(); }
}
character.addEventListener('click', () => {
  wake();
  const action = pick(['wave','happy','jump','dance']);
  if (!motion.matches) mascot.play(action);
  say(action);
});
hide.addEventListener('click', () => setCollapsed(true,true));
restore.addEventListener('click', () => { setCollapsed(false,true); if (!motion.matches) mascot.play('wave'); say('wave'); });
document.addEventListener('pointermove',wake,{passive:true});
document.addEventListener('pointerdown',wake,{passive:true});
document.addEventListener('keydown',wake);
document.addEventListener('visibilitychange',restart);
motion.addEventListener('change',restart);
function editing() {
  // Keep the character away from mobile keyboards and compact forms.
  const el = document.activeElement;
  dock.classList.toggle('lumi-editing',!!el?.matches('input,textarea,select,[contenteditable="true"]'));
  restart();
}
document.addEventListener('focusin',editing);
document.addEventListener('focusout',() => queueMicrotask(editing));
copy(); still(); setCollapsed(collapsed);

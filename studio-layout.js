// Position original live ERADIS nodes; retain their listeners and native styling.
const OWNED=['position','left','top','width','height','transform','opacity','z-index','overflow','border','border-radius','background','color','font-size','font-family','box-shadow','--studio-height'];
function remember(grid,node){
 grid._studioOriginalStyles??=new Map();
 if(!grid._studioOriginalStyles.has(node))grid._studioOriginalStyles.set(node,OWNED.map(key=>[key,node.style.getPropertyValue(key),node.style.getPropertyPriority(key)]));
}
function restore(grid,node){
 for(const [key,value,priority] of grid._studioOriginalStyles?.get(node)||[])value?node.style.setProperty(key,value,priority):node.style.removeProperty(key);
 delete node.dataset.studioHidden;
}
export function applyStudioLayout(doc,surface,grid,nodes){
 const placements=doc?.roomUiLayout?.[surface]||[],active=placements.length>0;
 if(!active&&!grid.classList.contains('studio-live-layout'))return;
 grid.classList.toggle('studio-live-layout',active);
 let link=document.getElementById('eradis-studio-room-css');
 if(active&&!link){link=document.createElement('link');link.id='eradis-studio-room-css';link.rel='stylesheet';link.href='./studio-room.css';document.head.append(link);}
 grid.querySelectorAll('[data-studio-decor]').forEach(node=>node.remove());
 for(const node of Object.values(nodes)){remember(grid,node);restore(grid,node);}
 grid.style.height='';
 if(!active){grid._studioLayoutRender=null;grid._studioResize?.disconnect();delete grid._studioResize;return;}
 const render=()=>{
  const mobile=grid.clientWidth<760,width=doc.settings?.layoutWidth||1440,scale=Math.max(.2,Math.min(1.5,grid.clientWidth/width));let maxY=0;const placed=new Set();
  for(const e of [...placements].sort((a,b)=>a.y-b.y||a.x-b.x)){
   let node=e.type==='widget'?nodes[e.data.blockId]:grid.querySelector(`[data-studio-decor="${e.id}"]`);
   if(!node&&e.type==='media-decor'){
    node=document.createElement('div');node.dataset.studioDecor=e.id;
    if(e.data.url){const img=document.createElement('img');img.src=e.data.url;img.alt=e.data.text||'';node.append(img);}else node.textContent=e.data.text||'';
    grid.append(node);
   }
   if(!node)continue;placed.add(node);node.dataset.studioHidden=String(e.hidden);if(e.hidden)continue;
   node.style.setProperty('--studio-height',mobile?'230px':e.h*scale+'px');
   const s=e.style;
   Object.assign(node.style,{position:mobile?'relative':'absolute',left:mobile?'':Math.max(0,e.x)*scale+'px',top:mobile?'':Math.max(0,e.y)*scale+'px',width:mobile?'100%':e.w*scale+'px',height:mobile?'auto':e.h*scale+'px',overflow:'auto',transform:mobile?'':`rotate(${e.rotation}deg)`,opacity:s.opacity,zIndex:e.z+100,border:s.borderWidth+'px solid '+s.border,borderRadius:s.radius+'px',background:s.gradient?`linear-gradient(135deg,${s.fill},${s.border})`:s.fill,color:s.text,fontSize:s.fontSize+'px',fontFamily:s.fontFamily,boxShadow:s.shadow?'0 12px 32px #0003':'none'});
   if(mobile)grid.append(node);maxY=Math.max(maxY,Math.max(0,e.y)+e.h);
  }
  // Modules missing from an older saved layout remain accessible.
  for(const node of Object.values(nodes))if(!placed.has(node)){
   restore(grid,node);
   if(mobile){node.style.position='relative';node.style.width='100%';}
   else{Object.assign(node.style,{position:'absolute',left:'0px',top:(maxY+30)*scale+'px',width:grid.clientWidth+'px',height:'360px',overflow:'auto'});maxY+=410;}
  }
  grid.style.height=mobile?'auto':(maxY+50)*scale+'px';
 };
 grid._studioLayoutRender=render;render();
 if(!grid._studioResize){let width=-1;grid._studioResize=new ResizeObserver(()=>{if(width===grid.clientWidth)return;width=grid.clientWidth;grid._studioLayoutRender?.();});grid._studioResize.observe(grid);}
}

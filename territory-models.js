import * as THREE from 'three';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const plots=[];
for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++)if(x&&z)plots.push({x:x*.76,z:z*.76,d:Math.hypot(x,z),seed:(x+5)*17+(z+5)*11});
plots.sort((a,b)=>a.d-b.d||a.seed-b.seed);
plots.forEach((p,i)=>{p.base=1+i%4;p.top=i<24?14+i%5*3:p.base;});
const baseQueue=[],towerQueue=[],neonQueue=[];
plots.forEach((p,i)=>{for(let f=1;f<=p.base;f++)baseQueue.push({i,f,cost:p.d+f*1.3});for(let f=p.base+1;f<=p.top;f++)towerQueue.push({i,f,cost:(f-p.base)*.7+p.d*.2});});
baseQueue.sort((a,b)=>a.cost-b.cost||a.i-b.i);towerQueue.sort((a,b)=>a.cost-b.cost||a.i-b.i);
plots.forEach((p,i)=>{for(let f=1;f<=(i<24?6:2);f++)neonQueue.push({i,f,cost:f+p.d*.2});});neonQueue.sort((a,b)=>a.cost-b.cost||a.i-b.i);

// A reversible construction plan: each resource interval adds actual storeys,
// rather than scaling a finished skyline or swapping it at one threshold.
export function territoryPlan(value){
 const resource=clamp(Number(value)||0,0,10000),kind=resource<100?'terrain':resource<5000?'city':resource<9000?'neon':resource<10000?'assembly':'orbital',floors=plots.map(()=>0);
 if(resource>=5000){
  // Keep a permanent clear launch court; the city surrounds the same footprint
  // throughout the neon, construction and orbital stages.
  plots.forEach((p,i)=>{floors[i]=Math.abs(p.x)<2.5&&Math.abs(p.z)<1.7?0:(p.z>0?3+i%3:22+i%4*3);});
  const extra=Math.floor(clamp((resource-5000)/4000,0,1)*neonQueue.length);for(let k=0;k<extra;k++)if(floors[neonQueue[k].i])floors[neonQueue[k].i]++;
 }else if(kind==='city'){
  const base=Math.min(baseQueue.length,4+Math.floor((Math.min(resource,1000)-100)/900*(baseQueue.length-4)));
  const extra=Math.floor(clamp((resource-1000)/4000,0,1)*towerQueue.length);
  for(let k=0;k<base;k++)floors[baseQueue[k].i]++;for(let k=0;k<extra;k++)floors[towerQueue[k].i]++;
 }
 return {resource,kind,floors,totalFloors:floors.reduce((a,b)=>a+b,0),buildings:floors.filter(Boolean).length,neon:resource>=5000?1:0,orbital:kind==='orbital'?1:0,stationProgress:resource>=9000?Math.max(.035,(resource-9000)/1000):0};
}

export function createFutureTerritory({stage=0,unit=1,mobile=false,palette='steppe'}={}){
 const root=new THREE.Group();root.name='territory-construction';root.position.y=.82;root.scale.setScalar(unit);
 const mats={
  stone:new THREE.MeshStandardMaterial({color:0xffffff,roughness:.84,metalness:.08}),
  glass:new THREE.MeshStandardMaterial({color:0xb9e6ed,emissive:0x83bad2,emissiveIntensity:.12,metalness:.25,roughness:.28}),
  trim:new THREE.MeshStandardMaterial({color:0xd6d5c9,roughness:.6,metalness:.3}),
  roof:new THREE.MeshStandardMaterial({color:0xffffff,roughness:.75}),
  road:new THREE.MeshStandardMaterial({color:0x55626a,roughness:1}),
  light:new THREE.MeshBasicMaterial({color:0xffffff}),
  hull:new THREE.MeshStandardMaterial({color:0xe1e9ef,metalness:.45,roughness:.4}),
  ring:new THREE.MeshStandardMaterial({color:0xcedce8,emissive:0x23506b,emissiveIntensity:.25,metalness:.55,roughness:.4})
 };
 const geometry={stone:new THREE.BoxGeometry(),glass:new THREE.BoxGeometry(),trim:new THREE.BoxGeometry(),roof:new THREE.ConeGeometry(1,1,4),road:new THREE.BoxGeometry(),light:new THREE.BoxGeometry(),hull:new THREE.CylinderGeometry(1,1,1,12),ring:new THREE.TorusGeometry(2.55,.12,6,4,Math.PI*2/48*.98)};
 const capacity={stone:1100,glass:3600,trim:2000,roof:128,road:128,light:1400,hull:160,ring:192};
 const dummy=new THREE.Object3D(),color=new THREE.Color();
 const warm={steppe:[0xd8c8a3,0xb9ad93,0xe9dfc8],mountain:[0xd6d5c9,0xb0bfc2,0xe9e5d5],desert:[0xe2cda6,0xc5a47c,0xeee0c4],south:[0xd5d6bd,0xc8b89b,0xf0e3c5]}[palette]||[0xd8c8a3,0xb9ad93,0xe9dfc8];
 function layer(name){const group=new THREE.Group();group.name=name;const meshes={};for(const k of Object.keys(mats)){const mesh=new THREE.InstancedMesh(geometry[k],mats[k],capacity[k]);mesh.userData.part=k;mesh.count=0;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;group.add(mesh);meshes[k]=mesh;}root.add(group);return {group,meshes};}
 const simple=layer('overview-silhouette'),detail=layer('focused-detail');detail.group.visible=false;
 // Separate instances let only the station lift off, keeping the skyline fixed.
 const stationGeometry={...geometry,hull:new THREE.CylinderGeometry(1,1,1,24),roof:new THREE.ConeGeometry(1,1,24),ring:new THREE.TorusGeometry(2.25,.085,8,6,Math.PI*2/48*.99)};
 function stationLayer(parent){const group=new THREE.Group();group.name='orbital-station';group.scale.setScalar(.6);const meshes={};for(const k of Object.keys(mats)){const mesh=new THREE.InstancedMesh(stationGeometry[k],mats[k],capacity[k]);mesh.userData.part=k;mesh.userData.stationPart=true;mesh.count=0;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;group.add(mesh);meshes[k]=mesh;}parent.add(group);return {group,meshes};}
 const stationSimple=stationLayer(simple.group),stationDetail=stationLayer(detail.group);
 let launchY=0,launchTarget=0,lastTick=null;

 let resource=stage>=8?10000:stage===7?9000:stage===6?5000:0,focused=false,lowPower=mobile,last='';
 function draw(layer,plan,detailed){
  const count=Object.fromEntries(Object.keys(mats).map(k=>[k,0]));
  function put(k,x,y,z,sx,sy,sz,tint=0xffffff,angle=0,rx=0){
   const mesh=layer.meshes[k],i=count[k]++;if(i>=capacity[k])throw new Error('Territory instance capacity exceeded: '+k);
   dummy.position.set(x,y,z);if(k==='ring')dummy.rotation.set(rx,0,angle);else dummy.rotation.set(rx,angle,0);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,color.set(tint));
  }
  const {floors,neon,orbital}=plan;
  if(plan.resource>=100){
   // Stone paving, intersecting avenues, lanes and neighbourhood streets.
   put('road',0,-.02,0,7,.06,.36);put('road',0,-.015,0,.36,.06,7);
   for(let i=-6;i<=6;i++){put('light',i*.5,.02,0,.19,.012,.025,0xf4d58d);put('light',0,.025,i*.5,.025,.012,.19,0xf4d58d);}
   for(const side of [-1,1]){put('trim',side*.25,.01,0,.08,.055,7);put('trim',0,.01,side*.25,7,.055,.08);}
  }
  if(plan.neon){
   // The launch apron occupies a reserved court, not existing building plots.
   put('road',0,.012,0,5,.04,3.4,0x293e50);
   for(const side of [-1,1]){put('light',0,.04,side*1.62,4.8,.015,.035,0x46bece);put('light',side*2.42,.04,0,.035,.015,3.2,0x46bece);}
   if(plan.stationProgress>0){put('trim',0,.06,0,2.5,.06,2.5,0x5d7583);for(const side of [-1,1])put('light',side*.7,.1,0,.035,.015,1.8,0xffd387);put('light',0,.1,0,1.4,.015,.035,0xffd387);}
  }
  if(plan.kind==='city'||plan.neon){
   floors.forEach((n,i)=>{
    if(!n)return;const p=plots[i],height=.22,highRise=n>p.base,neonTower=!!plan.neon,w=highRise?.62+(i%3)*.04:.48+(i%3)*.025;
    put('trim',p.x,.025,p.z,.64,.05,.64,0xb6b3a6);
    const steps=detailed?n:1;
    for(let f=0;f<steps;f++){
     const real=detailed?f:0,levels=detailed?1:n,setback=highRise?Math.max(.58,1-Math.floor(real/5)*.09):1,ww=w*setback;
     const tint=neonTower?([0x2b4052,0x32494f,0x445368][i%3]):warm[i%3];
     put('stone',p.x,.07+(real+levels/2)*height,p.z,ww,levels*height-.014,ww*.9,tint);
     if(detailed){
      put('trim',p.x,.07+(f+1)*height,p.z,ww*1.025,.022,ww*.93,neonTower?0x87b4bf:0xd9d3bf);
      put('glass',p.x,.07+(f+.54)*height,p.z+ww*.455,ww*.72,.11,.012);
      if(!lowPower){put('glass',p.x,.07+(f+.54)*height,p.z-ww*.455,ww*.72,.11,.012);put('glass',p.x+ww*.505,.07+(f+.54)*height,p.z,.012,.11,ww*.62);}
      if(neonTower&&f%3===1)put('light',p.x-ww*.51,.07+(f+.5)*height,p.z,.018,.21,.025,i%3?0x6fe7f2:0xf39fc6);
     }else{for(let f=1;f<n;f+=neonTower?3:1)put('trim',p.x,.07+f*height,p.z,w*1.01,.025,w*.92,0xb7cbd0);}
    }
    if(neonTower){put('light',p.x-w*.51,.07+n*height*.52,p.z,.022,n*height*.88,.022,i%2?0x34dbe6:0xeb5cae);if(detailed&&!lowPower&&i%3===0){put('stone',p.x,.07+n*height*.7,p.z+w*.47,w*.8,.38,.045,0x1b2b40);for(let mark=0;mark<3;mark++)put('light',p.x-w*.24+mark*w*.24,.07+n*height*.7,p.z+w*.5,.035,.22,.018,i%2?0x62e4e8:0xf088bc);}}
    const top=.07+n*height,cap=neonTower?Math.max(.58,1-Math.floor((n-1)/5)*.09):1;
    if(n<=2){put('roof',p.x,top+.14,p.z,w*.79,.28,w*.72,palette==='south'?0x457e77:0x876b58,Math.PI/4);}
    else{
     put('trim',p.x,top+.04,p.z,w*cap*1.05,.07,w*cap,0xc7d4d3);
     put('stone',p.x+.06,top+.12,p.z-.04,w*cap*.36,.13,w*cap*.34,0x6c838a);
     if(neonTower){put('light',p.x,top+.085,p.z+w*cap*.51,w*cap*.85,.035,.025,i%2?0x6de9f1:0xe5a0d8);if(detailed)put('trim',p.x-.1,top+.26,p.z,.025,.4,.025);}
    }
   });
   // Public square and a regional cultural pavilion; roofs are not floating.
   if(plan.kind==='city'&&plan.resource>=250){put('trim',.65,.05,.65,.92,.1,.92,0xd0c6aa);put('stone',.65,.24,.65,.52,.38,.52,0xe7dbc2);put('hull',.65,.47,.65,.32,.12,.32,0x659b99);put('hull',.65,.64,.65,.025,.24,.025,0xe2c57b);}
   if(neon>0){for(const side of [-1,1]){put('light',0,.045,side*.17,6.8*neon,.018,.025,0x6cddeb);put('light',side*.17,.05,0,.025,.018,6.8*neon,0xe09bca);}}
  }
  for(const [k,mesh]of Object.entries(layer.meshes)){mesh.count=count[k];mesh.boundingSphere=null;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
 }
 function drawStation(layer,plan,detailed){
  const count=Object.fromEntries(Object.keys(mats).map(k=>[k,0]));
  const progress=plan.stationProgress;
  function put(k,x,y,z,sx,sy,sz,tint=0xffffff,ry=0,rx=0,rz=0){
   const i=count[k]++;if(i>=capacity[k])throw new Error('Station instance capacity exceeded: '+k);
   dummy.position.set(x,y,z);dummy.rotation.set(rx,ry,rz);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();layer.meshes[k].setMatrixAt(i,dummy.matrix);layer.meshes[k].setColorAt(i,color.set(tint));
  }
  if(progress>0){
   // Central pressure hull and a stepped command spire: additions are bolted
   // onto the same grounded assembly instead of scaling a finished object.
   const decks=Math.max(1,Math.floor(progress*11));
   for(let i=0;i<decks;i++){
    const r=[.48,.6,.78,.83,.83,.72,.63,.5,.37,.26,.14][i],y=.42+i*.24;
    put('hull',0,y,0,r,.22,r,0xe8f0ee);
    put('hull',0,y+.1,0,r*1.03,.028,r*1.03,i%2?0x24b9c5:0x738b9a);
    if(detailed&&i>3)for(let a=0;a<8;a++){const t=a*Math.PI/4;put('glass',Math.cos(t)*(r+.012),y,Math.sin(t)*(r+.012),.015,.075,r*.36,0x57d0df,-t);}
   }
   // Three landing feet and engine nacelles establish a grounded silhouette.
   for(let i=0;i<3;i++){const a=i*Math.PI*2/3,x=Math.cos(a)*.88,z=Math.sin(a)*.88;
    put('trim',x,.18,z,.1,.32,.1,0x8095a4);put('trim',x,.025,z,.45,.055,.3,0xc0d0d5,-a);
    if(progress>=.5){put('hull',x,.36,z,.21,.35,.21,0x667d8f);put('roof',x,.13,z,.25,.24,.25,0x283c54,0,Math.PI);}
   }
   // Six radial trusses build before the habitation ring; no floating modules.
   const arms=Math.floor(clamp((progress-.08)/.25,0,1)*6);
   for(let i=0;i<arms;i++){const a=i*Math.PI/3;
    put('trim',Math.cos(a)*1.18,.92,Math.sin(a)*1.18,1.8,.12,.14,0xc6d3da,-a);
    if(detailed){put('trim',Math.cos(a)*1.18,.7,Math.sin(a)*1.18,1.8,.06,.12,0x5c7f8e,-a);}
   }
   const ringSegments=Math.floor(clamp((progress-.3)/.3,0,1)*48);
   for(let i=0;i<ringSegments;i++){
    const a=i*Math.PI*2/48;
    put('ring',0,.95,0,1,1,1,0xc8dce2,0,Math.PI/2,a);
    put('ring',0,1.27,0,1,1,1,0xe0ece9,0,Math.PI/2,a);
    if(detailed&&i%2===0){put('glass',Math.cos(a)*2.25,1.11,Math.sin(a)*2.25,.26,.18,.095,0x42b4c7,-a+Math.PI/2);}
   }
   const habitats=Math.floor(clamp((progress-.55)/.25,0,1)*6);
   for(let i=0;i<habitats;i++){const a=i*Math.PI/3,x=Math.cos(a)*2.25,z=Math.sin(a)*2.25;
    put('hull',x,1.11,z,.25,.82,.25,0xe3ebe5,-a,0,Math.PI/2);
    put('hull',x,1.11,z,.255,.09,.255,0x6b96a8,-a,0,Math.PI/2);
    if(detailed)put('light',Math.cos(a)*2.51,1.11,Math.sin(a)*2.51,.06,.1,.18,0x66e3e6,-a);
   }
   // A smaller service ring, asymmetric docking piers and modular solar wings.
   const upper=Math.floor(clamp((progress-.72)/.18,0,1)*48);
   for(let i=0;i<upper;i++)put('ring',0,1.92,0,.63,.63,.63,0x87aeba,0,Math.PI/2,i*Math.PI*2/48);
   const docks=Math.floor(clamp((progress-.65)/.2,0,1)*4);
   for(let i=0;i<docks;i++){const a=Math.PI/4+i*Math.PI/2,x=Math.cos(a)*2.65,z=Math.sin(a)*2.65;
    put('trim',x,1.1,z,.7,.12,.18,0xaac1ca,-a);put('hull',Math.cos(a)*2.98,1.1,Math.sin(a)*2.98,.22,.12,.22,0xdce7e9,-a,0,Math.PI/2);
    put('light',Math.cos(a)*3,1.24,Math.sin(a)*3,.08,.025,.08,0xffc768);
   }
   const wings=Math.floor(clamp((progress-.8)/.2,0,1)*4);
   for(let i=0;i<wings;i++){
    const side=i%2?1:-1,x=side*3.12,z=i<2?-1.12:1.12;
    put('trim',side*2.75,.8,z,1.25,.09,.12,0xa8c7d0);
    put('trim',x,.83,z,1.35,.06,1.02,0xbbd3da);put('stone',x,.875,z,1.23,.025,.92,0x183d70);
    const strips=detailed&&!lowPower?8:4;for(let k=0;k<strips;k++)put('light',x-.53+k*1.06/(strips-1),.896,z,.012,.008,.88,0x64a5ca);
    if(detailed)for(let k=-1;k<=1;k++)put('trim',x,.899,z+k*.28,1.22,.01,.012,0x527eaa);
   }
   if(progress>=.9){
    put('hull',0,3.13,0,.04,.6,.04,0xc4d8e0);put('light',0,3.46,0,.07,.07,.07,0x71f7d8);
    put('hull',.32,2.83,0,.24,.07,.24,0xf0e9d5,0,0,.5);
   }
   // Thruster plumes belong to the moving station, never to the city below.
   if(plan.orbital)for(let i=0;i<3;i++){const a=i*Math.PI*2/3;
    put('roof',Math.cos(a)*.88,-.25,Math.sin(a)*.88,.16,.65,.16,0x4fd6f0,0,Math.PI);
    put('roof',Math.cos(a)*.88,-.13,Math.sin(a)*.88,.09,.38,.09,0xe3ffff,0,Math.PI);
   }
  }
  layer.group.visible=progress>0;
  for(const[k,mesh]of Object.entries(layer.meshes)){mesh.count=count[k];mesh.boundingSphere=null;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
 }
 function update(value=resource){
  resource=clamp(value,0,10000);const key=resource+':'+focused+':'+lowPower;if(key===last)return;last=key;
  const plan=territoryPlan(resource);draw(focused?detail:simple,plan,focused);drawStation(focused?stationDetail:stationSimple,plan,focused);
  launchTarget=plan.orbital?9:0;
  // Falling below launch eligibility immediately returns the grounded assembly.
  if(!plan.orbital)launchY=0;
  stationSimple.group.position.y=stationDetail.group.position.y=launchY;
  root.userData.plan=plan;detail.group.visible=focused;simple.group.visible=!focused;
 }
 root.userData.simple=simple.group;root.userData.detail=detail.group;
 root.userData.stationSimple=stationSimple.group;root.userData.stationDetail=stationDetail.group;
 root.userData.setDetail=(focus,low)=>{focused=!!focus;lowPower=!!low;update();};root.userData.update=update;
 root.userData.inspect=()=>({resource,totalFloors:root.userData.plan.totalFloors,buildings:root.userData.plan.buildings,orbital:root.userData.plan.orbital,stationProgress:root.userData.plan.stationProgress,launchHeight:launchY,launchTarget,kind:root.userData.plan.kind,focused,lowPower,height:Math.max(root.userData.plan.stationProgress>0?launchY+2.2:0,...root.userData.plan.floors.map(n=>n*.22+.65))});
 root.userData.tick=(seconds,{animate=true,spin=focused}={})=>{
  const dt=lastTick===null?1/60:clamp(seconds-lastTick,0,.1);lastTick=seconds;
  launchY=animate?THREE.MathUtils.lerp(launchY,launchTarget,1-Math.exp(-dt*1.65)):launchTarget;
  if(Math.abs(launchTarget-launchY)<.01)launchY=launchTarget;
  stationSimple.group.position.y=stationDetail.group.position.y=launchY;
  // No perpetual ground rotation: habitat rings rotate only after liftoff.
  const ring=(focused?stationDetail:stationSimple).meshes.ring;ring.rotation.y=spin&&root.userData.plan.orbital?seconds*.08:0;
  return Math.abs(launchY-launchTarget)>.01||!!(spin&&animate&&root.userData.plan.orbital);
 };
 update(resource);return root;
}
export function setFutureDetail(root,focused,lowPower){root.userData.setDetail(focused,lowPower);}

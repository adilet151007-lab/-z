import * as THREE from 'three';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const plots=[];
for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++)if(x&&z)plots.push({x:x*.76,z:z*.76,d:Math.hypot(x,z),seed:(x+5)*17+(z+5)*11});
plots.sort((a,b)=>a.d-b.d||a.seed-b.seed);
plots.forEach((p,i)=>{p.base=1+i%4;p.top=i<24?14+i%5*3:p.base;});
const baseQueue=[],towerQueue=[];
plots.forEach((p,i)=>{for(let f=1;f<=p.base;f++)baseQueue.push({i,f,cost:p.d+f*1.3});for(let f=p.base+1;f<=p.top;f++)towerQueue.push({i,f,cost:(f-p.base)*.7+p.d*.2});});
baseQueue.sort((a,b)=>a.cost-b.cost||a.i-b.i);towerQueue.sort((a,b)=>a.cost-b.cost||a.i-b.i);

// A reversible construction plan: each resource interval adds actual storeys,
// rather than scaling a finished skyline or swapping it at one threshold.
export function territoryPlan(value){
 const resource=clamp(Number(value)||0,0,10000),floors=plots.map(()=>0);
 const base=resource<100?0:Math.min(baseQueue.length,4+Math.floor((Math.min(resource,1000)-100)/900*(baseQueue.length-4)));
 const extra=Math.floor(clamp((resource-1000)/4000,0,1)*towerQueue.length);
 for(let k=0;k<base;k++)floors[baseQueue[k].i]++;
 for(let k=0;k<extra;k++)floors[towerQueue[k].i]++;
 return {resource,floors,totalFloors:base+extra,buildings:floors.filter(Boolean).length,neon:clamp((resource-1000)/4000,0,1),orbital:clamp((resource-5000)/5000,0,1)};
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
 const capacity={stone:900,glass:3600,trim:2000,roof:128,road:128,light:1400,hull:160,ring:128};
 const dummy=new THREE.Object3D(),color=new THREE.Color();
 const warm={steppe:[0xd8c8a3,0xb9ad93,0xe9dfc8],mountain:[0xd6d5c9,0xb0bfc2,0xe9e5d5],desert:[0xe2cda6,0xc5a47c,0xeee0c4],south:[0xd5d6bd,0xc8b89b,0xf0e3c5]}[palette]||[0xd8c8a3,0xb9ad93,0xe9dfc8];
 function layer(name){const group=new THREE.Group();group.name=name;const meshes={};for(const k of Object.keys(mats)){const mesh=new THREE.InstancedMesh(geometry[k],mats[k],capacity[k]);mesh.count=0;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;group.add(mesh);meshes[k]=mesh;}root.add(group);return {group,meshes};}
 const simple=layer('overview-silhouette'),detail=layer('focused-detail');detail.group.visible=false;
 let resource=stage===7?10000:stage===6?5000:0,focused=false,lowPower=mobile,last='';
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
  if(plan.resource<10000){
   floors.forEach((n,i)=>{
    if(!n)return;const p=plots[i],height=.22,neonTower=n>p.base,w=neonTower?.62+(i%3)*.04:.48+(i%3)*.025;
    put('trim',p.x,.025,p.z,.64,.05,.64,0xb6b3a6);
    const steps=detailed?n:1;
    for(let f=0;f<steps;f++){
     const real=detailed?f:0,levels=detailed?1:n,setback=neonTower?Math.max(.58,1-Math.floor(real/5)*.09):1,ww=w*setback;
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
   if(plan.resource>=250){put('trim',.65,.05,.65,.92,.1,.92,0xd0c6aa);put('stone',.65,.24,.65,.52,.38,.52,0xe7dbc2);put('hull',.65,.47,.65,.32,.12,.32,0x659b99);put('hull',.65,.64,.65,.025,.24,.025,0xe2c57b);}
   if(neon>0){for(const side of [-1,1]){put('light',0,.045,side*.17,6.8*neon,.018,.025,0x6cddeb);put('light',side*.17,.05,0,.025,.018,6.8*neon,0xe09bca);}}
  }
  if(orbital>0){
   // The station is assembled module by module above the skyline. Its command
   // spine, habitat ring, docking pods and solar wings have distinct silhouettes.
   const budget=Math.floor(orbital*96),lift=3.2,central=Math.min(10,budget);
   for(let i=0;i<central;i++){
    const r=[.44,.6,.8,.72,.58,.42,.32,.26,.2,.12][i];
    put('hull',0,lift+i*.26,0,r,.23,r,0xdce8ed);
    put('hull',0,lift+i*.26+.105,0,r*1.03,.035,r*1.03,i%2?0x72c5db:0xadc1cb);
   }
   if(budget>=10){put('hull',0,lift+2.8,0,.055,.6,.055,0xb3c8d2);put('light',0,lift+3.12,0,.08,.07,.08,0x83e7f0);}
   const segments=Math.min(48,Math.max(0,budget-10));
   for(let i=0;i<segments;i++){
    const angle=i*2*Math.PI/48;
    put('ring',0,lift+.65,0,1,1,1,0xd3e1e5,angle,Math.PI/2);
   }
   const secondary=Math.floor(clamp((budget-64)/32,0,1)*48);
   for(let i=0;i<secondary;i++)put('ring',0,lift+1.45,0,.64,.64,.64,0xa6d6e2,i*2*Math.PI/48,Math.PI/2+.18);
   const arms=Math.min(6,Math.floor(Math.max(0,budget-35)/6));
   for(let i=0;i<arms;i++){
    const a=i*Math.PI/3,r=1.3,x=Math.cos(a)*r,z=Math.sin(a)*r;
    put('trim',x,lift+.62,z,2.45,.14,.18,0xa7bdc9,-a);
    put('hull',Math.cos(a)*2.7,lift+.68,Math.sin(a)*2.7,.26,.25,.26,0xcadce5);
    put('light',Math.cos(a)*2.7,lift+.83,Math.sin(a)*2.7,.16,.025,.16,0x70dae6);
   }
   const wings=Math.min(4,Math.floor(Math.max(0,budget-68)/7));
   for(let i=0;i<wings;i++){
    const side=i%2?1:-1,z=i<2?-1.35:1.35,x=side*2.65;
    put('trim',x,lift+.55,z,1.9,.09,.9,0xc0d0d8);put('stone',x,lift+.61,z,1.75,.035,.75,0x234d76);
    const strips=detailed&&!lowPower?7:3;for(let k=0;k<strips;k++)put('light',x-.75+k*1.5/(strips-1),lift+.64,z,.015,.008,.7,0x91c4de);
   }
  }
  for(const [k,mesh]of Object.entries(layer.meshes)){mesh.count=count[k];mesh.boundingSphere=null;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
 }
 function update(value=resource){resource=clamp(value,0,10000);const key=resource+':'+focused+':'+lowPower;if(key===last)return;last=key;const plan=territoryPlan(resource);draw(focused?detail:simple,plan,focused);root.userData.plan=plan;root.userData.detail.visible=focused;root.userData.simple.visible=!focused;}
 root.userData.simple=simple.group;root.userData.detail=detail.group;
 root.userData.setDetail=(focus,low)=>{focused=!!focus;lowPower=!!low;update();};root.userData.update=update;
 root.userData.inspect=()=>({resource,totalFloors:root.userData.plan.totalFloors,buildings:root.userData.plan.buildings,orbital:root.userData.plan.orbital,focused,lowPower,height:Math.max(root.userData.plan.orbital>0?6.5:0,...root.userData.plan.floors.map(n=>n*.22+.65))});
 root.userData.tick=seconds=>{(focused?detail:simple).meshes.ring.rotation.y=seconds*.06;};
 update(resource);return root;
}
export function setFutureDetail(root,focused,lowPower){root.userData.setDetail(focused,lowPower);}

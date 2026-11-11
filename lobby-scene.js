import * as THREE from './vendor/three/build/three.module.js';
import {GEOGRAPHY} from './region-geography.js';

const cityAngles = { astana: -.13, almaty: .1, turkistan: -.3 };
const tau = Math.PI * 2;

function addAtlasSignals(scene, world, paths, cities, surface) {
 const orbitalTicks = [];
 for(let i=0;i<120;i++){
  const a=i*tau/120, inner=i%10===0?.91:i%5===0?.95:.98;
  orbitalTicks.push(Math.cos(a)*6.05*inner,-.83,Math.sin(a)*4.1*inner,
                    Math.cos(a)*6.05,-.83,Math.sin(a)*4.1);
 }
 const dial = new THREE.LineSegments(
  new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(orbitalTicks,3)),
  new THREE.LineBasicMaterial({color:0x81d9c7,transparent:true,opacity:.54})
 );
 scene.add(dial);

 const count = paths.length * 3;
 const positions = new THREE.BufferAttribute(new Float32Array(count*3),3).setUsage(THREE.DynamicDrawUsage);
 const colors = new THREE.BufferAttribute(new Float32Array(count*3),3).setUsage(THREE.DynamicDrawUsage);
 const signals = new THREE.Points(
  new THREE.BufferGeometry().setAttribute('position',positions).setAttribute('color',colors),
  new THREE.PointsMaterial({size:.085,vertexColors:true,transparent:true,opacity:.95,depthWrite:false})
 );
 signals.frustumCulled=false;
 world.add(signals);
 const teal = new THREE.Color(0x85e7d6), gold = new THREE.Color(0xffd183);
 const beacon = new THREE.Mesh(
  new THREE.OctahedronGeometry(.17),
  new THREE.MeshBasicMaterial({color:gold,wireframe:true,transparent:true,opacity:.9})
 );
 world.add(beacon);

 return function updateSignals(elapsed,selected){
  dial.rotation.y=elapsed*.06;
  const [x,z]=cities.get(selected);
  const height=selected==='astana'?1.73:1.27;
  beacon.position.set(x,surface+height+Math.sin(elapsed*2)*.1,z);
  beacon.rotation.y=elapsed*.9;
  paths.forEach(({id,points},route)=>{
   const color=id===selected?gold:teal;
   for(let i=0;i<3;i++){
    const offset=(elapsed*.22+i/3+route*.13)%1*(points.length-1);
    const start=Math.floor(offset), a=points[start], b=points[start+1]??a, t=offset-start;
    const index=route*3+i;
    positions.setXYZ(index,THREE.MathUtils.lerp(a.x,b.x,t),THREE.MathUtils.lerp(a.y,b.y,t),THREE.MathUtils.lerp(a.z,b.z,t));
    colors.setXYZ(index,color.r,color.g,color.b);
   }
  });
  positions.needsUpdate=true;
  colors.needsUpdate=true;
 };
}

// Decorative atlas, independent of game state. Boundaries: SimpleMaps, CC BY 4.0.
export function createLobbyScene(canvas){
 const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,matchMedia('(pointer: coarse)').matches?1.25:1.6));renderer.setClearColor(0x081b25,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
 const scene=new THREE.Scene(),world=new THREE.Group(),camera=new THREE.OrthographicCamera(-7,7,6,-6,.1,100);scene.add(world);
 scene.add(new THREE.HemisphereLight(0xc1e8df,0x183039,2.1));
 const sun=new THREE.DirectionalLight(0xffd9a0,3.8);sun.position.set(-4,10,6);scene.add(sun);
 const rim=new THREE.DirectionalLight(0x58b9c4,2.5);rim.position.set(3,3,-8);scene.add(rim);
 const scale=.143,surface=.38,positions=new Map(GEOGRAPHY.regions.map(r=>[r.id,r.city.map(v=>v*scale)]));
 const material=(color,props={})=>new THREE.MeshStandardMaterial({color,roughness:.72,metalness:.12,...props});
 const top=material(0x286760),side=material(0x123e40),stone=material(0xf0ddba),gold=material(0xe7b75d,{metalness:.55,roughness:.35}),roof=material(0x54a89b);
 const box=new THREE.BoxGeometry(1,1,1),cylinder=new THREE.CylinderGeometry(1,1,1,16),cone=new THREE.ConeGeometry(1,1,5),sphere=new THREE.SphereGeometry(1,20,12);
 const add=(geometry,mat,parent,position,size)=>{const mesh=new THREE.Mesh(geometry,mat);if(position)mesh.position.set(...position);if(size)mesh.scale.set(...size);parent.add(mesh);return mesh};
 const line=(points,color,opacity=1,parent=world)=>{const m=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:true,opacity}));parent.add(m);return m};
 for(const polygon of GEOGRAPHY.country){
  const shape=new THREE.Shape(polygon.map(([x,z])=>new THREE.Vector2(x*scale,-z*scale))),geo=new THREE.ExtrudeGeometry(shape,{depth:surface,bevelEnabled:false,curveSegments:1});geo.rotateX(-Math.PI/2);
  add(geo,[top,side],world);add(geo,material(0x0b3035),world,[0,-.43,0],[1.015,1,1.015]);add(geo,material(0x153b3c),world,[0,-.64,0],[1.006,.45,1.006]);
  for(const[h,color,opacity,s]of[[surface+.008,0xdac285,.9,1],[-.075,0x72b9a6,.5,1.015],[-.47,0xa5824f,.55,1.006]]){const points=polygon.map(([x,z])=>new THREE.Vector3(x*scale*s,h,z*scale*s));points.push(points[0].clone());line(points,color,opacity)}
 }
 for(const r of GEOGRAPHY.regions)if(!['astana','almaty','shymkent'].includes(r.id))for(const p of r.polygons)line(p.map(([x,z])=>new THREE.Vector3(x*scale,surface+.012,z*scale)),0x8abb9a,.22);
 const rand=n=>{const v=Math.sin(n*127.13+13.7)*43758.5453;return v-Math.floor(v)};
 const cities=new Map(),markers=new Map(),buildings=[],roofs=[],windows=[];
 for(let n=0;n<GEOGRAPHY.regions.length;n++){
  const r=GEOGRAPHY.regions[n],[x,z]=positions.get(r.id),featured=['astana','almaty','turkistan'].includes(r.id),group=new THREE.Group();group.position.set(x,surface,z);world.add(group);cities.set(r.id,group);
  add(cylinder,side,group,[0,.012,0],[featured?.48:.25,.025,featured?.48:.25]);
  for(let j=0;j<(featured?13:5);j++){
   const a=j*2.4+n,radius=featured?.24+rand(j+n*7)*.2:.11+rand(j+n*7)*.15,bx=x+Math.sin(a)*radius,bz=z+Math.cos(a)*radius,h=(featured?.25:.12)+rand(j*3+n*17)*(featured?.58:.2),w=featured?.095+rand(j+n)*.06:.075+rand(j+n)*.045;
   buildings.push({p:[bx,surface+h/2+.025,bz],s:[w,h,w*.85],color:j%4?0xe8d2ad:0x6faaa0});roofs.push({p:[bx,surface+h+.035,bz],s:[w*1.08,.025,w*.94]});
   for(let floor=0;floor<Math.floor(h/.095);floor++)windows.push({p:[bx,surface+.08+floor*.095,bz+w*.43],s:[w*.58,.022,.003]});
  }
  const halo=add(new THREE.RingGeometry(featured?.53:.29,featured?.545:.30,48),new THREE.MeshBasicMaterial({color:0xd9bd76,transparent:true,opacity:.4,side:THREE.DoubleSide,depthWrite:false}),group,[0,.025,0]);halo.rotation.x=-Math.PI/2;markers.set(r.id,halo);
 }
 const instance=(entries,mat,colored=false)=>{const mesh=new THREE.InstancedMesh(box,mat,entries.length),dummy=new THREE.Object3D();entries.forEach((o,i)=>{dummy.position.set(...o.p);dummy.scale.set(...o.s);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(colored)mesh.setColorAt(i,new THREE.Color(o.color))});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;world.add(mesh)};
 instance(buildings,stone,true);instance(roofs,gold);instance(windows,material(0xffd286,{emissive:0xffbd66,emissiveIntensity:.4}));
 const tower=cities.get('astana');add(cylinder,gold,tower,[0,.055,0],[.19,.08,.19]);add(cylinder,stone,tower,[0,.61,0],[.048,1.12,.048]);
 for(let i=0;i<8;i++){const a=i*Math.PI/4,curve=new THREE.CatmullRomCurve3([new THREE.Vector3(Math.sin(a)*.15,.06,Math.cos(a)*.15),new THREE.Vector3(Math.sin(a)*.055,.6,Math.cos(a)*.055),new THREE.Vector3(Math.sin(a)*.17,1.12,Math.cos(a)*.17)]);add(new THREE.TubeGeometry(curve,12,.012,5,false),stone,tower)}
 add(sphere,gold,tower,[0,1.22,0],[.22,.22,.22]);const cap=add(new THREE.TorusGeometry(.16,.014,6,32),stone,tower,[0,1.08,0]);cap.rotation.x=Math.PI/2;
 const mausoleum=cities.get('turkistan');add(box,stone,mausoleum,[0,.16,0],[.3,.32,.31]);add(new THREE.SphereGeometry(.17,16,12,0,Math.PI*2,0,Math.PI/2),roof,mausoleum,[0,.32,-.025]);add(box,gold,mausoleum,[0,.24,.19],[.23,.48,.08]);add(box,side,mausoleum,[0,.16,.234],[.09,.24,.008]);
 const mountain=material(0x56817b,{flatShading:true}),snow=material(0xdde8d6,{flatShading:true});
 for(let i=0;i<23;i++){const x=2.2+i*.108,z=2.35-i*.043+Math.sin(i*1.7)*.15,h=.27+rand(i+65)*.55,r=.13+rand(i+88)*.15;add(cone,mountain,world,[x,surface+h/2,z],[r,h,r]).rotation.y=i;if(h>.48)add(cone,snow,world,[x,surface+h*.86,z],[r*.29,h*.29,r*.29]).rotation.y=i}
 const origin=positions.get('astana'),paths=[];
 for(const id of['almaty','turkistan','atyrau','aktobe','pavlodar','east-kazakhstan']){const dest=positions.get(id);if(!dest)continue;const points=[];for(let i=0;i<=48;i++){const t=i/48;points.push(new THREE.Vector3(THREE.MathUtils.lerp(origin[0],dest[0],t),surface+.08+Math.sin(t*Math.PI)*(.38+Math.hypot(dest[0]-origin[0],dest[1]-origin[1])*.1),THREE.MathUtils.lerp(origin[1],dest[1],t)))}paths.push({id,points,arc:line(points,0xb8d3b1,.36)})}
 const orbit=[];for(let i=0;i<=160;i++){const a=i/160*Math.PI*2;orbit.push(new THREE.Vector3(Math.cos(a)*6.1,-.86,Math.sin(a)*4.15))}line(orbit,0x9f895f,.24);line(orbit.map(v=>new THREE.Vector3(v.x*.94,v.y-.012,v.z*.94)),0x589b94,.12);
 const dots=[];for(let i=0;i<35;i++)dots.push((rand(i*3)-.5)*13,-.8+rand(i*3+1)*4.4,(rand(i*3+2)-.5)*7);scene.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(dots,3)),new THREE.PointsMaterial({color:0xe1c489,size:.025,transparent:true,opacity:.6,depthWrite:false})));
 const updateSignals=addAtlasSignals(scene,world,paths,positions,surface);
 const motion=matchMedia('(prefers-reduced-motion: reduce)'),target=new THREE.Vector3(0,.3,0),host=canvas.parentElement;
 let disposed=false,unavailable=false,paused=false,visible=true,raf=0,dirty=true;
 let selected='astana',angle=cityAngles.astana,orbitOffset=0,drag=null,px=0,py=0,last=0,elapsed=0;

 function render(time){
  raf=0;
  if(disposed||unavailable||!visible||document.hidden)return;
  const still=motion.matches||paused;
  if(!dirty&&still)return;
  if(time-last<30&&!dirty){raf=requestAnimationFrame(render);return}
  if(!still&&last)elapsed+=Math.min((time-last)/1000,.05);
  last=time;
  const desired=cityAngles[selected]+orbitOffset;
  angle=still?desired:THREE.MathUtils.lerp(angle,desired,.1);
  world.rotation.y=angle;
  world.position.y=still?0:Math.sin(elapsed*.72)*.065;
  camera.position.set(1.8+(still?0:px*.62),9.4+(still?0:py*.4),12.7);
  camera.lookAt(target);
  for(const[id,marker]of markers){
   const active=id===selected;
   marker.material.opacity=active?.9:Object.hasOwn(cityAngles,id)?.38:.23;
   marker.scale.setScalar(active&&!still?1.12+.13*Math.sin(elapsed*2.7):1);
  }
  updateSignals(elapsed,selected);
  renderer.render(scene,camera);
  dirty=false;
  if(!still)raf=requestAnimationFrame(render);
 }
 const invalidate=()=>{dirty=true;if(!raf&&!disposed&&!unavailable&&visible&&!document.hidden)raf=requestAnimationFrame(render)};
 const resize=()=>{const{width,height}=host.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height,false);const a=width/height,w=a<.9?7:6.6;camera.left=-w;camera.right=w;camera.top=w/a;camera.bottom=-w/a;camera.updateProjectionMatrix();invalidate()};
 const observer=new ResizeObserver(resize);observer.observe(host);
 const intersection=new IntersectionObserver(entries=>{
  visible=entries[0].isIntersecting;
  if(visible)invalidate();else suspend();
 },{rootMargin:'60px'});
 intersection.observe(canvas);
 function suspend(){cancelAnimationFrame(raf);raf=0;last=0}
 const visibility=()=>{if(document.hidden)suspend();else invalidate()};

 function setOrbit(offset){
  orbitOffset=THREE.MathUtils.clamp(offset,-.84,.84);
  invalidate();
 }
 function startDrag(event){
  if(!event.isPrimary||event.button!==0||event.target!==canvas)return;
  drag={id:event.pointerId,x:event.clientX,offset:orbitOffset};
  host.setPointerCapture(event.pointerId);
  host.classList.add('atlas-dragging');
 }
 function pointer(event){
  const bounds=host.getBoundingClientRect();
  if(!bounds.width||!bounds.height)return;
  if(drag?.id===event.pointerId)setOrbit(drag.offset+(event.clientX-drag.x)/bounds.width*2.6);
  if(event.pointerType==='mouse'){
   px=THREE.MathUtils.clamp((event.clientX-bounds.left)/bounds.width-.5,-.5,.5);
   py=THREE.MathUtils.clamp((event.clientY-bounds.top)/bounds.height-.5,-.5,.5);
  }
 }
 function endDrag(event){
  if(drag?.id!==event.pointerId)return;
  drag=null;
  host.classList.remove('atlas-dragging');
  if(host.hasPointerCapture(event.pointerId))host.releasePointerCapture(event.pointerId);
 }
 const leave=()=>{px=py=0};
 function orbitKey(event){
  if(event.key==='Home')setOrbit(0);
  else if(event.key==='ArrowLeft'||event.key==='ArrowRight')setOrbit(orbitOffset+(event.key==='ArrowLeft'?-.18:.18));
  else return;
  event.preventDefault();
 }
 const lost=event=>{
  event.preventDefault();
  unavailable=true;
  suspend();
  canvas.hidden=true;
  canvas.dispatchEvent(new CustomEvent('lobby:scene-unavailable'));
 };
 const listeners=[
  [document,'visibilitychange',visibility],[motion,'change',invalidate],
  [host,'pointerdown',startDrag],[host,'pointermove',pointer],[host,'pointerleave',leave],
  [host,'pointerup',endDrag],[host,'pointercancel',endDrag],[host,'lostpointercapture',endDrag],
  [host,'keydown',orbitKey],[canvas,'webglcontextlost',lost]
 ];
 for(const[element,event,handler]of listeners)element.addEventListener(event,handler);
 resize();
 suspend();
 render(performance.now());

 return {
  selectCity(id){
   if(!Object.hasOwn(cityAngles,id)||disposed)return;
   selected=id;
   setOrbit(0);
   for(const path of paths){
    path.arc.material.opacity=path.id===id?.88:.32;
    path.arc.material.color.set(path.id===id?0xe7c578:0xb8d3b1);
   }
  },
  setPaused(value){paused=Boolean(value);last=0;invalidate()},
  dispose(){
   if(disposed)return;
   disposed=true;
   suspend();
   observer.disconnect();
   intersection.disconnect();
   for(const[element,event,handler]of listeners)element.removeEventListener(event,handler);
   if(drag&&host.hasPointerCapture(drag.id))host.releasePointerCapture(drag.id);
   host.classList.remove('atlas-dragging');
   const geometries=new Set(),materials=new Set();
   scene.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    if(object.material)for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);
   });
   for(const geometry of geometries)geometry.dispose();
   for(const material of materials)material.dispose();
   renderer.dispose();
  }
 };
}

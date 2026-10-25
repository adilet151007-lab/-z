import {ANIMATION_MODULES} from './achievement-animations.js';
import {disposeAnimationScene} from './achievement-player.js';
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { REGIONS, CRISIS_THRESHOLD, RESOURCE_CAP, developmentFor, mapRegionsFor, metadataFor, createDrillGeometryData } from "./game-config.js";
import { GEOGRAPHY } from "./region-geography.js";

const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, value) => { const t = clamp((value - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rng(seed) { let n = seed >>> 0; return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
const pointOnMap = (lon, lat) => [(lon - 67) * 1.91, -(lat - 47.6) * 2.8];
const palettes = {
  steppe: { low: 0x727d47, high: 0xc1b581, wall: 0x5b4935, roof: 0x527b75, stone: 0xe1cba2 },
  mountain: { low: 0x427e62, high: 0x99ad93, wall: 0x425b55, roof: 0x337d8a, stone: 0xe3e0c6 },
  desert: { low: 0xb99b6c, high: 0xf2dbb3, wall: 0x82614c, roof: 0xa26548, stone: 0xebd8ba },
  south: { low: 0x939257, high: 0xc1b47d, wall: 0x755e45, roof: 0x268c9a, stone: 0xd2ae7c }
};
palettes.forest = { low: 0x5b7d56, high: 0xb7b784, wall: 0x514d38, roof: 0x568880, stone: 0xdcd8b9 };
palettes.city = { low: 0x678970, high: 0xa9c3ac, wall: 0x53615a, roof: 0x4d8292, stone: 0xe2daca };
const regionMeta = new Map(REGIONS.map(r=>[r.id,r]));
function polygonContains(polygon, x, z) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i], [xj, zj] = polygon[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function heightAt(id, x, z, data) {
  const bump = (a, b, radius, h) => h * Math.exp(-((x - a) ** 2 + (z - b) ** 2) / radius ** 2);
  const biome = regionMeta.get(id).biome;
  let h = .62 + .07 * Math.sin(x * 2.9) * Math.cos(z * 2.4) + .04 * Math.sin(x * 6 + z * 3);
  if (id === "karaganda" || id === "ulytau") h += bump(-.2, -2.9, 2.9, 1.1) + bump(16.2, -4.8, 3.1, 1.4) + bump(6, -6, 3.8, .6);
  if (id === "jetisu") h += bump(27.2, 7.8, 2.2, 3.4) + bump(25.7, 5.8, 1.8, 2.2) + bump(28.7, 4.7, 1.8, 2.7);
  if (id === "mangystau") h += Math.floor((bump(-24.5, 14.8, 3, 2.2) + bump(-22.4, 7.5, 2.3, 1.2)) * 5) / 5;
  if (id === "turkistan") h += bump(5.7, 8.9, 2.2, 2.1) + bump(6.1, 12.3, 1.7, 1.3);
  if (biome === "mountain" && id !== "jetisu") {
    const x0 = data.bounds[0], z0 = data.bounds[1], w = data.bounds[2]-x0, d = data.bounds[3]-z0;
    h += bump(x0+w*.7,z0+d*.68,Math.max(.5,w*.24),2.4) + bump(x0+w*.38,z0+d*.35,Math.max(.5,w*.18),1.9);
  }
  if (biome === "forest") h += bump(data.bounds[0]+(data.bounds[2]-data.bounds[0])*.7,data.bounds[1]+(data.bounds[3]-data.bounds[1])*.5,2.1,.6);
  if (biome === "south" && id !== "turkistan") h += bump(data.bounds[2]-1,data.bounds[3]-1,2,1.7);
  const d = Math.hypot(x - data.city[0], z - data.city[1]);
  return THREE.MathUtils.lerp(.71, h, smooth(data.cityRadius * .94, data.cityRadius * 1.38, d));
}
function reliefGeometry(polygon, id, data, maxEdge = 1.1) {
  const contour = polygon.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, z));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []), vertices = [], colors = [];
  const low = new THREE.Color(palettes[regionMeta.get(id).biome].low), high = new THREE.Color(palettes[regionMeta.get(id).biome].high), snow = new THREE.Color(0xe7f0ed);
  function vertex(v) {
    const h = heightAt(id, v.x, v.y, data), color = low.clone().lerp(high, clamp((h - .55) / 2.3, 0, 1));
    if (regionMeta.get(id).biome === "mountain" && h > 2.5) color.lerp(snow, smooth(2.5, 3.4, h));
    vertices.push(v.x - data.city[0], h, v.y - data.city[1]);
    color.multiplyScalar(.96 + .07 * Math.sin(v.x * 5 + v.y * 3));
    colors.push(color.r, color.g, color.b);
  }
  function subdivide(a, b, c, depth) {
    const longest = Math.max(a.distanceToSquared(b), b.distanceToSquared(c), c.distanceToSquared(a));
    if (longest > maxEdge && depth < 7) {
      const ab = a.clone().lerp(b, .5), bc = b.clone().lerp(c, .5), ca = c.clone().lerp(a, .5);
      subdivide(a, ab, ca, depth + 1); subdivide(ab, b, bc, depth + 1);
      subdivide(ca, bc, c, depth + 1); subdivide(ab, bc, ca, depth + 1);
    } else {
      if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0) { vertex(a); vertex(c); vertex(b); }
      else { vertex(a); vertex(b); vertex(c); }
    }
  }
  for (const face of faces) subdivide(...face.map(i => contour[i]), 0);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}
function wallGeometry(polygon, id, data) {
  const vertices = [];
  for (let i = 1; i < polygon.length; i++) {
    const a = polygon[i - 1], b = polygon[i], ah = heightAt(id, ...a, data), bh = heightAt(id, ...b, data);
    const ax = a[0] - data.city[0], az = a[1] - data.city[1], bx = b[0] - data.city[0], bz = b[1] - data.city[1];
    vertices.push(ax, ah, az, bx, bh, bz, ax, -1.0, az, bx, bh, bz, bx, -1.0, bz, ax, -1.0, az);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); geo.computeVertexNormals();
  return geo;
}
function lineFor(points, color, opacity = 1) {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}
function labelSprite() {
  const canvas = document.createElement("canvas"); canvas.width = 768; canvas.height = 192;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(7.3, 1.825, 1); sprite.renderOrder = 20;
  sprite.center.set(.5,0);
  return { sprite, canvas, texture, key: "" };
}
function paintLabel(label, meta, points, economy, scoreLimit = RESOURCE_CAP) {
  const key = `${meta.name}:${points}:${economy}:${scoreLimit}`; if (label.key === key) return; label.key = key;
  const ctx = label.canvas.getContext("2d"), done = points >= RESOURCE_CAP, crisis = economy < CRISIS_THRESHOLD;
  const color = crisis ? "#ff7468" : done ? "#ffe2a1" : meta.glow;
  ctx.clearRect(0, 0, 768, 192); ctx.fillStyle = "rgba(5,18,25,.93)"; ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(4, 4, 760, 180, 24); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color; ctx.font = "700 42px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(meta.name + (done ? "  ✦" : ""), 384, 65);
  ctx.fillStyle = "#d8e8e7"; ctx.font = "25px sans-serif";
  ctx.fillText(`${points} / ${scoreLimit===null?'∞':'1000'}   ·   ${economy}%   ·   ${developmentFor(points).name}`, 384, 113);
  ctx.fillStyle = "#203c43"; ctx.fillRect(40, 143, 688, 7); ctx.fillStyle = color; ctx.fillRect(40, 143, 688 * Math.min(points,RESOURCE_CAP) / RESOURCE_CAP, 7);
  label.texture.needsUpdate = true;
}

export function labelScaleForDepth(depth,height,fov=40){
  const pixels=clamp(210-Math.max(.1,depth)*1.15,112,200);
  return {pixels,world:pixels*2*Math.tan(THREE.MathUtils.degToRad(fov*.5))*Math.max(.1,depth)/Math.max(1,height)};
}
function mapAchievement(award,quiet=false){
  const group=new THREE.Group();group.name='match-achievement';group.userData.achievementId=award.id;
  const geometries=new Set(),materials=new Set();
  const geometry=g=>{geometries.add(g);return g},material=m=>{materials.add(m);return m};
  const metals=[0x526d71,0xc9b582,0x6f837b,0x66efbc].map((color,i)=>material(new THREE.MeshStandardMaterial({color,metalness:i===3?.2:.82,roughness:.27,side:THREE.DoubleSide,transparent:true,...(i===3?{emissive:color,emissiveIntensity:1.7}:{})})));
  const data=createDrillGeometryData(),positions=[],drillGeometry=geometry(new THREE.BufferGeometry());
  for(let metal=0;metal<4;metal++){const start=positions.length/3;for(const face of data.faces)if(face.metal===metal)for(const index of face.indices){const [x,y,z]=data.vertices[index];positions.push(x,-y,z)}drillGeometry.addGroup(start,positions.length/3-start,metal)}
  drillGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));drillGeometry.computeVertexNormals();
  const drill=new THREE.Group();drill.add(new THREE.Mesh(drillGeometry,metals));group.add(drill);
  const plumeMaterial=material(new THREE.MeshBasicMaterial({color:0x8aefbc,transparent:true,opacity:.35,depthWrite:false}));
  const plume=new THREE.Mesh(geometry(new THREE.CylinderGeometry(.5,.015,4,12)),plumeMaterial);plume.position.y=-5.8;drill.add(plume);
  const rift=new THREE.Group();rift.position.y=9;group.add(rift);
  const random=rng([...award.teamId].reduce((n,c)=>Math.imul(n,31)+c.charCodeAt(0),73)),lines=[];
  for(let ray=0;ray<8;ray++){
    const angle=ray*Math.PI/4+(random()-.5)*.28;let previous=new THREE.Vector3();
    for(let step=1;step<=6;step++){
      const radius=step*(.72+random()*.17),a=angle+(random()-.5)*.21,next=new THREE.Vector3(Math.cos(a)*radius,Math.sin(a)*radius,0);lines.push(previous,next);
      if(step>1&&step<6){const branch=next.clone().add(new THREE.Vector3(Math.cos(a+.6)*(.5+random()),Math.sin(a+.6)*(.5+random()),0));lines.push(next.clone(),branch)}previous=next;
    }
  }
  const crackGeometry=geometry(new THREE.BufferGeometry().setFromPoints(lines)),crackMaterial=material(new THREE.LineBasicMaterial({color:0xc9f6df,transparent:true,opacity:0}));
  const cracks=new THREE.LineSegments(crackGeometry,crackMaterial);rift.add(cracks);
  const apertureShape=new THREE.Shape();for(let i=0;i<14;i++){const a=i*Math.PI/7,r=i%2?1.18:1.7,x=Math.cos(a)*r,y=Math.sin(a)*r;if(i)apertureShape.lineTo(x,y);else apertureShape.moveTo(x,y)}apertureShape.closePath();
  const apertureMaterial=material(new THREE.MeshBasicMaterial({color:0x020914,side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false}));
  const aperture=new THREE.Mesh(geometry(new THREE.ShapeGeometry(apertureShape)),apertureMaterial);aperture.position.z=.02;rift.add(aperture);
  const shardGeometry=geometry(new THREE.BufferGeometry());shardGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-.25,-.1,0,.35,0,0,.05,.65,0],3));shardGeometry.computeVertexNormals();
  const shardMaterial=material(new THREE.MeshBasicMaterial({color:0xb4e6d8,side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false})),shards=new THREE.InstancedMesh(shardGeometry,shardMaterial,7),dummy=new THREE.Object3D();rift.add(shards);
  const starsGeometry=geometry(new THREE.BufferGeometry().setFromPoints(Array.from({length:12},()=>new THREE.Vector3((random()-.5)*1.5,(random()-.5)*1.5,.04))));
  const starsMaterial=material(new THREE.PointsMaterial({color:0xe3fff0,size:.065,transparent:true,opacity:0,depthWrite:false})),stars=new THREE.Points(starsGeometry,starsMaterial);aperture.add(stars);
  const shockMaterial=material(new THREE.MeshBasicMaterial({color:0xa9efcd,side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false}));
  const shock=new THREE.Mesh(geometry(new THREE.RingGeometry(.94,1,48)),shockMaterial);shock.rotation.x=-Math.PI/2;shock.position.y=9;group.add(shock);
  const label=labelSprite(),ctx=label.canvas.getContext('2d');ctx.clearRect(0,0,768,192);ctx.fillStyle='#09202ded';ctx.strokeStyle='#dbc58d';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(4,4,760,180,22);ctx.fill();ctx.stroke();ctx.textAlign='center';ctx.fillStyle='#f0dfb0';ctx.font='700 43px sans-serif';ctx.fillText('Ты смог, братец',384,76);ctx.fillStyle='#ace7ca';ctx.font='29px sans-serif';ctx.fillText(award.teamName,384,133);label.texture.needsUpdate=true;label.sprite.position.set(0,12,0);label.sprite.renderOrder=30;group.add(label.sprite);
  let released=false;
  return {group,update(seconds,camera,viewportHeight){
    const fade=1-smooth(5.8,7.8,seconds),flight=seconds<2.48?1+8*smooth(0,2.48,seconds):seconds<3.05?9+Math.sin(seconds*70)*.025:9+20*smooth(3.05,4.7,seconds);
    drill.position.y=flight;drill.rotation.y=seconds*8.5;drill.visible=!quiet&&seconds<4.9;
    for(const metal of metals){metal.opacity=1-smooth(4.2,4.9,seconds);metal.depthWrite=seconds<4.2}plumeMaterial.opacity=(.25+Math.sin(seconds*38)*.08)*(1-smooth(4.2,4.9,seconds));
    const opening=smooth(2.65,3.6,seconds);rift.visible=!quiet&&seconds>2.46;rift.quaternion.copy(camera.quaternion);aperture.scale.setScalar(Math.max(.001,opening*1.6));apertureMaterial.opacity=opening*fade;starsMaterial.opacity=opening*fade;
    crackGeometry.setDrawRange(0,Math.floor(smooth(2.48,3.5,seconds)*lines.length/2)*2);crackMaterial.opacity=fade*.9;
    const scatter=Math.max(0,seconds-2.8);shardMaterial.opacity=smooth(0,.18,scatter)*(1-smooth(.4,2.6,scatter));
    for(let i=0;i<7;i++){const a=i*Math.PI*2/7;dummy.position.set(Math.cos(a)*(1+scatter*2.2),Math.sin(a)*(1+scatter*1.8)-scatter*scatter*.2,.2+scatter*.3);dummy.rotation.set(scatter*(i%2?1:-1),scatter*.7,a+scatter);dummy.scale.setScalar(.7);dummy.updateMatrix();shards.setMatrixAt(i,dummy.matrix)}shards.instanceMatrix.needsUpdate=true;
    shock.visible=quiet||seconds>2.48;shock.scale.setScalar(quiet?2.6:.4+smooth(2.48,4.1,seconds)*6);shockMaterial.opacity=quiet?.6*fade:(1-smooth(2.6,4.1,seconds))*.65;
    label.sprite.visible=quiet||seconds>4.1;label.sprite.material.opacity=fade;const worldPosition=label.sprite.getWorldPosition(new THREE.Vector3()),depth=camera.position.distanceTo(worldPosition),labelWidth=labelScaleForDepth(depth,viewportHeight,camera.fov).world/group.scale.x;label.sprite.scale.set(labelWidth,labelWidth/4,1);
    return seconds<7.8;
  },dispose(){if(released)return;released=true;group.removeFromParent();shards.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();label.texture.dispose();label.sprite.material.dispose()}};
}

function mapLegendaryAchievement(award,quiet=false){
  const group=new THREE.Group();group.name='match-achievement';group.userData.achievementId=award.id;
  const geometries=new Set(),materials=new Set(),instanced=[];
  const geo=g=>{geometries.add(g);return g};
  const mat=(color,opacity=1)=>{const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide});materials.add(m);return m};
  const colors={'zero-card':0xc7a4fb,'scenario-reader':0xf4cf80,'determination':0xff7182,'daily-training':0xffd797,'neon-summit':0xff609a,'infinity-gauntlet':0xc991ff};
  const color=colors[award.achievementId]||0xffd797,material=mat(color),icon=new THREE.Group();icon.position.y=3.7;group.add(icon);
  const mesh=(parent,geometry,m=material)=>{const o=new THREE.Mesh(geo(geometry),m);parent.add(o);return o};
  const column=mesh(group,new THREE.CylinderGeometry(.08,.55,5,12,1,true),mat(color,.18));column.position.y=2.65;
  const ring=mesh(group,new THREE.RingGeometry(2,2.13,48),mat(color,.7));ring.rotation.x=-Math.PI/2;ring.position.y=.16;
  const halo=mesh(group,new THREE.RingGeometry(.4,.48,48),mat(color,.55));halo.rotation.x=-Math.PI/2;halo.position.y=.2;
  const id=award.achievementId;
  if(id==='zero-card'){
    mesh(icon,new THREE.BoxGeometry(2.2,3,.16),mat(0x211633));
    const edge=mesh(icon,new THREE.TorusGeometry(1,.045,6,48),material);edge.scale.set(.85,1.28,1);edge.position.z=.12;
    const zero=mesh(icon,new THREE.TorusGeometry(.45,.09,8,48),material);zero.position.z=.15;
  }else if(id==='scenario-reader'){
    const spine=mesh(icon,new THREE.BoxGeometry(.14,2.2,.12),mat(0xffe4aa));spine.position.z=0;
    for(const sign of [-1,1]){const page=mesh(icon,new THREE.BoxGeometry(1.2,1.9,.07),mat(0xe4d7b5));page.position.set(sign*.66,0,0);page.rotation.y=sign*.32;
      const line=mesh(icon,new THREE.BoxGeometry(.75,.035,.025),material);line.position.set(sign*.67,.35,.1);line.rotation.y=sign*.32}
  }else if(id==='determination'){
    const shape=new THREE.Shape();shape.moveTo(0,-1);shape.bezierCurveTo(-1.9,.1,-.95,1.3,0,.65);shape.bezierCurveTo(.95,1.3,1.9,.1,0,-1);
    mesh(icon,new THREE.ExtrudeGeometry(shape,{depth:.32,bevelEnabled:true,bevelThickness:.07,bevelSize:.06,bevelSegments:2,curveSegments:10}),material).position.z=-.16;
    const scar=mesh(icon,new THREE.BoxGeometry(.07,1.25,.035),mat(0xffd897));scar.position.set(.05,0,.25);scar.rotation.z=.34;
  }else if(id==='daily-training'){
    for(let i=0;i<10;i++){const r=.55+i*.16,o=mesh(icon,new THREE.TorusGeometry(r,.016,4,48),mat(i%2?0xffd797:0xa7c9eb,.7));o.rotation.x=.42+i*.08}
    const mark=geo(new THREE.OctahedronGeometry(.045,0)),marks=new THREE.InstancedMesh(mark,material,100),dummy=new THREE.Object3D();
    for(let i=0;i<100;i++){const row=Math.floor(i/10),angle=(i%10)*Math.PI/5,r=.55+row*.16;dummy.position.set(Math.cos(angle)*r,Math.sin(angle)*r,.06);dummy.updateMatrix();marks.setMatrixAt(i,dummy.matrix)}
    marks.count=0;marks.frustumCulled=false;icon.add(marks);instanced.push(marks);
  }else if(id==='neon-summit'){
    const tiers=[[1.05,.95,0],[.8,.85,.88],[.5,.7,1.65],[.12,.8,2.4]];
    for(const [r,h,y]of tiers){const tier=mesh(icon,new THREE.CylinderGeometry(r*.82,r,h,10),mat(0x293552));tier.position.y=y-.9}
    const beacon=mesh(icon,new THREE.SphereGeometry(.2,12,8),material);beacon.position.y=2.1;
    const beam=mesh(icon,new THREE.CylinderGeometry(.08,.38,3.5,12,1,true),mat(color,.32));beam.position.y=3.9;beam.userData.beam=true;
  }else{
    const metal=mat(0x49435e),palm=mesh(icon,new THREE.BoxGeometry(1.55,1.45,.3),metal);palm.position.y=-.43;
    for(let i=0;i<5;i++){const finger=mesh(icon,new THREE.BoxGeometry(.24,1.05+(i===2?.2:0),.28),metal);finger.position.set((i-2)*.32,.65,0)}
    const gemColors=[0xb58dff,0x66f3d5,0xe87a89,0xf5c767,0x7ab5ff,0xf3e6a5];
    gemColors.forEach((c,i)=>{const gem=mesh(icon,new THREE.OctahedronGeometry(i===5?.25:.14,0),mat(c));gem.position.set(i===5?0:(i-2)*.32,i===5?-.45:1.05,.2);gem.userData.gem=i});
  }
  const label=labelSprite(),ctx=label.canvas.getContext('2d');ctx.clearRect(0,0,768,192);ctx.fillStyle='rgba(9,20,33,.88)';ctx.strokeStyle=`#${color.toString(16).padStart(6,'0')}`;ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(4,4,760,180,22);ctx.fill();ctx.stroke();ctx.textAlign='center';ctx.fillStyle='#fff2d5';ctx.font='700 36px sans-serif';
  const titles={'neon-summit':'Вершина башни','infinity-gauntlet':'Я — сама неотвратимость'};
  ctx.fillText(titles[id]||award.title||'Легендарное достижение',384,76,700);ctx.fillStyle='#d4e7da';ctx.font='29px sans-serif';ctx.fillText(award.teamName||'',384,132,690);label.texture.needsUpdate=true;label.sprite.position.y=6.8;label.sprite.renderOrder=30;group.add(label.sprite);
  let released=false;
  return {group,started:0,duration:award.durationMs||8000,update(seconds,camera,viewportHeight){
    const duration=(award.durationMs||8000)/1000,fade=1-smooth(duration-1.5,duration,seconds),rise=quiet?1:smooth(0,1.6,seconds);
    icon.scale.setScalar(Math.max(.001,rise*(1+(!quiet&&id==='determination'?.06*Math.sin(seconds*8):0))));icon.position.y=3.7+(quiet?0:.22*Math.sin(seconds*2));
    if(['zero-card','scenario-reader','determination','infinity-gauntlet'].includes(id))icon.quaternion.copy(camera.quaternion);
    if(!quiet){if(id==='zero-card')icon.rotateY(Math.sin(seconds*1.8)*.22);if(id==='daily-training')icon.rotation.y=seconds*.25;if(id==='neon-summit')icon.rotation.y=seconds*.18}
    if(instanced.length)instanced[0].count=quiet?100:Math.min(100,Math.floor(Math.max(0,seconds-.6)*17));
    icon.traverse(o=>{if(o.userData.gem!==undefined)o.visible=quiet||seconds>1+o.userData.gem*.35;if(o.userData.beam)o.visible=quiet||seconds>2.4});
    column.material.opacity=.18*rise*fade;column.scale.y=Math.max(.001,rise);ring.scale.setScalar(1+.13*Math.sin(seconds*3));ring.material.opacity=.7*fade;halo.scale.setScalar(1+3*smooth(0,2,seconds));halo.material.opacity=(1-smooth(.3,3,seconds))*.5*fade;
    label.sprite.visible=quiet||seconds>1.6;label.sprite.material.opacity=fade;
    const worldPosition=label.sprite.getWorldPosition(new THREE.Vector3()),depth=camera.position.distanceTo(worldPosition),width=labelScaleForDepth(depth,viewportHeight,camera.fov).world/group.scale.x;label.sprite.scale.set(width,width/4,1);
    return seconds<duration;
  },dispose(){if(released)return;released=true;group.removeFromParent();instanced.forEach(o=>o.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());label.texture.dispose();label.sprite.material.dispose()}};
}

export function createScene(canvas, opts = {}) {
  const mobile = window.matchMedia("(max-width: 700px), (pointer: coarse)").matches;
  let lowPower=mobile;
  try{const value=localStorage.getItem('cq_graphics_v1');if(value==='low'||value==='standard')lowPower=value==='low'}catch{}
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(lowPower ? 1 : 1.5, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = !lowPower; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07151e); scene.fog = new THREE.FogExp2(0x07151e, .004);
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 320);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = .075; controls.minDistance = 2.5; controls.maxDistance = 150;
  controls.maxPolarAngle = Math.PI * .455; controls.minPolarAngle = .15; controls.enabled = opts.interactive !== false;
  controls.target.set(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xc7eaff, 0x3e3825, 2.1));
  const sun = new THREE.DirectionalLight(0xffedce, 3.2); sun.position.set(-24, 45, -12); sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024); Object.assign(sun.shadow.camera, { left: -43, right: 43, top: 30, bottom: -30, near: 1, far: 110 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .035; scene.add(sun);
  const rim = new THREE.DirectionalLight(0x79baff, 1.2); rim.position.set(25, 12, 28); scene.add(rim);
  const grid = new THREE.GridHelper(130, 65, 0x285765, 0x15333f); grid.position.y = -2.05;
  grid.material.transparent = true; grid.material.opacity = .26; scene.add(grid);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(350, 350), new THREE.MeshStandardMaterial({ color: 0x081b25, roughness: .8, metalness: .15 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -2.1; floor.receiveShadow = true; scene.add(floor);

  // Every administrative region is a full interactive relief mesh below.
  for (const polygon of GEOGRAPHY.country) scene.add(lineFor(polygon.map(([x, z]) => new THREE.Vector3(x, -.12, z)), 0x8dbbc1, .65));
  function water(lon, lat, rx, rz, rotation = 0) {
    const [x, z] = pointOnMap(lon, lat), mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: 0x186c83, emissive: 0x08394d, emissiveIntensity: .4, metalness: .5, roughness: .25, transparent: true, opacity: .84 }));
    mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = rotation; mesh.scale.set(rx, rz, 1); mesh.position.set(x, -.06, z); scene.add(mesh);
  }
  water(50.5, 44, 3.1, 10, .13); water(74.8, 46.2, 5.1, .5, -.12);

  const materials = {};
  const material = (key, color, extra = {}) => materials[key] ||= new THREE.MeshStandardMaterial({ color, roughness: .76, metalness: .05, ...extra });
  const box = new THREE.BoxGeometry(1, 1, 1), cone = new THREE.ConeGeometry(1, 1, 4), cylinder = new THREE.CylinderGeometry(1, 1, 1, 12), dome = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  // Each construction stage is merged by material: hundreds of houses use few draw calls.
  function batch() {
    const entries = new Map();
    return {
      add(geometry, mat, x, y, z, sx, sy, sz, rotation = 0) {
        const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation), new THREE.Vector3(sx, sy, sz));
        const geo = geometry.clone().applyMatrix4(matrix);
        if (!entries.has(mat)) entries.set(mat, []); entries.get(mat).push(geo);
      },
      finish() {
        const group = new THREE.Group();
        for (const [mat, geos] of entries) {
          const merged = mergeGeometries(geos, false); geos.forEach(g => g.dispose());
          const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
        }
        return group;
      }
    };
  }
  const surfaces = [], regions = [];
  for (let ri = 0; ri < REGIONS.length; ri++) {
    const meta = REGIONS[ri], data = GEOGRAPHY.regions.find(r => r.id === meta.id), palette = palettes[meta.biome];
    const group = new THREE.Group(); group.position.set(data.city[0], 0, data.city[1]); scene.add(group);
    const topMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .91, metalness: .03, emissive: meta.color, emissiveIntensity: .025 });
    const sideMat = new THREE.MeshStandardMaterial({ color: palette.wall, roughness: 1, side: THREE.DoubleSide });
    const borders = [];
    for (const polygon of data.polygons) {
      const terrain = new THREE.Mesh(reliefGeometry(polygon, meta.id, data, mobile ? 2.6 : 1.1), topMat); terrain.castShadow = true; terrain.receiveShadow = true;
      terrain.userData.regionId = meta.id; surfaces.push(terrain); group.add(terrain);
      group.add(new THREE.Mesh(wallGeometry(polygon, meta.id, data), sideMat));
      const border = lineFor(polygon.map(([x, z]) => new THREE.Vector3(x - data.city[0], heightAt(meta.id, x, z, data) + .045, z - data.city[1])), meta.glow, .65);
      group.add(border); borders.push(border);
    }
    const random = rng(ri * 203 + 19), townRadius = data.cityRadius * .86, unit = townRadius / 3.8;
    const stone = material(`stone${ri}`, palette.stone), roof = material(`roof${ri}`, palette.roof, { roughness: .4, metalness: .25 });
    const white = material("white", 0xe5e2cf), dark = material("dark", 0x263d47), gold = material("gold", 0xe6bc5b, { metalness: .65, roughness: .3 });
    const glass = material("glass", 0x417e93, { metalness: .5, roughness: .24 });
    const windowMat = material("window", 0xffe5a2, { emissive: 0xffce76, emissiveIntensity: .6 });
    const road = material("road", 0x566064), pavement = material("pavement", 0xada48c), green = material("green", 0x446e4d);
    const stages = [], lots = [];
    for (let gx = -4; gx <= 4; gx++) for (let gz = -4; gz <= 4; gz++) {
      if (!gx || !gz) continue;
      lots.push({ x: gx * unit * .78, z: gz * unit * .78, order: Math.hypot(gx, gz) + random() * .28 });
    }
    lots.sort((a, b) => a.order - b.order);
    const footY = .74;
    for (let si = 1; si <= 5; si++) {
      const b = batch(), from = developmentFor([0, 0, 100, 250, 500, 750][si]).buildings, to = [0, 4, 12, 24, 42, 64][si];
      for (let k = from; k < to; k++) {
        const lot = lots[k], x = lot.x, z = lot.z, size = unit * .48;
        const floors = si <= 2 ? 1 : si === 3 ? 2 : si === 4 ? 3 + (k % 2) : 4 + (k % 4);
        const h = unit * (.28 * floors + .12), w = size * (.85 + random() * .2), depth = size * (.9 + random() * .15);
        b.add(box, pavement, x, footY + .025, z, unit * .65, .05, unit * .65);
        b.add(box, k % 3 ? stone : white, x, footY + h / 2, z, w, h, depth);
        if (floors <= 2) b.add(cone, roof, x, footY + h + unit * .13, z, w * .77, unit * .26, depth * .77, Math.PI / 4);
        else {
          b.add(box, roof, x, footY + h + unit * .035, z, w * 1.08, unit * .07, depth * 1.08);
          b.add(box, glass, x + w * .505, footY + h * .55, z, unit * .015, h * .78, depth * .68);
        }
        for (let f = 0; f < floors; f++) for (const side of [-1, 1]) {
          b.add(box, windowMat, x + side * w * .23, footY + unit * .15 + f * unit * .28, z + depth * .505, unit * .075, unit * .095, unit * .018);
          b.add(box, windowMat, x + side * w * .23, footY + unit * .15 + f * unit * .28, z - depth * .505, unit * .075, unit * .095, unit * .018);
        }
      }
      const extent = townRadius * [.0, .45, .58, .72, .9, 1.04][si];
      if (si === 1 || si === 3 || si === 5) {
        b.add(box, road, 0, footY + .015, 0, extent * 2, .022, unit * .22);
        b.add(box, road, 0, footY + .018, 0, unit * .22, .022, extent * 2);
        for (let k = -4; k <= 4; k++) if (Math.abs(k * unit * .4) < extent) b.add(box, gold, k * unit * .4, footY + .032, 0, unit * .12, .012, unit * .025);
      }
      if (si === 2) {
        const x = -unit * .95, z = -unit * .05;
        b.add(cylinder, pavement, x, footY + unit * .07, z, unit * .53, unit * .14, unit * .53);
        b.add(box, stone, x, footY + unit * .3, z, unit * .55, unit * .5, unit * .5);
        b.add(dome, roof, x, footY + unit * .55, z, unit * .38, unit * .44, unit * .38);
        b.add(cylinder, gold, x, footY + unit * 1.03, z, unit * .025, unit * .13, unit * .025);
      }
      if (si === 3) {
        b.add(box, pavement, 0, footY + .04, 0, unit * 1.1, .06, unit * 1.1);
        b.add(cylinder, stone, 0, footY + unit * .17, 0, unit * .23, unit * .25, unit * .23);
        b.add(cylinder, glass, 0, footY + unit * .4, 0, unit * .16, unit * .2, unit * .16);
        b.add(box, green, unit * .88, footY + .03, 0, unit * .62, .04, unit * .5);
      }
      if (si === 4) {
        for (const x of [-unit * .95, unit * .95]) {
          b.add(box, stone, x, footY + unit * .22, unit * 3.1, unit * .7, unit * .44, unit * .5);
          b.add(cone, roof, x, footY + unit * .55, unit * 3.1, unit * .52, unit * .25, unit * .4, Math.PI / 4);
        }
        for (const side of [-1, 1]) b.add(box, road, side * unit * 2.72, footY + .01, 0, unit * .15, .025, townRadius * 1.6);
      }
      if (si === 5) {
        // A region-specific skyline completes the city at exactly 1000 resources.
        const x = unit * .48, z = -unit * .18;
        if (meta.id === "turkistan") {
          b.add(box, stone, x, footY + unit * .45, z, unit * .92, unit * .9, unit * .7);
          b.add(dome, roof, x, footY + unit * .9, z, unit * .45, unit * .57, unit * .45);
          for (const side of [-1, 1]) {
            b.add(cylinder, stone, x + side * unit * .6, footY + unit * .65, z, unit * .09, unit * 1.3, unit * .09);
            b.add(cone, roof, x + side * unit * .6, footY + unit * 1.4, z, unit * .13, unit * .22, unit * .13);
          }
        } else if (meta.id === "astana" || meta.id === "karaganda") {
          b.add(cylinder, white, x, footY + unit * .85, z, unit * .13, unit * 1.7, unit * .13);
          b.add(dome, gold, x, footY + unit * 1.65, z, unit * .34, unit * .48, unit * .34);
        } else {
          for (let k = 0; k < 3; k++) {
            const height = unit * (1.2 + k * .45);
            b.add(box, k === 1 ? glass : white, x + (k - 1) * unit * .32, footY + height / 2, z, unit * .27, height, unit * .35);
            b.add(box, gold, x + (k - 1) * unit * .32, footY + height, z, unit * .29, unit * .06, unit * .37);
          }
        }
      }
      const stage = b.finish(); stage.visible = false; stage.scale.y = .001;
      group.add(stage); stages.push(stage);
    }
    // Vegetation and pale rock formations are permanent parts of the landscape.
    const nature = batch();
    for (let k = 0; k < 140; k++) {
      const x = THREE.MathUtils.lerp(data.bounds[0], data.bounds[2], random()), z = THREE.MathUtils.lerp(data.bounds[1], data.bounds[3], random());
      if (!data.polygons.some(p => polygonContains(p, x, z)) || Math.hypot(x - data.city[0], z - data.city[1]) < data.cityRadius * 1.3) continue;
      const h = heightAt(meta.id, x, z, data), scale = .1 + random() * .13;
      if (meta.biome === "desert") {
        nature.add(cylinder, stone, x - data.city[0], h + scale, z - data.city[1], scale * .7, scale * 2.8, scale * .65);
      } else if (h < 2.3) {
        nature.add(cone, green, x - data.city[0], h + scale * 1.5, z - data.city[1], scale, scale * 3, scale);
      }
    }
    group.add(nature.finish());
    // Keep the name tied to the city centre. The previous sideways offset made
    // the label appear to drift away from the city while the camera zoomed in.
    const labelHeight = 1.2;
    const label = labelSprite(); label.sprite.position.set(0, labelHeight, 0); group.add(label.sprite);
    const stem = lineFor([new THREE.Vector3(0, .88, 0), new THREE.Vector3(0, labelHeight - .25, 0)], meta.glow, .75); group.add(stem);
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(.2), new THREE.MeshStandardMaterial({ color: meta.glow, emissive: meta.glow, emissiveIntensity: 1.2, metalness: .5, roughness: .2 }));
    beacon.position.set(0, 2.6, -townRadius - 1); group.add(beacon);
    const victoryRing = new THREE.Mesh(new THREE.RingGeometry(townRadius * 1.12, townRadius * 1.15, 96), new THREE.MeshBasicMaterial({ color: 0xffdc8c, transparent: true, opacity: .75, side: THREE.DoubleSide }));
    victoryRing.rotation.x = -Math.PI / 2; victoryRing.position.y = .83; victoryRing.visible = false; group.add(victoryRing);
    const fogMat = new THREE.MeshStandardMaterial({ color: 0x762c32, roughness: 1, transparent: true, opacity: 0, depthWrite: false });
    const fog = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(townRadius * .34, 1), fogMat);
      puff.scale.set(1.7, .4, 1); puff.position.set(Math.cos(k * 1.6) * townRadius * .65, 1.5, Math.sin(k * 1.6) * townRadius * .65); fog.add(puff);
    }
    fog.visible = false; group.add(fog);
    regions.push({ meta, data, group, topMat, sideMat, stages, borders, label, beacon, stem, victoryRing, fog, fogMat, stage: 0, economy: 100, points: 0, targetY: 0, targetColor: new THREE.Color(1, 1, 1), topTint: new THREE.Color(1, 1, 1) });
  }
  const hud = document.createElement("div"); hud.className = "map-tools";
  const homeButton = document.createElement("button"); homeButton.type = "button"; homeButton.textContent = "↗ Вся карта"; homeButton.title = "Вернуть общий вид Казахстана";
  const regionSelect = document.createElement("select"); regionSelect.setAttribute("aria-label","Регион карты");
  regionSelect.innerHTML = '<option value="">Найти регион…</option>' + REGIONS.map(r=>`<option value="${r.id}">${r.name}</option>`).join("");
  regionSelect.addEventListener("change",()=>{if(regionSelect.value)focusRegion(regionSelect.value)});
  const qualityButton=document.createElement('button');qualityButton.type='button';qualityButton.className='map-quality';qualityButton.setAttribute('aria-label','Экономный режим 3D-графики');
  function paintQuality(){qualityButton.textContent=lowPower?'Экономно':'Детально';qualityButton.setAttribute('aria-pressed',String(lowPower))}
  function setLowPower(value){lowPower=!!value;renderer.setPixelRatio(Math.min(lowPower?1:1.5,window.devicePixelRatio||1));renderer.shadowMap.enabled=!lowPower;try{localStorage.setItem('cq_graphics_v1',lowPower?'low':'standard')}catch{}paintQuality();wake()}
  qualityButton.addEventListener('click',()=>setLowPower(!lowPower));paintQuality();
  hud.append(homeButton,regionSelect,qualityButton); canvas.parentElement.append(hud);
  let selected = null, cameraTween = null, disposed = false, frame = 0, initial = true,sceneVisible=true,requestedVisible=true,renderingReady=false,activeUntil=0,latestState=null,mapPreview=null,lastFocusId,lastWorldPaint=0,worldMatch=null;
  const worldEffects=new Map(),seenWorld=new Set();
  function clearWorld(){for(const effect of worldEffects.values())effect.dispose();worldEffects.clear()}
  function syncWorldAchievements(state){
    if(worldMatch!==state.match?.id){clearWorld();seenWorld.clear();worldMatch=state.match?.id}
    if(state.viewer&&!state.viewer.player&&!['teacher','creator'].includes(state.viewer.role)){clearWorld();return}
    const newEffects=[];for(const award of state.worldAchievements||[]){
      if(seenWorld.has(award.id))continue;seenWorld.add(award.id);if(seenWorld.size>1000)seenWorld.delete(seenWorld.values().next().value);
      const duration=award.durationMs||7800,elapsed=Math.max(0,(state.serverTime||Date.now())-award.startedAt+Math.max(0,Date.now()-(state.clientReceivedAt||Date.now())));if(elapsed>=duration)continue;
      const team=state.regions.find(t=>t.id===award.teamId),base=team&&metadataFor(team).baseRegionId,region=regions.find(r=>r.meta.id===base);if(!region)continue;
      if(Object.hasOwn(ANIMATION_MODULES,award.achievementId)){
        const group=new THREE.Group();region.group.add(group);let cancelled=false,animation=null,normalizer=null;
        const started=performance.now()-elapsed;
        const effect={group,started,update(seconds){if(seconds*1000>=duration)return false;if(animation){try{animation.update(seconds,1/30);group.visible=true;}catch(error){console.error('Ошибка анимации на карте:',error);return false;}}return true},dispose(){cancelled=true;animation?.dispose?.();if(animation)disposeAnimationScene(animation.scene);group.removeFromParent()}};
        worldEffects.set(award.id,effect);newEffects.push({region,award});wake(duration-elapsed);
        import(ANIMATION_MODULES[award.achievementId]).then(module=>{
          if(cancelled||disposed)return;
          animation=module.createAnimation({THREE,reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches,lowPower:true,mapMode:true});
          animation.update(Math.min(6.8,duration/1000),0);
          const box=(animation.mapBounds||new THREE.Box3().setFromObject(animation.scene)),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
          const scale=12/Math.max(size.x,size.y,size.z,1);normalizer=new THREE.Group();normalizer.scale.setScalar(scale);normalizer.position.set(-center.x*scale,.8-box.min.y*scale,-center.z*scale);
          normalizer.add(animation.scene);group.add(normalizer);animation.scene.background=null;
          animation.update(Math.max(0,(performance.now()-started)/1000),0);wake(duration);
        }).catch(error=>{console.error('Не удалось загрузить сцену достижения:',error);effect.dispose();worldEffects.delete(award.id)});
        continue;
      }
      const effect=(award.achievementId==='sky-breaker'?mapAchievement:mapLegendaryAchievement)(award,window.matchMedia('(prefers-reduced-motion: reduce)').matches);effect.started=performance.now()-elapsed;effect.group.scale.setScalar(clamp(region.data.cityRadius*.5,1.25,1.8));effect.group.position.y=.7;
      const peers=state.regions.filter(t=>metadataFor(t).baseRegionId===base);if(peers.length>1){const angle=peers.findIndex(t=>t.id===team.id)*Math.PI*2/peers.length,radius=Math.min(2.2,region.data.cityRadius*.65);effect.group.position.x=Math.cos(angle)*radius;effect.group.position.z=Math.sin(angle)*radius}
      region.group.add(effect.group);worldEffects.set(award.id,effect);newEffects.push({region,award});wake(duration-elapsed);
    }
    if(newEffects.length){selected=null;mapPreview=null;regionSelect.value='';const distance=Math.max(44,44/(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));
      if(newEffects.length===1){
        const region=newEffects[0].region;moveCamera(new THREE.Vector3(region.data.city[0],region.group.position.y+6,region.data.city[1]),Math.max(18,14/Math.max(.45,camera.aspect)));
      }else moveCamera(new THREE.Vector3(0,4,0),Math.min(138,distance));
    }
  }
  function wake(ms=180){activeUntil=performance.now()+ms;if(renderingReady&&!frame&&!disposed&&sceneVisible&&requestedVisible&&!document.hidden)frame=requestAnimationFrame(animate)}
  function setVisible(value){if(requestedVisible===value)return;requestedVisible=value;if(value)wake();else{cancelAnimationFrame(frame);frame=0}}
  function moveCamera(target, distance) {
    cameraTween = { target, position: target.clone().add(new THREE.Vector3(0, distance * .79, distance * .71)) };
    wake();
  }
  function overview() {
    selected = null;mapPreview=null;regionSelect.value="";if(latestState)update(latestState,lastFocusId);
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2), distance = Math.max(44, 44 / (Math.tan(halfFov) * camera.aspect));
    moveCamera(new THREE.Vector3(0, 0, 0), Math.min(138, distance));
  }
  homeButton.addEventListener("click", overview);
  function focusRegion(id) {
    const team=latestState?.regions.find(t=>t.id===id),baseId=team?metadataFor(team).baseRegionId:id;
    const region = regions.find(r => r.meta.id === baseId); if (!region) return;
    selected = baseId;regionSelect.value=id;mapPreview=team?.id||null;if(latestState)update(latestState,lastFocusId);
    const width = region.data.bounds[2] - region.data.bounds[0], depth = region.data.bounds[3] - region.data.bounds[1];
    const target = new THREE.Vector3(region.data.city[0], region.group.position.y + .71, region.data.city[1]);
    const distance = Math.max(4, Math.max(width / Math.max(.8, camera.aspect), depth * .9) * 1.65);
    moveCamera(target, distance);
  }
  const stopTween = () => { cameraTween = null; };
  controls.addEventListener("start", stopTween);
  controls.addEventListener('change',()=>wake());
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(); let down = null;
  const onDown = e => { down = [e.clientX, e.clientY]; };
  const onUp = e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const rect = canvas.getBoundingClientRect(); pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects(surfaces, false)[0];
    if (hit) focusRegion(hit.object.userData.regionId); down = null;
  };
  canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointerup", onUp);
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (selected) focusRegion(mapPreview||selected); else overview();
    if (initial && cameraTween) { camera.position.copy(cameraTween.position); controls.target.copy(cameraTween.target); cameraTween = null; initial = false; }
    wake();
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  let stateKey='';
  function update(state, selectedRegionId) {
    syncWorldAchievements(state);
    latestState=state;if(selectedRegionId!==lastFocusId){mapPreview=selectedRegionId||null;lastFocusId=selectedRegionId}const previewId=mapPreview,key=JSON.stringify([previewId,state.regions.map(r=>[r.id,r.name,r.baseRegionId,r.cityId,r.points,r.economy,r.scoreLimit,r.occupied??r.members.length])]);if(key===stateKey)return;stateKey=key;
    const cityOptions=state.regions.filter(t=>t.cityId).map(t=>`<option value="${t.id}">${String(t.name).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</option>`).join('');if(regionSelect.dataset?.cities!==cityOptions){const value=regionSelect.value;regionSelect.innerHTML='<option value="">Найти регион…</option>'+REGIONS.map(r=>`<option value="${r.id}">${r.name}</option>`).join('')+(cityOptions?'<optgroup label="Команды городов · территория области">'+cityOptions+'</optgroup>':'');if(regionSelect.dataset)regionSelect.dataset.cities=cityOptions;regionSelect.value=value;regionSelect.title='Города команд показываются на территории своей области.';}
    const selectedTeam = state.regions.find(t=>t.id===previewId);
    const selectedBase = selectedTeam ? metadataFor(selectedTeam).baseRegionId : null;
    for (const r of mapRegionsFor(state.regions,previewId)) {
      const region = regions.find(item => item.meta.id === r.id); if (!region) continue;
      region.points = clamp(r.points, 0, RESOURCE_CAP); region.economy = r.economy;
      region.stage = developmentFor(region.points).index;
      region.targetY = .1 + region.points / RESOURCE_CAP * .9 - (1 - r.economy / 100) * 1.45;
      const crisis = r.economy < CRISIS_THRESHOLD;
      region.targetColor.set(crisis ? 0x634048 : 0xffffff).multiplyScalar(crisis ? 1 : .6 + r.economy / 250);
      region.topMat.emissive.set(crisis ? 0xc33532 : region.points === RESOURCE_CAP ? 0xdcb864 : region.meta.color);
      region.topMat.emissiveIntensity = crisis ? .18 : .025 + region.points / RESOURCE_CAP * .085;
      for (const border of region.borders) { border.material.color.set(crisis ? 0xff655b : region.points === RESOURCE_CAP ? 0xffdf94 : region.meta.glow); border.material.opacity = region.meta.id === selectedBase || crisis || region.points === RESOURCE_CAP ? .95 : .5; }
      region.victoryRing.visible = region.points === RESOURCE_CAP;
      region.hasTeams = state.regions.some(t=>metadataFor(t).baseRegionId===r.id);
      paintLabel(region.label, selectedBase===r.id?{...region.meta,name:selectedTeam.name}:region.meta, r.points, r.economy,r.scoreLimit);
    }
    wake(1500);
  }
  const projected = new THREE.Vector3(), cameraSpace = new THREE.Vector3();
  function arrangeLabels(){
    scene.updateMatrixWorld(); camera.updateMatrixWorld();
    const width=canvas.clientWidth,height=canvas.clientHeight,placed=[];
    const ordered=[...regions].sort((a,b)=>Number(b.meta.id===selected)-Number(a.meta.id===selected)||Number(!!b.hasTeams)-Number(!!a.hasTeams));
    for(const r of ordered){
      r.label.sprite.getWorldPosition(projected);
      cameraSpace.copy(projected).applyMatrix4(camera.matrixWorldInverse);
      const depth=Math.max(.1,-cameraSpace.z);
      // Labels remain readable in the overview and grow moderately when the
      // user approaches a city, instead of looking farther away than the map.
      const {pixels:pixelWidth,world:worldWidth}=labelScaleForDepth(depth,height,camera.fov);
      r.label.sprite.scale.set(worldWidth,worldWidth/4,1);projected.project(camera);
      const x=(projected.x+1)*width/2,y=(1-projected.y)*height/2;
      const box={x:x-pixelWidth/2,y:y-pixelWidth/4,w:pixelWidth,h:pixelWidth/4};
      const inView=projected.z>-1&&projected.z<1&&x>0&&x<width&&y>0&&y<height;
      const overlaps=placed.some(b=>box.x<b.x+b.w&&box.x+box.w>b.x&&box.y<b.y+b.h&&box.y+box.h>b.y);
      r.label.sprite.visible=inView&&(!overlaps||r.meta.id===selected);
      if(r.label.sprite.visible)placed.push(box);
    }
  }
  const clock = new THREE.Clock(), reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function animate() {
    frame=0;if (disposed||!sceneVisible||!requestedVisible||document.hidden) return;
    if(worldEffects.size&&lowPower&&performance.now()-lastWorldPaint<1000/30){frame=requestAnimationFrame(animate);return}lastWorldPaint=performance.now();
    const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime, rate = reduceMotion ? 1 : 1 - Math.exp(-dt * 5);
    if (cameraTween) {
      camera.position.lerp(cameraTween.position, rate); controls.target.lerp(cameraTween.target, rate);
      if (camera.position.distanceTo(cameraTween.position) < .02) cameraTween = null;
    }
    let settling=false;
    for (const region of regions) {
      if(Math.abs(region.group.position.y-region.targetY)>.001)settling=true;
      const previousY=region.group.position.y;
      region.group.position.y = THREE.MathUtils.lerp(region.group.position.y, region.targetY, rate);
      if(region.meta.id===selected){
        const lift=region.group.position.y-previousY;
        camera.position.y+=lift;controls.target.y+=lift;
        if(cameraTween){cameraTween.position.y+=lift;cameraTween.target.y+=lift}
      }
      region.topTint.lerp(region.targetColor, rate); region.topMat.color.copy(region.topTint);
      for (let i = 0; i < region.stages.length; i++) {
        const stage = region.stages[i], target = i < region.stage ? 1 : .001;
        if(Math.abs(stage.scale.y-target)>.001)settling=true;
        stage.scale.y = THREE.MathUtils.lerp(stage.scale.y, target, rate); stage.visible = stage.scale.y > .012;
      }
      region.beacon.rotation.y += reduceMotion ? 0 : dt * .55; region.beacon.position.y = 2.6 + (reduceMotion ? 0 : Math.sin(t * 1.7) * .12);
      const opacity = region.economy < CRISIS_THRESHOLD ? (1 - region.economy / 100) * .32 : 0;
      region.fogMat.opacity = THREE.MathUtils.lerp(region.fogMat.opacity, opacity, rate); region.fog.visible = region.fogMat.opacity > .01;
      region.fog.children.forEach((p, i) => { p.position.y = 1.5 + (reduceMotion ? 0 : Math.sin(t * .45 + i) * .12); });
    }
    controls.update();arrangeLabels();
    for(const [id,effect]of worldEffects)if(!effect.update((performance.now()-effect.started)/1000,camera,canvas.clientHeight)){effect.dispose();worldEffects.delete(id)}
    renderer.render(scene, camera);
    if(!frame&&(cameraTween||settling||worldEffects.size||performance.now()<activeUntil))frame=requestAnimationFrame(animate);
  }
  const onVisibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0}else wake()};document.addEventListener('visibilitychange',onVisibility);
  const visibilityObserver=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{sceneVisible=entries[0]?.isIntersecting??true;if(sceneVisible)wake();else{cancelAnimationFrame(frame);frame=0}});visibilityObserver?.observe(canvas);
  renderingReady=true;animate();
  function dispose() {
    disposed = true;clearWorld();cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
    visibilityObserver?.disconnect();document.removeEventListener('visibilitychange',onVisibility);
    canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointerup", onUp); hud.remove();
    const geometries = new Set(), mats = new Set(), textures = new Set();
    scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) for (const mat of Array.isArray(object.material) ? object.material : [object.material]) { mats.add(mat); if (mat.map) textures.add(mat.map); } });
    geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); mats.forEach(m => m.dispose()); renderer.dispose();
    box.dispose(); cone.dispose(); cylinder.dispose(); dome.dispose();
  }
  return { scene, camera, controls, renderer, update, focusRegion, overview, resize, setVisible,setLowPower,dispose };
}

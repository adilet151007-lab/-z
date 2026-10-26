export const durationMs = 11000;
const DURATION_MS = durationMs;
export const captionAtMs = 8500;
export const posterAtMs = 8900;
const CAPTION_AT_MS = captionAtMs;

export function createAnimation({ THREE, reducedMotion = false, lowPower = false, mapMode = false }) {
  if (!THREE) throw new Error('createAnimation requires THREE.');
  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.name = 'Portrait-safe studio camera';
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const G = g => (geometries.add(g), g);
  const M = m => (materials.add(m), m);
  const T = t => (textures.add(t), t);
  const V = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
  const PI = Math.PI, TAU = PI*2;
  const clamp = (v,a=0,b=1) => Math.min(b,Math.max(a,v));
  const mix = (a,b,u) => a+(b-a)*u;
  const smooth = (a,b,t) => { const u=clamp((t-a)/(b-a)); return u*u*(3-2*u); };
  const out = v => 1-Math.pow(1-clamp(v),3);
  const hash = i => { const v=Math.sin(i*127.1+91.7)*43758.5453; return v-Math.floor(v); };
  const colors = [0x18ebcb,0xff9eaf,0xaa86ff,0x649dff,0xf02559,0x53df98];
  const names = ['Ты смог, братец','Вершина башни','Нулевая карта','Три линии сюжета в книге','Сердце с зажившими трещинами','Круг тренировки'];
  const starts = [1.5,2.16,2.82,3.48,4.14,4.80];
  const ends = [2.16,2.82,3.48,4.14,4.80,5.50];
  const caption = {
    title:'Я — сама неотвратимость',
    subtitle:'Предел культурного капитала снят · 1000 → ∞',
    atMs:CAPTION_AT_MS
  };
  let disposed=false, environmentRT=null, envRenderer=null, preparing=false;
  let pointerX=0, pointerY=0, viewW=1, viewH=1, fitDistance=15, lastTime=0;
  const dummy = new THREE.Object3D(), colorTemp=new THREE.Color();
  const brushedTexture=(()=>{
    const c=document.createElement('canvas');c.width=c.height=256;
    const x=c.getContext('2d'),data=x.createImageData(256,256);
    for(let y=0;y<256;y++)for(let xx=0;xx<256;xx++){
      const i=(y*256+xx)*4,n=128+Math.round(Math.sin(y*2.31+Math.sin(xx*.03)*.2)*7+(hash(y*256+xx)-.5)*5);
      data.data[i]=data.data[i+1]=data.data[i+2]=n;data.data[i+3]=255;
    }
    x.putImageData(data,0,0);
    const tx=T(new THREE.CanvasTexture(c));tx.wrapS=tx.wrapT=THREE.RepeatWrapping;tx.repeat.set(2,3);
    return tx;
  })();
  const gold = M(new THREE.MeshPhysicalMaterial({
    color:0xf5c242, metalness:.85, roughness:.22, clearcoat:.45,
    clearcoatRoughness:.15, emissive:0x3d2604, emissiveIntensity:.35,
    envMapIntensity:1.15,bumpMap:brushedTexture,bumpScale:.0024
  }));
  const satin = M(gold.clone()); satin.roughness=.34; satin.color.set(0xdcae46);
  const paleGold = M(gold.clone()); paleGold.color.set(0xffdc81); paleGold.roughness=.18;
  const dark = M(new THREE.MeshStandardMaterial({color:0x191a20,metalness:.55,roughness:.34}));
  const fineGold = M(new THREE.MeshBasicMaterial({color:0xe5bb62,toneMapped:false}));
  const mesh = (geo,mat,parent,pos) => {
    if(mat.bumpMap&&!geo.getAttribute('uv')&&geo.getAttribute('position')){
      geo.computeBoundingBox();const bb=geo.boundingBox,pa=geo.getAttribute('position'),uv=[];
      for(let i=0;i<pa.count;i++)uv.push((pa.getX(i)-bb.min.x)/Math.max(.01,bb.max.x-bb.min.x),(pa.getY(i)-bb.min.y)/Math.max(.01,bb.max.y-bb.min.y));
      geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    }
    const o=new THREE.Mesh(geo,mat); if(parent) parent.add(o);
    if(pos) o.position.copy(pos); return o;
  };
  const group = (parent,name) => {const o=new THREE.Group(); o.name=name||''; if(parent)parent.add(o);return o;};
  const sphereGeo = G(new THREE.SphereGeometry(1,lowPower?12:32,lowPower?8:24));
  const sphere = (parent,pos,scale,mat=gold) => { const o=mesh(sphereGeo,mat,parent,pos); o.scale.set(scale[0],scale[1],scale[2]); return o; };
  const tube = (parent,points,r,mat,closed=false,segments=64) => {
    const curve=points instanceof THREE.Curve?points:new THREE.CatmullRomCurve3(points,closed,'catmullrom',.45);
    return mesh(G(new THREE.TubeGeometry(curve,lowPower?Math.max(8,Math.min(32,Math.round(segments*.35))):segments,r,lowPower?6:24,closed)),mat,parent);
  };
  const torus = (parent,r,thickness,mat,pos,arc=TAU) => mesh(G(new THREE.TorusGeometry(r,thickness,lowPower?6:24,lowPower?32:96,arc)),mat,parent,pos);
  const glowMaterial = color => M(new THREE.MeshBasicMaterial({
    color,transparent:true,opacity:1,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false
  }));
  const glowTexture = (() => {
    const c=document.createElement('canvas');c.width=c.height=256;
    const x=c.getContext('2d'),g=x.createRadialGradient(128,128,0,128,128,128);
    g.addColorStop(0,'rgba(255,255,255,.75)');g.addColorStop(.12,'rgba(255,255,255,.42)');
    g.addColorStop(.32,'rgba(255,255,255,.12)');g.addColorStop(.65,'rgba(255,255,255,.025)');g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g;x.fillRect(0,0,256,256);const tx=T(new THREE.CanvasTexture(c));tx.colorSpace=THREE.SRGBColorSpace;return tx;
  })();
  const glow = (parent,color,size) => {
    const mat=M(new THREE.SpriteMaterial({map:glowTexture,color,transparent:true,opacity:.7,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
    const o=new THREE.Sprite(mat);o.scale.set(size,size,1);parent.add(o);return o;
  };
  // Renderer-free construction. PMREM is prepared lazily on the first render,
  // using that player's renderer. The studio never becomes the visible backdrop.
  function prepareEnvironment(renderer) {
    if(disposed || preparing || envRenderer===renderer) return;
    // The six-face floating-point studio pass is unnecessary on a phone.
    // Direct studio lights keep the same rig usable without HDR render targets.
    if(lowPower){envRenderer=renderer;return;}
    preparing=true;
    const studio=new THREE.Scene();
    studio.background=new THREE.Color(0x181b22);
    const resources=[];
    const panel=(w,h,color,intensity,pos) => {
      const geo=new THREE.PlaneGeometry(w,h);
      const mat=new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(intensity),side:THREE.DoubleSide});
      const p=new THREE.Mesh(geo,mat);p.position.copy(pos);p.lookAt(0,0,0);studio.add(p);resources.push(geo,mat);
    };
    panel(3,9,0xffefcc,4.0,V(-4,4,5));
    panel(2,10,0xffffff,2.4,V(5,1,2));
    panel(10,3,0xffbb55,2.5,V(0,6,-3));
    panel(3,8,0xffffff,1.5,V(-5,-1,-3));
    panel(8,8,0x759cae,.7,V(0,-6,2));
    const pmrem=new THREE.PMREMGenerator(renderer);
    const previousTarget=renderer.getRenderTarget();
    const previousAlpha=renderer.getClearAlpha();
    const previousColor=new THREE.Color();renderer.getClearColor(previousColor);
    try {
      const rt=pmrem.fromScene(studio,.07,.1,50,{size:lowPower?128:256});
      if(environmentRT)environmentRT.dispose();
      environmentRT=rt;scene.environment=rt.texture;envRenderer=renderer;
      if(mapMode)scene.traverse(object=>{const list=Array.isArray(object.material)?object.material:[object.material];for(const material of list)if(material?.isMeshStandardMaterial){material.envMap=rt.texture;material.needsUpdate=true;}});
    } finally {
      renderer.setRenderTarget(previousTarget);renderer.setClearColor(previousColor,previousAlpha);
      pmrem.dispose();resources.forEach(r=>r.dispose());studio.clear();preparing=false;
    }
  }
  scene.onBeforeRender = renderer => prepareEnvironment(renderer);
  scene.userData.prepareEnvironment=prepareEnvironment;
  scene.add(new THREE.HemisphereLight(0xffedcf,0x344057,.42));
  const key=new THREE.DirectionalLight(0xffe6b0,2.6);key.position.set(-3,6,8);scene.add(key);
  const rim=new THREE.DirectionalLight(0xffaa33,3.2);rim.position.set(4,3,-4);scene.add(rim);
  const fill=new THREE.DirectionalLight(0xc6ddff,.8);fill.position.set(4,1,5);scene.add(fill);
  const localLight=new THREE.PointLight(0xffb951,1.2,9,2);localLight.position.set(0,1,4);scene.add(localLight);

  // A local radial scrim only. Alpha is <= .52 at the very center and zero at edges.
  const scrimTexture=(()=>{
    const c=document.createElement('canvas');c.width=c.height=512;
    const x=c.getContext('2d'),g=x.createRadialGradient(256,256,0,256,256,256);
    g.addColorStop(0,'rgba(5,10,17,.52)');g.addColorStop(.42,'rgba(5,10,17,.38)');
    g.addColorStop(.75,'rgba(5,10,17,.10)');g.addColorStop(1,'rgba(5,10,17,0)');
    x.fillStyle=g;x.fillRect(0,0,512,512);return T(new THREE.CanvasTexture(c));
  })();
  const scrim=mesh(G(new THREE.PlaneGeometry(7.4,9.0)),M(new THREE.MeshBasicMaterial({
    map:scrimTexture,transparent:true,opacity:1,depthWrite:false,toneMapped:false
  })),scene,V(0,.4,-1.5));
  scrim.renderOrder=-10;

  const handRoot=group(scene,'handRoot');
  const wristAssembly=group(handRoot,'wristAssembly');
  const palmCore=group(handRoot,'palmCore');
  const assembly=[];
  function assemble(o,vector,delay=0) {
    assembly.push({o,base:o.position.clone(),vector:vector.clone(),delay});
    return o;
  }
  function extrudeShape(shape,depth=.12,bevel=.06) {
    const g=G(new THREE.ExtrudeGeometry(shape,{
      depth,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:lowPower?2:8,
      steps:lowPower?1:2,curveSegments:lowPower?8:32
    }));
    g.translate(0,0,-depth/2);
    g.computeVertexNormals();g.computeBoundingBox();
    // A separate smooth parametric crown sits above the rounded extruded lid.
    // Its regular polar topology prevents large cap triangles from looking faceted.
    const outline=shape.getPoints(lowPower?40:160),bb=g.boundingBox;
    const cx=(bb.min.x+bb.max.x)/2,cy=(bb.min.y+bb.max.y)/2;
    const N=lowPower?24:72,R=lowPower?5:16,bulge=Math.min(.032,(bb.max.x-bb.min.x)*.10,(bb.max.y-bb.min.y)*.10);
    const positions=[cx,cy,bb.max.z+.0006+bulge],idx=[];
    function radius(th){
      const dx=Math.cos(th),dy=Math.sin(th);let best=Infinity;
      for(let i=0;i<outline.length-1;i++){
        const a=outline[i],b=outline[i+1],ax=a.x-cx,ay=a.y-cy,ex=b.x-a.x,ey=b.y-a.y;
        const det=dx*ey-dy*ex;if(Math.abs(det)<1e-8)continue;
        const distance=(ax*ey-ay*ex)/det,u=(ax*dy-ay*dx)/det;
        if(distance>0&&u>=0&&u<=1)best=Math.min(best,distance);
      }
      return Number.isFinite(best)?best:0;
    }
    const radii=Array.from({length:N},(_,k)=>radius(k/N*TAU));
    for(let j=1;j<=R;j++)for(let k=0;k<N;k++){
      const th=k/N*TAU,u=j/R,r=radii[k]*u;
      const px=cx+Math.cos(th)*r,py=cy+Math.sin(th)*r;
      const nx=(px-cx)/((bb.max.x-bb.min.x)*.51),ny=(py-cy)/((bb.max.y-bb.min.y)*.51);
      const domeHeight=bulge*Math.pow(Math.max(0,1-nx*nx-ny*ny),1.6);
      positions.push(px,py,bb.max.z+.0006+domeHeight);
    }
    for(let k=0;k<N;k++)idx.push(0,1+k,1+(k+1)%N);
    for(let j=0;j<R-1;j++)for(let k=0;k<N;k++){
      const a=1+j*N+k,b=1+j*N+(k+1)%N,c=a+N,d=b+N;
      idx.push(a,c,b,b,c,d);
    }
    const dome=G(new THREE.BufferGeometry());dome.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));dome.setIndex(idx);dome.computeVertexNormals();
    const non=dome.toNonIndexed(),pa=g.getAttribute('position'),na=g.getAttribute('normal');
    const dp=non.getAttribute('position'),dn=non.getAttribute('normal');
    const ps=new Float32Array(pa.array.length+dp.array.length),ns=new Float32Array(na.array.length+dn.array.length);
    ps.set(pa.array);ps.set(dp.array,pa.array.length);ns.set(na.array);ns.set(dn.array,na.array.length);
    const result=G(new THREE.BufferGeometry());result.setAttribute('position',new THREE.BufferAttribute(ps,3));result.setAttribute('normal',new THREE.BufferAttribute(ns,3));
    non.dispose();return result;
  }
  // V2: an actual enclosing armored glove, rather than a chain of beads.
  const etched=M(new THREE.MeshStandardMaterial({color:0x71501f,metalness:.75,roughness:.42}));
  const innerGold=M(gold.clone());innerGold.color.set(0x9f772c);innerGold.roughness=.47;
  const jointLiner=M(new THREE.MeshStandardMaterial({color:0x30271d,metalness:.28,roughness:.66}));
  const palmShape=new THREE.Shape();
  palmShape.moveTo(-.62,-1.23);
  palmShape.bezierCurveTo(-.80,-1.00,-1.10,-.58,-1.16,-.16);
  palmShape.bezierCurveTo(-1.20,.36,-1.15,.72,-.89,.94);
  palmShape.bezierCurveTo(-.48,1.17,.32,1.18,.86,.95);
  palmShape.bezierCurveTo(1.14,.83,1.20,.36,1.10,-.07);
  palmShape.bezierCurveTo(1.00,-.53,.75,-1.08,.62,-1.23);
  palmShape.quadraticCurveTo(0,-1.36,-.62,-1.23);
  const hole=new THREE.Path();hole.absarc(0,-.19,.342,0,TAU,true);palmShape.holes.push(hole);

  function contourRadius(outline,theta,cx=0,cy=0) {
    const dx=Math.cos(theta),dy=Math.sin(theta);let best=Infinity;
    for(let j=0;j<outline.length-1;j++){
      const a=outline[j],b=outline[j+1],ax=a.x-cx,ay=a.y-cy,ex=b.x-a.x,ey=b.y-a.y;
      const det=dx*ey-dy*ex;if(Math.abs(det)<1e-8)continue;
      const distance=(ax*ey-ay*ex)/det,u=(ax*dy-ay*dx)/det;
      if(distance>0&&u>=0&&u<=1)best=Math.min(best,distance);
    }
    return Number.isFinite(best)?best:1;
  }
  // Sculpted dorsal volume and a separately padded inner palm share a real aperture.
  function sculptedPalm(){
    const outline=palmShape.getPoints(lowPower?64:192),N=lowPower?48:128,R=lowPower?8:28,positions=[],uv=[],indices=[];
    const radii=Array.from({length:N+1},(_,k)=>contourRadius(outline,k/N*TAU,0,-.19));
    for(let side=0;side<2;side++)for(let ring=0;ring<=R;ring++)for(let k=0;k<=N;k++){
      const th=k/N*TAU,r=mix(.342,radii[k],ring/R);
      const x=Math.cos(th)*r,y=-.19+Math.sin(th)*r;
      const z=.16+.22*Math.sqrt(Math.max(.015,1-Math.pow(x/1.25,2)))+.035*(1-Math.pow(y/1.5,2));
      const back=-.19-.15*Math.sqrt(Math.max(.015,1-Math.pow(x/1.3,2)));
      positions.push(x,y,side===0?z:back);uv.push((x+1.3)/2.6,(y+1.4)/2.7);
    }
    const stride=N+1,layer=(R+1)*stride;
    for(let side=0;side<2;side++)for(let r=0;r<R;r++)for(let k=0;k<N;k++){
      const a=side*layer+r*stride+k,b=a+1,c=a+stride,d=c+1;
      if(side===0)indices.push(a,c,b,b,c,d);else indices.push(a,b,c,b,d,c);
    }
    for(const r of [0,R])for(let k=0;k<N;k++){
      const a=r*stride+k,b=a+1,c=a+layer,d=b+layer;
      if(r===0)indices.push(a,b,c,b,d,c);else indices.push(a,c,b,b,c,d);
    }
    const g=G(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
  }
  const body=mesh(sculptedPalm(),gold,palmCore);body.name='Anatomical continuous glove shell';
  assemble(body,V(.1,-1.1,-.5),0);
  const innerRing=torus(palmCore,.342,.028,jointLiner,V(0,-.19,.02));assemble(innerRing,V(0,0,-.7),.1);

  // V3 surface hierarchy: cast metal, recessed enamel, polished rims, carved inlays.
  const antique=M(gold.clone());antique.color.set(0x9e7330);antique.roughness=.42;antique.emissiveIntensity=.12;
  const polish=M(gold.clone());polish.color.set(0xffda82);polish.roughness=.16;polish.emissiveIntensity=.18;
  const inlayTextures=(()=>{
    const size=lowPower?256:768,c=document.createElement('canvas'),b=document.createElement('canvas');
    c.width=c.height=b.width=b.height=size;
    const x=c.getContext('2d'),h=b.getContext('2d'),data=x.createImageData(size,size),height=h.createImageData(size,size);
    for(let y=0;y<size;y++)for(let px=0;px<size;px++){
      const j=(y*size+px)*4;
      const grain=hash(px*1.17+y*397.7),cloud=Math.sin(px*.013+Math.sin(y*.009))*Math.sin(y*.017);
      const value=228+Math.round(grain*12+cloud*7);
      data.data[j]=value;data.data[j+1]=value;data.data[j+2]=Math.max(0,value-4);data.data[j+3]=255;
      height.data[j]=height.data[j+1]=height.data[j+2]=125+Math.round(grain*5);height.data[j+3]=255;
    }
    x.putImageData(data,0,0);h.putImageData(height,0,0);
    function draw(ctx,col,line){
      ctx.save();ctx.scale(size/1000,size/1000);ctx.strokeStyle=col;ctx.lineWidth=line;ctx.lineJoin='round';ctx.lineCap='round';
      const outline=(m)=>{
        ctx.beginPath();ctx.moveTo(350,m);ctx.lineTo(650,m);
        ctx.bezierCurveTo(780,m,850,m+90,850,280);
        ctx.lineTo(850,760);ctx.quadraticCurveTo(850,900-m*.1,650,910);
        ctx.lineTo(350,910);ctx.quadraticCurveTo(150,900-m*.1,150,760);
        ctx.lineTo(150,280);ctx.bezierCurveTo(150,m+90,220,m,350,m);ctx.stroke();
      };
      outline(100);
      ctx.beginPath();ctx.moveTo(500,150);ctx.lineTo(500,845);ctx.stroke();
      for(const side of [-1,1]){
        for(let j=0;j<7;j++){
          const y=244+j*81;
          ctx.beginPath();ctx.moveTo(500,y+42);ctx.lineTo(500+side*150,y-25);ctx.lineTo(500+side*150,y-56);ctx.stroke();
          ctx.beginPath();ctx.moveTo(500+side*230,y+42);ctx.lineTo(500+side*260,y+22);ctx.lineTo(500+side*260,y-18);ctx.lineTo(500+side*230,y-36);ctx.stroke();
        }
        ctx.beginPath();ctx.moveTo(500+side*75,155);ctx.bezierCurveTo(500+side*240,145,500+side*240,295,500+side*95,282);ctx.bezierCurveTo(500+side*35,278,500+side*65,217,500+side*112,231);ctx.stroke();
      }
      ctx.restore();
    }
    draw(x,'#77674e',9);draw(x,'#c0ad88',2);
    draw(h,'#4c4c4c',10);draw(h,'#b6b6b6',2);
    const color=T(new THREE.CanvasTexture(c));color.colorSpace=THREE.SRGBColorSpace;color.anisotropy=4;
    const bump=T(new THREE.CanvasTexture(b));bump.anisotropy=4;
    return {color,bump};
  })();
  const carved=M(gold.clone());
  carved.color.set(0xe3b757);carved.map=inlayTextures.color;carved.bumpMap=inlayTextures.bump;
  carved.bumpScale=.009;carved.roughness=.34;carved.emissiveIntensity=.10;
  const carvedSatin=M(carved.clone());carvedSatin.color.set(0xb88a3c);carvedSatin.roughness=.37;
  const ornamentRoots=[];
  function decoration(parent,name){const o=group(parent,name);ornamentRoots.push(o);return o;}

  // Static details sharing a material are packed into one draw per group.
  // Animated transforms remain on the parent assembly or joint.
  function batchDecoration(root) {
    root.updateMatrixWorld(true);
    const inverse=root.matrixWorld.clone().invert(),batches=new Map(),remove=[];
    root.traverse(o=>{
      if(o!==root&&o.isMesh&&!o.isInstancedMesh&&!Array.isArray(o.material)){
        const key=o.material.uuid;if(!batches.has(key))batches.set(key,{mat:o.material,list:[]});
        batches.get(key).list.push(o);remove.push(o);
      }
    });
    for(const {mat,list} of batches.values()){
      const pos=[],normal=[],uv=[],packedIndices=[],point=new THREE.Vector3(),normalPoint=new THREE.Vector3();
      for(const o of list){
        const g=o.geometry,pa=g.getAttribute('position'),na=g.getAttribute('normal'),ta=g.getAttribute('uv');
        const matrix=new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld),nm=new THREE.Matrix3().getNormalMatrix(matrix);
        const offset=pos.length/3;
        for(let k=0;k<pa.count;k++){
          point.fromBufferAttribute(pa,k).applyMatrix4(matrix);normalPoint.fromBufferAttribute(na,k).applyNormalMatrix(nm);
          pos.push(point.x,point.y,point.z);normal.push(normalPoint.x,normalPoint.y,normalPoint.z);uv.push(ta?ta.getX(k):0,ta?ta.getY(k):0);
        }
        if(g.index)for(const index of g.index.array)packedIndices.push(offset+index);else for(let k=0;k<pa.count;k++)packedIndices.push(offset+k);
      }
      const g=G(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
      g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      g.setIndex(packedIndices);
      const result=mesh(g,mat,root);result.name='Batched hand-crafted relief';result.frustumCulled=false;
    }
    remove.forEach(o=>o.removeFromParent());
  }
  function ringCurve(parent,radius,z,thickness,mat,rx=1,ry=1) {
    const pts=[];for(let j=0;j<=96;j++){const a=j/96*TAU;pts.push(V(Math.cos(a)*radius*rx,Math.sin(a)*radius*ry,z));}
    return tube(parent,pts,thickness,mat,true,96);
  }
  function recessedPlate(shape,depth=.012,bevel=.009) {
    const g=G(new THREE.ExtrudeGeometry(shape,{
      depth,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,
      bevelSegments:lowPower?2:8,steps:lowPower?1:2,curveSegments:lowPower?8:32
    }));
    g.translate(0,0,-depth/2);g.computeVertexNormals();g.computeBoundingBox();
    // ExtrudeGeometry uses shape-space cap UVs; normalize the chased atlas to
    // the entire small inlay, otherwise a finger samples only a blank corner.
    const bb=g.boundingBox,pa=g.getAttribute('position'),uv=[];
    for(let i=0;i<pa.count;i++)uv.push(
      (pa.getX(i)-bb.min.x)/Math.max(.001,bb.max.x-bb.min.x),
      (pa.getY(i)-bb.min.y)/Math.max(.001,bb.max.y-bb.min.y)
    );
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));return g;
  }
  function nestedArmor(parent,w,h,shapeFunction,depth=.0,small=false){
    const d=decoration(parent,'Layered chased gold inlay');
    const outer=shapeFunction(w*.91,h*.91).getPoints(96).map(p=>V(p.x,p.y,depth+.036));
    tube(d,outer,small?.007:.010,polish,true,96);
    mesh(recessedPlate(shapeFunction(w*.77,h*.79),.012,.009),antique,d,V(0,0,depth+.046));
    mesh(recessedPlate(shapeFunction(w*.66,h*.68),.012,.010),carved,d,V(0,0,depth+.063));
    const studs=[];
    for(const side of [-1,1])for(const y of [-.31,.31])studs.push(V(side*w*.34,y*h,depth+.069));
    fasteners(d,studs,small?.009:.013,polish);
    return d;
  }
  // Recessed circular jewelry frames and hooked claws, all on dorsal +Z.
  function bezelRelief(parent,r,index){
    const d=decoration(parent,'Machined crown and chased bezel');
    ringCurve(d,r*1.23,.040,.009,antique);
    ringCurve(d,r*1.17,.089,.006,polish);
    const studs=[],count=index===5?40:20;
    for(let k=0;k<count;k++){
      const a=k/count*TAU;studs.push(V(Math.cos(a)*r*1.20,Math.sin(a)*r*1.20,.071));
    }
    fasteners(d,studs,index===5?.008:.0065,polish);
    const claws=index===5?6:4;
    for(let k=0;k<claws;k++){
      const a=k/claws*TAU+PI/4,cs=Math.cos(a),sn=Math.sin(a);
      tube(d,[V(cs*r*1.22,sn*r*1.22,.015),V(cs*r*1.13,sn*r*1.13,.11),V(cs*r*.88,sn*r*.88,.15)],index===5?.014:.010,polish,false,32);
    }
    if(index===5){
      // Six load-bearing gold ribs form the sun-shaped central seal.
      ringCurve(d,r*1.56,-.065,.018,antique);
      ringCurve(d,r*1.47,-.041,.012,polish);
      for(let k=0;k<12;k++){
        const a=k/12*TAU,c=Math.cos(a),s=Math.sin(a);
        tube(d,[V(c*r*1.62,s*r*1.62,-.075),V(c*r*1.45,s*r*1.45,-.005),V(c*r*1.26,s*r*1.26,.012)],.016,k%2?gold:polish,false,32);
        if(k%2===0){
          const e=sphere(d,V(c*r*1.56,s*r*1.56,-.05),[.045,.045,.028],carvedSatin);
        }
      }
    }
    return d;
  }

  // Wide, rounded trapezoids: overlapping plate armor, without pointed leaf ornaments.
  function plateShape(w,h,taper=.12) {
    const s=new THREE.Shape(),r=Math.min(w*.16,h*.15),b=w*.5,t=w*(.5-taper);
    s.moveTo(-b+r,-h*.5);s.lineTo(b-r,-h*.5);
    s.quadraticCurveTo(b,-h*.5,b,-h*.5+r);
    s.lineTo(t,h*.5-r);s.quadraticCurveTo(t,h*.5,t-r,h*.5);
    s.lineTo(-t+r,h*.5);s.quadraticCurveTo(-t,h*.5,-t,h*.5-r);
    s.lineTo(-b,-h*.5+r);s.quadraticCurveTo(-b,-h*.5,-b+r,-h*.5);return s;
  }
  // The old helper name remains local to miniature achievement scenes, if needed.
  const leafShape=(w,h)=>plateShape(w,h,.08);
  const shields=[],shieldGem=[];
  function armorPlate(x,y,z,w,h,angle,gemIndex=5,mat=satin){
    const m=M(mat.clone()),p=mesh(extrudeShape(plateShape(w,h,.08),.047,.025),m,palmCore,V(x,y,z));
    p.rotation.set(0,x*.12,angle);shields.push(p);shieldGem.push(gemIndex);
    nestedArmor(p,w,h,(w,h)=>plateShape(w,h,.08),.030,false);
    assemble(p,V(x*.50,y*.35,.55),.14+shields.length*.025);return p;
  }
  // Four metacarpal ridges connect each armored finger to the back of the hand.
  [
    [-.79,.55,.38,.40,.64,.11,1],[-.27,.62,.40,.42,.73,.045,2],
    [.29,.60,.40,.41,.70,-.045,3],[.79,.43,.36,.36,.64,-.13,4]
  ].forEach(a=>armorPlate(...a));
  armorPlate(-.73,-.27,.37,.39,1.06,.17,0);
  armorPlate(.73,-.27,.37,.40,1.08,-.17,4);
  armorPlate(0,-.94,.35,1.20,.31,0,5);
  // Thenar mass closes the thumb web; no detached thumb floating beside a palm.
  const thenar=sphere(palmCore,V(-.88,-.41,-.055),[.43,.66,.36],satin);
  thenar.rotation.z=.28;assemble(thenar,V(-.55,-.3,-.3),.12);
  const thumbSaddle=armorPlate(-1.04,-.32,.29,.38,.64,.46,0,gold);

  // A softly rolled perimeter weld follows the continuous shell.
  const perimeter=palmShape.getPoints(160).map(p=>{
    const z=.16+.22*Math.sqrt(Math.max(.015,1-Math.pow(p.x/1.25,2)))+.035*(1-Math.pow(p.y/1.5,2));
    return V(p.x,p.y,z+.012);
  });
  const welt=tube(palmCore,perimeter,.019,paleGold,true,160);assemble(welt,V(0,-.4,.45),.13);
  // Palmar padding and realistic creases, visible in the model viewer.
  const palmClosure=sphere(palmCore,V(0,-.13,-.285),[.62,.68,.085],satin);
  const palmarPad=sphere(palmCore,V(.48,-.34,-.24),[.49,.76,.13],satin);
  palmarPad.rotation.z=-.18;
  const thumbPad=sphere(palmCore,V(-.70,-.52,-.25),[.46,.65,.145],satin);thumbPad.rotation.z=.32;
  const palmCreases=[
    [V(-.95,.52,-.28),V(-.45,.67,-.36),V(.12,.65,-.37),V(.84,.47,-.30)],
    [V(-.87,.29,-.30),V(-.41,.36,-.36),V(.19,.28,-.37),V(.84,.07,-.29)],
    [V(-.53,.26,-.38),V(-.45,-.07,-.42),V(-.43,-.48,-.42),V(-.67,-.88,-.33)],
    [V(-.27,-.20,-.36),V(.15,-.33,-.40),V(.53,-.61,-.38),V(.63,-.88,-.29)]
  ];
  palmCreases.forEach(p=>tube(palmCore,p,.009,etched,false,64));
  // Recessed channels are laid against the curved surface, not strung in the air.
  const etchingMaterial=etched;
  for(const side of [-1,1]) {
    for(let k=0;k<2;k++){
      tube(palmCore,[V(side*(.86+k*.04),-.79,.30),V(side*(.98+k*.025),-.35,.32),V(side*(1.00+k*.025),.12,.31)],.007,etched,false,48);
    }
  }
  // Static precision fasteners are instanced: rich detail without a draw call per rivet.
  function fasteners(parent,points,r=.025,mat=paleGold) {
    const im=new THREE.InstancedMesh(sphereGeo,mat,points.length);im.frustumCulled=false;
    points.forEach((p,i)=>{dummy.position.copy(p);dummy.rotation.set(0,0,0);dummy.scale.set(r,r,r*.46);dummy.updateMatrix();im.setMatrixAt(i,dummy.matrix);});
    im.instanceMatrix.needsUpdate=true;parent.add(im);return im;
  }
  const palmBolts=[];
  for(const side of [-1,1])for(let k=0;k<7;k++){
    const y=-.98+k*.28,x=side*(.70+.30*Math.sin((y+1.10)/2.3*PI));
    const z=.18+.22*Math.sqrt(Math.max(.015,1-Math.pow(x/1.25,2)))+.035*(1-Math.pow(y/1.5,2));
    palmBolts.push(V(x,y,z+.024));
  }
  fasteners(palmCore,palmBolts,.022);

  // A proper flared, hollow bracer fits continuously around the wrist.
  const cuffProfile=new THREE.SplineCurve([
    new THREE.Vector2(.61,0),new THREE.Vector2(.64,-.12),new THREE.Vector2(.67,-.29),
    new THREE.Vector2(.76,-.72),new THREE.Vector2(.85,-1.07),new THREE.Vector2(.84,-1.18),
    new THREE.Vector2(.76,-1.22),new THREE.Vector2(.73,-1.13),new THREE.Vector2(.69,-.76),
    new THREE.Vector2(.56,-.22),new THREE.Vector2(.54,-.04),new THREE.Vector2(.61,0)
  ]);
  const cuff=mesh(G(new THREE.LatheGeometry(cuffProfile.getPoints(lowPower?24:80).reverse(),lowPower?32:96)),satin,wristAssembly,V(0,-1.17,0));
  cuff.scale.set(1.10,1.34,.74);cuff.name='Hollow flared bracer';assemble(cuff,V(0,-.75,-.20),.05);
  const liner=mesh(G(new THREE.CylinderGeometry(.555,.745,1.13,lowPower?24:64,lowPower?2:8,true)),jointLiner,wristAssembly,V(0,-1.97,0));
  liner.scale.set(1.08,1.34,.74);assemble(liner,V(0,-.7,-.2),.05);
  // Thin interrupted machined rims retain the floating-collar motif.
  for(const [radius,y] of [[.70,-1.27],[.94,-2.76]]){
    for(let k=0;k<3;k++){
      const band=torus(wristAssembly,radius,.027,paleGold,V(0,y,0),TAU/3-.055);
      band.rotation.set(PI/2,0,k*TAU/3+.028);band.scale.set(1,.70,1);
      assemble(band,V(0,-.45,.15),.10);
    }
  }
  for(const y of [-1.52,-2.48]){
    const seam=torus(wristAssembly,y<-2?.91:.74,.010,etched,V(0,y,0));seam.rotation.x=PI/2;seam.scale.y=.70;
  }
  const bracerShield=mesh(extrudeShape(plateShape(1.18,1.23,.12),.05,.035),gold,wristAssembly,V(0,-2.04,.56));
  bracerShield.rotation.x=-.12;
  nestedArmor(bracerShield,1.18,1.23,(w,h)=>plateShape(w,h,.12),.050,false);
  assemble(bracerShield,V(0,-.6,.45),.18);
  // Recessed horn-scroll engraving is part of the normalized inlay atlas.
  const bracerBolts=[];
  for(const side of [-1,1])for(let j=0;j<4;j++)bracerBolts.push(V(side*(.44+j*.032),-1.64-j*.24,.64+j*.008));
  fasteners(wristAssembly,bracerBolts,.026);
  for(const side of [-1,1]){
    const boss=sphere(wristAssembly,V(side*.78,-2.05,.05),[.12,.15,.13],gold);
    const small=torus(wristAssembly,.07,.015,etched,V(side*.88,-2.05,.05));small.rotation.y=PI/2;
  }


  const cuffDecoration=decoration(wristAssembly,'Layered fluted forearm guards');
  for(const side of [-1,1]){
    const panel=mesh(extrudeShape(plateShape(.40,1.26,.08),.034,.025),carvedSatin,cuffDecoration,V(side*.64,-2.10,.43));
    panel.rotation.set(-.11,side*.50,side*.065);
    const trace=plateShape(.36,1.20,.08).getPoints(96).map(p=>V(p.x,p.y,.045));
    tube(panel,trace,.009,polish,true,96);
    for(let k=0;k<3;k++){
      const x=side*(.52+k*.10);
      tube(cuffDecoration,[V(x*.85,-1.42,.38-k*.045),V(x,-1.96,.48-k*.06),V(x*1.18,-2.67,.54-k*.07)],.017,k===1?polish:antique,false,64);
    }
  }
  // Layered wrist collar with a real dark seam and polished bearing edges.
  for(let k=0;k<8;k++){
    const a=k/8*TAU;
    const p=sphere(cuffDecoration,V(Math.sin(a)*.67,-1.24,Math.cos(a)*.46),[.13,.10,.055],antique);
    p.rotation.y=a;
  }
  const fingers=[];

  function profiledFingerGeometry(r,length,taper=.14) {
    // Dense rounded-rectangle sections: flatter armored backs and full finger sides.
    const N=lowPower?16:48,R=lowPower?12:36,positions=[],uv=[],idx=[];
    for(let j=0;j<=R;j++){
      const u=j/R,y=(u-.5)*length;
      const cap=.19;
      let radius=1;
      if(u<cap)radius=Math.sqrt(Math.max(.00001,1-Math.pow((u-cap)/cap,2)));
      if(u>1-cap)radius=Math.sqrt(Math.max(.00001,1-Math.pow((u-(1-cap))/cap,2)));
      radius*=1-taper*u;
      for(let k=0;k<=N;k++){
        const th=k/N*TAU,cs=Math.cos(th),sn=Math.sin(th);
        const x=Math.sign(cs)*Math.pow(Math.abs(cs),.94)*r*radius;
        const z=Math.sign(sn)*Math.pow(Math.abs(sn),.94)*r*.79*radius;
        positions.push(x,y,z);uv.push(k/N,u);
      }
    }
    for(let j=0;j<R;j++)for(let k=0;k<N;k++){
      const a=j*(N+1)+k,b=a+1,c=a+N+1,d=c+1;
      idx.push(a,c,b,b,c,d);
    }
    const g=G(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);
    g.translate(0,length/2,0);g.computeVertexNormals();return g;
  }
  function fingerArmorShape(w,h) {
    const s=new THREE.Shape();
    s.moveTo(-w*.29,-h*.5);
    s.bezierCurveTo(-w*.48,-h*.49,-w*.51,-h*.24,-w*.48,h*.12);
    s.bezierCurveTo(-w*.45,h*.40,-w*.25,h*.51,0,h*.51);
    s.bezierCurveTo(w*.25,h*.51,w*.45,h*.40,w*.48,h*.12);
    s.bezierCurveTo(w*.51,-h*.24,w*.48,-h*.49,w*.29,-h*.5);
    s.quadraticCurveTo(0,-h*.55,-w*.29,-h*.5);return s;
  }
  function makeFinger(name,x,y,lengths,width,splay=0,thumb=false) {
    const anchor=group(palmCore,name),reactiveMat=M(gold.clone());
    anchor.position.set(x,y,-.025);anchor.rotation.z=splay;
    assemble(anchor,V(thumb?-.75:x*.4,.80,.20),.18+fingers.length*.04);
    const basis=group(anchor,name+' · inward joint basis');basis.rotation.y=PI;
    let parent=basis;const joints=[];
    lengths.forEach((length,j)=>{
      const pivot=group(parent,name+'.'+['proximal','middle','distal'][j]);
      if(j>0)pivot.position.y=lengths[j-1]*.90;
      const r=width*(1-j*.085);
      // Liner and reinforced gold sleeve overlap, leaving only a fine flexible crease.
      const underGeo=G(new THREE.CapsuleGeometry(r*.94,Math.max(.025,length-r*1.88),lowPower?4:16,lowPower?12:32));
      underGeo.translate(0,length/2,0);
      const under=mesh(underGeo,jointLiner,pivot);under.scale.z=.83;
      const shell=mesh(profiledFingerGeometry(r,length),reactiveMat,pivot);
      shell.name=name+' · enclosing armored phalanx '+j;
      // Rounded, broad dorsal plate instead of an oval jewel on every bone.
      const armor=mesh(extrudeShape(fingerArmorShape(r*1.76,length*(j===2?.82:.74)),.021,.018),satin,pivot,V(0,length*.53,-r*.77));
      armor.rotation.y=PI;
      nestedArmor(armor,r*1.76,length*(j===2?.82:.74),fingerArmorShape,.018,true);
      const jointDetail=decoration(pivot,'Articulated lateral bearings');
      for(const side of [-1,1]){
        const cap=mesh(G(new THREE.CylinderGeometry(r*.25,r*.29,r*.16,lowPower?12:36,lowPower?1:8)),antique,jointDetail,V(side*r*.94,.055,0));
        cap.rotation.z=PI/2;
        const bearing=torus(jointDetail,r*.21,.009,polish,V(side*r*1.025,.055,0));bearing.rotation.y=PI/2;
        sphere(jointDetail,V(side*r*1.035,.055,0),[.008,r*.08,r*.08],dark);
      }
      if(j===0){
        sphere(jointDetail,V(0,.055,-r*.18),[r*.99,r*.52,r*.75],satin);
        for(const side of [-1,1])tube(jointDetail,[V(side*r*.83,.04,-r*.60),V(side*r*.88,.13,-r*.70),V(side*r*.65,.23,-r*.75)],.010,polish,false,32);
      }
      // Bilateral seams, a machined crest and recessed transverse articulation lines.
      for(const side of [-1,1]){
        tube(pivot,[V(side*r*.77,length*.20,-r*.63),V(side*r*.84,length*.50,-r*.63),V(side*r*.66,length*.80,-r*.60)],.007,etched,false,32);
      }
      for(let k=0;k<1;k++){
        const py=length*(.23+k*.12);
        tube(pivot,[V(-r*.58,py,-r*.77-.043),V(0,py+.008,-r*.77-.067),V(r*.58,py,-r*.77-.043)],.006,etched,false,24);
      }
      // Gold flexure around the actual joint, with dark gasket lines in its depth.
      const flex=sphere(pivot,V(0,.035,.005),[r*.94,r*.31,r*.79],innerGold);
      for(const py of [.025,.065]){
        const line=torus(pivot,r*.92,.009,jointLiner,V(0,py,0));line.rotation.x=PI/2;line.scale.y=.80;
      }
      // A protective pad and three creases on the inside of each finger.
      sphere(pivot,V(0,length*.53,r*.61),[r*.77,length*.31,r*.23],innerGold);
      for(let k=0;k<2;k++){
        const py=length*(.28+k*.28);
        tube(pivot,[V(-r*.65,py,r*.72),V(0,py-.018,r*.88),V(r*.65,py,r*.72)],.006,etched,false,24);
      }
      fasteners(pivot,[V(-r*.57,length*.77,-r*.77-.046),V(r*.57,length*.77,-r*.77-.046)],.013);
      assemble(shell,V((j%2?.12:-.12),.28,.30),.20+j*.09);
      assemble(armor,V(0,.20,-.42),.26+j*.08);
      joints.push(pivot);parent=pivot;
    });
    fingers.push({anchor,basis,joints,thumb,lengths,splay,reactiveMat});
    return fingers[fingers.length-1];
  }
  makeFinger('thumb',-.92,-.43,[.51,.45,.35],.245,.89,true);
  makeFinger('index',-.79,.85,[.74,.49,.36],.239,.045);
  makeFinger('middle',-.265,1.00,[.81,.55,.39],.250,.008);
  makeFinger('ring',.295,.95,[.76,.51,.37],.240,-.025);
  makeFinger('little',.80,.76,[.62,.43,.32],.211,-.085);

  const sockets=[V(-1.075,-.08,.57),V(-.79,.86,.60),V(-.265,1.01,.62),V(.295,.96,.61),V(.80,.77,.55),V(0,-.19,.65)];
  const gemRadii=[.185,.185,.202,.188,.169,.302];
  const launch=[V(-1.8,1.5,1.4),V(1.65,1.75,1.4),V(-1.65,1.25,1.55),V(1.65,.70,1.5),V(-1.65,.10,1.6),V(.1,1.75,1.7)];
  const socketGroups=[],socketMats=[],gems=[],veins=[];
  function jewelGeometry(r,index=0) {
    // Polished cut pavilion / crown. Facets are reserved for gemstones only.
    const n=[10,8,8,6,10,16][index],vertices=[];
    const rings=[{z:-r*.65,r:0},{z:-r*.12,r:r},{z:r*.43,r:r*.86},{z:r*.91,r:r*.39}];
    const vert=(ring,i)=>[Math.cos(TAU*i/n)*ring.r,Math.sin(TAU*i/n)*ring.r,ring.z];
    for(let k=0;k<rings.length-1;k++) for(let i=0;i<n;i++) {
      const a=vert(rings[k],i),b=vert(rings[k],i+1),c=vert(rings[k+1],i),d=vert(rings[k+1],i+1);
      vertices.push(...a,...b,...d,...a,...d,...c);
    }
    for(let i=0;i<n;i++)vertices.push(0,0,r*.91,...vert(rings[3],i),...vert(rings[3],i+1));
    const g=G(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();return g;
  }
  function cast(r,mat) {
    const points=[
      new THREE.Vector2(r*.78,-.085),new THREE.Vector2(r*1.13,-.08),
      new THREE.Vector2(r*1.28,-.035),new THREE.Vector2(r*1.29,.025),
      new THREE.Vector2(r*1.15,.08),new THREE.Vector2(r*.95,.085),new THREE.Vector2(r*.90,.04),
      new THREE.Vector2(r*.78,-.085)
    ];
    const spline=new THREE.SplineCurve(points);
    const o=mesh(G(new THREE.LatheGeometry(spline.getPoints(lowPower?20:64),lowPower?24:64)),mat);o.rotation.x=PI/2;return o;
  }
  // UV-driven charging. vUv.x follows the path from each knuckle toward center.
  const channelVertex=[
    'varying vec2 vUv;','void main(){vUv=uv;',
    'gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'
  ].join('\n');
  const channelFragment=[
    'uniform float uChargeProgress;uniform float uWaveProgress;uniform float uPower;uniform vec3 uColor;varying vec2 vUv;',
    'void main(){float fill=smoothstep(vUv.x-.035,vUv.x+.035,uChargeProgress);',
    'float front=exp(-pow((vUv.x-uChargeProgress)*15.,2.))+exp(-pow((vUv.x-uWaveProgress)*16.,2.));',
    'vec3 gold=vec3(.50,.29,.065);',
    'vec3 col=mix(gold,uColor,fill*.87)+uColor*front*.40;',
    'gl_FragColor=vec4(col*(.55+uPower*.75),.86);}'
  ].join('\n');
  sockets.forEach((pos,i)=>{
    const r=gemRadii[i],sg=group(palmCore,'Dorsal socket '+(i+1));sg.position.copy(pos);
    const sm=M(gold.clone());socketMats.push(sm);const bezel=cast(r,sm);sg.add(bezel);
    const lip=torus(sg,r*1.12,.015,polish,V(0,0,.08));
    bezelRelief(sg,r,i);
    if(i!==5) {
      const base=sphere(sg,V(0,0,-.04),[r*1.14,r*1.14,.045],dark);
    }
    for(let k=0;k<4;k++) {
      const a=k*PI/2+PI/4;
      sphere(sg,V(Math.cos(a)*r*.95,Math.sin(a)*r*.95,.095),[.026,.026,.057],paleGold);
    }
    socketGroups.push(sg);assemble(sg,V(pos.x*.5,pos.y*.5,.8),.35+i*.04);
    const rig=group(palmCore,'Gem '+(i+1)+' · '+names[i]);
    const shellMat=M(new THREE.MeshPhysicalMaterial({
      color:[0x007d70,0xbf5d73,0x45206f,0x0d3e90,0x950b2b,0x05643e][i],metalness:.10,roughness:.075,clearcoat:1,clearcoatRoughness:.07,
      ior:2.15,thickness:r*1.7,transmission:0,
      transparent:true,opacity:.88,depthWrite:false,side:THREE.DoubleSide,
      emissive:colors[i],emissiveIntensity:.16,envMapIntensity:.80
    }));
    const shell=mesh(jewelGeometry(r,i),shellMat,rig);shell.renderOrder=3;
    const coreMat=M(new THREE.MeshBasicMaterial({color:colors[i],toneMapped:false}));
    const backingMat=M(new THREE.MeshBasicMaterial({color:new THREE.Color(colors[i]).multiplyScalar(.15),toneMapped:false}));
    mesh(G(new THREE.CircleGeometry(r*.91,48)),backingMat,rig,V(0,0,-r*.10));
    const core=sphere(rig,V(0,0,.035),[r*.22,r*.22,r*.30],coreMat);
    const inner=group(rig,'Distinct light physics');
    const halo=glow(rig,colors[i],r*5.3);halo.position.z=.09;
    const resonance=torus(palmCore,r*1.25,.013,glowMaterial(colors[i]),pos.clone().add(V(0,0,.13)));
    const objects={};
    if(i===0) {
      for(let k=0;k<2;k++) {
        const pts=[];for(let j=0;j<=80;j++){const a=j/80*TAU*2+k*PI;pts.push(V(Math.cos(a)*r*.48,Math.sin(a)*r*.48,(j/80-.5)*r*1.1+.03));}
        tube(inner,pts,.008,glowMaterial(k?0x99ffe8:colors[i]),false,80);
      }
      objects.rotor=inner;
    } else if(i===1) {
      const beam=glow(rig,0xff98b4,r*5);beam.scale.set(r*2,r*7.8,1);beam.position.z=.10;
      objects.beam=beam;core.scale.set(r*.24,r*.69,r*.34);
    } else if(i===2) {
      const twin=mesh(G(new THREE.OctahedronGeometry(r*.52)),M(new THREE.MeshBasicMaterial({color:0xd8e5ef,toneMapped:false})),inner,V(0,0,.035));
      objects.twin=twin;objects.phaseMat=coreMat;core.scale.multiplyScalar(.8);
    } else if(i===3) {
      objects.satellites=[];
      for(let k=0;k<3;k++)objects.satellites.push(sphere(inner,V(),[r*.13,r*.13,r*.13],glowMaterial(k===1?0xe1edff:colors[i])));
      torus(inner,r*.55,.005,glowMaterial(0xadcaff),V(0,0,.03));
    } else if(i===4) {
      const paths=[
        [V(-r*.66,r*.40,.11),V(-r*.14,r*.18,.14),V(-r*.24,-r*.12,.14),V(r*.28,-r*.63,.10)],
        [V(-r*.14,r*.18,.14),V(r*.20,r*.35,.13),V(r*.64,r*.12,.10)],
        [V(-r*.24,-r*.12,.14),V(-r*.68,-r*.31,.09)]
      ];
      paths.forEach(p=>tube(inner,p,.006,glowMaterial(0xffc259),false,32));
      objects.scars=inner;
    } else {
      objects.metronome=torus(rig,r*1.16,.012,glowMaterial(0xf2bd59),V(0,0,.12));
      torus(inner,r*.54,.008,glowMaterial(colors[i]),V(0,0,.09));
    }
    gems.push({rig,shell,shellMat,core,coreMat,inner,halo,resonance,objects,pos,r});
    if(i<5) {
      const points=[
        pos.clone().add(V(0,-.10,-.055)),
        V(pos.x*.82,pos.y*.68-.08,.535),
        V(pos.x*.55,pos.y*.32-.17,.545),
        V(pos.x*.28,-.19,.615)
      ];
      tube(palmCore,points,.019,etched);
      const vm=M(new THREE.ShaderMaterial({
        vertexShader:channelVertex,fragmentShader:channelFragment,transparent:true,depthWrite:false,
        uniforms:{uChargeProgress:{value:-.2},uWaveProgress:{value:-.3},uPower:{value:0},uColor:{value:new THREE.Color(colors[i])}}
      }));
      const line=tube(palmCore,points,.009,vm);line.renderOrder=2;
      veins.push(vm);
    }
  });

  // Precise geometric archaeology behind the object. No random lightning.
  const guideRoot=group(scene,'Coordinate arcs');
  const guideM=M(new THREE.LineBasicMaterial({color:0xc5a666,transparent:true,opacity:.20,depthWrite:false}));
  for(let k=0;k<3;k++) {
    const pts=[];for(let j=0;j<=160;j++){const a=j/160*TAU;pts.push(V(Math.cos(a)*(2.0+k*.35),Math.sin(a)*(2.0+k*.35),-1));}
    const o=new THREE.Line(G(new THREE.BufferGeometry().setFromPoints(pts)),guideM);o.rotation.x=.8+k*.25;o.rotation.z=k*.60;guideRoot.add(o);
  }
  const guideTickGeo=G(new THREE.OctahedronGeometry(.022));
  const guideTicks=new THREE.InstancedMesh(guideTickGeo,M(new THREE.MeshBasicMaterial({color:0xb78d47,transparent:true,opacity:.35})),48);
  guideRoot.add(guideTicks);
  for(let i=0;i<48;i++){const a=i/48*TAU;dummy.position.set(Math.cos(a)*2.75,Math.sin(a)*2.75,-.7);dummy.rotation.set(0,0,a);dummy.scale.set(.5,2,.5);dummy.updateMatrix();guideTicks.setMatrixAt(i,dummy.matrix);}
  guideTicks.instanceMatrix.needsUpdate=true;

  // Six miniature, recognizable THREE-dimensional achievement scenes.
  const traces=[];
  function traceRoot(i) {
    const o=group(palmCore,'Achievement memory '+names[i]);o.position.copy(launch[i]);
    const m=glowMaterial(colors[i]);m.opacity=.9;
    traces.push({root:o,material:m,extra:{}});return traces[i];
  }
  {
    const {root,material,extra}=traceRoot(0),coords=[
      [-.14,.85,0],[.04,.53,.02],[-.17,.30,.01],[.16,.04,.06],[-.08,-.20,.02],[.13,-.59,0]
    ],segs=[];
    for(let j=0;j<coords.length-1;j++)segs.push(...coords[j],...coords[j+1]);
    const crack=new THREE.LineSegments(G(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(segs,3))),M(new THREE.LineBasicMaterial({color:0x4affe0,transparent:true,opacity:1,toneMapped:false})));root.add(crack);
    const pts=[];for(let j=0;j<150;j++){const u=j/149,a=u*TAU*4,r=.10+.28*u;pts.push(Math.cos(a)*r,(u-.5)*1.45,Math.sin(a)*r);}
    const pg=G(new THREE.BufferGeometry());pg.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
    const pm=M(new THREE.PointsMaterial({color:colors[0],size:.034,transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
    extra.spiral=new THREE.Points(pg,pm);root.add(extra.spiral);extra.crack=crack;
  }
  {
    const {root,material,extra}=traceRoot(1);
    for(let j=0;j<3;j++) {
      const ring=torus(root,.43-j*.11,.018,material,V(0,-.38+j*.36,0));ring.rotation.x=PI/2;
    }
    tube(root,[V(0,-.85,0),V(0,.97,0)],.022,material);
    for(const side of [-1,1]) tube(root,[V(side*.40,-.40,0),V(side*.25,.20,0),V(0,.92,0)],.012,material);
    const beacon=glow(root,0xff9db4,1.3);beacon.scale.set(.32,2.8,1);extra.beacon=beacon;
  }
  {
    const {root,material,extra}=traceRoot(2);
    const s=new THREE.Shape();s.moveTo(-.37,-.57);s.lineTo(.37,-.57);s.quadraticCurveTo(.42,-.57,.42,-.52);
    s.lineTo(.42,.52);s.quadraticCurveTo(.42,.57,.37,.57);s.lineTo(-.37,.57);s.quadraticCurveTo(-.42,.57,-.42,.52);s.lineTo(-.42,-.52);s.quadraticCurveTo(-.42,-.57,-.37,-.57);
    const cardMat=M(new THREE.MeshPhysicalMaterial({color:0x4d287a,metalness:.65,roughness:.25,emissive:0x603588,emissiveIntensity:.3,side:THREE.DoubleSide}));
    mesh(extrudeShape(s,.032,.016),cardMat,root);
    const outline=s.getPoints(100).map(p=>V(p.x,p.y,.045));tube(root,outline,.012,paleGold,true,128);
    const oval=[];for(let j=0;j<=64;j++){const a=j/64*TAU;oval.push(V(Math.cos(a)*.17,Math.sin(a)*.28,.073));}
    tube(root,oval,.025,glowMaterial(0xc4bbff),true);
    for(const y of [-.43,.43])tube(root,[V(-.25,y,.06),V(.25,y,.06)],.007,paleGold);
    extra.card=true;
  }
  {
    const {root,material,extra}=traceRoot(3);
    const pages=group(root,'Open book');
    for(const side of [-1,1]) {
      const pos=[],uv=[],indices=[],n=24;
      for(let y=0;y<=n;y++)for(let x=0;x<=n;x++){
        const u=x/n,v=y/n;
        pos.push(side*u*.54,(v-.5)*.80,.12*Math.sin(u*PI)+.16*u);
        uv.push(u,v);
        if(x<n&&y<n){const a=y*(n+1)+x;indices.push(a,a+1,a+n+1,a+1,a+n+2,a+n+1);}
      }
      const geo=G(new THREE.BufferGeometry());geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
      mesh(geo,M(new THREE.MeshPhysicalMaterial({color:0xb5d5ff,metalness:.25,roughness:.28,side:THREE.DoubleSide,transparent:true,opacity:.68,emissive:0x4368c0,emissiveIntensity:.5})),pages);
      tube(pages,[V(0,-.40,.02),V(side*.27,-.40,.17),V(side*.54,-.40,.16),V(side*.54,.40,.16),V(side*.27,.40,.17),V(0,.40,.02)],.010,material);
    }
    for(let k=0;k<3;k++) {
      const a=k*TAU/3+.4;
      tube(root,[V(Math.cos(a)*.95,Math.sin(a)*.85,.05),V(Math.cos(a+.5)*.56,Math.sin(a+.5)*.50,.30),V(.08*Math.cos(k*2),.04*Math.sin(k*2),.25)],.015,glowMaterial([0x749fff,0xb2d7ff,0x5184e8][k]));
    }
    extra.pages=pages;
  }
  {
    const {root,material,extra}=traceRoot(4);
    const s=new THREE.Shape();s.moveTo(0,-.51);
    s.bezierCurveTo(-.18,-.30,-.58,-.04,-.48,.29);
    s.bezierCurveTo(-.38,.64,-.06,.56,0,.34);
    s.bezierCurveTo(.06,.56,.38,.64,.48,.29);s.bezierCurveTo(.58,-.04,.18,-.30,0,-.51);
    const h=mesh(extrudeShape(s,.16,.06),M(new THREE.MeshPhysicalMaterial({color:0xd51b42,metalness:.32,roughness:.19,clearcoat:1,emissive:0x9b062a,emissiveIntensity:.5})),root);
    const scars=[
      [V(-.35,.32,.16),V(-.10,.18,.18),V(-.14,-.05,.19),V(.04,-.35,.16)],
      [V(-.10,.18,.18),V(.17,.28,.17),V(.34,.14,.16)],
      [V(-.14,-.05,.19),V(-.35,-.11,.16)]
    ];
    extra.scars=group(root);scars.forEach(p=>tube(extra.scars,p,.012,glowMaterial(0xffcb62)));
    extra.heart=h;
  }
  {
    const {root,material,extra}=traceRoot(5);
    const ticks=new THREE.InstancedMesh(G(new THREE.OctahedronGeometry(.028)),material,100);
    ticks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);ticks.frustumCulled=false;root.add(ticks);extra.ticks=ticks;
    extra.inner=torus(root,.59,.010,glowMaterial(0xf1bc60));
    extra.outer=torus(root,.77,.008,material);
  }

  // EXACTLY 264 volumetric crystalline segments: left 126, slash 12, right 126.
  const limitRoot=group(scene,'Volumetric score · 264 crystals');
  const segmentGeo=G(new THREE.BoxGeometry(.046,.047,.075));
  const segmentMat=M(new THREE.MeshPhysicalMaterial({
    color:0xffcf77,metalness:.35,roughness:.23,clearcoat:.5,
    emissive:0xb67a2d,emissiveIntensity:.55,transparent:true,opacity:1
  }));
  const segmentPositions=[],rightIndices=[],leftIndices=[];
  function digitPoints(digit,ox) {
    const result=[],w=.34,h=.67;
    const addLine=(x0,y0,x1,y1,n)=>{
      for(let i=0;i<n;i++){const u=(i+.5)/n;result.push(V(ox+mix(x0,x1,u),mix(y0,y1,u),0));}
    };
    if(digit==='0') {addLine(0,h/2,w,h/2,7);addLine(0,-h/2,w,-h/2,7);addLine(0,0,0,h/2,6);addLine(w,0,w,h/2,6);addLine(0,-h/2,0,0,6);addLine(w,-h/2,w,0,6);}
    else {addLine(w*.67,0,w*.67,h/2,6);addLine(w*.67,-h/2,w*.67,0,6);}
    return result;
  }
  const letterSpacing=.51;
  for(let side=0;side<2;side++) {
    const origin=side===0?-2.25:.38;
    '1000'.split('').forEach((c,k)=>{
      digitPoints(c,origin+k*letterSpacing).forEach(p=>{
        const index=segmentPositions.length;segmentPositions.push(p);
        (side?rightIndices:leftIndices).push(index);
      });
    });
    if(side===0)for(let i=0;i<12;i++){
      const u=(i+.5)/12;leftIndices.push(segmentPositions.length);segmentPositions.push(V(mix(-.11,.11,u),mix(-.34,.34,u),0));
    }
  }
  const limitMesh=new THREE.InstancedMesh(segmentGeo,segmentMat,segmentPositions.length);
  limitMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);limitMesh.frustumCulled=false;limitRoot.add(limitMesh);
  segmentPositions.forEach((p,i)=>limitMesh.setColorAt(i,new THREE.Color(i<138?0xffdf9d:colors[i%6])));
  limitMesh.instanceColor.needsUpdate=true;
  const rightLookup=new Map();rightIndices.forEach((idx,k)=>rightLookup.set(idx,k));
  const bernoulli=(theta,a=1) => {
    const s=Math.sin(theta),c=Math.cos(theta),den=1+s*s;
    return V(a*c/den,a*s*c/den,0);
  };
  const infinityRoot=group(scene,'Six braided Bernoulli trajectories');
  const infinityMats=[];
  for(let k=0;k<6;k++){
    const pts=[];
    for(let j=0;j<=200;j++){
      const th=j/200*TAU,p=bernoulli(th,.86+k*.042);
      const braid=th*6+k*TAU/6;
      p.z=Math.cos(braid)*.045;p.y+=Math.sin(braid)*.023;pts.push(p);
    }
    const material=glowMaterial(colors[k]);material.blending=THREE.NormalBlending;infinityMats.push(material);
    tube(infinityRoot,pts,.011,material,true,200);
  }

  // Expanding precision wave: Fresnel edge, max alpha .26, no opaque veil.
  const waveRoot=group(scene,'Spherical rule-change wave');
  const waveM=glowMaterial(0xd7b878);
  const waveRings=[];
  for(let k=0;k<5;k++){
    const o=torus(waveRoot,1,.006,waveM);o.rotation.set(k*.47,k*.59,k*.23);waveRings.push(o);
  }
  const waveShader=M(new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,
    blending:THREE.NormalBlending,
    uniforms:{
      uOpacity:{value:0},uTime:{value:0},uHasSource:{value:0},
      uBackdrop:{value:glowTexture},
      uBgScale:{value:new THREE.Vector2(1,1)},uBgOffset:{value:new THREE.Vector2(0,0)}
    },
    vertexShader:[
      'varying vec3 vNormal;varying vec3 vView;varying vec2 vUv;varying vec4 vClip;',
      'void main(){vec4 p=modelViewMatrix*vec4(position,1.);',
      'vNormal=normalize(normalMatrix*normal);vView=normalize(-p.xyz);vUv=uv;',
      'gl_Position=projectionMatrix*p;vClip=gl_Position;}'
    ].join('\n'),
    fragmentShader:[
      'uniform float uOpacity;uniform float uTime;uniform float uHasSource;uniform sampler2D uBackdrop;',
      'uniform vec2 uBgScale;uniform vec2 uBgOffset;',
      'varying vec3 vNormal;varying vec3 vView;varying vec2 vUv;varying vec4 vClip;',
      'void main(){float fres=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),2.3);',
      'float band=sin(vUv.x*6.283+uTime)*.5+.5;',
      'vec3 edge=vec3(.20+.25*band,.49,.59-.20*band);',
      'vec2 screenUV=vClip.xy/vClip.w*.5+.5;vec2 uv=screenUV*uBgScale+uBgOffset;',
      'vec2 shift=normalize(vNormal).xy*(.009+.011*fres);',
      'vec3 sampled=vec3(texture2D(uBackdrop,uv+shift*1.15).r,texture2D(uBackdrop,uv+shift).g,texture2D(uBackdrop,uv+shift*.85).b);',
      'vec3 refracted=mix(edge,sampled+edge*.10,uHasSource);',
      'gl_FragColor=vec4(refracted,min(.26,uOpacity*(.10+.90*fres)));}'
    ].join('\n')
  }));
  const lens=mesh(G(new THREE.TorusGeometry(1,.05,lowPower?8:32,lowPower?48:128)),waveShader,waveRoot);
  lens.rotation.x=.22;
  // A transparent WebGL canvas cannot sample arbitrary DOM pixels. A host may
  // supply its live game/map texture for actual chromatic refraction. The demo
  // does this with its procedural map canvas. Texture ownership stays with host.
  function setRefractionSource(texture,scaleX=1,scaleY=1,offsetX=0,offsetY=0) {
    waveShader.uniforms.uBackdrop.value=texture||glowTexture;
    waveShader.uniforms.uHasSource.value=texture?1:0;
    waveShader.uniforms.uBgScale.value.set(scaleX,scaleY);
    waveShader.uniforms.uBgOffset.value.set(offsetX,offsetY);
  }

  // Crisp caption rendered inside THREE, not HTML text masquerading as 3D.
  const captionCanvas=document.createElement('canvas'),captionScale=lowPower?.5:1;captionCanvas.width=2400*captionScale;captionCanvas.height=520*captionScale;
  const cx=captionCanvas.getContext('2d');
  function drawCaption() {
    cx.setTransform(captionScale,0,0,captionScale,0,0);
    cx.clearRect(0,0,2400,520);
    const panel=cx.createRadialGradient(1200,240,80,1200,240,1200);
    panel.addColorStop(0,'rgba(11,18,25,.52)');panel.addColorStop(.6,'rgba(11,18,25,.34)');panel.addColorStop(1,'rgba(11,18,25,0)');
    cx.fillStyle=panel;cx.fillRect(0,0,2400,520);
    cx.textAlign='center';cx.textBaseline='middle';
    cx.font='500 29px system-ui, sans-serif';cx.letterSpacing='8px';cx.fillStyle='#ccad77';
    cx.fillText('ГЛАВНЫЙ СЕКРЕТНЫЙ ПЕРК',1200,92);cx.letterSpacing='0px';
    cx.shadowColor='rgba(238,190,93,.25)';cx.shadowBlur=20;
    cx.font='600 118px Georgia, serif';cx.fillStyle='#ffe9b3';cx.fillText(caption.title,1200,230);
    cx.shadowBlur=0;cx.font='400 72px system-ui, sans-serif';cx.fillStyle='#d6dce0';cx.fillText(caption.subtitle,1200,353);
    const grad=cx.createLinearGradient(480,0,1920,0);
    grad.addColorStop(0,'rgba(236,195,112,0)');grad.addColorStop(.5,'rgba(236,195,112,.75)');grad.addColorStop(1,'rgba(236,195,112,0)');
    cx.fillStyle=grad;cx.fillRect(480,422,1440,2);
  }
  drawCaption();
  const captionTexture=T(new THREE.CanvasTexture(captionCanvas));
  captionTexture.colorSpace=THREE.SRGBColorSpace;captionTexture.anisotropy=4;
  const captionMat=M(new THREE.MeshBasicMaterial({map:captionTexture,transparent:true,opacity:0,depthWrite:false,toneMapped:false}));
  const captionPlane=mesh(G(new THREE.PlaneGeometry(6.35,6.35*520/2400)),captionMat,scene,V(0,-3.42,1.0));
  captionPlane.renderOrder=12;

  // A restrained line that visually links the six memories at 5.5 seconds.
  const memoryOrbit=group(palmCore,'Sixfold convergence');
  const convergenceMats=[],convergences=[];
  for(let k=0;k<6;k++){
    const p=sockets[k],pts=[p.clone().add(V(0,0,.20)),V(p.x*.58,p.y*.54,.97),V(0,.05,1.0)];
    const mat=glowMaterial(colors[k]);mat.opacity=0;
    convergences.push(tube(memoryOrbit,pts,.009,mat));convergenceMats.push(mat);
  }

  function resize(width,height) {
    viewW=Math.max(1,width);viewH=Math.max(1,height);
    const aspect=viewW/viewH;
    camera.aspect=aspect;camera.fov=aspect<.75?38:35;
    const tan=Math.tan(camera.fov*PI/360);
    // Art-directed safe box: height 8.4, width 6.55 plus projection-depth margin.
    fitDistance=Math.max(9.35/(2*tan),6.55/(2*tan*aspect))+1.25;
    camera.near=.1;camera.far=Math.max(80,fitDistance*3);
    camera.updateProjectionMatrix();
    if(!disposed)update(lastTime,0);
  }
  function setPointer(x,y) {
    // Smooth bounded angular response; no time-integrated springs.
    pointerX=Math.sin(clamp(Number(x)||0,-1,1)*PI/2);
    pointerY=Math.sin(clamp(Number(y)||0,-1,1)*PI/2);
  }
  function getCaptionState(timeSeconds) {
    const t=Number.isFinite(timeSeconds)?clamp(timeSeconds,0,11):0;
    return {...caption,visible:t*1000>=CAPTION_AT_MS,progress:smooth(8.5,8.85,t)};
  }
  function update(timeSeconds,deltaSeconds=0) {
    if(disposed)return;
    const t=Number.isFinite(timeSeconds)?clamp(timeSeconds,0,11):0;lastTime=t;
    const frozen=t>=6.65&&t<7;
    const motionT=frozen?6.65:t;
    const peak=t<7?0:Math.exp(-Math.pow((t-7.08)/.15,2));
    const assembled=smooth(0,1.43,t);
    const outro=smooth(8.5,10.6,t);
    const fadeAux=1-smooth(9.85,10.95,t);
    const restCurl=.10;
    const close=smooth(7,7.17,t)*(1-smooth(8.5,9.7,t));
    const open=smooth(5.5,6.15,t);
    const curl=restCurl*(1-open)+close*(reducedMotion?.72:1.32);
    handRoot.visible=t>0.025;
    handRoot.position.set(0,-.10+.055*Math.sin(motionT*.75)*assembled,0);
    const openingAngle=reducedMotion?-.08:mix(.42,-.19,smooth(.1,5.7,motionT));
    handRoot.rotation.set(.075,openingAngle+outro*.035,-.018);
    handRoot.scale.setScalar(mix(.94,1,assembled));
    assembly.forEach(a=>{
      const u=reducedMotion?smooth(0,.7,t):out((t-a.delay)/1.1);
      a.o.position.copy(a.base).addScaledVector(a.vector,(1-u)*(reducedMotion?.10:1));
    });
    fingers.forEach((f,k)=>{
      const seat=ends[k]-.055;
      const charged=smooth(seat,seat+.35,motionT);
      f.reactiveMat.emissive.set(0x3d2604).lerp(new THREE.Color(colors[k]),charged*.18);
      f.reactiveMat.emissiveIntensity=.35+peak*.32;
      const recoil=(reducedMotion||Math.abs(motionT-seat)>.30)?0:Math.exp(-Math.pow((motionT-seat)/.075,2))*.085;
      f.joints.forEach((p,j)=>{
        // Every rotation.x >= 0; rotated joint basis directs motion into -Z.
        p.rotation.x=Math.max(0,curl*(j===0?.82:j===1?1.02:.74)+recoil*(j===0?1:.25)+smooth(9.2,10.5,t)*.055*(k===4?1.35:1));
        p.rotation.z=(j===0&&f.thumb)?close*.13:0;
      });
    });
    shields.forEach((shield,j)=>{
      const k=shieldGem[j],charged=smooth(ends[k],ends[k]+.4,motionT);
      shield.material.emissive.set(0x3d2604).lerp(new THREE.Color(colors[k]),charged*.13);
      shield.material.emissiveIntensity=.35+peak*.28;
    });
    gems.forEach((g,i)=>{
      const p=clamp((t-starts[i])/(ends[i]-starts[i]));
      const landed=smooth(ends[i]-.09,ends[i]+.05,t);
      const flight=smooth(starts[i]+.26,ends[i]-.055,t);
      g.rig.visible=t>=starts[i]+.18;
      if(reducedMotion)g.rig.position.copy(g.pos);
      else {
        g.rig.position.lerpVectors(launch[i],g.pos,flight);
        const arch=Math.sin(flight*PI);
        g.rig.position.y+=arch*.38;g.rig.position.z+=arch*.35;
      }
      const appearance=smooth(starts[i]+.18,starts[i]+.32,t);
      const overshoot=1+Math.exp(-Math.pow((t-(ends[i]-.025))/.065,2))*.13;
      g.rig.scale.setScalar(Math.max(.001,appearance*(reducedMotion?1:overshoot)));
      g.rig.rotation.set((1-flight)*.8,(1-flight)*1.3,(!landed&&!reducedMotion)?motionT*1.6:0);
      let rhythm=1;
      if(i===0) {
        rhythm=.82+.18*Math.sin(motionT*15);
        g.inner.rotation.set(reducedMotion?0:motionT*3.1,reducedMotion?0:motionT*1.6,reducedMotion?0:motionT*10);
      } else if(i===1) {
        rhythm=.88+.12*Math.sin(motionT*4.1);
        g.objects.beam.material.opacity=(.35+.20*rhythm)*appearance*(1+.7*peak);
        g.objects.beam.scale.set(g.r*2.1,g.r*(7.2+rhythm),1);
        g.inner.rotation.set(0,0,0);
      } else if(i===2) {
        const phase=.5+.5*Math.sin(motionT*3.9);
        colorTemp.set(colors[i]).lerp(new THREE.Color(0xc3d6e1),phase*.8);
        g.coreMat.color.copy(colorTemp);g.shellMat.emissive.copy(colorTemp);
        g.objects.twin.rotation.set(reducedMotion?0:motionT*.8,reducedMotion?0:motionT*2.4,PI/4);
        rhythm=.83+.17*Math.cos(motionT*3.9);
      } else if(i===3) {
        g.objects.satellites.forEach((o,k)=>{
          const a=(reducedMotion?0:motionT*4.2)+k*TAU/3;
          o.position.set(Math.cos(a)*g.r*.51,Math.sin(a)*g.r*.51,.06+Math.sin(a*2)*g.r*.15);
        });
        g.inner.rotation.set(0,0,0);rhythm=.9+.1*Math.sin(motionT*6);
      } else if(i===4) {
        const q=(motionT*1.08)%1;
        rhythm=.68+.32*(Math.exp(-Math.pow((q-.12)/.045,2))+.62*Math.exp(-Math.pow((q-.29)/.055,2)));
        g.inner.rotation.set(0,0,0);
      } else {
        const steps=[.72,.86,1,.80];rhythm=steps[Math.floor(motionT*4)%4];
        g.objects.metronome.rotation.z=Math.floor(motionT*4)*PI/24;
        g.objects.metronome.material.opacity=.55+.35*rhythm;
        g.inner.rotation.set(0,0,0);
      }
      const lit=appearance*(.58+.40*rhythm+peak*1.1);
      g.shellMat.emissiveIntensity=lit*.24+peak*.40;
      g.halo.material.opacity=clamp(.085*lit+peak*.36,0,.86);
      const haloSize=g.r*(5.0+peak*2.6+(rhythm-.8)*1.3);g.halo.scale.set(haloSize,haloSize,1);
      g.core.scale.set(g.r*(i===1?.15:.22),g.r*(i===1?.52:.22),g.r*.30);
      g.core.scale.multiplyScalar(1+(rhythm-.8)*.22+peak*.15);
      g.coreMat.color.set(i===2?colorTemp:colors[i]);
      const ringAge=t-(ends[i]-.055),ringP=clamp(ringAge/.46);
      g.resonance.visible=ringAge>=0&&ringAge<.46;
      g.resonance.scale.setScalar(1+out(ringP)*1.5);
      g.resonance.material.opacity=(1-ringP)*.55;
      const sm=socketMats[i];
      sm.emissive.set(0x3d2604).lerp(new THREE.Color(colors[i]),landed*.36);
      sm.emissiveIntensity=.35+landed*.12+peak*.45;
      if(i<5) {
        const v=veins[i];
        const charge=clamp((motionT-(ends[i]-.055))/.40,-.2,1.1);
        const secondWave=smooth(5.5,6.25,motionT);
        v.uniforms.uChargeProgress.value=charge;
        v.uniforms.uWaveProgress.value=clamp((motionT-5.55)/.62,-.3,1.3);
        v.uniforms.uPower.value=(.25+.20*rhythm)*landed+secondWave*.35+peak*.8;
      }
    });
    traces.forEach((o,i)=>{
      const duration=ends[i]-starts[i],p=clamp((t-starts[i])/duration);
      const show=t>=starts[i]&&t<ends[i]-.045;
      o.root.visible=show;
      const rise=out(p/.23),collapse=1-smooth(.49,.92,p);
      const scale=Math.max(.001,rise*(.28+.72*collapse));
      o.root.position.copy(launch[i]);
      o.root.scale.setScalar(reducedMotion?.50:scale*.92);
      o.root.rotation.set(.08,Math.sin(p*PI)*.28,-.06);
      o.material.opacity=.75*(1-smooth(.66,.96,p));
      if(i===0) {
        o.extra.spiral.rotation.y=reducedMotion?0:p*TAU;
        o.extra.crack.material.opacity=1-smooth(.50,.92,p);
      } else if(i===1)o.extra.beacon.material.opacity=.50*rise*collapse;
      else if(i===2) {
        o.root.rotation.y=reducedMotion?.15:clamp(p/.72)*PI*3;
        o.root.scale.x*=mix(1,.12,smooth(.58,.91,p));
      } else if(i===3)o.extra.pages.rotation.y=reducedMotion?0:Math.sin(p*PI)*.4;
      else if(i===4) {
        o.extra.scars.scale.setScalar(mix(.86,1,smooth(.12,.45,p)));
        o.extra.heart.scale.setScalar(1+.10*Math.sin(p*PI*3)*collapse);
      } else if(i===5) {
        for(let k=0;k<100;k++){
          const a=k/100*TAU+(reducedMotion?0:(1-out(p/.5))*TAU*1.5);
          const settle=out(p/.5),r=mix(.28+(k/100)*.65,.68,settle);
          dummy.position.set(Math.cos(a)*r,Math.sin(a)*r,(1-settle)*Math.sin(k*.7)*.35);
          dummy.rotation.set(0,0,a);dummy.scale.set(.65,1.9,.65);dummy.updateMatrix();o.extra.ticks.setMatrixAt(k,dummy.matrix);
        }
        o.extra.ticks.instanceMatrix.needsUpdate=true;
        o.extra.inner.scale.setScalar(mix(.9,1.03,smooth(.1,.65,p)));
        o.extra.outer.rotation.z=reducedMotion?0:p*.5;
      }
    });
    // A literal still beat. motionT is clamped for ALL internal rhythms / poses.
    convergenceMats.forEach((m,k)=>m.opacity=smooth(5.5,5.9,motionT)*(1-smooth(6.3,6.65,motionT))*.62+peak*.75);
    guideRoot.visible=t<10.9;
    guideRoot.rotation.set(0,motionT*.035,motionT*.023);
    guideRoot.scale.setScalar(.96+smooth(0,1.3,t)*.04);
    guideM.opacity=(smooth(0,.9,t)*.15+peak*.10)*fadeAux;
    guideTicks.material.opacity=smooth(.1,.9,t)*.20*fadeAux;

    limitRoot.position.set(0,3.67,1.15);
    limitRoot.rotation.set(0,0,0);
    const limitAppear=smooth(5.5,5.85,t);
    limitRoot.visible=t>=5.5;
    segmentMat.opacity=limitAppear*mix(1,.64,smooth(10,11,t));
    const pressure=smooth(6.0,6.2,motionT)*(1-smooth(6.58,6.65,motionT));
    segmentPositions.forEach((base,i)=>{
      dummy.position.copy(base);dummy.rotation.set(0,0,0);dummy.scale.setScalar(1);
      const right=rightLookup.has(i);
      if(t<7 && !reducedMotion) {
        const amp=frozen?0:pressure*.018;
        dummy.position.x+=Math.sin(motionT*102+i*1.7)*amp;
        dummy.position.y+=Math.cos(motionT*87+i*.9)*amp;
      }
      if(t>=7 && !right)dummy.position.y+=reducedMotion?0:Math.sin((t-7)*42)*Math.exp(-(t-7)*12)*.035;
      if(right&&t>=7) {
        const k=rightLookup.get(i),side=base.x>1.29?1:-1;
        const end=base.clone().add(V(side*(.20+hash(i+8)*.30),.20+hash(i+31)*.30,(hash(i+71)-.5)*.85));
        const target=bernoulli(k/rightIndices.length*TAU,1.0);
        target.x+=1.28;target.z=.065*Math.sin(k/rightIndices.length*TAU*2);
        if(reducedMotion) {
          dummy.position.lerpVectors(base,target,smooth(7,8.25,t));
        } else if(t<7.45) {
          const s=out((t-7)/.45);dummy.position.lerpVectors(base,end,s);
          dummy.rotation.set(s*(hash(i)*2-1)*2,s*(hash(i+1)*2-1)*2,s*(hash(i+2)*2-1)*3);
        } else {
          const u=smooth(7.45,8.25,t);
          dummy.position.lerpVectors(end,target,u);
          const whirl=Math.sin(u*PI)*(1-u);
          dummy.position.x+=Math.cos(k*.27+u*TAU)*whirl*.50;
          dummy.position.y+=Math.sin(k*.27+u*TAU)*whirl*.40;
          dummy.rotation.set((1-u)*(hash(i)*2-1)*2,(1-u)*(hash(i+1)*2-1)*2,(1-u)*(hash(i+2)*2-1)*3);
        }
      }
      dummy.updateMatrix();limitMesh.setMatrixAt(i,dummy.matrix);
    });
    limitMesh.instanceMatrix.needsUpdate=true;
    infinityRoot.visible=t>=8.5;
    infinityRoot.position.set(0,2.75,1.35);
    infinityRoot.rotation.set(reducedMotion?0:Math.sin(motionT*.8)*.08,reducedMotion?0:Math.sin(motionT*.5)*.16,0);
    infinityRoot.scale.setScalar(.85+smooth(8.5,9.0,t)*.15);
    infinityMats.forEach(m=>m.opacity=smooth(8.5,8.95,t)*(.25+.75*fadeAux));

    const wp=clamp((t-7)/1.5);
    waveRoot.visible=t>=7&&t<=8.5;
    waveRoot.position.set(0,.25,.2);
    waveRoot.scale.setScalar(reducedMotion?2.2:mix(.6,5.2,out(wp)));
    waveRoot.rotation.set(0,reducedMotion?0:wp*.24,0);
    waveM.opacity=Math.sin(wp*PI)*.32;
    waveShader.uniforms.uOpacity.value=Math.sin(wp*PI)*.24;
    waveShader.uniforms.uTime.value=motionT;
    localLight.intensity=1.2+peak*3.0;

    captionPlane.visible=t>=8.5;
    captionMat.opacity=smooth(8.5,8.82,t);
    captionPlane.position.y=-3.39-(1-smooth(8.5,8.9,t))*.08;
    scrim.material.opacity=smooth(0,1.1,t);
    const retreat=mix(1.025,1.08,outro);
    const camAngle=reducedMotion?0:mix(.15,0,smooth(0,5.5,motionT));
    const parallax=reducedMotion?0:1;
    camera.position.set(
      Math.sin(camAngle)*fitDistance+pointerX*.13*parallax,
      .42+pointerY*.08*parallax,
      Math.cos(camAngle)*fitDistance*retreat
    );
    camera.lookAt(0,.52,0);
    scrim.quaternion.copy(camera.quaternion);
    captionPlane.quaternion.copy(camera.quaternion);
    if(mapMode){scrim.visible=false;captionPlane.visible=false;}
    scene.userData.timeSeconds=t;
    scene.userData.captionVisible=t>=8.5;
    scene.userData.installedCount=ends.filter(v=>t>=v-.055).length;
    scene.userData.limitRemoved=t>=8.25;
    scene.updateMatrixWorld(true);
    if(typeof api.onCaption==='function')api.onCaption(getCaptionState(t));
  }
  function dispose() {
    if(disposed)return;disposed=true;
    scene.onBeforeRender=()=>{};
    scene.environment=null;
    if(environmentRT)environmentRT.dispose();
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
    geometries.clear();materials.clear();textures.clear();scene.clear();
  }
  ornamentRoots.forEach(batchDecoration);
  // Merge static crease lines and joint housings independently for each moving
  // phalanx. Articulated groups and assembly-driven plates retain their pivots.
  const protectedParts=new Set(assembly.map(a=>a.o));
  function batchStaticChildren(root) {
    const selected=root.children.filter(o=>o.isMesh&&!o.isInstancedMesh&&!protectedParts.has(o)&&!o.material.isShaderMaterial&&!o.material.transparent);
    if(selected.length<2)return;
    const packed=group(root,'Batched static articulated hardware');
    selected.forEach(o=>packed.add(o));batchDecoration(packed);
  }
  fingers.forEach(f=>f.joints.forEach(batchStaticChildren));
  batchStaticChildren(wristAssembly);batchStaticChildren(palmCore);
  // Free construction-only meshes after batching; keep every live scene resource.
  const liveGeometry=new Set();scene.traverse(o=>{if(o.geometry)liveGeometry.add(o.geometry);});
  for(const g of geometries)if(!liveGeometry.has(g)){g.dispose();geometries.delete(g);}
  const api={
    scene,camera,durationMs:DURATION_MS,captionAtMs:CAPTION_AT_MS,
    mapBounds:mapMode?new THREE.Box3(V(-4,-4,-2),V(4,4,2)):null,
    update,resize,setPointer,dispose,
    caption,getCaptionState,prepareEnvironment,setRefractionSource,onCaption:null,
    // Read-only integration diagnostics, useful to validate rig and seeking.
    inspect:()=>({
      timeSeconds:lastTime,background:scene.background,
      crystalSegments:segmentPositions.length,trainingTicks:traces[5].extra.ticks.count,
      gemCenters:gems.map(g=>({x:g.pos.x,y:g.pos.y,z:g.pos.z})),
      curlAngles:fingers.map(f=>f.joints.map(j=>j.rotation.x)),
      resources:{geometries:geometries.size,materials:materials.size,textures:textures.size},
      reducedMotion,lowPower
    })
  };
  resize(800,800);
  return api;
}

export const durationMs=8000;
export const captionAtMs=7300;
export function createAnimation({THREE,reducedMotion=false}){
const D=8,W=1.5,H=2.1,FOV=40,K=2*Math.tan(FOV*Math.PI/360),PI=Math.PI;
const cl=x=>Math.min(1,Math.max(0,x)),mix=(a,b,t)=>a+(b-a)*t,sm=(a,b,x)=>{x=cl((x-a)/(b-a));return x*x*(3-2*x)},ease=x=>1-Math.pow(1-x,3);
let sd=5;const rnd=()=>(sd=sd*16807%2147483647)/2147483647;
const cv=(w,h,f)=>{const c=document.createElement('canvas');c.width=w;c.height=h;f(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.anisotropy=4;return t};

/* текстуры: страница без реального текста, обложка, золотой знак, свечение */
const pageTex=cv(256,360,(g,w,h)=>{const l=g.createLinearGradient(0,0,w,0);l.addColorStop(0,'#e9ebf7');l.addColorStop(1,'#c9cde0');g.fillStyle=l;g.fillRect(0,0,w,h);g.fillStyle='rgba(90,95,130,.22)';for(let y=40;y<h-40;y+=16)g.fillRect(34,y,(.45+rnd()*.5)*(w-70),4)});
const coverTex=cv(512,714,(g,w,h)=>{const l=g.createLinearGradient(0,0,w,h);l.addColorStop(0,'#2b1a55');l.addColorStop(1,'#0a0616');g.fillStyle=l;g.fillRect(0,0,w,h);
 g.strokeStyle='rgba(245,197,66,.75)';g.lineWidth=4;g.strokeRect(26,26,w-52,h-52);g.lineWidth=1.5;g.strokeRect(40,40,w-80,h-80);
 g.strokeStyle='rgba(245,197,66,.55)';g.lineWidth=3;g.strokeRect(96,570,320,76);
 const s=g.createLinearGradient(0,0,70,0);s.addColorStop(0,'rgba(0,0,0,.55)');s.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=s;g.fillRect(0,0,70,h)});
const symTex=cv(512,714,g=>{g.translate(256,300);g.strokeStyle='#f5c542';g.fillStyle='#ffe9a0';g.lineWidth=9;g.lineCap='round';g.lineJoin='round';g.shadowColor='#f5c542';g.shadowBlur=28;
 const arm=[[0,0],[-26,-60],[22,-118],[-10,-172],[16,-206]];
 for(let i=0;i<3;i++){g.save();g.rotate(i*2.0944);g.beginPath();arm.forEach((p,k)=>k?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.stroke();arm.slice(1).forEach(p=>{g.beginPath();g.arc(p[0],p[1],6,0,6.3);g.fill()});g.restore()}
 g.beginPath();g.arc(0,0,15,0,6.3);g.fill()});
const glowTex=cv(128,128,g=>{const r=g.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,'rgba(255,214,110,.9)');r.addColorStop(1,'rgba(255,214,110,0)');g.fillStyle=r;g.fillRect(0,0,128,128)});

const BG=new THREE.Color('#07040f'),BG2=new THREE.Color('#1c1038');
const scene=new THREE.Scene();scene.background=null;scene.fog=new THREE.Fog(0x07040f,16,40);
const camera=new THREE.PerspectiveCamera(FOV,9/16,.1,80);

const hemi=new THREE.HemisphereLight(0x8a6bd8,0x07040f,0),sun=new THREE.DirectionalLight(0xdfe4ff,0);
sun.position.set(2.5,5,3);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);const sh=sun.shadow.camera;sh.left=-3;sh.right=3;sh.top=3;sh.bottom=-3;sh.near=1;sh.far=14;sun.shadow.bias=-.0006;
const glint=new THREE.PointLight(0xffc04a,0,6),gl2=new THREE.PointLight(0xffc04a,0,10);glint.position.set(.9,.7,0);gl2.position.set(0,1.8,.5);
scene.add(hemi,sun,glint,gl2);

const mPage=new THREE.MeshStandardMaterial({map:pageTex,roughness:.85}),mEdge=new THREE.MeshStandardMaterial({color:0xaab0c8,roughness:.9}),
mCov=new THREE.MeshStandardMaterial({color:0x1d1236,roughness:.55,metalness:.25}),mTop=new THREE.MeshStandardMaterial({map:coverTex,roughness:.5,metalness:.3}),
mFlip=new THREE.MeshStandardMaterial({map:pageTex,color:0xf1f2fb,roughness:.8,emissive:0x1a1a2e,emissiveIntensity:.3}),
mGold=new THREE.MeshStandardMaterial({color:0xf2c14e,emissive:0xd9961a,emissiveIntensity:1.3,metalness:.4,roughness:.3}),
mGlow=new THREE.MeshBasicMaterial({color:0xffe08a});

/* книга */
const book=new THREE.Group();scene.add(book);
const wc=W+.05,hc=H+.06,blk=new THREE.BoxGeometry(W,1,H),bm=[mEdge,mEdge,mPage,mEdge,mEdge,mEdge];
const back=new THREE.Mesh(new THREE.BoxGeometry(wc,.04,hc),mCov);back.position.x=wc/2;
const bR=new THREE.Mesh(blk,bm),bL=new THREE.Mesh(blk,bm);bR.position.x=W/2;bL.position.x=-W/2;
const spine=new THREE.Mesh(new THREE.BoxGeometry(.05,1,hc),mCov);spine.position.x=-.025;
const pivot=new THREE.Group();pivot.position.y=.11;
const cover=new THREE.Mesh(new THREE.BoxGeometry(wc,.04,hc),[mCov,mCov,mTop,mCov,mCov,mCov]);cover.position.set(wc/2,.11,0);
const sym=new THREE.Mesh(new THREE.PlaneGeometry(wc,hc),new THREE.MeshBasicMaterial({map:symTex,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));sym.rotation.x=-PI/2;sym.position.y=.0215;cover.add(sym);
const edge=new THREE.Mesh(new THREE.BoxGeometry(.015,.015,hc),new THREE.MeshBasicMaterial({color:0xffd66b,transparent:true,opacity:0}));edge.position.set(wc,.22,0);
pivot.add(cover);book.add(back,bR,bL,spine,pivot,edge);
[back,bR,bL,spine,cover].forEach(m=>{m.castShadow=m.receiveShadow=true});

/* перелистываемые страницы: толщина, изгиб, тень */
const N=18;
function makeFlip(){const g=new THREE.BufferGeometry(),n=(N+1)*4,uv=new Float32Array(n*2),idx=[];
 for(let s=0;s<2;s++)for(let k=0;k<=N;k++)for(let j=0;j<2;j++){const v=s*(N+1)*2+k*2+j;uv[v*2]=k/N;uv[v*2+1]=j}
 for(let k=0;k<N;k++){const a=k*2,b=a+1,c=a+2,d=a+3,o=(N+1)*2;idx.push(a,b,c,b,d,c,o+a,o+c,o+b,o+b,o+c,o+d)}
 const fa=N*2,fb=fa+1,ba=fa+(N+1)*2,bb=ba+1;idx.push(fa,fb,ba,fb,bb,ba);
 g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(idx);
 const m=new THREE.Mesh(g,mFlip);m.frustumCulled=false;m.castShadow=true;return m}
function flex(m,p,y){const P=m.geometry.attributes.position.array,a=PI*p,lag=1.1*Math.sin(PI*p),T=.012;let x=0,yy=0;
 for(let k=0;k<=N;k++){const ph=a-lag*k/N;if(k){const pm=a-lag*(k-.5)/N;x+=Math.cos(pm)*W/N;yy+=Math.sin(pm)*W/N}
  const nx=-Math.sin(ph)*T/2,ny=Math.cos(ph)*T/2;
  for(let j=0;j<2;j++){const z=(j?1:-1)*H/2*.98;let v=(k*2+j)*3;P[v]=x+nx;P[v+1]=yy+ny;P[v+2]=z;v+=(N+1)*6;P[v]=x-nx;P[v+1]=yy-ny;P[v+2]=z}}
 m.geometry.attributes.position.needsUpdate=true;m.geometry.computeVertexNormals();m.position.y=y}
const flips=[[2.4,3.2],[3.9,4.65]].map(([a,b])=>{const m=makeFlip();book.add(m);return{m,a,b}});

/* нити и миниатюрные сцены (координаты относительно узла старта) */
const tube=(pts,r,mat,ts)=>{const c=new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(p[0],p[1],p[2]))),g=new THREE.TubeGeometry(c,ts,r,6,false),m=new THREE.Mesh(g,mat);m.userData={c,cnt:g.index.count};return m};
const grow=(m,u)=>{m.geometry.setDrawRange(0,Math.floor(m.userData.cnt/36*cl(u))*36);m.visible=u>.001};
const Z=[0,.02,0],ZA=new THREE.Vector3(0,0,1),sph=new THREE.SphereGeometry(1,10,8);
const defs=[
{t0:1.15,te:2.4,c:0x9b2236,g:[Z,[-.05,.15,-.45],[.15,.28,-.85],[0,.32,-1.3],[.05,.28,-1.75]],
 r:[[Z,[-.2,.1,-.35],[-.45,.2,-.7],[-.5,.25,-.95]],[Z,[.25,.08,-.3],[.5,.16,-.55],[.55,.24,-.8]],[Z,[-.1,.1,-.3],[-.2,.12,-.55]],[Z,[.1,.12,-.35],[.3,.2,-.6],[.3,.3,-.95],[.45,.3,-1.1]]]},
{t0:3.0,te:3.95,c:0x9b2236,g:[Z,[.2,.12,-.4],[-.2,.3,-.8],[.05,.38,-1.25],[-.1,.3,-1.75]],
 r:[[Z,[.3,.1,-.3],[.1,.18,-.55],[.45,.25,-.8]],[Z,[-.35,.1,-.35],[-.15,.2,-.65],[-.5,.28,-.9]],[Z,[.15,.1,-.5],[.4,.2,-.75]],[Z,[-.15,.1,-.4],[-.45,.18,-.55],[-.6,.25,-.75]]]},
{t0:4.25,cut:5.5,c:0xcfa9bf,ink:1,g:[Z,[0,.18,-.5],[.05,.3,-.95],[-.05,.4,-1.4],[0,.3,-1.78]],
 r:[[Z,[-.2,.15,-.5],[-.25,.28,-.95],[-.15,.36,-1.4],[-.2,.3,-1.6]],[Z,[.2,.15,-.5],[.25,.28,-.95],[.2,.36,-1.45],[.25,.3,-1.65]],[Z,[-.1,.2,-.6],[-.4,.3,-1],[-.45,.38,-1.35]],[Z,[.1,.22,-.6],[.4,.3,-1],[.45,.4,-1.3]]]}];
const scenes=defs.map(d=>{const grp=new THREE.Group();grp.position.set(W/2,.16,.9);book.add(grp);
 const s={t0:d.t0,te:d.te,cut:d.cut,ink:d.ink,grp};
 s.gold=tube(d.g,.02,mGold,60);grp.add(s.gold);
 s.tip=new THREE.Mesh(sph,mGlow);s.tip.scale.setScalar(.035);grp.add(s.tip);
 s.node=new THREE.Mesh(sph,mGlow);s.node.scale.setScalar(.05);s.node.position.set(0,.02,0);grp.add(s.node);
 s.gate=new THREE.Mesh(new THREE.TorusGeometry(.13,.012,8,32),mGold);const gc=s.gold.userData.c;s.gate.position.copy(gc.getPointAt(1));s.gate.quaternion.setFromUnitVectors(ZA,gc.getTangentAt(1).normalize());grp.add(s.gate);
 s.reds=d.r.map((p,i)=>{const mt=new THREE.MeshStandardMaterial({color:d.c,emissive:d.c,emissiveIntensity:d.ink?.9:1.1,transparent:true,roughness:.5}),m=tube(p,d.ink?.018:.013,mt,40),e=new THREE.Mesh(sph,mt);e.scale.setScalar(.03);m.userData.dl=i*.07;m.userData.end=e;grp.add(m,e);return m});
 if(d.ink){const n=4*45,pb=new Float32Array(n*3),pv=new Float32Array(n*3);
  s.reds.forEach((m,r)=>{for(let i=0;i<45;i++){const q=(r*45+i)*3,p=m.userData.c.getPointAt(rnd());pb[q]=p.x;pb[q+1]=p.y;pb[q+2]=p.z;pv[q]=(rnd()-.5)*.6;pv[q+1]=.1+rnd()*.45;pv[q+2]=(rnd()-.5)*.6}});
  s.pb=pb;s.pv=pv;const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(pb.slice(),3));
  s.pts=new THREE.Points(pg,new THREE.PointsMaterial({color:0x9a3a72,size:.045,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));s.pts.visible=false;grp.add(s.pts)}
 return s});

/* три золотых маршрута, сплетающиеся в знак */
const EMB=new THREE.Vector3(0,1.35,0),CEN=new THREE.Vector3(0,.3,0);
const arms=[[-1,.17,.9],[-.55,.17,.9],[.75,.16,.9]].map((p,i)=>{const o=new THREE.Group(),m=tube(defs[i].g,.026,mGold,60);o.add(m);o.visible=false;scene.add(o);return{o,m,s:new THREE.Vector3(p[0],p[1],p[2])}});
const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0}));scene.add(spr);

/* большая схема из развилок */
const gp=[],nd=[];
const grand=new THREE.Group();
function tree(x,z,a,l,d){if(!d)return;const c=d>2?2:3;for(let k=0;k<c;k++){const na=a+(k-(c-1)/2)*.7+(rnd()-.5)*.3,nx=x+Math.cos(na)*l,nz=z+Math.sin(na)*l;gp.push(x,0,z,nx,0,nz);nd.push(nx,0,nz);tree(nx,nz,na,l*.74,d-1)}}
for(let k=0;k<4;k++)tree(0,0,k*PI/2+.4,1.3,5);
const lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(gp),3));
const lines=new THREE.LineSegments(lg,new THREE.LineBasicMaterial({color:0xf5c542,transparent:true,opacity:0}));
const ng=new THREE.BufferGeometry();ng.setAttribute('position',new THREE.BufferAttribute(new Float32Array(nd),3));
const npts=new THREE.Points(ng,new THREE.PointsMaterial({color:0xffe08a,size:.06,transparent:true,opacity:0,depthWrite:false}));
grand.add(lines,npts);grand.position.y=-.9;scene.add(grand);

const dp=new Float32Array(420);for(let i=0;i<420;i+=3){dp[i]=(rnd()-.5)*10;dp[i+1]=(rnd()-.3)*6;dp[i+2]=(rnd()-.5)*10}
const dg=new THREE.BufferGeometry();dg.setAttribute('position',new THREE.BufferAttribute(dp,3));
const dust=new THREE.Points(dg,new THREE.PointsMaterial({color:0xc9c4ee,size:.03,transparent:true,opacity:.6,depthWrite:false}));scene.add(dust);

/* камера: [t, az, el, tx, ty, tz, ширина кадра, высота/ширина] */
const KEYS=[[0,.5,.75,0,.1,0,6.5,.6],[1,.3,.8,0,.1,0,3.6,.6],[1.7,.1,.9,.1,.1,0,3.6,.7],[2.3,.05,.85,.75,.3,.1,2.6,.8],[4,-.08,.9,.75,.3,0,2.6,.8],[5.4,0,.8,.75,.35,0,2.8,.8],[6.6,0,.45,0,.9,0,7.4,.6],[7.6,.1,1,0,.2,0,3.6,1],[8,0,1.32,0,.15,0,2.4,1.4]];
const tipW=new THREE.Vector3(.75,.3,0),qz=new THREE.Quaternion(),qx=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),PI/2),qf=new THREE.Quaternion();
let fw=0,fwT=0,px=0,py=0,tpx=0,tpy=0,asp=9/16;

function run(s,t){const tau=t-s.t0,sink=s.te?sm(s.te,s.te+.35,t):0,g=s.grp;
 g.visible=tau>0&&sink<1&&(!s.cut||t<s.cut+.5);if(!g.visible)return;
 g.scale.y=Math.max(.03,1-sink);
 const cut=s.cut&&t>=s.cut,u=ease(cl(tau));
 grow(s.gold,u);s.gold.visible=!cut&&u>.001;s.tip.position.copy(s.gold.userData.c.getPointAt(u));
 s.tip.visible=s.node.visible=s.gate.visible=!cut;s.gate.scale.setScalar(Math.max(.001,sm(.85,1.05,tau)));
 if(!cut){tipW.copy(s.tip.position).add(g.position);fwT=1}
 s.reds.forEach(m=>{const d=m.userData,v=ease(cl((tau-d.dl)/.75)),dim=sm(0,.35,tau-d.dl-.75);
  grow(m,v);d.end.position.copy(d.c.getPointAt(v));
  if(s.ink){const q=cl((tau-.95)/.5);m.material.opacity=1-q;if(q>=1)m.visible=false}
  else{m.material.emissiveIntensity=mix(1.1,.12,dim);m.material.opacity=mix(1,.5,dim)}
  d.end.visible=m.visible});
 if(s.ink){const q=cl((tau-.95)/1),P=s.pts;P.visible=q>0&&q<1;
  if(P.visible){const a=P.geometry.attributes.position.array,e=ease(q);for(let i=0;i<a.length;i++)a[i]=s.pb[i]+s.pv[i]*e;P.geometry.attributes.position.needsUpdate=true;P.material.opacity=.9*(1-q)}}}

function apply(t,dt){
 const o=t<3?sm(.4,1.2,t):1-sm(6.8,7.6,t),rv=sm(.25,1,t);
 hemi.intensity=.6*rv;sun.intensity=.95*rv;
 glint.intensity=1.1*sm(0,.25,t)*(1-sm(.5,1,t));edge.material.opacity=sm(0,.25,t)*(1-sm(.5,1,t));edge.visible=t<1.05;
 gl2.intensity=2.2*sm(5.6,6.2,t)*(1-.55*sm(6.8,7.8,t));
 scene.fog.color.copy(BG).lerp(BG2,sm(5.7,6.3,t)*(1-.45*sm(7,8,t)));
 book.position.set(-W/2*(1-o),.05*Math.sin(t*1.4)*(1-sm(7.2,7.9,t)),0);
 pivot.rotation.z=PI*o;
 const hR=.18-.07*o,hL=.1*o,rT=.02+hR,lT=.02+hL;
 bR.scale.y=hR;bR.position.y=.02+hR/2;bL.scale.y=Math.max(hL,.001);bL.position.y=.02+hL/2;spine.scale.y=hR+.06;spine.position.y=-.02+(hR+.06)/2;
 flips.forEach((f,i)=>{f.m.visible=o>.95;if(f.m.visible){const p=sm(f.a,f.b,t);flex(f.m,p,mix(rT+.014-.006*i,lT+.008+.006*i,p))}});
 fwT=0;scenes.forEach(s=>run(s,t));fw+=(fwT-fw)*Math.min(1,dt*5);
 px+=(tpx-px)*Math.min(1,dt*4);py+=(tpy-py)*Math.min(1,dt*4);
 let i=0;while(i<KEYS.length-2&&t>KEYS[i+1][0])i++;
 const a=KEYS[i],b=KEYS[i+1],s=sm(a[0],b[0],t),L=j=>mix(a[j],b[j],s);
 const tx=L(3)+(tipW.x-.75)*.3*fw,ty=L(4),tz=L(5)+tipW.z*.3*fw,az=L(1)+px*.12,el=L(2)+py*.06;
 const dist=Math.max(L(6)/(Math.min(asp,1.7)*K),L(6)*L(7)/K);
 camera.position.set(tx+dist*Math.sin(az)*Math.cos(el),ty+dist*Math.sin(el),tz+dist*Math.cos(az)*Math.cos(el));camera.lookAt(tx,ty,tz);
 const ap=sm(5.5,6.5,t),cp=sm(6.8,7.6,t);
 arms.forEach((m,k)=>{m.o.visible=t>=5.5&&t<7.7;if(!m.o.visible)return;
  grow(m.m,k<2?ease(cl((t-5.5)/.5)):1);
  m.o.position.lerpVectors(m.s,EMB,ap).lerp(CEN,cp);
  qz.setFromAxisAngle(ZA,k*2.0944+(1-ap)*(k%2?1.5:-1.5));
  qf.copy(camera.quaternion).multiply(qz).multiply(qx);m.o.quaternion.identity().slerp(qf,ap);
  m.o.scale.setScalar(mix(1,.85,ap)*mix(1,.15,cp))});
 spr.visible=t>5.8&&t<7.3;spr.position.copy(EMB);spr.scale.setScalar(1+5*sm(5.9,6.5,t));spr.material.opacity=.85*sm(5.9,6.3,t)*(1-sm(6.6,7.2,t));
 const go=sm(5.8,6.7,t)*(1-sm(7.1,7.7,t));lines.material.opacity=.5*go;npts.material.opacity=.8*go;grand.visible=go>.01;
 sym.material.opacity=sm(7.2,7.9,t);dust.rotation.y=t*.04}

apply(reducedMotion?D:0,0);
return{scene,camera,duration:D,
 update(time,dt){apply(reducedMotion?D:Math.min(time,D),dt||0)},
 resize(w,h){asp=w/h;camera.aspect=asp;camera.updateProjectionMatrix()},
 setPointer(x,y){tpx=x;tpy=-y}
};
}

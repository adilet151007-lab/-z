export const durationMs=8000;
export const captionAtMs=6600;
export function createAnimation({THREE:T, reducedMotion=false, lowPower=false}={}){
  const DUR=8, cl=(x,a,b)=>Math.min(b,Math.max(a,x));
  const ss=(a,b,x)=>{x=cl((x-a)/(b-a),0,1);return x*x*(3-2*x)};
  let seed=7;const rnd=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
  const tex=(w,h,f)=>{const c=document.createElement('canvas');c.width=w;c.height=h;f(c.getContext('2d'),w,h);return new T.CanvasTexture(c)};
  const scene=new T.Scene();
  scene.background=null;
  scene.fog=new T.FogExp2(0x0d0a1e,.0042);
  const camera=new T.PerspectiveCamera(62,.56,.5,2500);

  /* --- шейдер фасадов: окна, волна огней, энергия, золотой импульс --- */
  const S={uLit:{value:14},uCity:{value:.45},uPulse:{value:200},uLine:{value:0},uLines:{value:0},uGold:{value:0},uFog:{value:.0042},uFogC:{value:new T.Color(0x0d0a1e)}};
  const VS=`varying vec3 vW,vN;varying float vId;
  void main(){vec4 p=vec4(position,1.);vec3 n=normal;float id=.5;
  #ifdef USE_INSTANCING
  p=instanceMatrix*p;n=mat3(instanceMatrix)*n;id=fract(sin(dot(instanceMatrix[3].xz,vec2(12.9,78.2)))*43758.5);
  #endif
  vec4 w=modelMatrix*p;vW=w.xyz;vN=normalize(mat3(modelMatrix)*n);vId=id;gl_Position=projectionMatrix*viewMatrix*w;}`;
  const FS=`uniform float uLit,uCity,uPulse,uLine,uLines,uGold,uFog,uRound,uGate;uniform vec3 uFogC;
  varying vec3 vW,vN;varying float vId;
  float H(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  void main(){
   vec3 n=normalize(vN),V=normalize(cameraPosition-vW);float ay=abs(n.y),ang=atan(vW.x,vW.z);
   float u=uRound>.5?ang*length(vW.xz):(abs(n.x)>abs(n.z)?vW.z:vW.x);
   vec2 g=vec2(u/1.7,vW.y/2.3),c=floor(g),f=fract(g);
   float win=step(.2,f.x)*step(f.x,.8)*step(.18,f.y)*step(f.y,.82)*(1.-step(.8,ay));
   float lit=mix(1.,1.-smoothstep(uLit-5.,uLit,vW.y),uGate);
   float prob=mix(mix(.12,.8,vId)*uCity,.6,uGate);
   float on=step(H(c+vId*37.),prob)*win*lit;
   float k=H(c+3.1);
   vec3 wc=mix(vec3(.55,.82,1.),vec3(1.,.22,.52),step(.55,k));wc=mix(wc,vec3(1.,.7,.35),step(.88,k));
   float passed=step(uPulse,vW.y)*uGate;wc=mix(wc,vec3(1.,.78,.4),passed*.55);
   float fr=pow(1.-max(dot(n,V),0.),3.);
   vec3 col=mix(vec3(.012,.018,.04),vec3(.03,.055,.11),clamp(vW.y/130.,0.,1.));
   col+=vec3(.08,.2,.45)*fr*(.6+uGate)+vec3(.45,.06,.28)*fr*.35*uGate;
   col*=1.-.7*step(.8,ay);
   col+=wc*on*(1.2+uGate*.5);
   float la=ang/6.2832*18.+.5,li=floor(la);
   float ln=1.-smoothstep(0.,.07,abs(fract(la)-.5));
   float lp=pow(.5+.5*sin(vW.y*.1-uLine+li*1.9),6.);
   col+=vec3(1.,.18,.42)*ln*lp*uLines*uGate*step(vW.y,uLit+6.)*2.;
   float q=(vW.y-uLit)/2.4;col+=vec3(1.,.15,.35)*exp(-q*q)*uGate*step(uLit,130.)*1.4*(win*.6+.4);
   float q2=(vW.y-uPulse)/3.5;col+=vec3(1.,.72,.25)*exp(-q2*q2)*uGate*uGold*2.;
   col+=vec3(.22,.13,.03)*passed*smoothstep(50.,130.,vW.y)*(.6+fr*2.);
   float d=length(cameraPosition-vW),fg=1.-exp(-d*d*uFog*uFog);col=mix(col,uFogC,fg);
   gl_FragColor=vec4(col,1.);}`;
  const mat=(round,gate)=>new T.ShaderMaterial({uniforms:Object.assign({uRound:{value:round},uGate:{value:gate}},S),vertexShader:VS,fragmentShader:FS});

  /* --- небо и звёзды --- */
  const skyMat=new T.ShaderMaterial({uniforms:{uGold:S.uGold},transparent:true,depthWrite:false,side:T.BackSide,
   vertexShader:`varying vec3 vD;void main(){vD=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:`uniform float uGold;varying vec3 vD;void main(){float h=clamp(vD.y,0.,1.);
   vec3 c=mix(vec3(.2,.045,.17),vec3(.008,.014,.045),pow(h,.4));c+=vec3(0.,.03,.08)*smoothstep(0.,.2,h)*(1.-h);
   c+=vec3(.5,.3,.06)*uGold*exp(-h*7.)*.6;gl_FragColor=vec4(c,.18);}`});
  const sky=new T.Mesh(new T.SphereGeometry(900,24,12),skyMat);sky.renderOrder=-10;sky.frustumCulled=false;scene.add(sky);
  const NS=lowPower?120:220,sp=new Float32Array(NS*3);
  for(let i=0;i<NS;i++){const th=rnd()*6.283,y=.06+rnd()*.94,r=Math.sqrt(1-y*y)*850;sp.set([Math.cos(th)*r,y*850,Math.sin(th)*r],i*3)}
  const sg=new T.BufferGeometry();sg.setAttribute('position',new T.BufferAttribute(sp,3));
  const stars=new T.Points(sg,new T.PointsMaterial({size:1.6,sizeAttenuation:false,color:0xaabbee,transparent:true,opacity:.8,depthWrite:false,fog:false}));stars.frustumCulled=false;scene.add(stars);

  /* --- текстуры --- */
  const dot=tex(64,64,(x)=>{const g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.35,'rgba(255,255,255,.5)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64)});
  const cloudT=tex(128,128,(x)=>{for(let i=0;i<8;i++){const cx=30+rnd()*68,cy=40+rnd()*48,r=22+rnd()*26,g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,128,128)}});
  const beamT=tex(4,128,(x,w,h)=>{const g=x.createLinearGradient(0,0,0,h);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(1,'rgba(255,255,255,1)');x.fillStyle=g;x.fillRect(0,0,w,h)});
  const roadT=tex(128,128,(x)=>{x.fillStyle='#04060d';x.fillRect(0,0,128,128);
   [['rgba(255,50,110,.16)',9],['rgba(255,90,150,.7)',3]].forEach(([c,w])=>{x.fillStyle=c;x.fillRect(0,0,128,w/2+1);x.fillRect(0,128-w/2-1,128,w/2+1)});
   [['rgba(60,150,255,.16)',9],['rgba(110,190,255,.7)',3]].forEach(([c,w])=>{x.fillStyle=c;x.fillRect(0,0,w/2+1,128);x.fillRect(128-w/2-1,0,w/2+1,128)})});
  roadT.wrapS=roadT.wrapT=T.RepeatWrapping;roadT.repeat.set(40,40);roadT.anisotropy=4;

  /* --- земля, город, машины --- */
  const ground=new T.Mesh(new T.PlaneGeometry(800,800),new T.MeshBasicMaterial({map:roadT,transparent:true,opacity:.28,depthWrite:false}));ground.rotation.x=-Math.PI/2;scene.add(ground);
  const bg=new T.BoxGeometry(1,1,1);bg.translate(0,.5,0);
  const cells=[];
  for(let i=-10;i<10;i++)for(let j=-10;j<10;j++){const cx=i*20+10,cz=j*20+10,d=Math.hypot(cx,cz);
   if(d<36||([10,30,50].includes(cx)&&cz>20))continue;cells.push([cx,cz,d])}
  const city=new T.InstancedMesh(bg,mat(0,0),cells.length),dm=new T.Object3D();
  cells.forEach(([cx,cz,d],i)=>{const mx=d<80?22:d<130?40:95,h=6+Math.pow(rnd(),1.6)*mx*(rnd()<.18?1.6:1);
   dm.position.set(cx+(rnd()-.5)*2,0,cz+(rnd()-.5)*2);dm.scale.set(9+rnd()*5,Math.min(h,mx*1.4),9+rnd()*5);dm.updateMatrix();city.setMatrixAt(i,dm.matrix)});
  city.frustumCulled=false;scene.add(city);
  const NC=lowPower?160:300,cp=new Float32Array(NC*3),cc=new Float32Array(NC*3),cs=[],pal=[[1,.2,.5],[1,.1,.15],[.9,.95,1],[.3,.7,1]];
  for(let i=0;i<NC;i++){cs.push({ax:rnd()<.5?0:1,r:(Math.floor(rnd()*21)-10)*20+(rnd()<.5?-1.3:1.3),s:rnd()*400,v:(rnd()<.5?-1:1)*(10+rnd()*22)});cc.set(pal[(rnd()*4)|0],i*3)}
  const cg=new T.BufferGeometry();cg.setAttribute('position',new T.BufferAttribute(cp,3));cg.setAttribute('color',new T.BufferAttribute(cc,3));
  const cars=new T.Points(cg,new T.PointsMaterial({size:1.5,map:dot,vertexColors:true,transparent:true,blending:T.AdditiveBlending,depthWrite:false}));cars.frustumCulled=false;scene.add(cars);

  /* --- башня (собственный дизайн: четыре яруса, два наклонных «клинка», шпиль) --- */
  const TM=mat(1,1),FM=mat(0,1);
  const part=(g,y,m=TM)=>{const o=new T.Mesh(g,m);o.position.y=y;scene.add(o);return o};
  part(new T.CylinderGeometry(10.5,13,42,12),21);
  part(new T.CylinderGeometry(8.2,10.2,38,12),61);
  part(new T.CylinderGeometry(6.2,7.8,28,12),94);
  part(new T.CylinderGeometry(1.8,3.2,20,12),118);
  part(new T.CylinderGeometry(.15,.5,10,6),133);
  [-1,1].forEach(s=>{const f=part(new T.BoxGeometry(2.4,80,9),40,FM);f.position.x=s*14.5;f.rotation.z=s*.04});
  const deck=part(new T.CylinderGeometry(10.5,10.5,1.2,48),108,new T.MeshBasicMaterial({color:0x0a1226}));
  const rail=new T.Mesh(new T.TorusGeometry(10,.05,4,64),new T.MeshBasicMaterial({color:0x2a5a9a}));rail.rotation.x=Math.PI/2;rail.position.y=109.7;scene.add(rail);
  const rings=[{y:42,r:10.6},{y:80,r:8.3},{y:108.7,r:10.6}].map(o=>{const m=new T.Mesh(new T.TorusGeometry(o.r,.22,6,64),new T.MeshBasicMaterial({color:0x14182a}));m.rotation.x=Math.PI/2;m.position.y=o.y;scene.add(m);o.m=m;return o});

  /* --- маяк, луч, кольца в небе --- */
  const BY=138.3;
  const bm=new T.Mesh(new T.SphereGeometry(1,12,8),new T.MeshBasicMaterial({color:0xffd27a,fog:false}));bm.position.y=BY;scene.add(bm);
  const glow=new T.Sprite(new T.SpriteMaterial({map:dot,color:0xffb84a,blending:T.AdditiveBlending,transparent:true,depthWrite:false,opacity:0}));glow.position.y=BY;scene.add(glow);
  const beam=new T.Mesh(new T.CylinderGeometry(2.2,4.5,80,16,1,true),new T.MeshBasicMaterial({map:beamT,color:0xffc860,transparent:true,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide,opacity:0}));scene.add(beam);
  const mkRing=(r,tb,c,y,tilt)=>{const m=new T.Mesh(new T.TorusGeometry(r,tb,8,120),new T.MeshBasicMaterial({color:c,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false,fog:false}));m.position.y=y;m.rotation.x=Math.PI/2+tilt;scene.add(m);return m};
  const ringA=mkRing(36,.6,0xff2d78,144,.4),ringB=mkRing(42,.28,0xffc15a,144,.4);

  /* --- облака --- */
  const cloudMat=new T.SpriteMaterial({map:cloudT,color:0x2c3a66,transparent:true,opacity:.42,depthWrite:false});
  const clouds=[];const NCL=lowPower?45:70;
  for(let i=0;i<NCL;i++){const s=new T.Sprite(cloudMat),w=40+rnd()*60;s.scale.set(w,w*.5,1);clouds.push({s,a:rnd()*6.283,r:18+rnd()*160,y:66+rnd()*34});scene.add(s)}
  const cA=new T.Color(0x2c3a66),cB=new T.Color(0x6a5470);

  /* --- силуэт победителя (обезличенный) --- */
  const fig=new T.Group(),fm=new T.MeshBasicMaterial({color:0x03040a,fog:false});
  const fp=(g,x,y,z)=>{const m=new T.Mesh(g,fm);m.position.set(x,y,z);fig.add(m);return m};
  fp(new T.CylinderGeometry(.1,.1,.85,6),-.13,.425,0);fp(new T.CylinderGeometry(.1,.1,.85,6),.13,.425,0);
  fp(new T.CylinderGeometry(.26,.38,.95,8),0,1.3,0);fp(new T.SphereGeometry(.2,10,8),0,1.95,0);
  fp(new T.CylinderGeometry(.06,.06,.8,5),-.4,1.3,0).rotation.z=.12;fp(new T.CylinderGeometry(.06,.06,.8,5),.4,1.3,0).rotation.z=-.12;
  fig.position.set(-1.5,108.6,-9.5);scene.add(fig);

  /* --- траектория камеры: [время, позиция xyz, точка взгляда xyz] --- */
  const KEYS=[[0,42,10,140,0,60,0],[1.2,36,13,116,0,66,0],[2.2,24,34,58,0,68,0],[3,17,56,38,0,84,0],[3.8,13,78,31,0,100,0],[4.5,12,94,36,0,112,0],[5.1,10,111,22,0,112,2],[5.5,-3,112.2,8.5,.5,110,-20],[6.5,-2,112.6,7,1,115,-20],[7.25,5,121,62,0,98,0],[8,10,126,128,0,58,0]];
  const v=new Array(6);
  function sample(t){const n=KEYS.length;let i=0;while(i<n-2&&t>=KEYS[i+1][0])i++;
   const a=KEYS[i],b=KEYS[i+1],h=b[0]-a[0],s=cl((t-a[0])/h,0,1),p=KEYS[i-1],q=KEYS[i+2];
   const s2=s*s,s3=s2*s,h00=2*s3-3*s2+1,h10=s3-2*s2+s,h01=-2*s3+3*s2,h11=s3-s2;
   for(let k=1;k<7;k++){const m0=p?(b[k]-p[k])/(b[0]-p[0])*h:0,m1=q?(q[k]-a[k])/(q[0]-a[0])*h:0;v[k-1]=h00*a[k]+h10*m0+h01*b[k]+h11*m1}}

  let px=0,py=0,tx=0,ty=0;
  const setPointer=(x,y)=>{tx=cl(x,-1,1);ty=cl(-y,-1,1)};
  const resize=(w,h)=>{const a=w/h;camera.aspect=a;camera.fov=a<1?62:46;camera.updateProjectionMatrix()};
  const PINK=new T.Color(0xff3d8a),GOLD=new T.Color(0xffc15a),OFF=new T.Color(0x14182a);
  const ringCol=(m,y)=>m.material.color.copy(S.uPulse.value<y?GOLD:(S.uLit.value>y?PINK:OFF));

  function update(t,dt=0){
   t=reducedMotion?DUR:cl(t,0,DUR);
   sample(t);
   px+=(tx-px)*Math.min(1,dt*4);py+=(ty-py)*Math.min(1,dt*4);
   camera.position.set(v[0]+px*1.2,v[1]+py*.8,v[2]);camera.lookAt(v[3],v[4],v[5]);
   sky.position.copy(camera.position);stars.position.copy(camera.position);
   // волна огней идёт за камерой, на 4.0–4.8 с «крыша недостижима», затем последний ряд вспыхивает
   let lit=t<4.8?cl(v[1]+12,14,92):92+23*ss(4.8,5.3,t);lit+=25*ss(5.3,5.6,t);
   S.uLit.value=lit;S.uCity.value=.45+.55*ss(1,5.2,t);
   S.uLines.value=ss(1.2,1.6,t)*(1-ss(3.8,4.6,t));S.uLine.value=t*22;
   S.uGold.value=ss(5.7,5.85,t);S.uPulse.value=t<5.85?200:142-152*ss(5.85,6.5,t);
   const b=ss(5.5,5.95,t);
   bm.scale.setScalar(b*1.1+.001);glow.material.opacity=b*.95;glow.scale.setScalar(16+12*b+Math.sin(t*7)*b*.8);
   beam.material.opacity=.5*b;beam.scale.y=b+.001;beam.position.y=BY+40*b;
   rings.forEach(o=>ringCol(o.m,o.y));
   const rr=ss(6.5,7.6,t);
   [ringA,ringB].forEach((m,i)=>{m.material.opacity=rr*(i?.7:.9);m.scale.setScalar(.4+.6*rr);m.rotation.z=t*(i?-.15:.12)});
   cloudMat.color.copy(cA).lerp(cB,S.uGold.value*.5);
   clouds.forEach(c=>{const a=c.a+t*.012;c.s.position.set(Math.cos(a)*c.r,c.y,Math.sin(a)*c.r)});
   for(let i=0;i<NC;i++){const c=cs[i],p=((c.s+c.v*t)%400+400)%400-200,x=c.ax?c.r:p,z=c.ax?p:c.r;
    cp[i*3]=x;cp[i*3+1]=Math.hypot(x,z)<18?-50:.7;cp[i*3+2]=z}
   cg.attributes.position.needsUpdate=true;
  }
  update(0,0);
  return {scene,camera,update,resize,setPointer};
}

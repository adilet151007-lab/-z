export const durationMs=8000;
export const captionAtMs=6600;
export function createAnimation({THREE:T, reducedMotion=false}={}){
  const DUR=8, CAP=6.6, PI2=Math.PI*2, cl=(x,a,b)=>Math.min(b,Math.max(a,x));
  const ss=(a,b,x)=>{x=cl((x-a)/(b-a),0,1);return x*x*(3-2*x)};
  const scene=new T.Scene();scene.background=null;           // прозрачный фон
  const camera=new T.PerspectiveCamera(55,.5,.1,200);
  const M=(c,o)=>new T.MeshBasicMaterial({color:c,transparent:true,opacity:o,depthWrite:false});
  const rg=(a,b,s=128)=>{const g=new T.RingGeometry(a,b,s);g.rotateX(-Math.PI/2);return g};
  const disc=R=>{const g=new T.CircleGeometry(R,64);g.rotateX(-Math.PI/2);return g};
  // единый шейдер: 0 — тёмный пол, 1 — радиальное свечение, 2 — бегущий клин рассвета
  const sh=(mode,col,add,R)=>new T.ShaderMaterial({transparent:true,depthWrite:false,blending:add?T.AdditiveBlending:T.NormalBlending,
    uniforms:{uC:{value:new T.Color(col)},uA:{value:1},uMode:{value:mode},uAng:{value:0},uR:{value:R}},
    vertexShader:`uniform float uR;varying vec2 vP;void main(){vP=position.xz/uR;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform vec3 uC;uniform float uA,uMode,uAng;varying vec2 vP;
    void main(){float r=length(vP),a=0.;
     if(uMode<.5)a=(1.-smoothstep(.45,1.,r))*.6;
     else if(uMode<1.5){float q=max(1.-r,0.);a=q*q;}
     else{float an=atan(vP.y,vP.x),d=abs(mod(an-uAng+3.14159,6.28318)-3.14159);a=exp(-d*d*9.)*(1.-smoothstep(.3,1.,r))*smoothstep(.05,.25,r);}
     gl_FragColor=vec4(uC,a*uA);}`});
  const add=(m,y,ro)=>{m.position.y=y;m.renderOrder=ro||0;scene.add(m);return m};

  const floor=add(new T.Mesh(disc(9.5),sh(0,0x05080f,false,9.5)),-.02,-3);
  const wall=new T.Mesh(new T.CylinderGeometry(7.6,7.6,.45,96,1,true),M(0x0c1424,.55));wall.material.side=T.DoubleSide;add(wall,.22,-2);
  add(new T.Mesh(rg(7.55,7.65),M(0x6f86b0,.5)),.45,-1);
  const glow=add(new T.Mesh(disc(8),sh(1,0xffb060,true,8)),.01,5);
  const wedge=add(new T.Mesh(disc(7.4),sh(2,0xffd08a,true,7.4)),1.0,6);

  // слои механизма: 10 групп = 10 колец
  const cA=new T.Color(.78,.9,1),cB=new T.Color(1,.74,.4),gold=new T.Color(1,.82,.5),white=new T.Color(1,1,1);
  const gc=[],R_=g=>1+g*.62,Y_=g=>.12+(9-g)*.07,layers=[];
  for(let g=0;g<10;g++){
    const col=cA.clone().lerp(cB,g/9),r=R_(g),grp=new T.Group(),mats=[];
    const mk=(m,o)=>{mats.push([m,o]);return m};
    grp.position.y=Y_(g);gc.push(col);
    grp.add(new T.Mesh(rg(r-.045,r+.045),mk(M(col,.85),.85)));
    if(g%2===0){
      grp.add(new T.Mesh(rg(r-.22,r-.18),mk(M(col,.5),.5)));
      const p=[];for(let k=0;k<72;k++){const a=k/72*PI2,l=k%6===0?.3:.15,c=Math.cos(a),s=Math.sin(a);p.push(c*(r+.1),0,s*(r+.1),c*(r+.1+l),0,s*(r+.1+l))}
      const lg=new T.BufferGeometry();lg.setAttribute('position',new T.Float32BufferAttribute(p,3));
      grp.add(new T.LineSegments(lg,mk(new T.LineBasicMaterial({color:col,transparent:true,opacity:.7,depthWrite:false}),.7)));
    }else{
      const mid=(r+R_(g-1))/2,len=r-R_(g-1);
      for(let k=0;k<3;k++){const a=k*PI2/3,b=new T.Mesh(new T.BoxGeometry(.05,.03,len),mk(M(col,.8),.8));b.position.set(Math.cos(a)*mid,0,Math.sin(a)*mid);b.rotation.y=Math.PI/2-a;grp.add(b)}
    }
    scene.add(grp);
    const dir=g%2?-1:1;
    layers.push({grp,mats,r,g,w:dir*(1+g%3)*.62832,dir,ph:g*.063,start:.8+g*.5});
  }
  // ровно 100 меток — один InstancedMesh
  const marks=new T.InstancedMesh(new T.OctahedronGeometry(1,0),new T.MeshBasicMaterial({color:0xffffff}),100);
  marks.frustumCulled=false;marks.renderOrder=3;
  for(let i=0;i<100;i++)marks.setColorAt(i,white);
  scene.add(marks);
  // меловая отметка в центре
  const chalk=new T.Group(),cm=M(0xeef3ff,1);
  const rr=new T.Mesh(new T.RingGeometry(.5,.56,48,1,.3,5.6),cm);rr.rotation.x=-Math.PI/2;chalk.add(rr);
  const s1=new T.Mesh(new T.BoxGeometry(.07,.03,.72),cm);s1.rotation.y=.5;chalk.add(s1);
  const s2=new T.Mesh(new T.BoxGeometry(.05,.03,.4),cm);s2.rotation.y=-.9;s2.position.set(.18,0,.1);chalk.add(s2);
  add(chalk,.85,4);
  const cg=add(new T.Mesh(disc(1.6),sh(1,0xdbe6ff,true,1.6)),.8,5);

  // камера
  let d0=10,dF=37,px=0,py=0,tx=0,ty=0;
  function fit(){const tv=Math.tan(camera.fov*Math.PI/360),th=tv*camera.aspect;
    dF=Math.max(7.8*1.14/th,7.8*.95/tv);d0=Math.max(2.1*1.14/th,2.1*.95/tv)}
  const resize=(w,h)=>{camera.aspect=w/h;camera.fov=w/h<1?55:45;camera.updateProjectionMatrix();fit()};
  const setPointer=(x,y)=>{if(reducedMotion)return;tx=cl(x,-1,1);ty=cl(-y,-1,1)};

  const dm=new T.Object3D(),tmp=new T.Color(),rot=new Array(10);
  function update(ts,dt=0){
    const t=reducedMotion?DUR:cl(ts,0,DUR);
    const E=1-Math.pow(1-cl(t/5.7,0,1),2),rv=ss(5.7,7.2,t),dawn=ss(5.6,7.4,t);
    px+=(tx-px)*Math.min(1,dt*5);py+=(ty-py)*Math.min(1,dt*5);
    // знак в центре
    const ca=ss(0,.6,t),br=reducedMotion?1:.78+.22*Math.sin(t*3);
    cm.opacity=ca*br;chalk.scale.setScalar(1-.3*ss(1,5,t));cg.material.uniforms.uA.value=ca*.7*br*(1-.5*dawn);
    // слои
    for(const L of layers){
      const ap=ss(L.start-.05,L.start+.5,t);rot[L.g]=L.w*E+L.dir*PI2*rv;
      L.grp.rotation.y=-rot[L.g];L.grp.scale.setScalar(.9+.1*ap);
      for(const [m,o] of L.mats){m.opacity=o*ap;m.color.copy(gc[L.g]).lerp(gold,.35*dawn)}
    }
    // метки
    for(let i=0;i<100;i++){
      const g=(i/10)|0,j=i%10,L=layers[g],u=(t-(L.start+j*.032))/.35;
      let sc=0,fl=0;
      if(u>=0){sc=ss(0,.12,u)*(1+.8*Math.max(0,1-u));fl=Math.max(0,1-u*1.6)}
      if(i===99&&u>=0)sc*=1+.5*Math.max(0,1-u*.7);
      const th=L.ph+j*.62832+rot[g],k=1+g*.03;
      dm.position.set(Math.cos(th)*L.r,Y_(g)+.06,Math.sin(th)*L.r);dm.rotation.set(0,-th,0);
      dm.scale.set(.2*sc*k,.12*sc*k,.34*sc*k);dm.updateMatrix();marks.setMatrixAt(i,dm.matrix);
      marks.setColorAt(i,tmp.copy(gc[g]).lerp(gold,.3*dawn).lerp(white,fl*.8));
    }
    marks.instanceMatrix.needsUpdate=true;marks.instanceColor.needsUpdate=true;
    // рассвет: тёплое свечение и клин света, проходящий через механизм
    glow.material.uniforms.uA.value=dawn*.3;
    wedge.material.uniforms.uAng.value=-1.2+PI2*rv;
    wedge.material.uniforms.uA.value=ss(5.6,5.95,t)*(1-ss(7,7.8,t))*.55;
    // медленный отъезд
    const e=ss(0,7.2,t),d=d0+(dF-d0)*e,el=(34+24*e)*Math.PI/180+py*.05,az=px*.12,tz=dF*.04*e;
    camera.position.set(Math.sin(az)*Math.cos(el)*d,Math.sin(el)*d,Math.cos(az)*Math.cos(el)*d+tz);
    camera.lookAt(0,.3,tz);
  }
  function dispose(){marks.dispose()}
  resize(360,640);update(0,0);
  return {scene,camera,update,resize,setPointer,dispose};
}

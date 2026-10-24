export const durationMs=8200;
export const captionAtMs=6200;
export function createAnimation({THREE,reducedMotion=false}){
const C=THREE,W=512,H=819,PI=Math.PI,E=x=>x<=0?0:x>=1?1:x*x*(3-2*x),sg=(t,a,b)=>E((t-a)/(b-a));
let S,cam,cg,ft,key,rim,ring,fogs,dust,fin=0,px=0,py=0,qx=0,qy=0,framing=1,calm=reducedMotion;
let sd=7;const rnd=()=>(sd=sd*16807%2147483647)/2147483647;
const cvs=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
function rr(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
function gold(g,a,b){const l=g.createLinearGradient(0,a,0,b);l.addColorStop(0,'#f8e199');l.addColorStop(.5,'#c8993a');l.addColorStop(1,'#8a6420');return l;}
function frame(g){g.shadowBlur=0;g.strokeStyle=gold(g,0,H);g.lineWidth=10;rr(g,5,5,W-10,H-10,32);g.stroke();g.lineWidth=2;rr(g,24,24,W-48,H-48,18);g.stroke();
 [[40,40],[W-40,40],[40,H-40],[W-40,H-40]].forEach(([x,y])=>{g.fillStyle='#e8c25a';g.beginPath();g.moveTo(x,y-9);g.lineTo(x+9,y);g.lineTo(x,y+9);g.lineTo(x-9,y);g.fill();});}
function tex(c){const t=new C.CanvasTexture(c);t.colorSpace=C.SRGBColorSpace;t.anisotropy=4;return t;}

function drawBack(){
 const c=cvs(W,H),g=c.getContext('2d');rr(g,0,0,W,H,36);g.clip();
 const b=g.createLinearGradient(0,0,0,H);b.addColorStop(0,'#2a1a5e');b.addColorStop(1,'#090720');g.fillStyle=b;g.fillRect(0,0,W,H);
 g.translate(W/2,H/2);g.strokeStyle='rgba(230,190,90,.3)';g.lineWidth=1.2;
 for(let i=0;i<48;i++){g.rotate(PI/24);g.beginPath();g.moveTo(0,70);g.lineTo(0,520);g.stroke();}
 for(let i=1;i<9;i++){g.beginPath();g.arc(0,0,60+i*34,0,7);g.stroke();}
 g.strokeStyle='rgba(240,200,110,.75)';g.lineWidth=2;
 for(let k=0;k<2;k++){g.beginPath();for(let i=0;i<=12;i++){const a=i*5*PI/6+k*.26,x=Math.cos(a)*(250-k*40),y=Math.sin(a)*(250-k*40);i?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();}
 g.fillStyle='#0a0820';g.beginPath();g.arc(0,0,128,0,7);g.fill();g.strokeStyle=gold(g,-130,130);g.lineWidth=6;g.stroke();g.lineWidth=1.5;g.beginPath();g.arc(0,0,114,0,7);g.stroke();
 g.font='700 190px Georgia,serif';g.textAlign='center';g.textBaseline='middle';g.shadowColor='#f0c24f';g.shadowBlur=26;g.fillStyle=gold(g,-100,100);g.fillText('0',0,10);
 g.setTransform(1,0,0,1,0,0);frame(g);return c;
}

const stars=[];for(let i=0;i<70;i++)stars.push([rnd()*W,rnd()*440+30,rnd()*1.6+.4,rnd()]);
const fc=cvs(W,H),fg=fc.getContext('2d');
function mini(g,x,y,r,c){g.save();g.translate(x,y);g.rotate(r);rr(g,-42,-66,84,132,8);g.fillStyle='#14122a';g.fill();g.strokeStyle='#c8993a';g.lineWidth=3;g.stroke();
 g.fillStyle=c;g.globalAlpha=.75;g.beginPath();g.arc(0,0,17,0,7);g.fill();g.globalAlpha=1;g.strokeStyle='#e8c25a';g.lineWidth=1.5;g.beginPath();g.arc(0,0,24,0,7);g.stroke();g.restore();}
function drawFace(p,sh,tm){
 const g=fg,a=E(p);g.save();g.clearRect(0,0,W,H);rr(g,0,0,W,H,36);g.clip();
 let b=g.createLinearGradient(0,0,0,H);b.addColorStop(0,'#090818');b.addColorStop(.55,'#2d2c4a');b.addColorStop(1,'#8f8ca6');g.fillStyle=b;g.fillRect(0,0,W,H);
 stars.forEach(s=>{g.fillStyle='rgba(255,240,200,'+(.35+.5*Math.abs(Math.sin(tm*1.5+s[3]*9)))+')';g.beginPath();g.arc(s[0],s[1],s[2],0,7);g.fill();});
 let m=g.createRadialGradient(410,190,6,410,190,80);m.addColorStop(0,'rgba(255,248,225,.95)');m.addColorStop(.35,'rgba(230,220,255,.35)');m.addColorStop(1,'rgba(230,220,255,0)');g.fillStyle=m;g.fillRect(310,90,200,200);
 let gl=g.createRadialGradient(256,430,10,256,430,270);gl.addColorStop(0,'rgba(210,170,255,'+.6*a+')');gl.addColorStop(1,'rgba(210,170,255,0)');g.fillStyle=gl;g.fillRect(0,160,W,540);
 for(let i=0;i<4;i++){const y=560+i*50+Math.sin(tm+i)*8,f=g.createRadialGradient(256+Math.sin(tm*.6+i)*60,y,10,256,y,300);f.addColorStop(0,'rgba(200,198,225,.35)');f.addColorStop(1,'rgba(200,198,225,0)');g.fillStyle=f;g.fillRect(0,y-80,W,160);}
 [[110,650,-.2,'#3b6fd8'],[183,662,-.1,'#d8812b'],[256,670,0,'#e9e2c8'],[329,662,.1,'#37b27a'],[402,650,.2,'#c04a4a']].forEach(v=>mini(g,...v));
 g.save();g.translate(256,614+(1-a)*38);g.globalAlpha=a;g.fillStyle='#04040a';
 g.beginPath();g.moveTo(-80,0);g.quadraticCurveTo(-64,-112,-34,-178);g.lineTo(34,-178);g.quadraticCurveTo(64,-112,80,0);g.quadraticCurveTo(40,-16,0,-8);g.quadraticCurveTo(-40,-16,-80,0);g.closePath();g.fill();
 g.strokeStyle='rgba(240,205,130,.6)';g.lineWidth=1.6;g.stroke();
 g.beginPath();g.arc(0,-204,26,0,7);g.fill();g.beginPath();g.ellipse(0,-226,46,7,0,0,7);g.fill();
 g.beginPath();g.moveTo(-25,-226);g.lineTo(-21,-292);g.lineTo(21,-292);g.lineTo(25,-226);g.fill();
 g.fillStyle='#c8993a';g.fillRect(-23,-244,46,6);
 g.strokeStyle='#04040a';g.lineWidth=5;g.beginPath();g.moveTo(62,-128);g.lineTo(76,0);g.stroke();g.fillStyle='#e8c25a';g.beginPath();g.arc(62,-130,7,0,7);g.fill();
 if(a>.8){g.fillStyle='rgba(255,230,150,'+(a-.8)*5+')';g.fillRect(-11,-209,6,3);g.fillRect(6,-209,6,3);}
 g.restore();
 g.textAlign='center';g.textBaseline='middle';g.shadowColor='#f0c24f';g.shadowBlur=14;g.fillStyle=gold(g,70,150);g.font='700 84px Georgia,serif';g.fillText('0',256,108);
 g.font='700 40px Georgia,serif';g.fillStyle=gold(g,760,800);['Ш','У','Т'].forEach((c,i)=>g.fillText(c,256+(i-1)*52,782));
 if(sh>0&&sh<1){g.globalCompositeOperation='lighter';const x=-200+sh*900,l=g.createLinearGradient(x-90,0,x+90,0);l.addColorStop(0,'rgba(255,255,255,0)');l.addColorStop(.5,'rgba(255,240,200,.5)');l.addColorStop(1,'rgba(255,255,255,0)');
  g.save();g.translate(256,410);g.rotate(.35);g.translate(-256,-410);g.fillStyle=l;g.fillRect(x-90,-200,180,1200);g.restore();g.globalCompositeOperation='source-over';}
 frame(g);g.restore();if(ft)ft.needsUpdate=true;
}

function build(){
 S=new C.Scene();S.fog=new C.FogExp2(0x0a0818,.04);cam=new C.PerspectiveCamera(42,1,.1,60);
 S.add(new C.AmbientLight(0x9a96c8,.6));const dl=new C.DirectionalLight(0xffffff,.5);dl.position.set(-2,3,5);S.add(dl);
 key=new C.PointLight(0xffd68a,0,18);key.position.set(1.5,1.5,4.5);S.add(key);rim=new C.PointLight(0x9a6bff,2,14);rim.position.set(-2,1,-3);S.add(rim);
 drawFace(0,0,0);ft=tex(fc);const bt=tex(drawBack());
 const pm=t=>new C.MeshStandardMaterial({map:t,roughness:.42,metalness:.12,transparent:true,alphaTest:.05});
 const fr=new C.Mesh(new C.PlaneGeometry(2,3.2),pm(ft));fr.position.z=.031;
 const bk=new C.Mesh(new C.PlaneGeometry(2,3.2),pm(bt));bk.position.z=-.031;bk.rotation.y=PI;
 const sh=new C.Shape(),w=.97,h=1.57,r=.12;sh.moveTo(-w+r,-h);sh.lineTo(w-r,-h);sh.quadraticCurveTo(w,-h,w,-h+r);sh.lineTo(w,h-r);sh.quadraticCurveTo(w,h,w-r,h);sh.lineTo(-w+r,h);sh.quadraticCurveTo(-w,h,-w,h-r);sh.lineTo(-w,-h+r);sh.quadraticCurveTo(-w,-h,-w+r,-h);
 const eg=new C.ExtrudeGeometry(sh,{depth:.06,bevelEnabled:false});eg.translate(0,0,-.03);
 cg=new C.Group();cg.add(fr,bk,new C.Mesh(eg,new C.MeshStandardMaterial({color:0xc8993a,metalness:.9,roughness:.3,emissive:0x2a1a00})));S.add(cg);
 const rc=cvs(512,512),g=rc.getContext('2d');g.translate(256,256);g.strokeStyle='#f0c978';g.lineWidth=3;
 [250,238,170].forEach(v=>{g.beginPath();g.arc(0,0,v,0,7);g.stroke();});
 for(let i=0;i<72;i++){g.rotate(PI/36);g.beginPath();g.moveTo(0,238);g.lineTo(0,i%6?228:208);g.stroke();}
 for(let i=0;i<12;i++){g.rotate(PI/6);g.beginPath();g.moveTo(0,195);g.lineTo(10,215);g.lineTo(-10,215);g.closePath();g.stroke();}
 ring=new C.Mesh(new C.PlaneGeometry(7.4,7.4),new C.MeshBasicMaterial({map:new C.CanvasTexture(rc),transparent:true,opacity:0,blending:C.AdditiveBlending,depthWrite:false,fog:false}));ring.position.z=-.9;S.add(ring);
 const fcn=cvs(128,128),fx=fcn.getContext('2d'),rg=fx.createRadialGradient(64,64,0,64,64,64);rg.addColorStop(0,'rgba(200,195,235,1)');rg.addColorStop(1,'rgba(200,195,235,0)');fx.fillStyle=rg;fx.fillRect(0,0,128,128);
 const fm=new C.CanvasTexture(fcn);fogs=[];
 for(let i=0;i<(calm?8:16);i++){const s=new C.Sprite(new C.SpriteMaterial({map:fm,transparent:true,opacity:.14+rnd()*.1,depthWrite:false,color:i%3?0x8f8cc0:0x6a5aa8}));
  s.position.set((rnd()-.5)*9,(rnd()-.5)*6,-3+rnd()*2.6);const k=4+rnd()*3;s.scale.set(k,k*.7,1);s.userData={x:s.position.x,y:s.position.y,o:s.material.opacity,ph:rnd()*6};S.add(s);fogs.push(s);}
 const N=calm?80:200,pp=new Float32Array(N*3);for(let i=0;i<N;i++){pp[i*3]=rnd()*8-4;pp[i*3+1]=rnd()*6-3;pp[i*3+2]=rnd()*5-3.5;}
 const dg=new C.BufferGeometry();dg.setAttribute('position',new C.BufferAttribute(pp,3));
 dust=new C.Points(dg,new C.PointsMaterial({color:0xffe3a0,size:.045,transparent:true,opacity:.5,blending:C.AdditiveBlending,depthWrite:false}));S.add(dust);
}

function update(t,dt=1/60){
 const rise=sg(t,0,1.5),flip=sg(t,2.4,3.7),set=sg(t,3.7,4.4),p=sg(t,3.4,5.6),pk=Math.sin(PI*flip);
 const smooth=1-Math.pow(.92,dt*60);qx+=(px-qx)*smooth;qy+=(py-qy)*smooth;
 cg.position.set(0,-2.9*(1-rise)+Math.sin(t*1.6)*.06*rise+.35*pk,.9*pk);cg.scale.setScalar(.85+.15*rise);
 cg.rotation.y=PI*(1-flip)+Math.sin(t*1.3)*.12*rise*(1-sg(t,2,2.4))+qx*.4*set;
 cg.rotation.x=-.15*(1-rise)+.12*pk-qy*.3*set;
 if(t>=2.3&&!(t>6.5&&fin)){drawFace(p,sg(t,3.5,4.6),t);if(t>6.5)fin=1;}
 const fl=calm?0:Math.max(0,1-Math.abs(t-3.05)*2);
 ring.material.opacity=.85*sg(t,1.2,2.4)*(1-.35*set)+.8*fl;ring.rotation.z=-t*(.15+.2*p);
 key.intensity=1.2+(calm?1.5:7)*Math.max(0,1-Math.abs(t-3.05)*1.8);rim.intensity=2+3*p;
 fogs.forEach(s=>{const u=s.userData;s.position.x=u.x+Math.sin(t*.25+u.ph)*.6;s.position.y=u.y+Math.cos(t*.2+u.ph)*.3;s.material.opacity=u.o*(1+.8*p);});
 const a=dust.geometry.attributes.position;for(let i=0;i<a.count;i++){let y=a.getY(i)+.24*dt;if(y>3)y=-3;a.setY(i,y);}a.needsUpdate=true;dust.material.opacity=.45+.4*p;
 cam.position.set((calm?0:Math.sin(t*.5)*.25)+qx*.3,-.35*(1-rise)+qy*.2,(7.4-1.8*sg(t,0,6))*framing);cam.lookAt(0,.1,0);
}

build();
return {scene:S,camera:cam,update,resize(w,h){cam.aspect=w/h;framing=Math.max(1,.64/cam.aspect);cam.updateProjectionMatrix()},setPointer(x,y){px=x;py=y}};
}

import * as THREE from 'three';

// Fixed-size merged silhouettes; no additional lights, textures or shadow passes.
export function createFutureTerritory({stage,unit,batch,box,cylinder,material,mobile=false}){
 const root=new THREE.Group();root.name=stage===7?'orbital-station':'neon-megapolis';
 const dark=material('future-dark',0x17263d,{metalness:.6,roughness:.4});
 const metal=material('future-metal',0xa3b7ca,{metalness:.7,roughness:.3});
 const cyan=material('future-cyan',0x2deaff,{emissive:0x2deaff,emissiveIntensity:1.1});
 const pink=material('future-pink',0xf956b2,{emissive:0xf956b2,emissiveIntensity:1});
 const gold=material('future-gold',0xffd66b,{emissive:0xffbd46,emissiveIntensity:.8});
 function build(detailed){
  const b=batch(),y=.82;
  if(stage===6){
   const count=detailed?(mobile?12:24):5;
   b.add(cylinder,dark,0,y,0,unit*3.35,.12,unit*3.35);
   for(let i=0;i<count;i++){
    const angle=i*2.39996,r=unit*(.65+Math.sqrt(i/count)*2.25),x=Math.cos(angle)*r,z=Math.sin(angle)*r;
    const h=unit*(1.6+(i%5)*.52),w=unit*(i%3===0?.48:.34);
    b.add(box,dark,x,y+h/2,z,w,h,w*.85);
    b.add(box,i%2?cyan:pink,x+w*.51,y+h*.55,z,.025,h*.84,w*.6);
    b.add(box,i%2?pink:cyan,x,y+h,z,w*1.1,.045,w);
    if(detailed){
     b.add(box,metal,x,y+h+unit*.18,z,.035,unit*.36,.035);
     b.add(box,gold,x,y+h*.35,z+w*.45,w*.65,unit*.2,.025);
    }
   }
   for(const side of [-1,1]){
    b.add(box,cyan,0,y+.08,side*unit*.4,unit*6.6,.035,unit*.09);
    b.add(box,pink,side*unit*.4,y+.09,0,unit*.09,.035,unit*6.6);
   }
  }else{
   const lift=y+unit*2.2,n=detailed?(mobile?8:16):4;
   b.add(cylinder,dark,0,lift,0,unit*.65,unit*2.7,unit*.65);
   b.add(cylinder,metal,0,lift+unit*1.4,0,unit*.45,.15,unit*.45);
   b.add(cylinder,cyan,0,lift+unit*1.6,0,unit*.17,unit*.4,unit*.17);
   for(let i=0;i<n;i++){
    const a=i*2*Math.PI/n,r=unit*2.6,x=Math.cos(a)*r,z=Math.sin(a)*r;
    b.add(box,metal,x*.5,lift,z*.5,r,.09,.1,-a);
    b.add(box,dark,x,lift,z,unit*.65,unit*.3,unit*.5,-a);
    b.add(box,i%2?cyan:gold,x,lift+unit*.18,z,unit*.45,.045,unit*.36,-a);
   }
   b.add(cylinder,cyan,0,.8,0,unit*.1,unit*1.8,unit*.1);
  }
  const group=b.finish();group.name=detailed?'focused-detail':'overview-silhouette';
  if(stage===7){
   const segments=detailed?(mobile?32:64):20;
   for(let i=0;i<(detailed?2:1);i++){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(unit*(2.35+i*.5),unit*.055,4,segments),i?gold:cyan);
    ring.rotation.x=Math.PI/2+(i?.22:0);ring.position.y=.82+unit*2.2;group.add(ring);
   }
  }
  group.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
  root.add(group);return group;
 }
 const simple=build(false),detail=build(true);detail.visible=false;
 root.userData.simple=simple;root.userData.detail=detail;
 if(stage===6){
  const traffic=new THREE.Group();traffic.name='highway-traffic';
  for(const m of [cyan,pink]){const light=new THREE.Mesh(new THREE.BoxGeometry(unit*.18,.055,unit*.08),m);light.position.y=.96;traffic.add(light);}
  root.add(traffic);root.userData.traffic=traffic;root.userData.unit=unit;
 }
 return root;
}

export function setFutureDetail(root,focused,lowPower){
 root.userData.detail.visible=!!focused&&!lowPower;
 root.userData.simple.visible=!root.userData.detail.visible;
}

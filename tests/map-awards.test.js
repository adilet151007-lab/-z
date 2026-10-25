import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import {disposeAnimationScene} from '../achievement-player.js';
const gradient={addColorStop(){}};
const context=new Proxy({}, {get:(_,key)=>key==='createLinearGradient'||key==='createRadialGradient'?()=>gradient:key==='measureText'?()=>({width:30}):()=>{},set:()=>true});
test('общая карта: книга обновляется без падения; башня без города имеет собственные границы',async()=>{
 const previous=globalThis.document;globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>context})};
 try{
  for(const id of ['scenario-reader','neon-summit','determination','daily-training']){
   const module=await import('../award-'+id+'.js'),animation=module.createAnimation({THREE,reducedMotion:false,lowPower:true,mapMode:true});
   try{
    animation.update(6.8,0);const bounds=animation.mapBounds||new THREE.Box3().setFromObject(animation.scene);
    const scale=12/Math.max(...bounds.getSize(new THREE.Vector3()).toArray(),1);assert.ok(Number.isFinite(scale)&&scale>0);
    const parent=new THREE.Group();parent.scale.setScalar(scale);parent.add(animation.scene);
    for(const time of [0,1,3,5.5,6.8,7.9])assert.doesNotThrow(()=>animation.update(time,1/30),id);
    if(id==='neon-summit'){
     assert.equal(bounds.max.y,160);assert.equal(animation.scene.children.find(o=>o.geometry?.type==='SphereGeometry'&&o.geometry.parameters.radius===900).visible,false);
     assert.ok(scale>.07,'башня не уменьшается до размера сферы неба');
    }
   }finally{animation.dispose?.();disposeAnimationScene(animation.scene)}
  }
 }finally{globalThis.document=previous}
});
test('камера общей карты приближается к региону для каждой одиночной награды',async()=>{
 const source=await readFile(new URL('../scene3d.js',import.meta.url),'utf8');
 assert.ok(source.includes('if(newEffects.length===1){'));assert.ok(source.includes('Math.max(18,14/Math.max(.45,camera.aspect))'));
 assert.ok(!source.includes('animation.scene.fog=null'));
});

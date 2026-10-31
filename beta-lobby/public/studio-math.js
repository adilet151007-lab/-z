export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function worldPoint(clientX,clientY,rect,v){return {x:(clientX-rect.left-v.x)/v.zoom,y:(clientY-rect.top-v.y)/v.zoom};}
export function zoomAt(v,factor,p){const zoom=clamp(v.zoom*factor,.15,3),ratio=zoom/v.zoom;return {zoom,x:p.x-(p.x-v.x)*ratio,y:p.y-(p.y-v.y)*ratio};}
export function rotatedBounds(e){const a=(e.rotation||0)*Math.PI/180,w=Math.abs(e.w*Math.cos(a))+Math.abs(e.h*Math.sin(a)),h=Math.abs(e.w*Math.sin(a))+Math.abs(e.h*Math.cos(a));return {x:e.x+e.w/2-w/2,y:e.y+e.h/2-h/2,w,h};}
export function boundsOf(elements){if(!elements.length)return {x:0,y:0,w:1440,h:900};const b=elements.map(rotatedBounds),x=Math.min(...b.map(e=>e.x)),y=Math.min(...b.map(e=>e.y));return {x,y,w:Math.max(...b.map(e=>e.x+e.w))-x,h:Math.max(...b.map(e=>e.y+e.h))-y};}
export function fitViewport(elements,w,h){const b=boundsOf(elements),zoom=clamp(Math.min((w-100)/Math.max(b.w,1),(h-100)/Math.max(b.h,1)),.15,3);return {zoom,x:(w-b.w*zoom)/2-b.x*zoom,y:(h-b.h*zoom)/2-b.y*zoom};}
export function snapPosition(box,others,zoom=1,grid=true){
 const bounds=rotatedBounds(box),threshold=5/zoom,guides=[],xs=[bounds.x,bounds.x+bounds.w/2,bounds.x+bounds.w],ys=[bounds.y,bounds.y+bounds.h/2,bounds.y+bounds.h];let dx=Infinity,dy=Infinity,gx,gy;
 for(const other of others){const e=rotatedBounds(other);for(const target of [e.x,e.x+e.w/2,e.x+e.w])for(const x of xs)if(Math.abs(target-x)<=threshold&&Math.abs(target-x)<Math.abs(dx)){dx=target-x;gx=target;}for(const target of [e.y,e.y+e.h/2,e.y+e.h])for(const y of ys)if(Math.abs(target-y)<=threshold&&Math.abs(target-y)<Math.abs(dy)){dy=target-y;gy=target;}}
 if(dx===Infinity)dx=grid?Math.round(box.x/20)*20-box.x:0;else guides.push({axis:'x',value:gx,distance:Math.round(dx)});
 if(dy===Infinity)dy=grid?Math.round(box.y/20)*20-box.y:0;else guides.push({axis:'y',value:gy,distance:Math.round(dy)});
 return {x:box.x+dx,y:box.y+dy,guides};
}
export function resizeElement(e,handle,dx,dy){const a=(e.rotation||0)*Math.PI/180,localX=dx*Math.cos(a)+dy*Math.sin(a),localY=-dx*Math.sin(a)+dy*Math.cos(a);let w=e.w,h=e.h;if(handle.includes('e'))w=Math.max(80,e.w+localX);if(handle.includes('w'))w=Math.max(80,e.w-localX);if(handle.includes('s'))h=Math.max(80,e.h+localY);if(handle.includes('n'))h=Math.max(80,e.h-localY);const sx=handle.includes('w')?(e.w-w)/2:handle.includes('e')?(w-e.w)/2:0,sy=handle.includes('n')?(e.h-h)/2:handle.includes('s')?(h-e.h)/2:0;return {...e,x:e.x+(e.w-w)/2+sx*Math.cos(a)-sy*Math.sin(a),y:e.y+(e.h-h)/2+sx*Math.sin(a)+sy*Math.cos(a),w,h};}
export function isEditableTarget(target){
 const node=target?.nodeType===3?target.parentElement:target;
 return !!node&&(node.isContentEditable===true||!!node.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'));
}
export function localPoint(element,x,y){
 const angle=(element.rotation||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),dx=x-element.w/2,dy=y-element.h/2;
 return {x:element.x+element.w/2+dx*c-dy*s,y:element.y+element.h/2+dx*s+dy*c};
}
export function connectorAnchor(element,condition='next',input=false){
 const offset=input?0:condition==='correct'?34:condition==='wrong'?68:0;
 return localPoint(element,input?0:element.w,element.h/2+offset);
}
export function bezierPath(a,b,condition='next',freeEnd=false){
 const start=connectorAnchor(a,condition),end=freeEnd?b:connectorAnchor(b,'next',true),angle=(a.rotation||0)*Math.PI/180,endAngle=(b.rotation||0)*Math.PI/180;
 const distance=Math.max(70,Math.hypot(end.x-start.x,end.y-start.y)*.5);
 return `M ${start.x} ${start.y} C ${start.x+Math.cos(angle)*distance} ${start.y+Math.sin(angle)*distance}, ${end.x-Math.cos(endAngle)*distance} ${end.y-Math.sin(endAngle)*distance}, ${end.x} ${end.y}`;
}
export function minimapTransform(elements){
 const bounds=boundsOf(elements),scale=Math.min(200/Math.max(bounds.w,1),120/Math.max(bounds.h,1));
 return {bounds,scale};
}
export function minimapPoint(clientX,clientY,rect,transform){
 return {x:transform.bounds.x+((clientX-rect.left)*220/rect.width-10)/transform.scale,y:transform.bounds.y+((clientY-rect.top)*140/rect.height-10)/transform.scale};
}
export function rotationFromDrag(element,start,current){
 const cx=element.x+element.w/2,cy=element.y+element.h/2;
 const delta=(Math.atan2(current.y-cy,current.x-cx)-Math.atan2(start.y-cy,start.x-cx))*180/Math.PI;
 return ((element.rotation+delta+180)%360+360)%360-180;
}

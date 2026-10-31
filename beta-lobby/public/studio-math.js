export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function worldPoint(clientX,clientY,rect,v){return {x:(clientX-rect.left-v.x)/v.zoom,y:(clientY-rect.top-v.y)/v.zoom};}
export function zoomAt(v,factor,p){const zoom=clamp(v.zoom*factor,.15,3),ratio=zoom/v.zoom;return {zoom,x:p.x-(p.x-v.x)*ratio,y:p.y-(p.y-v.y)*ratio};}
export function rotatedBounds(e){const a=e.rotation*Math.PI/180,w=Math.abs(e.w*Math.cos(a))+Math.abs(e.h*Math.sin(a)),h=Math.abs(e.w*Math.sin(a))+Math.abs(e.h*Math.cos(a));return {x:e.x+e.w/2-w/2,y:e.y+e.h/2-h/2,w,h};}
export function boundsOf(elements){if(!elements.length)return {x:0,y:0,w:1440,h:900};const b=elements.map(rotatedBounds),x=Math.min(...b.map(e=>e.x)),y=Math.min(...b.map(e=>e.y));return {x,y,w:Math.max(...b.map(e=>e.x+e.w))-x,h:Math.max(...b.map(e=>e.y+e.h))-y};}
export function fitViewport(elements,w,h){const b=boundsOf(elements),zoom=clamp(Math.min((w-100)/Math.max(b.w,1),(h-100)/Math.max(b.h,1)),.15,3);return {zoom,x:(w-b.w*zoom)/2-b.x*zoom,y:(h-b.h*zoom)/2-b.y*zoom};}
export function snapPosition(box,others,zoom=1,grid=true){
 const threshold=5/zoom,guides=[],xs=[box.x,box.x+box.w/2,box.x+box.w],ys=[box.y,box.y+box.h/2,box.y+box.h];let dx=Infinity,dy=Infinity,gx,gy;
 for(const e of others){for(const target of [e.x,e.x+e.w/2,e.x+e.w])for(const x of xs)if(Math.abs(target-x)<=threshold&&Math.abs(target-x)<Math.abs(dx)){dx=target-x;gx=target;}for(const target of [e.y,e.y+e.h/2,e.y+e.h])for(const y of ys)if(Math.abs(target-y)<=threshold&&Math.abs(target-y)<Math.abs(dy)){dy=target-y;gy=target;}}
 if(dx===Infinity)dx=grid?Math.round(box.x/20)*20-box.x:0;else guides.push({axis:'x',value:gx,distance:Math.round(dx)});
 if(dy===Infinity)dy=grid?Math.round(box.y/20)*20-box.y:0;else guides.push({axis:'y',value:gy,distance:Math.round(dy)});
 return {x:box.x+dx,y:box.y+dy,guides};
}
export function resizeElement(e,handle,dx,dy){const a=e.rotation*Math.PI/180,localX=dx*Math.cos(a)+dy*Math.sin(a),localY=-dx*Math.sin(a)+dy*Math.cos(a);let w=e.w,h=e.h;if(handle.includes('e'))w=Math.max(80,e.w+localX);if(handle.includes('w'))w=Math.max(80,e.w-localX);if(handle.includes('s'))h=Math.max(80,e.h+localY);if(handle.includes('n'))h=Math.max(80,e.h-localY);const sx=handle.includes('w')?(e.w-w)/2:handle.includes('e')?(w-e.w)/2:0,sy=handle.includes('n')?(e.h-h)/2:handle.includes('s')?(h-e.h)/2:0;return {...e,x:e.x+(e.w-w)/2+sx*Math.cos(a)-sy*Math.sin(a),y:e.y+(e.h-h)/2+sx*Math.sin(a)+sy*Math.cos(a),w,h};}
export function bezierPath(a,b){const x=a.x+a.w,y=a.y+a.h/2,xx=b.x,yy=b.y+b.h/2,d=Math.max(70,Math.abs(xx-x)*.5);return `M ${x} ${y} C ${x+d} ${y}, ${xx-d} ${yy}, ${xx} ${yy}`;}

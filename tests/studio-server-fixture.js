import {once} from 'node:events';
import {io} from 'socket.io-client';
import {createGameServer} from '../server.js';
export async function standaloneStudioFixture(){
 const credentials={teacherPassword:'studio-test-password',sessionSecret:'studio-test-secret-more-than-thirty-two',creatorCodes:{adilet:'A'.repeat(26),ernur:'E'.repeat(26)}};
 let snapshot=null;const store={kind:'memory',load:async()=>structuredClone(snapshot),save:async data=>{snapshot=structuredClone(data);},close:async()=>{}};
 const server=await createGameServer({...credentials,store,secureCookies:false,requireConsent:false}),port=await server.listen(0,'127.0.0.1'),origin='http://127.0.0.1:'+port,sockets=[];
 const command=(socket,name,data={})=>new Promise((resolve,reject)=>socket.timeout(10000).emit(name,data,(error,value)=>error?reject(error):resolve(value)));
 async function connect(surface='student'){
  const response=await fetch(origin+'/student.html');await response.arrayBuffer();const jar={cookie:response.headers.getSetCookie().map(h=>h.split(';')[0]).join('; ')};
  const socket=io(origin,{autoConnect:false,reconnection:false,transports:['websocket'],auth:{surface,activityVersion:1},extraHeaders:{Cookie:jar.cookie}});socket.jar=jar;socket.surface=surface;sockets.push(socket);socket.on('session:ready',data=>{socket.proof=data.proof;});socket.on('state',state=>{socket.latest=state;});const ready=once(socket,'state');socket.connect();await ready;return socket;
 }
 async function post(socket,path,data){return fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json','X-CQ-Client':'1','X-CQ-Socket':socket.id,'X-CQ-Proof':socket.proof,'X-CQ-Surface':socket.surface,Origin:origin,Cookie:socket.jar.cookie},body:JSON.stringify(data)});}
 async function bind(socket,role,token){const response=await post(socket,'/api/session',{role,token});if(!response.ok)throw Error('Synthetic session binding failed');for(const h of response.headers.getSetCookie()){const entry=h.split(';')[0],name=entry.split('=')[0];socket.jar.cookie=socket.jar.cookie.split('; ').filter(v=>!v.startsWith(name+'=')).concat(entry).join('; ');}}
 const owner=await connect(),joined=await command(owner,'joinTeam',{regionId:'jetisu',name:credentials.creatorCodes.adilet});if(!joined.ok)throw Error(joined.error);await bind(owner,'player',joined.playerToken);
 return {server,origin,owner,command,post,connect,async teacher(){const socket=await connect('teacher'),login=await command(socket,'teacherLogin',{password:credentials.teacherPassword});await bind(socket,'teacher',login.teacherToken);return socket;},async close(){for(const s of sockets)s.disconnect();await server.close();}};
}

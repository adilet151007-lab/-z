import {request} from 'node:http';
import {createGameServer} from '../server.js';

export class RoomRuntime {
 constructor(platform,identity,{secureCookies=false,trustProxy=false}={}){this.platform=platform;this.identity=identity;this.options={secureCookies,trustProxy};this.servers=new Map();this.closing=false;}
 async get(id){
  if(this.closing)throw new Error('Service stopping');
  const room=await this.platform.room(id);if(!room||room.closedAt)return null;
  if(!this.servers.has(id)){const promise=this.start(room);this.servers.set(id,promise);promise.catch(()=>this.servers.delete(id));}
  return this.servers.get(id);
 }
 async start(room){
  const platform=this.platform,lease=await platform.store.acquireRoom(room.id),base=platform.store.roomStore(room.id);let previous;try{previous=await base.load();}catch(e){await lease.release();throw e;}let recorded=null;
  const store={...base,save:async state=>{lease.assert();await base.save(state);if(state.match?.finishedAt&&recorded!==state.match.id){try{await platform.record(room.id,state);recorded=state.match.id;}catch{console.error('Room results pending; saved game will retry.');}}}};
  let server;try{server=await createGameServer({store,teacherPassword:room.secret,sessionSecret:room.secret,creatorCodes:{},localAdminCodeHash:undefined,cookieNamespace:room.id,resourcePrefix:'/rooms/'+room.id,secureCookies:this.options.secureCookies,trustProxy:this.options.trustProxy,requireAdmission:true,allowDemoQuestions:false,authorizeTeacher:async req=>{const a=this.identity(req);return !!a&&platform.canManage(a.id,room.id);},onPlayerJoined:async(req,player)=>{const a=this.identity(req);if(a){await platform.authenticate(a);await platform.bind(room.id,player.pid,a.id,server.game.state.regions.flatMap(t=>t.members.map(m=>m.pid)));}}});
  }catch(e){await lease.release();throw e;}
  try{
   if(!await base.load()){throw new Error('Room persistence unavailable');}
   if(!previous){server.game.state.settings.mode=room.mode;server.game.state.branding.subject=room.subject;server.game.state.branding.subjects=[room.subject];server.game.state.branding.title=room.name;await base.save(server.game.state);}
   const port=await server.listen(0,'127.0.0.1');
   if(server.game.state.match?.finishedAt)await platform.record(room.id,server.game.state);
   return {server,port,lease};
  }catch(e){await server.close();await lease.release();throw e;}
 }
 async stop(id){const promise=this.servers.get(id);if(promise){this.servers.delete(id);const runtime=await promise;try{await runtime.server.close();}finally{await runtime.lease.release();}}}
 async close(){this.closing=true;await Promise.allSettled([...this.servers.keys()].map(id=>this.stop(id)));}
 async handle(req,res){
  const id=req.params.roomId;
  if(!/^[a-f0-9-]{36}$/.test(id))return res.sendStatus(404);
  const runtime=await this.get(id);if(!runtime)return res.status(410).type('text').send('Комната закрыта или не существует. Вернитесь в лобби.');
  const upstream=request({host:'127.0.0.1',port:runtime.port,path:req.url||'/',method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
  upstream.setTimeout(30000,()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent)res.status(503).type('text').send('Комната подключается. Повторите попытку.');else res.destroy();});res.on('close',()=>upstream.destroy());req.pipe(upstream);
 }
 async upgrade(req,socket,head){
  const match=req.url.match(/^\/rooms\/([a-f0-9-]{36})(\/socket\.io\/(?:\?.*)?)$/);
  if(!match){socket.destroy();return;}
  let runtime;try{runtime=await this.get(match[1]);}catch{socket.destroy();return;}if(!runtime){socket.destroy();return;}
  const upstream=request({host:'127.0.0.1',port:runtime.port,path:match[2],headers:req.headers});
  upstream.setTimeout(30000,()=>upstream.destroy());
  upstream.on('upgrade',(response,remote,remoteHead)=>{upstream.setTimeout(0);socket.write('HTTP/1.1 '+response.statusCode+' Switching Protocols\r\n'+Object.entries(response.headers).map(([k,v])=>k+': '+v).join('\r\n')+'\r\n\r\n');if(remoteHead.length)socket.write(remoteHead);if(head.length)remote.write(head);socket.pipe(remote);remote.pipe(socket);socket.on('error',()=>remote.destroy());remote.on('error',()=>socket.destroy());socket.on('close',()=>remote.destroy());remote.on('close',()=>socket.destroy());});
  upstream.on('response',()=>{upstream.destroy();socket.destroy();});upstream.on('error',()=>socket.destroy());socket.on('close',()=>upstream.destroy());upstream.end();
 }
}

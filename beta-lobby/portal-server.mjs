import 'dotenv/config';
import express from 'express';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createLobbyRouter} from './account-server.mjs';
import {Platform} from './platform-domain.mjs';
import {platformAPI} from './platform-api.mjs';
import {RoomRuntime} from './room-runtime.mjs';
import {openPlatformStore} from './platform-store.mjs';
import {GAME_ORIGIN} from './public/lobby-config.js';

export function createPortalServer(options={}){
 const app=express();app.disable('x-powered-by');let closing=false;
 const publicOrigin=options.publicOrigin;
 const secure=new URL(publicOrigin).protocol==='https:';
 app.use((_req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), display-capture=()');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'");
  if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
  next();
 });
 app.get('/health',(_req,res)=>res.status(closing?503:200).json({ok:!closing,service:'beta-lobby',googleEnabled:!!(options.clientId&&options.clientSecret)}));
 const platform=options.platformStore?new Platform(options.platformStore,{ownerCode:options.ownerCode}):null;
 const lobby=createLobbyRouter({...options,gameOrigin:GAME_ORIGIN,onAuthenticated:platform?user=>platform.authenticate(user):undefined});
 const runtime=platform?new RoomRuntime(platform,lobby.account,{secureCookies:secure,trustProxy:options.trustProxy}):null;
 app.use('/api/platform',platformAPI({platform,account:lobby.account,origin:publicOrigin,runtime,trustProxy:options.trustProxy}));
 if(runtime)app.use('/rooms/:roomId',(req,res,next)=>runtime.handle(req,res).catch(next));
 app.get('/creators.html',async(req,res)=>{const a=lobby.account(req);if(!a||!platform)return res.status(403).type('text').send('Войдите аккаунтом создателя через лобби.');try{await platform.requireCreator(a.id);}catch{return res.status(403).type('text').send('Доступ только для создателей.');}return res.sendFile(new URL('./public/creators.html',import.meta.url).pathname);});
 app.use(lobby);
 for(const page of ['student.html','teacher.html','privacy.html'])app.get('/'+page,(_req,res)=>res.redirect(303,GAME_ORIGIN+'/'+page));
 app.use((_req,res)=>res.status(404).type('text').send('Not found'));
 app.use((_error,_req,res,_next)=>res.status(500).type('text').send('The lobby could not complete this request.'));
 const httpServer=createServer(app);
 if(runtime)httpServer.on('upgrade',(req,socket,head)=>runtime.upgrade(req,socket,head));
 return {app,httpServer,platform,runtime,
  async listen(port=Number(process.env.PORT)||3000,host='0.0.0.0'){await new Promise((resolve,reject)=>{httpServer.once('error',reject);httpServer.listen(port,host,resolve);});return httpServer.address().port;},
  async close(){closing=true;if(runtime)await runtime.close();if(options.platformStore)await options.platformStore.close();await new Promise((resolve,reject)=>httpServer.close(error=>error?reject(error):resolve()));}
 };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const port=Number(process.env.PORT)||3000;
 const publicOrigin=process.env.LOBBY_PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL||'http://localhost:'+port;
 const platformStore=await openPlatformStore({databaseUrl:process.env.LOBBY_DATABASE_URL,stateDirectory:process.env.LOBBY_PLATFORM_DIRECTORY,render:process.env.RENDER==='true'});
 const server=createPortalServer({platformStore,ownerCode:process.env.LOBBY_OWNER_CODE,publicOrigin,sessionSecret:process.env.LOBBY_SESSION_SECRET,clientId:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET,trustProxy:process.env.RENDER==='true'});
 await server.listen(port);console.log('Beta account lobby is ready.');
 let stopping=false;
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(stopping)return;stopping=true;const force=setTimeout(()=>process.exit(1),20000);force.unref();try{await server.close();clearTimeout(force);process.exitCode=0;}catch{process.exitCode=1;}});
}

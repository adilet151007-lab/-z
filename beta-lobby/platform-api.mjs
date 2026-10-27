import express from 'express';
import {PlatformError} from './platform-domain.mjs';
import {clientAddress,RequestLimiter} from '../security-controls.js';
export function platformAPI({platform,account,origin,runtime,trustProxy=false}){
 const router=express.Router(),limiter=new RequestLimiter();
 router.use((req,res,next)=>{res.set('Cache-Control','no-store');try{limiter.take(clientAddress(req,trustProxy),120,10000);}catch{return res.status(429).json({error:'Слишком много запросов. Повторите через несколько секунд.'});}if(req.method!=='GET'&&(req.headers.origin!==origin||req.headers['x-cq-lobby']!=='1'))return res.status(403).json({error:'Недопустимый источник запроса.'});next();});
 router.get('/status',(_req,res)=>res.json({available:!!platform,storage:platform?.store.kind||null}));
 router.use((req,res,next)=>platform?next():res.status(503).json({error:'Постоянная база платформы ещё не подключена. Обычная игра и Google-вход доступны.'}));
 router.use(express.json({limit:'8kb',inflate:false}));
 const user=req=>{const a=account(req);if(!a)throw new PlatformError('Войдите через Google.',401);return a;};
 router.get('/rooms',async(req,res)=>{const id=account(req)?.id;const rooms=await platform.rooms(id);const rows=await Promise.all(rooms.map(async room=>{const pending=runtime.servers.get(room.id);if(!pending){const state=await platform.store.roomStore(room.id).load();return {...room,participants:state?.regions.reduce((n,t)=>n+t.members.length,0)||0,phase:room.closedAt?'closed':state?.phase||'lobby'};}const {server}=await pending;return {...room,participants:server.game.state.regions.reduce((n,t)=>n+t.members.length,0),phase:server.game.state.phase};}));res.json({rooms:rows});});
 router.get('/profile',async(req,res)=>{const a=user(req);await platform.authenticate(a);res.json(await platform.profile(a.id));});
 router.post('/redeem',async(req,res)=>{const a=user(req);limiter.take('redeem:'+a.id,8,60000);await platform.authenticate(a);res.json({account:await platform.redeem(a.id,req.body?.code)});});
 router.post('/invitations',async(req,res)=>res.json(await platform.invite(user(req).id)));
 router.get('/accounts',async(req,res)=>res.json({accounts:await platform.accounts(user(req).id)}));
 router.post('/accounts/role',async(req,res)=>res.json({account:await platform.setTeacher(user(req).id,req.body?.accountId,req.body?.enabled)}));
 router.post('/rooms',async(req,res)=>{const a=user(req);const room=await platform.createRoom(a.id,req.body||{});try{await runtime.get(room.id);}catch{await platform.closeRoom(a.id,room.id);throw new PlatformError('Комната не запустилась. Данные сохранены; попробуйте снова.',503);}res.status(201).json({room});});
 router.post('/rooms/:id/close',async(req,res)=>{const room=await platform.closeRoom(user(req).id,req.params.id);await runtime.stop(room.id);res.json({room});});
 router.use((error,_req,res,_next)=>res.status(error.status||400).json({error:error instanceof PlatformError?error.message:error.type==='entity.too.large'?'Запрос слишком большой.':'Не удалось выполнить действие. Повторите попытку.'}));
 return router;
}

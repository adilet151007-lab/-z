import express from 'express';
import {PlatformError} from './platform-domain.mjs';
import {clientAddress,RequestLimiter} from '../security-controls.js';
export function platformAPI({platform,account,origin,runtime,trustProxy=false}){
 const router=express.Router(),limiter=new RequestLimiter();
 router.use((req,res,next)=>{res.set('Cache-Control','no-store');try{limiter.take(clientAddress(req,trustProxy),120,10000);}catch{return res.status(429).json({error:'Слишком много запросов. Повторите через несколько секунд.'});}if(req.method!=='GET'&&(req.headers.origin!==origin||req.headers['x-cq-lobby']!=='1'))return res.status(403).json({error:'Недопустимый источник запроса.'});next();});
 router.get('/status',(_req,res)=>res.json({available:!!platform,storage:platform?.store.kind||null}));
 router.use((req,res,next)=>platform?next():res.status(503).json({error:'Постоянная база платформы ещё не подключена. Обычная игра и Google-вход доступны.'}));
 router.use(express.json({limit:'128kb',inflate:false}));
 const user=req=>{const a=account(req);if(!a)throw new PlatformError('Войдите через Google.',401);return a;};
 router.get('/rooms',async(req,res)=>{const id=account(req)?.id;const rooms=await platform.rooms(id);const rows=await Promise.all(rooms.map(async room=>{const pending=runtime.servers.get(room.id);if(!pending){const state=await platform.store.roomStore(room.id).load();return {...room,participants:state?.regions.reduce((n,t)=>n+t.members.length,0)||0,phase:room.closedAt?'closed':state?.phase||'lobby'};}const {server}=await pending;return {...room,participants:server.game.state.regions.reduce((n,t)=>n+t.members.length,0),phase:server.game.state.phase};}));res.json({rooms:rows});});
 router.get('/profile',async(req,res)=>{const a=user(req);await platform.authenticate(a);res.json(await platform.profile(a.id));});
 router.post('/redeem',async(req,res)=>{const a=user(req);limiter.take('redeem:'+a.id,8,60000);await platform.authenticate(a);res.json({account:await platform.redeem(a.id,req.body?.code)});});
 router.post('/invitations',async(req,res)=>res.json(await platform.invite(user(req).id,req.body?.kind||'teacher')));
 router.get('/accounts',async(req,res)=>res.json({accounts:await platform.accounts(user(req).id)}));
 router.post('/accounts/role',async(req,res)=>res.json({account:await platform.setTeacher(user(req).id,req.body?.accountId,req.body?.enabled)}));
 router.post('/rooms',async(req,res)=>{const a=user(req);const room=await platform.createRoom(a.id,req.body||{});try{await runtime.get(room.id);}catch{await platform.closeRoom(a.id,room.id);throw new PlatformError('Комната не запустилась. Данные сохранены; попробуйте снова.',503);}res.status(201).json({room});});
 router.post('/rooms/:id/close',async(req,res)=>{const room=await platform.closeRoom(user(req).id,req.params.id);await runtime.stop(room.id);res.json({room});});
 router.use('/creator',async(req,_res,next)=>{try{req.platformCreator=await platform.requireCreator(user(req).id);next();}catch(e){next(e);}});
 router.get('/creator/overview',async(req,res)=>res.json({account:req.platformCreator,accounts:await platform.accounts(req.platformCreator.id),rooms:await platform.rooms(req.platformCreator.id)}));
 router.post('/creator/accounts/block',async(req,res)=>{const target=req.body?.accountId;const a=await platform.setBlocked(req.platformCreator.id,target,req.body?.blocked);if(req.body.blocked){const bindings=await platform.store.read(s=>s.bindings);for(const [id,pending]of runtime.servers){const {server}=await pending;for(const team of server.game.state.regions)for(const m of [...team.members])if(bindings[id+':'+m.pid]===target)await server.platformControl(req.platformCreator.id,'kick',{pid:m.pid});}}res.json({account:a});});
 router.get('/creator/rooms/:id',async(req,res)=>{const r=await runtime.get(req.params.id);if(!r)throw new PlatformError('Комната закрыта.',410);const s=r.server.game.state;res.json({phase:s.phase,mode:s.settings.mode,round:s.round?{questionId:s.round.questionId,deadline:s.round.deadline,paused:s.round.paused,resolved:s.round.resolved}:null,questions:s.questions,teams:s.regions.map(t=>({id:t.id,name:t.name,points:t.points,economy:t.economy,capacity:t.capacity,members:t.members.map(m=>({pid:m.pid,name:m.name,creatorId:m.creatorId||null,capital:m.capital||0}))}))});});
 router.post('/creator/rooms/:id/action',async(req,res)=>{const r=await runtime.get(req.params.id);if(!r)throw new PlatformError('Комната закрыта.',410);const result=await r.server.platformControl(req.platformCreator.id,req.body?.action,req.body?.data);res.json({ok:true,result});});
 router.use((error,_req,res,_next)=>res.status(error.status||400).json({error:error instanceof PlatformError||['INVALID_ACTION','PROTECTED_SESSION','REVISION_CONFLICT'].includes(error.code)?error.message:error.type==='entity.too.large'?'Запрос слишком большой.':'Не удалось выполнить действие. Повторите попытку.'}));
 return router;
}

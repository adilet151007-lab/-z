import express from 'express';
import {readFile} from 'node:fs/promises';
import {PlatformError} from './platform-domain.mjs';
import {validateTemplate} from './platform-authoring.mjs';
const engineFiles=['student.html','student.js','teacher.html','teacher.js','shared-engine.js','scene3d.js','styles.css','game-config.js','game-logic.js','server.js'];
export function authoringAPI({platform,runtime}){
 const router=express.Router();
 router.get('/templates',async(req,res)=>res.json({templates:await platform.templates(req.platformCreator.id)}));
 router.get('/templates/:id',async(req,res)=>res.json(await platform.template(req.platformCreator.id,req.params.id)));
 router.post('/templates/save',async(req,res)=>{const result=await platform.saveTemplate(req.platformCreator.id,req.body.id||null,req.body.value,req.body.expectedVersion);await runtime.refreshTemplate(result.id);res.json(result);});
 router.post('/templates/:id/restore',async(req,res)=>{const result=await platform.restoreTemplate(req.platformCreator.id,req.params.id,req.body.version);await runtime.refreshTemplate(result.id);res.json(result);});
 router.post('/accounts/stats',async(req,res)=>res.json(await platform.setStats(req.platformCreator.id,req.body.accountId,req.body.totals,req.body.statsRevision,req.body.reason)));
 router.post('/rooms/create',async(req,res)=>{
  const id=req.platformCreator.id,raw=req.body,template=raw.templateId?await platform.template(id,raw.templateId):validateTemplate({name:raw.name,subject:raw.subject,type:raw.type||'strategy',config:raw.config||{},questions:[]});
  const room=await platform.createRoom(id,{name:raw.name||template.name,subject:template.subject,mode:template.config.mode});
  try{await platform.setRoomConfiguration(id,room.id,template);if(raw.templateId)await platform.attachTemplate(id,room.id,raw.templateId);const r=await runtime.get(room.id);await r.server.platformControl(id,'configure',{...template,name:room.name,replaceQuestions:true});const invitation=await platform.roomInvite(id,room.id);res.status(201).json({room,invitation});}catch(e){await runtime.stop(room.id).catch(()=>{});await platform.closeRoom(id,room.id);throw e;}
 });
 router.post('/rooms/:id/invite',async(req,res)=>res.json(await platform.roomInvite(req.platformCreator.id,req.params.id)));
 router.post('/rooms/:id/revoke-managers',async(req,res)=>res.json({room:await platform.revokeManagers(req.platformCreator.id,req.params.id)}));
 router.post('/rooms/:id/delete',async(req,res)=>{if(req.body.confirm!==req.params.id)throw new PlatformError('Подтвердите удаление комнаты.');await platform.requireCreator(req.platformCreator.id);const room=await platform.room(req.params.id);if(!room)throw new PlatformError('Комната не найдена.',404);await platform.closeRoom(req.platformCreator.id,room.id);await runtime.stop(room.id);await platform.store.roomStore(room.id).save(null);await platform.store.roomStore(room.id).saveChat(null);res.json(await platform.deleteRoom(req.platformCreator.id,room.id));runtime.summaries.delete(room.id);});
 router.post('/rooms/:id/reopen',async(req,res)=>res.json({room:await platform.reopenRoom(req.platformCreator.id,req.params.id)}));
 router.post('/rooms/:id/sleep',async(req,res)=>{const r=await platform.room(req.params.id);if(!r)throw new PlatformError('Комната не найдена.',404);await runtime.stop(r.id);res.json({ok:true});});
 router.post('/rooms/:id/restart',async(req,res)=>{const room=await platform.room(req.params.id);if(!room||room.closedAt)throw new PlatformError('Комната закрыта.',410);await runtime.stop(room.id);await runtime.get(room.id);res.json({ok:true});});
 router.post('/rooms/:id/configuration',async(req,res)=>{const config=await platform.setRoomConfiguration(req.platformCreator.id,req.params.id,req.body);await runtime.refreshConfiguration(req.params.id);res.json(config);});
 router.post('/rooms/:id/template',async(req,res)=>{const template=await platform.template(req.platformCreator.id,req.body.templateId),r=await runtime.get(req.params.id);if(!r)throw new PlatformError('Комната закрыта.',410);await r.server.platformControl(req.platformCreator.id,'configure',{...template,replaceQuestions:true});await platform.attachTemplate(req.platformCreator.id,req.params.id,template.id);await platform.setRoomConfiguration(req.platformCreator.id,req.params.id,template);await runtime.refreshConfiguration(req.params.id);await runtime.refreshTemplate(template.id);res.json({ok:true});});
 router.get('/source',async(_req,res)=>res.json({files:engineFiles,editable:'Клиентские CSS/JavaScript-расширения в шаблонах. Серверные файлы изменяются через Git и деплой.'}));
 router.get('/source/:file',async(req,res)=>{if(!engineFiles.includes(req.params.file))throw new PlatformError('Файл недоступен.',404);res.json({file:req.params.file,content:await readFile(new URL('../'+req.params.file,import.meta.url),'utf8'),readOnly:true});});
 return router;
}

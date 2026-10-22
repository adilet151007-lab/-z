import { randomUUID } from 'node:crypto';
import { GameError } from './game-logic.js';
import { CREATOR_NAMES, isCreatorTeam } from './game-config.js';

export const CHAT_HISTORY_LIMIT=80, CHAT_TOTAL_LIMIT=500, CHAT_TEXT_LIMIT=600;
const validRoom=room=>typeof room==='string'&&/^(global|team:[\w-]{1,80}|support:[\w-]{1,80})$/.test(room);
const ensure=(condition,message,code='CHAT_INVALID')=>{if(!condition)throw new GameError(message,code)};
export function chatIdentity(game,actor){
 const player=actor.playerHash?game.findPlayer(actor.playerHash):null;
 if(actor.role==='teacher')return {id:'teacher',name:'Преподаватель',role:'teacher',teamId:null,teamName:''};
 if(!player)return null;
 const team=game.region(player.regionId),creator=!!game.creatorFor(actor.playerHash);
 return {id:player.pid,name:player.name,role:creator?'creator':'student',teamId:team.id,teamName:team.name};
}
export class ChatEngine{
 constructor(saved=null,clock=()=>Date.now()){
  this.now=clock;
  if(!saved){this.state={version:1,sequence:0,messages:[]};return}
  ensure(saved.version===1&&Number.isSafeInteger(saved.sequence)&&saved.sequence>=0&&Array.isArray(saved.messages)&&saved.messages.length<=CHAT_TOTAL_LIMIT,'Повреждено сохранение чата. Данные не были сброшены.');
  const ids=new Set();
  for(const m of saved.messages){
   ensure(m&&typeof m.id==='string'&&!ids.has(m.id)&&validRoom(m.room)&&Number.isSafeInteger(m.sequence)&&m.sequence>0&&m.sequence<=saved.sequence&&Number.isFinite(m.at)&&typeof m.text==='string'&&m.text.length<=CHAT_TEXT_LIMIT&&typeof m.clientId==='string'&&m.author&&typeof m.author.id==='string'&&typeof m.author.name==='string'&&['student','teacher','creator'].includes(m.author.role),'Повреждено сообщение в сохранении чата.');ids.add(m.id);
  }
  this.state=structuredClone(saved);
 }
 require(identity){ensure(identity,'Войдите в игру, чтобы пользоваться чатом.','FORBIDDEN')}
 canRead(game,identity,room){
  if(!identity||!validRoom(room))return false;
  if(room==='global')return true;
  const [type,id]=room.split(':');
  if(type==='team'){
   const team=game.state.regions.find(t=>t.id===id);if(!team)return false;
   if(isCreatorTeam(team))return identity.role==='creator';
   return identity.role==='creator'||identity.role==='teacher'||identity.teamId===id;
  }
  if(type==='support'){
   if(identity.role==='student')return identity.id===id;
   if(identity.role!=='creator')return false;
   return game.state.regions.some(t=>!isCreatorTeam(t)&&t.members.some(m=>m.pid===id))||this.state.messages.some(m=>m.room===room);
  }
  return false;
 }
 requireRoom(game,identity,room){this.require(identity);ensure(this.canRead(game,identity,room),'Этот чат вам недоступен.','FORBIDDEN')}
 canSend(game,identity,room){
  if(!this.canRead(game,identity,room))return false;
  if(room.startsWith('support:'))return game.state.regions.some(t=>!isCreatorTeam(t)&&t.members.some(m=>m.pid===room.slice(8)));
  return true;
 }
 descriptor(room,title){const messages=this.state.messages.filter(m=>m.room===room);return {id:room,title,lastSequence:messages.reduce((n,m)=>Math.max(n,m.updatedSequence||m.sequence),0),count:messages.filter(m=>!m.deleted).length}}
 metadata(game,identity,online=new Set()){
  if(!identity)return {enabled:false,identity:null,rooms:[],inbox:[],creators:[],historyLimit:CHAT_HISTORY_LIMIT};
  const rooms=[this.descriptor('global','Общий чат')];
  for(const team of game.state.regions){const id='team:'+team.id;if(this.canRead(game,identity,id))rooms.push({...this.descriptor(id,team.name),kind:'team',own:identity.teamId===team.id})}
  if(identity.role==='student')rooms.push({...this.descriptor('support:'+identity.id,'Ернур и Адилет'),kind:'support'});
  const inbox=[];
  if(identity.role==='creator'){
   const people=new Map(game.state.regions.filter(t=>!isCreatorTeam(t)).flatMap(t=>t.members.map(m=>[m.pid,{pid:m.pid,name:m.name,team:t.name,active:true,online:online.has(m.pid)}])));
   for(const message of this.state.messages){if(!message.room.startsWith('support:'))continue;const pid=message.room.slice(8);if(!people.has(pid)){const author=this.state.messages.find(m=>m.room===message.room&&m.author.id===pid)?.author;people.set(pid,{pid,name:author?.name||'Участник завершившейся сессии',team:author?.teamName||'',active:false,online:false})}}
   for(const p of people.values()){const room='support:'+p.pid,desc=this.descriptor(room,p.name),last=this.state.messages.filter(m=>m.room===room).at(-1);inbox.push({...p,...desc,preview:last?(last.deleted?'Сообщение удалено':last.text.slice(0,75)):'Новое обращение',at:last?.at||0})}
   inbox.sort((a,b)=>b.lastSequence-a.lastSequence||a.name.localeCompare(b.name,'ru'));
  }
  const creators=Object.entries(CREATOR_NAMES).map(([id,name])=>{const member=game.state.regions.find(isCreatorTeam)?.members.find(m=>m.creatorId===id);return {name,online:!!member&&online.has(member.pid)}});
  return {enabled:true,identity,rooms,inbox,creators,historyLimit:CHAT_HISTORY_LIMIT};
 }
 view(game,identity,room){
  this.requireRoom(game,identity,room);
  const messages=this.state.messages.filter(m=>m.room===room).slice(-CHAT_HISTORY_LIMIT).map(m=>this.messageView(identity,m));
  return {room,messages,canSend:this.canSend(game,identity,room),latestSequence:this.descriptor(room,'').lastSequence};
 }
 messageView(identity,m){return {id:m.id,sequence:m.sequence,at:m.at,text:m.deleted?'':m.text,deleted:!!m.deleted,author:{...m.author},canDelete:!m.deleted&&(m.author.id===identity.id||identity.role==='teacher'||identity.role==='creator')}}
 prepareSend(game,identity,room,text,clientId){
  this.requireRoom(game,identity,room);ensure(this.canSend(game,identity,room),'Участник вышел из игры. История обращения доступна для просмотра.');
  ensure(typeof text==='string','Введите текст сообщения.');
  const clean=text.normalize('NFC').replace(/\r\n?/g,'\n').trim();
  ensure(clean.length>=1&&clean.length<=CHAT_TEXT_LIMIT&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(clean)&&clean.split('\n').length<=8,`Сообщение: 1–${CHAT_TEXT_LIMIT} символов, не больше 8 строк.`);
  ensure(typeof clientId==='string'&&/^[\w-]{8,80}$/.test(clientId),'Некорректный идентификатор сообщения.');
  const duplicate=this.state.messages.find(m=>m.author.id===identity.id&&m.clientId===clientId);
  if(duplicate){ensure(duplicate.room===room&&duplicate.text===clean,'Для изменённого сообщения нужен новый идентификатор.');return {state:this.state,message:duplicate,duplicate:true}}
  const sequence=this.state.sequence+1,message={id:randomUUID(),sequence,room,at:this.now(),text:clean,clientId,author:{...identity}};
  let messages=[...this.state.messages,message],roomCount=0;
  messages=messages.toReversed().filter(m=>m.room!==room||++roomCount<=CHAT_HISTORY_LIMIT).reverse().slice(-CHAT_TOTAL_LIMIT);
  return {state:{version:1,sequence,messages},message,duplicate:false};
 }
 prepareDelete(game,identity,messageId){
  this.require(identity);const message=this.state.messages.find(m=>m.id===messageId);ensure(message,'Сообщение уже недоступно.');this.requireRoom(game,identity,message.room);
  ensure(message.author.id===identity.id||identity.role==='teacher'||identity.role==='creator','Можно удалить только своё сообщение.','FORBIDDEN');
  if(message.deleted)return {state:this.state,room:message.room,duplicate:true};
  const sequence=this.state.sequence+1,messages=this.state.messages.map(m=>m.id===messageId?{...m,text:'',deleted:true,updatedSequence:sequence}:m);
  return {state:{...this.state,sequence,messages},room:message.room,duplicate:false};
 }
}

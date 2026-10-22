import test from 'node:test';
import assert from 'node:assert/strict';
import {ChatEngine, chatIdentity, CHAT_HISTORY_LIMIT, CHAT_TOTAL_LIMIT} from '../chat-engine.js';
import {GameLogic, hashToken} from '../game-logic.js';

function fixture(){
 const game=new GameLogic(),chat=new ChatEngine(null,()=>1760000000000);
 const join=(regionId,name)=>game.joinTeam(regionId,name);
 const a=join('saryarka','Алия'),b=join('jetisu','Бек'),c=join('saryarka','Дана');
 const root=game.joinCreator('ernur'),second=game.joinCreator('adilet');
 const identity=joined=>chatIdentity(game,{role:'guest',playerHash:hashToken(joined.playerToken)});
 return {game,chat,a,b,c,root,alice:identity(a),bob:identity(b),dana:identity(c),ernur:identity(root),adilet:identity(second),teacher:chatIdentity(game,{role:'teacher'})};
}
function send(f,who,room,text='Тест',id='message_0001'){
 const draft=f.chat.prepareSend(f.game,who,room,text,id);f.chat.state=draft.state;return draft.message;
}
const forbidden=fn=>assert.throws(fn,error=>error.code==='FORBIDDEN');

test('чат: роли и имена выводятся из сессии, гостям недоступны все каналы',()=>{
 const f=fixture();
 assert.equal(chatIdentity(f.game,{role:'creator',isCreator:true}),null);
 assert.equal(f.alice.role,'student');assert.equal(f.ernur.name,'Ернур');assert.equal(f.adilet.name,'Адилет');
 assert.equal('tokenHash' in f.alice,false);
 assert.deepEqual(f.chat.metadata(f.game,null).rooms,[]);
 forbidden(()=>f.chat.view(f.game,null,'global'));
 forbidden(()=>send(f,null,'global'));
});
test('чат: общий, командный и закрытые каналы проверяют права чтения и записи',()=>{
 const f=fixture(),support='support:'+f.alice.id;
 send(f,f.alice,'team:saryarka','Командный план');
 assert.equal(f.chat.view(f.game,f.dana,'team:saryarka').messages[0].text,'Командный план');
 forbidden(()=>f.chat.view(f.game,f.bob,'team:saryarka'));
 forbidden(()=>send(f,f.bob,'team:saryarka'));
 send(f,f.alice,support,'Личное обращение','private_0001');
 for(const who of [f.bob,f.dana,f.teacher]){forbidden(()=>f.chat.view(f.game,who,support));forbidden(()=>send(f,who,support))}
 for(const who of [f.ernur,f.adilet])assert.equal(f.chat.view(f.game,who,support).messages[0].text,'Личное обращение');
 send(f,f.ernur,'team:creators','Для создателей','creators_0001');
 for(const who of [f.alice,f.teacher])forbidden(()=>f.chat.view(f.game,who,'team:creators'));
 assert.equal(f.chat.view(f.game,f.adilet,'team:creators').messages.length,1);
 for(const who of [f.alice,f.teacher]){const meta=f.chat.metadata(f.game,who);assert.deepEqual(meta.inbox,[]);assert.equal(JSON.stringify(meta).includes('Личное обращение'),false)}
 assert.equal(f.chat.metadata(f.game,f.ernur).inbox.find(r=>r.id===support).preview,'Личное обращение');
});
test('чат: перенос отзывает доступ к прошлой команде, исключение архивирует обращение',()=>{
 const f=fixture(),support='support:'+f.alice.id;
 send(f,f.alice,support);
 f.game.movePlayer(f.alice.id,'jetisu');
 const moved=chatIdentity(f.game,{playerHash:hashToken(f.a.playerToken)});
 forbidden(()=>f.chat.view(f.game,moved,'team:saryarka'));
 assert.equal(f.chat.canRead(f.game,moved,'team:jetisu'),true);
 f.game.leaveTeam('jetisu',f.alice.id);
 assert.equal(chatIdentity(f.game,{playerHash:hashToken(f.a.playerToken)}),null);
 assert.equal(f.chat.view(f.game,f.ernur,support).canSend,false);
 assert.equal(f.chat.metadata(f.game,f.adilet).inbox.find(r=>r.id===support).active,false);
 assert.throws(()=>send(f,f.ernur,support),/вышел из игры/);
});
test('чат: собственное удаление, модерация и запрет чужого личного сообщения',()=>{
 const f=fixture(),message=send(f,f.alice,'global');
 forbidden(()=>f.chat.prepareDelete(f.game,f.bob,message.id));
 const deleted=f.chat.prepareDelete(f.game,f.teacher,message.id);f.chat.state=deleted.state;
 assert.equal(f.chat.view(f.game,f.alice,'global').messages[0].text,'');
 assert.equal(f.chat.view(f.game,f.alice,'global').messages[0].deleted,true);
 assert.equal(f.chat.descriptor('global','').lastSequence,2);
 assert.equal(f.chat.prepareDelete(f.game,f.alice,message.id).duplicate,true);
 const privateMessage=send(f,f.alice,'support:'+f.alice.id,'Секрет','private_0001');
 forbidden(()=>f.chat.prepareDelete(f.game,f.teacher,privateMessage.id));
 assert.equal(f.chat.prepareDelete(f.game,f.adilet,privateMessage.id).duplicate,false);
});
test('чат: валидация, нормализация и повтор отправки не создают дубликат',()=>{
 const f=fixture();
 const message=send(f,f.alice,'global','  Привет\r\nмир!  ');
 assert.equal(message.text,'Привет\nмир!');
 assert.equal(f.chat.prepareSend(f.game,f.alice,'global','Привет\nмир!','message_0001').duplicate,true);
 assert.equal(f.chat.state.messages.length,1);
 assert.throws(()=>send(f,f.alice,'global','Другой текст'),/новый идентификатор/);
 for(const text of ['', ' '.repeat(10), 'a'.repeat(601), 'a\u0000b', Array(9).fill('x').join('\n')])assert.throws(()=>send(f,f.alice,'global',text,'invalid_0001'));
 forbidden(()=>send(f,f.alice,'team:../state'));
});
test('чат: ограниченная история, восстановление и отказ при повреждении',()=>{
 const f=fixture();
 for(let i=0;i<CHAT_HISTORY_LIMIT+10;i++)send(f,f.alice,'global','Сообщение '+i,'global_'+String(i).padStart(4,'0'));
 assert.equal(f.chat.state.messages.length,CHAT_HISTORY_LIMIT);
 assert.equal(f.chat.state.messages[0].text,'Сообщение 10');
 f.game.expandTeams(8);
 for(const team of f.game.state.regions.filter(t=>t.id!=='creators'))for(let i=0;i<80;i++)send(f,f.ernur,'team:'+team.id,'Текст',team.id+'_'+String(i).padStart(4,'0'));
 assert.equal(f.chat.state.messages.length,CHAT_TOTAL_LIMIT);
 assert.deepEqual(new ChatEngine(f.chat.state).state,f.chat.state);
 assert.throws(()=>new ChatEngine({version:1,sequence:1,messages:[{}]}),/Повреждено/);
 assert.throws(()=>new ChatEngine({...f.chat.state,version:9}),/Повреждено/);
});

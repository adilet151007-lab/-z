import {escapeHTML as h,setupAmbientAudio} from './shared-engine.js';

const getSaved=key=>{for(const storage of ['localStorage','sessionStorage'])try{const value=globalThis[storage].getItem(key);if(value!==null)return value}catch{}return null};
const save=(key,value)=>{for(const storage of ['localStorage','sessionStorage'])try{globalThis[storage].setItem(key,value)}catch{}};
export class ChatReadState{
 constructor(get=getSaved,put=save){this.get=get;this.put=put;this.reset()}
 reset(){this.key='';this.legacyId='';this.marks={}}
 load(key){try{const value=JSON.parse(this.get('cq_chat_read_'+key)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))return Object.fromEntries(Object.entries(value).filter(([room,sequence])=>/^(global|team:[\w-]{1,80}|support:[\w-]{1,80})$/.test(room)&&Number.isSafeInteger(sequence)&&sequence>=0))}catch{}return {}}
 bind(metadata){
  if(!metadata?.enabled||!metadata.identity?.id)return;
  const key=metadata.readKey||metadata.identity.id;
  const changed=key!==this.key;
  if(changed){this.key=key;this.marks=this.load(key)}
  if(changed||this.legacyId!==metadata.identity.id){
   const legacy=this.load(metadata.identity.id);let migrated=false;
   for(const [room,sequence] of Object.entries(legacy))if(sequence>(this.marks[room]||0)){this.marks[room]=sequence;migrated=true}
   if(migrated)this.persist();this.legacyId=metadata.identity.id;
  }
 }
 persist(){if(this.key){for(const [room,sequence] of Object.entries(this.load(this.key)))this.marks[room]=Math.max(this.marks[room]||0,sequence);this.put('cq_chat_read_'+this.key,JSON.stringify(this.marks))}}
 mark(room,sequence){
  if(!this.key||!/^(global|team:[\w-]{1,80}|support:[\w-]{1,80})$/.test(room)||!Number.isSafeInteger(sequence)||sequence<=0||sequence<=(this.marks[room]||0))return false;
  this.marks[room]=sequence;this.persist();return true;
 }
 unread(descriptor){return !!descriptor&&descriptor.lastSequence>(this.marks[descriptor.id]||0)}
}
export function setupCommunication(engine){
 setupAmbientAudio();
 const host=document.createElement('div');host.id='cq-chat-root';host.hidden=true;
 host.innerHTML=`<button id="cq-chat-toggle" class="chat-launcher" aria-expanded="false" aria-controls="cq-chat-panel"><span aria-hidden="true">✉</span> Чат <span id="cq-chat-unread" class="chat-unread" hidden>●</span></button><section id="cq-chat-panel" class="chat-panel" hidden aria-label="Игровой чат"><header class="chat-header"><div><small>LIVE · CULTURE QUEST</small><h2>Общение</h2></div><button id="cq-chat-close" class="ghost" aria-label="Закрыть чат">×</button></header><nav class="chat-tabs" role="tablist" aria-label="Каналы чата"><button data-chat-kind="global" role="tab">Общий</button><button data-chat-kind="team" role="tab">Команда</button><button data-chat-kind="support" role="tab" id="cq-chat-support-tab">Создатели</button></nav><div id="cq-chat-picker" class="chat-picker" hidden><label id="cq-chat-picker-label" for="cq-chat-target">Выберите собеседника</label><select id="cq-chat-target"></select></div><p id="cq-chat-description" class="chat-description"></p><div id="cq-chat-messages" class="chat-messages" role="log" aria-live="polite" aria-relevant="additions text"></div><p id="cq-chat-notice" class="chat-notice" role="status"></p><form id="cq-chat-form" class="chat-compose"><label for="cq-chat-input" class="sr-only">Сообщение</label><textarea id="cq-chat-input" maxlength="600" rows="2" placeholder="Напишите сообщение…"></textarea><div class="row spaced"><small id="cq-chat-counter" class="mut">0 / 600</small><button id="cq-chat-send" class="pri" type="submit">Отправить ↗</button></div></form><footer class="chat-footer"><button id="cq-chat-refresh" class="ghost">Обновить</button><button id="cq-show-credits" class="ghost">Авторы проекта</button></footer></section>`;
 const credits=document.createElement('aside');credits.id='cq-project-credits';credits.className='project-credits';credits.setAttribute('aria-label','Создатели проекта');
 credits.innerHTML=`<button id="cq-credits-close" class="credits-close" aria-label="Скрыть карточку создателей">×</button><div class="credits-mark" aria-hidden="true"><span>A</span><span>E</span></div><div class="credits-copy"><small>CULTURE QUEST · MADE IN KZ</small><p>Сделано <strong>Адлетом и Ернуром</strong></p><span>Играем. Учимся. Строим Казахстан.</span></div><button id="cq-credits-contact" type="button">Написать создателям ↗</button>`;
 const utilities=document.getElementById('session-utilities')||document.body;utilities.append(host);document.body.append(credits);
 const signature=document.createElement('button');signature.type='button';signature.className='product-signature';signature.textContent='Адилет × Ернур';signature.setAttribute('aria-label','Авторы Culture Quest: Адилет и Ернур');utilities.append(signature);
 const awardButton=document.createElement('button');awardButton.type='button';awardButton.className='utility-button';awardButton.innerHTML='⟐ Достижения <span data-achievement-count>0</span>';
 const mapButton=document.createElement('button');mapButton.type='button';mapButton.className='utility-button';mapButton.dataset.mapReview='';mapButton.textContent='↗ Обзор карты';mapButton.setAttribute('aria-pressed','false');utilities.append(awardButton,mapButton);
 const $=id=>document.getElementById(id),panel=$('cq-chat-panel'),list=$('cq-chat-messages'),input=$('cq-chat-input');
 let open=false,kind='global',room=null,meta=null,view=null,identityKey='',scopeKey='',epoch=0,requestId=0,sending=false,loading=false,renderedRoom=null,renderKey='',pickerKey='',pendingDraft=null,creditsDismissed=false;
 const drafts=new Map(),nodes=new Map(),reads=new ChatReadState();
 let wasConnected=engine.connected,creditsTouched=false;
 function allowed(){const v=engine.state?.viewer;return !!v&&(v.role==='teacher'||!!v.player)}
 function notice(text='',error=false){$('cq-chat-notice').textContent=text;$('cq-chat-notice').classList.toggle('red',error)}
 function updateCredits(){credits.hidden=creditsDismissed||open||allowed()&&!creditsTouched||document.body.classList.contains('map-review-mode');const button=$('cq-credits-contact');button.textContent=!allowed()?'Войдите в команду, чтобы написать':engine.state.viewer.isCreator?'Открыть обращения ↗':engine.state.viewer.role==='teacher'?'Открыть общий чат ↗':'Написать создателям ↗';button.disabled=!allowed()}
 function closeShelves(){for(const shelf of document.querySelectorAll('.achievement-panel'))shelf.open=false}
 function closeExtras(closeShelf=true){creditsDismissed=true;if(open)setOpen(false);updateCredits();if(closeShelf)closeShelves()}
 function showCredits(){closeShelves();if(open)setOpen(false);creditsTouched=true;creditsDismissed=false;save('cq_credits_dismissed_v1','0');updateCredits()}
 $('cq-credits-close').addEventListener('click',()=>{creditsDismissed=true;save('cq_credits_dismissed_v1','1');updateCredits()});
 $('cq-show-credits').addEventListener('click',showCredits);
 signature.addEventListener('click',showCredits);setTimeout(()=>{if(!creditsTouched){creditsDismissed=true;updateCredits()}},12000);
 $('cq-credits-contact').addEventListener('click',()=>requestOpen(engine.state?.viewer.role==='teacher'?'global':'support'));
 function requestOpen(channel=kind){window.dispatchEvent(new CustomEvent('cq:show-chat',{detail:{channel}}))}
 function setOpen(value){if(value&&!allowed())return;if(value){creditsDismissed=true;closeShelves()}open=value;panel.hidden=!open;$('cq-chat-toggle').setAttribute('aria-expanded',String(open));updateCredits();if(open){draw();if(room&&view?.room===room)markRead();input.focus()}}
 $('cq-chat-toggle').addEventListener('click',()=>{if(open)setOpen(false);else requestOpen()});$('cq-chat-close').addEventListener('click',()=>setOpen(false));
 window.addEventListener('cq:show-chat',e=>{if(!allowed())return;chooseKind(e.detail?.channel||kind);setOpen(true)});
 window.addEventListener('cq:hide-chat',()=>setOpen(false));
 window.addEventListener('cq:close-extras',()=>closeExtras());
 for(const shelf of document.querySelectorAll('.achievement-panel'))shelf.addEventListener('toggle',()=>{if(shelf.open)closeExtras(false)});
 awardButton.addEventListener('click',()=>{closeExtras();const shelf=document.querySelector('.achievement-panel');if(shelf){shelf.open=true;shelf.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}});
 mapButton.addEventListener('click',()=>{closeExtras();const active=document.body.classList.toggle('map-review-mode');mapButton.textContent=active?'← Вернуться к игре':'↗ Обзор карты';mapButton.setAttribute('aria-pressed',String(active));window.dispatchEvent(new Event('cq:map-review-change'));if(active)document.querySelector('.stage-wrap,.atlas-projector')?.scrollIntoView({block:'start'})});
 panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);$('cq-chat-toggle').focus()}});
 function markRead(){if(!open||document.visibilityState==='hidden'||!room||view?.room!==room)return;if(reads.mark(room,view.latestSequence||0))draw();else drawBadges()}
 function unread(desc){return reads.unread(desc)}
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')markRead()});
 window.addEventListener('storage',event=>{if(event.key==='cq_chat_read_'+reads.key&&meta?.enabled){reads.reset();reads.bind(meta);draw()}});
 function drawBadges(){
  const entries=[...(meta?.rooms||[]),...(meta?.inbox||[])],any=entries.some(unread);$('cq-chat-unread').hidden=!any;$('cq-chat-toggle').setAttribute('aria-label',any?'Открыть чат: есть новые сообщения':'Открыть чат');
  for(const button of panel.querySelectorAll('[data-chat-kind]')){const type=button.dataset.chatKind,candidates=type==='global'?entries.filter(r=>r.id==='global'):type==='team'?entries.filter(r=>r.id.startsWith('team:')):entries.filter(r=>r.id.startsWith('support:'));button.classList.toggle('has-unread',candidates.some(unread))}
 }
 function candidates(){if(!meta)return [];if(kind==='global')return meta.rooms.filter(r=>r.id==='global');if(kind==='team')return meta.rooms.filter(r=>r.kind==='team');return meta.identity?.role==='creator'?meta.inbox:meta.rooms.filter(r=>r.kind==='support')}
 function chooseKind(next){
  if(!['global','team','support'].includes(next))return;
  if(next==='support'&&meta?.identity?.role==='teacher')next='global';
  if(room)drafts.set(room,input.value);kind=next;room=null;view=null;renderedRoom=null;renderKey='';input.value='';reconcile();
 }
 async function subscribe(target){
  const mine=++requestId,currentEpoch=epoch;loading=true;notice('Подключение к каналу…');updateComposer();
  try{await engine.subscribeChat(target);if(currentEpoch===epoch&&mine===requestId){loading=false;notice();draw()}}
  catch(error){if(currentEpoch===epoch&&mine===requestId){loading=false;notice(error.message,true);updateComposer()}}
 }
 function reconcile(){
  if(!meta?.enabled||!allowed()){draw();return}
  const options=candidates(),previous=room;
  if(!options.some(r=>r.id===room))room=(kind==='team'?options.find(r=>r.own):null)?.id||options[0]?.id||null;
  if(previous!==room){input.value=drafts.get(room)||'';view=engine.chatView?.room===room?engine.chatView:null;renderKey='';if(room&&engine.connected)subscribe(room)}
  draw();
 }
 $('cq-chat-target').addEventListener('change',()=>{if(room)drafts.set(room,input.value);room=$('cq-chat-target').value;view=null;renderKey='';input.value=drafts.get(room)||'';draw();if(room)subscribe(room)});
 for(const button of panel.querySelectorAll('[data-chat-kind]'))button.addEventListener('click',()=>chooseKind(button.dataset.chatKind));
 $('cq-chat-refresh').addEventListener('click',()=>{if(room)subscribe(room)});
 function renderMessages(){
  const messages=view?.room===room?view.messages:[],key=JSON.stringify([room,messages,loading,meta?.identity?.role]);if(renderKey===key)return;renderKey=key;
  const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<72,changed=renderedRoom!==room;
  if(changed){list.replaceChildren();nodes.clear();renderedRoom=room}
  const ids=new Set(messages.map(m=>m.id));for(const [id,node] of nodes)if(!ids.has(id)){node.remove();nodes.delete(id)}
  list.querySelector('.chat-empty')?.remove();
  for(const message of messages){
   let node=nodes.get(message.id);
   if(!node){node=document.createElement('article');node.className='chat-message';node.innerHTML='<div class="chat-message-meta"><strong></strong><span class="chat-author-role"></span><time></time></div><p class="chat-message-text"></p><button class="chat-delete" type="button">Удалить</button>';nodes.set(message.id,node);list.append(node)}
   node.classList.toggle('mine',message.author.id===meta?.identity?.id);node.classList.toggle('from-creator',message.author.role==='creator');node.classList.toggle('deleted',message.deleted);
   node.querySelector('strong').textContent=message.author.name;node.querySelector('.chat-author-role').textContent=message.author.role==='creator'?'Создатель':message.author.role==='teacher'?'Преподаватель':message.author.teamName;
   const time=node.querySelector('time');time.textContent=new Date(message.at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});time.dateTime=new Date(message.at).toISOString();
   node.querySelector('p').textContent=message.deleted?'Сообщение удалено':message.text;
   const button=node.querySelector('button');button.hidden=!message.canDelete;button.dataset.chatDelete=message.id;button.setAttribute('aria-label','Удалить сообщение '+message.author.name);
  }
  if(!messages.length){const empty=document.createElement('p');empty.className='chat-empty';empty.textContent=!room&&kind==='support'&&meta?.identity?.role==='creator'?'Обращения появятся, когда студенты войдут в игру.':loading?'Загружаем сообщения…':'Пока сообщений нет. Начните разговор.';list.append(empty)}
  if(changed||nearBottom)list.scrollTop=list.scrollHeight;
 }
 list.addEventListener('click',async e=>{const button=e.target.closest('[data-chat-delete]');if(!button||button.disabled)return;button.disabled=true;try{await engine.deleteChatMessage(button.dataset.chatDelete);notice()}catch(error){notice(error.message,true)}finally{button.disabled=false}});
 function updateComposer(){
  $('cq-chat-counter').textContent=input.value.length+' / 600';
  const canSend=!!room&&view?.room===room&&view.canSend&&engine.connected&&!loading;
  input.disabled=!allowed();$('cq-chat-send').disabled=!canSend||sending||!input.value.trim();$('cq-chat-refresh').disabled=!engine.connected||loading||!room;
  if(allowed()&&!engine.connected)notice('Нет связи. Черновик сохранён в этом окне.');
 }
 input.addEventListener('input',()=>{if(room)drafts.set(room,input.value);updateComposer()});
 input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!$('cq-chat-send').disabled)$('cq-chat-form').requestSubmit()}});
 $('cq-chat-form').addEventListener('submit',async e=>{
  e.preventDefault();if(sending||!room||!engine.connected||!input.value.trim())return;
  const target=room,text=input.value,currentEpoch=epoch;
  if(!pendingDraft||pendingDraft.room!==target||pendingDraft.text!==text)pendingDraft={room:target,text,clientId:typeof crypto.randomUUID==='function'?crypto.randomUUID():'chat_'+Date.now()+'_'+Math.random().toString(36).slice(2)};
  const id=pendingDraft.clientId;sending=true;notice('Отправка…');updateComposer();
  try{await engine.sendChat(target,text,id);if(currentEpoch!==epoch)return;drafts.delete(target);if(room===target&&input.value===text)input.value='';pendingDraft=null;notice()}
  catch(error){if(currentEpoch===epoch)notice(error.message,true)}
  finally{sending=false;updateComposer()}
 });
 function draw(){
  const identity=meta?.identity;
  panel.querySelector('[data-chat-kind="team"]').hidden=engine.state?.settings.mode==='solo';
  $('cq-chat-support-tab').hidden=identity?.role==='teacher';$('cq-chat-support-tab').textContent=identity?.role==='creator'?'Обращения':'Создатели';
  for(const button of panel.querySelectorAll('[data-chat-kind]')){const selected=button.dataset.chatKind===kind;button.classList.toggle('active',selected);button.setAttribute('aria-selected',String(selected))}
  const options=candidates(),showPicker=options.length>1||(kind==='support'&&identity?.role==='creator');$('cq-chat-picker').hidden=!showPicker;
  const optionsKey=JSON.stringify([options,room,kind,reads.marks]);if(optionsKey!==pickerKey){pickerKey=optionsKey;$('cq-chat-picker-label').textContent=kind==='team'?'Команда':'Личное обращение';$('cq-chat-target').innerHTML=options.map(r=>`<option value="${h(r.id)}" ${r.id===room?'selected':''}>${unread(r)?'● ':''}${h(r.title)}${r.team?' · '+h(r.team):''}${r.active===false?' · вышел из игры':''}</option>`).join('');$('cq-chat-target').disabled=!options.length}
  const description=kind==='global'?'Общий разговор всех участников и преподавателя.':kind==='team'?identity?.role==='teacher'||identity?.role==='creator'?'Канал выбранной команды. Команда создателей доступна только Ернуру и Адилету.':'Здесь общается ваша команда. Преподаватель и создатели могут помогать в чате.':identity?.role==='creator'?'Личное обращение студента. Другие студенты и преподаватель его не видят.':'Личный чат с Ернуром и Адилетом. Другие участники и преподаватель его не видят.';
  const creators=kind==='support'&&identity?.role==='student'?' '+(meta?.creators||[]).map(c=>`${c.name}: ${c.online?'в сети':'не в сети'}`).join(' · '):'';
  $('cq-chat-description').textContent=description+creators;renderMessages();drawBadges();updateComposer();
 }
 engine.onChat((metadata,chatView)=>{
  meta=metadata;
  reads.bind(metadata);
  if(!metadata?.enabled){view=null;room=null;list.replaceChildren();nodes.clear();renderedRoom=null;renderKey='';return}
  if(chatView?.room===room)view=chatView;
  reconcile();if(open&&view?.room===room)markRead();
 });
 engine.onChange(state=>{
  const v=state?.viewer,identity=v?.role==='teacher'?'teacher':v?.player?.pid||'',nextScope=identity+':'+(v?.role||'')+':'+(v?.player?.regionId||'');
  host.hidden=!allowed();host.classList.toggle('teacher-private',engine.mode==='teacher');credits.classList.toggle('teacher-private',engine.mode==='teacher');
  if(identityKey!==identity){identityKey=identity;epoch++;requestId++;drafts.clear();pendingDraft=null;input.value='';room=null;view=null;meta=null;renderedRoom=null;renderKey='';pickerKey='';nodes.clear();list.replaceChildren();kind='global';reads.reset();if(!identity)setOpen(false)}
  if(scopeKey!==nextScope){scopeKey=nextScope;epoch++;requestId++;room=null;view=null;meta=null;renderKey='';list.replaceChildren();nodes.clear()}
  if(wasConnected&&!engine.connected){epoch++;requestId++;loading=false}
  const reconnected=!wasConnected&&engine.connected;wasConnected=engine.connected;
  if(reconnected&&room&&allowed())subscribe(room);
  if(!allowed()){setOpen(false);document.body.classList.remove('map-review-mode');mapButton.textContent='↗ Обзор карты';mapButton.setAttribute('aria-pressed','false')}updateCredits();updateComposer();
  if(meta?.enabled){if(engine.state?.settings.mode==='solo'&&kind==='team')chooseKind('global');else draw()}
 });
 updateCredits();
}

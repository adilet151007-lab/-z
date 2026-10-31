import {GameEngine} from './shared-engine.js';
import {createStudioEditor} from './studio-editor.js';
const engine=new GameEngine('student'),host=document.getElementById('studio-app');let editor=null,pending=false,identity='';
engine.onChange(async state=>{
 if(!state?.viewer)return;
 if(!state.viewer.isCreator){editor?.dispose();editor=null;identity='';host.replaceChildren();const note=document.createElement('p');note.textContent='Studio Max доступен только двум создателям. Войдите в ERADIS своим аккаунтом создателя.';const back=document.createElement('a');back.href='./student.html';back.textContent='← ERADIS';host.append(note,back);return;}
 const next=state.branding.subject;if(pending||editor&&identity===next){editor?.updateState(state);return;}pending=true;
 try{const data=await engine.request('getStudio',{});editor?.dispose();editor=createStudioEditor(data,{contextKey:'creator:'+state.viewer.player?.pid+':'+next,baseVersion:data.revision,onBack:()=>location.assign('./student.html'),teacherUrl:'./student.html',teams:state.regions,roomState:state,analyze:text=>engine.analyzeSyllabus(text),generate:(text,topics,count,options)=>engine.generateQuestions(text,topics,count,options),onAdjust:async(teamId,kind,delta)=>{if(kind==='points')await engine.adjustPoints(teamId,delta);else await engine.adjustEconomy(teamId,delta);return engine.state.regions;},summary:()=>engine.exportSummary(),onSave:async value=>{const current=engine.state.questions.filter(q=>(q.subject||next)===next);if(JSON.stringify(current)!==JSON.stringify(data.questions))throw Error('Банк вопросов изменился. Обновите Studio перед применением.');await engine.request('applyStudio',{...value,revision:engine.state.revision});return true;}});identity=next;host.replaceChildren(editor.element);}
 catch(error){host.textContent=error.message;}finally{pending=false;}
});

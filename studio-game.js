import {normalizeRegionId} from './game-config.js';
import {compileStudio,studioId,normalizeStudio} from './studio-schema.js';
import {nextStudioStep,routeOutcome} from './studio-flow.js';
export function applyStudio(game,raw,revision,validateQuestions){
 if(revision!==undefined&&revision!==game.state.revision)throw Object.assign(new Error('Комната изменилась. Обновите данные конструктора.'),{code:'REVISION_CONFLICT'});
 const {canvasData,questions}=compileStudio(raw),subject=game.state.branding.subject;if(canvasData.settings.subject&&canvasData.settings.subject!==subject)throw Object.assign(new Error('Выберите предмет сценария в комнате перед применением.'),{code:'INVALID_ACTION'});canvasData.settings.subject=subject;canvasData.settings.assetVersion=studioId();
 {
  const flow=doc=>{const compiled=compileStudio(doc);return JSON.stringify({questions:compiled.questions,connections:compiled.canvasData.connections,startId:compiled.canvasData.settings.startId,routeTeamId:compiled.canvasData.settings.routeTeamId});};
  if(game.state.canvasData&&flow(game.state.canvasData)===flow(canvasData)){
  game.createRestorePoint('Перед обновлением UI-макета Studio',false);game.state.canvasData=canvasData;game.touch();return {questions:questions.length,layoutOnly:true};}
  if(game.state.round&&!game.state.round.resolved)throw Object.assign(new Error('Завершите активный вопрос перед изменением сценария.'),{code:'INVALID_ACTION'});
 }
 const next=validateQuestions([...game.state.questions.filter(q=>(q.subject||subject)!==subject),...questions.map(q=>({...q,subject}))]);
 game.createRestorePoint('Перед применением ERADIS Studio',false);game.state.canvasData=canvasData;game.state.questions=next;game.state.round=null;game.state.match=null;game.state.phase='lobby';game.touch();return {questions:questions.length};
}
function applyEffects(game,effects,questionBonus=false){
 const results=game.state.round.results||{},personTeam=id=>game.state.settings.mode==='solo'?game.state.regions.find(t=>t.members.some(m=>m.pid===id))?.id:id;
 const correctTeams=[...new Set(Object.entries(results).filter(([,r])=>r.correct).map(([id])=>personTeam(id)).filter(Boolean))];
 for(const effect of effects){if(questionBonus&&!correctTeams.length)continue;const targets=effect.regionId?[effect.regionId]:questionBonus?correctTeams:[...new Set(Object.keys(results).filter(id=>!results[id].skipped).map(personTeam).filter(Boolean))];
  for(const id of targets){const team=game.state.regions.find(t=>t.id===id)||game.state.regions.find(t=>normalizeRegionId(t.id)===normalizeRegionId(id));if(!team)continue;if(effect.resourceDelta)game.adjustPoints(team.id,effect.resourceDelta);if(effect.economyDelta){const stats=game.state.match?.stats?.[team.id],recovered=stats?.recoveredByQuiz,before=team.economy;game.adjustEconomy(team.id,effect.economyDelta);if(stats&&correctTeams.includes(team.id)&&effect.economyDelta>0&&team.economy===100&&(recovered||stats.hitCrisis&&before<100))stats.recoveredByQuiz=true;}}
 }
}
function saveRoute(game,step,outcome){game.state.round.studioRoute={nextQuestionId:step.next?.data.questionId||null,outcome,checkpoint:step.checkpoint?{id:step.checkpoint.id,text:step.checkpoint.data.text||step.checkpoint.name}:null};}
export function finishStudioRound(game){
 const round=game.state.round,doc=game.state.canvasData;if(!doc||!round?.questionSnapshot.studioNodeId||!doc.elements.some(e=>e.id===round.questionSnapshot.studioNodeId)||round.studioRoute)return;
 const question=round.questionSnapshot,outcome=routeOutcome(round.results,doc.settings.routeTeamId),step=nextStudioStep(doc,question.studioNodeId,outcome);
 applyEffects(game,[{resourceDelta:question.resourceDelta||0,economyDelta:question.economyDelta||0,regionId:question.regionId||''}],true);applyEffects(game,step.effects);saveRoute(game,step,outcome);
}
export function continueStudio(game){
 const route=game.state.round?.studioRoute,doc=game.state.canvasData;if(!route?.checkpoint||!doc||!game.state.round.resolved)throw Object.assign(new Error('Нет активного чекпойнта Studio.'),{code:'INVALID_ACTION'});
 const step=nextStudioStep(doc,route.checkpoint.id,route.outcome);applyEffects(game,step.effects);saveRoute(game,step,route.outcome);if(step.checkpoint){game.touch();return;}if(step.next)game.startRound(step.next.data.questionId,step.next.data.duration||30);else game.finishMatch();
}
// Keep already placed cards in sync with the native teacher question editor.
export function syncStudioBank(game){
 const doc=game.state.canvasData;if(!doc)return;const bank=new Map(game.state.questions.map(q=>[q.id,q])),removed=new Set();
 const copy=structuredClone(doc);
 copy.elements=copy.elements.filter(e=>{if(e.type!=='quiz-card')return true;const q=bank.get(e.data.questionId);if(!q){if(e.hidden)return true;removed.add(e.id);return false;}const old=e.data.text;if(e.name===old?.slice(0,70))e.name=q.text.slice(0,70);for(const key of ['text','options','correct','points','topic','explanation','source','sourceExcerpt'])e.data[key]=q[key]??(['options'].includes(key)?[]:'');for(const key of ['duration','autoAdvance','resourceDelta','economyDelta','regionId'])if(q[key]!==undefined)e.data[key]=q[key];return true;});
 copy.connections=copy.connections.filter(c=>!removed.has(c.from)&&!removed.has(c.to));if(removed.has(copy.settings.startId))copy.settings.startId=copy.elements.find(e=>e.type==='quiz-card'&&!e.hidden)?.id||null;
 game.state.canvasData=normalizeStudio(copy);
}

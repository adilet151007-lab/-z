import {normalizeRegionId} from './game-config.js';
// Same deterministic routing for preview and the authoritative game server.
export function nextStudioStep(doc,nodeId,isCorrect){
 const byId=new Map(doc.elements.map(e=>[e.id,e])),effects=[],seen=new Set();let current=nodeId;
 if(!doc.connections.length){const nodes=doc.elements.filter(e=>e.type==='quiz-card'&&!e.hidden).sort((a,b)=>a.y-b.y||a.x-b.x),index=nodes.findIndex(e=>e.id===nodeId);return {next:nodes[index+1]||null,effects};}
 while(current&&!seen.has(current)){seen.add(current);const outgoing=doc.connections.filter(c=>c.from===current),edge=outgoing.find(c=>c.condition===(isCorrect?'correct':'wrong'))||outgoing.find(c=>c.condition==='next');if(!edge)break;const target=byId.get(edge.to);if(!target||target.hidden)break;if(target.type==='quiz-card')return {next:target,effects};if(target.type==='lesson-defense-card')return {next:null,effects,checkpoint:target};if(target.type==='economy-trigger-node')effects.push(target.data);current=target.id;}
 return {next:null,effects};
}
export function routeOutcome(results,teamId=''){const entries=Object.entries(results).filter(([,r])=>!r.skipped&&r.chosen!==null);if(teamId&&results[teamId])return results[teamId].correct===true;return entries.length>0&&entries.filter(([,r])=>r.correct).length>entries.length/2;}
export function rewardPreview(teams,regionId,resources=0,economy=0){const target=regionId&&(teams.find(t=>t.id===regionId)||teams.find(t=>normalizeRegionId(t.id)===normalizeRegionId(regionId)))?.id;return teams.map(t=>!regionId||t.id===target?{...t,points:Math.max(0,Math.min(t.limit||1000,t.points+resources)),economy:Math.max(0,Math.min(100,t.economy+economy))}:t);}

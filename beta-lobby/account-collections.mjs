import {randomUUID,createHash} from 'node:crypto';
import {AWARD_CATALOG,ensurePlayerProfile,completedStones,LEGENDARY_IDS} from '../achievement-system.js';
const definitions=new Map(AWARD_CATALOG.map(a=>[a.id,a]));
const automatic=a=>a.source!=='manual';
function mergeAward(list,award){
 if(!definitions.has(award.achievementId))return;
 const old=list.find(a=>a.achievementId===award.achievementId);
 if(old&&(automatic(old)||!automatic(award)))return;
 const copy={id:award.id,achievementId:award.achievementId,earnedAt:award.earnedAt,source:award.source,matchId:award.matchId,reason:award.reason||'manual'};
 if(old)list[list.indexOf(old)]=copy;else list.push(copy);
}
function historicalAwards(s,id){
 const awards=[];
 for(const result of Object.values(s.results))if(result.accountId===id)for(const achievementId of result.achievements||[]){
  // Old result rows did not retain how an award was granted. Preserve ownership,
  // but do not fabricate earned stones from potentially manual grants.
  mergeAward(awards,{id:createHash('sha256').update(id+':'+achievementId).digest('hex'),achievementId,earnedAt:result.finishedAt,source:'manual',matchId:result.matchId,reason:'manual'});
 }
 return awards;
}
function collection(s,id){
 const a=s.accounts[id];
 if(!a.collection)a.collection={earned:historicalAwards(s,id),studied:[],revoked:{},updatedAt:0};
 return a.collection;
}
export function accountCollectionView(s,id){
 const c=s.accounts[id]?.collection,awards=c?.earned||historicalAwards(s,id);
 const studied=awards.some(a=>a.achievementId==='daily-training')?100:Math.min(100,c?.studied.length||0);
 return {awards:awards.map(a=>({...definitions.get(a.achievementId),...a})),training:{studied,target:100},perkRevoked:c?.perkRevoked===true};
}
export function syncAccountCollections(s,roomId,g,observed,now){
 const next=new Map();let changed=false;
 for(const team of g.state.regions)for(const member of team.members){
  const id=s.bindings[roomId+':'+member.pid],account=s.accounts[id];
  if(!account||account.status==='blocked')continue;
  const p=ensurePlayerProfile(g,member.pid);if(!p)continue;
  const c=collection(s,id),before=observed.get(member.pid),localIds=new Set(p.earned.map(a=>a.achievementId));
  if(before?.accountId===id){
   for(const old of before.awards)if(!localIds.has(old)){
    c.revoked[old]=now;c.earned=c.earned.filter(a=>a.achievementId!==old);
    if(old==='infinity-gauntlet')c.perkRevoked=true;
   }
   if(p.perkRevoked&&!before.perkRevoked){c.perkRevoked=true;c.revoked['infinity-gauntlet']=now;c.earned=c.earned.filter(a=>a.achievementId!=='infinity-gauntlet');}
  }
  for(const a of p.earned)if(a.earnedAt>(c.revoked[a.achievementId]??-1)){
   mergeAward(c.earned,a);
   if(a.achievementId==='infinity-gauntlet'&&a.earnedAt>(c.revoked['infinity-gauntlet']??-1))c.perkRevoked=false;
  }
  c.studied=[...new Set([...c.studied,...p.studied])].slice(0,100);
  p.earned=structuredClone(c.earned);p.studied=[...c.studied];p.perkRevoked=c.perkRevoked===true;p.updatedAt=now;
  // Invalidate the game's profile index before awarding or checking score limits.
  g.touch();changed=true;
  if(g.state.settings.achievementsEnabled!==false){
   if(c.studied.length>=100&&!c.revoked['daily-training']&&!p.earned.some(a=>a.achievementId==='daily-training'&&automatic(a))){
    g.grantAchievement('daily-training','player',member.pid,'earned','training');
   }
   if(!p.perkRevoked&&completedStones(p).length===LEGENDARY_IDS.length&&!p.earned.some(a=>a.achievementId==='infinity-gauntlet'&&automatic(a)))g.grantAchievement('infinity-gauntlet','player',member.pid,'earned','collection');
  }
  c.earned=structuredClone(p.earned);c.perkRevoked=p.perkRevoked===true;c.updatedAt=now;
  next.set(member.pid,{accountId:id,awards:p.earned.map(a=>a.achievementId),perkRevoked:p.perkRevoked===true});
 }
 return {observed:next,changed};
}

export function migrateRoomCollections(s,roomId,state,now){
 for(const team of state?.regions||[])for(const member of team.members){
  const id=s.bindings[roomId+':'+member.pid];if(!s.accounts[id])continue;
  const local=state.awardProfiles?.find(p=>p.id===member.profileId),c=collection(s,id);
  for(const a of local?.earned||[])if(a.earnedAt>(c.revoked[a.achievementId]??-1))mergeAward(c.earned,a);
  c.studied=[...new Set([...c.studied,...(local?.studied||[])])].slice(0,100);
  if(local?.perkRevoked)c.perkRevoked=true;
  if(c.studied.length>=100&&!c.revoked['daily-training']&&!c.earned.some(a=>a.achievementId==='daily-training'&&automatic(a)))mergeAward(c.earned,{id:randomUUID(),achievementId:'daily-training',earnedAt:now,source:'earned',matchId:'account-migration',reason:'training'});
  if(!c.perkRevoked&&completedStones(c).length===LEGENDARY_IDS.length&&!c.earned.some(a=>a.achievementId==='infinity-gauntlet'))mergeAward(c.earned,{id:randomUUID(),achievementId:'infinity-gauntlet',earnedAt:now,source:'earned',matchId:'account-migration',reason:'collection'});
  c.updatedAt=now;
 }
}

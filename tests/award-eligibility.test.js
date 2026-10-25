import test from 'node:test';
import assert from 'node:assert/strict';
import {GameLogic,hashToken} from '../game-logic.js';

function setup(opponent=false){
 const g=new GameLogic();g.enableUniversal();g.enableFlexibleTeams();g.setTeamRules('instant',false);g.state.questions=g.state.questions.slice(0,5);
 const owner=g.joinCreator('adilet',g.state.regions[0].id,'Владелец'),otherTeam=g.state.regions[1].id;
 const other=opponent?g.joinTeam(otherTeam,'Соперник'):null;g.adjustPoints(owner.player.regionId,75);g.adjustPoints(otherTeam,opponent?100:225);
 for(const q of g.state.questions){g.startRound(q.id,30);const r=g.state.round;for(const j of [owner,other].filter(Boolean))g.castVote(j.player.regionId,j.player.pid,r.questionSnapshot.correct,r.id);g.resolveRound()}
 return {g,owner,other,otherTeam,view:()=>g.view({role:'creator',playerHash:hashToken(owner.playerToken)})};
}
test('пустая команда с 225 ресурсами не создаёт ложное второе место команде с 200; командная скорость не выдаёт Solo-награду',()=>{
 const f=setup(),view=f.view();assert.equal(f.g.region(f.owner.player.regionId).points,200);assert.equal(f.g.region(f.otherTeam).points,225);
 assert.equal(f.g.exportSummary().length,1);assert.equal(view.teamLeaderboard.length,1);assert.equal(view.teamLeaderboard[0].rank,1);assert.equal(view.achievementEligibility.nearVictory.rank,1);assert.equal(view.achievementEligibility.nearVictory.gap,0);
 assert.equal(view.achievementEligibility.foresight.modeAllowed,false);assert.equal(view.achievementEligibility.foresight.fastRun,5);
 assert.equal(view.collection.awards.some(a=>['foresight','near-victory'].includes(a.achievementId)),false);assert.equal(f.g.view().achievementEligibility,undefined);
});
test('живой соперник с отрывом 25 даёт награду; итоговое второе место сохраняется после его выхода',()=>{
 const f=setup(true),view=f.view();assert.equal(view.teamLeaderboard.length,2);assert.equal(view.achievementEligibility.nearVictory.rank,2);assert.equal(view.achievementEligibility.nearVictory.gap,25);assert.equal(view.collection.awards.some(a=>a.achievementId==='near-victory'),true);
 f.g.leaveTeam(f.other.player.regionId,f.other.player.pid);const after=f.view();assert.equal(after.teamLeaderboard[0].rank,1);assert.equal(after.achievementEligibility.nearVictory.rank,2);assert.equal(after.achievementEligibility.nearVictory.gap,25);
});

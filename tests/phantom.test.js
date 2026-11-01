import test from 'node:test';
import assert from 'node:assert/strict';
import { GameLogic, hashToken } from '../game-logic.js';
import { tickPhantom, phantomActive, splitBetFund } from '../phantom-game.js';

function fixture() {
  let time = 100000;
  const g = new GameLogic(null, () => time),
    ids = ['saryarka', 'jetisu', 'mangystau', 'turkistan'];
  const players = ids.map((id, i) => {
    const joined = g.joinTeam(id, 'Игрок ' + (i + 1));
    g.adjustPoints(id, 800);
    return g.findPlayer(hashToken(joined.playerToken));
  });
  g.phantomConfigure({
    enabled: true,
    questionCount: 3,
    duration: 5,
    betSeconds: 5,
  });
  const event = () => g.state.phantom.event;
  const team = (i, action, data = {}) =>
    g.phantomTeam(players[i], {
      eventId: event()?.id,
      offerVersion: event()?.offerVersion,
      action,
      ...data,
    });
  const control = (action, data = {}) =>
    g.phantomControl({ eventId: event()?.id, action, ...data });
  const advance = (ms) => {
    time += ms;
    tickPhantom(g);
  };
  function contract(amount = 150) {
    team(0, 'offer', { toTeamId: ids[1], amount });
    team(1, 'accept');
  }
  function answer(correctByTeam = {}) {
    const e = event();
    for (let i = 0; i < 4; i++)
      if (e.fighters.some((f) => f.id === ids[i] && f.alive)) {
        const correct = e.round.question.correct;
        team(i, 'answer', {
          roundId: e.round.id,
          option: correctByTeam[i] ? correct : (correct + 1) % 4,
        });
      }
    control('resolve');
  }
  return { g, ids, players, event, team, control, advance, contract, answer };
}
test('Договор: устаревшее предложение отклоняется, основная игра и её автопереход стоят на паузе', () => {
  const f = fixture(),
    { g } = f;
  g.startRound(g.state.questions[0].id, 30);
  const oldId = g.state.round.id;
  f.team(0, 'offer', { toTeamId: f.ids[1], amount: 100 });
  assert.equal(g.state.round.paused, true);
  const version = f.event().offerVersion;
  f.team(1, 'counter', { amount: 150 });
  assert.throws(() =>
    g.phantomTeam(f.players[0], {
      action: 'accept',
      eventId: f.event().id,
      offerVersion: version,
    }),
  );
  assert.throws(() => g.phantomGuard('adjustPoints'));
  assert.throws(() => g.castVote(f.ids[0], f.players[0].pid, 0, oldId));
  f.team(0, 'accept');
  f.control('stop');
  assert.equal(g.state.round.id, oldId);
  assert.equal(g.state.round.paused, false);
  assert.equal(g.region(f.ids[0]).points, 800);
});
test('Лимит 1000 проверяется по потенциальной победе, перк ∞ сохраняет собственный лимит', () => {
  const f = fixture();
  f.g.adjustPoints(f.ids[0], 150);
  f.team(0, 'offer', { toTeamId: f.ids[1], amount: 100 });
  assert.throws(() => f.team(1, 'accept'));
  f.control('stop');
  const original = f.g.scoreLimit.bind(f.g);
  f.g.scoreLimit = (scope, id) =>
    id === f.ids[0] ? 10000000 : original(scope, id);
  f.contract(100);
  assert.equal(f.event().stage, 'betting');
  f.control('stop');
  f.g.adjustPoints(f.ids[1], 200);
  assert.throws(() => f.team(0, 'offer', { toTeamId: f.ids[1], amount: 25 }));
});
test('Тотализатор распределяет целый фонд точно, включая дробные остатки и пустую победившую сторону', () => {
  const bets = [
    { teamId: 'a', side: 'A', amount: 101 },
    { teamId: 'b', side: 'A', amount: 100 },
    { teamId: 'c', side: 'B', amount: 199 },
  ];
  const payouts = splitBetFund(bets, 'A');
  assert.equal(
    payouts.reduce((s, b) => s + b.payout, 0),
    400,
  );
  assert.deepEqual(payouts, [
    { teamId: 'a', payout: 201 },
    { teamId: 'b', payout: 199 },
  ]);
  assert.deepEqual(splitBetFund(bets, 'C'), []);
  assert.deepEqual(
    splitBetFund([{ teamId: 'a', side: 'A', amount: 30 }], 'A'),
    [{ teamId: 'a', payout: 30 }],
  );
});
test('Ставки ограничены, отмена и восстановление сохранения возвращают точные взносы только один раз', () => {
  const f = fixture();
  f.contract();
  f.team(2, 'bet', { side: f.ids[0], amount: 400 });
  assert.throws(() => f.team(2, 'bet', { side: f.ids[1], amount: 1 }));
  assert.throws(() => f.team(3, 'bet', { side: f.ids[0], amount: 401 }));
  const restored = new GameLogic(f.g.state, () => 100000);
  restored.phantomControl({ action: 'stop', eventId: f.event().id });
  assert.equal(restored.region(f.ids[2]).points, 800);
  assert.equal(restored.region(f.ids[0]).points, 800);
  assert.throws(() =>
    restored.phantomControl({ action: 'stop', eventId: f.event().id }),
  );
  f.control('stop');
  f.g.adjustPoints(f.ids[2], 100);
  f.contract();
  assert.throws(() => f.team(2, 'bet', { side: f.ids[0], amount: 25 }));
});
test('Одновременное выбывание запускает пробуждение при 600; участники не получают правильный ответ заранее', () => {
  const f = fixture();
  f.contract(150);
  f.team(2, 'bet', { side: f.ids[0], amount: 300 });
  f.control('start');
  for (let n = 0; n < 3; n++) {
    f.answer();
    if (n < 2) f.advance(2500);
  }
  assert.equal(f.event().stage, 'intro');
  assert.equal(f.event().kind, 'royale');
  assert.equal(f.event().fund, 600);
  assert.equal(f.event().teamIds.length, 3);
  assert.equal(f.g.state.phantom.unlocked, false);
  f.advance(30000);
  const projection = f.g.view();
  assert.equal(projection.phantom, null); // Guests see no event data.
  const pub = f.g.view({ role: 'teacher' });
  assert.equal(
    pub.phantom.event.round.question.correct,
    f.event().round.question.correct,
  );
  const live = f.g.state.regions[0].members[0];
  f.g.state.settings.universal = true;
  f.g.state.settings.flexibleTeams = true;
  f.g.state.settings.mode = 'team';
  for (const t of f.g.state.regions)
    for (const m of t.members) {
      m.capital ??= 0;
      m.streak ??= 0;
    }
  live.creatorId = 'adilet';
  const participant = f.g.view({ role: 'creator', playerHash: live.tokenHash });
  assert.equal(participant.phantom.event.round.question.correct, undefined);
  assert.equal(participant.questions.length, 0);
  const copy = new GameLogic(f.g.state, () => 130000);
  assert.equal(copy.state.phantom.event.fund, 600);
  assert.equal(copy.state.phantom.event.round.id, f.event().round.id);
});
function awaken(f) {
  f.contract(150);
  f.team(2, 'bet', { side: f.ids[0], amount: 300 });
  f.control('start');
  for (let i = 0; i < 3; i++) {
    f.answer();
    if (i < 2) f.advance(2500);
  }
  f.advance(30000);
}
test('Первая победа сохраняет ресурс выше 1000, реальные экономики неизменны, повторной активации нет', () => {
  const f = fixture();
  awaken(f);
  for (let n = 0; n < 3; n++) {
    f.answer({ 0: true });
    if (n < 2) f.advance(2500);
  }
  assert.equal(f.event().outcome, 'winner');
  assert.equal(f.g.region(f.ids[0]).points, 1250);
  assert.equal(f.g.state.phantom.firstRewardUsed, true);
  assert.equal(f.g.state.phantom.unlocked, true);
  assert.ok(f.g.state.regions.every((t) => t.economy === 100));
  assert.throws(() => f.team(0, 'offer', { toTeamId: f.ids[1], amount: 25 }));
  f.g.adjustPoints(f.ids[0], -500);
  f.contract(150);
  f.team(3, 'bet', { side: f.ids[0], amount: 300 });
  f.control('start');
  for (let n = 0; n < 3; n++) {
    f.answer();
    if (n < 2) f.advance(2500);
  }
  assert.equal(f.event().outcome, 'draw');
  assert.equal(f.g.region(f.ids[3]).points, 800);
});
test('При одновременном выбывании всех в первой Королевской битве фонд исчезает без победителя', () => {
  const f = fixture();
  awaken(f);
  for (let n = 0; n < 3; n++) {
    f.answer();
    if (n < 2) f.advance(2500);
  }
  assert.equal(f.event().outcome, 'destroyed');
  assert.equal(f.event().escrow.length, 0);
  assert.equal(f.g.state.phantom.unlocked, true);
  assert.equal(f.g.state.phantom.firstRewardUsed, false);
});
test('Добровольный фонд: две трети команд, повторный голос не дублируется, недопуск не списывает ресурсы', () => {
  const f = fixture();
  f.g.state.phantom.unlocked = true;
  f.g.state.regions.forEach((t) => (t.points = 400));
  f.control('proposal', { amount: 100 });
  f.team(0, 'vote', { yes: true });
  f.team(0, 'vote', { yes: true });
  f.team(1, 'vote', { yes: true });
  f.control('start');
  assert.equal(f.event().outcome, 'rejected');
  assert.equal(f.g.region(f.ids[0]).points, 400);
  f.control('proposal', { amount: 100 });
  for (let i = 0; i < 3; i++) f.team(i, 'vote', { yes: true });
  f.control('start');
  assert.equal(f.event().fund, 300);
  assert.equal(f.g.region(f.ids[3]).points, 400);
  assert.equal(f.g.region(f.ids[0]).points, 300);
  f.control('stop');
  assert.equal(f.g.region(f.ids[0]).points, 400);
  f.g.state.regions.forEach((t) => (t.points = 900));
  f.control('proposal', { amount: 100 });
  for (let i = 0; i < 4; i++) f.team(i, 'vote', { yes: true });
  f.control('start');
  assert.equal(f.event().outcome, 'insufficient');
  assert.ok(f.g.state.regions.every((t) => t.points === 900));
});
test('Фонд преподавателя соблюдает допуск; резервная копия приостанавливает событие, конец банка ждёт новые вопросы', () => {
  const f = fixture();
  f.g.state.phantom.unlocked = true;
  assert.throws(() => f.control('sponsor', { fund: 300, teamIds: f.ids }));
  f.g.state.regions.forEach((t) => (t.points = 500));
  f.control('sponsor', { fund: 300, teamIds: f.ids });
  f.advance(5000);
  const snapshot = f.g.backupSnapshot(),
    copy = new GameLogic(snapshot, () => 500000);
  assert.equal(copy.state.phantom.event.paused, true);
  assert.equal(copy.state.phantom.event.deadline, null);
  copy.phantomControl({
    action: 'pause',
    paused: false,
    eventId: copy.state.phantom.event.id,
  });
  assert.equal(copy.state.phantom.event.deadline, 505000);
  f.event().questions = [f.event().questions[0]];
  f.answer({ 0: true, 1: true, 2: true, 3: true });
  f.advance(2500);
  assert.equal(f.event().stage, 'exhausted');
  assert.equal(phantomActive(f.g.state), true);
  f.control('stop');
  assert.equal(f.g.region(f.ids[0]).points, 500);
  const invalid = structuredClone(f.g.state);
  invalid.phantom.event.escrow = [
    { teamId: f.ids[0], amount: -10, kind: 'war' },
  ];
  assert.throws(() => new GameLogic(invalid));
});

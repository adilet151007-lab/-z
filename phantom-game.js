import { randomUUID } from 'node:crypto';

// Only this module changes the event ledger. All calls run in the server's
// existing serialized, durable command queue; a failed save rolls them back.
const ACTIVE = new Set([
  'diplomacy',
  'betting',
  'proposal',
  'intro',
  'question',
  'reveal',
  'exhausted',
]);
const INT = (n, lo, hi) => Number.isSafeInteger(n) && n >= lo && n <= hi;
const need = (ok, message) => {
  if (!ok)
    throw Object.assign(new Error(message), {
      code: 'PHANTOM_RULE',
      phantom: true,
    });
};
const clone = (value) => structuredClone(value);
const MAX_FUND = 100000;
export const phantomActive = (state) => ACTIVE.has(state.phantom?.event?.stage);
const BLOCKED = new Set(
  'castVote voteLeader confirmVote cancelVote teamSubmit startRound switchQuestion pauseRound resetTimer resolveRound endRound finishMatch setAutoAdvance setGameMode setSessionMode setTeamRules setLeader offerTrade settleTrade adjustPoints adjustEconomy adjustCapital setPerksEnabled grantAchievement revokeAchievement createTeam expandTeams setTeamCount setTeamCapacity setAllCapacities updateTeam movePlayer updatePlayer renameTeam removeTeam removeAllPlayers applyRawState applyStudio continueStudio updateBranding clearQuestions restoreBackup setPublicDemo'.split(
    ' ',
  ),
);
export function guardPhantom(g, action) {
  need(
    !phantomActive(g.state) || !BLOCKED.has(action),
    'Основная игра приостановлена. Завершите или остановите событие.',
  );
}
export function pausePhantomSnapshot(state, now) {
  const e = state.phantom?.event;
  if (phantomActive(state) && !e.paused) {
    e.remaining = e.deadline ? Math.max(1, e.deadline - now) : 0;
    e.deadline = null;
    e.paused = true;
  }
}
export function initialPhantom() {
  return {
    version: 1,
    unlocked: false,
    firstRewardUsed: false,
    config: {
      enabled: false,
      questionIds: [],
      royaleQuestionIds: [],
      questionCount: 5,
      duration: 30,
      betSeconds: 30,
      reduced: false,
      volume: 0.12,
    },
    event: null,
  };
}
function system(g) {
  return (g.state.phantom ??= initialPhantom());
}
function team(g, id) {
  const t = g.state.regions.find((t) => t.id === id);
  need(t, 'Команда не найдена.');
  return t;
}
function teams(g) {
  return g.state.regions.filter((t) => t.members.length && t.id !== 'creators');
}
function eligible(g, t) {
  return g.scoreLimit('team', t.id) > 1000 || t.points < 1000;
}
function potential(g, t, prize, cost = 0) {
  return (
    eligible(g, t) &&
    (g.scoreLimit('team', t.id) > 1000 || t.points - cost + prize <= 1000)
  );
}
function captain(g, p) {
  const t = team(g, p?.regionId);
  g.member(t.id, p?.pid);
  need(
    g.leaderFor(t) === p.pid,
    'Договоры, ставки и голос команды подтверждает её лидер.',
  );
  return t;
}
function pool(g, royale = false) {
  const s = system(g),
    ids = royale ? s.config.royaleQuestionIds : s.config.questionIds;
  const available = g.playableQuestions();
  const qs = ids.length
    ? ids.map((id) => available.find((q) => q.id === id)).filter(Boolean)
    : available;
  need(qs.length, 'Подготовьте вопросы текущего предмета.');
  return clone(qs.slice(0, royale ? 200 : s.config.questionCount));
}
function change(g, id, delta, uncapped = false) {
  const t = team(g, id),
    before = t.points,
    limit = uncapped ? 10000000 : g.scoreLimit('team', id);
  t.points = delta < 0 ? before + delta : Math.min(limit, before + delta);
  need(INT(t.points, 0, 10000000), 'Некорректный баланс ресурсов.');
  g.growTerritory(t, t.points - before);
  return t.points - before;
}
function debit(g, e, id, amount, kind) {
  need(team(g, id).points >= amount, 'Недостаточно ресурсов.');
  change(g, id, -amount);
  e.escrow.push({ teamId: id, amount, kind });
}
function refund(g, e) {
  for (const row of e.escrow) change(g, row.teamId, row.amount, true);
  e.refunded = e.escrow.reduce((n, x) => n + x.amount, 0);
  e.escrow = [];
}
function journal(e, type, data = {}) {
  e.log.push({ id: randomUUID(), type, ...data });
  e.log = e.log.slice(-60);
}
function pauseMain(g, e) {
  const r = g.state.round;
  e.mainRoundId = r?.id || null;
  e.resumeMain = !!(r && !r.resolved && !r.paused);
  if (e.resumeMain) g.pauseRound();
  if (r) delete r.awardPauseUntil;
}
function resumeMain(g, e) {
  if (
    e.resumeMain &&
    g.state.round?.id === e.mainRoundId &&
    g.state.round.paused &&
    !g.state.round.resolved
  )
    g.pauseRound();
  e.resumeMain = false;
}
function eventBase(g, kind, stage) {
  const e = {
    id: randomUUID(),
    kind,
    stage,
    createdAt: g.now(),
    stageAt: g.now(),
    deadline: null,
    paused: false,
    remaining: 0,
    escrow: [],
    fund: 0,
    betFund: 0,
    bets: [],
    teamIds: [],
    fighters: [],
    questions: [],
    questionIndex: -1,
    round: null,
    log: [],
    first: false,
    settled: false,
    history: [],
  };
  pauseMain(g, e);
  system(g).event = e;
  return e;
}
function requireEvent(g, data) {
  const e = system(g).event;
  need(
    e && e.id === data.eventId && ACTIVE.has(e.stage),
    'Событие уже изменилось. Обновите экран.',
  );
  return e;
}
function startFight(g, e, ids, first = false) {
  need(ids.length >= 2, 'Для битвы нужны минимум две команды.');
  e.knownBankIds = g.playableQuestions().map((q) => q.id);
  e.teamIds = [...ids];
  e.first = first;
  e.kind = first ? 'royale' : e.kind;
  if (e.kind === 'royale' || !e.questions.length)
    e.questions = pool(g, e.kind === 'royale');
  e.questionIndex = -1;
  e.round = null;
  e.fighters = ids.map((id) => ({
    id,
    resources: 0,
    economy: 100,
    alive: true,
    members: team(g, id).members.map((m) => m.pid),
  }));
  e.stage = 'intro';
  e.stageAt = g.now();
  e.deadline = g.now() + (first ? 30000 : e.kind === 'royale' ? 5000 : 0);
  journal(e, first ? 'awakening' : 'fight');
}
function nextQuestion(g, e) {
  if (e.questionIndex + 1 >= e.questions.length) {
    if (e.kind === 'war') {
      const [a, b] = e.fighters,
        win =
          a.economy !== b.economy
            ? a.economy > b.economy
              ? a
              : b
            : a.resources !== b.resources
              ? a.resources > b.resources
                ? a
                : b
              : null;
      finish(g, e, win?.id || null, false);
    } else {
      e.stage = 'exhausted';
      e.deadline = null;
      journal(e, 'moreQuestions');
    }
    return;
  }
  e.questionIndex++;
  e.stage = 'question';
  e.stageAt = g.now();
  e.deadline = g.now() + system(g).config.duration * 1000;
  e.round = {
    id: randomUUID(),
    question: clone(e.questions[e.questionIndex]),
    votes: {},
    results: [],
    resolved: false,
  };
}
// Largest remainder, with a deterministic team-ID tie break. No floating-point
// coefficient is used to transfer resources; conservation holds exactly.
export function splitBetFund(bets, winner) {
  const winners = bets.filter((b) => b.side === winner),
    total = bets.reduce((s, b) => s + b.amount, 0),
    base = winners.reduce((s, b) => s + b.amount, 0);
  if (!base) return [];
  const rows = winners.map((b) => ({
    ...b,
    payout: Math.floor((total * b.amount) / base),
    remainder: (total * b.amount) % base,
  }));
  let left = total - rows.reduce((s, r) => s + r.payout, 0);
  rows.sort(
    (a, b) => b.remainder - a.remainder || a.teamId.localeCompare(b.teamId),
  );
  for (const row of rows) if (left-- > 0) row.payout++;
  return rows.map(({ teamId, payout }) => ({ teamId, payout }));
}
function finish(g, e, winner, simultaneous = false) {
  if (e.settled) return;
  const s = system(g);
  if (e.kind === 'war' && !winner) {
    if (simultaneous && e.fund + e.betFund >= 600 && !s.unlocked) {
      e.fund += e.betFund;
      e.betFund = 0;
      startFight(
        g,
        e,
        [...new Set([...e.teamIds, ...e.bets.map((b) => b.teamId)])],
        true,
      );
      return;
    }
    refund(g, e);
    e.outcome = 'draw';
  } else if (winner) {
    const unrestricted = e.first && !s.firstRewardUsed;
    e.payout = change(g, winner, e.fund, unrestricted);
    e.winner = winner;
    e.payouts = [];
    if (e.kind === 'war')
      for (const row of splitBetFund(e.bets, winner)) {
        const applied = change(g, row.teamId, row.payout);
        e.payouts.push({ ...row, applied });
      }
    e.outcome = 'winner';
    e.escrow = [];
    if (unrestricted) s.firstRewardUsed = true;
  } else {
    e.outcome = 'destroyed';
    e.escrow = [];
  }
  if (e.first) s.unlocked = true;
  e.settled = true;
  e.stage = 'result';
  e.stageAt = g.now();
  e.deadline = null;
  resumeMain(g, e);
  journal(e, e.outcome, { winner: winner || null });
  g.log('Фантомное событие завершено: ' + e.outcome + '.');
}
function resolve(g, e) {
  need(
    e.stage === 'question' && e.round && !e.round.resolved,
    'Нет активного вопроса битвы.',
  );
  const r = e.round;
  r.resolved = true;
  // All answers are evaluated before deciding whether anyone has won.
  for (const f of e.fighters.filter((f) => f.alive)) {
    const counts = [0, 0, 0, 0];
    for (const pid of f.members)
      if (Object.hasOwn(r.votes, pid)) counts[r.votes[pid]]++;
    const chosen = counts.findIndex((n) => n > f.members.length / 2),
      correct = chosen === r.question.correct;
    if (correct) {
      if (f.economy < 100) f.economy = Math.min(100, f.economy + 25);
      else f.resources += 25;
    } else f.economy = Math.max(0, f.economy - 20);
    f.alive = f.economy >= 50;
    r.results.push({
      teamId: f.id,
      chosen,
      correct,
      economy: f.economy,
      resources: f.resources,
      alive: f.alive,
    });
    journal(e, correct ? 'correct' : 'wrong', {
      teamId: f.id,
      eliminated: !f.alive,
    });
  }
  const alive = e.fighters.filter((f) => f.alive);
  if (alive.length <= 1) {
    finish(g, e, alive[0]?.id || null, alive.length === 0);
    return;
  }
  e.stage = 'reveal';
  e.stageAt = g.now();
  e.deadline = g.now() + 2500;
}
function finalizeProposal(g, e) {
  const yes = e.electorate.filter((id) => e.proposalVotes[id] === true);
  if (yes.length < Math.ceil((e.electorate.length * 2) / 3)) {
    e.outcome = 'rejected';
    e.stage = 'result';
    e.settled = true;
    resumeMain(g, e);
    return;
  }
  let ids = yes.filter(
    (id) => eligible(g, team(g, id)) && team(g, id).points >= e.contribution,
  );
  let previous;
  do {
    previous = ids.length;
    const fund = ids.length * e.contribution;
    ids = ids.filter((id) => potential(g, team(g, id), fund, e.contribution));
  } while (ids.length !== previous);
  if (ids.length < 2) {
    e.outcome = 'insufficient';
    e.stage = 'result';
    e.settled = true;
    resumeMain(g, e);
    return;
  }
  e.fund = ids.length * e.contribution;
  for (const id of ids) debit(g, e, id, e.contribution, 'contribution');
  startFight(g, e, ids);
}

export function configurePhantom(g, data) {
  const s = system(g);
  need(!phantomActive(g.state), 'Сначала остановите активное событие.');
  const c = { ...s.config, ...data };
  need(
    typeof c.enabled === 'boolean' && typeof c.reduced === 'boolean',
    'Проверьте настройки режима.',
  );
  need(
    INT(c.questionCount, 1, 100) &&
      INT(c.duration, 5, 120) &&
      INT(c.betSeconds, 5, 120),
    'Вопросы: 1–100; время: 5–120 секунд.',
  );
  need(
    typeof c.volume === 'number' &&
      Number.isFinite(c.volume) &&
      c.volume >= 0 &&
      c.volume <= 1,
    'Громкость: 0–1.',
  );
  for (const key of ['questionIds', 'royaleQuestionIds']) {
    need(
      Array.isArray(c[key]) &&
        c[key].length <= 200 &&
        new Set(c[key]).size === c[key].length &&
        c[key].every((id) => g.playableQuestions().some((q) => q.id === id)),
      'Выберите вопросы текущего предмета.',
    );
  }
  s.config = Object.fromEntries(
    Object.keys(initialPhantom().config).map((k) => [k, c[k]]),
  );
  g.touch();
}
export function phantomTeamAction(g, p, data) {
  const s = system(g);
  need(
    s.config.enabled && g.state.settings.mode !== 'solo',
    'Войны доступны в командном формате после включения преподавателем.',
  );
  need(p, 'Войдите в команду.');
  const own = team(g, p.regionId);
  g.member(own.id, p.pid);
  if (data.action === 'answer') {
    const e = requireEvent(g, data),
      f = e.fighters.find((f) => f.id === own.id && f.alive);
    need(
      e.stage === 'question' &&
        !e.paused &&
        e.deadline > (g.phantomInputAt ?? g.now()) &&
        e.round.id === data.roundId &&
        f &&
        f.members.includes(p.pid) &&
        INT(data.option, 0, 3),
      'Ответ не принят: проверьте вопрос, время и участие в битве.',
    );
    e.round.votes[p.pid] = data.option;
    g.touch();
    return;
  }
  captain(g, p);
  if (data.action === 'offer') {
    need(!phantomActive(g.state), 'Дождитесь завершения текущего события.');
    need(eligible(g, own), 'Достигнут лимит 1000. Для войны нужен перк ∞.');
    const to = team(g, data.toTeamId);
    need(
      to.id !== own.id &&
        to.members.length &&
        to.id !== 'creators' &&
        eligible(g, to),
      'Выберите другую доступную команду.',
    );
    need(
      INT(data.amount, 25, MAX_FUND) &&
        data.amount % 25 === 0 &&
        own.points >= data.amount &&
        to.points >= data.amount,
      'Взнос — кратный 25, в пределах ресурсов обеих команд.',
    );
    pool(g);
    const e = eventBase(g, 'war', 'diplomacy');
    e.teamIds = [own.id, to.id];
    e.offeredBy = own.id;
    e.amount = data.amount;
    e.offerVersion = 1;
    e.deadline = g.now() + 120000;
    e.history.push({ teamId: own.id, amount: data.amount });
  } else if (data.action === 'royaleProposal') {
    need(
      s.unlocked && !phantomActive(g.state),
      'Королевская битва ещё не открыта или событие уже идёт.',
    );
    proposal(g, data.amount);
  } else {
    const e = requireEvent(g, data);
    need(!e.paused, 'Событие приостановлено.');
    if (['accept', 'counter', 'reject'].includes(data.action)) {
      need(
        e.stage === 'diplomacy' &&
          e.teamIds.includes(own.id) &&
          e.offerVersion === data.offerVersion,
        'Договор изменился.',
      );
      if (data.action === 'reject') {
        refund(g, e);
        e.outcome = 'rejected';
        e.settled = true;
        e.stage = 'result';
        resumeMain(g, e);
      } else {
        need(e.offeredBy !== own.id, 'Ожидается решение второй команды.');
        if (data.action === 'counter') {
          need(
            e.history.length < 50 &&
              INT(data.amount, 25, MAX_FUND) &&
              data.amount % 25 === 0 &&
              e.teamIds.every((id) => team(g, id).points >= data.amount),
            'Проверьте сумму встречного предложения.',
          );
          e.amount = data.amount;
          e.offeredBy = own.id;
          e.offerVersion++;
          e.history.push({ teamId: own.id, amount: data.amount });
          e.deadline = g.now() + 120000;
        } else {
          need(
            e.teamIds.every(
              (id) =>
                potential(g, team(g, id), 2 * e.amount, e.amount) &&
                team(g, id).points >= e.amount,
            ),
            'Потенциальный выигрыш превысит 1000 или ресурсов недостаточно.',
          );
          e.fund = e.amount * 2;
          for (const id of e.teamIds) debit(g, e, id, e.amount, 'war');
          e.questions = pool(g);
          e.stage = 'betting';
          e.stageAt = g.now();
          e.deadline = g.now() + s.config.betSeconds * 1000;
        }
      }
    } else if (data.action === 'bet') {
      need(
        e.stage === 'betting' &&
          (g.phantomInputAt ?? g.now()) < e.deadline &&
          !e.teamIds.includes(own.id) &&
          !e.bets.some((b) => b.teamId === own.id),
        'Ставки закрыты, либо команда уже участвует.',
      );
      need(
        g.scoreLimit('team', own.id) > 1000 || own.points < 900,
        'Без перка ∞ ставки доступны при ресурсе меньше 900.',
      );
      need(
        INT(data.amount, 1, 400) &&
          e.betFund + data.amount <= 800 &&
          e.teamIds.includes(data.side),
        'Ставка: 1–400; общий фонд ставок — до 800.',
      );
      debit(g, e, own.id, data.amount, 'bet');
      e.bets.push({ teamId: own.id, side: data.side, amount: data.amount });
      e.betFund += data.amount;
    } else if (data.action === 'vote') {
      need(
        e.stage === 'proposal' &&
          (g.phantomInputAt ?? g.now()) < e.deadline &&
          e.electorate.includes(own.id) &&
          typeof data.yes === 'boolean',
        'Голосование закрыто.',
      );
      e.proposalVotes[own.id] = data.yes;
    } else need(false, 'Неизвестное действие команды.');
  }
  g.touch();
}
function proposal(g, amount) {
  need(INT(amount, 25, 400) && amount % 25 === 0, 'Взнос: 25–400 с шагом 25.');
  pool(g, true);
  const electorate = teams(g).map((t) => t.id);
  need(electorate.length >= 2, 'Для голосования нужны минимум две команды.');
  const e = eventBase(g, 'royale', 'proposal');
  e.contribution = amount;
  e.electorate = electorate;
  e.proposalVotes = {};
  e.deadline = g.now() + 60000;
}
export function phantomControl(g, data) {
  const s = system(g);
  if (data.action === 'effects') {
    need(
      typeof data.reduced === 'boolean' &&
        typeof data.volume === 'number' &&
        Number.isFinite(data.volume) &&
        data.volume >= 0 &&
        data.volume <= 1,
      'Проверьте эффекты и громкость.',
    );
    s.config.reduced = data.reduced;
    s.config.volume = data.volume;
    g.touch();
    return;
  }
  if (data.action === 'stop') {
    const e = requireEvent(g, data);
    refund(g, e);
    e.stage = 'result';
    e.settled = true;
    e.deadline = null;
    e.outcome = 'cancelled';
    resumeMain(g, e);
    g.touch();
    return;
  }
  need(
    s.config.enabled && g.state.settings.mode !== 'solo',
    'Включите войны в командном формате.',
  );
  if (data.action === 'proposal') {
    need(
      s.unlocked && !phantomActive(g.state),
      'Режим ещё не открыт или событие уже идёт.',
    );
    proposal(g, data.amount);
  } else if (data.action === 'sponsor') {
    need(
      s.unlocked && !phantomActive(g.state),
      'Режим ещё не открыт или событие уже идёт.',
    );
    need(
      INT(data.fund, 1, MAX_FUND) &&
        Array.isArray(data.teamIds) &&
        new Set(data.teamIds).size === data.teamIds.length,
      'Проверьте фонд и команды.',
    );
    const available = teams(g);
    const ids = data.teamIds.filter((id) =>
      available.some((t) => t.id === id && potential(g, t, data.fund)),
    );
    need(ids.length >= 2, 'После проверки лимита осталось меньше двух команд.');
    pool(g, true);
    const e = eventBase(g, 'royale', 'intro');
    e.sponsored = true;
    e.fund = data.fund;
    startFight(g, e, ids);
  } else {
    const e = requireEvent(g, data);
    if (data.action === 'pause') {
      need(typeof data.paused === 'boolean', 'Проверьте паузу.');
      if (data.paused && !e.paused) {
        e.remaining = e.deadline ? Math.max(1, e.deadline - g.now()) : 0;
        e.deadline = null;
        e.paused = true;
      } else if (!data.paused && e.paused) {
        e.paused = false;
        e.stageAt = g.now();
        if (e.remaining) e.deadline = g.now() + e.remaining;
      }
    } else {
      need(!e.paused, 'Снимите паузу события.');
      if (data.action === 'resolve') resolve(g, e);
      else if (data.action === 'next') {
        need(
          ['reveal', 'exhausted'].includes(e.stage),
          'Дождитесь итогов вопроса.',
        );
        if (e.stage === 'exhausted') {
          const ids = new Set([
              ...e.questions.map((q) => q.id),
              ...(e.knownBankIds || []),
            ]),
            more = clone(
              g
                .playableQuestions()
                .filter((q) => !ids.has(q.id))
                .slice(0, 1000 - e.questions.length),
            );
          need(more.length, 'Добавьте новые вопросы текущего предмета.');
          e.questions.push(...more);
          e.knownBankIds = g.playableQuestions().map((q) => q.id);
        }
        nextQuestion(g, e);
      } else if (data.action === 'start') {
        if (e.stage === 'proposal') finalizeProposal(g, e);
        else {
          need(e.stage === 'betting', 'Ожидается этап ставок.');
          startFight(g, e, e.teamIds);
          nextQuestion(g, e);
        }
      } else need(false, 'Неизвестное действие преподавателя.');
    }
  }
  g.touch();
}
export function phantomDue(g) {
  const e = g.state.phantom?.event;
  return (
    phantomActive(g.state) &&
    !e.paused &&
    e.deadline !== null &&
    e.deadline <= g.now()
  );
}
export function tickPhantom(g) {
  if (!phantomDue(g)) return;
  const e = system(g).event;
  if (e.stage === 'question') resolve(g, e);
  else if (e.stage === 'betting') {
    startFight(g, e, e.teamIds);
    nextQuestion(g, e);
  } else if (e.stage === 'intro' || e.stage === 'reveal') nextQuestion(g, e);
  else if (e.stage === 'proposal') finalizeProposal(g, e);
  else if (e.stage === 'diplomacy') {
    e.outcome = 'expired';
    e.stage = 'result';
    e.settled = true;
    resumeMain(g, e);
  }
  g.touch();
}
export function phantomView(g, player, teacher) {
  const s = g.state.phantom;
  if (!s) return null;
  const e = s.event,
    participating = !!player && !!e?.teamIds.includes(player.regionId),
    manager = teacher && !participating;
  const out = {
    unlocked: s.unlocked,
    config: {
      enabled: s.config.enabled,
      reduced: s.config.reduced,
      volume: s.config.volume,
      duration: s.config.duration,
      questionCount: s.config.questionCount,
      betSeconds: s.config.betSeconds,
      ...(manager
        ? {
            questionIds: s.config.questionIds,
            royaleQuestionIds: s.config.royaleQuestionIds,
          }
        : {}),
    },
    event: null,
  };
  if (!e) return out;
  const { questions, escrow, fighters, round, knownBankIds, ...safe } = e;
  out.event = {
    ...clone(safe),
    questionCount: questions.length,
    fighters: fighters.map(({ members, ...f }) => ({
      ...f,
      total: members.length,
      voted: members.filter((pid) => round && Object.hasOwn(round.votes, pid))
        .length,
    })),
    round: null,
  };
  if (round) {
    const { correct, explanation, source, sourceExcerpt, ...q } =
      round.question;
    out.event.round = {
      id: round.id,
      resolved: round.resolved,
      question: {
        ...clone(q),
        ...(round.resolved || manager ? { correct } : {}),
        ...(round.resolved ? { explanation } : {}),
      },
      results: clone(round.results),
      myVote:
        player && Object.hasOwn(round.votes, player.pid)
          ? round.votes[player.pid]
          : null,
    };
  }
  return out;
}

// Imports and recovery fail closed rather than silently losing an escrow.
export function validatePhantom(state, validateQuestions) {
  const s = state.phantom;
  if (s === undefined) return;
  need(
    s?.version === 1 &&
      typeof s.unlocked === 'boolean' &&
      typeof s.firstRewardUsed === 'boolean',
    'Повреждена система Фантомной зоны.',
  );
  const c = s.config;
  need(
    c &&
      typeof c.enabled === 'boolean' &&
      typeof c.reduced === 'boolean' &&
      typeof c.volume === 'number' &&
      Number.isFinite(c.volume) &&
      c.volume >= 0 &&
      c.volume <= 1 &&
      INT(c.duration, 5, 120) &&
      INT(c.betSeconds, 5, 120) &&
      INT(c.questionCount, 1, 100),
    'Повреждены настройки Фантомной зоны.',
  );
  for (const k of ['questionIds', 'royaleQuestionIds'])
    need(
      Array.isArray(c[k]) &&
        c[k].length <= 200 &&
        c[k].every((id) => typeof id === 'string' && id.length <= 80),
      'Повреждены вопросы Фантомной зоны.',
    );
  const e = s.event;
  if (!e) return;
  const ids = new Set(state.regions.map((t) => t.id));
  need(
    typeof e.id === 'string' &&
      ['war', 'royale'].includes(e.kind) &&
      (ACTIVE.has(e.stage) || e.stage === 'result') &&
      typeof e.settled === 'boolean' &&
      typeof e.paused === 'boolean' &&
      INT(e.remaining, 0, 120000) &&
      INT(e.fund, 0, 2 * MAX_FUND + 800) &&
      INT(e.betFund, 0, 800) &&
      (e.deadline === null || Number.isFinite(e.deadline)) &&
      Number.isFinite(e.createdAt) &&
      Number.isFinite(e.stageAt) &&
      typeof e.first === 'boolean' &&
      typeof e.resumeMain === 'boolean' &&
      e.settled === (e.stage === 'result'),
    'Повреждено событие Фантомной зоны.',
  );
  need(
    Array.isArray(e.teamIds) &&
      e.teamIds.length <= 31 &&
      new Set(e.teamIds).size === e.teamIds.length &&
      e.teamIds.every((id) => ids.has(id)),
    'Повреждены команды битвы.',
  );
  need(
    Array.isArray(e.escrow) &&
      e.escrow.length <= 62 &&
      e.escrow.every(
        (r) =>
          ids.has(r.teamId) &&
          INT(r.amount, 1, MAX_FUND) &&
          ['war', 'bet', 'contribution'].includes(r.kind),
      ),
    'Повреждены взносы битвы.',
  );
  need(
    Array.isArray(e.bets) &&
      e.bets.length <= 30 &&
      e.bets.every(
        (b) => ids.has(b.teamId) && ids.has(b.side) && INT(b.amount, 1, 400),
      ) &&
      e.bets.reduce((n, b) => n + b.amount, 0) <= 800,
    'Повреждены ставки.',
  );
  need(
    Array.isArray(e.questions) && e.questions.length <= 1000,
    'Повреждён банк битвы.',
  );
  validateQuestions(e.questions);
  if (e.knownBankIds !== undefined)
    need(
      Array.isArray(e.knownBankIds) &&
        e.knownBankIds.length <= 1000 &&
        e.knownBankIds.every(
          (id) => typeof id === 'string' && /^[\w-]{1,80}$/.test(id),
        ),
      'Повреждены ссылки банка битвы.',
    );
  need(
    INT(e.questionIndex, -1, Math.max(-1, e.questions.length - 1)),
    'Повреждён порядок вопросов битвы.',
  );
  if (ACTIVE.has(e.stage)) {
    const held = e.escrow.reduce((sum, row) => sum + row.amount, 0);
    need(
      held === (e.sponsored ? 0 : e.fund + (e.kind === 'war' ? e.betFund : 0)),
      'Фонд битвы не совпадает с взносами.',
    );
    if (e.kind === 'war')
      need(
        e.betFund === e.bets.reduce((sum, row) => sum + row.amount, 0),
        'Фонд ставок не совпадает со ставками.',
      );
  }
  need(
    Array.isArray(e.fighters) &&
      e.fighters.length <= 31 &&
      e.fighters.every(
        (f) =>
          ids.has(f.id) &&
          INT(f.resources, 0, 1000000) &&
          INT(f.economy, 0, 100) &&
          typeof f.alive === 'boolean' &&
          Array.isArray(f.members) &&
          f.members.length <= 152 &&
          f.members.every(
            (p) => typeof p === 'string' && /^[\w-]{1,80}$/.test(p),
          ),
      ),
    'Повреждены фантомные показатели.',
  );
  need(
    Array.isArray(e.log) &&
      e.log.length <= 60 &&
      Array.isArray(e.history) &&
      e.history.length <= 50,
    'Повреждён журнал битвы.',
  );
  if (e.stage === 'proposal')
    need(
      Array.isArray(e.electorate) &&
        e.electorate.length <= 30 &&
        e.electorate.every((id) => ids.has(id)) &&
        e.proposalVotes &&
        typeof e.proposalVotes === 'object' &&
        Object.values(e.proposalVotes).every((v) => typeof v === 'boolean') &&
        INT(e.contribution, 25, 400) &&
        e.contribution % 25 === 0,
      'Повреждено голосование.',
    );
  if (e.round) {
    validateQuestions([e.round.question]);
    need(
      typeof e.round.id === 'string' &&
        typeof e.round.resolved === 'boolean' &&
        e.round.votes &&
        Object.values(e.round.votes).every((v) => INT(v, 0, 3)) &&
        Array.isArray(e.round.results),
      'Повреждён вопрос битвы.',
    );
  }
}

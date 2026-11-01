import test from 'node:test';
import assert from 'node:assert/strict';
import { standaloneStudioFixture } from './studio-server-fixture.js';
test('Реальный сервер: роли, защищённые ответы, блокировка основной игры, возврат и доступность модулей', async (t) => {
  const f = await standaloneStudioFixture();
  t.after(() => f.close());
  const teacher = await f.teacher();
  await f.command(teacher, 'setAdmission', { open: true });
  const a = await f.connect(),
    b = await f.connect();
  const joinedA = await f.command(a, 'joinTeam', {
      regionId: 'saryarka',
      name: 'Капитан А',
    }),
    joinedB = await f.command(b, 'joinTeam', {
      regionId: 'jetisu',
      name: 'Капитан Б',
    });
  assert.equal(joinedA.ok, true, joinedA.error);
  assert.equal(joinedB.ok, true, joinedB.error);
  assert.equal(
    (await f.command(a, 'phantomConfigure', { enabled: true })).code,
    'FORBIDDEN',
  );
  for (const id of ['saryarka', 'jetisu'])
    assert.equal(
      (await f.command(teacher, 'adjustPoints', { regionId: id, delta: 500 }))
        .ok,
      true,
    );
  assert.equal(
    (
      await f.command(teacher, 'phantomConfigure', {
        enabled: true,
        questionCount: 3,
        duration: 5,
        betSeconds: 5,
      })
    ).ok,
    true,
  );
  await f.command(teacher, 'addCustomQuestion', {
    text: 'Проверочный вопрос войны?',
    options: ['Первый', 'Второй', 'Третий', 'Четвёртый'],
    correctIdx: 0,
    points: 25,
  });
  const offered = await f.command(a, 'phantomTeam', {
    action: 'offer',
    toTeamId: 'jetisu',
    amount: 150,
  });
  assert.equal(offered.ok, true, offered.error);
  const e = f.server.game.state.phantom.event;
  assert.equal(
    (
      await f.command(b, 'phantomTeam', {
        action: 'accept',
        eventId: e.id,
        offerVersion: e.offerVersion,
      })
    ).ok,
    true,
  );
  assert.equal(
    (await f.command(a, 'phantomControl', { action: 'stop', eventId: e.id }))
      .code,
    'FORBIDDEN',
  );
  assert.equal(
    (
      await f.command(teacher, 'adjustPoints', {
        regionId: 'saryarka',
        delta: 25,
      })
    ).code,
    'PHANTOM_RULE',
  );
  assert.equal(
    (
      await f.command(teacher, 'phantomControl', {
        action: 'start',
        eventId: e.id,
      })
    ).ok,
    true,
  );
  const active = f.server.game.state.phantom.event;
  assert.equal(active.stage, 'question');
  assert.equal(
    (
      await f.command(a, 'phantomTeam', {
        action: 'answer',
        eventId: e.id,
        roundId: 'stale',
        option: 0,
      })
    ).code,
    'PHANTOM_RULE',
  );
  assert.equal(
    (
      await f.command(a, 'phantomTeam', {
        action: 'answer',
        eventId: e.id,
        roundId: active.round.id,
        option: active.round.question.correct,
      })
    ).ok,
    true,
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(a.latest.phantom.event.round.question.correct, undefined);
  assert.equal(
    (
      await f.command(teacher, 'phantomControl', {
        action: 'stop',
        eventId: e.id,
      })
    ).ok,
    true,
  );
  assert.equal(f.server.game.region('saryarka').points, 500);
  for (const asset of ['phantom-ui.js', 'phantom.css'])
    assert.equal((await fetch(f.origin + '/' + asset)).status, 200, asset);
});

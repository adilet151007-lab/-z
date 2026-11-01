import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MobileRoomModel,
  useSimpleRoomBuilder,
} from '../public/mobile-room-builder.js';
import {
  defaultStudio,
  studioElement,
  normalizeStudio,
} from '../../studio-schema.js';
import { studioFixture } from './studio-fixture.mjs';
const q = (id, text = 'Проверочный вопрос?') => ({
  id,
  text,
  options: ['Один', 'Два', 'Три', 'Четыре'],
  correct: 1,
  points: 25,
  duration: 30,
});

test('Mobile list reorders canonical questions with buttons and keeps stable IDs and game data', () => {
  const model = new MobileRoomModel({
    name: 'Мобильная пара',
    subject: 'История',
    questions: [
      q('one'),
      {
        ...q('two'),
        resourceDelta: 50,
        economyDelta: 10,
        explanation: 'Источник материала',
      },
    ],
  });
  const [first, second] = model.cards;
  model.move(second.id, -1);
  assert.equal(model.read().questions[0].id, 'two');
  assert.equal(model.read().questions[0].resourceDelta, 50);
  assert.equal(model.read().questions[0].explanation, 'Источник материала');
  model.remove(first.id);
  assert.equal(model.read().questions.length, 1);
  model.setup.config.duration = '45';
  model.addQuestions([q('three')]);
  assert.equal(model.read().canvasData.settings.startId, second.id);
});
test('Opening a branched desktop scenario on mobile preserves connections, events, frames and layouts', () => {
  const doc = defaultStudio([q('one'), q('two'), q('three')]),
    trigger = studioElement('economy-trigger-node', 400, 300, {
      resourceDelta: 75,
    });
  doc.elements.push(trigger);
  doc.connections = [
    {
      id: 'correct',
      from: doc.elements[0].id,
      to: trigger.id,
      condition: 'correct',
    },
    {
      id: 'reward',
      from: trigger.id,
      to: doc.elements[1].id,
      condition: 'next',
    },
    {
      id: 'wrong',
      from: doc.elements[0].id,
      to: doc.elements[2].id,
      condition: 'wrong',
    },
  ];
  const model = new MobileRoomModel({
      name: 'Особый маршрут',
      canvasData: doc,
    }),
    before = normalizeStudio(doc);
  assert.equal(model.simple, false);
  model.cards[0].data.text = 'Уточнённый вопрос без изменения маршрута?';
  const saved = model.read().canvasData;
  assert.deepEqual(saved.connections, before.connections);
  assert.deepEqual(saved.roomUiLayout, before.roomUiLayout);
  assert.deepEqual(
    saved.elements.find((e) => e.id === trigger.id),
    before.elements.find((e) => e.id === trigger.id),
  );
  assert.throws(() => model.move(model.cards[0].id, 1));
  assert.throws(() => model.remove(model.cards[0].id));
});
test('Compact validation rejects duplicate answers and invalid numbers while a local draft retains incomplete work', () => {
  const model = new MobileRoomModel();
  model.addQuestions([
    { text: '', options: ['', '', '', ''], correct: null, points: 25 },
  ]);
  assert.throws(() => model.read());
  const restored = new MobileRoomModel();
  restored.restore(model.draft());
  assert.equal(restored.cards[0].data.text, '');
  restored.cards[0].data = { ...restored.cards[0].data, ...q('valid') };
  restored.setup.config.capacity = '';
  assert.throws(() => restored.read(), /Мест/);
  restored.setup.config.capacity = 4;
  restored.cards[0].data.options[1] = 'Один';
  assert.throws(() => restored.read(), /четыре разных/);
});
test('Mobile geometry is never required and an unchanged designer preserves optional features and custom styling', () => {
  const model = new MobileRoomModel({
    name: 'Обычная пара',
    features: { chat: false, economyControl: true },
    design: { accent: '#8b5cf6', gold: '#eab308' },
    questions: [q('one')],
  });
  const widget = model.document.roomUiLayout.teacher.find(
    (e) => e.data.blockId === 'teams',
  );
  widget.data.teamCount = 13;
  widget.data.capacity = 6;
  const existing = new MobileRoomModel({ canvasData: model.document });
  const kept = existing
    .read()
    .canvasData.roomUiLayout.teacher.find((e) => e.data.blockId === 'teams');
  assert.equal(kept.data.teamCount, 13);
  assert.equal(kept.data.capacity, 6);
  const saved = model.read();
  assert.equal(saved.features.chat, false);
  assert.equal(saved.features.economyControl, true);
  assert.equal(saved.config.accent, '#8b5cf6');
  assert.equal(saved.questions[0].correct, 1);
  const old = globalThis.matchMedia;
  try {
    globalThis.matchMedia = () => ({ matches: true });
    assert.equal(useSimpleRoomBuilder(), true);
    globalThis.matchMedia = () => ({ matches: false });
    assert.equal(useSimpleRoomBuilder(), false);
  } finally {
    if (old === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = old;
  }
});
test('Beta API creates a playable mobile room with questions and features without creating a spare template', async (t) => {
  const f = await studioFixture();
  t.after(() => f.server.close());
  const model = new MobileRoomModel({
      name: 'Пара с телефона',
      subject: 'Мәдениеттану',
      questions: [q('mobile_api')],
      features: { chat: false },
    }),
    before = (await f.platform.templates('google:owner')).length;
  const response = await f.api('creator/rooms/create', {
    ...model.read(),
    sources: {
      js: 'throw new Error("must never execute")',
      css: 'body{display:none}',
    },
  });
  assert.equal(response.status, 201, await response.clone().text());
  const { room } = await response.json(),
    runtime = await f.server.runtime.get(room.id),
    g = runtime.server.game;
  assert.equal(g.state.questions[0].id, 'mobile_api');
  assert.equal((await f.platform.templates('google:owner')).length, before);
  assert.equal(
    (await f.platform.room(room.id)).configuration.features.chat,
    false,
  );
  g.startRound('mobile_api', 30);
  assert.equal(g.state.round.questionSnapshot.correct, 1);
  for (const asset of ['mobile-room-builder.js', 'mobile-room-builder.css'])
    assert.equal((await fetch(f.origin + '/' + asset)).status, 200);
});
test('Invalid wizard questions are rejected before creating a room or mutating existing rooms', async (t) => {
  const f = await studioFixture();
  t.after(() => f.server.close());
  const before = await f.platform.store.read(
    (s) => Object.keys(s.rooms).length,
  );
  const response = await f.api('creator/rooms/create', {
    name: 'Ошибка вопроса',
    subject: 'Мәдениеттану',
    questions: [
      { ...q('invalid'), options: ['Один', 'Один', 'Три', 'Четыре'] },
    ],
  });
  assert.equal(response.status, 400);
  assert.equal(
    await f.platform.store.read((s) => Object.keys(s.rooms).length),
    before,
  );
});

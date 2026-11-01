import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ROOM_PRESETS, roomPreset } from '../../room-presets.js';
import { ROOM_FEATURES } from '../../room-layout.js';
import { MobileRoomModel } from '../public/mobile-room-builder.js';
import { studioFixture } from './studio-fixture.mjs';

test('Three built-in presets have distinct levels and Full enables every room feature including wars', async () => {
  assert.deepEqual(
    ROOM_PRESETS.map((p) => p.name),
    ['Обычный', 'Продвинутый', 'Все функции'],
  );
  const values = ROOM_PRESETS.map((p) => roomPreset(p.id));
  assert.ok(
    Object.values(values[0].features).filter(Boolean).length <
      Object.values(values[1].features).filter(Boolean).length,
  );
  assert.ok(
    Object.values(values[1].features).filter(Boolean).length <
      Object.values(values[2].features).filter(Boolean).length,
  );
  for (const key of Object.keys(ROOM_FEATURES))
    assert.equal(values[2].features[key], true, key);
  assert.equal(values[2].config.warsEnabled, true);
  assert.equal(values[0].config.warsEnabled, false);
  values[2].features.map = false;
  assert.equal(roomPreset('full').features.map, true);
  assert.throws(() => roomPreset('unknown'));
  assert.equal(
    await readFile(new URL('../../room-presets.js', import.meta.url), 'utf8'),
    await readFile(
      new URL('../public/room-presets.js', import.meta.url),
      'utf8',
    ),
  );
});
test('Selecting a ready set preserves names, questions, route, mode and class capacity', () => {
  const q = {
    id: 'keep_question',
    text: 'Сохранится ли вопрос?',
    options: ['Да', 'Нет', 'Иногда', 'Не знаю'],
    correct: 0,
    points: 25,
  };
  const m = new MobileRoomModel({
      name: 'Моё занятие',
      subject: 'Мәдениеттану',
      questions: [q],
      config: { teamCount: 13, capacity: 6, duration: 45 },
    }),
    before = structuredClone(m.document);
  m.applyPreset('full');
  let value = m.read();
  assert.equal(value.presetId, 'full');
  assert.equal(value.config.warsEnabled, true);
  assert.equal(value.config.teamCount, 13);
  assert.equal(value.config.capacity, 6);
  assert.equal(value.name, 'Моё занятие');
  assert.equal(value.questions[0].id, q.id);
  assert.deepEqual(m.document, before);
  m.applyPreset('standard');
  value = m.read();
  assert.equal(value.config.perksEnabled, false);
  assert.equal(value.config.tradingEnabled, false);
  assert.equal(value.config.warsEnabled, false);
  assert.equal(value.questions.length, 1);
  const restored = new MobileRoomModel();
  restored.restore(m.draft());
  assert.equal(restored.presetId, 'standard');
});
test('Every ready preset creates the requested real room and does not consume saved-template slots', async (t) => {
  const f = await studioFixture();
  t.after(() => f.server.close());
  for (const preset of ROOM_PRESETS) {
    const response = await f.api('creator/rooms/create', {
      name: 'Готовый · ' + preset.name,
      presetId: preset.id,
    });
    assert.equal(response.status, 201, await response.clone().text());
    const { room } = await response.json(),
      record = await f.platform.room(room.id),
      runtime = await f.server.runtime.get(room.id),
      expected = roomPreset(preset.id);
    assert.deepEqual(record.configuration.features, expected.features);
    assert.equal(
      runtime.server.game.state.phantom.config.enabled,
      preset.warsEnabled,
    );
    assert.equal(runtime.server.game.state.phantom.event, null);
    assert.equal(
      runtime.server.game.state.settings.perksEnabled,
      expected.config.perksEnabled,
    );
    assert.equal(
      runtime.server.game.state.settings.tradeEnabled,
      expected.config.tradingEnabled,
    );
  }
  assert.equal((await f.platform.templates('google:owner')).length, 0);
});
test('Full saved templates retain war settings and explicit custom choices override preset defaults', async (t) => {
  const f = await studioFixture();
  t.after(() => f.server.close());
  const saved = await (
    await f.api('creator/templates/save', {
      value: roomPreset('full', { name: 'Полный шаблон' }),
      expectedVersion: 0,
    })
  ).json();
  assert.ok(saved.id);
  const response = await f.api('creator/rooms/create', {
    templateId: saved.id,
  });
  assert.equal(response.status, 201);
  let { room } = await response.json();
  assert.equal(
    (await f.server.runtime.get(room.id)).server.game.state.phantom.config
      .enabled,
    true,
  );
  const custom = await f.api('creator/rooms/create', {
    name: 'Своя настройка',
    presetId: 'full',
    config: { warsEnabled: false },
    features: { map: false },
  });
  assert.equal(custom.status, 201);
  ({ room } = await custom.json());
  assert.equal(
    (await f.platform.room(room.id)).configuration.features.map,
    false,
  );
  assert.equal(
    (await f.server.runtime.get(room.id)).server.game.state.phantom.config
      .enabled,
    false,
  );
  const before = await f.platform.store.read(
    (s) => Object.keys(s.rooms).length,
  );
  for (const raw of [
    { presetId: 'missing', name: 'Ошибка' },
    { presetId: 'full', name: 'Ошибка', config: { warsEnabled: 'yes' } },
  ])
    assert.equal((await f.api('creator/rooms/create', raw)).status, 400);
  assert.equal(
    await f.platform.store.read((s) => Object.keys(s.rooms).length),
    before,
  );
});
test('Ready sets cannot bypass creator access', async (t) => {
  const f = await studioFixture('teacher');
  t.after(() => f.server.close());
  const response = await f.api('creator/rooms/create', {
    name: 'Нет доступа',
    presetId: 'full',
  });
  assert.equal(response.status, 403);
});

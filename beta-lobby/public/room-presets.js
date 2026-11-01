import { ROOM_FEATURES, normalizeDesign } from './room-layout.js';

const ordinary = [
  'map',
  'ranking',
  'questionEditor',
  'teamManagement',
  'playerManagement',
  'gameRules',
];
const advanced = Object.keys(ROOM_FEATURES).filter(
  (key) => !['music', 'customCode', 'presentationEffects'].includes(key),
);
export const ROOM_PRESETS = Object.freeze(
  [
    {
      id: 'standard',
      name: 'Обычный',
      description: 'Карта, команды, вопросы и рейтинг.',
      keys: ordinary,
      warsEnabled: false,
    },
    {
      id: 'advanced',
      name: 'Продвинутый',
      description: 'Чат, достижения, силлабус, обмен, экономика и бэкапы.',
      keys: advanced,
      warsEnabled: false,
    },
    {
      id: 'full',
      name: 'Все функции',
      description:
        'Все возможности комнаты, включая войны, музыку и технические настройки.',
      keys: Object.keys(ROOM_FEATURES),
      warsEnabled: true,
    },
  ].map((p) => Object.freeze({ ...p, keys: Object.freeze([...p.keys]) })),
);

export function roomPreset(
  id,
  { name = 'Новая пара', subject = 'Мәдениеттану' } = {},
) {
  const preset = ROOM_PRESETS.find((p) => p.id === id);
  if (!preset)
    throw Object.assign(new Error('Неизвестный готовый шаблон.'), {
      code: 'AUTHORING_VALIDATION',
    });
  const features = Object.fromEntries(
    Object.keys(ROOM_FEATURES).map((key) => [key, preset.keys.includes(key)]),
  );
  return {
    name,
    subject,
    type: 'strategy',
    config: {
      mode: 'team',
      decision: 'instant',
      teamCount: 10,
      capacity: 4,
      duration: 60,
      autoAdvance: true,
      perksEnabled: features.achievements,
      tradingEnabled: features.trading,
      warsEnabled: preset.warsEnabled,
      accent: '#14b8a6',
      gold: '#eab308',
    },
    features,
    design: normalizeDesign({ accent: '#14b8a6', gold: '#eab308' }),
    questions: [],
    sources: { css: '', js: '' },
  };
}
export function matchingRoomPreset(features, config) {
  return (
    ROOM_PRESETS.find(
      (p) =>
        p.warsEnabled === (config.warsEnabled === true) &&
        Object.keys(ROOM_FEATURES).every(
          (key) => features[key] === p.keys.includes(key),
        ),
    )?.id || ''
  );
}

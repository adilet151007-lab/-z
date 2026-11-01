import {
  defaultStudio,
  normalizeStudio,
  compileStudio,
  orderedStudioNodes,
  studioElement,
  studioId,
} from './studio-schema.js';
import {
  normalizeFeatures,
  normalizeDesign,
  ROOM_FEATURES,
} from './room-layout.js';
import { readSyllabusFile } from './syllabus-files.js';
import {
  ROOM_PRESETS,
  roomPreset,
  matchingRoomPreset,
} from './room-presets.js';

export function useSimpleRoomBuilder() {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(max-width: 760px), (pointer: coarse) and (max-width: 1100px)')
      .matches
  );
}
const copy = (value) => structuredClone(value);
const node = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
const fail = (message) => {
  throw new Error(message);
};
const int = (value, min, max, label) => {
  const n = typeof value === 'number' ? value : Number(value);
  if (value === '' || !Number.isSafeInteger(n) || n < min || n > max)
    fail(label + ': от ' + min + ' до ' + max + '.');
  return n;
};

// The compact UI edits the canonical Studio document. It never replaces an
// existing route, frame or room layout merely because it was opened on a phone.
export class MobileRoomModel {
  constructor(initial = {}) {
    this.document =
      normalizeStudio(initial.canvasData) ||
      defaultStudio(initial.questions || []);
    this.features = normalizeFeatures(initial.features);
    this.design = normalizeDesign(
      initial.design || {
        accent: initial.config?.accent || '#14b8a6',
        gold: initial.config?.gold || '#eab308',
      },
    );
    const teamWidget = this.document.roomUiLayout.teacher.find(
      (e) => e.type === 'widget' && e.data.blockId === 'teams',
    );
    this.setup = {
      name: initial.name || 'Новая пара',
      subject: initial.subject || 'Мәдениеттану',
      type: initial.type || 'strategy',
      config: {
        mode: 'team',
        decision: 'consensus',
        teamCount: teamWidget?.data.teamCount ?? 10,
        capacity: teamWidget?.data.capacity ?? 4,
        duration: 60,
        autoAdvance: true,
        perksEnabled: true,
        tradingEnabled: false,
        warsEnabled: false,
        ...initial.config,
      },
    };
  }
  get cards() {
    return orderedStudioNodes(this.document);
  }
  get presetId() {
    return matchingRoomPreset(this.features, this.setup.config);
  }
  applyPreset(id) {
    const p = roomPreset(id);
    this.features = p.features;
    for (const key of ['perksEnabled', 'tradingEnabled', 'warsEnabled'])
      this.setup.config[key] = p.config[key];
  }
  get simple() {
    return (
      this.document.elements.every(
        (e) =>
          e.type !== 'economy-trigger-node' &&
          e.type !== 'lesson-defense-card' &&
          (e.type !== 'quiz-card' || !e.hidden),
      ) &&
      this.document.connections.every(
        (c) =>
          c.condition === 'next' &&
          this.document.elements.find((e) => e.id === c.from)?.type ===
            'quiz-card' &&
          this.document.elements.find((e) => e.id === c.to)?.type ===
            'quiz-card',
      )
    );
  }
  linearize(order) {
    this.document.connections = order.slice(1).map((id, i) => ({
      id: studioId(),
      from: order[i],
      to: id,
      condition: 'next',
    }));
    this.document.settings.startId = order[0] || null;
  }
  addQuestions(questions) {
    if (!this.simple)
      fail(
        'В этом шаблоне есть ветвления или события. Здесь можно изменить текст вопросов, сохранив маршрут. Для нового линейного занятия выберите «Новый шаблон».',
      );
    if (this.cards.length + questions.length > 100)
      fail('В занятии может быть до 100 вопросов.');
    if (this.document.elements.length + questions.length > 400)
      fail('Достигнут лимит элементов шаблона.');
    const order = this.cards.map((e) => e.id),
      added = [];
    for (const q of questions) {
      const e = studioElement(
        'quiz-card',
        (order.length % 4) * 420,
        Math.floor(order.length / 4) * 410,
        {
          ...q,
          questionId: q.id || 'mobile_' + studioId(),
          duration: Number(q.duration || this.setup.config.duration),
        },
      );
      this.document.elements.push(e);
      order.push(e.id);
      added.push(e);
    }
    this.linearize(order);
    return added;
  }
  remove(id) {
    if (!this.simple)
      fail(
        'Удаление изменит сложный маршрут. На телефоне доступно редактирование содержания.',
      );
    const order = this.cards.filter((e) => e.id !== id).map((e) => e.id);
    this.document.elements = this.document.elements.filter((e) => e.id !== id);
    this.linearize(order);
  }
  move(id, direction) {
    if (!this.simple) fail('Порядок сложного сценария сохранён.');
    const order = this.cards.map((e) => e.id),
      at = order.indexOf(id),
      next = at + direction;
    if (at < 0 || next < 0 || next >= order.length) return;
    [order[at], order[next]] = [order[next], order[at]];
    this.linearize(order);
  }
  read() {
    const s = copy(this.setup),
      c = s.config;
    s.name = s.name.trim();
    s.subject = s.subject.trim();
    if (
      s.name.length < 2 ||
      s.name.length > 80 ||
      s.subject.length < 2 ||
      s.subject.length > 80
    )
      fail('Название и предмет: от 2 до 80 символов.');
    c.teamCount = int(c.teamCount, 1, 30, 'Команд');
    c.capacity = int(c.capacity, 1, 20, 'Мест в команде');
    c.duration = int(c.duration, 5, 3600, 'Время вопроса');
    const canvasData = copy(this.document);
    canvasData.settings.subject = s.subject;
    for (const surface of Object.values(canvasData.roomUiLayout))
      for (const e of surface)
        if (e.type === 'widget' && e.data.blockId === 'teams') {
          if (e.data.teamCount !== undefined) e.data.teamCount = c.teamCount;
          if (e.data.capacity !== undefined) e.data.capacity = c.capacity;
        }
    const compiled = compileStudio(canvasData);
    c.accent = this.design.accent;
    c.gold = this.design.gold;
    c.perksEnabled = this.features.achievements;
    c.tradingEnabled = this.features.trading;
    return {
      presetId: this.presetId || undefined,
      ...s,
      config: c,
      canvasData: compiled.canvasData,
      questions: compiled.questions,
      features: normalizeFeatures(this.features),
      design: normalizeDesign(this.design),
    };
  }
  draft() {
    return {
      setup: copy(this.setup),
      canvasData: copy(this.document),
      features: copy(this.features),
      design: copy(this.design),
    };
  }
  restore(raw) {
    const next = new MobileRoomModel({
      ...raw.setup,
      canvasData: raw.canvasData,
      features: raw.features,
      design: raw.design,
    });
    this.setup = next.setup;
    this.document = next.document;
    this.features = next.features;
    this.design = next.design;
  }
}

export function createMobileRoomDesigner(initial = {}, options = {}) {
  const live = options.roomState;
  if (live) {
    const values = {
      mode: live.mode || live.settings?.mode,
      teamCount: live.teams?.length,
      capacity: live.settings?.teamCapacity,
      duration: live.settings?.autoDuration,
      autoAdvance: live.settings?.autoAdvance,
    };
    initial = {
      ...initial,
      config: {
        ...Object.fromEntries(
          Object.entries(values).filter(([, v]) => v !== undefined),
        ),
        ...initial.config,
      },
    };
  }
  const model = new MobileRoomModel(initial),
    root = node('section', undefined, 'room-designer simple-room-builder'),
    toolbar = node('div', undefined, 'designer-toolbar simple-builder-heading');
  root.dataset.simpleBuilder = 'true';
  toolbar.append(
    node(
      'strong',
      options.includeSetup ? 'Быстрое создание занятия' : 'Настройки занятия',
    ),
    node('span', 'Обычные шаги и кнопки · без холста'),
  );
  const navigation = node('nav', undefined, 'simple-builder-steps'),
    body = node('div', undefined, 'simple-builder-body'),
    footer = node('div', undefined, 'simple-builder-footer'),
    status = node('p', '', 'simple-builder-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const includeSetup = options.includeSetup === true,
    steps = includeSetup
      ? ['Занятие', 'Вопросы', 'Оформление', 'Готово']
      : ['Вопросы', 'Оформление', 'Готово'];
  let step = 0,
    busy = false,
    importText = '',
    restored = false,
    saveTimer = null,
    disposed = false,
    draftCleared = false;
  const draftKey =
    'cq_simple_room_v1:' +
    String(options.contextKey || 'new') +
    ':' +
    String(options.baseVersion || 0);
  try {
    const raw = localStorage.getItem(draftKey);
    if (raw) {
      model.restore(JSON.parse(raw));
      restored = true;
    }
  } catch {}
  root.append(toolbar, navigation, body, footer, status);
  function report(text, error = false) {
    status.textContent = text;
    status.classList.toggle('is-error', error);
  }
  function persist() {
    clearTimeout(saveTimer);
    if (draftCleared) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(model.draft()));
    } catch {
      report(
        'Не удалось сохранить черновик на устройстве. Сохраните занятие кнопкой ниже.',
        true,
      );
    }
  }
  function changed() {
    if (disposed) return;
    draftCleared = false;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 300);
    root.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function clearDraft() {
    draftCleared = true;
    clearTimeout(saveTimer);
    try {
      localStorage.removeItem(draftKey);
    } catch {}
  }
  function actionButton(text, fn, cls = 'button button-outline') {
    const b = node('button', text, cls);
    b.type = 'button';
    b.addEventListener('click', () => {
      if (busy) return;
      try {
        fn();
      } catch (e) {
        report(e.message, true);
      }
    });
    return b;
  }
  function field(
    host,
    label,
    value,
    update,
    { type = 'text', min, max, maxLength = 2000, required = true } = {},
  ) {
    const l = node('label', label),
      i = node(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') i.type = type;
    else i.rows = 3;
    i.value = value ?? '';
    i.required = required;
    if (min !== undefined) i.min = min;
    if (max !== undefined) i.max = max;
    i.maxLength = maxLength;
    if (type === 'number') i.step = '1';
    i.addEventListener('input', () => {
      update(i.value);
      changed();
    });
    l.append(i);
    host.append(l);
    return i;
  }
  function select(host, label, rows, value, update) {
    const l = node('label', label),
      s = node('select');
    s.setAttribute('aria-label', label);
    for (const [id, text] of rows) {
      const o = node('option', text);
      o.value = id;
      s.append(o);
    }
    s.value = value;
    s.addEventListener('change', () => {
      update(s.value);
      changed();
    });
    l.append(s);
    host.append(l);
    return s;
  }
  function check(host, label, value, update) {
    const l = node('label', label, 'simple-builder-check'),
      i = node('input');
    i.type = 'checkbox';
    i.checked = !!value;
    i.addEventListener('change', () => {
      update(i.checked);
      changed();
    });
    l.prepend(i);
    host.append(l);
    return i;
  }
  async function run(fn) {
    if (busy) return;
    busy = true;
    root.setAttribute('aria-busy', 'true');
    const old = new Map(
      [...root.querySelectorAll('button,input,select,textarea')].map((n) => [
        n,
        n.disabled,
      ]),
    );
    for (const n of old.keys()) n.disabled = true;
    report('Подождите…');
    try {
      const result = await fn();
      if (result !== false) {
        if (status.textContent === 'Подождите…') report('Готово.');
      } else
        report(
          document.getElementById('creator-message')?.textContent ||
            'Не удалось сохранить. Проверьте данные.',
          true,
        );
      return result;
    } catch (e) {
      report(e.message, true);
      return false;
    } finally {
      busy = false;
      root.setAttribute('aria-busy', 'false');
      for (const [n, value] of old) if (n.isConnected) n.disabled = value;
    }
  }
  function validateCurrent() {
    for (const n of body.querySelectorAll('input,textarea,select'))
      if (!n.checkValidity()) {
        n.reportValidity();
        n.focus();
        return false;
      }
    try {
      if (steps[step] === 'Занятие') {
        const c = model.setup.config;
        int(c.teamCount, 1, 30, 'Команд');
        int(c.capacity, 1, 20, 'Мест в команде');
        int(c.duration, 5, 3600, 'Время вопроса');
      }
      if (steps[step] === 'Вопросы') compileStudio(model.document);
      return true;
    } catch (e) {
      report(e.message, true);
      return false;
    }
  }
  function go(index) {
    if (index > step && !validateCurrent()) return;
    step = index;
    report('');
    render();
    body.querySelector('input,textarea,select')?.focus({ preventScroll: true });
    navigation.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }
  function setupPage() {
    const s = model.setup,
      c = s.config;
    const presets = node('div', undefined, 'simple-template-presets');
    presets.setAttribute('role', 'group');
    presets.setAttribute('aria-label', 'Готовые шаблоны комнаты');
    for (const p of ROOM_PRESETS) {
      const b = actionButton(p.name, () => {
        model.applyPreset(p.id);
        changed();
        render();
      });
      b.textContent = '';
      b.dataset.roomPreset = p.id;
      b.setAttribute('aria-label', p.name);
      b.setAttribute('aria-pressed', String(model.presetId === p.id));
      b.append(node('strong', p.name), node('span', p.description));
      presets.append(b);
    }
    body.append(presets);
    field(body, 'Название занятия', s.name, (v) => (s.name = v), {
      maxLength: 80,
      min: 2,
    }).minLength = 2;
    field(body, 'Предмет', s.subject, (v) => (s.subject = v), {
      maxLength: 80,
    }).minLength = 2;
    if (options.onCreate) {
      body.append(
        node(
          'p',
          'Набор функций уже настроен. Вопросы можно добавить после создания.',
          'simple-builder-note',
        ),
      );
      body.append(
        actionButton(
          'Создать сразу',
          () =>
            run(async () => {
              const result = await options.onCreate(model.read());
              if (result !== false) clearDraft();
              return result;
            }),
          'button button-gold',
        ),
      );
    }
    select(
      body,
      'Формат',
      [
        ['strategy', 'Команды с картой'],
        ['quiz', 'Личная викторина'],
        ['blitz', 'Блиц · 15 секунд'],
      ],
      s.type,
      (v) => {
        s.type = v;
        c.mode = v === 'strategy' ? 'team' : 'solo';
        if (v === 'blitz') c.duration = 15;
        render();
      },
    );
    if (c.mode === 'team') {
      const row = node('div', undefined, 'simple-builder-fields');
      field(row, 'Команд', c.teamCount, (v) => (c.teamCount = v), {
        type: 'number',
        min: 1,
        max: 30,
      });
      field(row, 'Мест в команде', c.capacity, (v) => (c.capacity = v), {
        type: 'number',
        min: 1,
        max: 20,
      });
      body.append(row);
    }
    field(body, 'Время вопроса, секунд', c.duration, (v) => (c.duration = v), {
      type: 'number',
      min: 5,
      max: 3600,
    });
    check(
      body,
      'Следующий вопрос автоматически',
      c.autoAdvance,
      (v) => (c.autoAdvance = v),
    );
    const advanced = node('details');
    advanced.append(node('summary', 'Дополнительные правила'));
    select(
      advanced,
      'Ответ команды',
      [
        ['consensus', 'Совместное решение'],
        ['instant', 'Без подтверждения лидера'],
        ['leader', 'Лидер после голосования'],
      ],
      c.decision,
      (v) => (c.decision = v),
    );
    body.append(advanced);
  }
  function cardEditor(card, index, total) {
    const d = node('details', undefined, 'simple-question'),
      summary = node('summary'),
      title = node(
        'span',
        index + 1 + '. ' + (card.data.text || 'Новый вопрос'),
      );
    summary.append(title);
    d.append(summary);
    field(
      d,
      'Вопрос',
      card.data.text,
      (v) => {
        card.data.text = v;
        card.name = v.slice(0, 70);
        title.textContent = index + 1 + '. ' + (v || 'Новый вопрос');
      },
      { type: 'textarea', maxLength: 2000 },
    );
    for (let i = 0; i < 4; i++)
      field(
        d,
        'Вариант ' + String.fromCharCode(65 + i),
        card.data.options[i] || '',
        (v) => (card.data.options[i] = v),
        { maxLength: 500 },
      );
    select(
      d,
      'Правильный ответ',
      [
        ['', 'Выберите'],
        ['0', 'A'],
        ['1', 'B'],
        ['2', 'C'],
        ['3', 'D'],
      ],
      card.data.correct ?? '',
      (v) => (card.data.correct = v === '' ? null : Number(v)),
    );
    const advanced = node('details', undefined, 'simple-question-extra');
    advanced.append(node('summary', 'Баллы, время и пояснение'));
    field(
      advanced,
      'Баллы',
      card.data.points,
      (v) => (card.data.points = Number(v)),
      { type: 'number', min: 1, max: 1000 },
    );
    field(
      advanced,
      'Время, секунд',
      card.data.duration,
      (v) => (card.data.duration = Number(v)),
      { type: 'number', min: 5, max: 3600 },
    );
    field(
      advanced,
      'Тема',
      card.data.topic || '',
      (v) => (card.data.topic = v),
      { maxLength: 200, required: false },
    );
    field(
      advanced,
      'Пояснение',
      card.data.explanation || '',
      (v) => (card.data.explanation = v),
      { type: 'textarea', maxLength: 1200, required: false },
    );
    d.append(advanced);
    if (model.simple) {
      const row = node('div', undefined, 'simple-question-actions'),
        up = actionButton('↑ Выше', () => {
          model.move(card.id, -1);
          changed();
          render();
        }),
        down = actionButton('↓ Ниже', () => {
          model.move(card.id, 1);
          changed();
          render();
        });
      up.disabled = index === 0;
      down.disabled = index === total - 1;
      row.append(
        up,
        down,
        actionButton('Удалить вопрос', () => {
          if (!confirm('Удалить этот вопрос?')) return;
          model.remove(card.id);
          changed();
          render();
        }),
      );
      d.append(row);
    }
    return d;
  }
  function questionsPage() {
    const cards = model.cards;
    body.append(
      node('p', 'Вопросов: ' + cards.length + ' / 100', 'simple-builder-count'),
    );
    if (!model.simple)
      body.append(
        node(
          'p',
          'У этого шаблона есть особый маршрут. Текст и ответы можно менять здесь; связи и события сохраняются.',
          'simple-builder-note',
        ),
      );
    if (model.simple) {
      body.append(
        actionButton('+ Добавить вопрос', () => {
          const [card] = model.addQuestions([
            { text: '', options: ['', '', '', ''], correct: null, points: 25 },
          ]);
          changed();
          render();
          const d = body.querySelector('[data-card="' + card.id + '"]');
          if (d) {
            d.open = true;
            d.querySelector('textarea')?.focus();
          }
        }),
      );
      if (options.generate) {
        const importer = node('details', undefined, 'simple-document');
        importer.append(
          node('summary', 'Добавить из документа · PDF, DOCX, TXT'),
        );
        const file = node('input');
        file.type = 'file';
        file.accept = '.pdf,.docx,.txt';
        file.setAttribute('aria-label', 'Документ с вопросами или материалом');
        const text = field(
          importer,
          'Или вставьте текст',
          importText,
          (v) => (importText = v),
          { type: 'textarea', maxLength: 120000, required: false },
        );
        file.addEventListener('change', () => {
          const selected = file.files[0];
          if (selected)
            run(async () => {
              importText = await readSyllabusFile(selected, (message) =>
                report(message),
              );
              text.value = importText;
              report('Документ прочитан. Нажмите «Подготовить вопросы».');
            });
        });
        importer.prepend(file);
        const count = field(
          importer,
          'Сколько вопросов подготовить',
          20,
          () => {},
          { type: 'number', min: 1, max: 60 },
        );
        importer.append(
          actionButton('Подготовить вопросы', () =>
            run(async () => {
              if (!importText.trim())
                throw Error('Загрузите документ или вставьте текст.');
              const wanted = Math.min(
                int(count.value, 1, 60, 'Количество вопросов'),
                100 - model.cards.length,
              );
              if (!wanted) throw Error('В занятии уже 100 вопросов.');
              const analysis = await options.analyze(importText),
                result = await options.generate(
                  importText,
                  analysis.topics || [],
                  wanted,
                  {},
                );
              if (!result.questions?.length)
                throw Error(
                  'Не удалось найти готовые вопросы. Добавьте больше учебного текста или создайте вопрос вручную.',
                );
              model.addQuestions(result.questions);
              changed();
              render();
              report(
                'Добавлено вопросов: ' +
                  result.questions.length +
                  '. Проверьте формулировки и ответы.',
              );
            }),
          ),
        );
        body.append(importer);
      }
    }
    if (!cards.length)
      body.append(
        node(
          'p',
          'Добавьте свои вопросы или продолжите — их можно подготовить позднее.',
          'simple-builder-note',
        ),
      );
    for (const [i, card] of cards.entries()) {
      const d = cardEditor(card, i, cards.length);
      d.dataset.card = card.id;
      body.append(d);
    }
  }
  function designPage() {
    body.append(
      node(
        'p',
        'Расположение блоков подстраивается под экран автоматически.',
        'simple-builder-note',
      ),
    );
    const presets = node('div', undefined, 'simple-builder-presets');
    for (const [label, accent, gold] of [
      ['ERADIS', '#14b8a6', '#eab308'],
      ['Изумруд', '#10b981', '#f59e0b'],
      ['Фиолетовый', '#8b5cf6', '#facc15'],
    ]) {
      const b = actionButton(label, () => {
        model.design.accent = accent;
        model.design.gold = gold;
        changed();
        render();
      });
      b.style.borderColor = accent;
      b.setAttribute('aria-pressed', String(model.design.accent === accent));
      presets.append(b);
    }
    body.append(presets);
    check(body, 'Использовать свой макет Studio вместо основного интерфейса', model.document.settings.customLayout === true, v => { model.document.settings.customLayout = v; });
    for (const [key, label] of [
      ['map', 'Карта Казахстана'],
      ['chat', 'Чат'],
      ['achievements', 'Достижения'],
      ['syllabus', 'Загрузка силлабуса'],
      ['trading', 'Обмен ресурсами'],
    ])
      check(body, label, model.features[key], (v) => (model.features[key] = v));
    const more = node('details');
    more.append(node('summary', 'Другие функции'));
    for (const [key, label] of Object.entries(ROOM_FEATURES))
      if (!['map', 'chat', 'achievements', 'syllabus', 'trading'].includes(key))
        check(
          more,
          label,
          model.features[key],
          (v) => (model.features[key] = v),
        );
    body.append(more);
    if (includeSetup)
      check(
        body,
        'Войны и ставки',
        model.setup.config.warsEnabled,
        (v) => (model.setup.config.warsEnabled = v),
      );
  }
  function readyPage() {
    const value = model.read(),
      summary = node('dl', undefined, 'simple-builder-summary');
    for (const [label, text] of [
      ['Занятие', value.name],
      ['Предмет', value.subject],
      ['Формат', value.config.mode === 'team' ? 'Команды' : 'Личный'],
      ['Вопросов', value.questions.length],
      ['Время вопроса', value.config.duration + ' с'],
    ])
      summary.append(node('dt', label), node('dd', String(text)));
    body.append(summary);
    if (!value.questions.length)
      body.append(
        node(
          'p',
          'Комната будет создана без вопросов. Добавьте их перед запуском занятия.',
          'simple-builder-note',
        ),
      );
    if (options.onCreate)
      body.append(
        actionButton(
          'Создать комнату',
          () =>
            run(async () => {
              const value = model.read(),
                result = await options.onCreate(value);
              if (result !== false) clearDraft();
              return result;
            }),
          'button button-gold',
        ),
      );
    if (options.onSave)
      body.append(
        actionButton(
          includeSetup ? 'Сохранить шаблон' : 'Сохранить изменения',
          () =>
            run(async () => {
              const result = await options.onSave(model.read());
              if (result !== false) clearDraft();
              return result;
            }),
          'button button-mint',
        ),
      );
  }
  function render() {
    navigation.replaceChildren();
    body.replaceChildren();
    footer.replaceChildren();
    for (const [i, title] of steps.entries()) {
      const b = actionButton(i + 1 + '. ' + title, () => go(i));
      b.setAttribute('aria-current', i === step ? 'step' : 'false');
      b.disabled = i > step + 1;
      navigation.append(b);
    }
    body.append(node('h3', steps[step]));
    if (steps[step] === 'Занятие') setupPage();
    else if (steps[step] === 'Вопросы') questionsPage();
    else if (steps[step] === 'Оформление') designPage();
    else
      try {
        readyPage();
      } catch (e) {
        report(e.message, true);
      }
    if (step > 0) footer.append(actionButton('← Назад', () => go(step - 1)));
    if (step < steps.length - 1)
      footer.append(
        actionButton('Далее →', () => go(step + 1), 'button button-mint'),
      );
    else
      footer.append(node('span', 'Шаг ' + (step + 1) + ' из ' + steps.length));
  }
  function dispose() {
    if (disposed) return;
    persist();
    disposed = true;
    clearTimeout(saveTimer);
    window.removeEventListener('pagehide', persist);
    observer?.disconnect();
  }
  const observer =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => {
          if (!root.isConnected && root._wasConnected) dispose();
          if (root.isConnected) root._wasConnected = true;
        });
  observer?.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  window.addEventListener('pagehide', persist);
  render();
  if (restored) report('Восстановлен черновик с этого устройства.');
  return {
    element: root,
    simple: true,
    read: () => model.read(),
    clearDraft,
    dispose,
    model,
  };
}

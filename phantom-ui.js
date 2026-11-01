import { getLanguage } from './ui-preferences.js';

const COPY = {
  awakening: ['Пробуждение', 'Ояну'],
  fight: ['Начало боя', 'Шайқас басталды'],
  moreQuestions: ['Ожидание новых вопросов', 'Жаңа сұрақтарды күту'],
  title: ['Войны и Фантомная зона', 'Соғыстар және Фантом аймағы'],
  enable: ['Разрешить войны', 'Соғыстарға рұқсат беру'],
  settings: ['Настройки преподавателя', 'Оқытушы баптаулары'],
  apply: ['Сохранить настройки', 'Баптауларды сақтау'],
  warQuestions: [
    'Вопросы войны · порядок из банка',
    'Соғыс сұрақтары · банктегі ретпен',
  ],
  royaleQuestions: ['Вопросы Королевской битвы', 'Корольдік шайқас сұрақтары'],
  fallback: [
    'Без выбора используется банк текущего предмета',
    'Таңдалмаса, ағымдағы пән банкі қолданылады',
  ],
  count: ['Вопросов в войне', 'Соғыстағы сұрақ саны'],
  duration: ['Секунд на вопрос', 'Сұраққа берілетін секунд'],
  betsTime: ['Секунд на ставки', 'Бәс тігу уақыты'],
  reduced: ['Снизить эффекты', 'Әсерлерді азайту'],
  allReduced: ['Снизить эффекты для всех', 'Барлығына әсерлерді азайту'],
  sound: ['Включить звук', 'Дыбысты қосу'],
  mute: ['Выключить звук', 'Дыбысты өшіру'],
  volume: ['Громкость', 'Дыбыс деңгейі'],
  preview: ['Предпросмотр пробуждения · 30 с', 'Оянуды алдын ала көру · 30 с'],
  stop: [
    'Остановить событие и вернуть взносы',
    'Оқиғаны тоқтатып, жарналарды қайтару',
  ],
  show: ['Открыть событие', 'Оқиғаны ашу'],
  collapse: ['Свернуть · вернуться к странице', 'Жию · бетке оралу'],
  close: ['Закрыть', 'Жабу'],
  waiting: ['Основная игра приостановлена', 'Негізгі ойын кідіртілді'],
  real: ['Настоящая экономика защищена', 'Нақты экономика қорғалған'],
  phantom: ['Фантомные ресурсы', 'Фантом ресурстары'],
  economy: ['Фантомная экономика', 'Фантом экономикасы'],
  fund: ['Призовой фонд', 'Жүлде қоры'],
  betFund: ['Фонд ставок', 'Бәс қоры'],
  totalFund: ['Общий фонд', 'Жалпы қор'],
  alive: ['Команд в игре', 'Ойындағы командалар'],
  spectator: ['Вы наблюдаете за событием', 'Сіз оқиғаны бақылап отырсыз'],
  diplomacy: ['Дипломатия', 'Дипломатия'],
  betting: ['Приём ставок', 'Бәс қабылдау'],
  ready: ['Ожидаем запуск преподавателя', 'Оқытушының бастауын күтеміз'],
  startNow: ['Начать бой', 'Шайқасты бастау'],
  negotiationTime: ['Время переговоров, с', 'Келіссөз уақыты, с'],
  autoStart: ['Автоматически начать после ставок', 'Бәстен кейін автоматты бастау'],
  teacherControl: ['Управление преподавателя', 'Оқытушының басқаруы'],
  adminControl: ['Управление создателя', 'Жасаушының басқаруы'],
  correctAnswer: ['Правильный ответ', 'Дұрыс жауап'],
  autoAdvance: ['Автопереход вопросов', 'Сұрақтардың автоматты ауысуы'],
  adjustments: ['Фантомные ресурсы и экономика', 'Фантом ресурстары мен экономикасы'],
  resetClock: ['Установить время', 'Уақытты орнату'],
  readyNote: ['Ставки закрыты. Преподаватель запускает бой, когда команды готовы.', 'Бәс жабылды. Командалар дайын болғанда оқытушы бастайды.'],
  proposal: ['Голосование о взносе', 'Жарна туралы дауыс беру'],
  intro: ['Фантомная зона', 'Фантом аймағы'],
  question: ['Бой знаний', 'Білім шайқасы'],
  reveal: ['Ответы приняты', 'Жауаптар қабылданды'],
  exhausted: ['Нужны дополнительные вопросы', 'Қосымша сұрақтар қажет'],
  result: ['Итоги события', 'Оқиға қорытындысы'],
  offer: ['Предложить войну', 'Соғыс ұсыну'],
  opponent: ['Другая команда', 'Басқа команда'],
  amount: ['Взнос каждой стороны', 'Әр тараптың жарнасы'],
  accept: ['Принять договор', 'Келісімді қабылдау'],
  counter: ['Контрпредложение', 'Қарсы ұсыныс'],
  reject: ['Отказаться', 'Бас тарту'],
  leader: [
    'Договоры и ставки подтверждает лидер команды. В бою голосуют все участники; нужен ответ большинства команды.',
    'Келісім мен бәсті команда көшбасшысы растайды. Шайқаста барлығы дауыс береді; команданың көпшілік жауабы қажет.',
  ],
  bet: ['Поставить игровые ресурсы', 'Ойын ресурстарын тігу'],
  side: ['Прогноз победителя', 'Жеңімпаз болжамы'],
  stake: ['Ставка · до 400', 'Бәс · 400-ге дейін'],
  preliminary: ['Предварительный', 'Алдын ала'],
  fixed: ['Зафиксирован', 'Бекітілген'],
  noBets: ['Нет ставок', 'Бәс жоқ'],
  betTaken: ['Ставка принята', 'Бәс қабылданды'],
  betLimit: [
    'Без ∞ ставки недоступны при 900+ ресурсах',
    '∞ болмаса, 900+ ресурста бәс қолжетімсіз',
  ],
  start: ['Закрыть ставки и начать бой', 'Бәсті жауып, шайқасты бастау'],
  resolve: ['Подвести итоги вопроса', 'Сұрақ қорытындысын шығару'],
  next: ['Следующий вопрос', 'Келесі сұрақ'],
  pause: ['Пауза', 'Кідірту'],
  resume: ['Продолжить', 'Жалғастыру'],
  contribute: ['Предложить добровольный взнос', 'Ерікті жарна ұсыну'],
  yes: ['За · участвовать', 'Қолдаймын · қатысу'],
  no: ['Против · наблюдать', 'Қарсымын · бақылау'],
  votes: ['Голосов «за»', 'Қолдаған дауыс'],
  required: ['Нужно не менее', 'Кемінде қажет'],
  finalize: ['Проверить голоса и допуск', 'Дауыс пен рұқсатты тексеру'],
  sponsor: ['Битва с фондом преподавателя', 'Оқытушы қорымен шайқас'],
  sponsorStart: ['Выделить фонд и запустить', 'Қор бөліп, бастау'],
  sponsorFund: ['Фонд преподавателя', 'Оқытушы қоры'],
  available: [
    'Проверка лимита выполняется сервером перед списанием',
    'Лимит серверде есептен шығару алдында тексеріледі',
  ],
  more: [
    'Добавьте в банк новые вопросы и нажмите «Следующий вопрос». До этого бой на паузе.',
    'Банкке жаңа сұрақтар қосып, «Келесі сұрақ» түймесін басыңыз. Оған дейін шайқас кідіртіледі.',
  ],
  eliminated: ['Выбыла · наблюдает', 'Шықты · бақылауда'],
  answer: ['Ваш голос принят', 'Дауысыңыз қабылданды'],
  noAnswer: ['Нет ответа большинства = ошибка', 'Көпшілік жауабы жоқ = қате'],
  logs: ['Журнал боя', 'Шайқас журналы'],
  correct: ['Верно', 'Дұрыс'],
  wrong: ['Ошибка', 'Қате'],
  winner: ['Победитель', 'Жеңімпаз'],
  won: ['Начислено', 'Есептелді'],
  draw: [
    'Ничья. Взносы и ставки возвращены',
    'Тең ойын. Жарналар мен бәстер қайтарылды',
  ],
  cancelled: [
    'Событие остановлено. Взносы и ставки возвращены',
    'Оқиға тоқтатылды. Жарналар мен бәстер қайтарылды',
  ],
  rejected: ['Предложение отклонено', 'Ұсыныс қабылданбады'],
  insufficient: [
    'После проверки лимита осталось меньше двух команд. Взносы не списаны',
    'Лимит тексерілген соң екі командадан аз қалды. Жарна алынбады',
  ],
  expired: ['Срок предложения истёк', 'Ұсыныс мерзімі аяқталды'],
  destroyed: ['Победителя нет. Фонд уничтожен', 'Жеңімпаз жоқ. Қор жойылды'],
  unlocked: [
    'Фантомная зона больше не скрыта. Открыт новый режим: Королевская битва',
    'Фантом аймағы енді жасырын емес. Жаңа режим ашылды: Корольдік шайқас',
  ],
  anomaly: [
    'Обнаружена аномалия экономической системы',
    'Экономикалық жүйеде ауытқу анықталды',
  ],
  distortion: ['Нарушена целостность карты', 'Картаның тұтастығы бұзылды'],
  blackout: ['Потеря связи с городами…', 'Қалалармен байланыс үзілуде…'],
  activated: ['ФАНТОМНАЯ ЗОНА АКТИВИРОВАНА', 'ФАНТОМ АЙМАҒЫ ІСКЕ ҚОСЫЛДЫ'],
  transfer: [
    'Взносы и ставки переданы Фантомной зоне',
    'Жарналар мен бәстер Фантом аймағына берілді',
  ],
  transferred: [
    'Воевавшие и ставившие команды переведены в Королевскую битву',
    'Соғысқан және бәс тіккен командалар Корольдік шайқасқа ауыстырылды',
  ],
  allFund: ['Победитель получит весь фонд', 'Жеңімпаз бүкіл қорды алады'],
  noOptOut: [
    'Отказ внутри события не предусмотрен. Преподаватель может остановить его',
    'Оқиға ішінде бас тарту жоқ. Оқытушы оны тоқтата алады',
  ],
  enterArena: ['Арена готова', 'Арена дайын'],
  royale: ['Королевская битва', 'Корольдік шайқас'],
  localWar: ['Локальная война', 'Жергілікті соғыс'],
  paused: ['Событие на паузе', 'Оқиға кідіртілді'],
  saved: ['Сохранено', 'Сақталды'],
  disconnected: ['Нет связи с сервером', 'Сервермен байланыс жоқ'],
  rule: [
    'Только игровые ресурсы, без денег. Ошибка: −20 п. п.; восстановление: +25 п. п.; выбывание при экономике ниже 50%.',
    'Тек ойын ресурстары, ақша емес. Қате: −20 п. т.; қалпына келтіру: +25 п. т.; экономика 50%-дан төмен болса, команда шығады.',
  ],
};
const tr = (key) => COPY[key]?.[getLanguage() === 'kk' ? 1 : 0] || key;
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const button = (action, key, extra = '') =>
  `<button type="button" data-phantom="${action}" ${extra}>${esc(tr(key))}</button>`;

export function setupPhantom(engine) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./phantom.css', import.meta.url).href;
  document.head.append(stylesheet);
  const entry = document.createElement('section');
  entry.className = 'phantom-entry glass teacher-private';
  entry.hidden = true;
  const arena = document.createElement('section');
  arena.className = 'phantom-arena';
  arena.hidden = true;
  arena.setAttribute('aria-label', tr('title'));
  const notice = document.createElement('p');
  notice.className = 'phantom-notice';
  notice.setAttribute('role', 'status');
  const config = document.createElement('details');
  config.className = 'phantom-settings teacher-private';
  let state = null,
    collapsed = false,
    eventId = '',
    localPreview = null,
    busy = false,
    localReduced = false,
    soundOn = false,
    audio = null,
    lastTone = '',
    renderKey = '',
    configKey = '',
    disposed = false;
  try {
    localReduced = localStorage.getItem('cq_phantom_reduced') === '1';
  } catch {}
  const lowPower =
    (navigator.hardwareConcurrency || 8) <= 4 ||
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  const manager = () =>
    state?.phantom?.permissions?.canControl ?? (state?.viewer.role === 'teacher' || state?.viewer.isCreator);
  const now = () => Date.now() + (engine.offset || 0);
  const current = () => localPreview || state?.phantom?.event;
  const name = (id) => state?.regions.find((t) => t.id === id)?.name || id;
  const control = () => !!manager() && !localPreview;
  const field = (key, type, value, attrs = '') =>
    `<label>${esc(tr(key))}<input name="${key}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
  const options = (items, selected) =>
    items
      .map(
        (t) =>
          `<option value="${esc(t.id)}" ${selected?.includes(t.id) ? 'selected' : ''}>${esc(t.name || t.text)}</option>`,
      )
      .join('');
  const error = (message) => {
    notice.textContent = message;
    notice.classList.toggle('is-error', !!message);
  };

  function tone(kind) {
    if (!soundOn || disposed) return;
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      const osc = audio.createOscillator(),
        gain = audio.createGain(),
        time = audio.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(
        kind === 'wrong' ? 85 : kind === 'winner' ? 440 : 165,
        time,
      );
      osc.frequency.exponentialRampToValueAtTime(
        kind === 'winner' ? 660 : 55,
        time + 0.35,
      );
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(
        (state?.phantom?.config.volume ?? 0.12) * 0.22,
        time + 0.03,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.6);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(time);
      osc.stop(time + 0.65);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch {}
  }
  async function request(action, data = {}) {
    if (busy) return;
    if (!engine.connected) return error(tr('disconnected'));
    busy = true;
    arena.classList.add('is-busy');
    error('');
    try {
      await engine.request(action, data);
    } catch (e) {
      error(e.message);
    } finally {
      busy = false;
      arena.classList.remove('is-busy');
      renderKey = '';
      render();
    }
  }
  function renderSettings() {
    if (!manager()) return;
    const c = state.phantom?.config || {
        enabled: false,
        duration: 30,
        questionCount: 5,
        betSeconds: 30,
        volume: 0.12,
      },
      questions = engine.allQuestions();
    const key = JSON.stringify([c, questions.map((q) => [q.id, q.text])]);
    if (key === configKey || config.contains(document.activeElement)) return;
    configKey = key;
    config.innerHTML = `<summary>${esc(tr('settings'))}</summary><form data-phantom-form="configure"><label class="phantom-check"><input type="checkbox" name="enabled" ${c.enabled ? 'checked' : ''}>${esc(tr('enable'))}</label><div class="phantom-fields">${field('count', 'number', c.questionCount, 'min="1" max="100" required')}${field('duration', 'number', c.duration, 'min="5" max="120" required')}${field('betsTime', 'number', c.betSeconds, 'min="5" max="120" required')}${field('negotiationTime','number',c.negotiationSeconds??30,'min="5" max="120" required')}</div><label class="phantom-check"><input name="autoStart" type="checkbox" ${c.autoStart?'checked':''}>${esc(tr('autoStart'))}</label><label>${esc(tr('warQuestions'))}<select name="questionIds" multiple size="5">${options(questions, c.questionIds)}</select></label><label>${esc(tr('royaleQuestions'))}<select name="royaleQuestionIds" multiple size="5">${options(questions, c.royaleQuestionIds)}</select></label><p>${esc(tr('fallback'))}</p><label class="phantom-check"><input name="reduced" type="checkbox" ${c.reduced ? 'checked' : ''}>${esc(tr('allReduced'))}</label>${field('volume', 'range', c.volume, 'min="0" max="1" step="0.01"')}<button type="submit">${esc(tr('apply'))}</button></form>${button('preview', 'preview')}`;
  }
  function renderEntry() {
    const p = state?.viewer.player,
      c = state?.phantom?.config,
      active = current() && current().stage !== 'result',
      canManage = manager();
    entry.hidden = !(canManage || (p && c?.enabled));
    const ordinary=document.getElementById(document.body.classList.contains('teacher-page')?'round-control':'question-panel');if(ordinary)ordinary.hidden=false;
    if (entry.hidden) return;
    if (!entry.parentNode)
      (
        document.querySelector('#teacher-app .t-col:last-child') ||
        document.querySelector('#app .dock') ||
        document.getElementById('teacher-app') ||
        document.getElementById('app') ||
        document.body
      ).append(entry);
    if (!entry.querySelector('.phantom-launch'))
      entry.innerHTML = '<div class="phantom-launch"></div>';
    const own = state.regions.find((t) => t.id === p?.regionId),
      leader = !!own && !!p && own.leaderPid === p.pid,
      available = state.regions.filter(
        (t) =>
          t.id !== 'creators' &&
          t.id !== own?.id &&
          (t.participantCount ?? t.occupied ?? t.members.length),
      );
    const ordinaryHost=document.getElementById(document.body.classList.contains('teacher-page')?'round-control':'question-panel');
    if(active&&ordinaryHost){
      ordinaryHost.classList.add('phantom-controls-host');
      if(entry.parentNode!==ordinaryHost)ordinaryHost.replaceChildren(entry);
    }else if(ordinaryHost){
      ordinaryHost.classList.remove('phantom-controls-host');
      if(entry.parentNode===ordinaryHost){
        const grid=ordinaryHost.closest('.studio-live-layout');
        if(grid)grid.insertAdjacentElement('afterend',entry);else ordinaryHost.insertAdjacentElement('afterend',entry);
      }
    }
    const launch = entry.querySelector('.phantom-launch');
    const key = JSON.stringify([
      c?.enabled,
      active,
      current(),
      canManage,
      leader,
      state.phantom?.unlocked,
      available.map((t) => [t.id, t.name]),
    ]);
    if (
      launch.dataset.key !== key &&
      !(launch.contains(document.activeElement)&&document.activeElement.matches('input,select,textarea'))
    ) {
      const expanded=launch.querySelector('.phantom-adjustments')?.open;
      launch.dataset.key = key;
      launch.innerHTML = active&&canManage?managementSummary(current())+eventControls(current(),true):`<h2>${esc(tr('title'))}</h2>${active ? button('open', 'show') : ''}<p>${esc(tr('rule'))}</p>${c?.enabled && leader && !active ? `<form data-phantom-form="offer"><label>${esc(tr('opponent'))}<select name="toTeamId" required>${options(available)}</select></label>${field('amount', 'number', 25, 'min="25" max="100000" step="25" required')}<button type="submit">${esc(tr('offer'))}</button></form><p>${esc(tr('leader'))}</p>` : ''}${c?.enabled && state.phantom?.unlocked && !active && (leader || canManage) ? `<form data-phantom-form="proposal">${field('amount', 'number', 25, 'min="25" max="400" step="25" required')}<button type="submit">${esc(tr('contribute'))}</button></form>` : ''}${c?.enabled && state.phantom?.unlocked && !active && canManage ? `<details><summary>${esc(tr('sponsor'))}</summary><form data-phantom-form="sponsor">${field('sponsorFund', 'number', 300, 'min="1" max="100000" required')}<select name="teamIds" multiple size="5" required>${options(state.regions.filter((t) => t.id !== 'creators' && t.members.length))}</select><button type="submit">${esc(tr('sponsorStart'))}</button></form></details>` : ''}`;
      if(expanded&&launch.querySelector('.phantom-adjustments'))launch.querySelector('.phantom-adjustments').open=true;
    }
    config.hidden=!!active;
    if (canManage) {
      if (config.parentNode !== entry) entry.append(config);
      renderSettings();
    } else config.remove();
    if(entry.lastElementChild!==notice)entry.append(notice);
  }
  function managementSummary(e) {
    const q=e.round?.question,correct=Number.isInteger(q?.correct)?q.options[q.correct]:null;
    return `<section class="phantom-management" data-phantom-manager><div class="row"><h2>${esc(tr(state.viewer.isCreator?'adminControl':'teacherControl'))}</h2>${button('open','show')}</div><p class="phantom-terminal">${esc(tr(e.kind==='royale'?'royale':'localWar'))} · ${esc(tr(e.stage))} · <b data-phantom-clock></b></p>${q?`<p class="qtext">${esc(q.text)}</p><ol class="current-options">${q.options.map(o=>`<li>${esc(o)}</li>`).join('')}</ol>${correct!==null?`<p class="phantom-correct-answer" data-phantom-correct-answer>${esc(tr('correctAnswer'))}: <strong>${String.fromCharCode(65+q.correct)}. ${esc(correct)}</strong></p>`:''}`:''}</section>`;
  }
  function eventControls(e,inline=false) {
    const canManage=control()&&!document.body.classList.contains('projector-mode');
    const active=canManage&&e.stage!=='result',timed=!['ready','exhausted','result'].includes(e.stage);
    const commands=active?`<div class="phantom-command-bar teacher-private" role="group" aria-label="${esc(tr(state.viewer.isCreator?'adminControl':'teacherControl'))}">${inline?'':`<strong>${esc(tr(state.viewer.isCreator?'adminControl':'teacherControl'))}</strong>`}${timed||e.paused?button(e.paused?'resume':'pause',e.paused?'resume':'pause'):''}${['betting','ready','proposal'].includes(e.stage)?button('start',e.stage==='ready'?'startNow':'start'):''}${e.stage==='question'?button('resolve','resolve'):''}${['intro','reveal','exhausted'].includes(e.stage)?button('next','next'):''}${button('autoAdvance','autoAdvance',`aria-pressed="${state.phantom.config.autoAdvance!==false}"`)}${timed?`<form data-phantom-form="timer"><label>${esc(tr('duration'))}<input name="seconds" type="number" min="5" max="120" value="${state.phantom.config.duration||30}" required></label><button type="submit">${esc(tr('resetClock'))}</button></form>`:''}</div>`:'';
    const adjustments=active&&['question','reveal','exhausted'].includes(e.stage)?`<details class="phantom-adjustments teacher-private"><summary>${esc(tr('adjustments'))}</summary>${e.fighters.map(f=>`<div class="phantom-adjustment-row"><strong>${esc(name(f.id))}</strong><span>◈ ${f.resources} · ${f.economy}%</span>${[[25,0,'+25'],[-25,0,'−25'],[0,10,'+10%'],[0,-10,'−10%']].map(([resource,economy,label])=>`<button type="button" data-phantom="adjust" data-team="${esc(f.id)}" data-resource="${resource}" data-economy="${economy}">${label}</button>`).join('')}</div>`).join('')}</details>`:'';
    if(inline)return `<div class="phantom-toolbar phantom-inline-controls">${commands}${adjustments}${active?button('stop','stop','class="phantom-stop teacher-private"'):''}</div>`;
    return `<div class="phantom-toolbar">${button('collapse','collapse')}${button('reduced','reduced',`aria-pressed="${localReduced}"`)}${button('sound',soundOn?'mute':'sound')}${active?button('stop','stop','class="phantom-stop teacher-private"'):''}${canManage?button('allReduced','allReduced',`aria-pressed="${!!state.phantom.config.reduced}"`):''}${canManage?`<label class="phantom-volume teacher-private">${esc(tr('volume'))}<input data-phantom-volume type="range" min="0" max="1" step="0.01" value="${state.phantom.config.volume??.12}"></label>`:''}${localPreview?button('closePreview','close'):''}${commands}${adjustments}</div>`;
  }
  function renderEvent(e) {
    const reduced = localReduced || lowPower || state.phantom?.config.reduced;
    arena.classList.toggle('is-reduced', !!reduced);
    arena.classList.toggle('is-royale', e.kind === 'royale');
    arena.classList.toggle('is-intro', e.stage === 'intro');
    arena.classList.toggle('is-winner', e.outcome === 'winner');
    arena.classList.toggle('is-destroyed', e.outcome === 'destroyed');
    const p = state.viewer.player,
      own = state.regions.find((t) => t.id === p?.regionId),
      leader = !!own && !!p && own.leaderPid === p.pid,
      participating = e.teamIds.includes(own?.id),
      canVote = e.fighters?.some((f) => f.id === own?.id && f.alive);
    const key = JSON.stringify([
      e,
      state.phantom?.unlocked,
      engine.connected,
      localPreview?.id,
      localReduced,
      soundOn,
      document.body.classList.contains('projector-mode'),
    ]);
    if (key === renderKey) return;
    if (
      arena.contains(document.activeElement) &&
      document.activeElement.matches('input,select') &&
      arena.dataset.stage === e.stage
    )
      return;
    renderKey = key;
    arena.dataset.stage = e.stage;
    let body = '';
    if (e.stage === 'intro')
      body = `<div class="phantom-cinematic"><span class="phantom-terminal">ERADIS / SYSTEM EVENT</span><h1 data-cinematic-title></h1><div class="phantom-messages" aria-live="polite"></div><div class="phantom-scanline"></div></div>`;
    else if (e.stage === 'diplomacy')
      body = `<h2>${esc(tr('diplomacy'))}</h2><ol class="phantom-history">${e.history.map((h) => `<li>${esc(name(h.teamId))}: <strong>${h.amount}</strong></li>`).join('')}</ol>${leader && participating ? `${e.offeredBy !== own.id ? button('accept', 'accept') : ''}${button('reject', 'reject')}${e.offeredBy !== own.id ? `<form data-phantom-form="counter">${field('amount', 'number', e.amount, 'min="25" max="100000" step="25" required')}<button type="submit">${esc(tr('counter'))}</button></form>` : ''}` : `<p>${esc(tr('spectator'))}</p>`}`;
    else if(e.stage==='ready')body=`<section class="phantom-ready"><h2>${esc(tr('ready'))}</h2><p>${esc(tr('readyNote'))}</p>${control()?button('start','startNow'):''}</section>`;
    else if (e.stage === 'betting') {
      const total = e.betFund,
        existing = e.bets.find((b) => b.teamId === own?.id);
      body = `<h2>${esc(tr('betting'))}</h2><div class="phantom-odds">${e.teamIds
        .map((id) => {
          const a = e.bets
            .filter((b) => b.side === id)
            .reduce((n, b) => n + b.amount, 0);
          return `<article><strong>${esc(name(id))}</strong><b>${a ? `×${(total / a).toFixed(2)}` : '—'}</b><span>${esc(tr('preliminary'))} · ${a}</span></article>`;
        })
        .join(
          '',
        )}</div><p>${esc(tr('betFund'))}: ${total} / 800</p>${existing ? `<p>${esc(tr('betTaken'))}: ${existing.amount} → ${esc(name(existing.side))}</p>` : leader && !participating ? (own.scoreLimit === null || own.points < 900 ? `<form data-phantom-form="bet"><label>${esc(tr('side'))}<select name="side">${options(e.teamIds.map((id) => ({ id, name: name(id) })))}</select></label>${field('stake', 'number', 25, 'min="1" max="400" required')}<button type="submit">${esc(tr('bet'))}</button></form>` : `<p>${esc(tr('betLimit'))}</p>`) : ''}${control() ? button('start', 'start') : ''}`;
    } else if (e.stage === 'proposal')
      body = `<h2>${esc(tr('proposal'))}</h2><p>${esc(tr('amount'))}: ${e.contribution}</p><p>${esc(tr('votes'))}: ${Object.values(e.proposalVotes).filter(Boolean).length} / ${e.electorate.length} · ${esc(tr('required'))}: ${Math.ceil((e.electorate.length * 2) / 3)}</p>${leader ? `${button('yes', 'yes')}${button('no', 'no')}` : ''}${control() ? button('start', 'finalize') : ''}<p>${esc(tr('available'))}</p>`;
    else if (['question', 'reveal', 'exhausted'].includes(e.stage)) {
      const q = e.round?.question,
        results = e.round?.results || [];
      body = `<div class="phantom-battle"><div class="phantom-question">${e.stage === 'exhausted' ? `<h2>${esc(tr('exhausted'))}</h2><p>${esc(tr('more'))}</p>` : `<span class="phantom-terminal">${e.questionIndex + 1} / ${e.questionCount}</span><h2>${esc(q?.text)}</h2><div class="phantom-answers">${(q?.options || []).map((o, i) => `<button type="button" data-phantom="answer" data-option="${i}" aria-pressed="${e.round.myVote === i}" class="${e.round.myVote === i ? 'is-selected' : ''} ${q.correct === i && !document.body.classList.contains('projector-mode') ? 'is-correct' : ''}" ${!canVote || e.stage !== 'question' || e.paused || !engine.connected ? 'disabled' : ''}><span>${String.fromCharCode(65 + i)}</span>${esc(o)}</button>`).join('')}</div><p>${esc(e.round?.myVote != null ? tr('answer') : !canVote ? tr('spectator') : tr('noAnswer'))}</p>`}${control() ? `${e.stage === 'question' ? button('resolve', 'resolve') : button('next', 'next')}${button(e.paused ? 'resume' : 'pause', e.paused ? 'resume' : 'pause')}` : ''}</div><div class="phantom-fighters">${e.fighters
        .map((f) => {
          const result = results.find((r) => r.teamId === f.id);
          return `<article class="phantom-fighter ${!f.alive ? 'is-eliminated' : ''} ${result ? (result.correct ? 'is-correct' : 'is-wrong') : ''}">${!f.alive ? '<span class="phantom-shards" aria-hidden="true">' + Array.from({ length: 8 }, (_, i) => '<i style="--shard:' + i + '"></i>').join('') + '</span>' : ''}<h3>${esc(name(f.id))}</h3><strong>◈ ${f.resources}</strong><span>${esc(tr('phantom'))}</span><div class="phantom-economy" role="progressbar" aria-label="${esc(tr('economy'))}" aria-valuenow="${f.economy}" aria-valuemin="0" aria-valuemax="100"><i style="width:${f.economy}%"></i><em></em></div><b>${f.economy}%</b><small>${!f.alive ? esc(tr('eliminated')) : `${f.voted} / ${f.total}`}</small></article>`;
        })
        .join('')}</div></div>`;
    } else if (e.stage === 'result')
      body = `<div class="phantom-result"><span class="phantom-terminal">ERADIS / ${esc(tr('result'))}</span><h1>${e.outcome === 'winner' ? `${esc(tr('winner'))}<br>${esc(name(e.winner))}` : esc(tr(e.outcome))}</h1>${e.outcome === 'winner' ? `<strong data-phantom-payout>+${e.payout} ◈</strong><p>${esc(tr('won'))}</p>` : ''}${e.first && state.phantom?.unlocked ? `<p>${esc(tr('unlocked'))}</p>` : ''}${e.payouts?.length ? `<ul>${e.payouts.map((r) => `<li>${esc(name(r.teamId))}: +${r.applied}</li>`).join('')}</ul>` : ''}${button('collapse', 'close')}</div>`;
    const fixedOdds =
      e.kind === 'war' &&
      e.bets?.length &&
      !['diplomacy', 'betting'].includes(e.stage)
        ? '<p class="phantom-fixed-odds">' +
          e.teamIds
            .map((id) => {
              const amount = e.bets
                .filter((b) => b.side === id)
                .reduce((n, b) => n + b.amount, 0);
              return (
                esc(name(id)) +
                ': ' +
                (amount ? '×' + (e.betFund / amount).toFixed(2) : '—')
              );
            })
            .join(' · ') +
          ' · ' +
          esc(tr('fixed')) +
          '</p>'
        : '';
    arena.innerHTML = `${eventControls(e)}${fixedOdds}<header class="phantom-event-header"><div><span>${esc(tr(e.kind === 'royale' ? 'royale' : 'localWar'))}</span><strong>${esc(tr('fund'))}: ${e.fund}</strong></div><div class="phantom-clock" aria-label="${esc(tr('duration'))}"><svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19"/></svg><b data-phantom-clock></b></div></header>${e.stage !== 'result' ? `<p class="phantom-protection">${esc(tr('waiting'))} · ${esc(tr('real'))}${e.paused ? ' · ' + esc(tr('paused')) : ''}</p>` : ''}<main class="phantom-event-body">${body}</main>${
      e.log?.length
        ? `<details class="phantom-log"><summary>${esc(tr('logs'))}</summary>${e.log
            .slice(-12)
            .reverse()
            .map(
              (l) =>
                `<p>${esc(l.teamId ? name(l.teamId) : '')} · ${esc(tr(l.type))}${l.eliminated ? ' · ' + esc(tr('eliminated')) : ''}</p>`,
            )
            .join('')}</details>`
        : ''
    }<p class="phantom-event-error" role="status"></p>`;
    const last = e.log?.at(-1);
    if (last && last.id !== lastTone) {
      lastTone = last.id;
      tone(last.type);
    }
    tick();
  }
  function render() {
    if (disposed || !state) return;
    renderEntry();
    let e = current();
    const allowed = !!state.viewer.player || manager();
    if (!allowed) {
      localPreview = null;
      e = null;
    }
    if (e?.id !== eventId) {
      eventId = e?.id || '';
      collapsed = false;
      renderKey = '';
    }
    arena.hidden = !e || collapsed || !allowed;
    if (e && !arena.hidden) renderEvent(e);
    tick();
  }
  function tick() {
    const e = current();
    if (!e) {
      document.body.classList.remove('phantom-awakening');
      window.dispatchEvent(
        new CustomEvent('cq:phantom-scene', { detail: { active: false } }),
      );
      return;
    }
    const seconds = Math.max(
        0,
        Math.ceil((e.paused ? e.remaining : e.deadline - now()) / 1000),
      ),
      clock = arena.querySelector('[data-phantom-clock]');
    for(const clock of [...arena.querySelectorAll('[data-phantom-clock]'),...entry.querySelectorAll('[data-phantom-clock]')])clock.textContent=e.deadline||e.paused?seconds:'—';
    const circle = arena.querySelector('.phantom-clock circle');
    if (circle)
      circle.style.strokeDashoffset = String(
        120 *
          (1 - Math.min(1, seconds / (state.phantom?.config.duration || 30))),
      );
    if(arena.hidden){document.body.classList.remove('phantom-awakening');window.dispatchEvent(new CustomEvent('cq:phantom-scene',{detail:{active:false}}));return;}
    const payout = arena.querySelector('[data-phantom-payout]');
    if (payout) {
      const p = Math.min(1, Math.max(0, (now() - e.stageAt) / 1600));
      payout.textContent =
        '+' + Math.round(e.payout * (1 - Math.pow(1 - p, 3))) + ' ◈';
    }
    const reduced = localReduced || lowPower || state.phantom?.config.reduced;
    if (e.stage === 'intro') {
      const elapsed = e.paused
          ? (e.first ? 30 : 5) - e.remaining / 1000
          : Math.max(0, (now() - e.stageAt) / 1000),
        stage = !e.first
          ? 6
          : elapsed < 3
            ? 0
            : elapsed < 8
              ? 1
              : elapsed < 13
                ? 2
                : elapsed < 17
                  ? 3
                  : elapsed < 25
                    ? 4
                    : 5;
      const title = arena.querySelector('[data-cinematic-title]');
      if (title) {
        const key = [
          'anomaly',
          'distortion',
          'blackout',
          'activated',
          'activated',
          'enterArena',
          'royale',
        ][stage];
        if (title.dataset.key !== key) {
          title.textContent = tr(key);
          title.dataset.key = key;
          tone('intro');
        }
        const messages = arena.querySelector('.phantom-messages'),
          shown =
            stage === 4 ? Math.min(4, 1 + Math.floor((elapsed - 17) / 2)) : 0;
        messages.innerHTML = ['transfer', 'transferred', 'allFund', 'noOptOut']
          .slice(0, shown)
          .map((k) => `<p>${esc(tr(k))}</p>`)
          .join('');
      }
      arena.dataset.cinema = stage;
      document.body.classList.toggle(
        'phantom-awakening',
        !!e.first && !reduced && elapsed < 13,
      );
      window.dispatchEvent(
        new CustomEvent('cq:phantom-scene', {
          detail: {
            active: !!e.first,
            progress: Math.min(1, Math.max(0, (elapsed - 8) / 5)),
            reduced: !!reduced,
          },
        }),
      );
      if (localPreview && elapsed >= 30) {
        localPreview = null;
        renderKey = '';
        render();
      }
    } else {
      document.body.classList.remove('phantom-awakening');
      window.dispatchEvent(
        new CustomEvent('cq:phantom-scene', { detail: { active: false } }),
      );
    }
  }
  function onClick(event) {
    const target = event.target.closest('[data-phantom]');
    if (!target) return;
    const action = target.dataset.phantom,
      e = current();
    if (action === 'collapse') {
      collapsed = true;
      render();
      return;
    }
    if (action === 'open') {
      collapsed = false;
      renderKey = '';
      render();
      return;
    }
    if (action === 'reduced') {
      localReduced = !localReduced;
      try {
        localStorage.setItem('cq_phantom_reduced', localReduced ? '1' : '0');
      } catch {}
      renderKey = '';
      render();
      return;
    }
    if (action === 'allReduced') {
      request('phantomControl', {
        action: 'effects',
        reduced: !state.phantom?.config.reduced,
        volume: state.phantom?.config.volume ?? 0.12,
      });
      return;
    }
    if (action === 'sound') {
      soundOn = !soundOn;
      tone('intro');
      renderKey = '';
      render();
      return;
    }
    if (action === 'preview') {
      localPreview = {
        id: 'preview-' + Date.now(),
        kind: 'royale',
        stage: 'intro',
        first: true,
        stageAt: now(),
        deadline: now() + 30000,
        teamIds: [],
        fighters: [],
        fund: 0,
        log: [],
      };
      collapsed = false;
      render();
      return;
    }
    if (action === 'closePreview') {
      localPreview = null;
      renderKey = '';
      render();
      return;
    }
    if (!e) return;
    const data = { eventId: e.id, offerVersion: e.offerVersion };
    if(action==='autoAdvance')request('phantomControl',{...data,action,enabled:state.phantom.config.autoAdvance===false});
    else if(action==='adjust')request('phantomControl',{...data,action,teamId:target.dataset.team,resourceDelta:Number(target.dataset.resource),economyDelta:Number(target.dataset.economy)});
    else if (action === 'answer')
      request('phantomTeam', {
        ...data,
        action,
        roundId: e.round.id,
        option: Number(target.dataset.option),
      });
    else if (action === 'accept' || action === 'reject')
      request('phantomTeam', { ...data, action });
    else if (action === 'yes' || action === 'no')
      request('phantomTeam', {
        ...data,
        action: 'vote',
        yes: action === 'yes',
      });
    else if (
      ['stop', 'start', 'resolve', 'next', 'pause', 'resume'].includes(action)
    )
      request('phantomControl', {
        ...data,
        action: action === 'resume' ? 'pause' : action,
        paused: action === 'pause',
      });
  }
  function onSubmit(event) {
    const form = event.target.closest('[data-phantom-form]');
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form),
      action = form.dataset.phantomForm,
      e = current(),
      base = { eventId: e?.id, offerVersion: e?.offerVersion };
    if(action==='timer'){request('phantomControl',{...base,action:'timer',seconds:Number(data.get('seconds'))});}
    else if (action === 'configure') {
      const cfg = {
        enabled: data.has('enabled'),
        questionCount: Number(data.get('count')),
        duration: Number(data.get('duration')),
        betSeconds: Number(data.get('betsTime')),
        negotiationSeconds: Number(data.get('negotiationTime')),
        autoStart: data.has('autoStart'),
        reduced: data.has('reduced'),
        volume: Number(data.get('volume')),
        questionIds: data.getAll('questionIds'),
        royaleQuestionIds: data.getAll('royaleQuestionIds'),
      };
      request('phantomConfigure', cfg);
    } else if (action === 'offer' || action === 'counter')
      request('phantomTeam', {
        ...base,
        action,
        amount: Number(data.get('amount')),
        toTeamId: data.get('toTeamId'),
      });
    else if (action === 'bet')
      request('phantomTeam', {
        ...base,
        action,
        amount: Number(data.get('stake')),
        side: data.get('side'),
      });
    else if (action === 'proposal')
      request(manager() ? 'phantomControl' : 'phantomTeam', {
        action: manager() ? 'proposal' : 'royaleProposal',
        amount: Number(data.get('amount')),
      });
    else if (action === 'sponsor')
      request('phantomControl', {
        action,
        fund: Number(data.get('sponsorFund')),
        teamIds: data.getAll('teamIds'),
      });
  }
  const errorObserver = new MutationObserver(() => {
    const output = arena.querySelector('.phantom-event-error');
    if (output) output.textContent = notice.textContent;
  });
  errorObserver.observe(notice, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  arena.addEventListener('change', (event) => {
    if (event.target.matches('[data-phantom-volume]'))
      request('phantomControl', {
        action: 'effects',
        reduced: !!state.phantom?.config.reduced,
        volume: Number(event.target.value),
      });
  });
  entry.addEventListener('click', onClick);
  arena.addEventListener('click', onClick);
  entry.addEventListener('submit', onSubmit);
  arena.addEventListener('submit', onSubmit);
  document.body.append(arena);
  const off = engine.onChange((next) => {
      state = next;
      render();
    }),
    timer = setInterval(tick, 250);
  const onKey = (event) => {
    if (event.key === 'Escape' && !arena.hidden) {
      collapsed = true;
      render();
    }
  };
  document.addEventListener('keydown', onKey);
  function dispose() {
    disposed = true;
    clearInterval(timer);
    off();
    errorObserver.disconnect();
    document.removeEventListener('keydown', onKey);
    arena.remove();
    entry.remove();
    stylesheet.remove();
    audio?.close().catch(() => {});
    window.dispatchEvent(
      new CustomEvent('cq:phantom-scene', { detail: { active: false } }),
    );
  }
  window.addEventListener('pagehide', dispose, { once: true });
  return dispose;
}

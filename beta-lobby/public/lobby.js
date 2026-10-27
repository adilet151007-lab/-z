import {GAME} from './lobby-config.js';
import {COPY} from './lobby-copy.js';
import {createStorage, matchesGame, parseInvitation} from './lobby-core.js';
import {setupPlatform} from './lobby-platform.js';
import {setupAccount} from './lobby-account.js';

const storage = createStorage(), $ = id => document.getElementById(id);
const keys = {language:'cq_lobby_language_v1', theme:'cq_lobby_theme_v1', invite:'cq_lobby_invite_v1'};
let language = storage.get(keys.language) === 'kk' ? 'kk' : 'ru';
let theme = storage.get(keys.theme) === 'light' ? 'light' : 'dark';
let invitation = null, message = '', error = false;
const t = key => COPY[language][key] || COPY.ru[key] || key;
let account,platform;

function renderMessage() {
  $('invitation-message').textContent = message ? t(message) : '';
  $('invitation-message').classList.toggle('is-error', error);
  $('invitation-input').setAttribute('aria-invalid', String(error));
}
function renderSearch() {
  const found = matchesGame($('game-search').value);
  $('game-card').hidden = !found;
  $('empty-state').hidden = found;
  $('game-count').textContent = t(found ? 'oneGame' : 'noGames');
}
function render() {
  document.documentElement.lang = language;
  document.documentElement.dataset.theme = theme;
  document.title = t('title');
  document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#edf5fa' : '#0b131c';
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(node => { node.placeholder = t(node.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-aria]').forEach(node => { node.setAttribute('aria-label', t(node.dataset.i18nAria)); });
  document.querySelectorAll('[data-language]').forEach(node => { node.setAttribute('aria-pressed', String(node.dataset.language === language)); });
  $('theme-toggle').setAttribute('aria-label', t(theme === 'dark' ? 'switchLight' : 'switchDark'));
  $('theme-toggle').title = t(theme === 'dark' ? 'switchLight' : 'switchDark');
  $('student-link').href = invitation?.url || GAME.studentUrl;
  document.querySelectorAll('[data-teacher]').forEach(node => { node.href = GAME.teacherUrl; });
  document.querySelectorAll('[data-privacy]').forEach(node => { node.href = GAME.privacyUrl; });
  $('saved-invite').hidden = !invitation;
  renderMessage(); renderSearch();
  account?.render();platform?.render();
}

try {
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('join')) {
    history.replaceState(null, '', location.pathname + location.search);
    invitation = parseInvitation(location.origin + '/#' + params.toString(), location.origin);
    storage.set(keys.invite, invitation.url, true);
    message = 'ready';
  } else {
    const saved = storage.get(keys.invite, true);
    if (saved) invitation = parseInvitation(saved, location.origin);
  }
} catch (problem) {
  storage.remove(keys.invite, true);
  message = COPY.ru[problem.code] ? problem.code : 'invalid'; error = true;
}
if (invitation) $('invitation-input').value = invitation.url;
render();
account=setupAccount({language:()=>language});

// A second invitation can arrive while this tab is already open.
window.addEventListener('hashchange', () => {
  if (new URLSearchParams(location.hash.slice(1)).has('join')) location.reload();
});

$('theme-toggle').addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark'; storage.set(keys.theme, theme); render();
});
document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => {
  language = button.dataset.language; storage.set(keys.language, language); render();
}));
$('game-search').addEventListener('input', renderSearch);
$('game-search').addEventListener('keydown', event => { if (event.key === 'Escape') { $('game-search').value = ''; renderSearch(); } });
$('clear-search').addEventListener('click', () => { $('game-search').value = ''; renderSearch(); $('game-search').focus(); });
$('invitation-input').addEventListener('input', () => { if (message) { message = ''; error = false; renderMessage(); } });
$('invitation-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    invitation = parseInvitation($('invitation-input').value, location.origin);
    storage.set(keys.invite, invitation.url, true);
    message = 'ready'; error = false; render();
    location.assign(invitation.url);
  } catch (problem) {
    message = COPY.ru[problem.code] ? problem.code : 'invalid'; error = true; renderMessage(); $('invitation-input').focus();
  }
});
$('remove-invitation').addEventListener('click', () => {
  invitation = null; storage.remove(keys.invite, true); $('invitation-input').value = '';
  message = 'removed'; error = false; render(); $('invitation-input').focus();
});

const dialog = $('help-dialog'); let returnFocus;
function closeHelp() {
  if (dialog.close) dialog.close(); else dialog.removeAttribute('open');
  document.body.classList.remove('help-open'); returnFocus?.focus();
}
document.querySelectorAll('[data-help]').forEach(button => button.addEventListener('click', () => {
  returnFocus = document.activeElement;
  if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
  document.body.classList.add('help-open');
}));
$('help-close').addEventListener('click', closeHelp);
dialog.addEventListener('cancel', event => { event.preventDefault(); closeHelp(); });
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeHelp();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && dialog.open) closeHelp(); });

platform = setupPlatform({language:()=>language});
document.getElementById("language-select")?.addEventListener("change",()=>platform.render());

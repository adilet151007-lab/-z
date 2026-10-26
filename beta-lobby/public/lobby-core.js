import {GAME, GAME_ORIGIN} from './lobby-config.js';

export class InvitationError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// This checks the destination and format. Only the game server grants admission.
export function parseInvitation(value, portalOrigin = '') {
  if (typeof value !== 'string' || !value.trim()) throw new InvitationError('empty');
  const input = value.trim();
  if (input.length > 3200 || /[\u0000-\u0020\u007f]/u.test(input)) throw new InvitationError('invalid');
  let token = input;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(input)) {
    let url;
    try { url = new URL(input); } catch { throw new InvitationError('invalid'); }
    const game = url.origin === GAME_ORIGIN && url.pathname === '/student.html';
    const portal = portalOrigin && url.origin === portalOrigin && ['/', '/index.html'].includes(url.pathname);
    if (url.protocol !== 'https:' || url.username || url.password || !(game || portal)) throw new InvitationError('destination');
    if (url.search) throw new InvitationError('invalid');
    const params = new URLSearchParams(url.hash.slice(1));
    if (params.size !== 1 || !params.has('join')) throw new InvitationError('invalid');
    token = params.get('join');
  }
  if (token.length > 2000 || !/^[A-Za-z0-9_-]{20,1950}\.[A-Za-z0-9_-]{43}$/.test(token)) throw new InvitationError('invalid');
  try {
    const payload = JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.role !== 'admission' || typeof payload.epoch !== 'string' || !/^[\w-]{1,80}$/.test(payload.epoch) || !Number.isSafeInteger(payload.expires) || payload.expires <= 0) throw new Error();
  } catch { throw new InvitationError('invalid'); }
  return Object.freeze({token, url: GAME.studentUrl + '#join=' + encodeURIComponent(token)});
}

export function createStorage(environment = globalThis) {
  const memory = new Map();
  const names = sessionOnly => sessionOnly ? ['sessionStorage'] : ['localStorage', 'sessionStorage'];
  return {
    get(key, sessionOnly = false) {
      if (memory.has(key)) return memory.get(key);
      for (const name of names(sessionOnly)) try {
        const value = environment[name]?.getItem(key);
        if (value !== null && value !== undefined) return value;
      } catch {}
      return null;
    },
    set(key, value, sessionOnly = false) {
      memory.set(key, value);
      for (const name of names(sessionOnly)) try { environment[name]?.setItem(key, value); } catch {}
    },
    remove(key, sessionOnly = false) {
      memory.delete(key);
      for (const name of names(sessionOnly)) try { environment[name]?.removeItem(key); } catch {}
    }
  };
}

export const normalizeSearch = value => String(value).normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
export const matchesGame = query => !normalizeSearch(query) || normalizeSearch(GAME.keywords).includes(normalizeSearch(query));

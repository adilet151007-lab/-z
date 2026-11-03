// Keep signed query/fragment invitations intact; reject unrelated destinations.
export function parseInvitation(value, origin) {
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('INVALID_INVITATION');
  const input = value.trim();
  if (!input || !/^https?:\/\//i.test(input)) throw new Error('INVALID_INVITATION');
  const url = new URL(input);
  if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) throw new Error('INVALID_INVITATION');
  if (url.origin !== new URL(origin).origin && url.origin !== 'https://culture-quest-z.onrender.com') throw new Error('INVALID_INVITATION');
  if (url.pathname === '/' && (url.searchParams.has('qr') || new URLSearchParams(url.hash.slice(1)).has('join'))) url.pathname = '/student.html';
  if (url.pathname !== '/student.html') throw new Error('INVALID_INVITATION');
  return url;
}

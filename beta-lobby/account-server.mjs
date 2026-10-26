import express from 'express';
import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {OAuth2Client} from 'google-auth-library';
import {clientAddress, RequestLimiter} from '../security-controls.js';

const publicDirectory = new URL('./public/', import.meta.url);
const assets = new Set(['lobby.js','lobby.css','lobby-core.js','lobby-copy.js','lobby-account.js','mark.svg','ornament.svg','mobile-preview.html','lobby-privacy.html']);
const hash = value => createHash('sha256').update(String(value)).digest();
const equal = (left, right) => timingSafeEqual(hash(left), hash(right));
const random = () => randomBytes(32).toString('base64url');
const WEEK = 7 * 24 * 60 * 60 * 1000;

export function createLobbyRouter(options = {}) {
  const origin = options.publicOrigin;
  const url = new URL(origin);
  if (url.origin !== origin || url.protocol !== 'https:' && !(['localhost','127.0.0.1'].includes(url.hostname) && url.protocol === 'http:')) throw new Error('LOBBY_PUBLIC_ORIGIN must be an HTTPS origin, or localhost for development.');
  const gameOrigin=options.gameOrigin||origin,gameUrl=new URL(gameOrigin);
  if(gameUrl.origin!==gameOrigin||gameUrl.protocol!=='https:'&&!(['localhost','127.0.0.1'].includes(gameUrl.hostname)&&gameUrl.protocol==='http:'))throw new Error('Invalid game origin.');
  if (typeof options.sessionSecret !== 'string' || options.sessionSecret.length < 32) throw new Error('A separate lobby session secret of at least 32 characters is required.');
  const secret = createHmac('sha256', options.sessionSecret).update('culture-quest/lobby/account/v1').digest();
  const now = options.now || Date.now, secure = url.protocol === 'https:';
  const names = {session:secure?'__Host-cq_account':'cq_account', flow:secure?'__Host-cq_flow':'cq_flow'};
  const enabled = !!(options.clientId && options.clientSecret);
  const redirectUri = origin + '/auth/google/callback';
  const oauth = options.oauth || (enabled ? new OAuth2Client({clientId:options.clientId,clientSecret:options.clientSecret,redirectUri,transporterOptions:{timeout:10000}}) : null);
  const router = express.Router(), pending = new Map(), limiter = new RequestLimiter(now);
  const cookie = (res, name, value, maxAge) => res.cookie(name, value, {httpOnly:true, secure, sameSite:'lax', path:'/', maxAge});
  const cookieValue = (req, name) => {
    const raw = req.headers.cookie?.split(';').map(value=>value.trim()).find(value=>value.startsWith(name+'='));
    if (!raw || raw.length > 6000) return null;
    try {return decodeURIComponent(raw.slice(name.length+1));} catch {return null;}
  };
  function sign(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return body + '.' + createHmac('sha256',secret).update(body).digest('base64url');
  }
  function account(req) {
    const value = cookieValue(req,names.session);
    if (!value || value.length > 4000) return null;
    const [body,signature,extra] = value.split('.');
    if (!body || !signature || extra || !equal(signature,createHmac('sha256',secret).update(body).digest('base64url'))) return null;
    try {
      const data = JSON.parse(Buffer.from(body,'base64url').toString());
      if (data.kind !== 'google-account' || typeof data.sub !== 'string' || !data.sub || data.sub.length > 255 || !Number.isSafeInteger(data.expires) || data.expires <= now()) return null;
      return {id:'google:'+data.sub,name:data.name,email:data.email};
    } catch {return null;}
  }
  router.get('/api/account', (req,res) => res.set('Cache-Control','no-store').json({googleEnabled:enabled,user:account(req)}));
  router.get('/auth/google', (req,res) => {
    if (!enabled) return res.redirect(303,'/?account=not-configured');
    try {limiter.take(clientAddress(req,options.trustProxy===true),20,10000);} catch {return res.status(429).set('Retry-After','10').send('Please try signing in again in a few seconds.');}
    for (const [id,flow] of pending) if (flow.expires <= now()) pending.delete(id);
    if (pending.size >= 1000) return res.status(503).send('Sign-in is busy. Please try again shortly.');
    const id = random(), state = random(), nonce = random(), verifier = random();
    pending.set(id,{state,nonce,verifier,expires:now()+10*60000});
    cookie(res,names.flow,id,10*60000);
    res.redirect(303,oauth.generateAuthUrl({scope:['openid','profile','email'],state,nonce,prompt:'select_account',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}));
  });
  router.get('/auth/google/callback', async (req,res) => {
    if (!enabled) return res.redirect(303,'/?account=not-configured');
    const id = cookieValue(req,names.flow), flow = pending.get(id);
    if (!flow || flow.expires <= now() || typeof req.query.state !== 'string' || !equal(req.query.state,flow.state)) return res.redirect(303,'/?account=expired');
    pending.delete(id);cookie(res,names.flow,'',0);
    if (req.query.error === 'access_denied') return res.redirect(303,'/?account=cancelled');
    if (typeof req.query.code !== 'string' || !req.query.code || req.query.code.length > 4096 || req.query.error) return res.redirect(303,'/?account=failed');
    try {
      const {tokens} = await oauth.getToken({code:req.query.code,codeVerifier:flow.verifier,redirect_uri:redirectUri});
      if (typeof tokens.id_token !== 'string') throw new Error('No ID token');
      const ticket = await oauth.verifyIdToken({idToken:tokens.id_token,audience:options.clientId});
      const profile = ticket.getPayload();
      if (!profile || !equal(profile.nonce,flow.nonce) || typeof profile.sub !== 'string' || !profile.sub || profile.sub.length > 255 || profile.email_verified !== true || typeof profile.email !== 'string' || profile.email.length > 320) throw new Error('Invalid account');
      const name = String(profile.name || profile.given_name || profile.email.split('@')[0]).replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,80) || 'Участник';
      cookie(res,names.session,sign({kind:'google-account',sub:profile.sub,name,email:profile.email,expires:now()+WEEK}),WEEK);
      return res.redirect(303,'/?account=connected');
    } catch {return res.redirect(303,'/?account=failed');}
  });
  router.post('/auth/logout', (req,res) => {
    if (req.headers.origin !== origin || req.headers['x-cq-lobby'] !== '1') return res.status(403).json({ok:false});
    cookie(res,names.session,'',0);return res.json({ok:true});
  });
  router.get('/lobby-config.js', async (_req,res,next) => {
    try {
      const source = await readFile(new URL('lobby-config.js',publicDirectory),'utf8');
      res.type('application/javascript').set('Cache-Control','no-store').send(source.replace(/^export const GAME_ORIGIN = .*;$/m,'export const GAME_ORIGIN = '+JSON.stringify(gameOrigin)+';'));
    } catch (error) {next(error);}
  });
  router.get(['/', '/index.html'], async (_req,res,next) => {
    try{const html=await readFile(new URL('index.html',publicDirectory),'utf8');res.type('html').send(html.replace('<html lang="ru"','<html data-account-api="enabled" lang="ru"'));}catch(error){next(error);}
  });
  router.use((req,res,next) => {
    const file = req.path.slice(1);
    if (req.method !== 'GET' || !assets.has(file)) return next();
    res.sendFile(fileURLToPath(new URL(file,publicDirectory)));
  });
  return router;
}

import {FileStore} from '../storage.js';
import pg from 'pg';
import path from 'node:path';
const initial=()=>({version:1,accounts:{},invitations:{},rooms:{},bindings:{},results:{}});
export class PlatformStore {
 constructor(backend){this.backend=backend;this.pending=Promise.resolve();this.kind=backend.kind;}
 async init(){await this.backend.init();return this;}
 transaction(fn){const job=this.pending.then(async()=>{if(this.backend.mutate)return this.backend.mutate('platform',initial,fn);const state=await this.backend.load('platform')||initial();const result=await fn(state);await this.backend.save('platform',state);return structuredClone(result);});this.pending=job.catch(()=>{});return job;}
 async read(fn){await this.pending;return structuredClone(fn(await this.backend.load('platform')||initial()));}
 roomStore(id){if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid room id');const b=this.backend;return {kind:b.kind,init:async()=>{},load:()=>b.load('room:'+id),save:s=>b.save('room:'+id,s),loadChat:()=>b.load('chat:'+id),saveChat:s=>b.save('chat:'+id,s),close:async()=>{}};}
 async acquireRoom(id){return this.backend.acquireRoom?this.backend.acquireRoom(id):{assert(){},release:async()=>{}};}
 async close(){await this.pending;await this.backend.close();}
}
export function fileBackend(directory){const file=key=>new FileStore(path.join(directory,Buffer.from(key).toString('hex')+'.json'));return {kind:'file',init:async()=>{},load:key=>file(key).load(),save:async(key,s)=>{const f=file(key);await f.init();await f.save(s);},close:async()=>{}};}
export function memoryBackend(){const docs=new Map();return {kind:'memory',init:async()=>{},load:async key=>structuredClone(docs.get(key)||null),save:async(key,s)=>docs.set(key,structuredClone(s)),close:async()=>{}};}
export async function openPlatformStore({databaseUrl,stateDirectory,render=false}){
 if(databaseUrl){const pool=new pg.Pool({connectionString:databaseUrl,max:8,connectionTimeoutMillis:10000});pool.on('error',()=>console.error('Platform database connection interrupted.'));const b={kind:'postgres',init:async()=>{await pool.query('CREATE TABLE IF NOT EXISTS cq_platform_documents (key TEXT PRIMARY KEY, snapshot JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');},load:async key=>(await pool.query('SELECT snapshot FROM cq_platform_documents WHERE key=$1',[key])).rows[0]?.snapshot||null,save:async(key,s)=>{await pool.query('INSERT INTO cq_platform_documents(key,snapshot) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET snapshot=EXCLUDED.snapshot,updated_at=NOW()',[key,JSON.stringify(s)]);},close:()=>pool.end()};
 b.mutate=async(key,empty,fn)=>{const c=await pool.connect();try{await c.query('BEGIN');await c.query('INSERT INTO cq_platform_documents(key,snapshot) VALUES($1,$2::jsonb) ON CONFLICT(key) DO NOTHING',[key,JSON.stringify(empty())]);const row=await c.query('SELECT snapshot FROM cq_platform_documents WHERE key=$1 FOR UPDATE',[key]);const state=row.rows[0].snapshot,result=await fn(state);await c.query('UPDATE cq_platform_documents SET snapshot=$2::jsonb,updated_at=NOW() WHERE key=$1',[key,JSON.stringify(state)]);await c.query('COMMIT');return structuredClone(result);}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}};
 b.acquireRoom=async id=>{const c=await pool.connect();let valid=true,released=false;const lost=()=>{valid=false;};c.on('error',lost);try{const r=await c.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired',['cq-room:'+id]);if(!r.rows[0].acquired)throw new Error('Room is moving between instances.');return {assert(){if(!valid||released)throw new Error('Room database lease lost.');},release:async()=>{if(released)return;released=true;try{if(valid)await c.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['cq-room:'+id]);}finally{c.removeListener('error',lost);c.release(!valid);}}};}catch(e){c.removeListener('error',lost);c.release();throw e;}};
 return new PlatformStore(b).init();}
 if(render)return null;
 return new PlatformStore(fileBackend(stateDirectory||'./beta-lobby/data/platform')).init();
}

import {isIP} from 'node:net';
import {GameError} from './game-logic.js';

export function clientAddress(request,trustProxy=false){
 const forwarded=trustProxy&&request.headers?.['x-forwarded-for'];
 const candidate=typeof forwarded==='string'?forwarded.split(',').at(-1).trim():null;
 return candidate&&isIP(candidate)?candidate:request.socket?.remoteAddress||'unknown';
}
export class RequestLimiter{
 constructor(clock=Date.now,maxEntries=5000){this.now=clock;this.maxEntries=maxEntries;this.records=new Map()}
 take(key,limit,windowMs){
  const now=this.now();let record=this.records.get(key);
  if(!record||record.until<=now){
   if(this.records.size>=this.maxEntries)for(const [id,value]of this.records)if(value.until<=now)this.records.delete(id);
   if(!record&&this.records.size>=this.maxEntries)this.deny(2000);
   record={count:0,until:now+windowMs};this.records.set(key,record);
  }
  if(record.count>=limit)this.deny(record.until-now);
  record.count++;return record;
 }
 deny(retryAfterMs){const error=new GameError('Слишком много попыток входа. Подождите несколько секунд.','RATE_LIMIT');error.retryAfterMs=Math.max(1,Math.ceil(retryAfterMs));throw error}
 prune(){for(const [key,value]of this.records)if(value.until<=this.now())this.records.delete(key)}
}

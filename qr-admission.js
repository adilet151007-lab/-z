import {createHmac,timingSafeEqual} from 'node:crypto';

export const QR_INTERVAL_MS=3000;
export const QR_VALID_MS=15000;
const signature=(secret,payload)=>createHmac('sha256',secret).update('eradis-room-qr-v1:'+payload).digest('base64url');
export function issueQrTicket(secret,scope,epoch,now=Date.now()){
 const slot=Math.floor(now/QR_INTERVAL_MS),payload=Buffer.from(JSON.stringify({scope,epoch,slot})).toString('base64url');
 return {token:payload+'.'+signature(secret,payload),serverNow:now,refreshMs:QR_INTERVAL_MS,expiresAt:slot*QR_INTERVAL_MS+QR_VALID_MS};
}
export function validQrTicket(token,secret,scope,epoch,now=Date.now()){
 if(typeof token!=='string'||token.length>1000)return false;
 const [payload,sig,extra]=token.split('.');if(!payload||!sig||extra)return false;
 const expected=signature(secret,payload);if(!/^[A-Za-z0-9_-]{43}$/.test(sig)||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return false;
 try{const data=JSON.parse(Buffer.from(payload,'base64url').toString());return data.scope===scope&&data.epoch===epoch&&Number.isSafeInteger(data.slot)&&data.slot<=Math.floor(now/QR_INTERVAL_MS)&&now<data.slot*QR_INTERVAL_MS+QR_VALID_MS;}catch{return false;}
}

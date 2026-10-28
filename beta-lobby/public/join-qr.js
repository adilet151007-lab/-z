import qrcode from './qr-generator.js';

const kk=()=>document.documentElement.lang.startsWith('kk');
const text=(ru,kz)=>kk()?kz:ru;
export function joinAddress(value,base=globalThis.location.href){
 const url=new URL(value,base),origin=new URL(base).origin;
 if(url.origin!==origin||!/^https?:$/.test(url.protocol)||!/^\/(?:rooms\/[a-f0-9-]{36}\/)?student\.html$/.test(url.pathname)||url.search||url.hash)throw new Error('Invalid room address');
 return url.href;
}
export function createJoinQrButton(value,{title='ERADIS',label}={}){
 const button=document.createElement('button');button.type='button';button.className='button button-outline';button.textContent=label||text('QR для входа','Кіруге арналған QR');
 button.addEventListener('click',()=>{
  const dialog=document.createElement('dialog');dialog.className='join-qr-dialog';dialog.setAttribute('aria-label',title);
  const heading=document.createElement('h2');heading.textContent=title;
  const note=document.createElement('p');note.textContent=text('QR обновляется каждые 3 секунды. На открытие после сканирования — до 15 секунд.','QR әр 3 секунд сайын жаңарады. Сканерлегеннен кейін ашуға 15 секундқа дейін беріледі.');
  const status=document.createElement('p');status.setAttribute('role','status');
  const canvas=document.createElement('canvas');canvas.className='join-qr-image';canvas.hidden=true;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',text('QR-код входа в комнату','Бөлмеге кіру QR-коды'));
  const link=document.createElement('a');link.className='join-qr-link';link.hidden=true;
  const actions=document.createElement('div');actions.className='join-qr-actions';
  const save=document.createElement('button');save.type='button';save.disabled=true;save.textContent=text('Скачать PNG','PNG жүктеу');
  const close=document.createElement('button');close.type='button';close.textContent=text('Закрыть','Жабу');close.addEventListener('click',()=>dialog.close());
  save.addEventListener('click',()=>{if(save.disabled)return;const a=document.createElement('a');a.download='ERADIS-room-QR.png';a.href=canvas.toDataURL('image/png');a.click();});
  actions.append(save,close);dialog.append(heading,note,status,canvas,link,actions);document.body.append(dialog);
  let timer,controller,busy=false,closed=false;
  const clear=()=>{canvas.hidden=true;save.disabled=true;link.hidden=true;link.removeAttribute('href');};
  async function refresh(){
   if(closed||document.hidden||busy)return;busy=true;controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),2500);
   try{
    const base=joinAddress(typeof value==='function'?value():value),endpoint=new URL('./api/join-qr',base);
    const response=await fetch(endpoint,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
    const data=await response.json();if(!response.ok)throw new Error(data.error||text('QR недоступен.','QR қолжетімсіз.'));
    if(closed||document.hidden)return;
    const address=new URL(base);address.searchParams.set('qr',data.token);
    const qr=qrcode(0,'M');qr.addData(address.href,'Byte');qr.make();
    const count=qr.getModuleCount(),quiet=4,scale=Math.max(4,Math.ceil(512/(count+quiet*2)));
    canvas.width=canvas.height=(count+quiet*2)*scale;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#000';
    for(let row=0;row<count;row++)for(let col=0;col<count;col++)if(qr.isDark(row,col))ctx.fillRect((col+quiet)*scale,(row+quiet)*scale,scale,scale);
    canvas.hidden=false;save.disabled=false;link.href=address.href;link.textContent=text('Открыть текущий вход','Ағымдағы кіруді ашу');link.hidden=false;status.textContent=text('Сканируйте камерой телефона','Телефон камерасымен сканерлеңіз');
   }catch(error){if(!closed){clear();status.textContent=error.name==='AbortError'?text('Нет связи. Повторяем подключение…','Байланыс жоқ. Қайта қосылуда…'):error.message;}}
   finally{clearTimeout(timeout);busy=false;}
  }
  function visibility(){clearInterval(timer);clear();controller?.abort();if(!document.hidden&&!closed){refresh();timer=setInterval(refresh,3000);}}
  dialog.addEventListener('close',()=>{closed=true;clearInterval(timer);controller?.abort();document.removeEventListener('visibilitychange',visibility);dialog.remove();},{once:true});
  document.addEventListener('visibilitychange',visibility);dialog.showModal();close.focus();refresh();timer=setInterval(refresh,3000);
 });
 return button;
}

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
  const dialog=document.createElement('dialog');dialog.className='join-qr-dialog';
  const heading=document.createElement('h2');heading.textContent=title;
  const note=document.createElement('p');note.textContent=text('Сканируйте камерой телефона, чтобы войти в эту комнату. Вход должен быть открыт преподавателем.','Осы бөлмеге кіру үшін телефон камерасымен сканерлеңіз. Оқытушы кіруді ашуы керек.');
  const canvas=document.createElement('canvas');canvas.className='join-qr-image';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',text('QR-код входа в комнату','Бөлмеге кіру QR-коды'));
  const link=document.createElement('a');link.className='join-qr-link';
  const actions=document.createElement('div');actions.className='join-qr-actions';
  const save=document.createElement('button');save.type='button';save.textContent=text('Скачать PNG','PNG жүктеу');
  const close=document.createElement('button');close.type='button';close.textContent=text('Закрыть','Жабу');close.addEventListener('click',()=>dialog.close());
  try{
   const address=joinAddress(typeof value==='function'?value():value);link.href=address;link.textContent=address;
   const qr=qrcode(0,'M');qr.addData(address,'Byte');qr.make();
   const count=qr.getModuleCount(),quiet=4,scale=Math.max(4,Math.ceil(512/(count+quiet*2)));
   canvas.width=canvas.height=(count+quiet*2)*scale;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#000';
   for(let row=0;row<count;row++)for(let col=0;col<count;col++)if(qr.isDark(row,col))ctx.fillRect((col+quiet)*scale,(row+quiet)*scale,scale,scale);
   save.addEventListener('click',()=>{const a=document.createElement('a');a.download='ERADIS-room-QR.png';a.href=canvas.toDataURL('image/png');a.click();});
  }catch{note.textContent=text('Не удалось создать QR. Обновите ссылку комнаты и повторите.','QR жасау мүмкін болмады. Бөлме сілтемесін жаңартып, қайталаңыз.');canvas.hidden=true;save.disabled=true;}
  actions.append(save,close);dialog.append(heading,note,canvas,link,actions);document.body.append(dialog);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();close.focus();
 });
 return button;
}

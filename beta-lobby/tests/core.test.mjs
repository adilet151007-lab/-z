import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInvitation,createStorage,matchesGame} from '../public/lobby-core.js';
import {GAME,GAME_ORIGIN} from '../public/lobby-config.js';
import {COPY} from '../public/lobby-copy.js';

const portal='https://culture-quest-lobby-beta.onrender.com';
const tokenFor=payload=>Buffer.from(JSON.stringify(payload)).toString('base64url')+'.'+'s'.repeat(43);
const token=tokenFor({role:'admission',epoch:'simulated-lesson',expires:1900000000000});
const invitation=GAME.studentUrl+'#join='+token;
function memory(){const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}}

test('приглашение преподавателя сохраняет токен и ведёт на штатную страницу участника',()=>{
 assert.deepEqual(parseInvitation('  '+invitation+'  ',portal),{token,url:invitation});
 assert.equal(new URL(parseInvitation(invitation).url).origin,GAME_ORIGIN);
});
test('бета-ссылка с приглашением открывает ту же игру и не подменяет адрес сервера',()=>{
 assert.equal(parseInvitation(portal+'/#join='+token,portal).url,invitation);
 assert.equal(parseInvitation(portal+'/index.html#join='+token,portal).url,invitation);
});
test('скопированный код допуска принимается как альтернативный формат',()=>{
 assert.equal(parseInvitation(token,portal).url,invitation);
});
test('чужие домены, похожие адреса, HTTP и данные авторизации не открываются',()=>{
 for(const url of ['https://culture-quest-z.onrender.com.attacker.test/student.html#join='+token,'https://attacker.test/student.html#join='+token,'http://culture-quest-z.onrender.com/student.html#join='+token,'https://user:password@culture-quest-z.onrender.com/student.html#join='+token,'javascript:alert(1)','//attacker.test'])assert.throws(()=>parseInvitation(url,portal));
});
test('ссылка преподавателя, лишние параметры и двойной join не становятся приглашением студента',()=>{
 for(const url of [GAME.teacherUrl+'#join='+token,GAME.studentUrl+'?redirect=https://attacker.test#join='+token,GAME.studentUrl+'#join='+token+'&join='+token,GAME.studentUrl+'#join='+token+'&role=creator',portal+'/teacher.html#join='+token])assert.throws(()=>parseInvitation(url,portal));
});
test('пустые, повреждённые, чрезмерные данные и токены других ролей отклоняются',()=>{
 for(const value of ['',null,'123456','x'.repeat(3201),token+'\nextra',tokenFor({role:'teacher',epoch:'lesson',expires:1900000000000}),tokenFor({role:'admission',expires:1900000000000}),tokenFor({role:'admission',epoch:123,expires:1900000000000}),tokenFor({role:'admission',epoch:'lesson',expires:'1900000000000'})])assert.throws(()=>parseInvitation(value,portal));
});
test('запрет хранилища не ломает настройки или временное приглашение',()=>{
 const blocked={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')},removeItem(){throw new Error('blocked')}};
 const store=createStorage({localStorage:blocked,sessionStorage:blocked});store.set('theme','light');store.set('invite',invitation,true);assert.equal(store.get('theme'),'light');assert.equal(store.get('invite',true),invitation);store.remove('invite',true);assert.equal(store.get('invite',true),null);
});
test('приглашение хранится только в сессии; удаление не трогает чужие настройки',()=>{
 const local=memory(),session=memory(),store=createStorage({localStorage:local,sessionStorage:session});store.set('language','kk');store.set('invite',invitation,true);assert.equal(local.data.has('invite'),false);assert.equal(session.data.get('invite'),invitation);store.remove('invite',true);assert.equal(session.data.has('invite'),false);assert.equal(store.get('language'),'kk');
});
test('поиск работает на русском, казахском и с разным регистром',()=>{
 for(const query of ['','  МӘДЕНИЕТТАНУ  ','Культурология','SOLO','Жеке сайыс','3D'])assert.equal(matchesGame(query),true,query);
 assert.equal(matchesGame('<script>alert(1)</script>'),false);assert.equal(matchesGame('Физика'),false);
});
test('обе версии интерфейса полны, имена игр и маршруты не зависят от языка',()=>{
 assert.deepEqual(Object.keys(COPY.ru).sort(),Object.keys(COPY.kk).sort());
 for(const value of Object.values(COPY.kk))assert.ok(typeof value==='string'&&value.trim());
 assert.equal(GAME.teacherUrl,GAME_ORIGIN+'/teacher.html');assert.equal(GAME.studentUrl,GAME_ORIGIN+'/student.html');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DOMParser} from '@xmldom/xmldom';

const source=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
async function page(path){const html=await source(path);return new DOMParser({errorHandler:{warning(){},error(message){throw new Error(message)},fatalError(message){throw new Error(message)}}}).parseFromString(html,'text/html')}
function ancestor(node,className){for(let p=node?.parentNode;p;p=p.parentNode)if(p.getAttribute?.('class')?.split(/\s+/).includes(className))return p;return null}

test('интерфейс: формат и рейтинг внутри прокрутки после участников, без закреплённой нижней панели',async()=>{
 const doc=await page('teacher.html'),grid=ancestor(doc.getElementById('format-panel'),'t-grid');assert.ok(grid);
 const controls=doc.getElementById('match-tools');assert.ok(ancestor(controls,'t-col'));assert.equal(doc.getElementById('team-ranking').hasAttribute('open'),false);assert.equal(doc.getElementById('format-panel').hasAttribute('open'),false);
 let preceding=controls.previousSibling;while(preceding&&preceding.nodeType!==1)preceding=preceding.previousSibling;assert.equal(preceding.getAttribute('id'),'roster-panel');
 assert.equal(doc.getElementById('presentation-effects'),null);assert.equal(doc.getElementById('session-requests'),null);
});

test('интерфейс: студенческий вход имеет отдельное согласие и не содержит перехода в админку',async()=>{
 const doc=await page('student.html'),consent=doc.getElementById('privacy-consent');assert.ok(consent);assert.equal(consent.hasAttribute('checked'),false);
 assert.ok([...Array.from(doc.getElementsByTagName('a'))].some(a=>a.getAttribute('href')==='privacy.html'));
 assert.equal(Array.from(doc.getElementsByTagName('a')).some(a=>/teacher|root/i.test(a.getAttribute('href')||'')),false);
 assert.ok(doc.getElementById('map-status'));assert.ok(doc.getElementById('question-panel'));
 const utilities=doc.getElementById('session-utilities');assert.ok(utilities);assert.equal(ancestor(utilities,'stage-wrap'),null);assert.equal(ancestor(utilities,'dock'),null);
 assert.ok(Array.from(doc.getElementsByTagName('p')).some(p=>p.hasAttribute('data-achievement-rules')));
});

test('интерфейс: нет повторных статических ID и потерянных обязательных элементов преподавателя',async()=>{
 for(const file of ['student.html','teacher.html']){const doc=await page(file),seen=new Set();for(const node of Array.from(doc.getElementsByTagName('*'))){const id=node.getAttribute('id');if(!id)continue;assert.equal(seen.has(id),false,`${file}: duplicate ${id}`);seen.add(id)}}
 const html=await source('teacher.html'),js=await source('teacher.js'),ids=new Set([...html.matchAll(/\bid="([^"]+)"/g),...js.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 for(const [,id]of js.matchAll(/\$\(["']([\w-]+)["']\)/g))assert.ok(ids.has(id),`DOM element missing: ${id}`);
});

test('интерфейс: мобильная прокрутка, reduced-motion и ленивая загрузка 3D явно настроены',async()=>{
 const css=await source('styles.css');assert.ok(css.includes('.student-page{height:auto;min-height:100%;overflow-x:hidden;overflow-y:auto}'));assert.ok(css.includes('.teacher-page .t-col{display:contents}'));assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'));
 for(const file of ['teacher.js','student.js']){const js=await source(file);assert.ok(js.includes("await import('./scene3d.js')"));assert.equal(js.includes('import { createScene }'),false)}
});

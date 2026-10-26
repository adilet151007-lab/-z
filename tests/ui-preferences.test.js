import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import KAZAKH from '../ui-kz.js';
import {createGameServer} from '../server.js';

let revision=0;
const file=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
async function preferences(t,seed={}){
 const prior={localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage,document:globalThis.document},memory=new Map(Object.entries(seed));
 const storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};globalThis.localStorage=storage;globalThis.sessionStorage=storage;delete globalThis.document;
 t.after(()=>{for(const [key,value]of Object.entries(prior))if(value===undefined)delete globalThis[key];else globalThis[key]=value});
 return {memory,ui:await import('../ui-preferences.js?test='+ ++revision)};
}
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

test('оформление: настройки сохраняются отдельно от игровых сессий и восстанавливаются при смене страницы',async t=>{
 const {ui,memory}=await preferences(t,{cq_player_token_v2:'session-must-stay',cq_ui_language_v1:'kk',cq_ui_theme_v1:'light'});
 assert.equal(ui.getLanguage(),'kk');assert.equal(ui.getTheme(),'light');assert.equal(ui.getLocale(),'kk-KZ');
 ui.setTheme('dark');ui.setLanguage('ru');assert.equal(memory.get('cq_ui_theme_v1'),'dark');assert.equal(memory.get('cq_ui_language_v1'),'ru');assert.equal(memory.get('cq_player_token_v2'),'session-must-stay');
 assert.throws(()=>ui.setLanguage('bad'));assert.throws(()=>ui.setTheme('bad'));
 const reloaded=await import('../ui-preferences.js?test='+ ++revision);assert.equal(reloaded.getTheme(),'dark');assert.equal(reloaded.getLanguage(),'ru');
});

test('оформление: запрет localStorage не ломает переключатели и резервное сохранение',async t=>{
 const {ui,memory}=await preferences(t);globalThis.localStorage={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')}};
 ui.setLanguage('kk');ui.setTheme('light');assert.equal(memory.get('cq_ui_language_v1'),'kk');
 const restored=await import('../ui-preferences.js?test='+ ++revision);assert.equal(restored.getTheme(),'light');assert.equal(restored.t('Ваше имя'),'Сіздің есіміңіз');
});

test('оформление: словарь охватывает оба интерфейса, все параметры перевода сохранены',async t=>{
 const {ui}=await preferences(t,{cq_ui_language_v1:'kk'});assert.ok(Object.keys(KAZAKH).length>650);
 for(const [source,target]of Object.entries(KAZAKH)){assert.ok(target.trim(),source);const slots=value=>[...new Set([...value.matchAll(/\{(\d+)\}/g)].map(match=>Number(match[1])))].sort((a,b)=>a-b);assert.deepEqual(slots(target),slots(source),source)}
 for(const [source,target]of [['Панель преподавателя','Оқытушы панелі'],['Формат пары','Сабақ форматы'],['Культурный ресурс','Мәдени ресурс'],['Светлая тема','Ашық тақырып']])assert.equal(ui.t(source),target);
 assert.equal(ui.tx`${10} команд · ${3} / ${40} участников`,'10 команда · 3 / 40 қатысушы');
 ui.setLanguage('ru');assert.equal(ui.tx`${10} команд · ${3} / ${40} участников`,'10 команд · 3 / 40 участников');
});

test('оформление: перевод не меняет имена и сообщения внутри HTML и сохраняет экранирование',async t=>{
 const {ui}=await preferences(t,{cq_ui_language_v1:'kk'}),name='Команда',message='<img src=x onerror=alert(1)>',markup=ui.tx`<h2>${escape(name)}</h2><label>Ваше имя</label><p>${escape(message)}</p><button title="Подтвердить">Подтвердить</button>`;
 assert.ok(markup.includes('<h2>Команда</h2>'));assert.ok(markup.includes('<label>Сіздің есіміңіз</label>'));assert.ok(markup.includes('&lt;img'));assert.equal(markup.includes('<img'),false);assert.ok(markup.includes('title="Растау"'));assert.equal(ui.t('constructor'),'constructor');
});

test('оформление: настоящий вопрос студента переводит управление, сохраняя текст и выбранный ответ',async t=>{
 const {ui}=await preferences(t,{cq_ui_language_v1:'kk'}),source=await file('student.js'),body=source.slice(source.indexOf('function renderQuestion(state)'),source.indexOf('$("question-panel").addEventListener'));
 const panel={innerHTML:''},state={settings:{mode:'team',teamDecision:'consensus'},viewer:{player:{pid:'p',regionId:'jetisu'},isDevTelemetry:false},regions:[{id:'jetisu',leaderPid:'p'}],round:{id:'round',question:{text:'Вопрос',options:['Команда','Выйти','Ответ','Имя']},votes:{jetisu:{0:1}},submitted:{},myVote:0,results:{},proposals:[{pid:'p',name:'Подтвердить',option:0,remainingMs:4000}],resolved:false,paused:false,duration:30}};
 const engine={state,connected:true,inputStatus:null,remainingSeconds:()=>20},render=new Function('uiText','uiTpl','engine','$','h','let questionKey="",actionPending=false;const updateTimer=()=>{};'+body+';return renderQuestion')(ui.t,ui.tx,engine,()=>panel,escape);
 render(state);assert.ok(panel.innerHTML.includes('<div class="qtext">Вопрос</div>'));assert.ok(panel.innerHTML.includes('<span>Команда</span>'));assert.ok(panel.innerHTML.includes('Подтвердить таңдады'));assert.ok(panel.innerHTML.includes('Растау'));assert.ok(panel.innerHTML.includes('Команда жауабын жіберу'));assert.equal(state.round.myVote,0);
});

test('оформление: настоящий пульт преподавателя переводит кнопки без изменения банка вопросов',async t=>{
 const {ui}=await preferences(t,{cq_ui_language_v1:'kk'}),source=await file('teacher.js'),body=source.slice(source.indexOf('function renderControls(state)'),source.indexOf('$("round-control").addEventListener'));
 const panel={innerHTML:'',insertAdjacentHTML(position,html){this.innerHTML=position==='afterbegin'?html+this.innerHTML:this.innerHTML+html}},question={id:'q1',version:1,text:'Формат пары'},state={settings:{autoAdvance:false,autoDuration:30},round:null,match:null};
 const engine={connected:true,allQuestions:()=>[question]},render=new Function('uiText','uiTpl','engine','$','h','let controlKey="",selectedQuestionId="q1",duration=30;const updateTimer=()=>{};'+body+';return renderControls')(ui.t,ui.tx,engine,()=>panel,escape);
 render(state);assert.ok(panel.innerHTML.includes('>1. Формат пары</option>'));assert.ok(panel.innerHTML.includes('Қолмен бастау'));assert.ok(panel.innerHTML.includes('Автоматты ауысу:'));assert.ok(panel.innerHTML.includes('Сессияны аяқтау'));assert.equal(question.text,'Формат пары');
});

test('оформление: светлая палитра имеет читаемый контраст и отдельные компактные элементы управления',async()=>{
 const css=await file('styles.css'),light=css.match(/:root\[data-theme="light"\]\{([^}]+)\}/)[1];
 const rgb=value=>value.match(/\w\w/g).map(part=>parseInt(part,16)/255),luminance=channels=>channels.map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0),contrast=channels=>1.05/(luminance(channels)+.05);
 for(const name of ['ink','mut'])assert.ok(contrast(rgb(light.match(new RegExp('--'+name+':#([a-f0-9]{6})'))[1]))>=4.5,name);
 for(const name of ['cyan','gold']){const match=light.match(new RegExp('--'+name+':color-mix\\(in srgb,var\\(--brand-[a-z]+,#[a-f0-9]+\\) ([0-9]+)%,#([a-f0-9]{6})\\)','i')),fraction=Number(match[1])/100;assert.ok(contrast(rgb(match[2]).map(n=>n*(1-fraction)+fraction))>=4.5,'custom accent readability')}
 assert.ok(light.includes('color-scheme:light'));assert.ok(css.includes('.topbar .theme-word{display:none}'));assert.ok(css.includes('[data-theme="light"] .chat-message'));
});

test('оформление: сервер раздаёт настройки и словарь с CSP, секретные файлы остаются закрыты',async t=>{
 const store={kind:'memory',state:null,async load(){return this.state},async save(state){this.state=structuredClone(state)},async close(){}};
 const server=await createGameServer({store,teacherPassword:'test-appearance-password',sessionSecret:'test-appearance-secret-more-than-thirty-two',creatorCodes:{},requireConsent:false});t.after(()=>server.close());const port=await server.listen(0,'127.0.0.1'),base='http://127.0.0.1:'+port,revision=server.game.state.revision;
 for(const path of ['student.html','teacher.html','ui-preferences.js','ui-kz.js']){const response=await fetch(base+'/'+path);assert.equal(response.status,200,path);if(path.endsWith('.html')){const html=await response.text();assert.ok(html.includes('cq_ui_theme_v1'));assert.ok(html.includes('cq_ui_language_v1'));assert.match(response.headers.get('content-security-policy'),/nonce-/);assert.ok([...html.matchAll(/<script[^>]*>/g)].every(match=>match[0].includes('nonce=')))}}
 assert.equal((await fetch(base+'/server.js')).status,404);assert.equal((await fetch(base+'/.env')).status,404);assert.equal(server.game.state.revision,revision);
});

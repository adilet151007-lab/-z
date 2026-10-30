import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSyllabus, generateSyllabusQuestions, definitionsFrom } from "../syllabus-engine.js";
const syllabus=`Силлабус: Мәдениеттану
Тема 1. Семиотика культуры
Семиотика — наука о знаках и знаковых системах.
Тема 2. Культурная идентичность
Культурная идентичность — осознание человеком принадлежности к культурному сообществу.
Тақырып 3. Қазақ музыкалық мәдениеті
Тема 4. Кочевая культура
Ритуал — установленная последовательность символически значимых действий.
Традиция — передача культурных образцов и опыта от поколения к поколению.`;
test("находятся русские и казахские заголовки и определения",()=>{
 const result=analyzeSyllabus(syllabus);assert.equal(result.topics.length,4);assert.ok(result.topics.includes("Қазақ музыкалық мәдениеті"));assert.equal(definitionsFrom(syllabus).length,4);
});
test("черновики основаны на определениях и подходящих темах, ответы уникальны",()=>{
 const result=generateSyllabusQuestions(syllabus,["Семиотика культуры","Культурная идентичность","Кочевая культура"],20);
 assert.ok(result.questions.length>3);assert.ok(result.fromDocument>0);
 for(const q of result.questions){assert.equal(q.options.length,4);assert.equal(new Set(q.options).size,4);assert.ok(q.correct>=0&&q.correct<4);if(q.sourceExcerpt)assert.ok(q.sourceExcerpt.includes(q.options[q.correct]))}
 assert.equal(new Set(result.questions.map(q=>q.text)).size,result.questions.length);
});
test("при недостатке материалов не создаются вымышленные факты",()=>{
 const result=generateSyllabusQuestions("Силлабус содержит только административную информацию и расписание занятий.",["Квантовая гравитация"],20);
 assert.equal(result.questions.length,0);assert.match(result.note,/нет подходящих/);
 assert.throws(()=>generateSyllabusQuestions(syllabus,[],5));assert.throws(()=>generateSyllabusQuestions(syllabus,["Культура"],100));assert.throws(()=>analyzeSyllabus("x".repeat(120001)));
});

const computing=`Тема 1. Основы информатики
Алгоритм — конечная последовательность команд для решения поставленной задачи.
Массив — упорядоченная совокупность элементов одного типа данных.
Стек — структура данных с доступом к последнему добавленному элементу.
Очередь — структура данных с доступом к первому добавленному элементу.
Функция: именованный фрагмент программы для выполнения отдельной операции.
Переменная это именованная область памяти для хранения изменяемого значения.`;
test('document-only questions use subject terms, diverse templates and traceable evidence',()=>{
 const r=generateSyllabusQuestions(computing,['Основы информатики'],30);
 assert.equal(r.fromDocument,6);assert.equal(r.fromBank,0);assert.equal(r.questions.length,6);assert.ok(r.questions.some(q=>q.text.startsWith('Какое определение')));assert.ok(r.questions.some(q=>q.text.startsWith('Какой термин')));
 for(const q of r.questions){assert.equal(q.sourceKind,'document');assert.ok(q.sourceExcerpt.includes(q.options[q.correct]));assert.ok(q.sourceLine>0);assert.equal(q.points,25);assert.ok(['basic','medium'].includes(q.difficulty));assert.equal(new Set(q.options).size,4);assert.doesNotMatch(q.options.join(' '),/Ритуал|Семиотика|Культурная идентичность/);}
});
test('Kazakh definitions and tabular glossaries generate Kazakh questions',()=>{
 const text=`Тақырып 1. Информатика негіздері
Алгоритм дегеніміз — есепті шешуге арналған әрекеттердің шектеулі тізбегі.
Массив\tбірдей типтегі элементтердің реттелген жиынтығы.
Стек — соңғы қосылған элемент бірінші алынатын деректер құрылымы.
Кезек — бірінші қосылған элемент бірінші алынатын деректер құрылымы.`;
 const r=generateSyllabusQuestions(text,['Информатика негіздері'],20);assert.equal(r.fromDocument,4);for(const q of r.questions){assert.equal(q.language,'kk');assert.match(q.text,/Құжат/);assert.doesNotMatch(q.text,/Какой|Какое/);assert.ok(q.sourceExcerpt.includes(q.options[q.correct]));}
});
test('explicit dates create grounded year questions, not synthetic years or schedule facts',()=>{
 const text=`Тема 1. История вычислений
В 1946 году был представлен электронный компьютер ENIAC.
В 1947 году исследователи продемонстрировали работающий транзистор.
В 1971 году компания представила коммерческий микропроцессор Intel 4004.
В 1981 году компания IBM выпустила персональный компьютер IBM PC.`;
 const r=generateSyllabusQuestions(text,['История вычислений'],20);assert.equal(r.questions.length,4);for(const q of r.questions){assert.equal(q.type,'year');assert.deepEqual(new Set(q.options),new Set(['1946','1947','1971','1981']));assert.ok(q.sourceExcerpt.includes(q.options[q.correct]));assert.match(q.text,/_____/);}
});
test('purpose and cause questions keep alternatives within the same relation type',()=>{
 const text=`Тема 1. Компьютерные системы
Компилятор используется для преобразования исходного текста программы в машинный код.
Отладчик используется для поиска ошибок и наблюдения за выполнением программы.
Архиватор используется для сжатия и упаковки файлов в единый архив.
Интерпретатор используется для последовательного выполнения команд исходной программы.
Перегрев возникает из-за недостаточного отвода тепла от процессора.
Переполнение возникает из-за превышения допустимой ёмкости используемого буфера.
Потеря данных возникает из-за отказа накопителя без резервной копии.
Задержка возникает из-за перегрузки канала передачи сетевых пакетов.`;
 const r=generateSyllabusQuestions(text,['Компьютерные системы'],30);assert.equal(r.questions.length,8);assert.equal(r.questions.filter(q=>q.type==='purpose').length,4);assert.equal(r.questions.filter(q=>q.type==='cause').length,4);for(const q of r.questions)assert.ok(q.sourceExcerpt.includes(q.options[q.correct]));
});
test('sparse syllabuses do not silently substitute the cultural bank; bank is explicit',()=>{
 const text='Тема 1. Семиотика культуры\nТема 2. Культурная идентичность\nСиллабус содержит расписание занятий и список тем для самостоятельной работы.';
 assert.equal(generateSyllabusQuestions(text,['Семиотика культуры'],20).questions.length,0);
 const bank=generateSyllabusQuestions(text,['Семиотика культуры'],20,{includeBank:true});assert.ok(bank.fromBank>0);assert.equal(bank.fromDocument,0);assert.ok(bank.questions.every(q=>!q.sourceExcerpt&&q.sourceKind==='bank'));
 assert.equal(generateSyllabusQuestions(text,['Математика'],20,{includeBank:true}).questions.length,0);
 assert.throws(()=>generateSyllabusQuestions(text,['Семиотика культуры'],20,{includeBank:'yes'}));
});
test('ambiguous aliases, administrative lines and insufficient choices are withheld',()=>{
 const text=`Тема 1. Программирование
Список — упорядоченная совокупность элементов одного типа данных.
Массив — упорядоченная совокупность элементов одного типа данных.
Стек — структура данных с доступом к последнему добавленному элементу.
Очередь — структура данных с доступом к первому добавленному элементу.
Функция — именованный фрагмент программы для выполнения отдельной операции.
Литература
Иванов — Основы программирования для начинающих студентов.`;
 const r=generateSyllabusQuestions(text,['Программирование'],20);assert.ok(r.questions.length>0);assert.ok(r.questions.every(q=>!q.text.includes('Иванов')&&!q.options.includes('Иванов')));assert.ok(r.questions.every(q=>!q.text.includes('Какой термин')||!q.text.includes('упорядоченная совокупность')));
 const sparse='Тема 1. Программирование\nСтек — структура данных с доступом к последнему добавленному элементу.';assert.equal(generateSyllabusQuestions(sparse,['Программирование'],20).questions.length,0);
});
test('wrapped lines, duplicate facts, section boundaries and maximum-size input remain bounded',()=>{
 const text=`Тема 1. Основы информатики\nАлгоритм — конечная последовательность\nкоманд для решения поставленной задачи.\n${computing.split('\n').slice(2).join('\n')}\nТема 2. Культурология\nРитуал — установленная последовательность символически значимых действий.`;
 const r=generateSyllabusQuestions(text,['Основы информатики'],60);assert.equal(r.questions.length,6);assert.ok(r.questions.every(q=>q.topic==='Основы информатики'));assert.ok(r.questions.some(q=>q.sourceExcerpt.includes('последовательность команд')));
 const large=(computing+'\n').repeat(200).slice(0,120000);const start=performance.now();const result=generateSyllabusQuestions(large,['Основы информатики'],60);assert.ok(result.questions.length<=60);assert.ok(performance.now()-start<2000);assert.equal(new Set(result.questions.map(q=>q.text)).size,result.questions.length);
});

test('v3 imports ready tests with explicit inline answers, separate keys and author order',()=>{
 const text=`Тема 1. География
1. Какая столица Казахстана?
A) Алматы
B) Астана
C) Шымкент
D) Тараз
2) Қазақстанның астанасы қай қала?
А) Алматы  В) Астана  С) Ақтау  D) Семей
Дұрыс жауап: В
Ответы:
1 — B; 2 — В`;
 const a=analyzeSyllabus(text),r=generateSyllabusQuestions(text,a.topics,20);
 assert.equal(a.authored,2);assert.equal(r.questions.length,2);assert.equal(r.questions[0].text,'Какая столица Казахстана?');
 for(const q of r.questions){assert.equal(q.options[q.correct],'Астана');assert.equal(q.options[0],'Алматы');assert.equal(q.type,'authored');}
 const marked=generateSyllabusQuestions('Вопрос: Какой вариант отмечен автором?\nА) Первый\n+ Б) Второй\nВ) Третий\nГ) Четвёртый',['Вопросы из документа'],20);
 assert.equal(marked.questions[0].correct,1);
});
test('v3 preserves Q/A, wrapped answers and tables as incomplete editable drafts',()=>{
 const text=`Вопрос 1: Что такое алгоритм?
Ответ: Конечная последовательность команд
для решения задачи.

Вопрос 2: Что такое массив?
Ответ: Совокупность элементов одного типа.

Вопрос\tОтвет
Что такое стек?\tСтруктура данных с правилом LIFO.`;
 const a=analyzeSyllabus(text),r=generateSyllabusQuestions(text,a.topics,20);
 assert.equal(a.authored,3);assert.equal(r.drafts.length,3);assert.equal(r.questions.length,0);
 assert.equal(r.drafts[0].options[0],'Конечная последовательность команд для решения задачи.');
 assert.ok(r.drafts.every(q=>q.correct===0&&q.options.length===4&&q.problems.includes('missing_options')));
 const sparse='Тема 1. История\nКультура — совокупность духовных ценностей человека.\nРитуал — установленный порядок символических действий.\nВ 1991 году Казахстан обрёл независимость.';
 const s=generateSyllabusQuestions(sparse,['История'],20);assert.equal(s.drafts.length,3);assert.equal(s.questions.length,0);assert.ok(s.drafts.some(q=>q.type==='year'&&q.options[0]==='1991'));assert.equal(s.diagnostics.sparseDrafts,3);
});
test('v3 keeps unknown, conflicting and multiple answer keys unresolved',()=>{
 for(const answer of ['', '\nОтвет: A\nПравильный ответ: B','\nОтвет: A, C','\nОтвет: неизвестный вариант']){
  const text='1. Выберите вариант из текста?\nA) Первый\nB) Второй\nC) Третий\nD) Четвёртый'+answer;
  const r=generateSyllabusQuestions(text,['Вопросы из документа'],20);assert.equal(r.questions.length,0);assert.equal(r.drafts.length,1);assert.equal(r.drafts[0].correct,null);
 }
 const extra='1. Выберите вариант из текста?\nA) Первый\nB) Второй\nC) Третий\nD) Четвёртый\nE) Пятый\nОтвет: E';
 const r=generateSyllabusQuestions(extra,['Вопросы из документа'],20);assert.equal(r.drafts[0].options.length,5);assert.equal(r.drafts[0].correct,4);assert.equal(r.questions.length,0);
});
test('v3 rejects colon false definitions, supports definition verbs and emits one question per source',()=>{
 const text=`Тема 1. Культурология
К основным функциям культуры относятся: познавательная, регулятивная и коммуникативная.
Под культурой понимают совокупность материальных и духовных ценностей.
Термин «ритуал» означает установленный порядок символических действий.
Культурология — это наука, которая используется для изучения общества и возникла в 1909 году.`;
 const definitions=definitionsFrom(text);assert.equal(definitions.length,3);assert.ok(!definitions.some(f=>f.term.startsWith('К основным')));
 const r=generateSyllabusQuestions(text,['Культурология'],20);assert.equal(r.drafts.length,4);assert.equal(new Set(r.drafts.map(q=>q.sourceId)).size,4);assert.ok(r.diagnostics.suppressedSameSource>=1);assert.equal(r.drafts.filter(q=>q.type==='list').length,1);
});
test('v3 does not reverse long definitions or silently truncate their meaning; drafts validate after editing',async()=>{
 const {assessDraft}=await import('../syllabus-draft.js');
 const long='Совокупность различных материальных и духовных ценностей, '+ 'которые передаются между поколениями и изменяются в обществе, '.repeat(5)+'сохраняя историческую связь.';
 const r=generateSyllabusQuestions('Тема 1. Культура\nКультура — '+long,['Культура'],20);
 assert.equal(r.drafts.length,1);const q=r.drafts[0];assert.match(q.text,/Какое определение/);assert.ok(q.text.length<240);assert.equal(q.options[0],long.replace(/\.$/,''));assert.ok(q.problems.includes('long_text_review'));
 q.options=['Совокупность материальных и духовных ценностей','Только природная среда','Только генетические признаки','Только климатические условия'];q.reviewed=true;assert.equal(assessDraft(q).ready,true);
 q.correct=null;assert.equal(assessDraft(q).ready,false);
});
test('v3 mixed documents preserve facts outside authored tests and report unsupported passages',()=>{
 const text=`Тема 1. Информатика
1. Какой вариант указан автором?
A) Алгоритм
B) Массив
C) Стек
D) Очередь
Ответ: A

Алгоритм — конечная последовательность команд для решения задачи.
Массив — упорядоченная совокупность элементов одного типа.
Сложный учебный абзац свободной формы без явного определения.`;
 const r=generateSyllabusQuestions(text,['Информатика'],20);assert.equal(r.documentType,'mixed');assert.equal(r.drafts.length,3);assert.equal(r.drafts.filter(q=>q.type==='authored').length,1);assert.ok(r.diagnostics.unrecognizedUnits>0);assert.ok(r.diagnostics.samples.length>0);
});

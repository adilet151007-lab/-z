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

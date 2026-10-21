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

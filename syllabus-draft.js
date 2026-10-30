// Shared by the server and editor. "ready" means structurally importable,
// not independently verified educational truth.
export const MOBILE_QUESTION_LIMIT=240, MOBILE_OPTION_LIMIT=180;
export function assessDraft(q){
 const problems=[],warnings=[],options=Array.isArray(q.options)?q.options:[];
 const text=String(q.text||'').trim(),values=options.map(v=>String(v).trim());
 if(text.length<3||text.length>2000)problems.push('question_length');
 if(values.length!==4)problems.push('option_count');
 if(values.some(v=>!v))problems.push('missing_options');
 if(values.some(v=>v.length>500))problems.push('option_length');
 const keys=values.filter(Boolean).map(v=>v.normalize('NFC').toLowerCase().replace(/ё/g,'е').replace(/[\p{P}\p{S}\s]+/gu,''));
 if(new Set(keys).size!==keys.length)problems.push('duplicate_options');
 if(!Number.isInteger(q.correct)||q.correct<0||q.correct>=values.length||!values[q.correct])problems.push('missing_correct');
 if(q.requiresReview&&!q.reviewed)problems.push('source_review');
 if(text.length>MOBILE_QUESTION_LIMIT||values.some(v=>v.length>MOBILE_OPTION_LIMIT)||text.length+values.join('').length>850){
  warnings.push('long_text');if(!q.reviewed)problems.push('long_text_review');
 }
 return {ready:problems.length===0,problems,warnings};
}
export const DRAFT_MESSAGES={
 question_length:'Вопрос должен содержать от 3 до 2000 символов.',option_count:'Для игры оставьте ровно 4 варианта.',
 missing_options:'Допишите недостающие варианты ответа.',option_length:'Сократите каждый вариант до 500 символов.',
 duplicate_options:'Варианты ответа должны различаться.',missing_correct:'Укажите один правильный вариант.',
 source_review:'Проверьте спорный ответ по документу и подтвердите проверку.',
 long_text_review:'Текст длинный для телефона: сократите его или подтвердите проверку.',
 long_text:'Длинный текст: проверьте, успеют ли студенты прочитать его за раунд.',
 missing_key:'В документе не указан однозначный правильный ответ.',conflicting_keys:'В документе противоречивые отметки правильного ответа.',
 multiple_correct:'В исходнике несколько правильных ответов; преобразуйте вопрос для одного ответа.',
 unsupported_key:'Ключ ответа не совпадает с вариантами.',extra_options:'Исходный тест содержит больше четырёх вариантов.',
 sparse_options:'В документе недостаточно подходящих отвлекающих вариантов.',
 partial_years:'В предложении несколько дат: проверьте связь даты с событием.'
};

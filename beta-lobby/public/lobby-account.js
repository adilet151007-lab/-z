const messages = {
  ru:{signIn:'Войти',title:'Ваш профиль',guest:'Участие без аккаунта доступно всегда.',loading:'Проверяем вход…',unavailable:'Вход через Google ещё не открыт. Можно продолжить без аккаунта.',google:'Войти через Google',logout:'Выйти из аккаунта',privacy:'Как используются данные аккаунта',cancelled:'Вход отменён. Можно попробовать снова.',failed:'Не удалось завершить вход. Попробуйте ещё раз.',expired:'Время входа истекло. Начните снова.',connected:'Аккаунт подключён.',notConfigured:'Вход через Google ещё не открыт.',close:'Закрыть',access:'Аккаунт сохраняет вашу личность. Доступ преподавателя выдаётся отдельно.'},
  kk:{signIn:'Кіру',title:'Сіздің профиліңіз',guest:'Аккаунтсыз қатысу әрқашан қолжетімді.',loading:'Кіру тексерілуде…',unavailable:'Google арқылы кіру әзірге ашылмаған. Аккаунтсыз жалғастыруға болады.',google:'Google арқылы кіру',logout:'Аккаунттан шығу',privacy:'Аккаунт деректері қалай қолданылады',cancelled:'Кіру тоқтатылды. Қайта көруге болады.',failed:'Кіру аяқталмады. Қайта көріңіз.',expired:'Кіру уақыты аяқталды. Қайта бастаңыз.',connected:'Аккаунт қосылды.',notConfigured:'Google арқылы кіру әзірге ашылмаған.',close:'Жабу',access:'Аккаунт жеке басыңызды сақтайды. Оқытушы рұқсаты бөлек беріледі.'}
};
Object.assign(messages.ru,{G01:'Google отклонил настройки входа приложения. Сообщите преподавателю код G01.',G02:'Попытка входа устарела. Нажмите «Войти через Google» ещё раз. Код G02.',G03:'Не удалось подтвердить аккаунт Google. Сообщите преподавателю код G03.',G04:'Не удалось связаться с Google для завершения входа. Попробуйте ещё раз. Код G04.'});
Object.assign(messages.kk,{G01:'Google қолданбаның кіру баптауларын қабылдамады. Оқытушыға G01 кодын хабарлаңыз.',G02:'Кіру әрекетінің мерзімі аяқталды. «Google арқылы кіру» батырмасын қайта басыңыз. G02 коды.',G03:'Google аккаунтын растау мүмкін болмады. Оқытушыға G03 кодын хабарлаңыз.',G04:'Кіруді аяқтау үшін Google қызметіне қосылу мүмкін болмады. Қайта көріңіз. G04 коды.'});

export function setupAccount({language}) {
  const $ = id => document.getElementById(id), dialog = $('account-dialog');
  let user = null, configured = false, loading = true, status = '', lastFocus;
  const query = new URLSearchParams(location.search), result = query.get('account');
  if (['connected','cancelled','failed','expired','not-configured'].includes(result)) {
    status = result === 'not-configured' ? 'notConfigured' : result;
    const code=query.get('errorCode');if(result==='failed'&&['G01','G02','G03','G04'].includes(code))status=code;
    query.delete('account');query.delete('errorCode');history.replaceState(null,'',location.pathname+(query.size?'?'+query:'')+location.hash);
  }
  function render() {
    const copy = messages[language()] || messages.ru;
    $('account-button').textContent = user ? user.name : copy.signIn;
    $('account-title').textContent = copy.title;
    $('account-name').textContent = user?.name || copy.guest;
    $('account-email').textContent = user?.email || '';
    $('account-note').textContent = copy.access;
    $('account-status').textContent = loading ? copy.loading : status ? copy[status] : !configured ? copy.unavailable : '';
    $('google-sign-in').hidden = loading || !configured || !!user;
    $('google-sign-in').textContent = copy.google;
    $('account-logout').hidden = loading || !user;
    $('account-logout').textContent = copy.logout;
    $('account-privacy').textContent = copy.privacy;
    $('account-close').textContent = copy.close;
  }
  async function refresh() {
    if(document.documentElement.dataset.accountApi!=='enabled'){loading=false;render();return;}
    try {
      const response = await fetch('/api/account',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000)});
      if (!response.ok) throw new Error();
      const data = await response.json();
      configured = data.googleEnabled === true;
      user = data.user && typeof data.user.name==='string' && typeof data.user.email==='string' ? data.user : null;
    } catch {configured=false;}
    loading=false;render();
  }
  function close() {dialog.close();document.body.classList.remove('help-open');lastFocus?.focus();}
  $('account-button').addEventListener('click',()=>{lastFocus=document.activeElement;dialog.showModal();document.body.classList.add('help-open');render();});
  $('account-close').addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)close();}});
  $('account-logout').addEventListener('click',async()=>{
    $('account-logout').disabled=true;
    try {
      const response=await fetch('/auth/logout',{method:'POST',credentials:'same-origin',headers:{'X-CQ-Lobby':'1'},signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error();
      user=null;status='';
    }catch{status='failed';}
    $('account-logout').disabled=false;render();
  });
  render();refresh();
  if(status&&status!=='connected'){lastFocus=$('account-button');dialog.showModal();document.body.classList.add('help-open');}
  return {render};
}

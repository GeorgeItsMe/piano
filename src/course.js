/* Курс — лестница уроков поверх ядра.
   Ядро умеет показывать задание и проверять ответ; курс решает, какую ноту и
   каким способом спросить, считает жизни, звёзды и опыт. */

const COURSE = "__COURSE__";

/* ─── Состояние ───────────────────────────────────────────────────────────── */
S.course = Object.assign(
  { xp:0, stars:{}, day:null, days:0, today:0, screen:'course' },
  S.course || {}
);
const GOAL = 40;                       // опыта в день

const LS = {                           // текущий урок
  on:false, unit:0, idx:0, lesson:null, title:'',
  queue:[], pos:0, hearts:3, mistakes:0, review:false, accBack:null
};

const courseEl = $('#courseScreen'), pathEl = $('#path'),
      modesEl  = $('#modes'), barEl = $('#lessonBar'),
      resultEl = $('#result');

const lid = (u, i) => `${u}.${i}`;
const starsOf = id => S.course.stars[id] | 0;
const isDone  = (u, i) => starsOf(lid(u, i)) > 0;

/* Урок открыт, если пройден предыдущий. Первый открыт всегда. */
function isOpen(u, i){
  if (u === 0 && i === 0) return true;
  if (i > 0) return isDone(u, i - 1);
  const prev = COURSE[u - 1];
  return prev ? isDone(u - 1, prev.lessons.length - 1) : false;
}
function nextOpen(){
  for (let u = 0; u < COURSE.length; u++)
    for (let i = 0; i < COURSE[u].lessons.length; i++)
      if (!isDone(u, i)) return { u, i };
  return null;
}

/* ─── Дни подряд ─────────────────────────────────────────────────────────── */
const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
function touchDay(){
  const now = new Date(), t = dayKey(now);
  if (S.course.day === t) return;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  S.course.days = S.course.day === dayKey(y) ? S.course.days + 1 : 1;
  S.course.day = t;
  S.course.today = 0;
}

/* ─── Экраны ─────────────────────────────────────────────────────────────── */
function setScreen(name){
  S.course.screen = name; save();
  document.querySelectorAll('.screen-tab').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.screen === name)));
  const course = name === 'course';
  courseEl.hidden = !course;
  stageEl.hidden = course;
  modesEl.hidden = course || LS.on;
  barEl.hidden = course || !LS.on;
  if (course){ renderTop(); renderPath(); }
  else if (!LS.on){ relink(); }
}

/* ─── Верхняя строка курса ───────────────────────────────────────────────── */
function renderTop(){
  const c = S.course;
  const now = dayKey(new Date());
  const todayXp = c.day === now ? c.today : 0;
  $('#cXp').textContent = c.xp;
  $('#cDays').textContent = c.day === now || c.days ? c.days : 0;
  $('#cGoal').textContent = todayXp;
  $('#cGoalMax').textContent = GOAL;
  const len = 2 * Math.PI * 16;
  $('#cRing').style.strokeDasharray = len;
  $('#cRing').style.strokeDashoffset = len * (1 - Math.min(1, todayXp / GOAL));
}

/* ─── Лестница ───────────────────────────────────────────────────────────── */
const LOCK = `<svg class="node__lock" viewBox="0 0 12 12" aria-hidden="true">
<path d="M3.2 5.2V3.7a2.8 2.8 0 0 1 5.6 0v1.5" fill="none" stroke="currentColor" stroke-width="1.3"/>
<rect x="2.1" y="5" width="7.8" height="5.8" rx="1.4" fill="currentColor"/></svg>`;

function renderPath(){
  const now = nextOpen();
  pathEl.innerHTML = COURSE.map((unit, u) => {
    const open = unit.lessons.some((_, i) => isOpen(u, i)) || unit.lessons.some((_, i) => isDone(u, i));
    const nodes = unit.lessons.map((les, i) => {
      const id = lid(u, i), st = starsOf(id), done = st > 0, can = isOpen(u, i);
      const here = now && now.u === u && now.i === i;
      const cls = ['node', done && 'is-done', here && 'is-now'].filter(Boolean).join(' ');
      const stars = [1,2,3].map(n => `<i class="${n <= st ? 'on' : ''}"></i>`).join('');
      return `<button class="${cls}" data-u="${u}" data-i="${i}" ${can ? '' : 'disabled'}
        title="${les.title} — ${les.goal}" aria-label="Урок ${i + 1}: ${les.title}">
        <span class="node__n">${can || done ? i + 1 : LOCK}</span>
        <span class="node__stars">${stars}</span></button>`;
    }).join('');
    return `<section class="unit${open ? '' : ' is-locked'}">
      <div>
        <span class="unit__eyebrow">Юнит ${u + 1}</span>
        <h2 class="unit__title">${unit.title}</h2>
        <p class="unit__sub">${unit.subtitle}</p>
      </div>
      <div class="unit__nodes">${nodes}</div>
    </section>`;
  }).join('');
}

pathEl.addEventListener('click', ev => {
  const b = ev.target.closest('.node');
  if (b && !b.disabled) startLesson(+b.dataset.u, +b.dataset.i);
});

/* ─── Сборка заданий ─────────────────────────────────────────────────────── */
const shuffle = a => { for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* Ноты, которые ученик уже проходил — из них берём вкрапления на повторение */
function learned(){
  const set = new Set();
  COURSE.forEach((u, ui) => u.lessons.forEach((l, li) => {
    if (isDone(ui, li)) l.midi.forEach(m => set.add(m));
  }));
  return [...set];
}
function weakest(from, n){
  return from
    .map(m => { const v = S.stats[m] || { r:0, w:0 }; const t = v.r + v.w; return { m, acc: t ? v.r / t : 1, t }; })
    .filter(x => x.t >= 2 && x.acc < 0.9)
    .sort((a, b) => a.acc - b.acc)
    .slice(0, n)
    .map(x => x.m);
}

function buildQueue(les){
  const types = les.types && les.types.length ? les.types.slice() : ['noteToKey'];
  const q = [];
  let bag = shuffle(les.midi.slice());
  for (let i = 0; i < les.count; i++){
    if (!bag.length) bag = shuffle(les.midi.slice());
    q.push({ midi: bag.shift(), type: types[i % types.length] });
  }
  // повторение: пара заданий на самые хромающие ноты из уже пройденного
  const old = learned().filter(m => !les.midi.includes(m));
  weakest(old, 2).forEach(m => q.splice(Math.floor(q.length / 2) + q.length % 2, 0, { midi:m, type: types[0], again:true }));
  // не даём одной и той же ноте идти подряд
  for (let i = 1; i < q.length; i++)
    if (q[i].midi === q[i - 1].midi && i + 1 < q.length) [q[i], q[i + 1]] = [q[i + 1], q[i]];
  return q;
}

/* Клавиатуру сужаем до октав вокруг нот урока */
function spanFor(midis){
  let lo = Math.floor(Math.min(...midis) / 12) * 12;
  let hi = Math.ceil((Math.max(...midis) + 1) / 12) * 12;
  while (hi - lo < 24){ if (lo > 24) lo -= 12; else hi += 12; }
  return { lo: Math.max(21, lo), hi: Math.min(108, hi) };
}

/* ─── Ход урока ──────────────────────────────────────────────────────────── */
function startLesson(u, i, review){
  const les = review || COURSE[u].lessons[i];
  LS.on = true; LS.unit = u; LS.idx = i; LS.lesson = les; LS.review = !!review;
  LS.queue = review ? review.queue : buildQueue(les);
  LS.pos = 0; LS.hearts = 3; LS.mistakes = 0;
  LS.title = review ? les.title : `${COURSE[u].title} · ${les.title}`;

  LS.accBack = null;
  if (les.acc && les.acc !== S.accidental){ LS.accBack = S.accidental; S.accidental = les.acc; }

  RANGE_FIX = spanFor(LS.queue.map(t => t.midi));
  renderStaff(); buildKeyboard(true);

  resultEl.hidden = true;
  setScreen('practice');
  modesEl.hidden = true; barEl.hidden = false;
  // диапазоном во время урока распоряжается сам урок
  document.querySelector('.board__bar').hidden = true;
  // урок — часть курса, поэтому подсвечен «Курс»: по нему и выходят обратно
  document.querySelectorAll('.screen-tab').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.screen === 'course')));
  $('#lessonTitle').textContent = LS.title;
  renderHearts(); updateBar();

  T.streak = 0; T.right = 0; T.total = 0;
  nextRound();
}

function quitLesson(toCourse = true){
  LS.on = false;
  if (LS.accBack){ S.accidental = LS.accBack; LS.accBack = null; }
  RANGE_FIX = null;
  resultEl.hidden = true;
  barEl.hidden = true;
  document.querySelector('.board__bar').hidden = false;
  renderStaff(); buildKeyboard(true);
  save();
  if (toCourse) setScreen('course');
  else { modesEl.hidden = false; setMode('free'); }
}
$('#lessonQuit').addEventListener('click', () => quitLesson(true));

function renderHearts(){
  $('#hearts').innerHTML = [0,1,2].map(n => `<svg viewBox="0 0 20 18" aria-hidden="true">
<path class="${n < LS.hearts ? 'heart' : 'heart heart--out'}"
 d="M10 16.6C10 16.6 1.6 11 1.6 5.8 1.6 3.2 3.6 1.2 6.1 1.2 7.9 1.2 9.4 2.3 10 3.5c.6-1.2 2.1-2.3 3.9-2.3 2.5 0 4.5 2 4.5 4.6 0 5.2-8.4 10.8-8.4 10.8z"/></svg>`).join('');
  $('#hearts').setAttribute('aria-label', `Жизней: ${LS.hearts}`);
}
function updateBar(){
  const total = LS.queue.length;
  $('#lessonProgress').style.width = Math.round(LS.pos / total * 100) + '%';
  $('#lessonTitle').textContent = `${LS.title} — задание ${Math.min(LS.pos + 1, total)} из ${total}`;
}

/* Ядро спрашивает: какую ноту показать и каким способом */
HOOK.pick = () => LS.on ? LS.queue[LS.pos].midi : null;

HOOK.beforeRound = () => {
  T.needAlter = LS.on ? LS.queue.some(t => isBlack(t.midi)) : S.blacks === 'all';
  if (!LS.on) return true;
  if (LS.pos >= LS.queue.length){ finishLesson(); return false; }
  T.mode = LS.queue[LS.pos].type;
  staffEl.classList.toggle('is-clickable', T.mode === 'keyToNote');
  updateBar();
  return true;
};

HOOK.onAnswer = ok => {
  if (!LS.on) return;
  const item = LS.queue[LS.pos];
  if (ok){
    LS.pos++;
    updateBar();
    return;
  }
  LS.mistakes++;
  if (item && !item.retried){                 // промахнулся — вернём эту ноту в конец
    item.retried = true;
    LS.queue.push({ midi:item.midi, type:item.type, again:true });
    updateBar();
  }
  LS.hearts--;
  renderHearts();
  if (LS.hearts <= 0){ T.lock = true; setTimeout(failLesson, 700); }
};

/* ─── Итог ───────────────────────────────────────────────────────────────── */
function finishLesson(){
  const st = LS.mistakes === 0 ? 3 : LS.mistakes <= 2 ? 2 : 1;
  let xp = 10 + (st === 3 ? 5 : 0);
  if (LS.review) xp = 8;

  touchDay();
  S.course.xp += xp;
  S.course.today += xp;
  if (!LS.review){
    const id = lid(LS.unit, LS.idx);
    S.course.stars[id] = Math.max(starsOf(id), st);
  }
  save();

  showResult({
    stars: st,
    title: st === 3 ? 'Без единой ошибки' : st === 2 ? 'Урок пройден' : 'Зачтено',
    text: st === 3 ? 'Эти ноты можно считать выученными.'
        : st === 2 ? 'Почти чисто. Ещё заход — и будет три звезды.'
        : 'Пройдено, но шатко. Стоит повторить.',
    rows: [
      ['Заданий', LS.queue.length],
      ['Ошибок', LS.mistakes],
      ['Опыт', '+' + xp],
    ],
    done: true
  });
}

function failLesson(){
  showResult({
    stars: 0,
    title: 'Жизни кончились',
    text: 'Это не провал, а замер. Пройди урок ещё раз — станет легче.',
    rows: [
      ['Пройдено', `${LS.pos} из ${LS.queue.length}`],
      ['Ошибок', LS.mistakes],
    ],
    done: false
  });
}

function showResult({ stars, title, text, rows, done }){
  $('#resStars').innerHTML = [1,2,3].map(n => `<i class="${n <= stars ? 'on' : ''}"></i>`).join('');
  $('#resTitle').textContent = title;
  $('#resText').textContent = text;
  $('#resRows').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('#resNext').textContent = done ? 'Дальше' : 'К списку уроков';
  resultEl.hidden = false;
  (done ? $('#resNext') : $('#resAgain')).focus();
}

$('#resAgain').addEventListener('click', () => {
  const { unit, idx, review, lesson } = LS;
  resultEl.hidden = true;
  if (review) startReview();
  else startLesson(unit, idx);
});
$('#resNext').addEventListener('click', () => quitLesson(true));

/* ─── Разминка на трудных нотах ──────────────────────────────────────────── */
function startReview(){
  const pool = learned();
  if (!pool.length){
    cue('<b>Сначала пройди хотя бы один урок.</b> Тогда будет что повторять.');
    return;
  }
  const weak = weakest(pool, 8);
  const notes = (weak.length >= 4 ? weak : shuffle(pool.slice()).slice(0, 8));
  const queue = shuffle(notes.slice()).map((m, i) => ({ midi:m, type: i % 2 ? 'nameNote' : 'noteToKey' }));
  while (queue.length < 10) queue.push({ midi: notes[queue.length % notes.length], type:'noteToKey' });
  startLesson(0, 0, { title:'Разминка', goal:'повторение трудных нот', midi:notes, types:['noteToKey'], count:queue.length, queue });
}
$('#cReview').addEventListener('click', startReview);

/* ─── Запуск ─────────────────────────────────────────────────────────────── */
document.querySelector('#screens').addEventListener('click', ev => {
  const b = ev.target.closest('.screen-tab');
  if (!b) return;
  if (LS.on) quitLesson(false);
  setScreen(b.dataset.screen);
});

function boot(){
  bootCore();
  const now = new Date();
  if (S.course.day && S.course.day !== dayKey(now)){
    const y = new Date(now); y.setDate(y.getDate() - 1);
    if (S.course.day !== dayKey(y)) S.course.days = 0;   // серия прервалась
    S.course.today = 0;
  }
  setScreen(S.course.screen === 'practice' ? 'practice' : 'course');
}

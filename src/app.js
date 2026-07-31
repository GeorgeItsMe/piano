/* Нота ↔ Клавиша — ядро: теория, отрисовка стана, клавиатура, свободная практика.
   Глифы ключей и знаков альтерации вшиты сборщиком как SVG-пути.
   Сборщик оборачивает этот файл и course.js в одну область видимости. */

const GLYPHS = "__GLYPHS__";

/* ─── Теория ──────────────────────────────────────────────────────────── */
const LET      = ['C','D','E','F','G','A','B'];
const LET_RU   = ['До','Ре','Ми','Фа','Соль','Ля','Си'];
const LET_SEMI = [0,2,4,5,7,9,11];
const OCT_GEN  = ['субконтроктавы','контроктавы','большой октавы','малой октавы',
                  'первой октавы','второй октавы','третьей октавы','четвёртой октавы','пятой октавы'];
const OCT_SHORT= ['суб','К','Б','м','1','2','3','4','5'];

const isBlack = m => [1,3,6,8,10].includes(((m % 12) + 12) % 12);

function spell(midi, pref){
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  let li = LET_SEMI.indexOf(pc), alter = 0;
  if (li < 0){
    if (pref === 'flat'){ li = LET_SEMI.indexOf(pc + 1); alter = -1; }
    else { li = LET_SEMI.indexOf(pc - 1); alter = 1; }
  }
  return { midi, li, alter, oct, dia: oct * 7 + li };
}
function midiFromDia(dia, alter){
  const oct = Math.floor(dia / 7), li = dia - oct * 7;
  return 12 * (oct + 1) + LET_SEMI[li] + alter;
}
const accSign = a => a === 1 ? '♯' : a === -1 ? '♭' : '';
function noteName(sp){
  const base = S.naming === 'ru' ? LET_RU[sp.li] : LET[sp.li];
  return base + accSign(sp.alter);
}
const fullName = sp => `${noteName(sp)} ${OCT_GEN[sp.oct] || ''}`.trim();
const sciName  = sp => LET[sp.li] + accSign(sp.alter) + sp.oct;
const freqOf   = m => 440 * Math.pow(2, (m - 69) / 12);

/* ─── Состояние ───────────────────────────────────────────────────────── */
const STORE = 'nk-piano-v1';
const S = {
  naming:'ru', accidental:'sharp', labels:'c', range:'4', staffMode:'ladder',
  scope:'both', blacks:'white', hints:true, sound:true, volume:70, theme:'auto',
  best:0, stats:{}
};
Object.assign(S, (() => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch(e){ return {}; } })());
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch(e){} };

const T = {                       // состояние сессии
  mode:'free', target:null, wrong:0, streak:0, right:0, total:0,
  held:new Set(), shown:new Set(), placeAlter:0, lock:false, last:null, kbOct:3,
  needAlter:false
};

const RANGES = { '2':{lo:48,hi:72}, '4':{lo:36,hi:84}, '88':{lo:21,hi:108} };
/* Урок курса на время сужает клавиатуру до нужного участка — так новичок не
   ищет ноту среди восьмидесяти восьми клавиш. */
let RANGE_FIX = null;
const range = () => RANGE_FIX || RANGES[S.range] || RANGES['4'];

/* Точки подключения для курса: он подменяет выбор ноты и слушает ответы. */
const HOOK = { pick:null, beforeRound:null, onAnswer:null };

function pool(){
  const { lo, hi } = range();
  // Клавиатуру можно раскрыть на все 88, но спрашивать ноту с девятью
  // добавочными линейками бессмысленно — тренировка держится в разумном окне
  let a = Math.max(lo, 36), b = Math.min(hi, 84);
  if (S.scope === 'treble') a = Math.max(a, 60);
  if (S.scope === 'bass')   b = Math.min(b, 59);
  const out = [];
  for (let m = a; m <= b; m++){
    if (S.blacks === 'white' && isBlack(m)) continue;
    out.push(m);
  }
  return out.length ? out : [60];
}

/* ─── Ссылки на DOM ───────────────────────────────────────────────────── */
const $  = s => document.querySelector(s);
const staffEl = $('#staff'), keysEl = $('#keys'), linkEl = $('#link'),
      stageEl = $('#stage'), boardEl = $('#board'), scrollEl = $('#boardScroll'),
      cueEl = $('#cue'), answerEl = $('#answer'), weakEl = $('#weak');
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const keyEls = new Map();

/* ─── Геометрия стана ─────────────────────────────────────────────────── */
const GAP = 16, VW = 780, HALF = GAP / 2;
const SEP = 4.5 * GAP;                       // просвет между станами в режиме «как в нотах»
/* Доли выверены по самим контурам глифов: у басового ключа линия фа проходит
   ровно между двумя точками, у бемоля опора — центр чаши. */
const CLEFS = {
  treble: { g:'treble', spaces:7.02, anchor:0.625,  dia:32 },   // спираль обвивает соль
  bass:   { g:'bass',   spaces:2.96, anchor:0.4398, dia:24 }    // точки обнимают фа
};
const ACCS = {
  '1':  { g:'sharp',   spaces:2.55, anchor:0.500 },
  '-1': { g:'flat',    spaces:2.70, anchor:0.773 },
  '0':  { g:'natural', spaces:2.65, anchor:0.500 }
};
let L = {};                                   // вычисленная раскладка

const r = (n, p = 2) => +n.toFixed(p);

/* Ступени, под которые сейчас размечен стан. При 88 клавишах размечать стан
   под весь диапазон нельзя — до пятой октавы это девять добавочных линеек, и
   стан становится нечитаемым. Поэтому по умолчанию берём удобные четыре октавы
   и раздвигаем стан только когда нота действительно выходит за края. */
let SPAN = null;
function spanOf(lo, hi){
  let dMin = Infinity, dMax = -Infinity;
  for (let m = lo; m <= hi; m++)
    for (const pref of ['sharp','flat']){
      const d = spell(m, pref).dia;
      if (d < dMin) dMin = d;
      if (d > dMax) dMax = d;
    }
  return { dMin, dMax };
}
function baseSpan(){
  const { lo, hi } = range();
  return spanOf(Math.max(lo, 36), Math.min(hi, 84));
}
function ensureRoom(dias){
  let grew = false;
  for (const d of dias){
    if (d < SPAN.dMin){ SPAN.dMin = d; grew = true; }
    if (d > SPAN.dMax){ SPAN.dMax = d; grew = true; }
  }
  if (grew) renderStaff(true);
  return grew;
}

function computeLayout(){
  const { dMin, dMax } = SPAN;
  const above = Math.max(0, dMax - 38) * HALF + GAP * 1.5;
  const below = Math.max(0, 18 - dMin) * HALF + GAP * 1.5;
  const ladder = S.staffMode === 'ladder';

  const top38 = above;
  const bass26 = ladder ? top38 + 6 * GAP : top38 + 4 * GAP + SEP;
  const height = bass26 + 4 * GAP + below;

  const braceH = bass26 + 4 * GAP - top38;
  const braceW = GLYPHS.brace.w / GLYPHS.brace.h * braceH;
  const x0 = 10 + braceW + 10;

  L = { ladder, top38, bass26, height, dMin, dMax, braceH, braceW,
        x0, clefX: x0 + 14, noteX: Math.round(VW * 0.56), x1: VW - 26 };
}

const yTreble = d => L.top38 + (38 - d) * HALF;
const yBass   = d => L.bass26 + (26 - d) * HALF;
const staffOf = midi => midi >= 60 ? 'treble' : 'bass';
const yOf = (d, staff) => L.ladder ? yTreble(d) : (staff === 'treble' ? yTreble(d) : yBass(d));

function ledgersFor(d, staff){
  const out = [];
  if (L.ladder){
    for (let l = 40; l <= d; l += 2) out.push(l);
    for (let l = 16; l >= d; l -= 2) out.push(l);
    if (d === 28) out.push(28);
  } else if (staff === 'treble'){
    for (let l = 40; l <= d; l += 2) out.push(l);
    for (let l = 28; l >= d; l -= 2) out.push(l);
  } else {
    for (let l = 28; l <= d; l += 2) out.push(l);
    for (let l = 16; l >= d; l -= 2) out.push(l);
  }
  return out;
}

function glyphPath(name, cls, xLeft, yAnchor, spaces, anchorFrac){
  const g = GLYPHS[name];
  const h = spaces * GAP, sc = h / g.h;
  const tx = xLeft - g.x * sc, ty = (yAnchor - anchorFrac * h) - g.y * sc;
  return `<path class="${cls}" fill-rule="${g.rule}" transform="translate(${r(tx)} ${r(ty)}) scale(${r(sc,5)})" d="${g.d}"/>`;
}
const glyphWidth = (name, spaces) => GLYPHS[name].w * (spaces * GAP / GLYPHS[name].h);

function renderStaff(keepSpan){
  if (!keepSpan || !SPAN) SPAN = baseSpan();
  computeLayout();
  staffEl.setAttribute('viewBox', `0 0 ${VW} ${r(L.height)}`);
  staffEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  staffEl.style.maxHeight = '400px';

  let s = '';
  // фигурная скобка
  s += glyphPath('brace', 'brace', 10, L.top38, L.braceH / GAP, 0);
  // линейки
  for (const d of [30,32,34,36,38]) s += line(L.x0, yTreble(d), L.x1);
  for (const d of [18,20,22,24,26]) s += line(L.x0, L.ladder ? yTreble(d) : yBass(d), L.x1);
  // в режиме лестницы отмечаем до первой октавы — заодно видно, где кончается
  // один стан и начинается другой
  if (L.ladder){
    const y = yTreble(28);
    s += `<line class="mid" x1="${r(L.x0)}" y1="${r(y)}" x2="${r(L.x1)}" y2="${r(y)}"/>` +
         `<text class="midlabel" x="${r(L.x1)}" y="${r(y - 5)}" text-anchor="end">до первой октавы</text>`;
  }
  // ключи
  s += glyphPath(CLEFS.treble.g, 'glyph', L.clefX, yTreble(CLEFS.treble.dia), CLEFS.treble.spaces, CLEFS.treble.anchor);
  const bassY = L.ladder ? yTreble(CLEFS.bass.dia) : yBass(CLEFS.bass.dia);
  s += glyphPath(CLEFS.bass.g, 'glyph', L.clefX, bassY, CLEFS.bass.spaces, CLEFS.bass.anchor);

  s += `<g id="notes"></g>`;
  s += `<rect class="hit" id="hit" x="${L.clefX + 60}" y="0" width="${L.x1 - L.clefX - 60}" height="${r(L.height)}"/>`;
  staffEl.innerHTML = s;
}
const line = (x0, y, x1) => `<line class="rule" x1="${r(x0)}" y1="${r(y)}" x2="${r(x1)}" y2="${r(y)}"/>`;

/* notes: [{midi, dia, alter, staff}] */
function renderNotes(notes, kind = '', animate = true){
  if (notes.length) ensureRoom(notes.map(n => n.dia));
  const g = staffEl.querySelector('#notes');
  if (!g) return;
  if (!notes.length){ g.innerHTML = ''; return; }

  const list = notes.slice().sort((a, b) => a.dia - b.dia);
  const ledgers = new Map();
  let out = '', prevD = null, prevOff = 0;

  for (const n of list){
    const staff = n.staff || (L.ladder ? 'treble' : staffOf(n.midi));
    const y = yOf(n.dia, staff);
    const off = (prevD !== null && n.dia - prevD === 1 && prevOff === 0) ? 1 : 0;
    prevD = n.dia; prevOff = off;
    const cx = L.noteX + off * 1.55 * GAP;

    for (const l of ledgersFor(n.dia, staff)) ledgers.set(staff + ':' + l, yOf(l, staff));

    const head = kind === 'ghost' ? 'ghost' : 'head' + (kind ? ' head--' + kind : '');
    if (n.alter !== 0 || kind === 'ghost'){
      const a = ACCS[String(n.alter)];
      if (a && (n.alter !== 0 || kind === 'ghost')){
        const w = glyphWidth(a.g, a.spaces);
        out += glyphPath(a.g, kind === 'ghost' ? 'ghost' : 'glyph',
                         cx - 0.78 * GAP - w - 4, y, a.spaces, a.anchor);
      }
    }
    // радиусы подобраны так, чтобы наклонённая головка была ровно в один
    // промежуток высотой и в 1.3 промежутка шириной — как в нотной печати
    out += `<ellipse class="${head}" data-head="${n.midi}" cx="${r(cx)}" cy="${r(y)}" ` +
           `rx="${r(0.67 * GAP)}" ry="${r(0.47 * GAP)}" transform="rotate(-20 ${r(cx)} ${r(y)})"/>`;
  }

  let led = '';
  const lw = 1.35 * GAP;
  for (const [, y] of ledgers)
    led += `<line class="${kind === 'ghost' ? 'ghost-ledger' : 'ledger'}" x1="${r(L.noteX - lw)}" y1="${r(y)}" x2="${r(L.noteX + lw + (prevOff ? 1.55 * GAP : 0))}" y2="${r(y)}"/>`;

  g.innerHTML = led + out;
  if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) g.classList.add('note-anim');
  else g.classList.remove('note-anim');
  void g.getBoundingClientRect();
}

function clearNotes(){
  const g = staffEl.querySelector('#notes');
  if (g){ g.innerHTML = ''; g.classList.remove('note-anim'); }
  linkEl.innerHTML = '';
}

/* ─── Клавиатура ──────────────────────────────────────────────────────── */
function keyLabel(midi, mode){
  const sp = spell(midi, S.accidental);
  const isC = midi % 12 === 0;
  if (mode === 'none') return isC ? `<span class="key__lbl">·</span>` : '';
  if (mode === 'c' && !isC) return '';
  const base = S.naming === 'ru' ? LET_RU[sp.li] : LET[sp.li];
  const acc = sp.alter ? `<span class="acc">${accSign(sp.alter)}</span>` : '';
  const sup = isC ? `<sup>${OCT_SHORT[sp.oct] || ''}</sup>` : '';
  return `<span class="key__lbl">${base}${acc}${sup}</span>`;
}

const MIN_KEY = 21;                     // уже этого белая клавиша перестаёт быть клавишей

function buildKeyboard(recenter){
  const { lo, hi } = range();
  keyEls.clear();
  const whites = [];
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
  const wPct = 100 / whites.length, bw = wPct * 0.62;

  // Ширину клавиши считаем заранее: от неё зависят и высота клавиатуры, и то,
  // поместятся ли подписи. На 88 клавишах подписи ужимаются до одних до.
  const avail = Math.max(300, (scrollEl.clientWidth || 900) - 2);
  const kw = Math.max(MIN_KEY, avail / whites.length);
  const width = Math.max(avail, whites.length * MIN_KEY);
  const mode = kw < 19 ? 'none' : kw < 31 ? 'c' : S.labels;

  let html = '';
  whites.forEach(m => {
    const sp = spell(m, S.accidental);
    html += `<button class="key key--w" data-midi="${m}" aria-label="${fullName(sp)}">${keyLabel(m, mode)}</button>`;
  });
  for (let m = lo; m <= hi; m++){
    if (!isBlack(m)) continue;
    const i = whites.indexOf(m - 1);
    if (i < 0) continue;
    const sp = spell(m, S.accidental);
    const left = (i + 1) * wPct - bw / 2;
    html += `<button class="key key--b" data-midi="${m}" aria-label="${fullName(sp)}" ` +
            `style="left:${r(left,4)}%;width:${r(bw,4)}%">${keyLabel(m, kw * 0.62 < 15 ? 'none' : mode)}</button>`;
  }
  keysEl.innerHTML = html;
  keysEl.querySelectorAll('.key').forEach(el => keyEls.set(+el.dataset.midi, el));

  const w = Math.round(width) + 'px';
  keysEl.style.minWidth = w;
  keysEl.previousElementSibling.style.minWidth = w;       // фетровая полоса
  keysEl.style.height = Math.round(Math.min(200, Math.max(116, kw * 6.2))) + 'px';

  const scrolls = width > avail + 2;
  $('#boardHint').textContent = scrolls ? 'клавиатура прокручивается вбок' : '';
  if (scrolls && recenter) requestAnimationFrame(() => centerOn(60, false));
  restoreMarks();
}

/* Перестройка клавиатуры стирает подсветку — возвращаем её на место */
function restoreMarks(){
  if (T.mode === 'free'){ T.shown.forEach(m => markKey(m, 'is-held')); return; }
  if (!T.target) return;
  if (T.lock) markKey(T.target.midi, 'is-right');
  else if (T.mode === 'keyToNote') markKey(T.target.midi, 'is-target');
}

/* Показать клавишу, если она уехала за край прокрутки */
function centerOn(midi, smooth = true){
  const el = keyEls.get(midi);
  if (!el || !scrollEl) return;
  const kr = el.getBoundingClientRect(), br = scrollEl.getBoundingClientRect();
  if (!br.width) return;
  if (kr.left >= br.left + 6 && kr.right <= br.right - 6) return;
  const left = scrollEl.scrollLeft + (kr.left - br.left) - (br.width - kr.width) / 2;
  scrollEl.scrollTo({ left, behavior: smooth && !calm() ? 'smooth' : 'auto' });
}

const markKey = (midi, cls, ms) => {
  const el = keyEls.get(midi);
  if (!el) return;
  el.classList.add(cls);
  if (ms) setTimeout(() => el.classList.remove(cls), ms);
};
const clearMarks = () => keysEl.querySelectorAll('.key')
  .forEach(el => el.classList.remove('is-target','is-right','is-wrong','is-hint','is-held'));

/* ─── Отвес ───────────────────────────────────────────────────────────── */
function drawLink(midis){
  if (!midis.length){ linkEl.innerHTML = ''; return; }
  const st = stageEl.getBoundingClientRect(), bd = scrollEl.getBoundingClientRect();
  linkEl.setAttribute('viewBox', `0 0 ${r(st.width)} ${r(st.height)}`);
  let out = '';
  for (const midi of midis){
    const head = staffEl.querySelector(`[data-head="${midi}"]`), key = keyEls.get(midi);
    if (!head || !key) continue;
    const h = head.getBoundingClientRect(), k = key.getBoundingClientRect();
    const kx = k.left + k.width / 2;
    if (kx < bd.left - 2 || kx > bd.right + 2) continue;
    const x1 = h.left + h.width / 2 - st.left, y1 = h.bottom - st.top;
    const x2 = kx - st.left, y2 = k.top - st.top + (key.classList.contains('key--b') ? 4 : 4);
    if (y2 <= y1) continue;
    const dy = Math.max(26, (y2 - y1) * 0.45);
    out += `<path d="M${r(x1)} ${r(y1)} C ${r(x1)} ${r(y1 + dy)}, ${r(x2)} ${r(y2 - dy)}, ${r(x2)} ${r(y2)}"/>` +
           `<circle cx="${r(x2)}" cy="${r(y2)}" r="2.6"/>`;
  }
  linkEl.innerHTML = out;
}

/* ─── Звук ────────────────────────────────────────────────────────────── */
let ac = null;
function tone(midi){
  if (!S.sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
  } catch(e){ return; }
  const f = freqOf(midi), t = ac.currentTime, vol = (S.volume / 100) * 0.22;
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.01);
  out.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(Math.min(9000, f * 9), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(400, f * 2.2), t + 1.4);
  lp.connect(out); out.connect(ac.destination);
  [[1,1],[2,0.36],[3,0.15],[4,0.07],[6,0.03]].forEach(([mult, amp]) => {
    const o = ac.createOscillator();
    o.type = mult === 1 ? 'triangle' : 'sine';
    o.frequency.value = f * mult;
    const g = ac.createGain();
    g.gain.value = amp;
    o.connect(g); g.connect(lp);
    o.start(t); o.stop(t + 2.2);
  });
}

/* ─── Показания и статистика ──────────────────────────────────────────── */
const ROHINT = {
  free:      'нажми любую клавишу',
  noteToKey: 'найди её на клавиатуре',
  keyToNote: 'поставь её на стан',
  nameNote:  'выбери название'
};
function readout(sp){
  if (!sp){
    $('#roName').textContent = T.mode === 'free' ? '—' : '?';
    $('#roOct').textContent  = ROHINT[T.mode] || '';
    $('#roSci').textContent  = '';
    $('#roHz').textContent   = '';
    return;
  }
  $('#roName').textContent = noteName(sp);
  $('#roOct').textContent  = OCT_GEN[sp.oct] || '';
  $('#roSci').textContent  = sciName(sp);
  $('#roHz').textContent   = freqOf(sp.midi).toFixed(1) + ' Гц';
}

function renderStats(){
  $('#stStreak').textContent = T.streak;
  $('#stBest').textContent   = S.best;
  $('#stAcc').textContent    = T.total ? Math.round(T.right / T.total * 100) + '%' : '—';

  const rows = Object.entries(S.stats)
    .map(([m, v]) => ({ m:+m, r:v.r|0, w:v.w|0, n:(v.r|0) + (v.w|0) }))
    .filter(x => x.n >= 2 && x.w > 0)
    .sort((a, b) => (a.r / a.n) - (b.r / b.n) || b.w - a.w)
    .slice(0, 6);

  weakEl.innerHTML = rows.length
    ? rows.map(x => {
        const sp = spell(x.m, S.accidental);
        return `<span class="weak__item"><i>${noteName(sp)}</i>${
          `<span>${Math.round(x.r / x.n * 100)}%</span>`}</span>`;
      }).join('')
    : '<p class="weak__empty">Пока пусто — позанимайся немного.</p>';
}

function record(midi, ok){
  const k = String(midi);
  const v = S.stats[k] || (S.stats[k] = { r:0, w:0 });
  ok ? v.r++ : v.w++;
  T.total++; if (ok) T.right++;
  if (ok){ T.streak++; if (T.streak > S.best){ S.best = T.streak; } }
  else T.streak = 0;
  save(); renderStats();
  if (HOOK.onAnswer) HOOK.onAnswer(ok);
}

/* ─── Реплики ─────────────────────────────────────────────────────────── */
function cue(text, kind = ''){
  cueEl.className = 'cue' + (kind ? ' is-' + kind : '');
  cueEl.innerHTML = text;
}
const CUES = {
  free:      'Нажимай клавиши — увидишь, где эта нота живёт на стане.',
  noteToKey: 'Найди эту ноту на клавиатуре.',
  keyToNote: 'Клавиша подсвечена. Поставь её ноту на стан — кликни по нужной линейке или промежутку.',
  nameNote:  'Как называется эта нота?'
};

/* ─── Режимы ──────────────────────────────────────────────────────────── */
function setMode(mode){
  T.mode = mode; T.target = null; T.wrong = 0; T.placeAlter = 0;
  T.held.clear(); T.shown.clear();
  clearMarks(); clearNotes(); answerEl.innerHTML = '';
  staffEl.classList.toggle('is-clickable', mode === 'keyToNote');
  document.querySelectorAll('.mode').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  if (mode === 'free'){ cue(CUES.free); readout(null); }
  else nextRound();
}

function pick(){
  if (HOOK.pick){ const m = HOOK.pick(); if (m != null) return (T.last = m); }
  const p = pool();
  let m = p[Math.floor(Math.random() * p.length)];
  if (p.length > 2){ let guard = 0; while (m === T.last && guard++ < 12) m = p[Math.floor(Math.random() * p.length)]; }
  T.last = m;
  return m;
}

function nextRound(){
  T.wrong = 0; T.lock = false; T.placeAlter = 0;
  clearMarks(); clearNotes(); answerEl.innerHTML = '';
  if (HOOK.beforeRound && HOOK.beforeRound() === false) return;   // урок закончился
  const sp = spell(pick(), S.accidental);
  T.target = sp;

  if (T.mode === 'noteToKey'){
    renderNotes([sp]);
    cue(CUES.noteToKey);
    readout(null);
  } else if (T.mode === 'keyToNote'){
    markKey(sp.midi, 'is-target');
    centerOn(sp.midi);
    cue(CUES.keyToNote);
    readout(null);
    buildAccidentalPicker();
  } else if (T.mode === 'nameNote'){
    renderNotes([sp]);
    cue(CUES.nameNote);
    readout(null);
    buildNamePicker();
  }
}

function buildNamePicker(){
  const names = S.naming === 'ru' ? LET_RU : LET;
  const letters = names.map((n, i) => `<button class="chip" data-li="${i}">${n}</button>`).join('');
  // Если в наборе есть чёрные клавиши, одних букв мало: иначе до и до-диез
  // засчитывались бы одинаково, и урок закреплял бы ошибку.
  const signs = T.needAlter
    ? `<span class="answer__label">Знак</span>` +
      [[0,'♮'],[1,'♯'],[-1,'♭']].map(([v, t]) =>
        `<button class="chip chip--sign" data-alter="${v}" aria-pressed="${v === T.placeAlter}">${t}</button>`).join('')
    : '';
  answerEl.innerHTML = signs + `<span class="answer__label">Нота</span>` + letters;
}
function buildAccidentalPicker(){
  if (S.blacks === 'white'){ answerEl.innerHTML = ''; return; }
  const opts = [[0,'♮︎ без знака'], [1,'♯︎ диез'], [-1,'♭︎ бемоль']];
  answerEl.innerHTML = `<span class="answer__label">Знак</span>` +
    opts.map(([v, t]) => `<button class="chip chip--wide" data-alter="${v}" aria-pressed="${v === T.placeAlter}">${t}</button>`).join('');
}

function verdict(ok, sp){
  if (ok) cue(`<b>Верно.</b> ${fullName(sp)} — <span>${sciName(sp)}</span>`, 'ok');
  else    cue(`<b>Не эта.</b> Попробуй ещё раз`, 'bad');
}

/* Ответ клавишей (режимы free и noteToKey) */
function pressKey(midi, fromHold){
  const sp = spell(midi, S.accidental);
  tone(midi);

  if (T.mode === 'free'){
    if (T.held.size === 0) T.shown.clear();
    T.held.add(midi); T.shown.add(midi);
    const notes = [...T.shown].map(m => {
      const x = spell(m, S.accidental);
      return { midi:m, dia:x.dia, alter:x.alter, staff: staffOf(m) };
    });
    renderNotes(notes);
    readout(sp);
    cue(`<b>${noteName(sp)}</b> ${OCT_GEN[sp.oct]} · ${sciName(sp)}`);
    markKey(midi, 'is-held');
    centerOn(midi, false);
    requestAnimationFrame(() => drawLink([...T.shown]));
    return;
  }

  if (T.mode === 'noteToKey'){
    if (T.lock || !T.target) return;
    const ok = midi === T.target.midi;
    record(T.target.midi, ok);
    if (ok){
      T.lock = true;
      markKey(midi, 'is-right');
      centerOn(midi, false);
      renderNotes([T.target], 'ok', false);
      verdict(true, T.target);
      readout(T.target);
      requestAnimationFrame(() => drawLink([T.target.midi]));
      setTimeout(nextRound, 1050);
    } else {
      markKey(midi, 'is-wrong', 520);
      T.wrong++;
      cue(`<b>Мимо.</b> Это ${fullName(sp)}`, 'bad');
      if (S.hints && T.wrong >= 2){ markKey(T.target.midi, 'is-hint', 1400); centerOn(T.target.midi); }
    }
    return;
  }

  if (T.mode === 'keyToNote' || T.mode === 'nameNote'){
    // клавиши здесь только звучат — ответ даётся станом или кнопками
    markKey(midi, 'is-held', 220);
  }
}
function releaseKey(midi){
  T.held.delete(midi);
  const el = keyEls.get(midi);
  if (el && T.mode === 'free' && !T.shown.has(midi)) el.classList.remove('is-held');
}

/* Ответ названием (режим nameNote) */
function answerName(li, btn){
  if (T.lock || !T.target) return;
  const ok = li === T.target.li && (!T.needAlter || T.placeAlter === T.target.alter);
  record(T.target.midi, ok);
  btn.classList.add(ok ? 'is-ok' : 'is-bad');
  if (ok){
    T.lock = true;
    renderNotes([T.target], 'ok', false);
    verdict(true, T.target);
    readout(T.target);
    tone(T.target.midi);
    markKey(T.target.midi, 'is-right');
    centerOn(T.target.midi);
    requestAnimationFrame(() => drawLink([T.target.midi]));
    setTimeout(nextRound, 1050);
  } else {
    T.wrong++;
    setTimeout(() => btn.classList.remove('is-bad'), 520);
    cue(`<b>Нет.</b> Посмотри, на какой линейке стоит головка ноты`, 'bad');
    if (S.hints && T.wrong >= 2){ markKey(T.target.midi, 'is-hint', 1600); centerOn(T.target.midi); }
  }
}

/* Ответ постановкой ноты (режим keyToNote) */
function svgPoint(ev){
  const ctm = staffEl.getScreenCTM();
  if (!ctm) return null;
  const p = staffEl.createSVGPoint();
  p.x = ev.clientX; p.y = ev.clientY;
  return p.matrixTransform(ctm.inverse());
}
function diaFromY(y){
  let d, staff = 'treble';
  if (L.ladder){
    d = 38 - (y - L.top38) / HALF;
  } else {
    const boundary = L.top38 + 4 * GAP + SEP / 2;
    if (y < boundary) d = 38 - (y - L.top38) / HALF;
    else { staff = 'bass'; d = 26 - (y - L.bass26) / HALF; }
  }
  d = Math.round(d);
  return { d: Math.max(L.dMin - 3, Math.min(L.dMax + 3, d)), staff };
}
function onStaffMove(ev){
  if (T.mode !== 'keyToNote' || T.lock) return;
  const p = svgPoint(ev);
  if (!p || p.x < L.clefX + 60) return;
  const { d, staff } = diaFromY(p.y);
  const midi = midiFromDia(d, T.placeAlter);
  renderNotes([{ midi, dia:d, alter:T.placeAlter, staff }], 'ghost', false);
}
function onStaffLeave(){ if (T.mode === 'keyToNote' && !T.lock) clearNotes(); }
function onStaffClick(ev){
  if (T.mode !== 'keyToNote' || T.lock || !T.target) return;
  const p = svgPoint(ev);
  if (!p || p.x < L.clefX + 60) return;
  const { d, staff } = diaFromY(p.y);
  const midi = midiFromDia(d, T.placeAlter);
  const ok = midi === T.target.midi;
  record(T.target.midi, ok);
  renderNotes([{ midi, dia:d, alter:T.placeAlter, staff }], ok ? 'ok' : 'bad');
  if (ok){
    T.lock = true;
    tone(midi);
    verdict(true, T.target);
    readout(T.target);
    markKey(T.target.midi, 'is-right');
    requestAnimationFrame(() => drawLink([midi]));
    setTimeout(nextRound, 1150);
  } else {
    T.wrong++;
    const sp = spell(midi, T.placeAlter === -1 ? 'flat' : 'sharp');
    cue(`<b>Тут ${noteName(sp)} ${OCT_GEN[sp.oct]}.</b> Подсвеченная клавиша — другая`, 'bad');
    if (S.hints && T.wrong >= 2){
      const t = T.target;
      cue(`<b>Подсказка:</b> это ${fullName(t)}`, 'bad');
    }
  }
}

/* ─── События клавиатуры на экране ────────────────────────────────────── */
keysEl.addEventListener('pointerdown', ev => {
  const el = ev.target.closest('.key');
  if (!el) return;
  ev.preventDefault();
  el.classList.add('is-down');
  try { el.setPointerCapture(ev.pointerId); } catch(e){}
  pressKey(+el.dataset.midi);
});
keysEl.addEventListener('pointerup', ev => {
  const el = ev.target.closest('.key');
  if (!el) return;
  el.classList.remove('is-down');
  releaseKey(+el.dataset.midi);
});
keysEl.addEventListener('pointercancel', ev => {
  const el = ev.target.closest('.key');
  if (el){ el.classList.remove('is-down'); releaseKey(+el.dataset.midi); }
});
keysEl.addEventListener('contextmenu', ev => ev.preventDefault());

staffEl.addEventListener('pointermove', onStaffMove);
staffEl.addEventListener('pointerleave', onStaffLeave);
staffEl.addEventListener('click', onStaffClick);

answerEl.addEventListener('click', ev => {
  const b = ev.target.closest('.chip');
  if (!b) return;
  if (b.dataset.li !== undefined) answerName(+b.dataset.li, b);
  else if (b.dataset.alter !== undefined){
    T.placeAlter = +b.dataset.alter;
    answerEl.querySelectorAll('.chip[data-alter]').forEach(c =>
      c.setAttribute('aria-pressed', String(+c.dataset.alter === T.placeAlter)));
  }
});

document.querySelector('#modes').addEventListener('click', ev => {
  const b = ev.target.closest('.mode');
  if (b) setMode(b.dataset.mode);
});

/* ─── Клавиатура компьютера (по физическим кодам — раскладка не важна) ── */
const CODE_MAP = {
  KeyZ:0, KeyS:1, KeyX:2, KeyD:3, KeyC:4, KeyV:5, KeyG:6, KeyB:7, KeyH:8, KeyN:9, KeyJ:10, KeyM:11, Comma:12,
  KeyQ:12, Digit2:13, KeyW:14, Digit3:15, KeyE:16, KeyR:17, Digit5:18, KeyT:19, Digit6:20, KeyY:21, Digit7:22, KeyU:23, KeyI:24
};
const downCodes = new Set();
addEventListener('keydown', ev => {
  if (ev.target.matches('input, textarea')) return;
  if (ev.key === 'Escape'){ closeSheets(); return; }
  if (ev.code === 'Space'){ ev.preventDefault(); if (T.mode !== 'free') repeatPrompt(); return; }
  if (ev.code === 'ArrowLeft'){ T.kbOct = Math.max(0, T.kbOct - 1); return; }
  if (ev.code === 'ArrowRight'){ T.kbOct = Math.min(7, T.kbOct + 1); return; }
  if (/^Digit[1-4]$/.test(ev.code) && ev.shiftKey){
    setMode(['free','noteToKey','keyToNote','nameNote'][+ev.code.slice(5) - 1]);
    return;
  }
  const off = CODE_MAP[ev.code];
  if (off === undefined || ev.ctrlKey || ev.metaKey || ev.altKey || downCodes.has(ev.code)) return;
  const midi = 12 * (T.kbOct + 1) + off;
  const { lo, hi } = range();
  if (midi < lo || midi > hi) return;
  ev.preventDefault();
  downCodes.add(ev.code);
  const el = keyEls.get(midi);
  if (el) el.classList.add('is-down');
  pressKey(midi);
});
addEventListener('keyup', ev => {
  const off = CODE_MAP[ev.code];
  if (off === undefined) return;
  downCodes.delete(ev.code);
  const midi = 12 * (T.kbOct + 1) + off;
  const el = keyEls.get(midi);
  if (el) el.classList.remove('is-down');
  releaseKey(midi);
});

function repeatPrompt(){
  if (!T.target) return;
  if (T.mode === 'keyToNote') markKey(T.target.midi, 'is-target');
  else renderNotes([T.target]);
}

/* ─── Панели настроек и справки ───────────────────────────────────────── */
const sheets = { settings: $('#sheetSettings'), help: $('#sheetHelp') };
function openSheet(name){
  closeSheets();
  sheets[name].setAttribute('open', '');
}
function closeSheets(){ Object.values(sheets).forEach(s => s.removeAttribute('open')); }
$('#btnSettings').addEventListener('click', () => openSheet('settings'));
$('#btnHelp').addEventListener('click', () => openSheet('help'));
document.addEventListener('click', ev => { if (ev.target.closest('[data-close]')) closeSheets(); });

function syncSegments(){
  document.querySelectorAll('.seg[data-setting]').forEach(seg => {
    const key = seg.dataset.setting;
    seg.querySelectorAll('button').forEach(b =>
      b.setAttribute('aria-pressed', String(String(S[key]) === b.dataset.value)));
  });
  $('#setHints').checked = !!S.hints;
  $('#setSound').checked = !!S.sound;
  $('#setVolume').value = S.volume;
  $('#btnSound').setAttribute('aria-pressed', String(!!S.sound));
  $('#btnSound').textContent = S.sound ? 'Звук' : 'Без звука';
}

document.querySelectorAll('.seg[data-setting]').forEach(seg => {
  seg.addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    const key = seg.dataset.setting;
    S[key] = b.dataset.value;
    save(); syncSegments(); applyAll();
  });
});
$('#setHints').addEventListener('change', e => { S.hints = e.target.checked; save(); });
$('#setSound').addEventListener('change', e => { S.sound = e.target.checked; save(); syncSegments(); });
$('#setVolume').addEventListener('input', e => { S.volume = +e.target.value; save(); });
$('#btnSound').addEventListener('click', () => { S.sound = !S.sound; save(); syncSegments(); });
$('#btnReset').addEventListener('click', () => {
  S.stats = {}; S.best = 0; T.streak = T.right = T.total = 0;
  save(); renderStats();
});

/* MIDI-клавиатура */
$('#btnMidi').addEventListener('click', async () => {
  const st = $('#midiStatus');
  if (!navigator.requestMIDIAccess){ st.textContent = 'Браузер не поддерживает Web MIDI.'; return; }
  try {
    const access = await navigator.requestMIDIAccess();
    const bind = () => {
      let n = 0;
      access.inputs.forEach(input => { n++; input.onmidimessage = onMidi; });
      st.textContent = n ? `Подключено устройств: ${n}. Играй!` : 'Устройства не найдены.';
    };
    access.onstatechange = bind;
    bind();
  } catch(e){ st.textContent = 'Не удалось получить доступ к MIDI.'; }
});
function onMidi(msg){
  const [status, note, vel] = msg.data;
  const cmd = status & 0xf0;
  if (cmd === 0x90 && vel > 0){
    const el = keyEls.get(note);
    if (el) el.classList.add('is-down');
    pressKey(note);
  } else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)){
    const el = keyEls.get(note);
    if (el) el.classList.remove('is-down');
    releaseKey(note);
  }
}

/* ─── Тема, сборка, ресайз ────────────────────────────────────────────── */
function applyTheme(){
  const root = document.documentElement;
  if (S.theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', S.theme);
}

function applyAll(){
  applyTheme();
  renderStaff();
  buildKeyboard(true);
  renderStats();
  setMode(T.mode);
}

function brandMark(){
  const g = GLYPHS.treble, h = 40, sc = h / g.h;
  const w = g.w * sc;
  $('#brandMark').innerHTML =
    `<svg viewBox="0 0 ${r(w + 2)} ${r(h + 2)}" aria-hidden="true">` +
    `<path fill="currentColor" fill-rule="${g.rule}" transform="translate(${r(1 - g.x * sc)} ${r(1 - g.y * sc)}) scale(${r(sc,5)})" d="${g.d}"/></svg>`;
}

let raf = 0;
const relink = () => {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    if (T.mode === 'free') drawLink([...T.shown]);
    else if (T.lock && T.target) drawLink([T.target.midi]);
    else linkEl.innerHTML = '';
  });
};
let rz = 0;
addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => { buildKeyboard(false); relink(); }, 140);
});
scrollEl.addEventListener('scroll', relink);
new ResizeObserver(relink).observe(stageEl);

function bootCore(){
  brandMark();
  syncSegments();
  applyAll();
}

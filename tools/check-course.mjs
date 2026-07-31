// Проверка программы курса: номера нот, знаки, пригодность типов заданий.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const course = JSON.parse(readFileSync(join(root, 'assets/course.json'), 'utf8'));

const LET_RU = ['До','Ре','Ми','Фа','Соль','Ля','Си'];
const SEMI = [0,2,4,5,7,9,11];
const OCT = ['субконтр','контр','большой','малой','первой','второй','третьей','четвёртой','пятой'];
const isBlack = m => [1,3,6,8,10].includes(((m % 12) + 12) % 12);

function name(m, acc = 'sharp'){
  const pc = ((m % 12) + 12) % 12, oct = Math.floor(m / 12) - 1;
  let li = SEMI.indexOf(pc), sign = '';
  if (li < 0){
    if (acc === 'flat'){ li = SEMI.indexOf(pc + 1); sign = '♭'; }
    else { li = SEMI.indexOf(pc - 1); sign = '♯'; }
  }
  return { text: `${LET_RU[li]}${sign} ${OCT[oct]}`, li, sign, oct };
}

let problems = 0;
const flag = (where, msg) => { problems++; console.log(`  ✗ ${where}: ${msg}`); };

course.forEach((u, ui) => {
  console.log(`\n${ui + 1}. ${u.title} — ${u.subtitle}`);
  u.lessons.forEach((l, li) => {
    const where = `${ui + 1}.${li + 1} «${l.title}»`;
    const acc = l.acc || 'sharp';
    const named = l.midi.map(m => name(m, acc));
    console.log(`  ${li + 1}) ${l.title}: ${l.goal}`);
    console.log(`     ${named.map((n, i) => `${l.midi[i]}=${n.text}`).join(', ')}`);
    console.log(`     типы: ${l.types.join('/')} ×${l.count}`);

    if (l.midi.some(m => m < 21 || m > 108)) flag(where, 'нота вне 88 клавиш');
    if (new Set(l.midi).size !== l.midi.length) flag(where, 'повтор ноты в наборе');
    if (l.count < 8 || l.count > 14) flag(where, `count=${l.count} вне 8..14`);
    // В обычном уроке каждая нота должна показаться хотя бы раз; выпускной —
    // это выборка из широкого набора, там правило не действует.
    if (l.midi.length > l.count && !l.exam) flag(where, 'нот больше, чем заданий');

    const black = l.midi.some(isBlack);
    if (black && !l.acc) flag(where, 'есть чёрные клавиши, но не указан acc — запись будет зависеть от настроек');
    if (!black && l.acc) flag(where, 'acc указан, но чёрных клавиш нет');

    // «Название» бессмысленно, если ответ один и тот же независимо от ноты
    if (l.types.includes('nameNote')){
      const answers = new Set(named.map(n => n.li + n.sign));
      if (answers.size < 2) flag(where, 'nameNote: ответ всегда один и тот же — урок проходится не глядя на стан');
      if (answers.size < l.midi.length / 2) flag(where, `nameNote: всего ${answers.size} разных ответов на ${l.midi.length} нот — октавы и знаки не проверяются`);
    }
    // keyToNote — самый трудный тип, не должен быть первым в курсе
    if (l.types.includes('keyToNote') && ui < 2) flag(where, 'keyToNote слишком рано');
  });
});

const total = course.reduce((n, u) => n + u.lessons.length, 0);
const notes = new Set(course.flatMap(u => u.lessons.flatMap(l => l.midi)));
console.log(`\nЮнитов: ${course.length}, уроков: ${total}, разных нот: ${notes.size}`);
console.log(problems ? `\nПроблем: ${problems}` : '\nПроблем не найдено.');
process.exit(problems ? 1 : 0);

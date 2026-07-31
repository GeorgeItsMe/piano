// Собирает index.html (автономный файл) и dist/artifact.html (для публикации).
// Глифы нотных ключей вшиваются как SVG-пути, чтобы приложение не зависело от шрифтов.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8').replace(/^﻿/, '');

const glyphs = {};
for (const line of read('assets/glyphs.txt').split(/\r?\n/)) {
  if (!line.trim()) continue;
  const [name, rule, x, y, w, h, d] = line.split('|');
  glyphs[name] = { rule, x: +x, y: +y, w: +w, h: +h, d };
}

const css = read('src/style.css');
const markup = read('src/markup.html');
// Оба модуля живут в одной области видимости — курс пользуется отрисовкой стана
// и клавиатуры напрямую, без глобальных переменных.
const course = JSON.parse(read('assets/course.json'));
const lessons = course.reduce((n, u) => n + u.lessons.length, 0);

const js = `(() => {\n'use strict';\n${['app.js', 'course.js'].map(f => read('src/' + f)).join('\n')}\nboot();\n})();`
  .replace('"__GLYPHS__"', JSON.stringify(glyphs))
  .replace('"__COURSE__"', JSON.stringify(course));

const body = `<style>\n${css}\n</style>\n${markup}\n<script>\n${js}\n</script>\n`;

const standalone = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Нота ↔ Клавиша — тренажёр нотного стана</title>
<style>*,*::before,*::after{box-sizing:border-box}body{margin:0}img,svg{display:block}button,input,select{font:inherit;color:inherit}</style>
</head>
<body>
${body}</body>
</html>
`;

mkdirSync(join(root, 'dist'), { recursive: true });
mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'index.html'), standalone, 'utf8');          // открыть локально
writeFileSync(join(root, 'public/index.html'), standalone, 'utf8');   // то, что раздаёт Vercel
writeFileSync(join(root, 'dist/artifact.html'), `<title>Нота ↔ Клавиша — тренажёр нотного стана</title>\n${body}`, 'utf8');
console.log(`index.html ${standalone.length} B | dist/artifact.html ${body.length} B | курс: ${course.length} юнитов, ${lessons} уроков`);

// Пересчитывает точные границы глифов (Geometry.Bounds завышал их по контрольным
// точкам безье) и находит опорные линии: линию соль для скрипичного ключа,
// линию фа между точками басового, центр чаши бемоля.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'assets/glyphs.txt');

function figures(d){
  const out = [];
  let cur = null, x = 0, y = 0, sx = 0, sy = 0, cmd = '';
  const tok = d.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g) || [];
  let i = 0;
  const num = () => +tok[i++];
  const add = (px, py) => { cur.pts.push([px, py]); };
  const cubic = (x0,y0,x1,y1,x2,y2,x3,y3) => {
    for (let t = 1; t <= 24; t++){
      const u = t / 24, v = 1 - u;
      add(v*v*v*x0 + 3*v*v*u*x1 + 3*v*u*u*x2 + u*u*u*x3,
          v*v*v*y0 + 3*v*v*u*y1 + 3*v*u*u*y2 + u*u*u*y3);
    }
  };
  while (i < tok.length){
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    if (cmd === 'M' || cmd === 'm'){
      x = num(); y = num();
      cur = { pts: [] }; out.push(cur); add(x, y); sx = x; sy = y;
      cmd = 'L';
    } else if (cmd === 'L' || cmd === 'l'){
      x = num(); y = num(); add(x, y);
    } else if (cmd === 'C' || cmd === 'c'){
      const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num();
      cubic(x, y, x1, y1, x2, y2, x3, y3); x = x3; y = y3;
    } else if (cmd === 'Q' || cmd === 'q'){
      const x1 = num(), y1 = num(), x3 = num(), y3 = num();
      cubic(x, y, x + 2/3*(x1-x), y + 2/3*(y1-y), x3 + 2/3*(x1-x3), y3 + 2/3*(y1-y3), x3, y3);
      x = x3; y = y3;
    } else if (cmd === 'z' || cmd === 'Z'){
      x = sx; y = sy; cmd = '';
      if (i < tok.length && !/[A-Za-z]/.test(tok[i])) break;
    } else { i++; }
  }
  return out.filter(f => f.pts.length > 2);
}
const bounds = pts => pts.reduce((b, [px, py]) => ({
  x0: Math.min(b.x0, px), x1: Math.max(b.x1, px),
  y0: Math.min(b.y0, py), y1: Math.max(b.y1, py)
}), { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 });

const rows = readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
  .map(l => { const [name, rule, , , , , d] = l.split('|'); return { name, rule, d }; });

const out = [];
for (const g of rows){
  const figs = figures(g.d).map(f => ({ ...bounds(f.pts), n: f.pts.length }));
  const all = bounds(figs.flatMap(f => [[f.x0, f.y0], [f.x1, f.y1]]));
  const W = all.x1 - all.x0, H = all.y1 - all.y0;
  const note = [];

  if (g.name === 'bass'){
    // Две точки справа: линия фа — ровно между их центрами, расстояние между
    // ними равно одному межлинейному промежутку.
    const dots = figs.filter(f => f.x0 > all.x0 + W * 0.8).sort((a, b) => a.y0 - b.y0);
    if (dots.length === 2){
      const c0 = (dots[0].y0 + dots[0].y1) / 2, c1 = (dots[1].y0 + dots[1].y1) / 2;
      note.push(`anchor=${(((c0 + c1) / 2 - all.y0) / H).toFixed(4)}`,
                `spaces=${(H / Math.abs(c1 - c0)).toFixed(3)}`);
    }
  }
  if (g.name === 'flat'){
    const bowl = figs.filter(f => f !== figs[0]).sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0))[0];
    if (bowl) note.push(`anchor=${(((bowl.y0 + bowl.y1) / 2 - all.y0) / H).toFixed(4)}`);
  }

  console.log(`${g.name.padEnd(8)} tight x ${all.x0.toFixed(1)} w ${W.toFixed(1)}  y ${all.y0.toFixed(1)} h ${H.toFixed(1)}  figs=${figs.length} ${note.join(' ')}`);
  out.push([g.name, g.rule, all.x0.toFixed(2), all.y0.toFixed(2), W.toFixed(2), H.toFixed(2), g.d].join('|'));
}
writeFileSync(file, out.join('\n'), 'utf8');
console.log('glyphs.txt обновлён');

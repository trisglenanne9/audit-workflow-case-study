// Simulates "Walk through the flow" from the map: always the main button, across pages, as the app does.
const fs = require('fs');
global.window = {};
const path = require('path');
const SRC = path.resolve(__dirname, '..', 'site_src');
const SITE = path.resolve(__dirname, '..', '..', '..', '..', '01 Current workflows', 'Process explorer (all workflows)');
eval(fs.readFileSync(path.join(SITE, 'data.js'), 'utf8'));
const D = window.DATA, F = require(path.join(SRC, 'flow.js'));
const P = {}; D.pages.forEach(p => { P[p.id] = p; });
const CONN = {}; const BYCELL = {};
D.connectors.forEach(c => { CONN[c.id] = c; BYCELL[c.page + ':' + c.cell] = c; });
const short = (t, n) => String(t || '').replace(/\s+/g, ' ').slice(0, n || 60);
const walk = { states: {}, graphs: {}, order: [], page: process.argv[2] || 'aud-1' };
const G = pid => walk.graphs[pid] || (walk.graphs[pid] = F.build(P[pid], { isOutConn: id => { const c = BYCELL[pid + ':' + id]; return !!(c && c.dir === 'out' && c.toPage); } }));
const others = () => {
  const res = [], done = {};
  [walk.page].concat(walk.order.filter(x => x !== walk.page).reverse()).forEach(pid => {
    if (done[pid] || !walk.states[pid]) return; done[pid] = 1;
    F.others(G(pid), walk.states[pid]).forEach(o => res.push(Object.assign({ page: pid }, o)));
  });
  return res;
};
walk.order.push(walk.page);
walk.states[walk.page] = F.start(G(walk.page), F.firstEntry(G(walk.page)));
const log = [];
let actions = 0, stepsOnPage = 0;
const flush = () => { if (stepsOnPage) log.push(`   (${stepsOnPage} steps on ${walk.page})`); stepsOnPage = 0; };
for (; actions < 3000; actions++) {
  const pid = walk.page, g = G(pid), st = walk.states[pid], ch = F.choices(g, st), it = ch.node;
  stepsOnPage++;
  if (ch.end || ch.loop) {
    const c = it.kind === 'connector' ? BYCELL[pid + ':' + it.id] : null;
    const pc = c && c.dir === 'out' && c.partner ? CONN[c.partner] : null;
    if (pc) {
      flush();
      log.push(`${pid}  -[${c.letter}]->  ${pc.page}`);
      walk.page = pc.page;
      const g2 = G(pc.page);
      if (!walk.states[pc.page]) { walk.states[pc.page] = F.start(g2, pc.cell); walk.order.push(pc.page); } else F.jump(g2, walk.states[pc.page], { type: 'entry', id: pc.cell });
      continue;
    }
    const o = others();
    if (!o.length) { flush(); log.push(`STOP on ${pid}: nothing left. ("${short(it.text, 50)}")`); break; }
    flush();
    const f = o[0];
    log.push(`${pid}  end (${short(it.text, 40)})  ->  other path on ${f.page}: ${f.type === 'branch' ? 'at "' + short(G(f.page).nodes[f.from].text, 40) + '" take ' + (f.label || '#' + (f.i + 1)) : 'flow starting "' + short(G(f.page).nodes[f.id].text, 40) + '"'}`);
    walk.page = f.page; F.jump(G(f.page), walk.states[f.page], f);
    continue;
  }
  if (ch.fork) F.takeAll(g, st); else F.take(g, st, ch.primary); // at a split every road is taken at once
}
console.log(log.join('\n'));
console.log('actions:', actions);
let seen = 0, total = 0;
Object.keys(walk.states).forEach(pid => { const g = G(pid); seen += Object.keys(walk.states[pid].visited).length; total += g.ids.length - g.isolated.length; });
console.log('pages visited:', Object.keys(walk.states).length, ' shapes seen', seen, 'of', total, 'on those pages; all pages total:', D.pages.filter(p => !p.empty).reduce((a, p) => a + (G(p.id).ids.length - G(p.id).isolated.length), 0));
console.log('pages not reached:', D.pages.filter(p => !p.empty && !walk.states[p.id]).map(p => p.id + ' (' + p.name.trim() + ')').join('; ') || 'none');

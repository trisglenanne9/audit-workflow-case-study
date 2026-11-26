// Walks every page of the real data with the default choices and checks that the walk ends, reaches every shape and can be undone.
const fs = require('fs');
global.window = {};
const path = require('path');
const SRC = path.resolve(__dirname, '..', 'site_src');
const SITE = path.resolve(__dirname, '..', '..', '..', '..', '01 Current workflows', 'Process explorer (all workflows)');
eval(fs.readFileSync(path.join(SITE, 'data.js'), 'utf8'));
const D = window.DATA;
const F = require(path.join(SRC, 'flow.js'));
const CONN = {}; D.connectors.forEach(c => { CONN[c.page + ':' + c.cell] = c; });
const show = process.argv[2];            // optional page id whose main path is printed in full
const short = (t, n) => String(t || '').replace(/\s+/g, ' ').slice(0, n || 70);
let bad = 0, forksJoin = 0, forksOpen = 0, biggest = 0;
D.pages.forEach(p => {
  if (p.empty) return;
  const g = F.build(p, { isOutConn: id => { const c = CONN[p.id + ':' + id]; return !!(c && c.dir === 'out' && c.toPage); } });
  const startId = F.firstEntry(g);
  let st = F.start(g, startId);
  const mainPath = [];
  let guard = 0, segs = 0, branchJumps = 0, entryJumps = 0;
  const walk = () => {
    segs++;
    for (;;) {
      if (++guard > 5000) { console.log('  !! runaway on', p.id); bad++; return; }
      const ch = F.choices(g, st);
      if (segs === 1) mainPath.push({ id: st.cur, kind: ch.node.kind, text: ch.node.text, n: ch.outs.length, labels: ch.outs.map(o => o.label + (o.primary ? '*' : '')).join('|') });
      if (ch.end || ch.loop) return;
      if (ch.fork) { // a split: every road is shown and one move takes the walk to where they meet
        const fk = ch.fork;
        if (fk.join) forksJoin++; else forksOpen++;
        biggest = Math.max(biggest, fk.nodes.length);
        const mv = F.takeAll(g, st);
        const missing = fk.nodes.concat([fk.target]).filter(x => !st.visited[x] && !(g.isOutConn(x) && x !== fk.target)); // (a hand-off on a side road stays for "other paths")
        if (missing.length) { console.log('  !! a split left shapes unseen on', p.id, missing); bad++; }
        if (mv.seen.length + (fk.nodes.length - mv.seen.length) !== fk.nodes.length) bad++;
        if (st.cur !== fk.target) { console.log('  !! a split did not end on its target on', p.id); bad++; }
        continue;
      }
      F.take(g, st, ch.primary);
    }
  };
  walk();
  const mainLen = mainPath.length;
  for (;;) {
    const o = F.others(g, st);
    if (!o.length) break;
    F.jump(g, st, o[0]); o[0].type === 'branch' ? branchJumps++ : entryJumps++;
    walk();
    if (guard > 5000) break;
  }
  const visited = Object.keys(st.visited).length;
  const unseen = g.ids.filter(id => !st.visited[id]);
  const unseenReal = unseen.filter(id => !g.isolated.includes(id));
  // undo everything
  let undone = 0; while (F.back(g, st)) undone++;
  const okBack = st.cur === startId && Object.keys(st.visited).length === 1;
  console.log(`${p.id.padEnd(6)} nodes=${String(g.ids.length).padStart(3)} entries=${g.entries.length} start="${short(g.nodes[startId].text, 34)}" main=${String(mainLen).padStart(3)} segments=${segs} (branch jumps ${branchJumps}, entry jumps ${entryJumps}) seen=${visited}/${g.ids.length - g.isolated.length} unseen=${unseenReal.length} undo=${okBack ? 'ok' : 'BAD'}`);
  if (unseenReal.length) { bad++; console.log('   unseen:', unseenReal.slice(0, 6).map(i => i + ':' + short(g.nodes[i].text, 30))); }
  if (!okBack) bad++;
  if (show === p.id || show === 'all') {
    console.log('   --- main path of', p.id);
    mainPath.forEach((m, i) => console.log('   ' + String(i + 1).padStart(3) + ' ' + ({ step: 'S', decision: '?', terminal: 'o', connector: '>' }[m.kind]) + ' ' + short(m.text, 88) + (m.n > 1 ? '   [' + m.labels + ']' : '')));
  }
});
console.log(`splits taken as a whole: ${forksJoin} that meet again at a join, ${forksOpen} that never meet again (shown for a few steps); the biggest shows ${biggest} shapes`);
console.log(bad ? 'PROBLEMS: ' + bad : 'ALL PAGES OK');

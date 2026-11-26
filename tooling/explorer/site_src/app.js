(function () {
  'use strict';
  const D = window.DATA;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enc = encodeURIComponent;
  const H = { page: [], apply: [] }; // the comment board (comments.js) listens here: a page's picture is ready, and the picture moved
  const APE = window.APE = { hooks: H, onClick: null, takeover: null }; // what comments.js may use is filled in just before the start (the end of this file)

  // ------------------------------------------------------------------ indexes
  const PAGES = {}; D.pages.forEach(p => { PAGES[p.id] = p; p.laneById = {}; p.lanes.forEach(l => { p.laneById[l.id] = l; }); });
  const WF = {}; D.workflows.forEach(w => { WF[w.id] = w; });
  const RES = {}; D.resources.forEach(r => { RES[r.id] = r; }); D.registerOnly.forEach(r => { RES[r.id] = r; });
  const CONN = {}; const CONN_BY_CELL = {};
  D.connectors.forEach(c => { CONN[c.id] = c; CONN_BY_CELL[c.page + ':' + c.cell] = c; });
  const USES = {}; const SYM = {};
  D.resources.forEach(r => {
    r.uses.forEach(u => { (USES[u.page + ':' + u.cell] = USES[u.page + ':' + u.cell] || []).push({ r: r, u: u }); });
    r.symbols.forEach(s => { (SYM[s.page + ':' + s.cell] = SYM[s.page + ':' + s.cell] || []).push(r); });
  });
  D.links.forEach((l, i) => { l.key = l.letter || ('n' + i); });
  const LINK = {}; D.links.forEach(l => { LINK[l.key] = l; });

  const DEPTS = [];
  const DEPT_COLOR = {};
  D.pages.forEach(p => p.lanes.forEach(l => {
    if (!(l.dept in DEPT_COLOR)) { DEPT_COLOR[l.dept] = col(l.deptColor || l.color); DEPTS.push(l.dept); }
  }));
  function col(c) { return c && c !== 'none' && /^#?[0-9a-f]{3,8}$/i.test(c.replace('#', '')) ? (c[0] === '#' ? c : '#' + c) : '#cfd5dc'; }
  function deptName(d) { return d === 'EXTERNAL' ? 'External parties' : d; }

  const KIND = { step: 'Step', decision: 'Decision', connector: 'Connector', excel: 'Excel file', document: 'Document', system: 'System or channel', note: 'Note', terminal: 'Start or end', label: 'Label', group: 'Group chat', register: 'In the register only' };
  const KIND_IC = { excel: 'XLS', document: 'DOC', system: 'SYS', group: 'CHAT', register: 'REG' };
  const FLAGS = {
    'shared-wf': ['Shared across workflows', 'shared', 'It appears in more than one workflow.'],
    'shared-dept': ['Shared across departments', 'shared', 'Steps in more than one department use it.'],
    'one-page': ['One page only', 'info', 'It appears on one page of one workflow.'],
    'no-read': ['Only written to', 'warn', 'The drawings show steps that record in it, but no step that reads or checks it.'],
    'review': ['Review candidate', 'warn', 'An Excel file on one page, used by one role only. Worth asking the people who use it whether it is still needed: the drawings alone cannot say.'],
    'not-drawn': ['Not in any drawing', 'info', 'It is in the sources register, but no drawing shows it as a symbol.'],
    'not-in-use': ['Not in use', 'off', 'The sources register marks it as not in use.'],
    'no-workflow': ['Outside the workflows', 'warn', 'The sources register says no workflow uses it.']
  };
  const HOW = { records: 'Records', reads: 'Reads', uses: 'Uses' };

  function pageNo(p) { const m = /^\s*([0-9]+|[A-Z])\./.exec(p.name); return m ? m[1] : ''; }
  // The tag on a page card is the workflow's short name and the page's number or letter ("AUD 1", "AUD 2", "CS A"),
  // so the letter A on two workflows, and a connector's circled A, cannot be taken for one another (owner, 18 Nov 2026).
  const WF_TAG = D.wfTags || {};
  function pageTag(p) { const n = pageNo(p); return n ? (WF_TAG[p.wf] || String(p.wf).toUpperCase()) + ' ' + n : ''; }
  function pageShort(p) { return p.name.replace(/^\s*([0-9]+|[A-Z])\.\s*/, ''); }
  function pageLabel(p) { return WF[p.wf].name + ' · ' + p.name; }
  function mainSentence(t) { return String(t || '').split(/\n\s*Time:/)[0].replace(/\s*\n\s*/g, ' ').trim(); }
  function short(t, n) { const s = mainSentence(t); n = n || 100; return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; }
  function flagHtml(f) { const d = FLAGS[f]; return d ? `<span class="flag ${d[1]}" title="${esc(d[2])}">${esc(d[0])}</span>` : ''; }
  function letterHtml(l, big) { return l ? `<span class="letter${big ? ' big' : ''}" data-l="${esc(l)}">${esc(l)}</span>` : (big ? '' : '<span class="letter none" aria-hidden="true"></span>'); }
  function kindIc(k) { return `<span class="kindic k-${k}">${KIND_IC[k] || ''}</span>`; }
  function deptDot(d) { return `<span class="dot" style="background:${DEPT_COLOR[d] || '#cfd5dc'}"></span>`; }
  function wfKick(wf, tail) { return `<p class="kicker"><i class="wfdot wf-${esc(wf)}"></i>${esc(WF[wf].name)}${tail ? ' · ' + tail : ''}</p>`; }

  // ------------------------------------------------------------------ light or dark
  // Follows the computer's setting until the button is used; then the choice is remembered in this browser.
  (function () {
    const btn = $('#themeBtn'), root = document.documentElement;
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const SUN = '<circle cx="8" cy="8" r="2.9"/><path d="M8 1.4v1.7M8 12.9v1.7M1.4 8h1.7M12.9 8h1.7M3.3 3.3l1.2 1.2M11.5 11.5l1.2 1.2M3.3 12.7l1.2-1.2M11.5 4.5l1.2-1.2"/>';
    const MOON = '<path d="M13.4 9.7A5.7 5.7 0 0 1 6.3 2.6a5.7 5.7 0 1 0 7.1 7.1z"/>';
    const cur = () => root.getAttribute('data-theme') || (mq && mq.matches ? 'dark' : 'light');
    function paint() {
      const dark = cur() === 'dark', label = 'Switch to ' + (dark ? 'light' : 'dark') + ' mode';
      btn.innerHTML = `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true">${dark ? SUN : MOON}</svg><span class="lbl">${dark ? 'Light' : 'Dark'}</span>`;
      btn.title = label; btn.setAttribute('aria-label', label);
    }
    btn.addEventListener('click', () => {
      const next = cur() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('ape-theme', next); } catch (e) { /* private window or blocked storage: the choice just lasts until the page is closed */ }
      paint();
    });
    if (mq && mq.addEventListener) mq.addEventListener('change', paint);
    paint();
  })();

  // ------------------------------------------------------------------ views and routing
  let view = 'map';
  function showView(v) {
    view = v;
    document.body.setAttribute('data-view', v); // the drawing tools in the top bar show in the Drawings view only
    updMini(); // (the overview of the page belongs to the Drawings view)
    // (the "All pages" tray is no longer closed here: it closes only from its own button, owner, 20 Nov 2026)
    if (v !== 'draw' && walk) wStop(false); // leaving the drawings ends a walk through
    $$('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.view === v ? 'true' : 'false'));
    $('#view-map').hidden = v !== 'map'; $('#view-draw').hidden = v !== 'draw'; $('#view-files').hidden = v !== 'files';
    if (v === 'map') requestAnimationFrame(drawLinks);
    if (v === 'files') sizeFiles();
  }
  $$('.tabs button').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.view;
    if (v === 'map') go('#map'); else if (v === 'draw') go('#draw/' + (curPage || firstPage())); else go('#files' + (selRes ? '/' + enc(selRes) : ''));
  }));
  function firstPage() { return D.pages.find(p => !p.empty).id; }
  function go(h) { if (location.hash === h) route(); else location.hash = h; }
  window.addEventListener('hashchange', route);

  function route() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    const parts = h.split('/');
    const v = parts[0] || 'map';
    hoAbort();
    if (v !== 'walk' && walk) wStop(false);
    if (v === 'walk') { // #walk/<page>[/<box>]: the walk through, from the page's first step or from the box named
      showView('draw');
      const wp = PAGES[parts[1]] && !PAGES[parts[1]].empty ? parts[1] : firstPage();
      startWalk(wp, parts.slice(2).join('/'));
    } else if (v === 'draw') {
      showView('draw');
      const pid = PAGES[parts[1]] ? parts[1] : (curPage || firstPage());
      const cell = parts.slice(2).join('/');
      openPage(pid).then(() => { if (cell) selectCell(cell, true); else if (!cell && selCell) clearSel(); });
    } else if (v === 'files') {
      showView('files');
      const id = parts.slice(1).join('/');
      if (id && RES[id]) selectRes(id); else if (!id) fileOverview();
    } else {
      showView('map');
      if (parts[1] === 'page' && PAGES[parts[2]]) mapSelectPage(parts[2]);
      else if (parts[1] === 'link' && LINK[parts[2]]) mapSelectLink(parts[2]);
      else if (parts[1] === 'res' && RES[parts.slice(2).join('/')]) mapHighlight(parts.slice(2).join('/'));
      else mapReset();
    }
  }

  // ------------------------------------------------------------------ big picture
  // Three columns, one per workflow. Pages are stacked in the order the work flows, so every connector
  // can run straight down, straight across, or round the edge of the map: [column, row].
  // explorer.json "map" places each page in a column (one per workflow, in the order of "workflows") and a row; a page it does not
  // place goes to the first free spot at the foot of its column
  const POS = Object.assign({}, D.map || {});
  const COLS = D.workflows.map(w => w.id);
  let mapSel = null; // {type:'page'|'link'|'res', id}

  function buildMap() {
    const map = $('#mapgrid');
    const used = {};
    Object.keys(POS).forEach(k => { used[POS[k].join(',')] = 1; });
    D.pages.forEach(p => { // a page the layout does not know yet goes to the first free spot at the foot of its column
      if (p.empty || POS[p.id]) return;
      const c = Math.max(0, COLS.indexOf(p.wf)); let r = 0;
      while (used[c + ',' + r]) r++;
      POS[p.id] = [c, r]; used[c + ',' + r] = 1;
    });
    const shown = D.pages.filter(p => !p.empty);
    const nrows = Math.max.apply(null, shown.map(p => POS[p.id][1])) + 1;
    const linked = new Set(); D.links.forEach(l => { linked.add(l.src); linked.add(l.dst); });
    const solo = shown.filter(p => !linked.has(p.id)).map(p => POS[p.id][1]);
    map.style.setProperty('--nrows', nrows);
    let html = '<svg class="mapsvg" id="mapsvg" aria-hidden="true"></svg>';
    COLS.forEach((w, c) => {
      html += `<div class="band wf-${w}${c === COLS.length - 1 ? ' last' : ''}" style="grid-column:${c + 1};grid-row:1 / span ${nrows}" aria-hidden="true"></div>`;
      html += `<div class="colhead wf-${w}" style="grid-column:${c + 1};grid-row:1" title="${esc(WF[w].name + ': ' + WF[w].desc)}"><b>${esc(WF[w].name)}</b></div>`;
    });
    if (solo.length) html += `<div class="solonote" style="grid-row:${Math.min.apply(null, solo) + 1}"><span>No connector to another page</span></div>`;
    shown.forEach(p => {
      const [c, r] = POS[p.id];
      html += `<button class="node wf-${p.wf}" data-p="${p.id}" style="grid-column:${c + 1};grid-row:${r + 1}">
        <span class="nbody">
          <span class="nno">${esc(pageTag(p))}</span>
          <span class="ntx">
            <span class="nm">${esc(pageShort(p))}</span>
            <span class="nst">${p.stats.steps} steps</span>
          </span>
        </span></button>`;
    });
    map.innerHTML = html;
    // a press shows the pages this one connects to; a second press on the same page shows every page again (owner, 20 Nov 2026: "when i
    // click the same box again, it will automatically show all the processes on the screen")
    $$('.node', map).forEach(n => n.addEventListener('click', () => go(mapSel && mapSel.type === 'page' && mapSel.id === n.dataset.p ? '#map' : '#map/page/' + n.dataset.p)));
    // highlight select
    const sel = $('#hlSel');
    const groups = [['excel', 'Excel files'], ['document', 'Documents'], ['system', 'Systems and channels'], ['group', 'Group chats']];
    groups.forEach(([k, lab]) => {
      const og = document.createElement('optgroup'); og.label = lab;
      D.resources.filter(r => r.kind === k).sort((a, b) => a.name.localeCompare(b.name)).forEach(r => {
        const o = document.createElement('option'); o.value = r.id; o.textContent = `${r.name} (${r.pages.length} page${r.pages.length === 1 ? '' : 's'})`; og.appendChild(o);
      });
      sel.appendChild(og);
    });
    sel.addEventListener('change', () => go(sel.value ? '#map/res/' + enc(sel.value) : '#map'));
    $('#hlClear').addEventListener('click', () => go('#map'));
  }

﻿  // The connectors are drawn as straight lines with right-angle corners. Each page sits in a cell of the
  // grid (POS), so a route is chosen from where the two cells are: straight down or across when they touch,
  // one corner when the way is clear, otherwise round the left channel, the top or the right edge. Two columns apart
  // (aud-1 to cs-B) the line goes out into the channel, down it to the gap between two rows, along the gap and in at the top
  // or the bottom of the page, so that no line runs behind a page. The letters are placed last (proposal, 19 Nov 2026): each on
  // its own line, never on a page and never on another letter.
  function drawLinks() {
    const map = $('#mapgrid'); const svg = $('#mapsvg');
    if (!map || !svg || $('#view-map').hidden) return;
    fitMap();
    const mr = { width: map.offsetWidth, height: map.offsetHeight };
    const box = {}, occ = {}; let lastCol = 0;
    $$('.node', map).forEach(n => {
      const id = n.dataset.p, p = POS[id];
      const b = { id: id, c: p[0], r: p[1], x: n.offsetLeft, y: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight };
      b.cx = b.x + b.w / 2; b.cy = b.y + b.h / 2;
      box[id] = b; occ[b.c + ',' + b.r] = id; lastCol = Math.max(lastCol, b.c);
    });
    const ids = Object.keys(box);
    if (!ids.length) return;
    const free = (c, r) => !occ[c + ',' + r];
    const colL = c => Math.min.apply(null, ids.filter(i => box[i].c === c).map(i => box[i].x));
    const colR = c => Math.max.apply(null, ids.filter(i => box[i].c === c).map(i => box[i].x + box[i].w));
    const chanX = c => c <= 0 ? colL(0) - 30 : (colR(c - 1) + colL(c)) / 2;
    const marginX = colR(lastCol) + 30;
    const topY = Math.min.apply(null, ids.map(i => box[i].y)) - 22;
    const rowTop = r => Math.min.apply(null, ids.filter(i => box[i].r === r).map(i => box[i].y));
    const rowBot = r => Math.max.apply(null, ids.filter(i => box[i].r === r).map(i => box[i].y + box[i].h));
    const sg = Math.sign;

    // one line per direction between two pages; two letters going the same way share a line
    const dg = {};
    D.links.forEach(l => {
      if (!box[l.src] || !box[l.dst]) return;
      const k = l.src + '>' + l.dst;
      (dg[k] = dg[k] || { src: l.src, dst: l.dst, links: [] }).links.push(l);
    });
    let groups = Object.values(dg);
    groups.forEach(g => g.links.sort((p, q) => (p.letter || '').localeCompare(q.letter || '')));

    function pick(S, T) {
      const dc = T.c - S.c, dr = T.r - S.r;
      if (dc === 0 && Math.abs(dr) === 1) return { sh: 'V', s: dr > 0 ? 'b' : 't', d: dr > 0 ? 't' : 'b' };
      if (dr === 0 && dc !== 0) {
        let ok = true;
        for (let c = S.c + sg(dc); c !== T.c; c += sg(dc)) if (!free(c, S.r)) ok = false;
        if (ok) return { sh: 'H', s: dc > 0 ? 'r' : 'l', d: dc > 0 ? 'l' : 'r' };
      }
      if (dc !== 0 && dr !== 0) {
        let ok = free(S.c, T.r); // leave up or down first, then turn into the side of the other page
        for (let r = S.r + sg(dr); r !== T.r; r += sg(dr)) if (!free(S.c, r)) ok = false;
        for (let c = S.c + sg(dc); c !== T.c; c += sg(dc)) if (!free(c, T.r)) ok = false;
        if (ok) return { sh: 'VH', s: dr > 0 ? 'b' : 't', d: dc > 0 ? 'l' : 'r' };
        ok = free(T.c, S.r); // or leave sideways first, then turn into the top or bottom of the other page
        for (let c = S.c + sg(dc); c !== T.c; c += sg(dc)) if (!free(c, S.r)) ok = false;
        for (let r = S.r + sg(dr); r !== T.r; r += sg(dr)) if (!free(T.c, r)) ok = false;
        if (ok) return { sh: 'HV', s: dc > 0 ? 'r' : 'l', d: dr > 0 ? 't' : 'b' };
      }
      if (dc === 0) return { sh: 'LCH', s: 'l', d: 'l' }; // same column, pages in between: down the channel on its left
      const clearAbove = b => { for (let r = 0; r < b.r; r++) if (!free(b.c, r)) return false; return true; };
      if (clearAbove(S) && clearAbove(T)) return { sh: 'TMG', s: 't', d: 't' }; // over the top of the map
      let out = true, inn = true;
      for (let c = S.c + 1; c <= lastCol; c++) if (!free(c, S.r)) out = false;
      for (let c = T.c + 1; c <= lastCol; c++) if (!free(c, T.r)) inn = false;
      if (out && inn) return { sh: 'RMG', s: 'r', d: 'r' }; // down the right edge
      if (Math.abs(dc) === 1 || dr === 0) return { sh: 'Z', s: dc > 0 ? 'r' : 'l', d: dc > 0 ? 'l' : 'r' }; // the next column: the middle line runs in the channel between the two, past no page
      return { sh: 'CG', s: dc > 0 ? 'r' : 'l', d: dr > 0 ? 't' : 'b' }; // two columns apart: out into the channel, down it to the gap between rows, along the gap, in at the top or the bottom (this used to be a 'Z' whose middle line ran behind the pages of the column between)
    }
    groups.forEach(g => { g.shape = pick(box[g.src], box[g.dst]); });
    // a straight line between two neighbouring pages that is too short for its letters is drawn once for each letter
    const split = [];
    groups.forEach(g => {
      const S = box[g.src], T = box[g.dst], sh = g.shape.sh;
      const room = sh === 'V' ? (T.cy > S.cy ? T.y - (S.y + S.h) : S.y - (T.y + T.h)) : sh === 'H' ? (T.cx > S.cx ? T.x - (S.x + S.w) : S.x - (T.x + T.w)) : 1e9;
      if (g.links.length > 1 && room < 14 + 28 * (g.links.length - 1) + 26 + 4) g.links.forEach(l => split.push({ src: g.src, dst: g.dst, links: [l], shape: g.shape }));
      else split.push(g);
    });
    groups = split;

    const maxRow = Math.max.apply(null, ids.map(i => box[i].r));
    const pt = (b, side, off) => side === 'l' ? [b.x, b.cy + off] : side === 'r' ? [b.x + b.w, b.cy + off] : side === 't' ? [b.cx + off, b.y] : [b.cx + off, b.y + b.h];
    function points(g) {
      const S = box[g.src], T = box[g.dst], a = pt(S, g.shape.s, g.os), z = pt(T, g.shape.d, g.od);
      switch (g.shape.sh) {
        case 'V': return [a, [a[0], z[1]]];
        case 'H': return [a, [z[0], a[1]]];
        case 'VH': return [a, [a[0], z[1]], z];
        case 'HV': return [a, [z[0], a[1]], z];
        case 'LCH': return [a, [g.chx, a[1]], [g.chx, z[1]], z];
        case 'CG': return [a, [g.chx, a[1]], [g.chx, g.gy], [z[0], g.gy], z];
        case 'RMG': return [a, [marginX, a[1]], [marginX, z[1]], z];
        case 'TMG': return [a, [a[0], topY], [z[0], topY], z];
        default: { const mx = (a[0] + z[0]) / 2; return [a, [mx, a[1]], [mx, z[1]], z]; }
      }
    }
    // How badly the lines meet: each place where two lines cross counts 100, each stretch where two run on top of each other 1000, and a
    // little for length. The order of the lines along a side of a page, and of the lines down a channel, is chosen to make this smallest.
    function score(ls) {
      const segs = []; let len = 0;
      ls.forEach((L, li) => { for (let i = 0; i < L.pts.length - 1; i++) { const s = { li: li, x1: L.pts[i][0], y1: L.pts[i][1], x2: L.pts[i + 1][0], y2: L.pts[i + 1][1] }; segs.push(s); len += Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1); } });
      let cross = 0, over = 0;
      for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
        const a = segs[i], b = segs[j]; if (a.li === b.li) continue;
        const av = a.x1 === a.x2, bv = b.x1 === b.x2;
        if (av !== bv) {
          const v = av ? a : b, h = av ? b : a;
          if (v.x1 > Math.min(h.x1, h.x2) + 1 && v.x1 < Math.max(h.x1, h.x2) - 1 && h.y1 > Math.min(v.y1, v.y2) + 1 && h.y1 < Math.max(v.y1, v.y2) - 1) cross++;
        } else if (av) { if (Math.abs(a.x1 - b.x1) < 2 && Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2)) - Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2)) > 3) over++; }
        else if (Math.abs(a.y1 - b.y1) < 2 && Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2)) - Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2)) > 3) over++;
      }
      return cross * 100 + over * 1000 + len * 0.01;
    }
    const perms = n => { const out = []; (function rec(a, rest) { if (!rest.length) { out.push(a); return; } rest.forEach((x, i) => rec(a.concat([x]), rest.slice(0, i).concat(rest.slice(i + 1)))); })([], Array.from({ length: n }, (_, i) => i)); return out; };
    // the lines for one choice of how the 'CG' lines enter their page: where each meets a page, the order along each side, the lines down each channel
    function configure() {
      const ends = {};
      groups.forEach(g => {
        const S = box[g.src], T = box[g.dst];
        [['s', S, T], ['d', T, S]].forEach(a => {
          const e = a[0], b = a[1], o = a[2], side = g.shape[e], horiz = side === 'l' || side === 'r';
          const rank = horiz ? (T.cx > S.cx ? 0 : 1) : (T.cy > S.cy ? 0 : 1); // the way that reads first (right, down) takes the first place
          (ends[b.id + '|' + side] = ends[b.id + '|' + side] || []).push({ g: g, e: e, key: horiz ? o.cy : o.cx, rank: rank });
        });
      });
      const lists = Object.keys(ends).map(k => { ends[k].sort((p, q) => (p.key - q.key) || (p.rank - q.rank)); return { list: ends[k], side: k.split('|')[1], b: box[k.split('|')[0]] }; });
      const chn = {}; // the lines that run down a channel between two columns (round the left of a column, or out to a gap between rows), side by side
      groups.forEach(g => {
        const sh = g.shape.sh; if (sh !== 'LCH' && sh !== 'CG') return;
        g.chIdx = sh === 'LCH' ? box[g.src].c : box[g.src].c + (box[g.dst].c > box[g.src].c ? 1 : 0);
        (chn[g.chIdx] = chn[g.chIdx] || []).push(g);
      });
      const chLists = Object.keys(chn).map(c => ({ idx: +c, list: chn[c] }));
      groups.forEach(g => { // the gap between two rows that a 'CG' line runs along: above the page it enters from the top, below it when it enters from the bottom
        if (g.shape.sh !== 'CG') return;
        const T = box[g.dst]; g.gy = g.shape.d === 't' ? (rowBot(T.r - 1) + rowTop(T.r)) / 2 : (rowBot(T.r) + rowTop(T.r + 1)) / 2;
      });
      const lines = groups.map(g => ({ g: g, pts: null }));
      const run = () => {
        lists.forEach(Lst => {
          const len = (Lst.side === 'l' || Lst.side === 'r') ? Lst.b.h : Lst.b.w, sp = Math.min(30, (len - 22) / Math.max(1, Lst.list.length - 1));
          Lst.list.forEach((en, i) => { en.g['o' + en.e] = (i - (Lst.list.length - 1) / 2) * sp; en.g['n' + en.e] = Lst.list.length; });
        });
        groups.forEach(g => { if (g.shape.sh === 'V' || g.shape.sh === 'H') { const o = g.ns >= g.nd ? g.os : g.od; g.os = g.od = o; } }); // a straight line has the same offset at both ends
        chLists.forEach(c => c.list.forEach((g, i, a) => { g.chx = chanX(c.idx) + (i - (a.length - 1) / 2) * 16; }));
        lines.forEach(L => { L.pts = points(L.g); });
        return score(lines);
      };
      let best = run();
      for (let pass = 0; pass < 2; pass++) lists.concat(chLists).forEach(Lst => {
        const n = Lst.list.length; if (n < 2 || n > 5) return;
        const orig = Lst.list.slice(); let bo = orig.slice();
        perms(n).forEach(pm => { pm.forEach((x, i) => { Lst.list[i] = orig[x]; }); const s = run(); if (s < best - 1e-9) { best = s; bo = Lst.list.slice(); } });
        bo.forEach((x, i) => { Lst.list[i] = x; }); best = run();
      });
      return { lines: lines, score: best };
    }
    // a line that has to enter its page from the top or the bottom (the 'CG' line) tries both, and the way with the fewest crossings is kept
    const cgs = groups.filter(g => g.shape.sh === 'CG');
    let cfg = null;
    (function rec(i) {
      if (i === cgs.length) { const c = configure(); if (!cfg || c.score < cfg.score - 1e-9) cfg = c; return; }
      const T = box[cgs[i].dst], was = cgs[i].shape;
      [['t', T.r >= 1], ['b', T.r < maxRow]].forEach(o => { if (o[1]) { cgs[i].shape = Object.assign({}, was, { d: o[0] }); rec(i + 1); } });
    })(0);
    if (!cfg) cfg = configure();    // where a letter would like to sit: the middle of the longest straight stretch of its line, side by side along it
    function spots(pts, n) {
      let bi = 0, bl = -1;
      for (let i = 0; i < pts.length - 1; i++) {
        const l = Math.abs(pts[i + 1][0] - pts[i][0]) + Math.abs(pts[i + 1][1] - pts[i][1]);
        if (l > bl + 0.5) { bl = l; bi = i; }
      }
      const p0 = pts[bi], p1 = pts[bi + 1], vert = p0[0] === p1[0];
      const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, res = [];
      for (let i = 0; i < n; i++) { const d = (i - (n - 1) / 2) * 28; res.push(vert ? [mx, my + d] : [mx + d, my]); }
      return res;
    }
    // The letters, placed with every line known: each stays on its own line, at least 28 px from every other letter, clear of every page
    // and, when there is room, clear of the other lines. A letter that cannot sit where it would like slides along its line (other
    // stretches included) to the nearest free place. The lines with the fewest places are placed first.
    const LR = 9, LMIN = 28; // the circle's radius (owner, 19 Nov 2026: "draw it a little bit smaller"; was 12)
    function placeLetters(lines) {
      const segs = [];
      lines.forEach((L, li) => { for (let i = 0; i < L.pts.length - 1; i++) segs.push({ li: li, x1: L.pts[i][0], y1: L.pts[i][1], x2: L.pts[i + 1][0], y2: L.pts[i + 1][1] }); });
      const segD = (x, y, s) => Math.hypot(Math.max(Math.min(s.x1, s.x2) - x, 0, x - Math.max(s.x1, s.x2)), Math.max(Math.min(s.y1, s.y2) - y, 0, y - Math.max(s.y1, s.y2)));
      const onCard = (x, y) => ids.some(i => { const b = box[i]; return Math.hypot(Math.max(b.x - x, 0, x - (b.x + b.w)), Math.max(b.y - y, 0, y - (b.y + b.h))) < LR + 2; });
      const places = pts => { // points along the line, off its corners and clear of the page ends and the arrow head
        const out = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i], p1 = pts[i + 1], last = i === pts.length - 2, len = Math.abs(p1[0] - p0[0]) + Math.abs(p1[1] - p0[1]);
          if (len < 1) continue;
          const dx = sg(p1[0] - p0[0]), dy = sg(p1[1] - p0[1]), from = 14, to = len - (last ? 26 : 14);
          if (to < from) { if (len >= 30) out.push({ x: p0[0] + dx * len / 2, y: p0[1] + dy * len / 2 }); continue; }
          for (let t = from; t <= to + 0.01; t += 3) out.push({ x: p0[0] + dx * t, y: p0[1] + dy * t });
        }
        return out;
      };
      const items = [];
      lines.forEach((L, li) => { const cs = places(L.pts), pr = spots(L.pts, L.g.links.length); L.g.links.forEach((l, k) => items.push({ li: li, k: k, l: l, cs: cs, pref: pr[k] })); });
      items.sort((a, b) => a.cs.length - b.cs.length || (a.l.letter || '').localeCompare(b.l.letter || ''));
      const done = [];
      items.forEach(it => {
        let best = null;
        it.cs.forEach(c => {
          let cost = Math.hypot(c.x - it.pref[0], c.y - it.pref[1]);
          if (onCard(c.x, c.y)) cost += 20000;
          done.forEach(d => { if (Math.hypot(d.x - c.x, d.y - c.y) < LMIN) cost += 5000; });
          segs.forEach(s => { if (s.li !== it.li && segD(c.x, c.y, s) < LR + 1) cost += 400; });
          if (!best || cost < best.cost) best = { x: c.x, y: c.y, cost: cost };
        });
        if (!best) best = { x: it.pref[0], y: it.pref[1], cost: 1e6 };
        it.pos = best; done.push(best);
      });
      const res = lines.map(() => []);
      items.forEach(it => { res[it.li][it.k] = [it.pos.x, it.pos.y]; });
      return res;
    }

    const r1 = v => Math.round(v * 10) / 10;
    let out = `<defs><marker id="arrE" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto-start-reverse"><path class="arw" d="M0,0 L10,5 L0,10 z"/></marker></defs>`;
    const lines = cfg.lines;
    const placed = placeLetters(lines);
    lines.forEach((L, gi) => {
      const g = L.g, pts = L.pts;
      const d = pts.map((p, i) => (i ? 'L' : 'M') + r1(p[0]) + ',' + r1(p[1])).join(' ');
      const keys = g.links.map(l => l.key).join(' ');
      out += `<path class="lk" data-g="${gi}" data-keys="${esc(keys)}" data-a="${g.src}" data-b="${g.dst}" data-shape="${g.shape.sh}" d="${d}" marker-end="url(#arrE)"/>`;
      g.links.forEach((l, i) => {
        const sp = placed[gi][i];
        out += `<g class="bd" data-k="${esc(l.key)}" data-a="${l.src}" data-b="${l.dst}" tabindex="0" role="button" aria-label="Connector ${esc(l.letter)}"><circle cx="${r1(sp[0])}" cy="${r1(sp[1])}" r="${LR}"/><text${l.letter === 'I' ? ' class="ser"' : ''} x="${r1(sp[0])}" y="${r1(sp[1])}">${esc(l.letter || '·')}</text><title>Connector ${esc(l.letter)}: ${esc(PAGES[l.src].name)} → ${esc(PAGES[l.dst].name)}${l.carries && l.carries !== PAGES[l.dst].name ? ' (' + esc(l.carries) + ')' : ''}</title></g>`;
      });
    });
    svg.setAttribute('width', mr.width); svg.setAttribute('height', mr.height);
    svg.innerHTML = out;
    $$('.bd', svg).forEach(b => {
      b.addEventListener('click', e => { e.stopPropagation(); go('#map/link/' + b.dataset.k); });
      b.addEventListener('keydown', e => { if (e.key === 'Enter') go('#map/link/' + b.dataset.k); });
    });
    applyMapState();
  }

  // The map fits the window in both directions (proposal, 19 Nov 2026). The layout is tried at its natural width and at wider ones (a wider
  // map has wider cards, so fewer lines in a name and shorter rows) and the width that can be shown biggest wins. The scale never goes below
  // MAP_FLOOR; below it the map scrolls. In a window narrower than the three columns need it scrolls sideways, as before.
  const MAP_FLOOR = 0.7;
  function fitMap() {
    const map = $('#mapgrid'), fitBox = $('#mapfit'), wrap = $('.mapwrap');
    const css = getComputedStyle(map), num = n => parseFloat(css.getPropertyValue(n)) || 0;
    const minW = 3 * num('--minnode') + 2 * num('--chan') + num('--padl') + num('--padr');
    const wcs = getComputedStyle(wrap), tools = $('.maptools'), toolsH = tools && !tools.hidden ? tools.offsetHeight + 8 : 0;
    const availW = wrap.clientWidth - parseFloat(wcs.paddingLeft) - parseFloat(wcs.paddingRight);
    const stacked = window.matchMedia && window.matchMedia('(max-width: 1100px)').matches; // the map and its panel stand one above the other: the map has as much height as it needs
    const availH = stacked ? Infinity : wrap.clientHeight - parseFloat(wcs.paddingTop) - parseFloat(wcs.paddingBottom) - toolsH - (parseFloat(getComputedStyle(fitBox).marginBottom) || 0);
    const w0 = Math.min(Math.max(availW, minW), num('--maxw') || 1180), wMax = Math.max(w0, Math.min(availW / MAP_FLOOR, 1700));
    map.style.transform = '';
    let best = null;
    for (let i = 0; i < 10; i++) {
      const w = Math.min(w0 * (1 + 0.06 * i), wMax);
      map.style.width = w + 'px';
      const h = map.offsetHeight, s = Math.min(1, availW / w, availH / h);
      if (!best || s > best.s + 0.004) best = { w: w, s: s };
      if (s >= 0.999 || w >= wMax) break;
    }
    const s = Math.max(MAP_FLOOR, best.s);
    map.style.width = best.w + 'px';
    map.style.transform = s < 1 ? `scale(${s})` : '';
    fitBox.style.width = Math.ceil(best.w * s) + 'px';
    fitBox.style.height = Math.ceil(map.offsetHeight * s) + 'px';
    fitBox.style.marginLeft = fitBox.style.marginRight = best.w * s < availW ? 'auto' : '';
  }


  function applyMapState() {
    const nodes = $$('.node'); const paths = $$('#mapsvg .lk'); const bds = $$('#mapsvg .bd');
    nodes.forEach(n => { n.classList.remove('sel', 'dim', 'hit'); const c = $('.hitn', n); if (c) c.remove(); });
    paths.forEach(p => p.classList.remove('dim', 'hl')); bds.forEach(b => b.classList.remove('dim', 'on'));
    const toolsOn = !!(mapSel && mapSel.type === 'res'), toolsChanged = $('.maptools').hidden === toolsOn;
    $('.maptools').hidden = !toolsOn;
    if (toolsChanged && !$('#view-map').hidden) requestAnimationFrame(drawLinks); // (that row takes room from the map: it is fitted again)
    if (!mapSel) return;
    if (mapSel.type === 'page') {
      const id = mapSel.id; const near = new Set([id]);
      D.links.forEach(l => { if (l.src === id) near.add(l.dst); if (l.dst === id) near.add(l.src); });
      nodes.forEach(n => { if (n.dataset.p === id) n.classList.add('sel'); else if (!near.has(n.dataset.p)) n.classList.add('dim'); });
      paths.forEach(p => { if (p.dataset.a === id || p.dataset.b === id) p.classList.add('hl'); else p.classList.add('dim'); });
      bds.forEach(b => { if (!(b.dataset.a === id || b.dataset.b === id)) b.classList.add('dim'); });
    } else if (mapSel.type === 'link') {
      const l = LINK[mapSel.id];
      nodes.forEach(n => { if (n.dataset.p === l.src || n.dataset.p === l.dst) n.classList.add('sel'); else n.classList.add('dim'); });
      paths.forEach(p => { if (p.dataset.keys.split(' ').indexOf(l.key) >= 0) p.classList.add('hl'); else p.classList.add('dim'); });
      bds.forEach(b => { if (b.dataset.k === l.key) b.classList.add('on'); else b.classList.add('dim'); });
    } else if (mapSel.type === 'res') {
      const r = RES[mapSel.id];
      const cnt = {}; r.uses.forEach(u => { cnt[u.page] = (cnt[u.page] || 0) + 1; });
      nodes.forEach(n => {
        if (r.pages.indexOf(n.dataset.p) >= 0) {
          n.classList.add('hit');
          const s = document.createElement('span'); s.className = 'hitn'; s.textContent = cnt[n.dataset.p] || 0;
          s.title = (cnt[n.dataset.p] || 0) + ' steps on this page'; n.appendChild(s);
        } else n.classList.add('dim');
      });
      paths.forEach(p => p.classList.add('dim')); bds.forEach(b => b.classList.add('dim'));
    }
  }

  function mapReset() { mapSel = null; $('#hlSel').value = ''; applyMapState(); $('#mapPanel').innerHTML = overviewHtml(); bindPanel($('#mapPanel')); }
  function mapSelectPage(id) { mapSel = { type: 'page', id: id }; $('#hlSel').value = ''; applyMapState(); $('#mapPanel').innerHTML = pageCardHtml(PAGES[id], 'map'); bindPanel($('#mapPanel')); }
  function mapSelectLink(k) { mapSel = { type: 'link', id: k }; $('#hlSel').value = ''; applyMapState(); $('#mapPanel').innerHTML = linkCardHtml(LINK[k]); bindPanel($('#mapPanel')); }
  function mapHighlight(id) { mapSel = { type: 'res', id: id }; $('#hlSel').value = id; applyMapState(); $('#mapPanel').innerHTML = resCardHtml(RES[id], 'map'); bindPanel($('#mapPanel')); }

  function overviewHtml() {
    const first = D.pages.find(p => !p.empty);
    return `<h2>How the workflows join</h2>
      <p class="muted">Click a page to see it, or a letter to see what joins two pages.</p>
      <div class="btnrow"><button class="btn" data-go="#walk/${first.id}"><svg class="ic fill" viewBox="0 0 16 16" aria-hidden="true" style="margin-right:2px"><path d="M4.5 2.8v10.4L13 8z"/></svg>Walk through the flow</button></div>
      <p class="muted small">One step at a time, page after page. No scrolling or zooming.</p>`; // (the line "Built ... from the current drawings" went: the "Updated" line in the header says it, and says when it is no longer true)
  }

  function connectorsOfPage(p) {
    return p.connectors.map(c => CONN_BY_CELL[p.id + ':' + c.cell]).filter(Boolean);
  }

  function pageCardHtml(p, ctx) { return pageCardBase(p, ctx); }
  function pageCardBase(p, ctx) {
    if (p.empty) {
      return wfKick(p.wf) + `<h2>${esc(p.name)}</h2><p class="muted">${esc(p.note || 'This page has no lanes.')}</p>`;
    }
    const conns = connectorsOfPage(p);
    return `<h2>${esc(p.name)}</h2>
      <p class="muted small">${p.stats.steps} steps · ${p.stats.decisions} decisions</p>
      ${ctx === 'map' ? `<div class="btnrow"><button class="btn" data-go="#walk/${p.id}"><svg class="ic fill" viewBox="0 0 16 16" aria-hidden="true" style="margin-right:2px"><path d="M4.5 2.8v10.4L13 8z"/></svg>Walk through</button><button class="btn sec" data-go="#draw/${p.id}">Open the drawing</button></div>` : ''}
      ${conns.length ? `<h3>Connects to</h3><ul class="list">${conns.map(c => connItemHtml(c, ctx)).join('')}</ul>` : ''}`;
  }

  function connItemHtml(c, ctx) {
    const other = c.toPage ? PAGES[c.toPage] : null;
    const name = other ? (other.wf === PAGES[c.page].wf ? other.name : WF[other.wf].name + ' · ' + other.name) : (c.toWf ? WF[c.toWf].name : 'No page found');
    const link = D.links.find(l => (l.out === c.id || l.inn === c.id));
    const target = ctx === 'map' && link ? '#map/link/' + link.key : '#draw/' + c.page + '/' + enc(c.cell);
    const why = (link && link.carries) || c.carries || c.text; // the reason the two pages are joined (the receiving side's words), not the page's own name
    if (c.dir === 'out' && !c.partner && !c.toPage) // the drawing's own connector names a workflow but no page: nothing to open
      return `<li><div class="item off"><span class="l" style="display:flex;gap:8px;align-items:center">${letterHtml(c.letter)}<span>To ${esc(name)}: not linked to a page</span></span><span class="s">${esc(why)}</span></div></li>`;
    return `<li><button class="item" data-go="${target}"><span class="l" style="display:flex;gap:8px;align-items:center">${letterHtml(c.letter)}<span>${c.dir === 'out' ? 'To ' : 'From '}${esc(name)}</span></span><span class="s">${esc(why)}</span></button></li>`;
  }

  // The two pages a connector joins, with the reason on the arrow between them (owner, 18 Nov 2026, pressing connector D on the Big picture:
  // "management accounts received ... how does that link to the pricing, fee agreement, and discount request ... it's very unclear").
  // Before: the reason was the heading and the pages were two small rows, so "management accounts received" read as a thing with no link
  // to pricing. The reason is the receiving connector's own words (they say what has happened: "management accounts received").
  // here: the page that is open, marked.
  function handHtml(l, here) {
    const s = PAGES[l.src], t = PAGES[l.dst], why = l.carries && l.carries !== t.name && l.carries !== s.name ? l.carries : '';
    const box = (p, o) => `<div class="hp${here === p.id ? ' here' : ''}">${esc(pageLabel(p).replace(WF[p.wf].name + ' · ', o && o.wf === p.wf ? '' : WF[p.wf].name + ' · '))}${here === p.id ? '<span class="hh">this page</span>' : ''}</div>`;
    return `<div class="hand">${box(s, t)}<div class="ha"><svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v11M3.5 8.5 8 13l4.5-4.5"/></svg><span>${why ? esc(why) : 'continues on'}</span></div>${box(t, s)}</div>`;
  }

  function linkCardHtml(l) {
    const o = l.out ? CONN[l.out] : null, i = l.inn ? CONN[l.inn] : null;
    return `<div style="display:flex;align-items:center;gap:12px;margin:0 0 12px">${letterHtml(l.letter, true)}<h2 style="margin:0">Connector ${esc(l.letter || '')}</h2></div>
      ${handHtml(l, null)}
      <div class="btnrow">
        ${o ? `<button class="btn" data-go="#draw/${o.page}/${enc(o.cell)}">Go to ${esc(PAGES[o.page].name)}</button>` : ''}
        ${i ? `<button class="btn sec" data-go="#draw/${i.page}/${enc(i.cell)}">Go to ${esc(PAGES[i.page].name)}</button>` : ''}
      </div>`;
  }

  // ------------------------------------------------------------------ drawings
  const SVG = {}; const waiting = {};
  window.__page = function (id, svg) { SVG[id] = svg; (waiting[id] || []).forEach(f => f()); delete waiting[id]; };
  function fetchPage(id) {
    if (SVG[id]) return Promise.resolve();
    return new Promise((res, rej) => {
      (waiting[id] = waiting[id] || []).push(res);
      if (waiting[id].length > 1) return;
      const s = document.createElement('script'); s.src = 'pages/' + id + '.js?v=' + (D.build.v || '');
      s.onerror = () => { delete waiting[id]; rej(new Error('missing page ' + id)); };
      document.head.appendChild(s);
    });
  }
  let curPage = null, svgEl = null, ovl = null, selCell = null, natW = 1, natH = 1;
  const T = { s: 1, x: 0, y: 0 };
  let wPills = []; // the labels of a decision's answers, drawn on the picture; each keeps about the same size on screen at any zoom
  const vp = $('#viewport'), host = $('#svghost'), vscroll = $('#vscroll'), vthumb = $('#vthumb');

  // The page tabs sit below the drawing, as in draw.io. Built a third time on 18 Nov 2026 (owner: "I don't like the design of the footer
  // ... It's hard to see the processes that connects", then "A, three rows" of three designs shown as pictures): one row for each
  // workflow, every page with its number or letter and its name, the open page filled, and the pages joined to it by a connector in
  // purple, with "from" and "to" and the connector letters on a tag above the tab. Was: a switch for the three workflows and one row of
  // tabs for the open workflow only (the other workflows' pages were hidden); before that, three rows of bordered pills with no links.
  function buildPageList() {
    $('#pageList').style.setProperty('--cols', String(Math.max.apply(null, D.workflows.map(w => w.pages.length)))); // one column for each page of the longest workflow
    $('#pageList').innerHTML = D.workflows.map(w => `<div class="pgrow" data-wf="${esc(w.id)}"><span class="pgwf">${esc(w.name)}</span><div class="pgs" role="tablist" aria-label="Pages of ${esc(w.name)}">${w.pages.map(id => {
      const p = PAGES[id], tab = `<span class="pn">${esc(pageNo(p))}</span><span class="pt">${esc(pageShort(p))}</span>`;
      return p.empty ? `<button class="ptb" disabled title="${esc(p.note)}">${tab}</button>`
        : `<button class="ptb" role="tab" data-p="${id}" aria-selected="false" title="${esc(w.name + ' · ' + p.name)}">${tab}</button>`;
    }).join('')}</div></div>`).join('');
    $$('#pageList .ptb[data-p]').forEach(b => b.addEventListener('click', () => { go('#draw/' + b.dataset.p); })); // (the tray stays open when a page is picked from it)
  }

  // ---- the slim page bar (proposal, 19 Nov 2026): the three rows above stay as they were, but they open as a pop-up over the foot of the drawing
  // from the "All pages" button. The bar itself says which page is open, offers the previous and the next page of the workflow, and lists the
  // pages joined to this one (the same pages the tabs tint), so the joins can be seen and used without opening the rows.
  const pgDock = $('#pgDock'), pageListEl = $('#pageList'), pgAll = $('#pgAll'), pgCur = $('#pgCur'), pgChips = $('#pgChips'), pgMore = $('#pgMore');
  const pgPrev = $('#pgPrev'), pgNext = $('#pgNext'), pgJoin = $('.pgjoin', pgDock);
  function popOpen(on) {
    pageListEl.hidden = !on; pgAll.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) { const t = $('.ptb.on', pageListEl); if (t && t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'center' }); }
  }
  pgAll.addEventListener('click', () => popOpen(pageListEl.hidden));
  pgMore.addEventListener('click', () => popOpen(true));
  // The tray used to close when anything outside it was pressed (also when the drawing was dragged) and on Esc. It stays open now until the
  // "All pages" button is pressed again, for people who want it open while they go through the workflow (owner, 20 Nov 2026: "do not make it
  // disappear when I click away from it"). Esc is left to the other things it closes (a comment's change, the "Open in ...?" question).
  [pgPrev, pgNext].forEach(b => b.addEventListener('click', () => { if (b.dataset.p) go('#draw/' + b.dataset.p); }));
  pgChips.addEventListener('click', e => { const c = e.target.closest('.pgchip'); if (c) go('#draw/' + c.dataset.p); });
  function paintPgBar(id) {
    const p = PAGES[id]; if (!p) return;
    pgCur.innerHTML = `<span class="pgtag">${esc(pageTag(p) || WF[p.wf].name)}</span><span class="pgname">${esc(pageShort(p))}</span>`;
    pgCur.title = pageLabel(p);
    const list = WF[p.wf].pages.filter(x => PAGES[x] && !PAGES[x].empty), i = list.indexOf(id);
    [[pgPrev, list[i - 1], 'Previous page'], [pgNext, list[i + 1], 'Next page']].forEach(a => {
      const b = a[0], t = a[1] && PAGES[a[1]];
      b.disabled = !t; b.dataset.p = t ? t.id : ''; b.title = t ? a[2] + ': ' + t.name : a[2];
    });
    const joined = D.pages.filter(q => curLinks[q.id] && q.id !== id && !q.empty);
    pgChips.innerHTML = joined.map(q => `<button class="pgchip" type="button" data-p="${esc(q.id)}" title="${esc(pageLabel(q) + ' (joined to this page by a connector)')}"><b>${esc(pageTag(q))}</b><span>${esc(pageShort(q))}</span></button>`).join('')
      || '<span class="pgnone">no other page</span>';
    markLinkTabs(); fitChips();
  }
  function fitChips() { // as many chips as fit the bar; the rest are counted in "+N", which opens all the pages
    const cs = $$('.pgchip', pgChips); cs.forEach(c => { c.hidden = false; }); pgMore.hidden = true;
    const W = pgJoin.clientWidth - ($('.pgjl', pgJoin).offsetWidth + 8);
    if (!cs.length || W <= 0) return;
    const gap = 6, reserve = 46, ws = cs.map(c => c.offsetWidth);
    if (ws.reduce((a, b) => a + b, 0) + gap * (cs.length - 1) <= W) return;
    let used = 0, shown = 0;
    for (let i = 0; i < cs.length; i++) { const w = ws[i] + (i ? gap : 0); if (used + w > W - reserve) break; used += w; shown++; }
    cs.forEach((c, i) => { c.hidden = i >= shown; });
    pgMore.hidden = false; pgMore.textContent = '+' + (cs.length - shown); pgMore.title = (cs.length - shown) + ' more joined pages: open all pages';
  }
  // The tabs carry no connector letters any more (owner, 18 Nov 2026: "maybe you can just highlight the tabs involved instead of putting
  // that to A to P. What does that mean?"). Nothing chosen: the tabs of the pages joined to the open page are tinted purple. A connector
  // chosen: only the tab that connector leads to (or comes from) is lit, and the other tints go out, so the bar shows just what was pressed.
  let curLinks = {};
  function pageLinks(id) { // the other pages joined to a page by a pair of connectors
    const m = {};
    D.connectors.forEach(c => {
      if (c.page !== id || !c.partner || !CONN[c.partner]) return;
      const op = CONN[c.partner].page; if (op !== id) m[op] = true;
    });
    return m;
  }
  function markTab(id) {
    const p = PAGES[id], wf = p ? p.wf : null;
    curLinks = pageLinks(id);
    $$('#pageList .pgrow').forEach(r => r.classList.toggle('cur', r.dataset.wf === wf));
    $$('#pageList .ptb[data-p]').forEach(b => {
      const on = b.dataset.p === id;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
      const q = PAGES[b.dataset.p], wn = WF[q.wf].name + ' · ' + q.name;
      b.title = !on && curLinks[b.dataset.p] ? wn + ' (joined to this page by a connector)' : wn;
    });
    paintPgBar(id); // (calls markLinkTabs)
    const on = $('#pageList .ptb.on'), g = $('#pageList'); // on a narrow screen the bar scrolls sideways: bring the open tab into view
    if (on && g.scrollWidth > g.clientWidth + 1) g.scrollLeft = on.getBoundingClientRect().left - g.getBoundingClientRect().left + g.scrollLeft - (g.clientWidth - on.offsetWidth) / 2;
  }
  function markLinkTabs() { // nothing chosen: tint every joined page. Something chosen: light only the pages it leads to (none for a plain step or a file)
    const p = PAGES[curPage], it = p && selCell ? p.cells[selCell] : null;
    let aim = null;
    if (it) {
      const to = k => { const t = k && hoTarget(curPage, k.cell); return t ? t.to : null; };
      aim = it.kind === 'connector' ? [to(CONN_BY_CELL[curPage + ':' + selCell])]
        : ['excel', 'document', 'system'].indexOf(it.kind) >= 0 ? [] : connectorsNear(p, selCell).map(to);
    }
    $$('#pageList .ptb[data-p]').forEach(b => {
      const id = b.dataset.p;
      b.classList.toggle('aim', !!aim && aim.indexOf(id) >= 0);
      b.classList.toggle('link', !aim && !!curLinks[id] && id !== curPage);
    });
    $$('.pgchip', pgChips).forEach(c => { // the same on the slim bar: lit when it is where the chosen connector leads, plain when something else is chosen
      c.classList.toggle('aim', !!aim && aim.indexOf(c.dataset.p) >= 0);
      c.classList.toggle('dim', !!aim && aim.indexOf(c.dataset.p) < 0);
    });
  }

  // opts.hold: the caller brings the new picture in itself (a hand-off over a connector), so it is left hidden and not fitted to the width
  function openPage(id, opts) {
    opts = opts || {};
    if (curPage === id && svgEl) return Promise.resolve();
    curPage = id; selCell = null; rvHide();
    stk = null; stick.hidden = true; // the pinned headers of the page that is being left
    hoClose(); // a question about a connector of the page that is being left
    markTab(id);
    const p = PAGES[id];
    // the old drawing fades out while the new one loads, and the new one fades in (no blank flash between pages)
    if (!host.firstChild) { host.innerHTML = ''; } else host.classList.add('swap');
    svgEl = null; $('#loading').hidden = false;
    updMini(); // (the overview of the page that is being left goes at once)
    renderDraw();
    return fetchPage(id).then(() => {
      if (curPage !== id) return;
      $('#loading').hidden = true;
      host.innerHTML = SVG[id];
      svgEl = host.querySelector('svg');
      natW = parseFloat(svgEl.getAttribute('width')) || svgEl.viewBox.baseVal.width;
      natH = parseFloat(svgEl.getAttribute('height')) || svgEl.viewBox.baseVal.height;
      host.style.width = natW + 'px'; host.style.height = natH + 'px';
      miniPage(id); // the page in miniature, for the overview
      Object.keys(p.cells).forEach(cid => { const g = cellG(cid); if (g) g.classList.add('hot'); });
      revPrepare(p); // the rows of Manager's comments and her pink tags can be pressed
      ovl = document.createElementNS('http://www.w3.org/2000/svg', 'g'); ovl.setAttribute('id', 'pe-ovl'); svgEl.appendChild(ovl);
      buildStick();
      fit();
      H.page.forEach(f => f(id));
      renderDraw();
      preloadLinked(id); // the pages joined to this one are fetched in idle time, so that a hand-off does not wait for the next picture
      if (!opts.hold) requestAnimationFrame(() => host.classList.remove('swap'));
    }).catch(() => { host.classList.remove('swap'); $('#loading').hidden = false; $('#loading').textContent = 'This page has no picture yet. Run the build again.'; });
  }
  function cellG(id) { return svgEl ? svgEl.querySelector('g[data-cell-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]') : null; }
  function apply() { host.style.transform = `translate(${T.x}px,${T.y}px) scale(${T.s})`; if (wPills.length) placePills(); updStick(); updScroll(); updMini(); H.apply.forEach(f => f()); }

  // ---- the lane headers stay in view (owner, 18 Nov 2026: "hard code the headers in the swim lane diagram so that when I scroll, I can see
  // the headers wherever I go"). The bars of every lane (INTERNAL or EXTERNAL, the department, the role) are copied, bars only, into a strip
  // above the picture. The strip shows when the real bars have moved off the top; it follows the picture sideways and in size. It is not
  // shown during a walk through or a hand-off (those move the picture themselves), when the bars would take over 40% of the window's
  // height (zoomed far in), or when the page's end has gone past the top.
  const stick = $('#stick'), stickIn = $('#stickIn');
  // The strip is ONE thin tier now (proposal, 19 Nov 2026): the lane titles (the roles) only, 24 px high with 12 px text at any zoom. It was a copy
  // of the three tiers of bars (INTERNAL or EXTERNAL, the department, the role) and grew with the zoom: 22 px at "Fit width", 52 px at 85%,
  // 80 px at 130%. The colour of each lane already says the department. It shows once the lane titles of the drawing itself have gone off the
  // top; it follows the picture sideways and in size; each title slides to stay in view. Pressing a title opens the lane card.
  const STRIP_H = 24;
  let stk = null; // { y0, y1, ylow0, lanes: [{ el, t, x0, x1 }] }: the lane bars' top and bottom in drawing units, and the strip's lanes
  function buildStick() {
    stickIn.innerHTML = ''; stk = null; stick.hidden = true;
    const p = PAGES[curPage]; if (!svgEl || !p || p.empty) return;
    const lanes = []; let ylow0 = Infinity, ylow1 = -Infinity;
    Object.keys(p.laneById).forEach(id => {
      const g = cellG(id); if (!g) return;
      const kids = Array.from(g.children).filter(k => !k.hasAttribute('data-cell-id')); // the lane bar's own shape and label; the cells inside the lane are left out
      const hp = kids[0] && kids[0].querySelector('path');
      const n = hp && (hp.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g);
      if (!n || n.length < 8 || +n[1] <= +n[3]) return; // a header drawn as M x bottom L x top L x2 top L x2 bottom
      ylow0 = Math.min(ylow0, +n[3]); ylow1 = Math.max(ylow1, +n[1]);
      const ln = p.laneById[id], el = document.createElement('div'), t = document.createElement('i');
      el.className = 'stl'; el.setAttribute('data-lane', id); el.style.background = col(ln.color); el.title = ln.title;
      t.textContent = ln.title; el.appendChild(t); stickIn.appendChild(el);
      lanes.push({ el: el, t: t, x0: +n[0], x1: +n[4] });
    });
    if (!lanes.length || !(ylow1 > ylow0)) { stickIn.innerHTML = ''; return; }
    stk = { y0: ylow0, y1: ylow1 + 1, ylow0: ylow0, lanes: lanes };
  }
  function updStick() {
    if (!stk || walk || hoBusy || view !== 'draw') { stick.hidden = true; return; }
    const s = T.s, show = T.y + stk.ylow0 * s < 0 && T.y + natH * s > STRIP_H + 10; // the drawing's own lane titles have gone off the top, and the page's end has not
    stick.hidden = !show;
    if (!show) return;
    stick.style.top = '0px'; stick.style.height = STRIP_H + 'px'; stick.classList.add('pin');
    stickIn.style.left = T.x + 'px'; stickIn.style.width = natW * s + 'px';
    const vx0 = -T.x / s, vx1 = (vp.clientWidth - T.x) / s;
    stk.lanes.forEach(b => {
      b.el.style.left = (b.x0 * s) + 'px'; b.el.style.width = ((b.x1 - b.x0) * s) + 'px';
      const a = Math.max(b.x0, vx0), c = Math.min(b.x1, vx1); // the part of the lane that is in the window: the title is centred in it
      if ((c - a) * s < 24) { b.t.style.display = 'none'; return; }
      b.t.style.display = ''; b.t.style.left = ((a - b.x0) * s) + 'px'; b.t.style.width = ((c - a) * s) + 'px';
    });
  }
  function placePills() { const k = Math.min(10, Math.max(0.3, 1 / T.s)); wPills.forEach(q => q.g.setAttribute('transform', `translate(${q.x},${q.y}) scale(${k})`)); } // (the floor was 0.7: zoomed in past 1.4 times, the tag grew with the picture)
  function fit() { // the picture as wide as the window (the "Whole page" button and its fit were taken out at the owner's word, 18 Nov 2026)
    if (wAnim) wFinish(); // a move of the walk through is finished at once when the reader takes over
    const w = vp.clientWidth;
    T.s = Math.min(1.2, (w - 40) / natW);
    T.x = (w - natW * T.s) / 2; T.y = 20;
    apply();
  }
  function zoomAt(f, px, py) {
    if (wAnim) wFinish();
    const ns =Math.max(0.04, Math.min(3, T.s * f));
    T.x = px - (px - T.x) * (ns / T.s); T.y = py - (py - T.y) * (ns / T.s); T.s = ns; apply();
  }
  $('#zIn').addEventListener('click', () => { takeOver(); zoomAt(1.25, vp.clientWidth / 2, vp.clientHeight / 2); });
  $('#zOut').addEventListener('click', () => { takeOver(); zoomAt(0.8, vp.clientWidth / 2, vp.clientHeight / 2); });
  $('#zFit').addEventListener('click', () => { takeOver(); fit(); });

  // ---- the side scroll bar (owner, 18 Nov 2026: "add a scroll at the side so users know that they're scrolling up or down").
  // The picture is moved with a transform, so the window has no scroll bar of its own: this one is drawn from T and moves T when it is
  // dragged. Its thumb shows where the window is on the page (top to bottom) and how much of the page it holds. The range is the page's
  // height at this zoom, plus SCR_M pixels of room above and below (fit() leaves 20 above). Hidden when the whole page fits.
  const SCR_M = 40, SCR_PAD = 6; // room above and below the page; the track's gap to the window's top and bottom (CSS: .vscroll)
  function scrGeom() {
    const h = vp.clientHeight, total = natH * T.s + 2 * SCR_M, track = h - 2 * SCR_PAD;
    if (!h || !svgEl || total <= h + 1 || track < 60) return null;
    const th = Math.max(36, Math.min(track, Math.round(track * h / total)));
    return { h: h, total: total, track: track, th: th, room: track - th, span: total - h };
  }
  function updScroll() {
    const g = scrGeom();
    vscroll.hidden = !g;
    if (!g) return;
    const pos = Math.min(1, Math.max(0, (SCR_M - T.y) / g.span)); // 0 at the page's top, 1 at its bottom
    vthumb.style.height = g.th + 'px';
    vthumb.style.transform = `translateY(${(pos * g.room).toFixed(1)}px)`;
  }
  vscroll.addEventListener('pointerdown', e => {
    e.stopPropagation(); // not a pan of the picture, not a press on the drawing
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const g = scrGeom(); if (!g) return;
    takeOver();
    if (e.target === vthumb) {
      const y0 = e.clientY, top0 = (Math.min(1, Math.max(0, (SCR_M - T.y) / g.span))) * g.room;
      vscroll.classList.add('drag');
      try { vthumb.setPointerCapture(e.pointerId); } catch (err) { /* a pointer that is already gone */ }
      const mv = ev => { const k = g.room > 0 ? Math.min(1, Math.max(0, (top0 + ev.clientY - y0) / g.room)) : 0; T.y = SCR_M - k * g.span; apply(); };
      const up = () => { vscroll.classList.remove('drag'); vthumb.removeEventListener('pointermove', mv); vthumb.removeEventListener('pointerup', up); vthumb.removeEventListener('pointercancel', up); };
      vthumb.addEventListener('pointermove', mv); vthumb.addEventListener('pointerup', up); vthumb.addEventListener('pointercancel', up);
    } else { // a press on the track moves the page by a window's height, towards the press (as a scroll bar does)
      const tb = vthumb.getBoundingClientRect();
      T.y += e.clientY < tb.top ? g.h * 0.9 : -g.h * 0.9; apply();
    }
    e.preventDefault();
  });
  ['pointerup', 'click', 'dblclick'].forEach(t => vscroll.addEventListener(t, e => e.stopPropagation())); // the window below must not read these as a press on the drawing
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    takeOver();
    const r = vp.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
    else { const k = e.deltaMode === 1 ? 30 : 1; T.x -= (e.shiftKey ? e.deltaY : e.deltaX) * k; T.y -= (e.shiftKey ? 0 : e.deltaY) * k; apply(); }
  }, { passive: false });

  // ---- preload (19 Nov 2026): once a page is on screen, the pages joined to it by a connector are fetched in idle time, one at a time, so that a
  // hand-off finds the next picture already here and does not show an empty window while it loads. Nothing is fetched on a "save data" connection.
  let preRun = 0;
  function preloadLinked(id) {
    const run = ++preRun;
    if (navigator.connection && navigator.connection.saveData) return;
    const todo = Object.keys(pageLinks(id)).filter(x => PAGES[x] && !PAGES[x].empty && !SVG[x]);
    const idle = f => (window.requestIdleCallback ? window.requestIdleCallback(f, { timeout: 3000 }) : setTimeout(f, 400));
    const next = () => { if (run !== preRun) return; const x = todo.shift(); if (x) fetchPage(x).then(() => idle(next), () => idle(next)); };
    idle(next);
  }

  // ---- the overview (19 Nov 2026): the page in miniature at the bottom right of the drawing window, with a thin frame for the part in view. Pressing or
  // dragging on it moves the view. It shows only while the page is bigger than the window at this zoom, never during a walk through or a hand-off, and its
  // icon button hides it (one small button in the same corner brings it back; the choice is kept in this browser). The overview is a plan drawn from the
  // page's own data: its lanes as bands and its boxes as small solid marks, each at least 3 px. (Owner, 19 Nov 2026: "it sometimes turns all white so I can't
  // see it when I'm on light mode". It used to be the page's picture shrunk to 150 by 200: the thin lines of a tall page disappeared, and the box came out empty.)
  const mini = $('#mini'), miniMap = $('#miniMap'), miniFrame = $('#miniFrame'), miniShow = $('#miniShow');
  const MINI_W = 150, MINI_H = 200;
  let miniOn = true; try { miniOn = localStorage.getItem('ape-mini') !== 'off'; } catch (e) { /* a private window: the choice lasts until the page is closed */ }
  let miniId = null, miniMs = 0, miniDrag = false, miniBuilt = null;
  function miniPage(id) { // the page that has just been put on screen: the old plan goes, the new one is drawn when the overview is first shown
    miniId = id; miniBuilt = null; miniMs = Math.min(MINI_W / natW, MINI_H / natH);
    miniMap.style.width = Math.round(natW * miniMs) + 'px'; miniMap.style.height = Math.round(natH * miniMs) + 'px';
    const old = $('.mmsvg', miniMap); if (old) old.remove();
  }
  function miniBuild() {
    const p = PAGES[miniId]; if (!p) return;
    const k = miniMs, w = Math.round(natW * k), h = Math.round(natH * k), f = v => (Math.round(v * 10) / 10);
    const xs = (p.lanes || []).map(l => l.x).sort((a, b) => a - b), kind = { decision: ' dec', connector: ' con', terminal: ' term', note: ' faint', label: ' faint' };
    let s = `<svg class="mmsvg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">`;
    xs.forEach((x, i) => { const x2 = i + 1 < xs.length ? xs[i + 1] : natW; s += `<rect class="mm-l${i % 2 ? ' alt' : ''}" x="${f(x * k)}" y="0" width="${f(Math.max(1 / k, x2 - x) * k)}" height="${h}"/>`; });
    Object.keys(p.cells || {}).forEach(id => {
      const it = p.cells[id], g = it.geo; if (!g || g.length < 4 || !(g[2] > 0) || !(g[3] > 0)) return;
      s += `<rect class="mm-c${kind[it.kind] || ''}" x="${f(g[0] * k)}" y="${f(g[1] * k)}" width="${f(Math.max(g[2] * k, 3))}" height="${f(Math.max(g[3] * k, 2.2))}" rx="1"/>`;
    });
    miniMap.insertAdjacentHTML('afterbegin', s + '</svg>');
    miniBuilt = miniId;
  }
  function updMini() {
    const ok = view === 'draw' && svgEl && miniId === curPage && !walk && !hoBusy && vp.clientHeight >= 320 && vp.clientWidth >= 420;
    const big = !!ok && (natW * T.s > vp.clientWidth + 1 || natH * T.s > vp.clientHeight + 1);
    mini.hidden = !(big && miniOn); miniShow.hidden = !(big && !miniOn);
    if (mini.hidden) return;
    if (miniBuilt !== miniId) miniBuild();
    const k = miniMs / T.s, mw = miniMap.clientWidth, mh = miniMap.clientHeight; // the frame: the part of the page that is in the window
    const x1 = Math.max(0, -T.x * k), y1 = Math.max(0, -T.y * k), x2 = Math.min(mw, (vp.clientWidth - T.x) * k), y2 = Math.min(mh, (vp.clientHeight - T.y) * k);
    miniFrame.style.left = x1 + 'px'; miniFrame.style.top = y1 + 'px'; miniFrame.style.width = Math.max(4, x2 - x1) + 'px'; miniFrame.style.height = Math.max(4, y2 - y1) + 'px';
  }
  function miniGo(e) { // the spot pressed comes to the middle of the window (the page's edges still stop the view, as for a box brought to the middle)
    const r = miniMap.getBoundingClientRect(), dx = (e.clientX - r.left) / miniMs, dy = (e.clientY - r.top) / miniMs;
    const c = clampXY(T.s, vp.clientWidth / 2 - dx * T.s, vp.clientHeight / 2 - dy * T.s); T.x = c.x; T.y = c.y; apply();
  }
  miniMap.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault(); e.stopPropagation(); takeOver(); miniDrag = true;
    try { miniMap.setPointerCapture(e.pointerId); } catch (x) { /* a pointer that is already gone */ }
    miniGo(e);
  });
  miniMap.addEventListener('pointermove', e => { if (miniDrag) { e.stopPropagation(); miniGo(e); } });
  const miniEnd = e => { if (miniDrag) { miniDrag = false; e.stopPropagation(); } };
  miniMap.addEventListener('pointerup', miniEnd); miniMap.addEventListener('pointercancel', miniEnd);
  [mini, miniShow].forEach(el => ['pointerdown', 'pointerup', 'click', 'dblclick'].forEach(t => el.addEventListener(t, e => e.stopPropagation()))); // not a press on the drawing
  const miniSet = on => { miniOn = on; try { localStorage.setItem('ape-mini', on ? 'on' : 'off'); } catch (e) { /* the choice lasts until the page is closed */ } updMini(); };
  $('#miniHide').addEventListener('click', () => miniSet(false));
  miniShow.addEventListener('click', () => miniSet(true));

  // The window has overflow hidden and the picture is moved with a transform; if a browser scrolls it anyway (for example to bring a
  // focused button into view), the picture and the pinned headers would sit out of place, so it is put back at once.
  vp.addEventListener('scroll', () => { if (vp.scrollTop || vp.scrollLeft) { vp.scrollTop = 0; vp.scrollLeft = 0; } });
  const ptrs = new Map(); let drag = null, pinch = null;
  vp.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    takeOver();
    vp.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, tx: T.x, ty: T.y, moved: false, target: e.target };
    if (ptrs.size === 2) { const [a, b] = Array.from(ptrs.values()); pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: T.s }; drag = null; }
  });
  vp.addEventListener('pointermove', e => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) {
      const [a, b] = Array.from(ptrs.values()); const r = vp.getBoundingClientRect();
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((pinch.s * d / pinch.d) / T.s, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      return;
    }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; vp.classList.add('drag'); }
      if (drag.moved) { T.x = drag.tx + dx; T.y = drag.ty + dy; apply(); }
      return;
    }
    if (e.pointerType === 'mouse') hover(e.target);
  });
  function endPtr(e) {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (drag && ptrs.size === 0) {
      vp.classList.remove('drag');
      if (!drag.moved && e.type === 'pointerup') clickAt(drag.target, e);
      drag = null;
    }
  }
  vp.addEventListener('pointerup', endPtr); vp.addEventListener('pointercancel', endPtr);
  vp.addEventListener('pointerleave', () => hover(null));
  // Dragging moves the drawing, so the browser must not also start selecting its text (owner, 20 Nov 2026: "when I drag across the drawings, it gets
  // highlighted automatically"). The style sheet says the same with user-select; this covers a browser that ignores it.
  vp.addEventListener('selectstart', e => { const n = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement); if (!(n && n.closest && n.closest('input, textarea'))) e.preventDefault(); });

  function hit(target) {
    if (!svgEl || !target || !target.closest) return null;
    const p = PAGES[curPage];
    const sl = target.closest('.stl'); // a lane title in the pinned strip is pressing the lane
    if (sl && p.laneById[sl.getAttribute('data-lane')]) return { type: 'lane', id: sl.getAttribute('data-lane') };
    let g = target.closest('g[data-cell-id]');
    while (g && (svgEl.contains(g) || stick.contains(g))) { // (the pinned header strip holds copies of the lane bars: pressing one is pressing the lane)
      const id = g.getAttribute('data-cell-id');
      if (p.cells[id]) return { type: 'cell', id: id };
      if (p.laneById[id]) return { type: 'lane', id: id };
      g = g.parentElement ? g.parentElement.closest('g[data-cell-id]') : null;
    }
    return null;
  }
  let hovId = null, hovBox = null;
  function hover(target) {
    const h = hit(target), rh = reviewHit(target); // (rh: a row of Manager's comments, or a pink tag of hers, under the pointer)
    const id = rh ? 'rv:' + rh.kind + rh.n : h && h.type === 'cell' ? h.id : null;
    if (id === hovId) return;
    hovId = id;
    vp.classList.toggle('rvpt', !!rh);
    if (hovBox) { hovBox.remove(); hovBox = null; }
    if (rh) hovBox = rvBox(rh, 'rvhov');
    else if (id && id !== selCell) hovBox = boxFor(id, 'hovbox');
  }
  // the outline of a cell's own shapes; the text frames draw.io writes are the size of the whole page, so they are left out
  function cellBox(id) {
    const g = cellG(id); if (!g) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    $$('path,rect,ellipse,circle,image,polygon,polyline,line,use', g).forEach(el => {
      if (el.closest('foreignObject')) return;
      let b; try { b = el.getBBox(); } catch (e) { return; }
      if (!b || (b.width === 0 && b.height === 0)) return;
      x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.width); y2 = Math.max(y2, b.y + b.height);
    });
    if (x1 === Infinity) return null;
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }
  function boxFor(id, cls) {
    if (!ovl) return null;
    const b = cellBox(id); if (!b) return null;
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    const pad = 6;
    r.setAttribute('x', b.x - pad); r.setAttribute('y', b.y - pad); r.setAttribute('width', b.width + 2 * pad); r.setAttribute('height', b.height + 2 * pad);
    r.setAttribute('rx', 8); r.setAttribute('class', cls); ovl.appendChild(r);
    return r;
  }
  function clickAt(target, ev) {
    if (walk && wClick(target)) return; // while walking, a click on a step moves the walk there
    if (hoBusy) { takeOver(); return; }  // a hand-off is on its way: a click cuts it short
    if (APE.onClick && APE.onClick(target, ev)) return; // the comment board: a pin, or a box or spot to comment on
    const rh = reviewHit(target); // a row of Manager's comments leads to the change, a pink tag of hers back to the comment
    if (rh) { rvGo(rh); return; }
    const h = hit(target);
    if (!h) { clearSel(); return; }
    if (h.type === 'cell') {
      history.replaceState(null, '', '#draw/' + curPage + '/' + enc(h.id));
      const it = PAGES[curPage].cells[h.id];
      if (it && it.kind === 'connector' && hoTarget(curPage, h.id)) hoAsk(curPage, h.id); // pressing a connector lights it and asks "Open in …?": the pages change only on Open
      else selectCell(h.id, false);
    }
    else { clearSel(); $('#drawPanel').innerHTML = laneCardHtml(PAGES[curPage], h.id); bindPanel($('#drawPanel')); showPanel(true); }
  }
  function clearSel() {
    selCell = null; if (ovl) ovl.innerHTML = ''; hovBox = null; hovId = null; rvHide();
    if (curPage) renderDraw();
    updHere();
  }
  // The panel beside a drawing is shown only while a box (or a lane) is chosen; with nothing chosen the drawing has the whole width
  // (owner, 18 Nov 2026: "Hide this right sidebar unless I press on something"). Clicking an empty part of the drawing, or Esc, hides it.
  // The picture keeps its place when the panel comes in; a chosen box that the panel would cover slides into view.
  function showPanel(on) {
    const v = $('#view-draw');
    if (v.classList.contains('nopanel') === !on) return;
    v.classList.toggle('nopanel', !on);
    updMini(); // (the window is narrower or wider now: the frame of the overview follows)
    const b = on && selCell && svgEl ? cellBox(selCell) : null;
    if (b) {
      const right = T.x + (b.x + b.width) * T.s, w = vp.clientWidth;
      if (right > w - 24) { T.x -= right - (w - 24); apply(); }
    }
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || walk || hoAsking || view !== 'draw' || ($('#view-draw').classList.contains('nopanel') && !selCell) || (APE.takeover && APE.takeover())) return;
    const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    clearSel(); showPanel(false);
    if (curPage) try { history.replaceState(null, '', '#draw/' + curPage); } catch (err) { /* the address just stays as it was */ }
  });
  function related(p, id) {
    const out = new Set();
    p.edges.forEach(e => { if (e.dashed) { if (e.s === id) out.add(e.t); if (e.t === id) out.add(e.s); } });
    const it = p.cells[id];
    if (it && ['excel', 'document', 'system'].indexOf(it.kind) >= 0) (SYM[p.id + ':' + id] || []).forEach(r => r.uses.forEach(u => { if (u.page === p.id) out.add(u.cell); }));
    out.delete(id);
    return Array.from(out).filter(x => p.cells[x]);
  }
  function selectCell(id, center) {
    const p = PAGES[curPage];
    if (!p.cells[id]) return;
    selCell = id; if (ovl) ovl.innerHTML = ''; hovBox = null; hovId = null; rvHide();
    renderDraw(); // the panel comes in first, so that the picture is placed in the room that is left
    related(p, id).forEach(x => boxFor(x, 'relbox'));
    if (center && p.cells[id].kind === 'connector') hoLight(id); // arriving at a connector: it lights up
    else boxFor(id, 'selbox');
    if (center) centerOn(id);
    updHere(); // the "Walk from here" button comes up above a pressed step
  }
  function centerOn(id) { const b = cellBox(id); if (b) centerOnBox(b); }
  function centerOnBox(b) {
    T.s = Math.max(T.s, Math.min(0.85, (vp.clientWidth - 60) / Math.max(b.width, 1)));
    T.x = vp.clientWidth / 2 - (b.x + b.width / 2) * T.s;
    T.y = vp.clientHeight / 2 - (b.y + b.height / 2) * T.s;
    const c = clampXY(T.s, T.x, T.y); T.x = c.x; T.y = c.y;
    apply();
  }
  // A box that is brought to the middle never leaves empty canvas past the page's edge (proposal, 19 Nov 2026: a box near the top or the left of a
  // page used to sit in the middle of the window with half of it blank). When the page is bigger than the window at this zoom its edge stops
  // CLAMP_M pixels in from the window's edge; when it is smaller it is centred. `bottom` is the lowest line the picture may show (the walk's card
  // covers the foot of the window). Only moves that centre something use it: dragging, the wheel and zooming stay free.
  const CLAMP_M = 20;
  function clampXY(s, x, y, bottom) {
    const w = vp.clientWidth, h = bottom == null ? vp.clientHeight : bottom, pw = natW * s, ph = natH * s, M = CLAMP_M;
    return { x: pw + 2 * M <= w ? (w - pw) / 2 : Math.min(M, Math.max(w - pw - M, x)),
             y: ph + 2 * M <= h ? (h - ph) / 2 : Math.min(M, Math.max(h - ph - M, y)) };
  }
  // ------------------------------------------------------------------ Manager's comments lead to the change
  // (owner, 19 Nov 2026: "for all the manager's comments ... When I click on it, it can straight away lead me to the change on the workflow")
  // The page's data (`review`, from extract.py) ties each row of the manager's table to the boxes that carry the same pink number. Pressing a row
  // (any of its four cells) brings the first of those boxes to the middle, with a pink ring on each of them and a bar at the foot of the
  // drawing that names the comment and steps from box to box; pressing a pink tag on a box leads back to its row. Nothing happens while a
  // walk through is on or while the comment board is being used. To take it out: this block, `revPrepare` in openPage, `reviewHit` and
  // `rvGo` in clickAt, `rvHide` in clearSel, selectCell, openPage and wLayout, the hover lines, #rvBar and the "Manager's comments" rules in style.css.
  const rvBar = $('#rvBar');
  let rv = null; // while a comment's change (or the comment itself) is shown: { n, mode: 'change' | 'comment' | 'none', i, ids }
  function revPrepare(p) {
    if (!p.review || !p.review.rows) return;
    if (!p.revIdx) {
      p.revIdx = {};
      Object.keys(p.review.rows).forEach(n => {
        const r = p.review.rows[n];
        (r.cells || []).forEach(id => { p.revIdx[id] = { n: n, kind: 'row' }; });
        (r.tags || []).forEach(id => { p.revIdx[id] = { n: n, kind: 'tag' }; });
      });
    }
    Object.keys(p.revIdx).forEach(id => {
      const g = cellG(id), m = p.revIdx[id]; if (!g) return;
      g.classList.add(m.kind === 'row' ? 'rv-row' : 'rv-tag');
      if (!g.querySelector(':scope > title')) {
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        t.textContent = m.kind === 'row' ? "Press to go to the change that Manager's comment " + m.n + ' asked for' : "Press to go to Manager's comment " + m.n;
        g.insertBefore(t, g.firstChild);
      }
    });
  }
  function reviewHit(target) { // a row of Manager's comments, or a pink tag, under a press or the pointer
    const p = PAGES[curPage];
    if (!p || !p.revIdx || !svgEl || !target || !target.closest || walk || hoBusy || (APE.takeover && APE.takeover())) return null;
    let g = target.closest('g[data-cell-id]');
    while (g && svgEl.contains(g)) {
      const id = g.getAttribute('data-cell-id'), m = p.revIdx[id];
      if (m) return { n: m.n, kind: m.kind, id: id };
      g = g.parentElement ? g.parentElement.closest('g[data-cell-id]') : null;
    }
    return null;
  }
  const rvRow = n => { const p = PAGES[curPage]; return p && p.review && p.review.rows ? p.review.rows[n] : null; };
  function rvUnion(ids) { // the outline of several cells together
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    ids.forEach(id => { const b = cellBox(id); if (!b) return; x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.width); y2 = Math.max(y2, b.y + b.height); });
    return x1 === Infinity ? null : { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }
  function rvRect(b, cls, pad) {
    if (!ovl || !b) return null;
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', b.x - pad); r.setAttribute('y', b.y - pad); r.setAttribute('width', b.width + 2 * pad); r.setAttribute('height', b.height + 2 * pad);
    r.setAttribute('rx', 8); r.setAttribute('class', cls); ovl.appendChild(r);
    return r;
  }
  function rvBox(h, cls) { // what lights up under the pointer: the whole row, or the tag
    const row = rvRow(h.n); if (!row) return null;
    return h.kind === 'row' ? rvRect(rvUnion(row.cells || []), cls, 2) : rvRect(cellBox(h.id), cls, 4);
  }
  function rvGo(h) { if (h.kind === 'row') rvChange(h.n, 0); else rvComment(h.n); }
  function rvChange(n, i) { // the boxes that carry the number: a ring on each, the one at i in the middle
    const row = rvRow(n); if (!row) return;
    const ids = (row.targets || []).filter(id => cellG(id));
    clearSel();
    if (!ids.length) { rv = { n: n, mode: 'none' }; rvBarShow(); return; } // a comment about the whole page: no one box carries it
    i = ((i % ids.length) + ids.length) % ids.length;
    ids.forEach((id, k) => { if (k !== i) rvRect(cellBox(id), 'rvbox', 8); });
    rvRect(cellBox(ids[i]), 'rvbox cur', 8); // the one in the middle goes on top
    rv = { n: n, mode: 'change', i: i, ids: ids };
    centerOn(ids[i]);
    rvBarShow();
  }
  function rvComment(n) { // from a pink tag back to the row of the comment
    const row = rvRow(n), b = row && rvUnion(row.cells || []); if (!b) return;
    clearSel();
    rvRect(b, 'rvbox cur', 4);
    rv = { n: n, mode: 'comment' };
    centerOnBox(b);
    rvBarShow();
  }
  function rvBarShow() {
    if (!rv) { rvBar.hidden = true; return; }
    const many = rv.mode === 'change' && rv.ids.length > 1;
    const say = rv.mode === 'change' ? (many ? 'Change ' + (rv.i + 1) + ' of ' + rv.ids.length : 'The change is on this box')
      : rv.mode === 'comment' ? 'The boxes it asked for carry this pink number' : 'It is about the whole page, so no one box carries it';
    rvBar.innerHTML = '<span class="rvn">' + esc(rv.n) + '</span><span class="rvt"><b>Manager\'s comment ' + esc(rv.n) + '</b><span>' + say + '</span></span>'
      + (many ? '<button class="rvbtn" type="button" data-a="prev" aria-label="Previous change" title="Previous change">◀</button><button class="rvbtn" type="button" data-a="next" aria-label="Next change" title="Next change">▶</button>' : '')
      + (rv.mode === 'change' ? '<button class="rvbtn" type="button" data-a="comment">Back to the comment</button>' : rv.mode === 'comment' ? '<button class="rvbtn" type="button" data-a="change">Go to the change</button>' : '')
      + '<button class="rvbtn x" type="button" data-a="close" aria-label="Close" title="Close">×</button>';
    rvBar.hidden = false;
  }
  function rvHide() { rv = null; if (rvBar) rvBar.hidden = true; }
  rvBar.addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b || !rv) return;
    const a = b.dataset.a, n = rv.n, i = rv.i || 0;
    if (a === 'next') rvChange(n, i + 1); else if (a === 'prev') rvChange(n, i - 1); else if (a === 'comment') rvComment(n); else if (a === 'change') rvChange(n, 0); else if (a === 'close') clearSel();
  });
  ['pointerdown', 'pointerup', 'click', 'dblclick'].forEach(t => rvBar.addEventListener(t, e => e.stopPropagation())); // not a press on the drawing
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && rv && view === 'draw' && !walk) { e.preventDefault(); clearSel(); } });

  function anchorFix(v, bottom) { // a view {s, cx, cy, ax, ay (x, y)} whose centre point (cx, cy) sits at the screen point (ax, ay): move that point so the page's edge stays out of the window
    const x = v.ax - v.cx * v.s, y = v.ay - v.cy * v.s, c = clampXY(v.s, x, y, bottom);
    v.ax += c.x - x; v.ay += c.y - y;
    if ('x' in v) { v.x = c.x; v.y = c.y; }
    return v;
  }

  function cellRef(p, id, extra) {
    const it = p.cells[id]; if (!it) return '';
    const ln = p.laneById[it.lane];
    const lab = it.kind === 'connector' ? 'Connector ' + (it.letter || '') + ': ' + short(it.text, 80) : short(it.text || it.name, 90);
    return `<li><button class="item" data-go="#draw/${p.id}/${enc(id)}"><span class="l">${extra || ''}${esc(lab)}</span><span class="s">${esc(ln ? ln.title : '')}</span></button></li>`;
  }

  // ---- the panel beside a drawing: only where the page's connectors lead. The comments that used to sit here were taken out
  // at the owner's word on 18 Nov 2026, and the page's notes cards the same day ("just leave the connect to part"); the notes
  // stay on the drawing itself.
  // a connector or a file box keeps one button to go further; any other box shows nothing extra
  function selStripHtml(p, id) {
    const it = id ? p.cells[id] : null; if (!it) return '';
    if (it.kind === 'connector') {
      const c = CONN_BY_CELL[p.id + ':' + id];
      const partner = c && c.partner ? CONN[c.partner] : null;
      const other = c && c.toPage ? PAGES[c.toPage] : null;
      const link = c ? D.links.find(l => l.out === c.id || l.inn === c.id) : null; // the pair of connectors: both pages, and why they are joined
      const title = link ? 'Connector ' + (it.letter || '') : (c && c.carries) || (partner && partner.carries) || 'Connector ' + (it.letter || '');
      const go = partner || other ? '' // the one way over is the question "Open in …?" that pressing the connector on the drawing asks; the card has no second "Go to" button (19 Nov 2026)
        : `<p class="muted small">${c && c.toWf ? 'Not linked: the drawing names the ' + esc(WF[c.toWf].name) + ' but no page in it.' : 'No matching connector found.'}</p>`;
      return `<div class="selcard"><div class="selh">${it.letter ? letterHtml(it.letter) : ''}<span>${esc(title)}</span></div>${link ? handHtml(link, p.id) : ''}${go}</div>`;
    }
    if (['excel', 'document', 'system'].indexOf(it.kind) >= 0) {
      const rs = SYM[p.id + ':' + id] || [];
      const r = rs.find(x => x.kind === it.kind) || rs[0];
      return `<div class="selcard"><div class="selh">${r ? kindIc(r.kind) : ''}<span>${esc(it.label || it.name || '')}</span></div>${r ? `<button class="btn" data-go="#files/${enc(r.id)}">Where it is used</button>` : ''}</div>`;
    }
    return '';
  }
  // The panel speaks only about what was pressed (owner, 18 Nov 2026, pressing connector A: "there's two connectors that show up at the right
  // side ... connectors A and connectors P, when we're not even discussing about connector P ... the logic of the flow of your build is
  // not good enough"). A connector: its own card, nothing else. A file box: its own card. A step or decision: only the connector(s) it is
  // drawn straight into or out of; a step with none opens no panel (the box is ringed and the drawing keeps the whole width).
  // The list of every connector on the page is gone: the page tabs below the drawing already tint the pages that are joined.
  function connectorsNear(p, id) {
    const out = [];
    p.connectors.forEach(c => {
      if (p.edges.some(e => (e.s === id && e.t === c.cell) || (e.t === id && e.s === c.cell))) {
        const k = CONN_BY_CELL[p.id + ':' + c.cell]; if (k && out.indexOf(k) < 0) out.push(k);
      }
    });
    return out;
  }
  function drawPanelHtml(p) {
    if (p.empty) return pageCardBase(p, 'draw');
    const it = selCell ? p.cells[selCell] : null;
    if (!it) return '';
    const strip = selStripHtml(p, selCell);
    if (strip) return strip; // a connector or a file box
    const near = connectorsNear(p, selCell);
    return near.length ? `<h3>Connects to</h3><ul class="list">${near.map(c => connItemHtml(c, 'draw')).join('')}</ul>` : '';
  }
  function renderDraw() {
    const p = PAGES[curPage]; if (!p) return;
    if (APE.takeover && APE.takeover()) { markLinkTabs(); return; } // the comment board has the panel
    const el = $('#drawPanel'), html = drawPanelHtml(p);
    el.innerHTML = html; bindPanel(el);
    showPanel(!!html); // (a page with no picture keeps its card in the panel)
    markLinkTabs(); // the page tabs follow what is chosen
  }

  function laneCardHtml(p, laneId) {
    const ln = p.laneById[laneId];
    const steps = Object.keys(p.cells).filter(id => p.cells[id].lane === laneId && ['step', 'decision', 'connector'].indexOf(p.cells[id].kind) >= 0);
    return `<p class="kicker">Role</p><h2>${esc(ln.title)}</h2>
      <h3>Steps (${steps.length})</h3><ul class="list">${steps.map(id => cellRef(p, id)).join('')}</ul>`;
  }

  // ------------------------------------------------------------------ files and systems
  const fstate = { kind: 'excel', q: '' };
  let selRes = null;
  const KINDS = [['excel', 'Excel files'], ['document', 'Documents'], ['system', 'Systems and channels'], ['group', 'Group chats']];
  function buildFiles() {
    const cnt = k => D.resources.filter(r => r.kind === k).length;
    $('#fKind').innerHTML = KINDS.map(([k, l]) => `<button data-k="${k}" class="${fstate.kind === k ? 'on' : ''}">${l} (${cnt(k)})</button>`).join('');
    $$('#fKind button').forEach(b => b.addEventListener('click', () => { fstate.kind = b.dataset.k; buildFiles(); }));
    renderFiles();
  }
  $('#fq').addEventListener('input', e => { fstate.q = e.target.value.toLowerCase(); renderFiles(); });
  function sizeFiles() { const t = $('#ftools'); if (t) $('#fbody').style.setProperty('--ftools-h', t.offsetHeight + 'px'); $('#fbody').style.height = window.innerWidth > 1100 ? `calc(100% - ${t.offsetHeight}px)` : ''; }
  function filtered() {
    let list = D.resources.filter(r => r.kind === fstate.kind);
    if (fstate.q) list = list.filter(r => r.name.toLowerCase().indexOf(fstate.q) >= 0 || (r.aka || []).some(a => a.toLowerCase().indexOf(fstate.q) >= 0)); // (other spellings count: a system's name may be typed another way or MPlex)
    return list;
  }
  function renderFiles() {
    const list = filtered();
    const body = $('#fbody');
    if (!list.length) { body.innerHTML = '<p class="muted" style="padding:18px">Nothing matches.</p>'; sizeFiles(); return; }
    body.innerHTML = `<table class="rtable"><thead><tr><th>Name</th><th class="n">Pages</th><th class="n">Workflows</th></tr></thead><tbody>${list.map(r =>
      `<tr data-id="${esc(r.id)}" class="${selRes === r.id ? 'on' : ''}"><td>${kindIc(r.kind)}<b style="font-weight:600">${esc(r.name)}</b></td><td class="n">${r.pages.length}</td><td class="n">${r.workflows.length}</td></tr>`).join('')}</tbody></table>`;
    $$('#fbody tr[data-id]').forEach(tr => tr.addEventListener('click', () => go('#files/' + enc(tr.dataset.id))));
    sizeFiles();
  }

  function fileOverview() {
    selRes = null; $$('#fbody tr').forEach(tr => tr.classList.remove('on'));
    $('#filePanel').innerHTML = `<h2>Files and systems</h2><p class="muted">Pick one to see where it is used.</p>`;
    bindPanel($('#filePanel'));
  }
  function selectRes(id) {
    selRes = id;
    const r = RES[id];
    if (KINDS.some(k => k[0] === r.kind) && fstate.kind !== r.kind) { fstate.kind = r.kind; buildFiles(); }
    $$('#fbody tr[data-id]').forEach(tr => tr.classList.toggle('on', tr.dataset.id === id));
    const tr = $$('#fbody tr[data-id]').find(t => t.dataset.id === id);
    if (tr) { // keep the row in view by moving the list itself, never the whole page
      const fb = $('#fbody'), top = tr.offsetTop, bottom = top + tr.offsetHeight;
      if (top < fb.scrollTop + 40) fb.scrollTop = Math.max(0, top - 40); else if (bottom > fb.scrollTop + fb.clientHeight) fb.scrollTop = bottom - fb.clientHeight;
    }
    $('#filePanel').innerHTML = resCardHtml(r); bindPanel($('#filePanel'));
  }

  // the first part of a description only, so the card stays short
  function brief(x) {
    let s = String(x || '').replace(/\s*\([^)]*\)/g, '').trim();
    s = s.split(/[;:]\s|\.\s/)[0].replace(/[.;:]+$/, '').trim();
    if (s.length > 100) s = s.slice(0, 99).replace(/\s+\S*$/, '') + '…';
    return s;
  }
  // A plain link to an Excel file makes SharePoint try to download it, and files that are view-only end on
  // "Access denied". "?web=1" opens the file in the browser instead (checked 17 Nov 2026 on 20 such files).
  const spOpen = u => /\.(xlsx|xlsm|xls)$/i.test(u) ? u + '?web=1' : u;
  function registerHtml(e) {
    if (!e) return '';
    const link = e.links && e.links[0];
    return `${e.what ? `<p class="muted">${esc(brief(e.what))}</p>` : ''}${link ? `<div class="btnrow"><a class="btn sec" href="${esc(spOpen(link.u))}" target="_blank" rel="noopener" title="${esc(link.t)}">${/forms\.(cloud\.microsoft|office\.com)/i.test(link.u) ? 'Open the form' : 'Open in SharePoint'}</a></div>` : ''}`;
  }

  // where a file sits, in a few words (the register's text without its long brackets)
  function whereText(r) {
    const w = r.register && r.register.where;
    if (!w || /^[–-]$/.test(w.trim()) || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(w.trim())) return r.kind === 'excel' && !r.register ? 'Not in the sources register' : '';
    let s = String(w).replace(/\s*\([^)]{26,}\)/g, '').replace(/\s*\([^)]*$/, '');
    s = s.split(/;\s|\.\s/).slice(0, 2).join('; ').replace(/[.;\s]+$/, '');
    if (s.indexOf(' › ') >= 0) { // a long SharePoint path: the site and the last folder
      const parts = s.split(/\s*›\s*/).filter(x => x && x !== '…' && !/^client folders/i.test(x));
      s = parts.length > 4 ? parts[0] + ' › … › ' + parts[parts.length - 1] : parts.join(' › ');
    }
    return s.length > 120 ? s.slice(0, 119).replace(/\s+\S*$/, '') + '…' : s;
  }
  // what a document holds: the numbered lines inside its symbol in the drawing
  function docItems(r) {
    const seen = new Set(), items = [];
    (r.symbols || []).forEach(s => {
      const c = PAGES[s.page] && PAGES[s.page].cells[s.cell];
      String((c && c.text) || '').split('\n').slice(1).forEach(l => {
        const m = /^\s*\d+\.\s*(.+)$/.exec(l);
        if (m && !seen.has(m[1])) { seen.add(m[1]); items.push(m[1]); }
      });
    });
    return items;
  }

  function resCardHtml(r, ctx) { // ctx 'map': the card sits beside the map, where "Show on the map" would do nothing, so it has no such button
    if (r.kind === 'register') return `<p class="kicker">Not in any drawing</p><h2>${esc(r.name)}</h2>${registerHtml(r.register)}`;
    // The page is named with its tag (AUD 1, AUD 2, CS A), so that "A. Onboarding" in one workflow and "A. Attestation" in another cannot be mixed up, and the
    // press opens the page at this file's box, with the steps that use it lit (owner, 18 Nov 2026: "of every click, is the flow clear?"; the
    // chip used to open the whole page and leave the reader to find the file among 100 boxes). Was: the page name only, the page opened at its start.
    const chip = pid => {
      const sy = (r.symbols || []).find(s => s.page === pid && PAGES[pid].cells[s.cell]);
      return `<button class="chip" data-go="#draw/${pid}${sy ? '/' + enc(sy.cell) : ''}" title="${sy ? 'Open this page at the ' + esc(r.name) : 'Open this page'}"><i class="wfdot wf-${esc(PAGES[pid].wf)}"></i>${esc(pageTag(PAGES[pid]))} · ${esc(pageShort(PAGES[pid]))}</button>`;
    };
    const shown = r.pages.slice(0, 6), rest = r.pages.slice(6);
    const where = (r.kind === 'excel' || r.kind === 'document') ? whereText(r) : '';
    const items = r.kind === 'document' ? docItems(r) : [];
    const hasDesc = r.register && r.register.what;
    return `<p class="kicker">${esc(KIND[r.kind])}</p><h2>${esc(r.name)}</h2>
      ${registerHtml(r.register)}
      ${where ? `<dl class="kv"><dt>Sits in</dt><dd>${esc(where)}</dd></dl>` : ''}
      ${r.kind === 'document' ? (items.length ? `<h3>What is in it</h3><ol class="items">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : (hasDesc ? '' : '<p class="muted small">The drawing does not list what is in it.</p>')) : ''}
      <h3>Used on ${r.pages.length} page${r.pages.length === 1 ? '' : 's'}</h3>
      <div>${shown.map(chip).join('')}${rest.length ? `<span class="more" hidden>${rest.map(chip).join('')}</span><button class="chip" data-more>+ ${rest.length} more</button>` : ''}</div>
      ${ctx === 'map' ? '' : `<div class="btnrow"><button class="btn" data-go="#map/res/${enc(r.id)}">Show on the map</button></div>`}`;
  }

  const SVGNS = 'http://www.w3.org/2000/svg';

  // ------------------------------------------------------------------ panel links and copy
  function bindPanel(el) {
    $$('[data-go]', el).forEach(b => b.addEventListener('click', e => { e.preventDefault(); go(b.dataset.go); }));
    $$('[data-ho]', el).forEach(b => b.addEventListener('click', () => { const a = b.dataset.ho.split('|'); if (a[0] === curPage && view === 'draw') handOff(a[0], a[1]); else go('#draw/' + a[0] + '/' + enc(a[1])); }));
    $$('[data-more]', el).forEach(b => b.addEventListener('click', () => { const m = $('.more', el); if (m) m.hidden = false; b.remove(); }));
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeResults(); });

  // ------------------------------------------------------------------ search
  const IDX = [];
  (function buildIndex() {
    D.pages.forEach(p => {
      IDX.push({ g: 'Pages', l: p.name, s: WF[p.wf].name, go: '#draw/' + p.id, h: (p.name + ' ' + WF[p.wf].name).toLowerCase(), w: 1 });
      Object.keys(p.cells).forEach(id => {
        const it = p.cells[id]; if (['step', 'decision', 'note', 'terminal'].indexOf(it.kind) < 0) return;
        const ln = p.laneById[it.lane];
        IDX.push({ g: 'Steps', l: short(it.text, 110), s: pageLabel(p) + ' · ' + (ln ? ln.title : ''), go: '#draw/' + p.id + '/' + enc(id), h: (it.text + ' ' + (ln ? ln.title + ' ' + ln.dept : '') + ' ' + p.name).toLowerCase(), w: 4 });
      });
    });
    D.links.forEach(l => IDX.push({ g: 'Connectors', l: 'Connector ' + (l.letter || '') + ': ' + (l.carries || ''), s: PAGES[l.src].name + ' → ' + PAGES[l.dst].name, go: '#map/link/' + l.key, h: ('connector ' + (l.letter || '') + ' ' + l.carries + ' ' + PAGES[l.src].name + ' ' + PAGES[l.dst].name).toLowerCase(), letter: (l.letter || '').toLowerCase(), w: 2 }));
    D.resources.forEach(r => IDX.push({ g: 'Files, systems and chats', l: r.name, s: KIND[r.kind] + (r.pages ? ' · ' + r.pages.length + ' page' + (r.pages.length === 1 ? '' : 's') : ''), go: '#files/' + enc(r.id), h: (r.name + ' ' + KIND[r.kind] + ' ' + (r.aka || []).join(' ') + ' ' + (r.register ? r.register.what + ' ' + r.register.name : '')).toLowerCase(), w: 3 }));
    const roles = {};
    D.pages.forEach(p => p.lanes.forEach(l => { (roles[l.title] = roles[l.title] || []).push(p); }));
  })();
  const q = $('#q'), resBox = $('#results'); let hits = [], hi = -1;
  q.addEventListener('input', search);
  q.addEventListener('focus', () => { if (q.value.trim()) search(); });
  q.addEventListener('keydown', e => {
    if (resBox.hidden) return;
    if (e.key === 'ArrowDown') { hi = Math.min(hits.length - 1, hi + 1); mark(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { hi = Math.max(0, hi - 1); mark(); e.preventDefault(); }
    else if (e.key === 'Enter' && hits[hi]) { pick(hits[hi]); }
  });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) closeResults(); });
  function closeResults() { resBox.hidden = true; }
  function search() {
    const v = q.value.trim().toLowerCase();
    if (!v) { closeResults(); return; }
    const toks = v.replace(/^connector\s+/, 'connector ').split(/\s+/);
    let m = IDX.filter(x => toks.every(t => x.h.indexOf(t) >= 0) || (x.letter && (v === x.letter || v === 'connector ' + x.letter)));
    m = m.map(x => ({ x: x, sc: x.w * 10 + ((x.letter && (v === x.letter || v === 'connector ' + x.letter)) ? -30 : 0) + (x.l.toLowerCase().indexOf(v) === 0 ? -3 : 0) })).sort((a, b) => a.sc - b.sc).map(o => o.x);
    const per = {}; hits = m.filter(x => { per[x.g] = (per[x.g] || 0) + 1; return per[x.g] <= (x.g === 'Steps' ? 30 : 8); });
    hi = hits.length ? 0 : -1;
    let html = '', last = '';
    hits.forEach((x, i) => {
      if (x.g !== last) { html += `<div class="grp">${esc(x.g)}${x.g === 'Steps' && per.Steps > 30 ? ` (first 30 of ${per.Steps})` : ''}</div>`; last = x.g; }
      html += `<button class="r" data-i="${i}"><span class="l">${esc(x.l)}</span><span class="s">${esc(x.s)}</span></button>`;
    });
    resBox.innerHTML = html || '<div class="none">No match. Try fewer words.</div>';
    resBox.hidden = false; mark();
    $$('.r', resBox).forEach(b => b.addEventListener('click', () => pick(hits[+b.dataset.i])));
  }
  function mark() { $$('.r', resBox).forEach((b, i) => b.classList.toggle('on', i === hi)); const on = $('.r.on', resBox); if (on) on.scrollIntoView({ block: 'nearest' }); }
  function pick(x) { closeResults(); q.blur(); go(x.go); }

  // ------------------------------------------------------------------ walk through
  // Goes through a drawing one step at a time. The picture glides to each step and a dot runs along the arrow;
  // a card at the bottom says what happens and offers Next and Back; at a decision every answer is on the picture and named on the card,
  // and one Next goes on (owner, 18 Nov 2026: no walking the answers one by one).
  // flow.js plans the route: the main path first, the other paths afterwards.
  const FG = window.FlowGraph;
  const REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const wbar = $('#walkbar'), walkBtn = $('#walkBtn');
  let walk = null, wlayer = null, wEdges = {}, wAnim = null, wAnimId = 0;
  const cssEsc = s => (window.CSS && CSS.escape ? CSS.escape(s) : s);
  const wease = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const mkSvg = (tag, attrs) => { const el = document.createElementNS(SVGNS, tag); Object.keys(attrs || {}).forEach(k => el.setAttribute(k, attrs[k])); return el; };

  function wGraph(pid) {
    if (!walk.graphs[pid]) {
      walk.graphs[pid] = FG.build(PAGES[pid], { isOutConn: id => { const c = CONN_BY_CELL[pid + ':' + id]; return !!(c && c.dir === 'out' && c.toPage); } });
    }
    return walk.graphs[pid];
  }

  // ---- motion: one timer moves the picture and the dot together
  function wTween(dur, step, done) {
    wFinish();
    if (REDUCE || dur <= 0) { step(1); if (done) done(); return; }
    const id = ++wAnimId;
    let t0 = null; // the time of the first frame, so that only one clock is used
    wAnim = { id: id, step: step, done: done };
    const frame = now => {
      if (!wAnim || wAnim.id !== id) return;
      if (t0 === null) t0 = now;
      const k = Math.max(0, Math.min(1, (now - t0) / dur));
      step(wease(k));
      if (k < 1) requestAnimationFrame(frame); else { const d = wAnim.done; wAnim = null; if (d) d(); }
    };
    requestAnimationFrame(frame);
  }
  function wFinish() { // a move that is still running jumps to its end (when the next one starts, or the reader takes over)
    if (!wAnim) return;
    const a = wAnim; wAnim = null; a.step(1); if (a.done) a.done();
  }

  // ---- the view: the first step big, and as many of the next ones as fit at a size that can be read
  function wSafe() { // the part of the picture that the card does not cover
    const vw = vp.clientWidth, vh = vp.clientHeight;
    const cardH = wbar.hidden ? 0 : wbar.offsetHeight + 26;
    const px = Math.min(56, vw * 0.06), top = 34, bot = Math.min(cardH + 18, vh * 0.6);
    return { x: px, y: top, w: Math.max(160, vw - 2 * px), h: Math.max(140, vh - top - bot) };
  }
  // ids[0] is the step itself, then the steps that follow it. The first nMust of them are always in the picture, however small that
  // makes it (at a decision, every answer must be seen); the others only if they fit at a size that can be read.
  function wFrame(ids, nMust) {
    const S = wSafe(), SMAX = 1, SMIN = 0.06, SREAD = 0.62, SFIRST = 0.45;
    const bs = ids.map(id => cellBox(id)).filter(Boolean);
    if (!bs.length) return null;
    const fitS = r => Math.min(SMAX, S.w / Math.max(40, r.x2 - r.x1), S.h / Math.max(40, r.y2 - r.y1));
    let r = { x1: bs[0].x, y1: bs[0].y, x2: bs[0].x + bs[0].width, y2: bs[0].y + bs[0].height }, s = fitS(r);
    for (let i = 1; i < bs.length; i++) {
      const b = bs[i], u = { x1: Math.min(r.x1, b.x), y1: Math.min(r.y1, b.y), x2: Math.max(r.x2, b.x + b.width), y2: Math.max(r.y2, b.y + b.height) }, us = fitS(u);
      if (i < (nMust || 1) || us >= (i === 1 ? SFIRST : SREAD)) { r = u; s = us; }
    }
    s = Math.max(SMIN, s);
    const cx = (r.x1 + r.x2) / 2, cy = (r.y1 + r.y2) / 2, ax = S.x + S.w / 2, ay = S.y + S.h / 2;
    return anchorFix({ s: s, x: ax - cx * s, y: ay - cy * s, cx: cx, cy: cy, ax: ax, ay: ay }, S.y + S.h + 14); // (the card covers the foot of the window: the page's end may come up to just above it)
  }
  // what the picture shows at the step the walk is on: the step and the next ones. At a split, every road as far as the shape where they
  // meet again, however far that makes the picture zoom out (owner, 18 Nov 2026: "you need to zoom out a little bit for all the paths to be
  // seen, but I want them to be seen"). At a decision with just one new road, every answer's step, so that the ways on are in view
  // together (an answer that leads back to a step already seen only if it fits).
  function wView(g, st) {
    const ch = FG.choices(g, st), fk = ch.fork, dec = g.nodes[st.cur].kind === 'decision' && ch.outs.length > 1;
    // the other ways into this step (the walk did not come by them) are lit too, and are in the picture when they fit at a size that can be read
    const ways = (g.inn[st.cur] || []).map(a => a.from).filter(id => id !== st.cur && !st.visited[id]);
    if (fk) { const ids = [st.cur].concat(fk.nodes, fk.join ? [fk.join] : []); return wFrame(ids.concat(ways), ids.length); }
    if (!dec) return wFrame([st.cur].concat(ch.outs.slice(0, 3).map(x => x.to), ways));
    const fresh = ch.outs.filter(o => !st.visited[o.to]).map(o => o.to), back = ch.outs.filter(o => st.visited[o.to]).map(o => o.to);
    return wFrame([st.cur].concat(fresh, back, ways), 1 + fresh.length);
  }
  function wCam(t) { // from where the picture is now to the view t; a long way goes out a little and back in, so the eye can follow
    const s0 = T.s, s1 = t.s, c0 = { x: (t.ax - T.x) / s0, y: (t.ay - T.y) / s0 };
    const dist = Math.hypot(t.cx - c0.x, t.cy - c0.y) * Math.min(s0, s1);
    const dip = Math.min(0.45, dist / Math.max(vp.clientWidth * 5, 1500)), l0 = Math.log(s0), l1 = Math.log(s1);
    return { dist: dist, step: k => {
      const s = Math.exp(l0 + (l1 - l0) * k) * (1 - dip * Math.sin(Math.PI * k));
      const cx = c0.x + (t.cx - c0.x) * k, cy = c0.y + (t.cy - c0.y) * k;
      T.s = s; T.x = t.ax - cx * s; T.y = t.ay - cy * s; apply();
    } };
  }
  function wDot(edgeId) { // a dot that runs along the arrow from one step to the next
    const el = wEdges[edgeId], pa = el && el.querySelector('path');
    if (!pa || REDUCE || !wlayer) return null;
    let len = 0; try { len = pa.getTotalLength(); } catch (e) { return null; }
    if (!len) return null;
    const dot = mkSvg('circle', { 'class': 'wdot' }); wlayer.appendChild(dot);
    return { dot: dot, set: k => { const pt = pa.getPointAtLength(len * k); dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y); dot.setAttribute('r', Math.max(7, Math.min(26, 9 / T.s))); } };
  }
  function wRing() { // a ring spreads out from the step the walk has arrived at
    if (!wlayer || !walk) return;
    const st = walk.states[walk.page], b = st && cellBox(st.cur);
    if (!b) return;
    $$('.wring', wlayer).forEach(x => x.remove());
    wlayer.appendChild(mkSvg('rect', { 'class': 'wring', x: b.x - 7, y: b.y - 7, width: b.width + 14, height: b.height + 14, rx: 10 }));
  }
  function wTravel(edgeId, target, o) {
    if (!target) return;
    const cam = wCam(target), run = (o.intro || !edgeId) ? null : wDot(edgeId);
    const dur = o.instant ? 0 : o.intro ? 900 : Math.round(Math.min(1300, Math.max(620, 520 + cam.dist * 0.42)));
    wTween(dur, k => { cam.step(k); if (run) run.set(k); }, () => { if (run) run.dot.remove(); wRing(); });
  }

  // ---- what is lit on the drawing: the steps seen, the road taken, the ways on from here
  function wAttach() { // after a page is on screen
    wEdges = {};
    const p = PAGES[curPage];
    (p.edgeIds || p.edges.map(e => e.id)).forEach(id => {
      if (!id) return;
      const el = svgEl.querySelector('g[data-cell-id="' + cssEsc(id) + '"]');
      if (el) { el.classList.add('pe-e'); wEdges[id] = el; }
    });
    host.classList.add('walking');
    wlayer = mkSvg('g', { id: 'pe-walk' }); svgEl.appendChild(wlayer);
  }
  function wDetach() {
    wFinish();
    host.classList.remove('walking');
    if (svgEl) { $$('.lit', svgEl).forEach(x => x.classList.remove('lit')); $$('.pe-e', svgEl).forEach(x => x.classList.remove('pe-e')); }
    if (wlayer) { wlayer.remove(); wlayer = null; }
    wEdges = {}; wPills = [];
  }
  function wPathD(id) { const el = id && wEdges[id], pa = el && el.querySelector('path'); return pa ? pa.getAttribute('d') : null; }
  function wPaint() {
    const pid = walk.page, p = PAGES[pid], g = wGraph(pid), st = walk.states[pid], ch = FG.choices(g, st);
    $$('.lit', svgEl).forEach(x => x.classList.remove('lit'));
    const lit = id => { const el = cellG(id); if (el) el.classList.add('lit'); };
    const litE = id => { const el = id && wEdges[id]; if (el) el.classList.add('lit'); };
    const fk = ch.fork; // two or more new roads: all of them are shown together, each in its own colour, as far as the shape where they meet
    Object.keys(st.visited).forEach(lit);
    ch.outs.forEach(o => { lit(o.to); litE(o.edge.id); });
    if (fk) { fk.nodes.forEach(lit); if (fk.join) lit(fk.join); fk.edges.forEach(a => litE(a.id)); }
    st.hist.forEach(m => { if (m.edge) litE(m.edge.id); (m.edges || []).forEach(a => litE(a.id)); });
    // every way into this step, also the ones the walk did not come by: the shape each arrow starts from, and the arrow (owner, 18 Nov 2026,
    // at "Collection PIC sends a final reminder letter" with connector M above it: "why is the connector blurred ... it has two paths leading up to it")
    (g.inn[st.cur] || []).forEach(a => { lit(a.from); litE(a.id); });
    // the files and systems of every step that is lit, with the dashed arrows to them: also the steps the answers lead to (owner, 20 Nov 2026,
    // at "Audit Team records the reason for the late start in the audit control log": "why isnt it highlighting the updating to the control
    // log part as well?"). Was: only the files of the step the walk stands on. A dashed arrow between two steps lights no step.
    const shown = new Set(Object.keys(st.visited).concat([st.cur], ch.outs.map(o => o.to), (g.inn[st.cur] || []).map(a => a.from), fk ? fk.nodes.concat(fk.join ? [fk.join] : []) : []));
    shown.forEach(id => related(p, id).forEach(x => { if (!g.nodes[x]) lit(x); }));
    p.edges.forEach(e => { if (e.dashed && (shown.has(e.s) || shown.has(e.t)) && !(g.nodes[e.s] && g.nodes[e.t])) litE(e.id); });
    wlayer.innerHTML = ''; wPills = [];
    const dec = !fk && ch.node.kind === 'decision' && ch.outs.length > 1; // a decision shows all its answers at once, each in its own colour
    st.hist.forEach(m => (m.edge ? [m.edge] : (m.edges || [])).forEach(a => { const d = wPathD(a.id); if (d) wlayer.appendChild(mkSvg('path', { 'class': 'wtrail', d: d })); }));
    if (!fk) ch.outs.forEach(o => { const d = wPathD(o.edge.id); if (d) wlayer.appendChild(mkSvg('path', { 'class': 'wnext' + (dec ? ' ' + wTone(o.label) : o.primary ? '' : ' alt'), d: d, 'data-i': o.i })); });
    const b = cellBox(st.cur);
    if (b) wlayer.appendChild(mkSvg('rect', { 'class': 'wcur', x: b.x - 7, y: b.y - 7, width: b.width + 14, height: b.height + 14, rx: 10 }));
    if (fk) wPaintFork(fk, b);
    if (dec) {
      ch.outs.forEach((o, n) => {
        const bb = cellBox(o.to); if (!bb) return;
        const tone = wTone(o.label), txt = wPillText(o.label, n);
        // the label goes on the side of the step that faces away from the decision, so that it never sits on the arrow
        const below = !!b && bb.y + bb.height / 2 > b.y + b.height / 2;
        wlayer.appendChild(mkSvg('rect', { 'class': 'wbr ' + tone, 'data-i': o.i, x: bb.x - 8, y: bb.y - 8, width: bb.width + 16, height: bb.height + 16, rx: 11 }));
        const gp = mkSvg('g', { 'class': 'wpill ' + tone, 'data-i': o.i });
        wPillAdd(gp, txt, below ? 'below' : 'above');
        wPills.push({ g: gp, x: bb.x - 8, y: below ? bb.y + bb.height + 8 : bb.y - 8 });
      });
      placePills();
    }
  }
  // every road of a split on the picture at once: a ring round each of its steps and an arrow in the road's colour, a label on the first
  // step of each road, and a dashed ring on the shape where they meet again. A shape that two roads reach is drawn in the plain colour.
  // green for YES, red for NO, and a colour of its own for each other answer (n, n2, n3, ...), so that the shapes of each road can be told apart
  const wForkTones = brs => { let k = 0; return brs.map(br => (/^yes\b/i.test(br.label) ? 'yes' : /^no\b/i.test(br.label) ? 'no' : (k++ ? 'n' + Math.min(k, 5) : 'n'))); };
  function wPaintFork(fk, b) {
    const tones = wForkTones(fk.branches);
    const toneOf = x => { const k = fk.owner[x]; return k >= 0 ? tones[k] : 'n'; };
    fk.edges.forEach(a => {
      const d = wPathD(a.id); if (!d) return;
      const k = fk.branches.findIndex(br => br.edge === a); // the arrow that leaves the split has its road's colour
      wlayer.appendChild(mkSvg('path', { 'class': 'wnext ' + (k >= 0 ? tones[k] : a.to === fk.join ? toneOf(a.from) : toneOf(a.to)), d: d }));
    });
    fk.nodes.forEach(x => { const bb = cellBox(x); if (bb) wlayer.appendChild(mkSvg('rect', { 'class': 'wbr ' + toneOf(x), x: bb.x - 8, y: bb.y - 8, width: bb.width + 16, height: bb.height + 16, rx: 11 })); });
    if (fk.join) { const bj = cellBox(fk.join); if (bj) wlayer.appendChild(mkSvg('rect', { 'class': 'wbr join', x: bj.x - 9, y: bj.y - 9, width: bj.width + 18, height: bj.height + 18, rx: 12 })); }
    fk.branches.forEach((br, n) => {
      const txt = wPillText(br.label, n), gp = mkSvg('g', { 'class': 'wpill ' + tones[n] });
      if (br.to === fk.join) { // a road that goes straight to the join has no step of its own: its label sits on the arrow
        const el = wEdges[br.edge.id], pa = el && el.querySelector('path'); let pt = null;
        try { if (pa) pt = pa.getPointAtLength(pa.getTotalLength() / 2); } catch (e) { pt = null; }
        if (!pt) return;
        wPillAdd(gp, txt, 'mid'); wPills.push({ g: gp, x: pt.x, y: pt.y });
        return;
      }
      const bb = cellBox(br.to); if (!bb) return;
      const below = !!b && bb.y + bb.height / 2 > b.y + b.height / 2; // the label goes on the side that faces away from the split, so that it never sits on the arrow
      wPillAdd(gp, txt, below ? 'below' : 'above');
      wPills.push({ g: gp, x: bb.x - 8, y: below ? bb.y + bb.height + 8 : bb.y - 8 });
    });
    placePills();
  }
  const wTone = lab => (/^yes\b/i.test(lab) ? 'yes' : /^no\b/i.test(lab) ? 'no' : 'n'); // green for YES, red for NO, purple for any other answer
  // An answer on the picture is a small tag (owner, 19 Nov 2026, at "Other sources" and "Via the Audit Team": "it's too big ... you can just
  // put a small box in it ... it's not in full text"): 10.5 px letters in a box 17 px high, which keeps about that size on screen at any zoom
  // (placePills), with the whole answer in it. Was: 13.5 px letters in a box 26 px high, an answer cut after 15 letters ("Via the Audit T…").
  const PILL_H = 17, PILL_GAP = 3;
  function wPillAdd(gp, txt, mode) { // mode: 'below' or 'above' the ring round a step, or 'mid' (a label on an arrow, centred on its point)
    const cy = mode === 'mid' ? 0 : mode === 'below' ? PILL_GAP + PILL_H / 2 : -(PILL_GAP + PILL_H / 2);
    const tx = mkSvg('text', { x: 0, y: cy + 0.5 }); tx.textContent = txt; gp.appendChild(tx);
    wlayer.appendChild(gp); // (it has to be on the page to be measured)
    let tw = 0; try { tw = tx.getComputedTextLength(); } catch (e) { tw = 0; }
    if (!(tw > 0)) tw = txt.length * 6.4;
    const w = Math.ceil(tw + 13), left = mode === 'mid' ? -w / 2 : 0;
    tx.setAttribute('x', left + w / 2);
    gp.insertBefore(mkSvg('rect', { x: left, y: cy - PILL_H / 2, width: w, height: PILL_H, rx: 5.5 }), tx);
  }
  function wPillText(lab, n) { // the label on the picture: the whole answer (YES and NO in capitals); the longest answer in the drawings has 22 letters
    const m = /^(yes|no)\b/i.exec(lab || ''); if (m) return m[1].toUpperCase();
    const t = String(lab || '').trim();
    return !t ? String(n + 1) : t.length > 40 ? t.slice(0, 39) + '…' : t;
  }
  function wPreview(i) { // pointing at an answer shows where it leads
    if (!walk || !wlayer) return;
    $$('.wpv', wlayer).forEach(x => x.remove());
    $$('.pv, .hv', wlayer).forEach(x => x.classList.remove('pv', 'hv'));
    if (i < 0) return;
    const g = wGraph(walk.page), st = walk.states[walk.page], a = g.out[st.cur][i], b = a && cellBox(a.to);
    const ring = $('.wbr[data-i="' + i + '"]', wlayer), pill = $('.wpill[data-i="' + i + '"]', wlayer);
    if (ring) { ring.classList.add('hv'); if (pill) pill.classList.add('hv'); }
    else if (b) wlayer.appendChild(mkSvg('rect', { 'class': 'wpv', x: b.x - 9, y: b.y - 9, width: b.width + 18, height: b.height + 18, rx: 12 }));
    const pa = $('.wnext[data-i="' + i + '"]', wlayer); if (pa) pa.classList.add('pv');
  }

  // ---- the card
  function wOthers() { // roads not taken yet: this page first, then the pages walked before (latest first)
    const res = [], done = {};
    [walk.page].concat(walk.order.filter(x => x !== walk.page).reverse()).forEach(pid => {
      if (done[pid] || !walk.states[pid]) return;
      done[pid] = 1;
      FG.others(wGraph(pid), walk.states[pid]).forEach(o => res.push(Object.assign({ page: pid }, o)));
    });
    return res;
  }
  function wPrev(g, id) { // a few words on what a way leads to
    const n = g.nodes[id]; if (!n) return '';
    if (n.kind === 'connector') {
      const c = CONN_BY_CELL[g.page.id + ':' + id], o = c && c.toPage ? PAGES[c.toPage] : null;
      return (c && c.dir === 'out' ? 'Continues in ' : 'Comes in from ') + (o ? pageShort(o) : short(n.text, 50));
    }
    return short(n.text, 170); // (was 80, which cut a third of the boxes in the middle of a sentence; 170 keeps 97 of 100 whole, and a row wraps)
  }
  // The other ways into a step that the reader has NOT seen and that are not in the picture the card is about to show: they are lit on the
  // drawing, but a long way off, so the card names them and a press goes there (owner, 18 Nov 2026: "Yes, add the line"; then, with her
  // screenshot of a page: "Also reached from, out of view ... that's so unclear"). A box that has been seen is never "another" way in: it is the
  // box the walk came from, or the end of a road of a split that was just shown. Found the same day: a split's move records no arrow, so the
  // box before it was offered as "also reached from" on 10 of the first 43 cards of the walk (the first two pages), and never a box the reader had
  // not seen. This is the same test as `wView`, which only adds unseen boxes to the picture. No step twice.
  function wFarWays(g, st) {
    const t = wView(g, st); if (!t) return [];
    const S = wSafe(), seen = {}, out = [];
    (g.inn[st.cur] || []).forEach(a => {
      if (a.from === st.cur || seen[a.from] || st.visited[a.from]) return;
      seen[a.from] = 1;
      const b = cellBox(a.from); if (!b) return;
      const x1 = t.x + b.x * t.s, x2 = x1 + b.width * t.s, y1 = t.y + b.y * t.s, y2 = y1 + b.height * t.s;
      if (x1 >= S.x - 4 && x2 <= S.x + S.w + 4 && y1 >= S.y - 4 && y2 <= S.y + S.h + 4) return; // it is in the picture
      out.push(a);
    });
    return out;
  }
  function wWay(id) { // the walk goes to a step that leads into this one, as when that step is pressed on the picture
    const w = walk; if (!w || w.busy) return;
    const g = wGraph(w.page), st = w.states[w.page];
    if (!g.nodes[id] || id === st.cur) return;
    FG.jump(g, st, { type: 'entry', id: id });
    w.stack.push({ page: w.page, kind: 'jump' });
    wShow({});
  }
  function wCard() {
    const pid = walk.page, p = PAGES[pid], g = wGraph(pid), st = walk.states[pid], ch = FG.choices(g, st), it = ch.node, lane = p.laneById[it.lane];
    const c = it.kind === 'connector' ? CONN_BY_CELL[pid + ':' + it.id] : null;
    const seen = Object.keys(st.visited).length, total = Math.max(1, g.ids.length - g.isolated.length);
    const olist = wOthers(), canBack = walk.stack.length > 1;
    // a hand-off to another page that was shown at a split, when nothing else of this page is left: the card goes straight over it
    const hand = olist[0] && olist[0].hand && olist[0].page === pid ? olist[0] : null, hc = hand ? CONN_BY_CELL[pid + ':' + hand.to] : null;
    const handPc = hc && hc.dir === 'out' && hc.partner ? CONN[hc.partner] : null;
    const others = olist.length - (handPc ? 1 : 0);
    const last = st.hist[st.hist.length - 1];
    const pname = o => (o.wf === p.wf ? o.name : WF[o.wf].name + ' · ' + o.name);
    const ar = '<span class="ar">▶</span>';
    const back = `<button class="wbtn" data-w="back"${canBack ? '' : ' disabled'}><span class="ar">◀</span>Back</button>`;
    const tip = walk.stack.length === 1 ? '<span class="wtip">Tip: the <kbd>←</kbd> <kbd>→</kbd> keys work too</span>' : '';
    let kind = '', head = '', sub = '', time = '', act = '';
    if (it.kind === 'decision') kind = '<span class="wkind dec">Decision</span>';
    else if (it.kind === 'terminal') kind = /^end/i.test(it.text || '') ? '<span class="wkind end">End</span>' : '<span class="wkind">Start</span>';
    else if (it.kind === 'connector') kind = '<span class="wkind go">Hand-off</span>';
    if (c) {
      const o = c.toPage ? PAGES[c.toPage] : null, nm = o ? pname(o) : (c.toWf ? WF[c.toWf].name : 'another page');
      head = `<div class="wlead">${letterHtml(c.letter, true)}<p class="wtxt">${c.dir === 'out' ? 'Continues in ' : 'Comes in from '}${esc(nm)}</p></div>`;
      const lost = c.dir === 'out' && !c.partner; // the drawing's own connector leads nowhere we can follow
      if (c.carries || lost) sub = `<p class="wsub">${esc(lost && c.carries ? c.carries.replace(/[.\s]*$/, '.') : (c.carries || ''))}${lost ? (c.carries ? ' ' : '') + 'The drawing does not name the page it continues on.' : ''}</p>`;
    } else {
      head = `<p class="wtxt">${esc(mainSentence(it.text))}</p>`;
      if (it.time) time = `<p class="wtime">Time: ${esc(it.time)}</p>`;
    }
    if (last && last.other && g.nodes[last.from]) { // reached from "Other paths": which answer of which step this road is
      sub = `<p class="wsub">Other path: ${last.edge.label ? '<b>' + esc(last.edge.label) + '</b> at ' : 'from '}“${esc(short(mainSentence(g.nodes[last.from].text), 70))}”</p>` + sub;
    }
    if (ch.end || ch.loop) {
      const pc = c && c.dir === 'out' && c.partner ? CONN[c.partner] : null;
      // an end says what it is, and how many other roads are left, so that "Other paths (4)" is no riddle (owner, 18 Nov 2026: "of every click, is
      // the flow clear?")
      const rest = others ? ' ' + others + (others === 1 ? ' other path is' : ' other paths are') + ' still to walk.' : '';
      if (ch.loop) sub += `<p class="wsub">This path leads back to a step you have already seen.${rest}</p>`;
      else if (it.kind === 'terminal') sub += `<p class="wsub">This path ends here.${rest}</p>`;
      else if (!c) sub += `<p class="wsub">The drawing stops here.${rest}</p>`;
      const done = !pc && !others && !handPc; // nothing left to follow from here
      if (done) {
        const left = D.pages.filter(x => !x.empty && !walk.states[x.id]).map(pageShort);
        sub += `<p class="wsub">${walk.order.length < 2 ? 'You have walked every path on this page.' : left.length ? 'That is everything connected to the pages you walked. Not walked yet: ' + esc(left.slice(0, 6).join('; ')) + (left.length > 6 ? '…' : '') + '.' : 'You have walked every page.'}</p>`;
      }
      const pri = pc ? 'cross' : handPc ? 'hand' : others ? 'others' : 'map';
      const btn = (a, label, cls) => `<button class="wbtn${pri === a ? ' pri wgo' : ''}${cls || ''}" data-w="${a}">${label}</button>`;
      act = back + (others ? btn('others', `Other paths (${others})`) : '') + btn('again', 'Start again') + (done ? btn('map', 'Back to the map') : '')
        + (pc ? btn('cross', `Continue to ${esc(pageShort(PAGES[pc.page]))} ${ar}`) : handPc ? btn('hand', `Continue to ${esc(pageShort(PAGES[handPc.page]))} ${ar}`) : '');
    } else if (ch.outs.length === 1) {
      act = back + tip + `<button class="wbtn pri wgo" data-w="take" data-i="${ch.outs[0].i}">Next ${ar}</button>`;
    } else if (ch.fork) { // a split: all the roads are on the picture, the card names them, and Next goes to where they meet
      const fk = ch.fork;
      // (owner, 18 Nov 2026: "you already show all the paths ... just go to the next process box that's involved")
      // No line explains the split or where Next goes (owner, 20 Nov 2026: "remove the explanation part in the boxes of the walkthrough").
      // Was: "Both answers are shown on the drawing. Next goes to where they meet: ..." / "This step starts 3 things at once, ...".
      // Each row is a button: a press takes that road and the picture zooms into its box (owner, 20 Nov 2026: "make the options in the
      // walkthrough selectable so that when i press one, it zooms into the process itself"); the roads not taken stay under "Other paths".
      const order = fk.branches.map((br, n) => ({ br: br, n: n })).sort((p, q) => (FG.rankOfLabel(p.br.label) - FG.rankOfLabel(q.br.label)) || (p.n - q.n)); // YES first, NO last
      const tones = wForkTones(fk.branches);
      const rows = order.map(o => `<button type="button" class="wpath pick" data-w="take" data-i="${o.br.i}" data-pv="${o.br.i}" title="Go to this box"><b class="${tones[o.n]}">${esc(o.br.label || String(o.n + 1))}</b><span>${esc(wPrev(g, o.br.to))}${o.br.edge.dashed ? ' (return path)' : ''}</span></button>`).join('');
      act = `<div class="wans info">${rows}</div><div class="wrow">${back}${tip}<button class="wbtn pri wgo" data-w="all">Next ${ar}</button></div>`;
    } else { // every way on is on the picture already, and only one leads somewhere new: the card names them and Next follows that one
      const dec = it.kind === 'decision', pri = ch.outs.find(o => o.primary) || ch.outs[0];
      // (no "Next follows YES." line, and each row is a button that goes to its box: owner, 20 Nov 2026, as above)
      const rows = ch.outs.slice().sort((p, q) => (FG.rankOfLabel(p.label) - FG.rankOfLabel(q.label)) || (p.i - q.i)).map((o, n) => `<button type="button" class="wpath pick" data-w="take" data-i="${o.i}" data-pv="${o.i}" title="Go to this box"><b${dec ? ' class="' + wTone(o.label) + '"' : ''}>${esc(o.label || String(n + 1))}</b><span>${esc(wPrev(g, o.to))}${o.dashed ? ' (return path)' : o.seen ? ' (seen already)' : ''}</span></button>`).join('');
      act = `<div class="wans info">${rows}</div><div class="wrow">${back}${tip}<button class="wbtn pri wgo" data-w="take" data-i="${pri.i}">Next ${ar}</button></div>`;
    }
    // another box that leads into this one and that the reader has not seen, off the screen (owner, 18 Nov 2026: "Also reached from, out of view
    // ... That's so unclear ... use clear indications"): a plain sentence, then the box's own words, with "Go to" so that the press is no surprise
    const far = wFarWays(g, st);
    const also = far.length ? `<div class="walso"><span class="wal">${far.length === 1 ? 'Another box also leads into this one, but it is off the screen:' : far.length + ' other boxes also lead into this one, but they are off the screen:'}</span>${far.slice(0, 3).map(a => `<button class="wchip" type="button" data-w="way" data-id="${esc(a.from)}" title="Go to this box: ${esc(mainSentence(g.nodes[a.from].text))}"><b>Go to</b><span>${esc(wPrev(g, a.from))}</span></button>`).join('')}${far.length > 3 ? `<span class="wmore">and ${far.length - 3} more (on the drawing, lit)</span>` : ''}</div>` : '';
    wbar.innerHTML = `<div class="wprog"><i style="width:${Math.min(100, Math.round(seen / total * 100))}%"></i></div>
      <div class="wbody"><div class="wk">${kind}<span class="who">${esc(lane ? lane.title : '')}</span><span class="no" title="Boxes seen so far on this page: steps, decisions, start and end shapes and hand-offs">${seen} of ${total} boxes seen</span></div>${head}${sub}${time}${also}</div>
      <div class="wact">${act}</div>`;
    const ae = document.activeElement; // keep the keyboard on the card, so that Enter or Space goes on
    if (!ae || ae === document.body || ae === walkBtn || wbar.contains(ae)) { const pb = $('.wbtn.pri', wbar); if (pb) pb.focus({ preventScroll: true }); }
  }

  // ---- moves
  function wUrl() { const st = walk.states[walk.page]; try { history.replaceState(null, '', '#walk/' + walk.page + '/' + enc(st.cur)); } catch (e) { /* the address just stays as it was */ } }
  function wShow(o) {
    o = o || {};
    const w = walk, pid = w.page, g = wGraph(pid), st = w.states[pid];
    wPaint(); wCard();
    wTravel(o.edge, wView(g, st), o);
    wUrl();
  }
  function wLayout(on) {
    if (on) rvHide(); // (a comment's change shown on the drawing is put away when a walk through starts)
    // (the page bar and its tray are hidden while walking by the style sheet; the tray comes back as it was left)
    $('#view-draw').classList.toggle('walking', on);
    document.body.classList.toggle('walking', on);
    walkBtn.classList.toggle('on', on);
    $('.lbl', walkBtn).textContent = on ? 'Exit walkthrough' : 'Walk through';
    $('.ic path', walkBtn).setAttribute('d', on ? 'M4 4l8 8M12 4l-8 8' : 'M4.5 2.8v10.4L13 8z'); // a cross to leave, a triangle to start
    walkBtn.title = on ? 'Stop the walk through and look around the drawing' : 'Go through this page one step at a time';
    wbar.hidden = !on;
    if (!on) wbar.innerHTML = '';
    updMini(); // (no overview during a walk through)
  }
  async function wResume() { // the walk that was left part way, on the step it had reached
    const s = wSaved; wSaved = null;
    if (!s || walk) return false;
    const w = walk = s.w; w.busy = false;
    wLayout(true);
    await openPage(w.page);
    if (walk !== w) return true;
    if (!svgEl || curPage !== w.page) { wStop(true, false); return true; } // the picture is missing: leave the walk
    wAttach();
    wShow({ intro: true });
    return true;
  }
  async function startWalk(pid, cell) {
    if (!FG || !PAGES[pid] || PAGES[pid].empty) return;
    wSaved = null; // a new walk: the one left part way is not kept
    if (walk) wDetach();
    const w = walk = { states: {}, graphs: {}, stack: [], order: [pid], page: pid, busy: false };
    wLayout(true);
    await openPage(pid);
    if (walk !== w) return;
    if (!svgEl || curPage !== pid) { // the page's picture is missing
      wbar.innerHTML = '<div class="wbody"><p class="wtxt">This page has no picture yet, so it cannot be walked through.</p></div><div class="wact"><button class="wbtn pri wgo" data-w="exit">Close</button></div>';
      return;
    }
    wAttach();
    const g = wGraph(pid), first = cell && g.nodes[cell] ? cell : FG.firstEntry(g);
    if (!first) {
      wbar.innerHTML = '<div class="wbody"><p class="wtxt">This page has no steps to walk through.</p></div><div class="wact"><button class="wbtn pri wgo" data-w="exit">Close</button></div>';
      return;
    }
    w.states[pid] = FG.start(g, first);
    w.stack.push({ page: pid, kind: 'start', fresh: true });
    wShow({ intro: true });
  }
  // A walk left part way is kept: closing the comment board after the Comments button, or pressing Walk through again on the same page,
  // goes on from the step it had reached, with its Back and its other paths as they were (owner, 20 Nov 2026: "when i want to enter a
  // comment and exit mid-walkthrough, it redirects me to the beginning of the walkthrough"). Was: Walk through always started again at the
  // page's first step. A walk started from an address, or by "Start again", is a new one; a finished walk ("Back to the map") is not kept.
  let wSaved = null;
  function wStop(select, keep) { // select: stay on the step the walk reached, with the usual panel beside the drawing
    if (!walk) return;
    const pid = walk.page, st = walk.states[pid];
    wSaved = keep === false ? null : { w: walk, page: pid, byComments: false };
    wDetach(); walk = null; wLayout(false); updStick();
    if (select && st) go('#draw/' + pid + '/' + enc(st.cur));
  }
  // Before the walk leaves a page, the next page's picture has to be loadable. If it is not (the site is being rebuilt and its page files are
  // missing for a minute, or the connection is down) the walk stays where it is and the card says so, instead of ending the walk (found on
  // 18 Nov 2026 while replaying the whole walk during another session's rebuild, after the owner's "it goes back to step 1").
  async function wReach(pid) {
    try { await fetchPage(pid); return true; }
    catch (e) {
      const m = wbar.querySelector('.wbody');
      if (m && !m.querySelector('.wfail')) m.insertAdjacentHTML('beforeend', '<p class="wsub wfail">That page cannot be loaded right now. The site may be updating: wait a minute and press the button again.</p>');
      return false;
    }
  }
  async function wSwitch(pid) { // another page, as a part of the walk
    wDetach();
    await openPage(pid);
    if (!walk) return;
    if (!svgEl || curPage !== pid) { wStop(true); return; } // the picture is missing: leave the walk
    walk.page = pid; wAttach();
  }
  function wTake(i) {
    const pid = walk.page, a = FG.take(wGraph(pid), walk.states[pid], i);
    if (!a) return;
    walk.stack.push({ page: pid, kind: 'edge' });
    wShow({ edge: a.id });
  }
  function wTakeAll() { // every road of a split at once: the walk goes on from where they meet
    const pid = walk.page, m = FG.takeAll(wGraph(pid), walk.states[pid]);
    if (!m) return;
    walk.stack.push({ page: pid, kind: 'edge' });
    wShow({});
  }
  async function wBack() {
    const w = walk;
    if (!w || w.busy || w.stack.length < 2) return;
    if (w.stack[w.stack.length - 2].page !== w.page && !(await wReach(w.stack[w.stack.length - 2].page))) return;
    const e = w.stack.pop();
    if (e.kind === 'cross' && e.fresh) { delete w.states[e.page]; w.order = w.order.filter(x => x !== e.page); } else FG.back(wGraph(e.page), w.states[e.page]);
    const prev = w.stack[w.stack.length - 1], o = {};
    if (prev.page !== w.page) { w.busy = true; await wSwitch(prev.page); w.busy = false; if (walk !== w) return; o.intro = true; }
    wShow(o);
  }
  async function wCross() { // over a connector to the page it leads to, landing on the matching connector there
    const w = walk;
    if (!w || w.busy) return;
    const st = w.states[w.page], c = CONN_BY_CELL[w.page + ':' + st.cur], pc = c && c.partner ? CONN[c.partner] : null;
    if (!pc) return;
    if (!(await wReach(pc.page))) return;
    w.busy = true;
    const fromPid = w.page, t = hoTarget(fromPid, st.cur);
    if (t) { // the connector lights up and the picture dives into it, as when a connector is pressed in the drawing
      const run = ++hoRun; hoBusy = true; hoSkip = false;
      try { await hoLeave(fromPid, st.cur, { walk: true }); } finally { if (run === hoRun) hoBusy = false; }
      if (walk !== w) return;
      host.classList.add('swap'); host.style.transition = ''; host.style.opacity = ''; // stays hidden until the next page is in
    }
    await wSwitch(pc.page);
    if (walk !== w) return;
    const g = wGraph(pc.page); let fresh = false;
    if (!w.states[pc.page]) { w.states[pc.page] = FG.start(g, pc.cell); w.order.push(pc.page); fresh = true; }
    else FG.jump(g, w.states[pc.page], { type: 'entry', id: pc.cell });
    w.stack.push({ page: pc.page, kind: 'cross', fresh: fresh });
    w.busy = false;
    wShow({ intro: true });
    if (t) hoArrive(t, fromPid);
  }
  async function wOther() { // the next road not taken yet (a hand-off that the card offers as "Continue to" is left for that button)
    const w = walk, all = w ? wOthers() : [], list = all[0] && all[0].hand && all[0].page === w.page ? all.slice(1).concat(all[0]) : all;
    if (!w || w.busy || !list.length) return;
    const o = list[0], o2 = {};
    if (o.page !== w.page && !(await wReach(o.page))) return;
    if (o.page !== w.page) { w.busy = true; await wSwitch(o.page); w.busy = false; if (walk !== w) return; o2.intro = true; }
    FG.jump(wGraph(o.page), w.states[o.page], o);
    w.stack.push({ page: o.page, kind: 'jump' });
    const m = w.states[o.page].hist[w.states[o.page].hist.length - 1];
    if (!o2.intro && m.edge) o2.edge = m.edge.id; // straight to the road's first step: a dot runs along the arrow it starts with
    wShow(o2);
  }
  const wSettle = () => new Promise(res => { const t = () => (wAnim ? setTimeout(t, 30) : res()); t(); });
  async function wHand() { // straight over a hand-off that was shown at a split: the picture goes to the connector, then over it
    const w = walk, list = w ? wOthers() : [], o = list[0];
    if (!w || w.busy || !o || !o.hand || o.page !== w.page) return;
    FG.jump(wGraph(o.page), w.states[o.page], o);
    w.stack.push({ page: o.page, kind: 'jump' });
    w.busy = true;
    wShow({});
    await wSettle();
    w.busy = false;
    if (walk !== w) return;
    wCross();
  }
  function wClick(target) { // a click on a step of the drawing moves the walk there
    if (!walk || walk.busy) return true;
    const h = hit(target);
    if (!h || h.type !== 'cell') return true;
    const g = wGraph(walk.page), st = walk.states[walk.page];
    if (!g.nodes[h.id] || h.id === st.cur) return true;
    FG.jump(g, st, { type: 'entry', id: h.id });
    walk.stack.push({ page: walk.page, kind: 'jump' });
    wShow({});
    return true;
  }
  function wReframe() {
    if (!walk || !svgEl || walk.busy) return;
    const st = walk.states[walk.page]; if (!st) return;
    wFinish();
    const t = wView(wGraph(walk.page), st);
    if (t) { T.s = t.s; T.x = t.x; T.y = t.y; apply(); }
  }

  wbar.addEventListener('pointerdown', e => e.stopPropagation()); // the card is not part of the picture: no dragging from it
  wbar.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
  wbar.addEventListener('click', e => {
    const b = e.target.closest('[data-w]');
    if (!b || !walk || walk.busy) return;
    const a = b.dataset.w;
    if (a === 'take') wTake(+b.dataset.i); else if (a === 'all') wTakeAll(); else if (a === 'back') wBack(); else if (a === 'cross') wCross();
    else if (a === 'way') wWay(b.dataset.id); else if (a === 'hand') wHand(); else if (a === 'others') wOther(); else if (a === 'again') startWalk(walk.page); else if (a === 'exit') wStop(true);
    else if (a === 'map') { wStop(false, false); go('#map'); }
  });
  wbar.addEventListener('mouseover', e => { const b = e.target.closest('[data-pv]'); wPreview(b ? +b.dataset.pv : -1); }); // pointing at an answer lights where it leads
  wbar.addEventListener('mouseleave', () => wPreview(-1));
  walkBtn.addEventListener('click', () => {
    if (walk) wStop(true);
    else if (wSaved && wSaved.page === curPage && view === 'draw') wResume(); // goes on from where the walk was left on this page
    else go('#walk/' + (curPage || firstPage()));
  });
  document.addEventListener('keydown', e => {
    if (!walk || walk.busy || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const k = e.key, onBtn = !!(t && t.tagName === 'BUTTON');
    if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !onBtn)) { e.preventDefault(); const b = $('.wbtn.pri', wbar); if (b) b.click(); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') { e.preventDefault(); wBack(); }
    else if (k === 'Escape') wStop(true);
  });

  // ------------------------------------------------------------------ walk from here
  // Any step, decision, start or end that is pressed on a drawing can start the walk through on itself (owner, 20 Nov 2026: "add an option
  // to start the walkthrough from where I am (it can be any process box that I press and i can continue the walkthrough from that specific
  // step"). A small button sits just above the pressed box and follows it when the picture moves; a press starts the walk on that box (or,
  // when it is the box where a walk was left part way, goes on with that walk). Not shown during a walk, a hand-off or comment mode, nor for
  // a file, a system or a note (they are not steps of the walk).
  const wHere = document.createElement('button');
  wHere.type = 'button'; wHere.className = 'walkhere'; wHere.hidden = true;
  wHere.innerHTML = '<span class="ar">▶</span>Walk from here';
  wHere.title = 'Start the walk through at this box';
  vp.appendChild(wHere);
  const hereGraphs = {}; let hereBox = null;
  function hereGraph(pid) {
    if (!hereGraphs[pid]) hereGraphs[pid] = FG.build(PAGES[pid], { isOutConn: id => { const c = CONN_BY_CELL[pid + ':' + id]; return !!(c && c.dir === 'out' && c.toPage); } });
    return hereGraphs[pid];
  }
  function updHere() {
    const id = selCell;
    const show = !!(FG && id && curPage && svgEl && view === 'draw' && !walk && !hoBusy && !$('#view-draw').classList.contains('commenting')
      && hereGraph(curPage).nodes[id]);
    if (!show) { wHere.hidden = true; return; }
    if (!hereBox || hereBox.id !== id || hereBox.svg !== svgEl) hereBox = { id: id, svg: svgEl, b: cellBox(id) };
    const b = hereBox.b; if (!b) { wHere.hidden = true; return; }
    wHere.hidden = false;
    const w = wHere.offsetWidth || 150, h = wHere.offsetHeight || 30;
    const x2 = T.x + (b.x + b.width) * T.s, x1 = T.x + b.x * T.s, y1 = T.y + b.y * T.s, y2 = T.y + (b.y + b.height) * T.s;
    // above the box, starting just right of its centre line, so that it leaves free the arrow that comes in at the top centre
    let left = (x1 + x2) / 2 + 14, top = y1 - h - 10;
    if (top < 6) top = y2 + 10; // no room above: under the box
    left = Math.max(6, Math.min(vp.clientWidth - w - 6, left));
    wHere.style.left = Math.round(left) + 'px'; wHere.style.top = Math.round(top) + 'px';
  }
  H.apply.push(updHere);
  wHere.addEventListener('pointerdown', e => e.stopPropagation()); // (not a drag of the picture, and not a press on the drawing)
  wHere.addEventListener('click', e => {
    e.stopPropagation();
    const id = selCell; if (!id || walk) return;
    const st = wSaved && wSaved.page === curPage ? wSaved.w.states[curPage] : null;
    if (st && st.cur === id) { wResume(); return; } // the box where the walk was left: go on with that walk
    go('#walk/' + curPage + '/' + enc(id));
  });

  // ------------------------------------------------------------------ hand-off between pages
  // Pressing a connector on a drawing takes the reader over it to the matching connector on the other page. The picture shows the
  // three things the owner asked for (18 Nov 2026): where the connector is (it lights up, a label names the page it leads to), the way
  // over (the picture dives into the connector and the page tabs below pick out the next page) and where it lands (the matching
  // connector lights up on the next page, a label names the page you came from).
  const hoChip = $('#hoChip');
  let hoBusy = false, hoSkip = false, hoRun = 0, hoTimer = 0, hoTimer2 = 0;
  const pgFull = (p, other) => (other && other.wf === p.wf ? '' : WF[p.wf].name + ' · ') + p.name;
  function takeOver() { hoClose(); if (hoBusy) hoSkip = true; if (wAnim) wFinish(); } // the reader moves the picture: the question goes, and what is moving jumps to its end
  function hoAbort() { // another page is asked for while a hand-off is on its way: the hand-off stops where it is
    hoClose();
    if (!hoBusy) return;
    hoRun++; hoSkip = true; hoBusy = false; clearTimeout(hoTimer); clearTimeout(hoTimer2); hoChip.hidden = true;
    wFinish(); host.style.transition = ''; host.style.opacity = '';
    updMini();
  }
  function hoTarget(pid, cell) { // the matching connector (or at least the page) that a connector leads to
    const c = CONN_BY_CELL[pid + ':' + cell]; if (!c) return null;
    const pc = c.partner ? CONN[c.partner] : null, to = pc ? PAGES[pc.page] : c.toPage ? PAGES[c.toPage] : null;
    return to && !to.empty ? { c: c, to: to.id, cell: pc ? pc.cell : '' } : null;
  }
  const hoTw = (dur, step) => new Promise(res => { if (hoSkip) { step(1); res(); } else wTween(dur, step, res); });
  const hoWait = ms => new Promise(res => {
    if (hoSkip || REDUCE) { res(); return; }
    const t0 = Date.now(), iv = setInterval(() => { if (hoSkip || Date.now() - t0 >= ms) { clearInterval(iv); res(); } }, 25);
  });
  function hoRingAt(cell) { // a ring spreads out from the connector
    const b = ovl && cellBox(cell); if (!b) return;
    ovl.appendChild(mkSvg('rect', { 'class': 'horing', x: b.x - 10, y: b.y - 10, width: b.width + 20, height: b.height + 20, rx: 13 }));
  }
  function hoLight(cell) { if (!ovl) return; ovl.innerHTML = ''; hovBox = null; boxFor(cell, 'hohalo'); hoRingAt(cell); }
  function pingTab(id) { // the page shows a ring on the slim bar: its own tag when it is the open page, its chip when joined to it ("+N" when the chip has no room); else its tab in the rows
    let b = id === curPage ? pgCur : $('.pgchip[data-p="' + id + '"]', pgChips);
    if (b && b.hidden) b = pgMore;
    if (!b || b.hidden || !b.offsetParent) b = PAGES[id] && $('#pageList .ptb[data-p="' + id + '"]');
    if (!b) return;
    b.classList.remove('ping'); void b.offsetWidth; b.classList.add('ping');
    setTimeout(() => b.classList.remove('ping'), 2300);
  }
  function hoSay(cell, tag, text, letter) { // the label: above the connector, or at the top of the picture during a walk
    clearTimeout(hoTimer); clearTimeout(hoTimer2);
    hoChip.innerHTML = `${letter ? letterHtml(letter) : ''}<span class="hotx"><b>${esc(tag)}</b>${esc(text)}</span>`;
    hoChip.classList.remove('out'); hoChip.hidden = false;
    const w = vp.clientWidth, b = !walk && cell ? cellBox(cell) : null; // (the box in drawing units: a cell's own frame can be the size of the page)
    const x = b ? T.x + (b.x + b.width / 2) * T.s : w / 2, y = b ? T.y + b.y * T.s - 18 : 14;
    hoChip.style.left = Math.max(140, Math.min(w - 140, x)) + 'px';
    hoChip.style.top = (b ? Math.max(70, y) : y) + 'px';
    hoChip.classList.toggle('top', !b);
  }
  function hoHide(after) { clearTimeout(hoTimer); hoTimer = setTimeout(() => { hoChip.classList.add('out'); hoTimer2 = setTimeout(() => { hoChip.hidden = true; }, 320); }, after || 0); }
  function hoCenter(cell, sMin) { // the view that puts a connector in the middle of the window, big enough to read
    const b = cellBox(cell); if (!b) return null;
    const v = { s: Math.max(sMin == null ? T.s : sMin, Math.min(0.9, (vp.clientWidth - 80) / Math.max(b.width, 1))), cx: b.x + b.width / 2, cy: b.y + b.height / 2, ax: vp.clientWidth / 2, ay: vp.clientHeight / 2 };
    return walk ? v : anchorFix(v); // (a walk frames its own steps; a connector near the page's edge is not left in the middle of blank canvas)
  }

  // The question before a hand-off (owner, 18 Nov 2026: "instead of automatically moving to the next connector, please have a popout
  // 'open in xxx?' instead of automatic"): pressing a connector in a drawing lights it, brings it to the middle and asks; the pages
  // change only when the reader answers Open. (The "Go to" button in the side panel and "Continue to" in a walk are answers already.)
  const hoAskEl = $('#hoAsk');
  let hoAsking = null, hoAskRun = 0;
  function hoClose() { hoAskRun++; if (!hoAsking && hoAskEl.hidden) return; hoAsking = null; hoAskEl.hidden = true; hoAskEl.innerHTML = ''; }
  function hoPlace() { // above the connector, or below it when there is no room above; in a window too short for either, in the middle with no pointer
    if (!hoAsking) return;
    const b = cellBox(hoAsking.cell); if (!b) return;
    const w = vp.clientWidth, h = vp.clientHeight, H = hoAskEl.offsetHeight || 130, GAP = 17;
    const x = T.x + (b.x + b.width / 2) * T.s, top = T.y + b.y * T.s, bot = T.y + (b.y + b.height) * T.s;
    const sh = !stick.hidden && stick.classList.contains('pin') ? stick.offsetHeight : 0; // (the pinned lane headers cover the top of the picture)
    const above = top - sh - GAP >= H + 6, below = h - bot - GAP >= H + 6, half = Math.min(165, (w - 24) / 2), cx = Math.max(half + 12, Math.min(w - half - 12, x));
    const lone = !above && !below; // no room on either side of the connector
    hoAskEl.classList.toggle('below', !lone && !above);
    hoAskEl.classList.toggle('lone', lone);
    hoAskEl.style.left = cx + 'px';
    hoAskEl.style.top = lone ? Math.max(8, (h - H) / 2) + 'px' : (above ? top : bot) + 'px';
    hoAskEl.style.setProperty('--ax', Math.max(24 - half, Math.min(half - 24, x - cx)) + 'px'); // the pointer keeps aiming at the connector
  }
  async function hoAsk(pid, cell) {
    const t = hoTarget(pid, cell);
    if (!t) { selectCell(cell, false); return; }
    hoClose();
    const run = hoAskRun;
    selCell = cell; hoLight(cell); renderDraw(); // lit and chosen: the side panel has its card
    const v = hoCenter(cell);
    if (v) { const cam = wCam(v); await new Promise(res => wTween(Math.round(Math.min(560, Math.max(260, 240 + cam.dist * 0.3))), cam.step, res)); }
    if (run !== hoAskRun || curPage !== pid || hoBusy) return; // the reader did something else while the picture moved
    hoAsking = { pid: pid, cell: cell };
    hoAskEl.innerHTML = `<div class="haq">${letterHtml(t.c.letter)}<span class="hat">Open in <b>${esc(pgFull(PAGES[t.to], PAGES[pid]))}</b>?</span></div>
      <div class="hab"><button class="btn" type="button" data-ho-open>Open</button><button class="btn sec" type="button" data-ho-stay>Stay here</button></div>`;
    hoAskEl.hidden = false; hoPlace();
    const ob = $('[data-ho-open]', hoAskEl); if (ob) ob.focus({ preventScroll: true });
  }
  hoAskEl.addEventListener('pointerdown', e => e.stopPropagation()); // the question is not part of the picture: no dragging from it
  hoAskEl.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
  hoAskEl.addEventListener('click', e => {
    const b = e.target.closest('button'), a = hoAsking; if (!b || !a) return;
    hoClose();
    if (b.hasAttribute('data-ho-open')) handOff(a.pid, a.cell, { asked: true });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && hoAsking) { e.preventDefault(); hoClose(); } });

  // 1. where it is, and 2. the way over: the connector lights up and says where it leads; then the picture dives into it
  async function hoLeave(pid, cell, o) {
    o = o || {};
    const t = hoTarget(pid, cell), to = PAGES[t.to], from = PAGES[pid];
    if (o.walk || o.asked) hoLight(cell); // (in a walk, or after the question, the picture is already on the connector)
    else {
      selCell = cell; hoLight(cell);
      const v = hoCenter(cell);
      if (v) { const cam = wCam(v); await hoTw(Math.round(Math.min(640, Math.max(320, 280 + cam.dist * 0.3))), cam.step); }
      renderDraw();
    }
    pingTab(pid);
    if (!o.asked) { // (after the question there is nothing more to say: the reader has said where to go)
      hoSay(cell, t.c.dir === 'out' ? 'Continues in' : 'Comes in from', pgFull(to, from), t.c.letter);
      await hoWait(700);
    }
    const bx = cellBox(cell), dx = bx ? bx.x + bx.width / 2 : (vp.clientWidth / 2 - T.x) / T.s, dy = bx ? bx.y + bx.height / 2 : (vp.clientHeight / 2 - T.y) / T.s, s0 = T.s;
    const ax = T.x + dx * T.s, ay = T.y + dy * T.s; // the connector stays where it is on the screen while the picture grows round it
    host.style.transition = 'none';
    pingTab(t.to);
    await hoTw(440, k => { const s = s0 * (1 + 1.8 * k); T.s = s; T.x = ax - dx * s; T.y = ay - dy * s; apply(); host.style.opacity = String(Math.max(0, 1 - k * 1.15)); });
    host.style.opacity = '0';
    hoHide(0);
    return t;
  }
  // 3. where it lands: the next picture comes in from a little further out, with the matching connector in the middle, lit
  async function hoLand(t, fromPid) {
    host.classList.remove('swap');
    const v = t.cell ? hoCenter(t.cell, 0) : null;
    if (v) {
      const s1 = v.s, l0 = Math.log(s1 * 0.5), l1 = Math.log(s1);
      const place = s => { const c = clampXY(s, v.ax - v.cx * s, v.ay - v.cy * s); T.s = s; T.x = c.x; T.y = c.y; apply(); };
      place(s1 * 0.5); host.style.opacity = '0';
      await hoTw(740, k => { place(Math.exp(l0 + (l1 - l0) * k)); host.style.opacity = String(Math.min(1, k * 1.5)); });
    }
    host.style.transition = ''; host.style.opacity = '';
    if (t.cell) { selCell = t.cell; hoLight(t.cell); renderDraw(); }
    hoArrive(t, fromPid);
  }
  function hoArrive(t, fromPid) { if (t.cell) hoLight(t.cell); pingTab(t.to); hoSay(t.cell, 'You came from', pgFull(PAGES[fromPid], PAGES[t.to]), t.c.letter); hoHide(2800); }

  async function handOff(pid, cell, o) { // o.asked: the reader has said Open to the question about this connector
    const t = hoTarget(pid, cell); if (!t || hoBusy) return;
    hoClose();
    const run = ++hoRun;
    hoBusy = true; hoSkip = false; updMini(); // (no overview during a hand-off)
    try {
      fetchPage(t.to).catch(() => { /* openPage says so below */ }); // the next picture loads while this one is lit
      await hoLeave(pid, cell, { asked: !!(o && o.asked) });
      if (run !== hoRun) return;
      await openPage(t.to, { hold: true });
      if (run !== hoRun || curPage !== t.to || !svgEl) return;
      try { history.pushState(null, '', '#draw/' + t.to + (t.cell ? '/' + enc(t.cell) : '')); } catch (e) { /* the address just stays as it was */ }
      await hoLand(t, pid);
    } finally {
      if (run === hoRun) { host.style.transition = ''; host.style.opacity = ''; host.classList.remove('swap'); hoBusy = false; updStick(); updMini(); }
    }
  }

  // ------------------------------------------------------------------ start
  // what the comment board (comments.js) may use of this file
  Object.defineProperties(APE, {
    page: { get: () => curPage }, svg: { get: () => svgEl }, walking: { get: () => !!walk }, busy: { get: () => hoBusy },
    view: { get: () => view }, selected: { get: () => selCell },
  });
  Object.assign(APE, {
    vp: vp, T: T, PAGES: PAGES, WF: WF, pageLabel: pageLabel, esc: esc,
    cellBox: cellBox, hit: hit, centerOn: centerOn, render: renderDraw, clearSel: clearSel, showPanel: showPanel, apply: apply,
    cellLabel: id => { const it = PAGES[curPage] && PAGES[curPage].cells[id]; return it ? (it.label || it.text || it.name || '') : ''; },
    toDrawing: (cx, cy) => { const r = vp.getBoundingClientRect(); return { x: (cx - r.left - T.x) / T.s, y: (cy - r.top - T.y) / T.s }; },
    centerAt: (x, y) => { T.s = Math.max(T.s, 0.6); const c = clampXY(T.s, vp.clientWidth / 2 - x * T.s, vp.clientHeight / 2 - y * T.s); T.x = c.x; T.y = c.y; apply(); },
    open: (pid, cell) => go('#draw/' + pid + (cell ? '/' + enc(cell) : '')),
    stickBand: () => (stk && !stick.hidden ? { y0: stk.y0, y1: stk.y1 } : null),
    walkStop: () => { if (walk) { wStop(true); if (wSaved) wSaved.byComments = true; } }, // ends a walk through on the step it reached (the Comments button does this, then opens the board)
    // the comment board is closed: a walk that the Comments button ended goes on where it was, when its page is still the one on screen
    walkResume: () => { if (wSaved && wSaved.byComments && wSaved.page === curPage && view === 'draw' && !walk) { wResume(); return true; } return false; },
  });
  buildMap(); buildPageList(); buildFiles();
  window.addEventListener('resize', hoClose); // (the question is placed for the window it was asked in)
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (view === 'map') drawLinks(); if (view === 'files') sizeFiles(); if (walk) wReframe(); updStick(); updScroll(); updMini(); fitChips(); }, 120); });
  route();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (view === 'map') drawLinks(); fitChips(); });
})();

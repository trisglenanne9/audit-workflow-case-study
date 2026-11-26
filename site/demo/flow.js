/* =====================================================================
   flow.js: reads the arrows of one drawing page and plans a walk through its steps.
   No screen code in here (so it can be tested on its own, against the real data).

   A page becomes a graph: the steps, decisions, start/end shapes and connectors are the nodes; the arrows
   between them (solid, or dashed for a return path) are the ways on. Files, documents and systems are not
   part of the flow, so they are left out.

   A walk starts at the page's first shape and follows the arrows. Where the road splits, every road is shown at once, all the way to
   the shape where they meet again (the "join"), and the walk goes on from there (owner, 18 Nov 2026: "I want all the paths to be seen",
   then "you can next it when all of these connect to a process box"). Roads that never meet again are shown for a few steps and the walk
   goes on along the main one ("the main path", the branch that carries most of the work). Whatever is left stays on a list
   ("other paths") that can be visited afterwards, so that every step of a page can be reached.
   ===================================================================== */
(function (root) {
  'use strict';
  var FLOW = { step: 1, decision: 1, terminal: 1, connector: 1 };

  function rankOfLabel(l) { return /^yes\b/i.test(l) ? 0 : /^no\b/i.test(l) ? 2 : 1; }

  // top to bottom, then left to right (rows of about 50 drawing units count as one row)
  function readingSort(g, ids) {
    var key = function (id) { var c = g.nodes[id], geo = c.geo; return geo ? [Math.round(geo[1] / 50), geo[0], g.rank[id]] : [0, 0, g.rank[id]]; };
    return ids.slice().sort(function (a, b) { var p = key(a), q = key(b); return (p[0] - q[0]) || (p[1] - q[1]) || (p[2] - q[2]); });
  }

  // page: one entry of DATA.pages; opts.isOutConn(id): true for a connector that leads on to another page
  function build(page, opts) {
    opts = opts || {};
    var nodes = {}, out = {}, inn = {}, rank = {}, n = 0;
    Object.keys(page.cells).forEach(function (id) {
      var c = page.cells[id];
      if (FLOW[c.kind]) { nodes[id] = c; out[id] = []; inn[id] = []; rank[id] = n++; }
    });
    (page.edges || []).forEach(function (e, i) {
      if (!nodes[e.s] || !nodes[e.t] || e.s === e.t) return;
      var a = { id: e.id || null, from: e.s, to: e.t, label: String(e.label || '').trim(), dashed: !!e.dashed, order: i };
      out[e.s].push(a); inn[e.t].push(a);
    });
    var g = { page: page, nodes: nodes, out: out, inn: inn, rank: rank, ids: Object.keys(nodes),
      isOutConn: opts.isOutConn || function () { return false; } };
    g.isolated = g.ids.filter(function (id) { return !out[id].length && !inn[id].length; });
    g.entries = readingSort(g, g.ids.filter(function (id) { return !inn[id].length && out[id].length; }));
    // a closed loop that no arrow leads into still needs a way in: its first shape in reading order
    var seen = {};
    function mark(id) { var st = [id]; while (st.length) { var x = st.pop(); if (seen[x]) continue; seen[x] = 1; out[x].forEach(function (a) { st.push(a.to); }); } }
    g.entries.forEach(mark);
    readingSort(g, g.ids.filter(function (id) { return out[id].length || inn[id].length; })).forEach(function (id) {
      if (!seen[id]) { g.entries.push(id); mark(id); }
    });
    return g;
  }

  // where a walk of the page begins: the first START shape in reading order, otherwise the first way in
  function firstEntry(g) {
    for (var i = 0; i < g.entries.length; i++) if (g.nodes[g.entries[i]].kind === 'terminal' && /^start/i.test(g.nodes[g.entries[i]].text || '')) return g.entries[i];
    if (g.entries.length) return g.entries[0];
    var all = readingSort(g, g.ids);
    return all.length ? all[0] : null;
  }

  // how much of the page lies beyond a shape, not counting what has been seen. The main path is the one with the most steps still to
  // see on this page: a road that only ends, or only hands over to another page, is seen whole on the picture at the split, so the walk
  // does not stop on it (owner, 18 Nov 2026: "when I press next ... just go to the next process box that's involved"). Was: a road that
  // led on to another page counted extra, so Next often left the page and the other answers had to be walked one by one afterwards.
  function reach(g, startId, vis, blockId) {
    var seen = {}, st = [startId], n = 0;
    while (st.length) {
      var x = st.pop();
      if (seen[x] || vis[x] || x === blockId) continue;
      seen[x] = 1; n++;
      g.out[x].forEach(function (a) { st.push(a.to); });
    }
    return n;
  }

  function pickDefault(g, id, vis) {
    var outs = g.out[id];
    if (outs.length < 2) return 0;
    var best = 0, bestKey = null;
    outs.forEach(function (a, i) {
      var key = [a.dashed ? 0 : 1, vis[a.to] ? -1 : reach(g, a.to, vis, id), -rankOfLabel(a.label), -i];
      var better = !bestKey;
      for (var k = 0; !better && k < key.length; k++) { if (key[k] !== bestKey[k]) { better = key[k] > bestKey[k]; break; } }
      if (better) { best = i; bestKey = key; }
    });
    return best;
  }

  // ---- the shape of a page: the loops cut, and where the ways out of a shape meet again
  // The forward arrows are all arrows except the ones that close a loop (found by a depth-first walk that starts at the page's ways in,
  // so that the way a reader goes through the page decides which arrow of a loop is the one that goes back). The join of a shape is the
  // nearest shape that every way out of it passes through (its immediate post-dominator); it is null when the ways never come together
  // again, because one of them ends or leads on to another page.
  var EXIT = '\u0000exit';
  function structure(g) {
    if (g.struct) return g.struct;
    var state = {}, back = {}, fwd = {}, order = [], mark = {}, pd = {}, ipd = {};
    function dfs(id) {
      state[id] = 1;
      g.out[id].forEach(function (a) { if (state[a.to] === 1) back[a.from + '>' + a.order] = 1; else if (!state[a.to]) dfs(a.to); });
      state[id] = 2;
    }
    g.entries.forEach(function (id) { if (!state[id]) dfs(id); });
    g.ids.forEach(function (id) { if (!state[id]) dfs(id); });
    g.ids.forEach(function (id) { fwd[id] = g.out[id].filter(function (a) { return !back[a.from + '>' + a.order]; }); });
    function post(id) { if (mark[id]) return; mark[id] = 1; fwd[id].forEach(function (a) { post(a.to); }); order.push(id); } // shapes with no way on come first
    g.ids.forEach(post);
    order.forEach(function (id) {
      var set = null;
      if (!fwd[id].length) { set = {}; set[EXIT] = 1; }
      else fwd[id].forEach(function (a) {
        var s = pd[a.to];
        if (!set) { set = {}; Object.keys(s).forEach(function (k) { set[k] = 1; }); }
        else Object.keys(set).forEach(function (k) { if (!s[k]) delete set[k]; });
      });
      set[id] = 1; pd[id] = set;
      var best = null, size = -1; // the nearest of the shapes that every way passes through is the one that has most of them behind it
      Object.keys(set).forEach(function (k) { if (k === id || k === EXIT) return; var n = Object.keys(pd[k]).length; if (n > size) { best = k; size = n; } });
      ipd[id] = best;
    });
    g.struct = { back: back, fwd: fwd, ipd: ipd };
    return g.struct;
  }

  var DEPTH = 3; // when the roads never meet again: how many steps of a side road are shown

  function primaryOf(g, st) {
    var outs = g.out[st.cur];
    return st.forced >= 0 && st.forced < outs.length ? st.forced : pickDefault(g, st.cur, st.visited);
  }

  // The ways out of the shape the walk is on, when two or more of them lead somewhere new. Every road is followed to the join, so that
  // all of them are in view together; the walk then goes on from the join. When the roads never meet again, the side roads are shown
  // for a few steps only and the main road is walked on from its first step. null when there is no split to show.
  function fork(g, st, pri) {
    var id = st.cur, outs = g.out[id], vis = st.visited, S = structure(g), fresh = [];
    outs.forEach(function (a, i) { if (!vis[a.to]) fresh.push(i); });
    if (fresh.length < 2) return null;
    var join = S.ipd[id]; if (join && vis[join]) join = null;
    if (pri == null || fresh.indexOf(pri) < 0) pri = fresh[0];
    var branches = fresh.map(function (i) { return { i: i, edge: outs[i], to: outs[i].to, label: outs[i].label, primary: i === pri, nodes: [] }; });
    var owner = {}, inRegion = {};
    branches.forEach(function (b, k) {
      var cap = join ? Infinity : (b.primary ? 1 : DEPTH), seen = {}, q = [[b.to, 1]];
      while (q.length) {
        var it = q.shift(), x = it[0];
        if (x === join || vis[x] || x === id || seen[x]) continue;
        seen[x] = 1; b.nodes.push(x); inRegion[x] = 1;
        owner[x] = (x in owner) ? -1 : k; // -1: more than one road reaches it
        if (!join && (g.nodes[x].kind === 'decision' || it[1] >= cap)) continue; // (a decision further on is shown, not followed)
        S.fwd[x].forEach(function (a) { q.push([a.to, it[1] + 1]); });
      }
    });
    var all = Object.keys(inRegion), ends = {};
    all.forEach(function (x) { ends[x] = 1; }); if (join) ends[join] = 1;
    var edges = [];
    [id].concat(all).forEach(function (x) { g.out[x].forEach(function (a) { if (ends[a.to] && !(x === id && vis[a.to])) edges.push(a); }); });
    return { id: id, join: join, target: join || outs[pri].to, primary: pri, branches: branches, owner: owner, nodes: readingSort(g, all), edges: edges };
  }

  // state of a walk on one page: the shape it is on, the moves made so far, what has been seen
  function start(g, id) {
    var st = { cur: id, hist: [{ kind: 'start', from: null, to: id, edge: null, i: -1 }], visited: {}, taken: {}, revisit: false, forced: -1 };
    st.visited[id] = 1;
    return st;
  }

  // what can be done from here: the ways on (the main one marked), or an end, or a loop back
  function choices(g, st) {
    var id = st.cur, outs = g.out[id], vis = st.visited;
    var res = { id: id, node: g.nodes[id], outs: [], end: false, loop: false, primary: -1, fork: null };
    if (!outs.length) { res.end = true; return res; }
    if (st.revisit && outs.every(function (a) { return vis[a.to]; })) { res.loop = true; return res; }
    var pri = primaryOf(g, st);
    res.primary = pri;
    res.fork = fork(g, st, pri); // two or more new roads: all of them are shown, and one move takes the walk to where they meet
    var list = outs.map(function (a, i) { return { i: i, to: a.to, label: a.label, dashed: a.dashed, primary: i === pri, seen: !!vis[a.to], edge: a }; });
    // shown in this order: the main way first, then YES before the rest, NO last
    res.outs = list.slice().sort(function (p, q) { return (q.primary - p.primary) || (rankOfLabel(p.label) - rankOfLabel(q.label)) || (p.i - q.i); });
    return res;
  }

  function take(g, st, i) {
    var a = g.out[st.cur][i];
    if (!a) return null;
    st.taken[a.from + '>' + a.order] = 1;
    st.revisit = !!st.visited[a.to];
    st.visited[a.to] = 1;
    st.hist.push({ kind: 'edge', from: a.from, to: a.to, edge: a, i: i });
    st.cur = a.to; st.forced = -1;
    return a;
  }

  // the move that takes every road of a split at once: they are all seen, and the walk stands where they meet (or, when they never
  // meet again, at the first step of the main road)
  // A hand-off to another page on a side road is shown with the rest, but it is not counted as walked: the walk has to stand on it to
  // cross to the other page, so it stays on the list of other paths.
  function takeAll(g, st) {
    var pl = fork(g, st, primaryOf(g, st));
    if (!pl) return null;
    var skip = {};
    pl.nodes.forEach(function (x) { if (x !== pl.target && g.isOutConn(x)) skip[x] = 1; });
    var seen = pl.nodes.filter(function (x) { return !skip[x]; }), taken = pl.edges.filter(function (a) { return !skip[a.to]; });
    taken.forEach(function (a) { st.taken[a.from + '>' + a.order] = 1; });
    seen.forEach(function (x) { st.visited[x] = 1; });
    st.visited[pl.target] = 1;
    st.revisit = false; st.forced = -1;
    var m = { kind: 'region', from: st.cur, to: pl.target, edge: null, i: -1, nodes: pl.nodes.slice(), seen: seen, edges: taken };
    st.hist.push(m); st.cur = pl.target;
    return m;
  }

  // the walk as it stood before the last move (null when there is no move to undo)
  function back(g, st) {
    if (st.hist.length < 2) return null;
    var m = st.hist.pop();
    st.visited = {}; st.taken = {}; st.revisit = false; st.forced = -1;
    st.hist.forEach(function (h) {
      st.revisit = h.kind === 'edge' ? !!st.visited[h.to] : false;
      if (h.kind === 'edge') st.taken[h.from + '>' + h.edge.order] = 1;
      if (h.kind === 'region') {
        h.seen.forEach(function (x) { st.visited[x] = 1; });
        h.edges.forEach(function (a) { st.taken[a.from + '>' + a.order] = 1; });
      }
      st.visited[h.to] = 1; st.cur = h.to;
      st.forced = h.kind === 'jump' && h.forced != null ? h.forced : -1;
    });
    return m;
  }

  // roads not taken yet: branches of shapes already seen that lead to somewhere new, then flows of the page not started
  function others(g, st) {
    var res = [], order = [], seenIds = {};
    st.hist.forEach(function (m) {
      (m.seen || []).concat([m.to]).forEach(function (x) { if (!seenIds[x]) { seenIds[x] = 1; order.push(x); } }); // (a split taken as a whole has seen all of its roads)
    });
    var listed = {}; // a step that several seen shapes lead to is one road, not one per arrow
    order.forEach(function (id) {
      g.out[id].forEach(function (a, i) {
        if (st.taken[a.from + '>' + a.order] || st.visited[a.to] || listed[a.to]) return;
        listed[a.to] = 1;
        res.push({ type: 'branch', from: id, i: i, to: a.to, label: a.label });
      });
    });
    g.entries.forEach(function (id) { if (!st.visited[id]) res.push({ type: 'entry', id: id, to: id }); });
    // what is left of this page comes first (the roads to steps not seen yet, then the flows of the page not started); a road that is
    // only a hand-off to another page comes after them, so that a page is finished before the walk goes on (owner, 18 Nov 2026), and a
    // way in from another page that leads only to steps already seen comes last. Was: the roads that led on to another page came first.
    res.forEach(function (o, i) {
      o.hand = o.type === 'branch' && g.isOutConn(o.to);
      o.k = o.hand ? 2 : o.type === 'branch' ? 0 : reach(g, o.id, st.visited) > 1 ? 1 : 3;
      o.n = i;
    });
    res.sort(function (p, q) { return (p.k - q.k) || (p.n - q.n); });
    return res;
  }

  // go to the start of one of those roads. For a branch the walk goes straight to the road's first step (the arrow from the shape that
  // splits is the way it came), not back to the shape that splits: its answers were all on the picture already (owner, 18 Nov 2026:
  // "you don't have to go through each path one by one"). Was: the walk stood on the shape that splits again, with that way marked.
  function jump(g, st, o) {
    if (o.type === 'branch') {
      var a = g.out[o.from][o.i];
      st.taken[a.from + '>' + a.order] = 1;
      st.revisit = !!st.visited[a.to];
      st.visited[a.to] = 1;
      st.hist.push({ kind: 'edge', from: o.from, to: a.to, edge: a, i: o.i, other: true });
      st.cur = a.to; st.forced = -1;
    } else {
      st.hist.push({ kind: 'jump', from: st.cur, to: o.id, edge: null, i: -1, forced: null });
      st.cur = o.id; st.visited[o.id] = 1; st.forced = -1; st.revisit = false;
    }
  }

  var api = { build: build, firstEntry: firstEntry, start: start, choices: choices, take: take, takeAll: takeAll, fork: fork, structure: structure, back: back, others: others, jump: jump, rankOfLabel: rankOfLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FlowGraph = api;
})(typeof window !== 'undefined' ? window : this);

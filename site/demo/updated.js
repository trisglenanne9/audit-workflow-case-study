/* =====================================================================
   updated.js: the "Updated" line in the header (owner, 18 Nov 2026, from her mockup: "good ... go ahead and build").
   A pill at the right of the header says when the site was built. Pressed, it says which drawings it was built from and when each was
   saved. It turns amber when a drawing was saved after the build, or when a newer build is ready than the one this page loaded.
   The owner asked for nothing more in it: no coverage line and no list of what changed ("no need to show the above").

   Where the knowledge comes from: data.js says when the build began (DATA.build.started) and when each drawing was saved (ts). The
   file status.js, written by auto_update.py every 10 minutes on the owner's computer, says when each drawing was last saved and which
   build is on disk (build.py refreshes it too when a build ends, whoever ran it). A hosted copy has no status.js, so there the pill only
   says when the site was built. The page asks for status.js
   every minute, only when it is opened from a file or from localhost.
   ===================================================================== */
(function () {
  'use strict';
  var D = window.DATA, B = D && D.build, top = document.querySelector('header.top');
  if (!B || !top) return;

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function two(n) { return (n < 10 ? '0' : '') + n; }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  // a time of day, with the day when it is not today ("16:27", "17 Nov, 09:12")
  function when(ts) {
    var d = new Date(ts * 1000), t = two(d.getHours()) + ':' + two(d.getMinutes());
    return sameDay(d, new Date()) ? t : d.getDate() + ' ' + MON[d.getMonth()] + ', ' + t;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // when the build finished, as seconds: from its text "18 Nov 2026, 16:27"
  function builtTs() {
    var m = /^(\d+)\s+(\w{3})\s+(\d{4}),\s*(\d+):(\d+)$/.exec(B.date || '');
    if (!m) return 0;
    return Math.round(new Date(+m[3], MON.indexOf(m[2]), +m[1], +m[4], +m[5]).getTime() / 1000);
  }
  var BUILT = builtTs();

  var btn = document.createElement('button');
  btn.id = 'updBtn'; btn.className = 'updbtn'; btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<i class="udot"></i><span class="utxt"></span>';
  top.appendChild(btn);
  var pop = document.createElement('div');
  pop.id = 'updPop'; pop.className = 'updpop'; pop.hidden = true;
  pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'When the site was updated');
  document.body.appendChild(pop);

  var S = null; // window.STATUS, once status.js has been read

  // The build that status.js names is LATER than the one this page loaded. status.js can also be the older one (a build that nothing refreshed
  // it after), and a page that has just loaded the newest build must not then ask for a reload that changes nothing (owner, 18 Nov 2026:
  // "I clicked Newer update ready ... when I reload it, it doesn't change"). Build marks are 14 digits, YYYYMMDDHHMMSS: the larger is later.
  function newerBuild() {
    var a = S && S.build ? Number(S.build) : 0, b = B.v ? Number(B.v) : 0;
    return a > 0 && b > 0 && a > b;
  }

  // ok: nothing newer is known. late: a drawing (or the register) was saved after this build began. reload: a later build is on disk.
  function state() {
    if (newerBuild()) return { kind: 'reload' };
    var newer = [];
    if (S && B.started) {
      (S.sources || []).forEach(function (s) { if (s.saved > B.started) newer.push(s); });
      if (S.register && S.register.saved > B.started) newer.push({ name: 'Sources register', saved: S.register.saved });
    }
    return newer.length ? { kind: 'late', newer: newer } : { kind: 'ok' };
  }

  function rows(st) {
    var late = {};
    (st.newer || []).forEach(function (s) { late[s.name] = s.saved; });
    var list = (B.sources || []).map(function (s) { return { name: s.name, saved: late[s.name] || s.ts, text: s.modified, late: !!late[s.name] }; });
    if (B.register && B.register.ts) list.push({ name: 'Sources register', saved: late['Sources register'] || B.register.ts, late: !!late['Sources register'] });
    return '<table>' + list.map(function (r) {
      var t = r.saved ? when(r.saved) : (r.text || 'not known'); // (a data.js from before the stamps has only the text)
      return '<tr><td>' + esc(r.name) + '</td><td' + (r.late ? ' class="late"' : '') + '>saved ' + esc(t) + (r.late ? ', not in this update' : '') + '</td></tr>';
    }).join('') + '</table>';
  }

  // the line under a warning: what happens next
  function next() {
    var fresh = S && S.checked && (Date.now() / 1000 - S.checked) < 25 * 60;
    if (S && S.building) return 'The site is being rebuilt now, which takes about 3 minutes. Then reload this page.';
    if (S && S.error) return 'The last automatic update did not finish. Run Rebuild explorer.bat, then reload this page.';
    if (fresh && S.auto) return 'The site refreshes by itself, within about 10 minutes. Then reload this page.';
    return 'The automatic update is not running. Run Rebuild explorer.bat, then reload this page.';
  }

  function paint() {
    var st = state(), txt = btn.querySelector('.utxt');
    btn.className = 'updbtn' + (st.kind === 'ok' ? '' : ' late');
    txt.textContent = st.kind === 'ok' ? 'Updated ' + when(BUILT) : st.kind === 'late' ? 'Out of date' : 'Newer update ready';
    btn.title = txt.textContent; btn.setAttribute('aria-label', txt.textContent); // (in a narrow window only the dot shows)
    if (pop.hidden) return;
    var html;
    if (st.kind === 'ok') {
      html = '<h4><i class="udot"></i>Updated ' + esc(B.date) + '</h4><div class="uw">Built from the drawings as last saved</div>' + rows(st);
    } else if (st.kind === 'late') {
      html = '<h4><i class="udot warn"></i>A drawing was saved after this update</h4>' + rows(st) + '<div class="unote">' + esc(next()) + '</div>';
    } else {
      html = '<h4><i class="udot warn"></i>A newer update is ready</h4><div class="unote">This page was opened before it. Reload the page to see it.</div><div class="urow"><button type="button" class="btn" id="updReload">Reload</button></div>';
    }
    // paint() runs again every minute (each time status.js is read). The pop-up is rebuilt only when its words changed: a new copy of the
    // Reload button every minute could replace the button under the reader's hand, or take the keyboard's focus off it.
    if (pop.getAttribute('data-h') === html) return;
    pop.setAttribute('data-h', html);
    pop.innerHTML = html;
    var rb = pop.querySelector('#updReload');
    if (rb) rb.addEventListener('click', function () { location.reload(); });
  }

  function openPop(on) {
    pop.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) paint();
  }
  btn.addEventListener('click', function (e) { e.stopPropagation(); openPop(pop.hidden); });
  document.addEventListener('click', function (e) { if (!pop.hidden && !pop.contains(e.target)) openPop(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) openPop(false); });

  // status.js: only from a file or from localhost; a hosted copy has none
  var local = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  function read() {
    var s = document.createElement('script');
    s.src = 'status.js?t=' + Date.now();
    s.onload = function () { S = window.STATUS || null; s.remove(); paint(); };
    s.onerror = function () { s.remove(); };
    document.head.appendChild(s);
  }
  paint();
  if (local) { read(); setInterval(read, 60000); }
})();

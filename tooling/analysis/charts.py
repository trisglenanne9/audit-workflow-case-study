"""Pictures for the problem analysis page: ranked bars, the priority matrix, fishbones, 5 Whys ladders and the
root-cause grid. Plain HTML and inline SVG, coloured by the CSS custom properties of the page (light and dark)."""
import html

E = lambda s: html.escape(str(s), quote=True)

CSS = """
:root{--crit:#d03b3b;--ser:#ec835a;--warn:#fab219;--good:#0ca30c}
.viz{--s1:#2a78d6;--s1w:rgba(42,120,214,.10);--grid:#e1e0d9;--axis:#c3c2b7;--surf:#fcfcfb}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .viz{--s1:#3987e5;--s1w:rgba(57,135,229,.14);--grid:#2c2c2a;--axis:#383835;--surf:#1a1a19}}
:root[data-theme="dark"] .viz{--s1:#3987e5;--s1w:rgba(57,135,229,.14);--grid:#2c2c2a;--axis:#383835;--surf:#1a1a19}
.bars{display:grid;grid-template-columns:minmax(180px,38%) 1fr 92px;gap:6px 10px;align-items:center;font-size:14px}
.bars .lab{line-height:1.3}
.bars .lab .n{font-weight:700;color:var(--muted);margin-right:4px}
.bars .track{position:relative;height:18px;border-left:1px solid var(--axis)}
.bars .bar{position:absolute;left:0;top:2px;height:14px;background:var(--s1);border-radius:0 4px 4px 0;min-width:2px;z-index:1}
.bars .rng{position:absolute;top:8px;height:2px;background:var(--muted);opacity:.55;z-index:0}
.bars .val small{display:block;font-size:11px;color:var(--muted)}
.bars .val{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.bars .cut{grid-column:1/-1;border-top:2px solid var(--ink);margin:4px 0 2px;padding-top:3px;font-size:12px;color:var(--muted)}
.bars .row{display:contents}
@media (max-width:640px){.bars{display:block}.bars .row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;margin:8px 0}.bars .row .track{grid-column:1/-1;grid-row:2}.bars .cut{margin:8px 0}}
.sev{display:inline-block;font-size:11px;font-weight:700;padding:0 6px;border-radius:8px;margin-left:6px;vertical-align:1px;border:1px solid var(--line);color:var(--ink)}
.sev::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:0}
.sev.t1::before{background:var(--crit)}.sev.t2::before{background:var(--ser)}.sev.t3::before{background:var(--warn)}.sev.t4::before{background:var(--good)}
.matrix svg{width:100%;max-width:760px;height:auto;display:block}
.matrix text{font:12px "Segoe UI",Helvetica,Arial,sans-serif;fill:var(--muted)}
.matrix .ql{font-size:13px;font-weight:700;fill:var(--ink)}
.matrix .pt text{font-size:11px;font-weight:700;fill:#fff}
.fish{display:grid;grid-template-columns:repeat(3,1fr) 190px;grid-template-rows:auto 26px auto;gap:0 12px;font-size:13px;margin:8px 0}
.fish .bone{border-left:2px solid var(--axis);padding:4px 10px 4px 10px;position:relative}
.fish .bone.up{border-bottom:none;align-self:end}
.fish .bone h4{margin:0 0 4px;font-size:13px}
.fish .bone ul{margin:0;padding-left:16px}
.fish .bone li{margin:2px 0}
.fish .spine{grid-column:1/4;grid-row:2;border-top:3px solid var(--ink);align-self:center}
.fish .head{grid-column:4;grid-row:1/4;align-self:center;background:var(--card);border:2px solid var(--ink);border-radius:10px;padding:10px;font-weight:700}
@media (max-width:760px){.fish{grid-template-columns:1fr;grid-template-rows:none}.fish .spine{display:none}.fish .head{grid-column:1;grid-row:auto;order:-1}.fish .bone{grid-row:auto!important;grid-column:auto!important}}
.whys{display:flex;flex-direction:column;gap:0;max-width:880px}
.whys .w{display:grid;grid-template-columns:74px 1fr;gap:10px;align-items:start;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 12px}
.whys .w .k{font-weight:800;color:var(--muted);font-size:13px;padding-top:1px}
.whys .w .src{display:block;color:var(--muted);font-size:12px;margin-top:2px}
.whys .arrow{width:2px;height:14px;background:var(--axis);margin-left:48px}
.whys .w.root{border:2px solid var(--crit)}
.whys .w.root .k{color:var(--crit)}
.whys .w.prob{border-left:5px solid var(--ink)}
.rcgrid{border-collapse:collapse;font-size:13px}
.rcgrid th,.rcgrid td{border-bottom:1px solid var(--line);padding:5px 6px;text-align:center}
.rcgrid th.rot{height:190px;vertical-align:bottom;white-space:nowrap;padding:0 2px}
.rcgrid th.rot span{display:inline-block;writing-mode:vertical-rl;transform:rotate(180deg);font-weight:600}
.rcgrid td.p{text-align:left;min-width:240px}
.rcgrid .dot{display:inline-block;width:12px;height:12px;border-radius:50%;background:var(--s1)}
.rcgrid tfoot td{font-weight:700}
"""


def ranked_bars(rows, cut_after=None, cut_text="", unit="hours a year", fmt=lambda v: f"{v:,.0f}"):
    """rows: list of dict(n, label, value, lo, hi, tier, tip). Bars share one scale from 0 to the largest high value."""
    top = max(max(r.get("hi") or r["value"], r["value"]) for r in rows) or 1
    out = ['<div class="viz bars" role="img" aria-label="Problems ranked by ' + E(unit) + '">']
    for i, r in enumerate(rows):
        w = 100 * r["value"] / top
        rng = ""
        if r.get("lo") is not None and r.get("hi") is not None and r["hi"] > r["lo"]:
            rng = f'<span class="rng" style="left:{100*r["lo"]/top:.1f}%;width:{100*(r["hi"]-r["lo"])/top:.1f}%"></span>'
        tier = f'<span class="sev t{r["tier"]}">{E(r.get("tiername",""))}</span>' if r.get("tier") else ""
        tip = E(r.get("tip") or f'{r["label"]}: {fmt(r["value"])} {unit}')
        sub = f'<small>{fmt(r["lo"])} to {fmt(r["hi"])}</small>' if rng else ""
        out.append(f'<div class="row"><div class="lab"><span class="n">{E(r["n"])}</span>{E(r["label"])}{tier}</div>'
                   f'<div class="track" title="{tip}">{rng}<span class="bar" style="width:{w:.1f}%"></span></div>'
                   f'<div class="val" title="{tip}">{fmt(r["value"])}{sub}</div></div>')
        if cut_after is not None and i == cut_after:
            out.append(f'<div class="cut">{E(cut_text)}</div>')
    out.append('</div>')
    return "\n".join(out)


def matrix(points, xlab="Effort to fix  →", ylab="Gain if fixed  →", quads=("Big projects: plan them", "Quick wins: do first",
                                                                            "Leave or bundle", "Fill-ins: when convenient"),
           xs=4.5, ys=4.5):
    """points: list of dict(n, x, y, label) on a 0-10 scale. Left = low effort. Top = high gain.
    quads: (top-right, top-left, bottom-right, bottom-left). xs, ys: where the quadrants split."""
    W, H, L, T, R, B = 760, 500, 56, 24, 20, 46
    pw, ph = W - L - R, H - T - B
    X = lambda v: L + pw * v / 10
    Y = lambda v: T + ph * (1 - v / 10)
    s = [f'<div class="viz matrix"><svg viewBox="0 0 {W} {H}" role="img" aria-label="Priority matrix: gain against effort">']
    s.append(f'<rect x="{L}" y="{T}" width="{X(xs)-L}" height="{Y(ys)-T}" fill="var(--s1w)"/>')
    for v in (0, 10):
        s.append(f'<line x1="{X(v)}" y1="{T}" x2="{X(v)}" y2="{T+ph}" stroke="var(--grid)" stroke-width="1"/>')
        s.append(f'<line x1="{L}" y1="{Y(v)}" x2="{L+pw}" y2="{Y(v)}" stroke="var(--grid)" stroke-width="1"/>')
    s.append(f'<line x1="{X(xs)}" y1="{T}" x2="{X(xs)}" y2="{T+ph}" stroke="var(--axis)" stroke-width="1"/>')
    s.append(f'<line x1="{L}" y1="{Y(ys)}" x2="{L+pw}" y2="{Y(ys)}" stroke="var(--axis)" stroke-width="1"/>')
    for v in range(0, 11, 2):
        s.append(f'<text x="{X(v)}" y="{T+ph+14}" text-anchor="middle">{v}</text>')
        s.append(f'<text x="{L-8}" y="{Y(v)+4}" text-anchor="end">{v}</text>')
    s.append(f'<line x1="{L}" y1="{T+ph}" x2="{L+pw}" y2="{T+ph}" stroke="var(--axis)" stroke-width="1"/>')
    s.append(f'<line x1="{L}" y1="{T}" x2="{L}" y2="{T+ph}" stroke="var(--axis)" stroke-width="1"/>')
    tr, tl, br, bl = quads
    s.append(f'<text class="ql" x="{X(0.2)}" y="{T+16}">{E(tl)}</text>')
    s.append(f'<text class="ql" x="{X(9.8)}" y="{T+16}" text-anchor="end">{E(tr)}</text>')
    s.append(f'<text class="ql" x="{X(0.2)}" y="{T+ph-8}">{E(bl)}</text>')
    s.append(f'<text class="ql" x="{X(9.8)}" y="{T+ph-8}" text-anchor="end">{E(br)}</text>')
    s.append(f'<text x="{L+pw/2}" y="{H-8}" text-anchor="middle">{E(xlab)} (low on the left, high on the right)</text>')
    s.append(f'<text x="16" y="{T+ph/2}" text-anchor="middle" transform="rotate(-90 16 {T+ph/2})">{E(ylab)}</text>')
    placed = []
    offs = [(0, 0)] + [(dx * 24, dy * 24) for r in (1, 2) for dx in range(-r, r + 1) for dy in range(-r, r + 1)
                       if max(abs(dx), abs(dy)) == r]
    for p in points:
        bx, by = X(p["x"]), Y(p["y"])
        for dx, dy in offs:  # move a dot that would sit on another to the nearest free place
            cx, cy = bx + dx, by + dy
            if all(abs(px - cx) >= 23 or abs(py - cy) >= 23 for px, py in placed) and L + 12 <= cx <= L + pw - 12 and T + 26 <= cy <= T + ph - 12:
                break
        placed.append((cx, cy))
        s.append(f'<g class="pt"><title>{E(p["n"])}. {E(p["label"])} (gain {p["y"]}/10, effort {p["x"]}/10)</title>'
                 f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="11" fill="var(--s1)" stroke="var(--surf)" stroke-width="2"/>'
                 f'<text x="{cx:.1f}" y="{cy+4:.1f}" text-anchor="middle">{E(p["n"])}</text></g>')
    s.append('</svg></div>')
    return "\n".join(s)


def fishbone(effect, bones):
    """bones: list of (category, [causes]) - six of them: three above the spine, three below."""
    up, down = bones[:3], bones[3:6]
    out = ['<div class="viz fish" role="img" aria-label="Fishbone diagram of causes">']
    for i, (cat, causes) in enumerate(up):
        out.append(f'<div class="bone up" style="grid-row:1;grid-column:{i+1}"><h4>{E(cat)}</h4><ul>' +
                   "".join(f"<li>{E(c)}</li>" for c in causes) + '</ul></div>')
    out.append('<div class="spine"></div>')
    out.append(f'<div class="head">{E(effect)}</div>')
    for i, (cat, causes) in enumerate(down):
        out.append(f'<div class="bone" style="grid-row:3;grid-column:{i+1}"><h4>{E(cat)}</h4><ul>' +
                   "".join(f"<li>{E(c)}</li>" for c in causes) + '</ul></div>')
    out.append('</div>')
    return "\n".join(out)


def whys(problem, chain, root_note=""):
    """chain: list of (answer, source). The last answer is the root cause."""
    out = ['<div class="whys">', f'<div class="w prob"><span class="k">Problem</span><span>{E(problem)}</span></div>']
    for i, (ans, src) in enumerate(chain, start=1):
        last = i == len(chain)
        out.append('<div class="arrow"></div>')
        k = f"Why {i}?"
        srcs = f'<span class="src">{E(src)}</span>' if src else ""
        lead = "<b>Root cause:</b> " if last else ""
        out.append(f'<div class="w{" root" if last else ""}"><span class="k">{E(k)}</span>'
                   f'<span>{lead}{E(ans)}{srcs}</span></div>')
    if root_note:
        out.append(f'<p class="muted" style="margin:6px 0 0">{E(root_note)}</p>')
    out.append('</div>')
    return "\n".join(out)


def rc_grid(problems, roots, links, hours):
    """problems: list of (n, label); roots: list of (code, short name); links: set of (n, code); hours: dict n -> hours."""
    out = ['<div class="scroll"><table class="viz rcgrid"><thead><tr><th style="text-align:left">Problem</th>']
    for code, name in roots:
        out.append(f'<th class="rot"><span>{E(code)} {E(name)}</span></th>')
    out.append('</tr></thead><tbody>')
    for n, label in problems:
        out.append(f'<tr><td class="p"><b>{E(n)}</b> {E(label)}</td>')
        for code, _ in roots:
            out.append('<td>' + ('<span class="dot" title="' + E(f"{n} has root cause {code}") + '"></span>' if (n, code) in links else '') + '</td>')
        out.append('</tr>')
    out.append('</tbody><tfoot><tr><td class="p">Problems fed by this root cause</td>')
    for code, _ in roots:
        out.append(f'<td>{sum(1 for (n, c) in links if c == code)}</td>')
    out.append('</tr><tr><td class="p">Staff hours a year behind it (mid estimate)</td>')
    for code, _ in roots:
        h = sum(hours.get(n, 0) for (n, c) in links if c == code)
        out.append(f'<td>{h:,.0f}</td>')
    out.append('</tr></tfoot></table></div>')
    return "\n".join(out)

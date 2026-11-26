"""Builds the process explorer site from swimlane drawings (.drawio).

    python3 explorer/build.py path/to/explorer.json             (full build: exports a picture of every page with draw.io)
    python3 explorer/build.py path/to/explorer.json --no-export (data only; keeps the page pictures of the last build)

explorer.json names the drawings, the site title and the output folder (see README). The drawings are never changed: the builder
exports a copy of each page. Reviewer material beside the lanes (comment tables, pink tags) is left off the pictures unless
"showReview" is "comments", which keeps the manager's comment tables and their numbered tags.
"""
import hashlib, json, os, re, shutil, subprocess, sys, tempfile, time, datetime
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import extract as X  # noqa: E402

OUT = None  # set from explorer.json ("out")
SRC = os.path.join(HERE, "site_src")
SHOW_REVIEW = False  # False: clean pictures; "comments": keep the manager's comment tables and tags; True: everything as drawn
LEGEND_TAG_TEXT = re.compile(r"the number is the row|Manager's comment of|Reviewer's comment of|^Open question:|^Change in v", re.I)
REVIEW_TABLE = re.compile(r"\s[–-]\s+(manager's|reviewer's) comments", re.I)
# a table's title: "<page name> – <what the table is>", as wide as the table (a cell in a table may also mention "the manager's comment")
TABLE_TITLE = re.compile(r"\s[–-]\s+(reviewer's comments|recent changes|changes in v\d|open questions|open points|manager's comments)", re.I)
TITLE_MIN_W = 400
OTHER_LEGEND = re.compile(r"^Recent change:|^Change in v|^Open question:|^Manager's comment of", re.I)  # legend entries of the other tables
C_TAG = re.compile(r"^C\d+$")  # a change tag ("C1"); the manager's tags are plain numbers


def drawio_exe():
    """draw.io desktop: the DRAWIO environment variable, else the usual place on macOS, Windows or Linux."""
    cands = [os.environ.get("DRAWIO", ""),
             "/Applications/draw.io.app/Contents/MacOS/draw.io",
             os.path.expanduser("~/Applications/draw.io.app/Contents/MacOS/draw.io"),
             shutil.which("drawio") or "", shutil.which("draw.io") or "",
             r"C:\Program Files\draw.io\draw.io.exe"]
    for c in cands:
        if c and os.path.exists(c):
            return c
    if sys.platform == "win32":  # the Microsoft Store app
        r = subprocess.run(["powershell", "-NoProfile", "-Command",
                            "(Get-AppxPackage -Name '*draw*' | Select-Object -First 1).InstallLocation"],
                           capture_output=True, text=True, timeout=60)
        exe = os.path.join(r.stdout.strip(), "app", "draw.io.exe")
        if r.stdout.strip() and os.path.exists(exe):
            return exe
    sys.exit("draw.io desktop was not found. Install it from https://github.com/jgraph/drawio-desktop/releases or set DRAWIO.")


def clean_copy(src, dst):
    """Writes a copy of the drawing without the reviewer material. Returns the number of cells removed."""
    tree = ET.parse(src)
    removed_total = 0
    for d in tree.getroot().findall("diagram"):
        root = d.find("mxGraphModel/root")
        els = list(root)
        info = {}
        for el in els:
            mc = el.find("mxCell") if el.tag in ("object", "UserObject") else el
            if mc is None:
                continue
            cid = el.get("id")
            label = el.get("label", "") if el.tag in ("object", "UserObject") else el.get("value", "")
            g = mc.find("mxGeometry")
            geo = None
            if g is not None and g.get("as") == "geometry":
                geo = [float(g.get(k, 0) or 0) for k in ("x", "y", "width", "height")]
            info[cid] = dict(el=el, parent=mc.get("parent"), style=mc.get("style") or "", label=label,
                             edge=mc.get("edge") == "1", source=mc.get("source"), target=mc.get("target"), geo=geo)
        layers = {cid for cid, c in info.items() if c["parent"] == "0"}
        top = [cid for cid, c in info.items() if c["parent"] in layers and "swimlane" in c["style"] and not c["edge"]]
        if not top:
            continue
        right = max(info[c]["geo"][0] + info[c]["geo"][2] for c in top if info[c]["geo"])
        drop = set()
        for cid, c in info.items():
            if c["parent"] in layers and cid not in top and not c["edge"] and c["geo"] and c["geo"][0] >= right - 5:
                drop.add(cid)
            if X.PINK in c["style"].lower():
                drop.add(cid)
            if not c["edge"] and LEGEND_TAG_TEXT.search(X.one_line(c["label"])):
                drop.add(cid)
        changed = True
        while changed:
            changed = False
            for cid, c in info.items():
                if cid in drop:
                    continue
                if c["parent"] in drop or (c["edge"] and (c["source"] in drop or c["target"] in drop)):
                    drop.add(cid)
                    changed = True
        for cid in drop:
            root.remove(info[cid]["el"])
        removed_total += len(drop)
    tree.write(dst, encoding="utf-8")
    return removed_total


def review_copy(src, dst):
    """Writes a copy of the drawing with the manager's comment tables, their number tags and their legend entry, and without the other
    reviewer material: the tables beside the lanes whose title is not the manager's (recent-changes tables, open questions),
    the "C" change tags and the legend entries of those tables. The legend itself stays whole. Returns the number of cells removed."""
    tree = ET.parse(src)
    removed_total = 0
    for d in tree.getroot().findall("diagram"):
        root = d.find("mxGraphModel/root")
        info = {}
        for el in list(root):
            mc = el.find("mxCell") if el.tag in ("object", "UserObject") else el
            if mc is None:
                continue
            label = el.get("label", "") if el.tag in ("object", "UserObject") else el.get("value", "")
            g = mc.find("mxGeometry")
            geo = None
            if g is not None and g.get("as") == "geometry":
                geo = [float(g.get(k, 0) or 0) for k in ("x", "y", "width", "height")]
            info[el.get("id")] = dict(el=el, parent=mc.get("parent"), style=mc.get("style") or "", text=X.one_line(label),
                                      edge=mc.get("edge") == "1", source=mc.get("source"), target=mc.get("target"), geo=geo)
        layers = {cid for cid, c in info.items() if c["parent"] == "0"}
        top = [cid for cid, c in info.items() if c["parent"] in layers and "swimlane" in c["style"] and not c["edge"] and c["geo"]]
        if not top:
            continue
        right = max(info[c]["geo"][0] + info[c]["geo"][2] for c in top)
        lanes_top = min(info[c]["geo"][1] for c in top)
        # the tables beside the lanes: top-level shapes to the right of the lanes and not above them (above them is the legend)
        beside = [cid for cid, c in info.items() if c["parent"] in layers and cid not in top and not c["edge"] and c["geo"]
                  and c["geo"][0] >= right - 5 and c["geo"][1] >= lanes_top - 5]
        titles = [cid for cid in beside if TABLE_TITLE.search(info[cid]["text"]) and info[cid]["geo"][2] >= TITLE_MIN_W]
        drop = set()
        for cid in beside:
            x, y = info[cid]["geo"][0], info[cid]["geo"][1]
            owner = [t for t in titles if info[t]["geo"][0] - 1 <= x < info[t]["geo"][0] + info[t]["geo"][2] and info[t]["geo"][1] <= y + 1]
            owner = max(owner, key=lambda t: info[t]["geo"][1]) if owner else None
            if owner is None or not REVIEW_TABLE.search(info[owner]["text"]):
                drop.add(cid)
                if owner is None:
                    print(f"    beside the lanes, under no table title, left off: {info[cid]['text'][:60]!r}")
        for cid, c in info.items():
            if X.PINK in c["style"].lower() and C_TAG.match(c["text"]):
                drop.add(cid)
            if not c["edge"] and OTHER_LEGEND.search(c["text"]):
                drop.add(cid)
        changed = True
        while changed:
            changed = False
            for cid, c in info.items():
                if cid in drop:
                    continue
                if c["parent"] in drop or (c["edge"] and (c["source"] in drop or c["target"] in drop)):
                    drop.add(cid)
                    changed = True
        for cid in drop:
            root.remove(info[cid]["el"])
        removed_total += len(drop)
    tree.write(dst, encoding="utf-8")
    return removed_total


def export_svg(exe, src, index, out):
    if os.path.exists(out):
        os.remove(out)
    args = [exe, "--export", "--format", "svg", "--page-index", str(index), "--output", out, src]
    for attempt in range(2):
        try:
            subprocess.run(args, capture_output=True, timeout=240)
        except subprocess.TimeoutExpired:
            pass
        for _ in range(60):
            if os.path.exists(out) and os.path.getsize(out) > 0:
                time.sleep(0.5)
                return True
            time.sleep(1)
    return False


DATA_URI = re.compile(r'(xlink:href|href)="(data:(image/[a-z+.-]+);base64,([A-Za-z0-9+/=]+))"')


def postprocess_svg(svg, img_dir):
    def repl(m):
        attr, uri, mime, b64 = m.groups()
        h = hashlib.sha1(b64.encode()).hexdigest()[:16]
        ext = {"image/png": "png", "image/svg+xml": "svg", "image/jpeg": "jpg", "image/gif": "gif"}.get(mime, "bin")
        name = f"{h}.{ext}"
        path = os.path.join(img_dir, name)
        if not os.path.exists(path):
            import base64
            with open(path, "wb") as f:
                f.write(base64.b64decode(b64))
        return f'{attr}="img/{name}"'

    # draw.io adds a picture of every text label as a fallback for old viewers; browsers show the text itself
    svg = re.sub(r"(</foreignObject>)\s*<image\b[^>]*/>", r"\1", svg)
    svg = DATA_URI.sub(repl, svg)
    svg = re.sub(r'\s(?:xlink:)?href="data:page/[^"]*"', "", svg)
    svg = svg.replace("color-scheme: light dark;", "color-scheme: light;")
    svg = re.sub(r"^<\?xml[^>]*>\s*", "", svg)
    svg = re.sub(r"^<!DOCTYPE[^>]*>\s*", "", svg)
    return svg


def replace_file(tmp, path):
    for _ in range(8):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:  # a reader (or the sync client) has the file for a moment
            time.sleep(0.25)
    shutil.move(tmp, path)


def write_atomic(path, text):
    """Writes a text file so that a reader never finds it half written or missing: the site can be open in a browser
    (or a walk through can be on its way to the next page) while it is rebuilt."""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    replace_file(tmp, path)


def copy_atomic(src, dst):
    tmp = dst + ".tmp"
    shutil.copy2(src, tmp)
    replace_file(tmp, dst)


def tidy_site(pages_dir, img_dir, page_ids):
    """After a full export: page files of pages that no longer exist, and pictures that no page uses any more, go.
    (Before 18 Nov 2026 the whole pages and img folders were deleted at the start of a build, so for about two minutes the site had no
    pictures: a walk through that crossed to another page ended, and a page opened then said it had no picture yet.)"""
    keep = {pid + ".js" for pid in page_ids}
    for name in os.listdir(pages_dir):
        if name not in keep:
            os.remove(os.path.join(pages_dir, name))
    used = set()
    for name in os.listdir(pages_dir):
        with open(os.path.join(pages_dir, name), encoding="utf-8") as f:
            used.update(re.findall(r"img/([0-9a-f]+\.[a-z]+)", f.read()))
    for name in os.listdir(img_dir):
        if name not in used:
            os.remove(os.path.join(img_dir, name))


def main():
    global OUT, SHOW_REVIEW
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    cfg = X.configure(args[0] if args else "explorer.json")
    X.add_system_rules(cfg.get("systems", []))
    OUT = os.path.join(X.ROOT, cfg.get("out", "site"))
    SHOW_REVIEW = cfg.get("showReview", False)
    no_export = "--no-export" in sys.argv
    t0 = time.time()
    data = X.build()
    cv = data.get("coverage", {})  # every shape drawn inside a lane must be in the site: the build says so, or lists what is not
    print(f"Coverage: {cv.get('drawn', 0)} shapes drawn inside lanes, {len(cv.get('missing', []))} not in the site")
    for m in cv.get("missing", []):
        print(f"  NOT IN THE SITE: {m['page']} {m['cell']} ({m['kind']}) {m['text']}")
    for p in data["pages"]:  # reviewer's comments: each row leads to the boxes that carry its pink number
        rows = (p.get("review") or {}).get("rows", {})
        if rows:
            bare = [n for n, r in rows.items() if not r["targets"]]
            print(f"Reviewer's comments {p['id']}: {len(rows)} rows, {len(rows) - len(bare)} lead to a box" + (f", NO BOX for row {', '.join(bare)}" if bare else ""))
    os.makedirs(OUT, exist_ok=True)
    pages_dir = os.path.join(OUT, "pages")
    img_dir = os.path.join(OUT, "img")
    # the pages and img folders are NOT emptied first: each page file is replaced in place when its export is done, so the site that is
    # open in a browser keeps all its pictures while the build runs (tidy_site() removes what is no longer used at the end)
    os.makedirs(pages_dir, exist_ok=True)
    os.makedirs(img_dir, exist_ok=True)

    if not no_export:
        exe = drawio_exe()
        tmp = tempfile.mkdtemp(prefix="pe_")
        try:
            for wf_id, wf_name, _, path in X.WORKFLOWS:
                clean = os.path.join(tmp, f"{wf_id}.drawio")
                if SHOW_REVIEW == "comments":  # the manager's comment tables and tags only
                    n = review_copy(path, clean)
                    print(f"{wf_name}: copy with the reviewer's comments, without {n} cells of the other reviewer material")
                elif SHOW_REVIEW:  # the drawing as drawn, every table and tag included (a copy, so that the export never holds the real file open)
                    shutil.copy2(path, clean)
                    print(f"{wf_name}: copy as drawn, with the comment tables and tags")
                else:
                    n = clean_copy(path, clean)
                    print(f"{wf_name}: clean copy without {n} reviewer cells")
                for p in data["pages"]:
                    if p["wf"] != wf_id or p.get("empty"):
                        continue
                    out = os.path.join(tmp, f"{p['id']}.svg")
                    ok = export_svg(exe, clean, p["index"], out)
                    if not ok:
                        print(f"  {p['id']}: EXPORT FAILED")
                        continue
                    svg = postprocess_svg(open(out, encoding="utf-8").read(), img_dir)
                    write_atomic(os.path.join(pages_dir, f"{p['id']}.js"), "window.__page(" + json.dumps(p["id"]) + "," + json.dumps(svg) + ");\n")
                    print(f"  {p['id']}: {len(svg) // 1024} KB")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        tidy_site(pages_dir, img_dir, [p["id"] for p in data["pages"] if not p.get("empty")])

    built = datetime.datetime.now().strftime("%d %b %Y, %H:%M")
    # "started" is when this build began reading the drawings: a drawing saved after that moment is not in the site (the "Updated" line and
    # auto_update.py compare the save times of the drawings and of the register with it); "ts" is a source's save time in seconds
    reg_file = X.REGISTER_FILE or ""
    data["build"] = dict(date=built, v=datetime.datetime.now().strftime("%Y%m%d%H%M%S"), started=int(t0),
                         sources=[dict(name=w["name"], file=w["file"], ts=int(w["modified"]),
                                       modified=datetime.datetime.fromtimestamp(w["modified"]).strftime("%d %b %Y, %H:%M"))
                                  for w in data["workflows"]],
                         register=dict(ts=int(os.path.getmtime(reg_file)) if os.path.exists(reg_file) else 0))
    for w in data["workflows"]:
        del w["modified"]
    data["map"] = cfg.get("map", {})
    data["wfTags"] = cfg.get("tags", {})
    write_atomic(os.path.join(OUT, "data.js"), "window.DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    # a version mark on every file the page loads, so that browsers fetch the new build instead of an old copy
    v = data["build"]["v"]
    for name in os.listdir(SRC):
        if name == "index.html":
            s = open(os.path.join(SRC, name), encoding="utf-8").read()
            title = cfg.get("title", "Process explorer")
            s = s.replace("<title>Audit End-to-End Workflow</title>", "<title>" + title + "</title>")
            s = s.replace('<div class="t1">Audit End-to-End Workflow</div>', '<div class="t1">' + title + "</div>")
            for f in ("style.css", "data.js", "flow.js", "app.js", "comments.js", "updated.js"):
                s = s.replace(f'"{f}"', f'"{f}?v={v}"')
            write_atomic(os.path.join(OUT, name), s)
        else:
            copy_atomic(os.path.join(SRC, name), os.path.join(OUT, name))
    missing = [p["id"] for p in data["pages"] if not p.get("empty") and not os.path.exists(os.path.join(pages_dir, p["id"] + ".js"))]
    if missing:
        print("No page picture yet for:", ", ".join(missing))
    print(f"Built in {time.time() - t0:.0f} s: {OUT}")


if __name__ == "__main__":
    main()

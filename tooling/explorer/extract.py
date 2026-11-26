"""Reads the current workflow drawings (.drawio) and the sources register, and returns the data the process explorer shows.

Only what the drawings and the register hold goes in: nothing is added by hand. Reviewer material (pink tags, the manager's comments,
changes and open-question tables, the title and the legend) is left out of the cells, because it sits outside the lanes. The one thing
kept of it is the link from each row of the manager's comment tables to the boxes that carry the same pink number (`review` of a page), so that
the site can lead from a comment to the change and back (owner, 19 Nov 2026).
"""
import html, os, re, sys, collections, xml.etree.ElementTree as ET

import json

# Set by configure() from the project's explorer.json (see README): where the drawings are and what the site is called.
ROOT = os.getcwd()
CONFIG = {}
WORKFLOWS = []  # (id, name, description, path of the .drawio file)
REGISTER_FILE = None  # optional JSON list of the files and systems the firm keeps (see README); None = no register


def configure(path):
    """Reads explorer.json. Paths in it are relative to the folder the file sits in."""
    global ROOT, CONFIG, WORKFLOWS, REGISTER_FILE
    path = os.path.abspath(path)
    ROOT = os.path.dirname(path)
    with open(path, encoding="utf-8") as f:
        CONFIG = json.load(f)
    WORKFLOWS = [(w["id"], w["name"], w.get("desc", ""), os.path.join(ROOT, w["file"])) for w in CONFIG["workflows"]]
    REGISTER_FILE = os.path.join(ROOT, CONFIG["register"]) if CONFIG.get("register") else None
    return CONFIG


PINK = "fce4ec"
REVIEW_TABLE = re.compile(r"\s[–-]\s+(manager's|reviewer's) comments", re.I)  # the title of a reviewer's comment table ("2. Fieldwork – manager's comments")
TAG_NUMBER = re.compile(r"^\d+$")  # a pink tag of the manager's ("3"); a change tag ("C3") is not one of hers


def plain(v):
    v = html.unescape(v or "")
    v = re.sub(r"<br\s*/?>", "\n", v, flags=re.I)
    v = re.sub(r"</(div|p|li)>", "\n", v, flags=re.I)
    v = re.sub(r"<[^>]+>", "", v)
    v = html.unescape(v).replace("\xa0", " ")
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in v.split("\n")]
    return "\n".join(ln for ln in lines if ln)


def one_line(v):
    return re.sub(r"\s+", " ", plain(v)).strip()


def style_map(st):
    out = {}
    for part in (st or "").split(";"):
        if not part:
            continue
        if "=" in part:
            k, val = part.split("=", 1)
            out[k] = val
        else:
            out[part] = "1"
    return out


def load_cells(diagram):
    root = diagram.find("mxGraphModel/root")
    cells = {}
    order = []
    for el in root:
        if el.tag in ("object", "UserObject"):
            mc = el.find("mxCell")
            cid = el.get("id")
            raw = el.get("label", "")
            link = el.get("link", "")
        else:
            mc = el
            cid = el.get("id")
            raw = el.get("value", "")
            link = ""
        if mc is None or cid is None:
            continue
        g = mc.find("mxGeometry")
        geo = None
        if g is not None and g.get("as") == "geometry":
            geo = [float(g.get("x", 0) or 0), float(g.get("y", 0) or 0),
                   float(g.get("width", 0) or 0), float(g.get("height", 0) or 0)]
        c = dict(id=cid, parent=mc.get("parent"), style=mc.get("style") or "", raw=raw, link=link,
                 vertex=mc.get("vertex") == "1", edge=mc.get("edge") == "1",
                 source=mc.get("source"), target=mc.get("target"), geo=geo)
        c["s"] = style_map(c["style"])
        cells[cid] = c
        order.append(cid)
    kids = collections.defaultdict(list)
    for cid in order:
        kids[cells[cid]["parent"]].append(cid)
    return cells, order, kids


def is_swimlane(c):
    return "swimlane" in c["s"]


def is_pink(c):
    return PINK in c["style"].lower()


def actor_of(raw):
    m = re.search(r"<b[^>]*color:\s*rgb\(255,\s*0,\s*0\)[^>]*>(.*?)</b>", html.unescape(raw or ""), flags=re.S | re.I)
    if not m:
        m = re.search(r"<font[^>]*color=\"?#(?:ff0000|cc0000)\"?[^>]*>\s*<b>(.*?)</b>", html.unescape(raw or ""), flags=re.S | re.I)
    return one_line(m.group(1)) if m else ""


def kind_of(c, cells):
    s = c["s"]
    shape = s.get("shape", "")
    t = one_line(c["raw"])
    if shape == "offPageConnector":
        return "connector"
    if "multi-document" in shape:
        # the white multi-document shape is an Excel file, or a Microsoft Forms form when its label ends "(Microsoft Forms)" (CLAUDE.md
        # point 3); a form is listed with the documents, not with the Excel files (18 Nov 2026: the Staff Claim Form was listed as nothing)
        return "document" if re.search(r"\(Microsoft Forms\)\s*$", t) else "excel"
    if shape == "document":
        return "document"
    if shape == "image" or "image" in s and s.get("image", "").startswith("data:"):
        par = cells.get(c["parent"])
        if par and "multi-document" in par["s"].get("shape", ""):
            return "icon"
        return "system" if t else "icon"
    if "rhombus" in s:
        return "decision"
    if "ellipse" in s:
        par = cells.get(c["parent"])
        if par and par["s"].get("shape") == "offPageConnector":
            return "letter"
        if t.upper().startswith(("START", "END")):
            return "terminal"
        return "terminal" if t else "shape"
    if "text" in s:
        if t.lower().startswith("note"):
            return "note"
        return "label" if t else "shape"
    if t:
        return "step"
    return "shape"


WRITE = r"\b(records?|enters?|updates?|logs?|adds?|fills? in|keys? in|saves?|inputs?|compiles?|amends?|completes?|marks?|prepares?|creates?|imports?|uploads?|posts?|types?)\b"
READ = r"\b(checks?|reads?|refers?|filters?|reviews?|looks?|compares?|reconciles?|downloads?|monitors?|tracks?|follows? up|finds?|obtains?)\b"

SYSTEM_RULES = [
    ("Practice management system", r"\bpractice management system\b"),
    ("Audit software", r"\baudit software\b"),
    ("Power Apps", r"\bPower Apps\b"),
    ("Power Automate", r"\bPower Automate\b"),
    ("SharePoint", r"\bSharePoint\b"),
    ("OneDrive", r"\bOneDrive\b"),
    ("Microsoft Teams", r"\bMicrosoft Teams\b"),
    ("WhatsApp", r"\bWhatsApp\b"),
    ("Email", r"\be-?mails?\b|\bemailed\b|\bemailing\b"),
    ("Phone call", r"\bphone\b|\bcalls? the\b|\bby call\b"),
    ("Courier or despatch", r"\bcourier\b|\bdespatch\b|\bdispatch(es)?\b"),
]


def add_system_rules(extra):
    """Firm-specific systems from explorer.json ("systems": [["Name", "regex"], ...]) go before the generic ones."""
    global ICON_SYSTEM
    SYSTEM_RULES[:0] = [tuple(x) for x in extra]
    ICON_SYSTEM = [(n, re.compile(p)) for n, p in SYSTEM_RULES if n not in ("Email", "Phone call", "Courier or despatch")]


ICON_SYSTEM = [(n, re.compile(p)) for n, p in SYSTEM_RULES if n not in ("Email", "Phone call", "Courier or despatch")]


def system_of_icon(label):
    for n, rx in ICON_SYSTEM:
        if rx.search(label):
            return n
    return label


# Drawing name of a file or system -> its entry in the register (optional; explorer.json "registerAliases")
REGISTER_ALIASES, SYSTEM_REGISTER, GROUP_REGISTER, DOC_REGISTER, AKA = {}, {}, {}, {}, {}


def excel_name(label):
    n = re.sub(r"\s*\(Excel\)\s*$", "", one_line(label)).strip()
    return n


def doc_name(raw):
    first = plain(raw).split("\n")[0]
    return first.strip()


def doc_key(name):
    return re.sub(r"\s*\((hard copy|content)\)\s*", " ", name, flags=re.I).strip()


def is_group(label):
    return bool(re.search(r"\bgroup\b|\bchat\b", label, flags=re.I))


def main_sentence(text):
    return re.split(r"\n\s*Time:", text)[0]


def how_used(text):
    s = main_sentence(text)
    w = re.search(WRITE, s, flags=re.I)
    r = re.search(READ, s, flags=re.I)
    if w and (not r or w.start() < r.start()):
        return "records"
    if r:
        return "reads"
    return "uses"


def clean_side(text):
    """The words a connector says about what passes through it, without the page reference."""
    t = re.sub(r"^(Continues (in|on)|From)\s*:?\s*", "", text.strip(), flags=re.I)
    parts = re.split(r"\)\s*:\s*|\s:\s|:\s", t)
    last = parts[-1].strip() if len(parts) > 1 else ""
    if not last:
        m = re.search(r"\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$", t)
        return m.group(1).strip() if m else ""
    names = "|".join(re.escape(w[1]) for w in WORKFLOWS) or "$^"
    last = re.sub(r"^(" + names + r")\s*,?\s*", "", last)
    if re.match(r"^([0-9]+|[A-F])\.\s", last):
        m = re.search(r"\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$", last)
        return m.group(1).strip() if m else ""
    return last


def load_register():
    """The register: a JSON list of {section, name, what, kept, shared, where, workflows, status, links}. Optional."""
    if not REGISTER_FILE or not os.path.exists(REGISTER_FILE):
        return {}
    with open(REGISTER_FILE, encoding="utf-8") as f:
        rows = json.load(f)
    al = CONFIG.get("registerAliases", {})
    REGISTER_ALIASES.update({k.lower(): v for k, v in al.get("excel", {}).items()})
    SYSTEM_REGISTER.update(al.get("system", {}))
    GROUP_REGISTER.update(al.get("group", {}))
    DOC_REGISTER.update({k.lower(): v for k, v in al.get("document", {}).items()})
    return {r["name"]: dict(r, links=r.get("links", [])) for r in rows}


def page_key(wf, name):
    m = re.match(r"\s*([0-9]+|[A-Z])\.", name)
    return f"{wf}-{m.group(1) if m else re.sub(r'[^a-z0-9]+', '', name.lower())[:6]}"


def review_rows(cells, order, layers, top, abs_geo, keep):
    """the manager's comments of a page, row by row: the cells of the row in her table beside the lanes, the pink tags of the same number inside
    the lanes, and the boxes those tags sit on (owner, 19 Nov 2026: "for all the manager's comments ... When I click on it, it can straight
    away lead me to the change on the workflow"). A row is found by where its cells sit: the same top and height as the pink "Ref" cell, inside
    the table's width. A tag's box is the shape its name says ("<box>-m3"), or else the shape it sits on the top-left corner of. The legend
    above the lanes shows a sample tag, which is left out. {} when the page has no table of hers."""
    ag = {c: abs_geo(c) for c in order if cells[c]["vertex"]}
    right = max(abs_geo(c)[0] + abs_geo(c)[2] for c in top)
    lanes_top = min(abs_geo(c)[1] for c in top)
    titles = [c for c in ag if cells[c]["parent"] in layers and ag[c][0] >= right - 5 and ag[c][1] >= lanes_top - 5
              and ag[c][2] >= 400 and REVIEW_TABLE.search(one_line(cells[c]["raw"]))]
    rows = {}
    for t in titles:
        tx, ty, tw, th = ag[t]
        beside = [c for c in ag if cells[c]["parent"] in layers and tx - 1 <= ag[c][0] < tx + tw and ag[c][1] >= ty + th - 1]
        refs = [c for c in beside if is_pink(cells[c]) and TAG_NUMBER.match(one_line(cells[c]["raw"]))]
        for r in sorted(refs, key=lambda c: ag[c][1]):
            n = one_line(cells[r]["raw"])
            row = sorted((c for c in beside if abs(ag[c][1] - ag[r][1]) <= 1 and abs(ag[c][3] - ag[r][3]) <= 1), key=lambda c: ag[c][0])
            if n not in rows:
                rows[n] = dict(cells=row, tags=[], targets=[])
    if not rows:
        return {}
    tags = []
    for c in ag:
        n = one_line(cells[c]["raw"])
        if is_pink(cells[c]) and TAG_NUMBER.match(n) and n in rows and ag[c][0] < right - 5 and ag[c][1] >= lanes_top:
            tags.append((ag[c][1], ag[c][0], c, n))
    for y, x, c, n in sorted(tags):
        rows[n]["tags"].append(c)
        m = re.match(r"^(.+)-[a-z]\d+$", c)
        box = m.group(1) if m and m.group(1) in keep else None
        if box is None:  # by where the tag sits
            cx, cy = x + ag[c][2] / 2, y + ag[c][3] / 2
            best = None
            for k, it in keep.items():
                g = it.get("geo")
                if not g or it["kind"] == "label":
                    continue
                if g[0] - 16 <= cx <= g[0] + g[2] + 16 and g[1] - 16 <= cy <= g[1] + g[3] + 16:
                    d = ((cx - g[0]) ** 2 + (cy - g[1]) ** 2) ** 0.5  # the tag sits on the top-left corner
                    if best is None or d < best[0]:
                        best = (d, k)
            box = best[1] if best else None
        if box and box not in rows[n]["targets"]:
            rows[n]["targets"].append(box)
    return dict(rows=rows)


def parse_page(wf_id, wf_name, idx, diagram):
    cells, order, kids = load_cells(diagram)
    layers = {cid for cid in order if cells[cid]["parent"] == "0"}
    top = [cid for cid in order if cells[cid]["parent"] in layers and is_swimlane(cells[cid]) and not cells[cid]["edge"]]
    name = diagram.get("name")
    page = dict(id=page_key(wf_id, name), wf=wf_id, wfName=wf_name, name=name, index=idx, diagramId=diagram.get("id"),
                lanes=[], cells={}, edges=[], connectors=[])
    if not top:
        texts = [one_line(cells[c]["raw"]) for c in order if one_line(cells[c]["raw"])]
        page["empty"] = True
        page["note"] = " ".join(texts[1:])[:600] if len(texts) > 1 else ""
        return page, cells

    def swim_children(cid):
        return [k for k in kids[cid] if is_swimlane(cells[k]) and not cells[k]["edge"]]

    lane_info = {}

    def walk(cid, group, dept):
        sub = swim_children(cid)
        title = one_line(cells[cid]["raw"])
        if not sub:
            lane_info[cid] = dict(id=cid, title=title, group=group, dept=dept or group,
                                  color=cells[cid]["s"].get("fillColor", ""))
            return
        for k in sub:
            if cid in top:
                walk(k, title, None)
            else:
                walk(k, group, dept or title)

    for t in top:
        walk(t, one_line(cells[t]["raw"]), None)
    dept_colors = {}
    for cid, c in cells.items():
        if is_swimlane(c) and swim_children(cid) and cid not in top:
            dept_colors[one_line(c["raw"])] = c["s"].get("fillColor", "")
    for li in lane_info.values():
        li["deptColor"] = dept_colors.get(li["dept"], li["color"])
        # absolute x for ordering
        x, cur = 0.0, li["id"]
        while cur in cells and cells[cur]["geo"]:
            x += cells[cur]["geo"][0]
            cur = cells[cur]["parent"]
        li["x"] = x
    page["lanes"] = sorted(lane_info.values(), key=lambda l: l["x"])

    def lane_of(cid):
        cur = cells[cid]["parent"]
        while cur in cells:
            if cur in lane_info:
                return cur
            cur = cells[cur]["parent"]
        return None

    # A shape that sits inside a lane on the drawing belongs to that lane even when draw.io holds it as a loose shape on the page and not
    # as a child of the lane (the HR system, Microsoft Forms and Power Automate symbols of 18 Nov 2026 were added that way, and the build
    # skipped all 22 of them: the owner searched for HR system and found nothing). Only a shape on the page itself counts (not the inside of
    # another shape); the title, the legend and the tables lie outside the lanes, so they stay out.
    def abs_geo(cid):
        ax = ay = 0.0
        w = h = 0.0
        cur, first = cid, True
        while cur in cells and cells[cur]["geo"]:
            g = cells[cur]["geo"]
            ax += g[0]
            ay += g[1]
            if first:
                w, h, first = g[2], g[3], False
            cur = cells[cur]["parent"]
        return ax, ay, w, h

    lane_rects = []
    for li in page["lanes"]:
        ax, ay, w, h = abs_geo(li["id"])
        lane_rects.append((li["id"], ax, ay, ax + w, ay + h))
    ends = {c["source"] for c in cells.values() if c["edge"] and c["source"]} | {c["target"] for c in cells.values() if c["edge"] and c["target"]}

    def lane_by_place(cid):
        ax, ay, w, h = abs_geo(cid)
        cx, cy = ax + w / 2, ay + h / 2
        for lid, x1, y1, x2, y2 in lane_rects:
            if x1 <= cx <= x2 and y1 <= cy <= y2:
                return lid
        return None

    keep = {}
    for cid in order:
        c = cells[cid]
        if c["edge"] or is_swimlane(c) or not c["vertex"] or is_pink(c):
            continue
        ln = lane_of(cid)
        loose = False
        if not ln:
            if c["parent"] in layers and kind_of(c, cells) not in ("shape", "icon", "letter"):
                ln = lane_by_place(cid)
                loose = bool(ln)
            if not ln:
                continue
        # skip anything sitting inside a pink tag
        par = cells.get(c["parent"])
        if par is not None and is_pink(par):
            continue
        k = kind_of(c, cells)
        if k in ("shape", "icon"):
            continue
        if loose and k == "step" and cid not in ends:
            k = "note"  # a banner of text on the page that no arrow touches is a note, not a step of the flow
        text = plain(c["raw"])
        item = dict(id=cid, kind=k, text=text, lane=ln)
        if loose:
            item["loose"] = True
        if c["geo"]:  # where the shape sits on the page (drawing units), so the walk-through can read the page top to bottom
            ax = ay = 0.0
            cur = cid
            while cur in cells and cells[cur]["geo"]:
                ax += cells[cur]["geo"][0]
                ay += cells[cur]["geo"][1]
                cur = cells[cur]["parent"]
            item["geo"] = [round(ax), round(ay), round(c["geo"][2]), round(c["geo"][3])]
        if k == "step" or k == "decision":
            a = actor_of(c["raw"])
            if a:
                item["actor"] = a
            m = re.search(r"\bTime:\s*(.+)$", text, flags=re.M)
            if m:
                item["time"] = m.group(1).strip()
        if k == "excel":
            item["name"] = excel_name(c["raw"])
        if k == "system":
            item["name"] = system_of_icon(one_line(c["raw"]))
            item["label"] = one_line(c["raw"])
        if k == "document":
            item["name"] = doc_name(c["raw"])
        if c["link"]:
            item["link"] = c["link"]
        keep[cid] = item

    # letters on connectors
    for cid, item in list(keep.items()):
        if item["kind"] == "letter":
            par = keep.get(cells[cid]["parent"])
            if par:
                par["letter"] = one_line(cells[cid]["raw"])
            del keep[cid]

    def resolve(cid):
        while cid and cid not in keep and cid in cells:
            cid = cells[cid]["parent"]
        return cid if cid in keep else None

    page["edgeIds"] = []  # every arrow of the page, also those that end on a note or a label (the walk-through fades them all)
    for cid in order:
        c = cells[cid]
        if not c["edge"]:
            continue
        page["edgeIds"].append(cid)
        s, t = resolve(c["source"]), resolve(c["target"])
        if not s or not t or s == t:
            continue
        lab = one_line(c["raw"]) or " ".join(one_line(cells[k]["raw"]) for k in kids[cid] if one_line(cells[k]["raw"]))
        page["edges"].append(dict(id=cid, s=s, t=t, dashed=c["s"].get("dashed") == "1", label=lab))

    page["cells"] = keep
    page["review"] = review_rows(cells, order, layers, top, abs_geo, keep)
    # Coverage check: every shape drawn inside a lane, found by where it sits and not by how draw.io nests it, must be in the site (or be
    # the inside of a shape that is). Anything listed here is on the drawing and not on the site: build.py prints it and data.js keeps it.
    drawn = 0
    page["notShown"] = []
    for cid in order:
        c = cells[cid]
        if c["edge"] or is_swimlane(c) or not c["vertex"] or is_pink(c):
            continue
        k = kind_of(c, cells)
        if k in ("shape", "icon", "letter"):
            continue
        anc, inside = c["parent"], False
        while anc in cells:
            if anc in keep or is_pink(cells[anc]):
                inside = True
                break
            anc = cells[anc]["parent"]
        if inside or not lane_by_place(cid):
            continue
        drawn += 1
        if cid not in keep:
            page["notShown"].append(dict(cell=cid, kind=k, text=one_line(c["raw"])[:90]))
    page["drawnInLanes"] = drawn
    for cid, item in keep.items():
        if item["kind"] == "connector":
            t = one_line(cells[cid]["raw"])
            page["connectors"].append(dict(cell=cid, letter=item.get("letter", ""), text=t,
                                           dir="in" if t.lower().startswith("from") else "out",
                                           link=item.get("link", ""), lane=item["lane"]))
    return page, cells


def target_hint(text):
    """Which workflow and page a connector's words point to: (wf or None, page token or None)."""
    wf = None
    for wid, name, _d, _p in sorted(WORKFLOWS, key=lambda w: -len(w[1])):
        if re.search(re.escape(name), text, flags=re.I):
            wf = wid
            break
    m = re.search(r"[,:]\s*([0-9]+|[A-Z])\.\s", text) or re.search(r"\bpage\s+([0-9]+|[A-Z])\b", text)
    return wf, (m.group(1) if m else None)


def build():
    register = load_register()
    workflows, pages = [], []
    for wf_id, wf_name, wf_desc, path in WORKFLOWS:
        root = ET.parse(path).getroot()
        diags = root.findall("diagram")
        wf = dict(id=wf_id, name=wf_name, desc=wf_desc, file=os.path.relpath(path, ROOT),
                  modified=os.path.getmtime(path), pages=[])
        for i, d in enumerate(diags, start=1):
            pg, _ = parse_page(wf_id, wf_name, i, d)
            pages.append(pg)
            wf["pages"].append(pg["id"])
        workflows.append(wf)
    by_id = {p["id"]: p for p in pages}
    diag_to_page = {(p["wf"], p["diagramId"]): p["id"] for p in pages}

    # ---------------------------------------------------------------- connectors and their partners
    conns = []
    for p in pages:
        for c in p["connectors"]:
            c = dict(c, page=p["id"], wf=p["wf"], id=f"{p['id']}:{c['cell']}")
            conns.append(c)
    by_letter = collections.defaultdict(list)
    for c in conns:
        if c["letter"]:
            by_letter[c["letter"]].append(c)
    for c in conns:
        partners = [o for o in by_letter.get(c["letter"], []) if o is not c and o["dir"] != c["dir"]] if c["letter"] else []
        if not partners and c["link"].startswith("data:page/id,"):
            tp = diag_to_page.get((c["wf"], c["link"].split(",", 1)[1]))
            if tp:
                back = [o for o in conns if o["page"] == tp and o["dir"] != c["dir"] and
                        (o["link"].split(",", 1)[-1] == by_id[c["page"]]["diagramId"])]
                if len(back) > 1:
                    words = set(re.findall(r"[a-z]{4,}", c["text"].lower()))
                    back.sort(key=lambda o: -len(words & set(re.findall(r"[a-z]{4,}", o["text"].lower()))))
                partners = back[:1]
                if not partners:
                    c["toPage"] = tp
        if not partners and not c.get("toPage"):
            wf, pg = target_hint(c["text"])
            if wf is None:
                wf = c["wf"]
            if wf:
                cand = f"{wf}-{pg}" if pg else None
                if cand in by_id:
                    c["toPage"] = cand
                    back = [o for o in conns if o["page"] == cand and o["dir"] != c["dir"] and not o["letter"]
                            and (target_hint(o["text"])[0] in (c["wf"], None))]
                    if len(back) == 1:
                        partners = back
                elif wf != c["wf"]:
                    c["toWf"] = wf
        if partners:
            c["partner"] = partners[0]["id"]
            c["toPage"] = partners[0]["page"]
    # carries: what the connector's own words say passes through it
    for c in conns:
        c["carries"] = clean_side(c["text"])

    links = []
    seen = set()
    for c in conns:
        a, b = c["page"], c.get("toPage")
        if not b or a == b:
            continue
        src, dst = (a, b) if c["dir"] == "out" else (b, a)
        key = (src, dst, c["letter"] or c.get("partner") or c["id"])
        if key in seen:
            continue
        seen.add(key)
        out_side = c if c["dir"] == "out" else (next((o for o in conns if o["id"] == c.get("partner")), None) or c)
        in_side = c if c["dir"] == "in" else (next((o for o in conns if o["id"] == c.get("partner")), None))
        links.append(dict(src=src, dst=dst, letter=c["letter"], out=out_side["id"] if out_side["dir"] == "out" else None,
                          inn=in_side["id"] if in_side and in_side["dir"] == "in" else None,
                          carries=((in_side or {}).get("carries") or out_side.get("carries") or ""),
                          cross=by_id[src]["wf"] != by_id[dst]["wf"]))

    # ---------------------------------------------------------------- resources: Excel files, documents, systems, groups
    res = {}

    def res_get(kind, name):
        key = kind + ":" + name.lower()
        if key not in res:
            res[key] = dict(id=key, kind=kind, name=name, symbols=[], uses=[])
        return res[key]

    excel_names, doc_names = set(), set()
    for p in pages:
        for it in p["cells"].values():
            if it["kind"] == "excel":
                excel_names.add(it["name"])
            if it["kind"] == "document":
                doc_names.add(it["name"])
    # words searched for in the steps: the file's own name, and for documents the name without "(hard copy)"
    match_words = [("excel", n, n.lower()) for n in excel_names]
    match_words += [("document", n, doc_key(n).lower()) for n in doc_names if len(doc_key(n)) >= 8]

    for p in pages:
        cells = p["cells"]
        page_docs = {it["name"] for it in cells.values() if it["kind"] == "document"}
        adj = collections.defaultdict(set)
        for e in p["edges"]:
            if e["dashed"]:
                adj[e["s"]].add(e["t"])
                adj[e["t"]].add(e["s"])
        for cid, it in cells.items():
            if it["kind"] not in ("excel", "document", "system"):
                continue
            targets = [res_get(it["kind"], it["name"])]
            if it["kind"] == "system" and is_group(it.get("label", "")):
                targets.append(res_get("group", it["label"]))
            for r in targets:
                r["symbols"].append(dict(page=p["id"], cell=cid, label=it.get("label") or it["name"], lane=it["lane"]))
                for other in adj[cid]:
                    o = cells.get(other)
                    if o and o["kind"] in ("step", "decision"):
                        r["uses"].append(dict(page=p["id"], cell=other, via="arrow"))
        for cid, it in cells.items():
            if it["kind"] not in ("step", "decision"):
                continue
            low = main_sentence(it["text"]).lower()
            for kind, n, w in match_words:
                # a document's words are matched only on a page that draws that document: "final reminder letter"
                # means the management accounts letter on one page and the fee collection letter on another
                if kind == "document" and n not in page_docs:
                    continue
                if w in low:
                    res_get(kind, n)["uses"].append(dict(page=p["id"], cell=cid, via="text"))
            for sname, rx in SYSTEM_RULES:
                if re.search(rx, main_sentence(it["text"])):
                    res_get("system", sname)["uses"].append(dict(page=p["id"], cell=cid, via="text"))

    page_order = [p["id"] for p in pages]
    wf_order = [w[0] for w in WORKFLOWS]
    for r in res.values():
        seen = {}
        for u in r["uses"]:
            k = (u["page"], u["cell"])
            if k not in seen:
                seen[k] = u
            elif u["via"] == "arrow":
                seen[k]["via"] = "arrow"
        r["uses"] = sorted(seen.values(), key=lambda u: (page_order.index(u["page"]), u["cell"]))
        for u in r["uses"]:
            p = by_id[u["page"]]
            it = p["cells"][u["cell"]]
            u["how"] = how_used(it["text"])
            ln = next(l for l in p["lanes"] if l["id"] == it["lane"])
            u["dept"] = ln["dept"]
            u["role"] = ln["title"]
        pg = {u["page"] for u in r["uses"]} | {s["page"] for s in r["symbols"]}
        r["pages"] = sorted(pg, key=page_order.index)
        r["workflows"] = sorted({by_id[x]["wf"] for x in pg}, key=wf_order.index)
        r["depts"] = sorted({u["dept"] for u in r["uses"]})
        r["roles"] = sorted({u["role"] for u in r["uses"]})
        r["records"] = sum(1 for u in r["uses"] if u["how"] == "records")
        r["reads"] = sum(1 for u in r["uses"] if u["how"] == "reads")
        reg_name = None
        if r["kind"] == "excel":
            reg_name = REGISTER_ALIASES.get(r["name"].lower())
        elif r["kind"] == "system":
            reg_name = SYSTEM_REGISTER.get(r["name"])
        elif r["kind"] == "group":
            reg_name = GROUP_REGISTER.get(r["name"])
        elif r["kind"] == "document":
            reg_name = DOC_REGISTER.get(doc_key(r["name"]).lower())
        if reg_name and reg_name in register:
            r["register"] = register[reg_name]
        if r["name"] in AKA:
            r["aka"] = AKA[r["name"]]
        flags = []
        if len(r["workflows"]) > 1:
            flags.append("shared-wf")
        if len(r["depts"]) > 1:
            flags.append("shared-dept")
        if len(r["pages"]) == 1:
            flags.append("one-page")
        if r["kind"] in ("excel", "document") and r["records"] and not r["reads"]:
            flags.append("no-read")
        if r["kind"] == "excel" and len(r["pages"]) == 1 and len(r["roles"]) <= 1:
            flags.append("review")
        r["flags"] = flags

    # register entries that no drawing shows as a symbol
    used_reg = {r["register"]["name"] for r in res.values() if r.get("register")}
    reg_only = []
    for name, e in register.items():
        if name in used_reg:
            continue
        if not (e["section"].startswith("Excel") or e["section"] in ("Systems", "Groups and channels")):
            continue
        st = e["status"].upper()
        flags = ["not-drawn"]
        if "NOT IN USE" in st:
            flags.append("not-in-use")
        if "NOT IN ANY WORKFLOW" in (e["workflows"] or "").upper():
            flags.append("no-workflow")
        reg_only.append(dict(id="reg:" + name.lower(), kind="register", name=name, register=e, flags=flags))

    # ---------------------------------------------------------------- page summaries
    for p in pages:
        if p.get("empty"):
            continue
        cnt = collections.Counter(it["kind"] for it in p["cells"].values())
        p["stats"] = dict(steps=cnt["step"], decisions=cnt["decision"], connectors=cnt["connector"],
                          excel=cnt["excel"], systems=cnt["system"], documents=cnt["document"], notes=cnt["note"])
        depts = []
        for l in p["lanes"]:
            if l["dept"] not in [d["name"] for d in depts]:
                depts.append(dict(name=l["dept"], color=l["deptColor"], group=l["group"]))
        p["depts"] = depts
        p["resources"] = sorted({r["id"] for r in res.values() if p["id"] in r["pages"]})

    coverage = dict(drawn=sum(p.get("drawnInLanes", 0) for p in pages if not p.get("empty")),
                    missing=[dict(page=p["id"], **m) for p in pages if not p.get("empty") for m in p.get("notShown", [])])
    return dict(workflows=workflows, pages=pages, connectors=conns, links=links,
                resources=sorted(res.values(), key=lambda r: (r["kind"], -len(r["pages"]), r["name"].lower())),
                registerOnly=reg_only, coverage=coverage)


if __name__ == "__main__":
    configure(sys.argv[1] if len(sys.argv) > 1 else "explorer.json")
    add_system_rules(CONFIG.get("systems", []))
    data = build()
    for p in data["pages"]:
        print(p["id"], p["name"], p.get("stats"), "lanes:", len(p["lanes"]))
    print()
    for c in data["connectors"]:
        print(f"{c['page']:7} {c['letter'] or '-':2} {c['dir']:3} -> {c.get('toPage', c.get('toWf', '?')):7} partner={c.get('partner', '')[:30]:30} | {c['text'][:90]}")
    print()
    for l in data["links"]:
        print(l["src"], "->", l["dst"], l["letter"], "|", l["carries"][:70])
    print()
    for r in data["resources"]:
        print(f"{r['kind']:8} {len(r['pages']):2}p {len(r['uses']):3}u rec={r['records']:2} read={r['reads']:2} {r['flags']} reg={'Y' if r.get('register') else '-'} | {r['name'][:60]}")
    print("register only:", len(data["registerOnly"]))
    for r in data["registerOnly"]:
        print("   ", r["flags"], r["name"][:80])
    cv = data["coverage"]
    print(f"coverage: {cv['drawn']} shapes drawn inside lanes, {len(cv['missing'])} not in the site")
    for m in cv["missing"]:
        print("   NOT IN THE SITE:", m["page"], m["cell"], m["kind"], "|", m["text"])

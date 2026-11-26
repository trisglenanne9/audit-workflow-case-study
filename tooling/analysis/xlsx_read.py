"""Read an .xlsx/.xlsm with the standard library only: sheet names, the heading row of a sheet, and cell values.
Used for the data walk of 19 Nov 2026 (headings and counts only; no client names are written out)."""
import re, zipfile, html

NS = {"r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}


def col_num(ref):
    m = re.match(r"([A-Z]+)", ref).group(1)
    n = 0
    for c in m:
        n = n * 26 + ord(c) - 64
    return n


def col_letter(n):
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


class Book:
    def __init__(self, path):
        self.z = zipfile.ZipFile(path)
        names = self.z.namelist()
        self.ss = []
        if "xl/sharedStrings.xml" in names:
            x = self.z.read("xl/sharedStrings.xml").decode("utf-8")
            for si in re.findall(r"<si>(.*?)</si>", x, re.S):
                self.ss.append(html.unescape("".join(re.sub(r"<[^>]+>", "", t) for t in re.findall(r"<t[^>]*>.*?</t>", si, re.S))))
        wb = self.z.read("xl/workbook.xml").decode("utf-8")
        rels = self.z.read("xl/_rels/workbook.xml.rels").decode("utf-8")
        rmap = {}
        for m in re.finditer(r"<Relationship [^>]*>", rels):
            i = re.search(r'Id="([^"]+)"', m.group(0)).group(1)
            t = re.search(r'Target="([^"]+)"', m.group(0)).group(1)
            rmap[i] = "xl/" + re.sub(r"^/?xl/", "", t)
        self.sheets = []
        for m in re.finditer(r"<sheet [^>]*>", wb):
            s = m.group(0)
            name = html.unescape(re.search(r'name="([^"]+)"', s).group(1))
            rid = re.search(r'r:id="([^"]+)"', s).group(1)
            self.sheets.append((name, rmap.get(rid), 'state="hidden"' in s or 'state="veryHidden"' in s))

    def rows(self, sheet, max_rows=None):
        path = [p for n, p, h in self.sheets if n == sheet][0]
        x = self.z.read(path).decode("utf-8")
        out = []
        for rm in re.finditer(r'<row [^>]*r="(\d+)"[^>]*>(.*?)</row>', x, re.S):
            row = {"_r": int(rm.group(1))}
            for cm in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*?)(?:/>|>(.*?)</c>)', rm.group(2), re.S):
                body = cm.group(3) or ""
                v = re.search(r"<v>(.*?)</v>", body, re.S)
                t = re.search(r"<t[^>]*>(.*?)</t>", body, re.S)
                val = v.group(1) if v else (html.unescape(t.group(1)) if t else "")
                if 't="s"' in cm.group(2) and v:
                    val = self.ss[int(v.group(1))]
                row[col_num(cm.group(1))] = val
                if re.search(r"<f[ >/]", body):
                    row["f%d" % col_num(cm.group(1))] = 1
            out.append(row)
            if max_rows and len(out) >= max_rows:
                break
        return out


def norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()


def headings(book, sheet, marker=r"^COMPANY NAME$"):
    """The heading row (the first of the first 8 rows that has a cell matching marker, else the row with most text cells),
    with the group row above it forward-filled."""
    rows = book.rows(sheet, 12)
    hi = None
    for i, r in enumerate(rows[:8]):
        if any(re.match(marker, norm(v), re.I) for k, v in r.items() if isinstance(k, int)):
            hi = i
            break
    if hi is None:
        best = -1
        for i, r in enumerate(rows[:8]):
            n = sum(1 for k, v in r.items() if isinstance(k, int) and re.search(r"[A-Za-z]", str(v)))
            if n > best:
                best, hi = n, i
    hdr = rows[hi]
    top = rows[hi - 1] if hi and hi > 0 else {}
    cols = sorted(k for k in hdr if isinstance(k, int))
    out, grp = [], ""
    for c in range(1, (max(cols) if cols else 0) + 1):
        if norm(top.get(c)):
            grp = norm(top.get(c))
        out.append((c, col_letter(c), grp, norm(hdr.get(c))))
    return hdr.get("_r"), out


def djb2(s):
    h = 5381
    for ch in s:
        h = ((h << 5) + h + ord(ch)) & 0xFFFFFFFF
    return h

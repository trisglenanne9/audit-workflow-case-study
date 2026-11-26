"""Writes the fictional sample drawings used by the demo: a small audit workflow and a central support workflow.

    python3 examples/make_sample.py

The firm, its people and its process are invented. The drawings follow the same rules as real ones: lanes in three levels
(INTERNAL or EXTERNAL, then the department, then the job title), one action per box with the actor in bold red, decisions as short
questions, Excel files as documents, systems as symbols with dashed "uses" arrows, and lettered off-page connectors between pages.
"""
import base64, html, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "sample-firm")

COLORS = {"EXTERNAL": "#D9D9D9", "AUDIT DEPARTMENT": "#93C47D", "CENTRAL SUPPORT": "#7EA6E0",
          "FINANCE DEPARTMENT": "#FFD966", "PRICING COMMITTEE": "#C9A0DC"}
LANE_W, STEP_W, STEP_H, ROW_H = 420, 230, 80, 130
LANES_TOP, CONTENT_TOP = 150, 110  # content starts this far below the top of the lane groups


ICONS = os.path.join(OUT, "icons")


def icon(name):
    """An icon file as a data URI for a draw.io style (draw.io writes "data:<type>,<base64>", without ";base64")."""
    path = os.path.join(ICONS, name)
    kind = "image/svg+xml" if name.endswith(".svg") else "image/png"
    with open(path, "rb") as f:
        return f"data:{kind}," + base64.b64encode(f.read()).decode()


# A system is the green cylinder with the application's logo on it; a platform (Teams, WhatsApp) is its own icon;
# a system with no logo is the plain green cylinder.
SYSTEMS = {"SharePoint": ("sharepoint.svg", 56, 56), "Power Apps": ("power-apps.svg", 56, 56),
           "Microsoft Teams": ("teams.png", 46, 46), "WhatsApp": ("whatsapp.svg", 44, 44),
           "Practice management system": ("cylinder.svg", 44, 52), "Audit software": ("cylinder.svg", 44, 52)}


def actor_text(actor, rest):
    return f'<b style="color: rgb(255, 0, 0);">{html.escape(actor)}</b> {html.escape(rest)}'


class Page:
    def __init__(self, pid, name, groups, title):
        """groups: [(top bar, [(department or None, [(lane id, lane title)])])] from left to right."""
        self.pid, self.name, self.title = pid, name, title
        self.cells, self.edges, self.lane_abs = [], [], {}
        self.n = 0
        x = 40
        for top, depts in groups:
            gid = f"{pid}-grp-{len(self.cells)}"
            lanes_in = sum(len(l) for _, l in depts)
            gw = lanes_in * LANE_W
            self.cells.append(dict(id=gid, parent="1", style="swimlane;startSize=20;html=1;fontStyle=1;fontSize=13;strokeWidth=2;",
                                   value=top, geo=(x, LANES_TOP, gw, 0), group=True))
            gx = 0
            for dept, lanes in depts:
                parent, base_y, lx0 = gid, 20, gx
                if dept:
                    did = f"{pid}-dept-{len(self.cells)}"
                    dw = len(lanes) * LANE_W
                    self.cells.append(dict(id=did, parent=gid, style=f"swimlane;startSize=20;html=1;fontStyle=1;fontSize=12;strokeWidth=2;fillColor={COLORS[dept]};",
                                           value=dept, geo=(gx, 20, dw, 0), group=True))
                    parent, base_y, lx0 = did, 20, 0
                for i, (lid, ltitle) in enumerate(lanes):
                    color = COLORS[dept or top]
                    top_abs = LANES_TOP + 20 + (20 if dept else 0)
                    self.lane_abs[lid] = (x + gx + i * LANE_W, top_abs)
                    self.cells.append(dict(id=lid, parent=parent, style=f"swimlane;startSize=30;html=1;fontSize=13;strokeWidth=2;fillColor={color};",
                                           value=ltitle, geo=(lx0 + i * LANE_W, base_y, LANE_W, 0), lane=True, dept=bool(dept)))
                gx += len(lanes) * LANE_W
            x += gw
        self.width = x

    def _place(self, lane, row, w, h, dx=None):
        lx, ly = self.lane_abs[lane]
        ay = LANES_TOP + CONTENT_TOP + row * ROW_H + (STEP_H - h) / 2
        x = (LANE_W - STEP_W) / 2 - 50 if dx is None else dx
        return (x, ay - ly, w, h)

    def node(self, cid, lane, row, kind, text, actor=None, time=None):
        cid = f"{self.pid}-{cid}"
        if kind == "step":
            v = actor_text(actor, text) if actor else html.escape(text)
            if time:
                v += f'<br><i style="color: rgb(128, 128, 128);">Time: {html.escape(time)}</i>'
            st = "rounded=0;whiteSpace=wrap;html=1;fontSize=13;strokeWidth=2;"
            geo = self._place(lane, row, STEP_W, STEP_H)
        elif kind == "decision":
            v, st = html.escape(text), "rhombus;whiteSpace=wrap;html=1;fontSize=13;strokeWidth=2;"
            geo = self._place(lane, row, STEP_W - 20, 100)
            geo = (geo[0] + 10, geo[1], geo[2], geo[3])
        elif kind == "terminal":
            v, st = html.escape(text), "ellipse;fillColor=#f8cecc;strokeColor=#b85450;fontStyle=1;whiteSpace=wrap;html=1;fontSize=13;strokeWidth=2;"
            geo = self._place(lane, row, STEP_W, 70)
        elif kind == "connector":
            v = html.escape(text)
            st = "shape=offPageConnector;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=12;strokeWidth=2;"
            geo = self._place(lane, row, STEP_W, 90)
        self.cells.append(dict(id=cid, parent=lane, style=st, value=v, geo=geo))
        self.rows = getattr(self, "rows", {})
        self.rows[cid] = (row, self.lane_abs[lane][0])
        if kind == "connector":
            letter = time  # the letter rides in the time argument for connectors
            self.cells.append(dict(id=cid + "-l", parent=cid, style="ellipse;whiteSpace=wrap;html=1;fillColor=#9673a6;fontColor=#ffffff;fontStyle=1;fontSize=12;strokeColor=none;",
                                   value=letter, geo=(STEP_W - 18, -10, 26, 26)))
        return cid

    def excel(self, cid, lane, row, name):
        cid = f"{self.pid}-{cid}"
        self.cells.append(dict(id=cid, parent=lane, style="shape=mxgraph.flowchart.multi-document;whiteSpace=wrap;html=1;fontSize=11;strokeWidth=1.5;fillColor=#ffffff;align=left;spacingLeft=34;",
                               value=html.escape(name) + "<br>(Excel)", geo=self._place(lane, row, 135, 62, dx=LANE_W - 145)))
        # the Excel icon inside the file symbol, as on the real drawings
        self.cells.append(dict(id=cid + "-ic", parent=cid, style=f"shape=image;html=1;imageAspect=0;aspect=fixed;image={icon('excel.svg')};",
                               value="", geo=(6, 14, 26, 26)))
        return cid

    def document(self, cid, lane, row, name):
        cid = f"{self.pid}-{cid}"
        self.cells.append(dict(id=cid, parent=lane, style="shape=document;whiteSpace=wrap;html=1;boundedLbl=1;fontSize=11;fillColor=#fff2cc;strokeColor=#d6b656;strokeWidth=1.5;",
                               value=html.escape(name), geo=self._place(lane, row, 125, 60, dx=LANE_W - 135)))
        return cid

    def system(self, cid, lane, row, name):
        cid = f"{self.pid}-{cid}"
        f, w, h = SYSTEMS[name]
        self.cells.append(dict(id=cid, parent=lane, style=f"shape=image;html=1;verticalLabelPosition=bottom;verticalAlign=top;imageAspect=0;aspect=fixed;fontSize=11;image={icon(f)};",
                               value=html.escape(name), geo=self._place(lane, row, w, h, dx=LANE_W - 100)))
        return cid

    def edge(self, s, t, label="", dashed=False, route=None):
        self.n += 1
        st = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;html=1;strokeWidth=2;fontSize=12;labelBackgroundColor=#FFFFFF;"
        if dashed:
            st += "dashed=1;strokeWidth=1.5;strokeColor=#666666;endArrow=open;exitX=1;exitY=0.5;entryX=0;entryY=0.5;"
        else:
            rows = getattr(self, "rows", {})
            rs, rt = rows.get(f"{self.pid}-{s}"), rows.get(f"{self.pid}-{t}")
            if rs and rt:
                same_lane, right = rs[1] == rt[1], rt[1] > rs[1]
                side_out = "exitX=1;exitY=0.5;" if right else "exitX=0;exitY=0.5;"
                if same_lane and rt[0] > rs[0]:
                    st += "exitX=0.5;exitY=1;entryX=0.5;entryY=0;"
                elif same_lane:
                    st += "exitX=1;exitY=0.5;entryX=1;entryY=0.5;"
                elif rt[0] == rs[0]:
                    st += side_out + ("entryX=0;entryY=0.5;" if right else "entryX=1;entryY=0.5;")
                elif rt[0] > rs[0]:
                    side = route == "side" or (route is None and label in ("YES", "NO"))
                    st += (side_out if side else "exitX=0.5;exitY=1;") + "entryX=0.5;entryY=0;"
                else:  # back up to an earlier step in another lane: out of the side, in at the bottom
                    st += side_out + "entryX=0.5;entryY=1;"
        self.edges.append(dict(id=f"{self.pid}-e{self.n}", s=f"{self.pid}-{s}", t=f"{self.pid}-{t}", style=st, value=html.escape(label)))

    def legend(self):
        """The same legend on every page: what each line and symbol means."""
        L = self.pid + "-lg"
        x0 = self.width - 900
        items = [
            ("line", "Process flow", "endArrow=classic;html=1;strokeWidth=2;"),
            ("line", "Uses or updates a file or system", "endArrow=open;dashed=1;html=1;strokeWidth=1.5;strokeColor=#666666;"),
            ("shape", "Step", "rounded=0;whiteSpace=wrap;html=1;strokeWidth=2;"),
            ("shape", "Decision", "rhombus;whiteSpace=wrap;html=1;strokeWidth=2;"),
            ("shape", "Start / end", "ellipse;fillColor=#f8cecc;strokeColor=#b85450;html=1;strokeWidth=2;"),
            ("shape", "Continues on another page (same letter)", "shape=offPageConnector;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;strokeWidth=2;"),
            ("shape", "Excel file", "shape=mxgraph.flowchart.multi-document;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeWidth=1.5;"),
            ("icon", "System (logo on a cylinder)", "sharepoint.svg"),
            ("icon", "Chat or channel", "teams.png"),
        ]
        cells = [f'<mxCell id="{L}" value="" style="rounded=1;arcSize=6;fillColor=none;strokeColor=#999999;html=1;" vertex="1" parent="1">'
                 f'<mxGeometry x="{x0}" y="44" width="900" height="100" as="geometry"/></mxCell>']
        for i, (kind, text, st) in enumerate(items):
            col, rw = i % 3, i // 3
            x, y = x0 + 14 + col * 296, 52 + rw * 30
            if kind == "line":
                cells.append(f'<mxCell id="{L}{i}" value="" style="{st}" edge="1" parent="1"><mxGeometry relative="1" as="geometry">'
                             f'<mxPoint x="{x}" y="{y + 12}" as="sourcePoint"/><mxPoint x="{x + 40}" y="{y + 12}" as="targetPoint"/></mxGeometry></mxCell>')
            elif kind == "shape":
                cells.append(f'<mxCell id="{L}{i}" value="" style="{st}" vertex="1" parent="1"><mxGeometry x="{x + 4}" y="{y}" width="32" height="24" as="geometry"/></mxCell>')
            else:
                cells.append(f'<mxCell id="{L}{i}" value="" style="shape=image;html=1;imageAspect=0;aspect=fixed;image={icon(st)};" vertex="1" parent="1">'
                             f'<mxGeometry x="{x + 8}" y="{y}" width="24" height="24" as="geometry"/></mxCell>')
            cells.append(f'<mxCell id="{L}{i}t" value="{html.escape(text)}" style="text;html=1;align=left;verticalAlign=middle;fontSize=12;" vertex="1" parent="1">'
                         f'<mxGeometry x="{x + 46}" y="{y}" width="240" height="24" as="geometry"/></mxCell>')
        return "".join(cells)

    def xml(self, rows):
        h = CONTENT_TOP + rows * ROW_H + 40
        out = [f'<diagram name="{html.escape(self.name)}" id="{self.pid}"><mxGraphModel dx="1600" dy="1200" grid="1" gridSize="10" guides="1" '
               f'tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="{self.width + 40}" pageHeight="{LANES_TOP + h + 40}" '
               f'math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>']
        out.append(f'<mxCell id="{self.pid}-title" value="&lt;h1 style=&quot;margin-top:0px;&quot;&gt;{html.escape(html.escape(self.title))}&lt;/h1&gt;" '
                   f'style="text;html=1;whiteSpace=wrap;overflow=hidden;fontSize=13;" vertex="1" parent="1"><mxGeometry x="40" y="0" width="1200" height="44" as="geometry"/></mxCell>')
        out.append(self.legend())
        for c in self.cells:
            x, y, w, hh = c["geo"]
            if c.get("group"):
                hh = h if c["parent"] == "1" else h - 20
            if c.get("lane"):
                hh = h - (40 if c.get("dept") else 20)
            out.append(f'<mxCell id="{c["id"]}" value="{html.escape(c["value"])}" style="{c["style"]}" vertex="1" parent="{c["parent"]}">'
                       f'<mxGeometry x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{hh:.0f}" as="geometry"/></mxCell>')
        for e in self.edges:
            out.append(f'<mxCell id="{e["id"]}" value="{e["value"]}" style="{e["style"]}" edge="1" parent="1" source="{e["s"]}" target="{e["t"]}">'
                       f'<mxGeometry relative="1" as="geometry"/></mxCell>')
        out.append("</root></mxGraphModel></diagram>")
        return "".join(out)


def audit_workflow():
    pages = []
    # 1. Fee proposal ---------------------------------------------------------------------------------------------------------
    p = Page("a1", "1. Fee proposal", [
        ("EXTERNAL", [(None, [("La1-cl", "Client")])]),
        ("INTERNAL", [("AUDIT DEPARTMENT", [("La1-pp", "Preparer"), ("La1-am", "Audit Manager")]),
                      ("PRICING COMMITTEE", [("La1-pc", "Pricing Committee")])]),
    ], "Sample Audit Firm – 1. Fee proposal")
    p.node("start", "La1-pp", 0, "terminal", "START (management accounts received)")
    p.node("save", "La1-pp", 1, "step", "saves the management accounts to the client folder in SharePoint", "Preparer", "Within the day")
    p.system("sp", "La1-pp", 1, "SharePoint")
    p.node("fill", "La1-pp", 2, "step", "fills in the fee proposal with last year's fee and hours", "Preparer")
    p.excel("fp", "La1-pp", 2, "Fee proposal")
    p.node("rev", "La1-am", 3, "step", "reviews the fee proposal", "Audit Manager")
    p.node("band", "La1-am", 4, "decision", "Within the standard fee band?")
    p.node("comm", "La1-pc", 5, "step", "approves the fee in the pricing form in Power Apps", "Pricing Committee", "1 to 2 days")
    p.system("tm", "La1-pc", 5, "Power Apps")
    p.node("send", "La1-am", 6, "step", "emails the fee proposal to the client", "Audit Manager")
    p.node("cl", "La1-cl", 7, "step", "reviews the fee proposal", "Client", "Follow-up after 3 working days")
    p.node("acc", "La1-cl", 8, "decision", "Client accepts the fee?")
    p.node("neg", "La1-am", 8, "step", "negotiates the fee with the client by phone", "Audit Manager")
    p.node("rec", "La1-pp", 9, "step", "records the fee agreed date in the job log", "Preparer")
    p.excel("jl", "La1-pp", 9, "Job log")
    p.node("toC", "La1-pp", 10, "connector", "Continues in Audit Workflow, 2. Fieldwork and review (fee agreed)", time="C")
    for e in [("start", "save", ""), ("save", "fill", ""), ("fill", "rev", ""), ("rev", "band", ""), ("band", "send", "YES"),
                      ("band", "comm", "NO"), ("comm", "send", ""), ("send", "cl", ""), ("cl", "acc", ""), ("acc", "rec", "YES", "bottom"),
                      ("acc", "neg", "NO"), ("neg", "comm", ""), ("rec", "toC", "")]:
        p.edge(*e)
    for s, t in [("save", "sp"), ("fill", "fp"), ("comm", "tm"), ("rec", "jl")]:
        p.edge(s, t, dashed=True)
    pages.append(p.xml(11))

    # 2. Fieldwork and review -------------------------------------------------------------------------------------------------
    p = Page("a2", "2. Fieldwork and review", [
        ("EXTERNAL", [(None, [("La2-cl", "Client")])]),
        ("INTERNAL", [("AUDIT DEPARTMENT", [("La2-pp", "Preparer"), ("La2-rv", "Reviewer")])]),
    ], "Sample Audit Firm – 2. Fieldwork and review")
    p.node("fromC", "La2-pp", 0, "connector", "From Audit Workflow, 1. Fee proposal (fee agreed)", time="C")
    p.node("req", "La2-pp", 1, "step", "emails the client the list of year-end documents needed", "Preparer")
    p.node("up", "La2-cl", 2, "step", "uploads the documents to the shared SharePoint folder", "Client", "Within 5 working days")
    p.system("sp", "La2-cl", 2, "SharePoint")
    p.node("work", "La2-pp", 3, "step", "performs the fieldwork in the audit software", "Preparer", "About 6 days")
    p.system("as", "La2-pp", 3, "Audit software")
    p.node("end", "La2-pp", 4, "step", "records the job end date in the job log", "Preparer")
    p.excel("jl", "La2-pp", 4, "Job log")
    p.node("rv", "La2-rv", 5, "step", "reviews the working papers and raises review points in the audit software", "Reviewer")
    p.node("open", "La2-rv", 6, "decision", "Review points open?")
    p.node("clear", "La2-pp", 6, "step", "clears the review points", "Preparer")
    p.node("draft", "La2-rv", 7, "step", "emails the draft report to the client", "Reviewer")
    p.node("ok", "La2-cl", 8, "decision", "Client approves the draft report?")
    p.node("pages", "La2-pp", 9, "step", "emails the signing pages to the client", "Preparer")
    p.node("toA", "La2-pp", 10, "connector", "Continues in Central Support, A. Attestation (signing pages)", time="A")
    for s, t, lab in [("fromC", "req", ""), ("req", "up", ""), ("up", "work", ""), ("work", "end", ""), ("end", "rv", ""),
                      ("rv", "open", ""), ("open", "clear", "YES"), ("clear", "rv", ""), ("open", "draft", "NO"),
                      ("draft", "ok", ""), ("ok", "pages", "YES"), ("ok", "clear", "NO"), ("pages", "toA", "")]:
        p.edge(s, t, lab)
    for s, t in [("up", "sp"), ("work", "as"), ("end", "jl")]:
        p.edge(s, t, dashed=True)
    pages.append(p.xml(11))

    # 3. Signing and release --------------------------------------------------------------------------------------------------
    p = Page("a3", "3. Signing and release", [
        ("INTERNAL", [("AUDIT DEPARTMENT", [("La3-pp", "Preparer"), ("La3-pt", "Audit Partner")]),
                      ("FINANCE DEPARTMENT", [("La3-fn", "Finance Team")])]),
    ], "Sample Audit Firm – 3. Signing and release")
    p.node("fromB", "La3-pp", 0, "connector", "From Central Support, A. Attestation (attested signing pages)", time="B")
    p.node("set", "La3-pp", 1, "step", "adds the attested pages to the report set", "Preparer")
    p.node("sign", "La3-pt", 2, "step", "signs the audit report", "Audit Partner", "Within 1 day")
    p.node("rec", "La3-pp", 3, "step", "records the partner signed date in the job log", "Preparer")
    p.excel("jl", "La3-pp", 3, "Job log")
    p.node("inv", "La3-fn", 4, "step", "issues the invoice in the practice management system", "Finance Team")
    p.system("pm", "La3-fn", 4, "Practice management system")
    p.node("paid", "La3-fn", 5, "decision", "Fee paid?")
    p.node("chase", "La3-fn", 6, "step", "follows up with the client for payment on WhatsApp", "Finance Team", "Every 14 days until paid")
    p.system("wa", "La3-fn", 6, "WhatsApp")
    p.node("bind", "La3-pp", 6, "step", "submits the binding request to Central Support", "Preparer")
    p.node("toD", "La3-pp", 7, "connector", "Continues in Central Support, B. Binding and dispatch (binding request)", time="D")
    p.node("fromE", "La3-pp", 8, "connector", "From Central Support, B. Binding and dispatch (report dispatched)", time="E")
    p.node("endT", "La3-pp", 9, "terminal", "END")
    for s, t, lab in [("fromB", "set", ""), ("set", "sign", ""), ("sign", "rec", ""), ("rec", "inv", ""), ("inv", "paid", ""),
                      ("paid", "bind", "YES"), ("paid", "chase", "NO"), ("chase", "paid", ""),
                      ("bind", "toD", ""), ("fromE", "endT", "")]:
        p.edge(s, t, lab)
    for s, t in [("rec", "jl"), ("inv", "pm"), ("chase", "wa")]:
        p.edge(s, t, dashed=True)
    pages.append(p.xml(10))
    return pages


def central_support():
    pages = []
    p = Page("cA", "A. Attestation", [
        ("EXTERNAL", [(None, [("LcA-cl", "Client")])]),
        ("INTERNAL", [("CENTRAL SUPPORT", [("LcA-rc", "Receptionist"), ("LcA-at", "Attestation PIC")])]),
        ("EXTERNAL", [(None, [("LcA-co", "Commissioner for Oaths")])]),
    ], "Sample Audit Firm – Central Support – A. Attestation")
    p.node("fromA", "LcA-cl", 0, "connector", "From Audit Workflow, 2. Fieldwork and review (signing pages)", time="A")
    p.node("ret", "LcA-cl", 1, "step", "signs and returns the signing pages by courier", "Client", "Median 15 days")
    p.node("recv", "LcA-rc", 2, "step", "receives the signed pages and logs them in the document log", "Receptionist")
    p.excel("dl", "LcA-rc", 2, "Document log")
    p.node("book", "LcA-at", 3, "step", "books the Commissioner for Oaths in the Microsoft Teams attestation chat", "Attestation PIC", "Within 2 working days")
    p.system("tm", "LcA-at", 3, "Microsoft Teams")
    p.node("att", "LcA-co", 4, "step", "attests the signing pages", "Commissioner for Oaths")
    p.node("log", "LcA-at", 5, "step", "records the attestation date in the central support job log", "Attestation PIC")
    p.excel("cl", "LcA-at", 5, "Central support job log")
    p.node("toB", "LcA-at", 6, "connector", "Continues in Audit Workflow, 3. Signing and release (attested signing pages)", time="B")
    for s, t in [("fromA", "ret"), ("ret", "recv"), ("recv", "book"), ("book", "att"), ("att", "log"), ("log", "toB")]:
        p.edge(s, t)
    for s, t in [("recv", "dl"), ("log", "cl"), ("book", "tm")]:
        p.edge(s, t, dashed=True)
    pages.append(p.xml(7))

    p = Page("cB", "B. Binding and dispatch", [
        ("INTERNAL", [("CENTRAL SUPPORT", [("LcB-bd", "Binding PIC"), ("LcB-rc", "Receptionist")])]),
        ("EXTERNAL", [(None, [("LcB-cl", "Client")])]),
    ], "Sample Audit Firm – Central Support – B. Binding and dispatch")
    p.node("fromD", "LcB-bd", 0, "connector", "From Audit Workflow, 3. Signing and release (binding request)", time="D")
    p.node("print", "LcB-bd", 1, "step", "prints and binds the signed report", "Binding PIC", "Within 2 working days")
    p.node("scan", "LcB-bd", 2, "step", "scans the signed report to the client folder in SharePoint", "Binding PIC")
    p.system("sp", "LcB-bd", 2, "SharePoint")
    p.node("disp", "LcB-rc", 3, "step", "dispatches the bound report by courier", "Receptionist")
    p.node("dlog", "LcB-rc", 4, "step", "records the dispatch in the document log", "Receptionist")
    p.excel("dl", "LcB-rc", 4, "Document log")
    p.node("get", "LcB-cl", 5, "step", "receives the bound report", "Client")
    p.node("toE", "LcB-rc", 6, "connector", "Continues in Audit Workflow, 3. Signing and release (report dispatched)", time="E")
    for s, t in [("fromD", "print"), ("print", "scan"), ("scan", "disp"), ("disp", "dlog"), ("dlog", "get"), ("get", "toE")]:
        p.edge(s, t)
    for s, t in [("scan", "sp"), ("dlog", "dl")]:
        p.edge(s, t, dashed=True)
    pages.append(p.xml(7))
    return pages


def write(name, diagrams):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as f:
        f.write('<mxfile host="process-explorer" version="1">' + "".join(diagrams) + "</mxfile>\n")
    print("wrote", path)


if __name__ == "__main__":
    write("audit-workflow.drawio", audit_workflow())
    write("central-support.drawio", central_support())

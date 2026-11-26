"""Show what each transcript says in a time range, side by side, to settle a disputed passage of a recording.
usage: python window.py <qwen.jsonl> <start mm:ss> <end mm:ss> [<label>=<whisper transcript> ...]
Prints the Qwen3-ASR chunks that overlap the range (whole ~28 s chunks), then the lines of each Whisper transcript whose time
falls in the range (a little margin each side). Times are minutes:seconds from the start of the recording.
"""
import sys, re, json
sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def ts(s):
    p = [int(x) for x in s.split(":")]
    return p[0] * 3600 + p[1] * 60 + p[2] if len(p) == 3 else p[0] * 60 + p[1]


def mmss(t):
    return f"{int(t) // 60:02d}:{int(t) % 60:02d}"


qf, a, b = sys.argv[1], ts(sys.argv[2]), ts(sys.argv[3])
whs = [tuple(x.split("=", 1)) if "=" in x else (x, x) for x in sys.argv[4:]]
print(f"=== {qf} {mmss(a)}-{mmss(b)}")
print("--- Qwen3-ASR-1.7B")
for line in open(qf, encoding="utf-8"):
    c = json.loads(line)
    if c["end"] > a and c["start"] < b:
        print(f"[{mmss(c['start'])}-{mmss(c['end'])}] ({c['language']}) {c['text']}")
rx = re.compile(r"^\[(\d+(?::\d+){1,2})(?:-(\d+(?::\d+){1,2}))?\]\s*(.*)$")
for name, f in whs:
    print(f"--- {name}")
    rows = []
    for l in open(f, encoding="utf-8"):
        m = rx.match(l.strip())
        if m:
            rows.append((ts(m.group(1)), ts(m.group(2)) if m.group(2) else None, m.group(3)))
    for i, (s0, e0, t) in enumerate(rows):
        e1 = e0 if e0 is not None else (rows[i + 1][0] if i + 1 < len(rows) else s0 + 5)
        if e1 > a - 3 and s0 < b + 3:
            print(f"[{mmss(s0)}-{mmss(e1)}] {t}")

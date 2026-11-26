"""Time-aligned comparison of a Qwen3-ASR run against a Whisper transcript.
usage: python compare.py <qwen.jsonl> <whisper.md|txt> <label> <out.md> [max_flags]
For each Qwen chunk (about 28 s) the Whisper segments whose start falls in the chunk are joined and both texts are
reduced to content words (stop words dropped). Reported per chunk: word overlap (Jaccard), negation counts, Chinese
characters in Qwen, loops. This is agreement, not accuracy: neither side is the truth, only the owner's listening is.
"""
import sys, re, json, collections

qj, wf, label, out = sys.argv[1:5]
MAXF = int(sys.argv[5]) if len(sys.argv) > 5 else 60

STOP = set("""a an the and or but if so of to in on at for from with by as is are was were be been being am do does did
done have has had having i me my we us our you your he him his she her it its they them their this that these those
there here then than too very just also yeah yes okay ok oh um uh ah lah hmm mm like will would can could should shall
may might must what which who whom when where why how all any some more most other such only own same s t don now
about into over after before up down out off again further once get got going go one two""".split())
NEG = set("no not never don't dont won't wont can't cant didn't didnt doesn't doesnt isn't isnt wasn't wasnt aren't arent cannot nothing none nobody neither nor".split())
CJK = re.compile(r"[㐀-鿿]")
TOK = re.compile(r"[a-z0-9']+")


def tsec(s):
    p = [int(x) for x in s.split(":")]
    return p[0] * 3600 + p[1] * 60 + p[2] if len(p) == 3 else p[0] * 60 + p[1]


def parse_whisper(path):
    segs = []
    rx = re.compile(r"^\[(\d+(?::\d+){1,2})(?:-(\d+(?::\d+){1,2}))?\]\s*(.*)$")
    for line in open(path, encoding="utf-8"):
        m = rx.match(line.strip())
        if not m:
            continue
        a, b, txt = m.groups()
        txt = re.sub(r"^\(?Speaker \d+\)?:?\s*", "", txt)
        txt = re.sub(r"\[(unclear|repeated)[^\]]*\]", "", txt)
        segs.append([tsec(a), tsec(b) if b else None, txt.strip()])
    for i, s in enumerate(segs):
        if s[1] is None:
            s[1] = segs[i + 1][0] if i + 1 < len(segs) else s[0] + 5
    return segs


def words(t):
    toks = TOK.findall(t.lower().replace("’", "'"))
    return [w for w in toks if w not in STOP and len(w) > 1]


def negs(t):
    return sum(1 for w in TOK.findall(t.lower().replace("’", "'")) if w in NEG)


def loop(t):
    s = [x.strip().lower() for x in re.split(r"[.!?。！？]", t) if x.strip()]
    run = 1
    for i in range(1, len(s)):
        run = run + 1 if s[i] == s[i - 1] else 1
        if run >= 3:
            return True
    return False


def fmt(t):
    t = int(t)
    return f"{t // 60:02d}:{t % 60:02d}"


whis = parse_whisper(wf)
wtok = []  # (interpolated time, token): Whisper words spread evenly over their segment
for a, b, txt in whis:
    ts = txt.split()
    for i, w in enumerate(ts):
        wtok.append((a + (b - a) * (i + 0.5) / max(len(ts), 1), w))
rows = []
for line in open(qj, encoding="utf-8"):
    c = json.loads(line)
    if c["text"] == "[silence]":
        continue
    wtxt = " ".join(w for t, w in wtok if c["start"] <= t < c["end"])
    qa, wa = words(c["text"]), words(wtxt)
    A, B = set(qa), set(wa)
    jac = len(A & B) / len(A | B) if (A | B) else 1.0
    rows.append(dict(start=c["start"], end=c["end"], lang=c["language"], q=c["text"], w=wtxt, jac=jac,
                     qn=len(qa), wn=len(wa), qneg=negs(c["text"]), wneg=negs(wtxt),
                     cjk=len(CJK.findall(c["text"])), loop=loop(c["text"]), wloop=loop(wtxt)))

n = len(rows)
if n == 0:
    print("no chunks"); sys.exit()
mj = sum(r["jac"] for r in rows) / n
low = [r for r in rows if r["jac"] < 0.30]
negd = [r for r in rows if r["qneg"] != r["wneg"]]
cj = [r for r in rows if r["cjk"] >= 3]
lq = [r for r in rows if r["loop"]]
lw = [r for r in rows if r["wloop"]]
short_q = [r for r in rows if r["qn"] < 0.5 * r["wn"] and r["wn"] >= 15]
short_w = [r for r in rows if r["wn"] < 0.5 * r["qn"] and r["qn"] >= 15]
cover = rows[-1]["end"]
bk = collections.defaultdict(lambda: [[], []])
for r in rows:
    k = int(r["start"] // 300)
    bk[k][0] += words(r["q"]); bk[k][1] += words(r["w"])
bucket_j = {k: (len(set(a) & set(b)) / len(set(a) | set(b)) if (set(a) | set(b)) else 1.0) for k, (a, b) in bk.items()}
mb = sum(bucket_j.values()) / len(bucket_j)
langs = collections.Counter(r["lang"] for r in rows)

md = [f"# Qwen3-ASR-1.7B against Whisper: {label}", "",
      f"- Audio compared: 00:00 to {fmt(cover)} ({n} chunks of about 28 s, silent chunks left out)",
      f"- Whisper file: `{wf.replace(chr(92), '/').split('/')[-1]}`",
      f"- Mean word overlap (Jaccard on content words): **{mj:.2f}**  (1.00 = identical word sets)",
      f"- Mean overlap over 5-minute stretches (less sensitive to chunk edges): **{mb:.2f}**",
      f"- Chunks with overlap below 0.30: **{len(low)}** ({100 * len(low) / n:.0f}%)",
      f"- Chunks where the count of negation words differs: **{len(negd)}** ({100 * len(negd) / n:.0f}%)",
      f"- Chunks where Qwen wrote 3 or more Chinese characters (Cantonese or Mandarin speech): **{len(cj)}**",
      f"- Chunks where Qwen is under half the length of Whisper (Whisper has 15+ words): {len(short_q)}; the other way round: {len(short_w)}",
      f"- Chunks with a loop (3 identical sentences in a row): Qwen {len(lq)}, Whisper {len(lw)}",
      f"- Language label Qwen gave to chunks: " + ", ".join(f"{k or 'none'} {v}" for k, v in langs.most_common()),
      "", "Agreement is not accuracy: neither text is the truth. A low overlap means the two machines disagree, "
      "not which one is right. Only the owner's listening settles a line.", ""]


def block(title, lst, key):
    out = [f"## {title} ({len(lst)})", ""]
    for r in sorted(lst, key=key)[:MAXF]:
        out += [f"**{fmt(r['start'])}-{fmt(r['end'])}**  overlap {r['jac']:.2f}, negations Qwen {r['qneg']} / Whisper {r['wneg']}, Qwen label {r['lang']}",
                f"- Qwen: {r['q'][:700]}", f"- Whisper: {r['w'][:700] or '(no text)'}", ""]
    return out


md += block("Chinese characters in Qwen (speech Whisper could not write down)", cj, lambda r: r["start"])
md += block("Negation counts differ", negd, lambda r: r["start"])
md += block("Lowest word overlap", low, lambda r: r["jac"])
md += block("Qwen much shorter than Whisper", short_q, lambda r: r["start"])
md += block("Whisper much shorter than Qwen", short_w, lambda r: r["start"])
open(out, "w", encoding="utf-8").write("\n".join(md))
print(f"{label}: chunks {n}, mean overlap {mj:.2f}, 5-min {mb:.2f}, low {len(low)}, neg diff {len(negd)}, cjk {len(cj)}, qshort {len(short_q)}, wshort {len(short_w)}, loops q/w {len(lq)}/{len(lw)}")

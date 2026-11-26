"""Qwen3-ASR-1.7B full run on one recording (CPU, bf16, resumable).
usage: python run_full.py <audio> <outname>
Cuts ~28 s chunks at the quietest 0.3 s between 24 and 32 s, runs batches of 8, language auto-detected per chunk.
Writes out/<outname>.jsonl (one line per chunk: start, end, language, text) and out/<outname>.txt.
Chunks that are near-silent are skipped and logged as [silence]. Re-running resumes after the last finished chunk.
"""
import sys, os, json, time
import numpy as np, torch, av
from qwen_asr import Qwen3ASRModel

audio, name = sys.argv[1], sys.argv[2]
OUT = os.environ.get("QWEN_OUT", "out")
os.makedirs(OUT, exist_ok=True)
jl, tx, st = f"{OUT}/{name}.jsonl", f"{OUT}/{name}.txt", f"{OUT}/{name}.status"
SR, BATCH = 16000, 8
torch.set_num_threads(10)

done_end = 0.0
if os.path.exists(jl):
    with open(jl, encoding="utf-8") as f:
        for line in f:
            done_end = max(done_end, json.loads(line)["end"])
print("resume from", done_end, flush=True)

model = Qwen3ASRModel.from_pretrained(os.environ.get("QWEN_MODEL", "Qwen/Qwen3-ASR-1.7B"), dtype=torch.bfloat16,
                                      device_map="cpu", max_new_tokens=320, max_inference_batch_size=BATCH)


def fmt(t):
    t = int(t)
    return f"{t // 3600:02d}:{t % 3600 // 60:02d}:{t % 60:02d}"


def frames():
    c = av.open(audio)
    s = c.streams.audio[0]
    total = c.duration / 1e6
    if done_end > 0:
        c.seek(int(done_end * 1e6))
    rs = av.AudioResampler(format="flt", layout="mono", rate=SR)
    for f in c.decode(s):
        if f.time is not None and f.time < done_end - 0.02:
            continue
        for r in rs.resample(f):
            yield f.time, r.to_ndarray().reshape(-1), total


def cut_chunks():
    buf, t0, total = np.zeros(0, np.float32), None, 0
    for ft, arr, total in frames():
        if t0 is None:
            t0 = ft
        buf = np.concatenate([buf, arr])
        while len(buf) >= 33 * SR:
            lo, hi = 24 * SR, 32 * SR
            seg = buf[lo:hi - SR * 3 // 10]
            hop = SR * 3 // 10
            n = (len(buf[lo:hi]) - hop) // 1600
            en = [np.mean(buf[lo + i * 1600: lo + i * 1600 + hop] ** 2) for i in range(n)]
            cut = lo + int(np.argmin(en)) * 1600 + hop // 2
            yield t0, buf[:cut], total
            buf, t0 = buf[cut:], t0 + cut / SR
    if t0 is not None and len(buf) > SR:
        yield t0, buf, total


def silent(a):
    fr = a[: len(a) // 1600 * 1600].reshape(-1, 1600)
    rms = np.sqrt((fr ** 2).mean(1))
    return np.percentile(rms, 90) < 0.004


batch, t_start, n_done = [], time.time(), 0


def flush():
    global batch, n_done
    if not batch:
        return
    todo = [b for b in batch if not b[3]]
    res = model.transcribe(audio=[(b[2], SR) for b in todo], language=None) if todo else []
    it = iter(res)
    with open(jl, "a", encoding="utf-8") as fj, open(tx, "a", encoding="utf-8") as ft:
        for t0, dur, a, sil in batch:
            if sil:
                lang, text = "", "[silence]"
            else:
                r = next(it)
                lang, text = r.language, r.text.strip()
            fj.write(json.dumps({"start": round(t0, 2), "end": round(t0 + dur, 2), "language": lang, "text": text},
                                ensure_ascii=False) + "\n")
            ft.write(f"[{fmt(t0)}-{fmt(t0 + dur)}] ({lang}) {text}\n")
    n_done += len(batch)
    el = time.time() - t_start
    last_end = batch[-1][0] + batch[-1][1]
    with open(st, "w") as f:
        f.write(f"audio done to {fmt(last_end)} of {fmt(total_len)}; elapsed {el / 60:.1f} min; "
                f"speed {(last_end - done_end) / max(el, 1):.2f}x real time\n")
    batch = []


total_len = 0
for t0, a, total_len in cut_chunks():
    batch.append((t0, len(a) / SR, a, silent(a)))
    if len(batch) == BATCH:
        flush()
flush()
with open(st, "a") as f:
    f.write("FINISHED\n")
print("FINISHED", flush=True)

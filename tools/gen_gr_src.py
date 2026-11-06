import json, glob, collections, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
CACHE = os.path.join(ROOT, "tools", ".cache")
freq = collections.Counter()
for f in glob.glob(os.path.join(DATA, "greek", "*.json")):
    b = json.load(open(f, encoding="utf-8"))
    for ch in b["chapters"]:
        for verse in ch:
            for w in verse:
                s = w.get("s")
                if s:
                    freq["G" + s] += 1
total = sum(freq.values())
print("tokens NT:", total, "| Strong distintos:", len(freq))
ordered = freq.most_common()
for thr in (300, 500, 700, 1000, 1300, 1500):
    cov = sum(c for _, c in ordered[:thr])
    print("  top %4d -> %5.1f%% de las palabras" % (thr, 100 * cov / total))
json.dump([c for c, _ in ordered], open(os.path.join(CACHE, "gr_freq_order.json"), "w"))
dic = json.load(open(os.path.join(DATA, "strongs_gr.json"), encoding="utf-8"))
N = 1000
lines = []
for code in [c for c, _ in ordered][:N]:
    e = dic.get(code, {})
    d = (e.get("def") or e.get("kjv") or "").replace("\n", " ").strip()
    if len(d) > 120:
        d = d[:120]
    tr = e.get("translit", e.get("xlit", ""))
    lines.append("%s|%s|%s|%s" % (code, e.get("lemma", ""), tr, d))
open(os.path.join(CACHE, "gr_top1000_src.txt"), "w", encoding="utf-8").write("\n".join(lines))
print("generadas", len(lines), "líneas fuente (top 1000)")
print("\n".join(lines[:6]))

import json, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(ROOT, "data", "strongs_gr_es.json")
data = json.load(open(out, encoding="utf-8")) if os.path.exists(out) else {}
n = 0
for line in sys.stdin:
    line = line.rstrip("\n")
    if not line or "\t" not in line:
        continue
    code, es = line.split("\t", 1)
    code, es = code.strip(), es.strip()
    if code and es:
        data[code] = es; n += 1
json.dump(data, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
print("  +%d traducidas | total griego: %d" % (n, len(data)))

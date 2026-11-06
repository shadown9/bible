import json, sys, os
out = 'data/strongs_he_es.json'
data = json.load(open(out, encoding='utf-8')) if os.path.exists(out) else {}
n=0
for line in sys.stdin:
    line = line.rstrip('\n')
    if not line or '\t' not in line: continue
    code, es = line.split('\t', 1)
    code, es = code.strip(), es.strip()
    if code and es:
        data[code] = es; n+=1
json.dump(data, open(out,'w',encoding='utf-8'), ensure_ascii=False, separators=(',',':'), sort_keys=True)
print(f"  +{n} traducidas | total en español: {len(data)}")

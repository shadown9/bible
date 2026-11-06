#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pipeline del Nuevo Testamento en griego para la app de estudio.

Fuente: MorphGNT / SBLGNT (github.com/morphgnt/sblgnt) — texto griego con
morfología, de licencia abierta (CC BY-SA 3.0). No trae número de Strong,
así que lo enlazamos por el LEMA contra el diccionario Strong griego ya
incluido (openscriptures). Coincidencia ~98-99%.

Genera:
  data/greek/<id>.json        -> NT griego palabra por palabra (texto, Strong,
                                 lema y morfología), por libro.
  data/concordance_gr.json    -> Strong griego -> apariciones en el NT.

Uso: python3 tools/build_greek.py
"""
import json
import os
import re
import subprocess
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
CACHE = os.path.join(ROOT, "tools", ".cache")
RAW = "https://raw.githubusercontent.com/morphgnt/sblgnt/master/{fn}"

# bookid, archivo MorphGNT, número global de libro (40–66 = NT)
NT = [
    ("mateo", "61-Mt-morphgnt.txt", 40),
    ("marcos", "62-Mk-morphgnt.txt", 41),
    ("lucas", "63-Lk-morphgnt.txt", 42),
    ("juan", "64-Jn-morphgnt.txt", 43),
    ("hechos", "65-Ac-morphgnt.txt", 44),
    ("romanos", "66-Ro-morphgnt.txt", 45),
    ("1-corintios", "67-1Co-morphgnt.txt", 46),
    ("2-corintios", "68-2Co-morphgnt.txt", 47),
    ("galatas", "69-Ga-morphgnt.txt", 48),
    ("efesios", "70-Eph-morphgnt.txt", 49),
    ("filipenses", "71-Php-morphgnt.txt", 50),
    ("colosenses", "72-Col-morphgnt.txt", 51),
    ("1-tesalonicenses", "73-1Th-morphgnt.txt", 52),
    ("2-tesalonicenses", "74-2Th-morphgnt.txt", 53),
    ("1-timoteo", "75-1Ti-morphgnt.txt", 54),
    ("2-timoteo", "76-2Ti-morphgnt.txt", 55),
    ("tito", "77-Tit-morphgnt.txt", 56),
    ("filemon", "78-Phm-morphgnt.txt", 57),
    ("hebreos", "79-Heb-morphgnt.txt", 58),
    ("santiago", "80-Jas-morphgnt.txt", 59),
    ("1-pedro", "81-1Pe-morphgnt.txt", 60),
    ("2-pedro", "82-2Pe-morphgnt.txt", 61),
    ("1-juan", "83-1Jn-morphgnt.txt", 62),
    ("2-juan", "84-2Jn-morphgnt.txt", 63),
    ("3-juan", "85-3Jn-morphgnt.txt", 64),
    ("judas", "86-Jud-morphgnt.txt", 65),
    ("apocalipsis", "87-Re-morphgnt.txt", 66),
]

# nombres propios frecuentes que difieren de ortografía entre SBLGNT y Strong
ALIAS = {
    "δαυιδ": "G1138", "δαβιδ": "G1138",     # David
    "μωυση": "G3475", "μωση": "G3475",       # Moisés (algunas formas)
}


def norm(s):
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^α-ω]", "", s.lower().replace("ς", "σ"))


def fetch(fn, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return
    r = subprocess.run(["curl", "-sS", "-L", "--max-time", "120", RAW.format(fn=fn), "-o", dest],
                       capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(dest) or os.path.getsize(dest) == 0:
        raise RuntimeError("fallo al descargar " + fn + ": " + r.stderr[:200])


def main():
    os.makedirs(os.path.join(DATA, "greek"), exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)
    gr = json.load(open(os.path.join(DATA, "strongs_gr.json"), encoding="utf-8"))
    lemma2g = {}
    for k, v in gr.items():
        n = norm(v.get("lemma", ""))
        if n and n not in lemma2g:
            lemma2g[n] = k

    concord = {}
    total = hit = 0
    for bid, fn, bn in NT:
        cache = os.path.join(CACHE, fn)
        fetch(fn, cache)
        chapters = {}
        for line in open(cache, encoding="utf-8"):
            parts = line.rstrip("\n").split(" ")
            if len(parts) < 7:
                continue
            code, pos, parse, text, word, norm_w, lemma = parts[:7]
            if len(code) != 6 or not code.isdigit():
                continue
            c = int(code[2:4]); v = int(code[4:6])
            n = norm(lemma)
            g = lemma2g.get(n) or ALIAS.get(n)
            total += 1
            w = {"g": word}
            if g:
                hit += 1
                w["s"] = g[1:]                 # sin la 'G'
                seen = concord.setdefault(g, set())
                seen.add((bn, c, v))
            m = (pos + parse).replace("-", "")
            if m:
                w["m"] = (pos + parse).strip()
            w["l"] = lemma
            chapters.setdefault(c, {}).setdefault(v, []).append(w)
        max_c = max(chapters) if chapters else 0
        out_ch = []
        for c in range(1, max_c + 1):
            verses = chapters.get(c, {})
            max_v = max(verses) if verses else 0
            out_ch.append([verses.get(v, []) for v in range(1, max_v + 1)])
        json.dump({"id": bid, "dir": "ltr", "chapters": out_ch},
                  open(os.path.join(DATA, "greek", bid + ".json"), "w", encoding="utf-8"),
                  ensure_ascii=False, separators=(",", ":"))
    # concordancia
    out = {}
    for g, refs in concord.items():
        rl = sorted(refs)
        out[g] = {"n": len(rl), "refs": ["%d.%d.%d" % r for r in rl]}
    json.dump(out, open(os.path.join(DATA, "concordance_gr.json"), "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    print("NT griego: %d libros, %d palabras, %d con Strong (%.1f%%)"
          % (len(NT), total, hit, 100 * hit / total))
    print("Concordancia griega: %d palabras indexadas" % len(out))


if __name__ == "__main__":
    main()

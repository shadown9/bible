#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pipeline de datos para la app de estudio bíblico.

Genera, de forma reproducible, los activos de datos que consume la app web:

  data/books.json            -> metadatos de los 66 libros (nombres en español,
                                 id OSIS, testamento, nº de capítulos).
  data/es/<id>.json          -> texto en español (Reina Valera 1909, dominio
                                 público) por libro.
  data/hebrew/<id>.json      -> Antiguo Testamento en hebreo (Códice de
                                 Leningrado / OpenScriptures) palabra por palabra,
                                 con número de Strong y morfología. Interlineal.
  data/strongs_he.json       -> Diccionario Strong hebreo (dominio público).
  data/strongs_gr.json       -> Diccionario Strong griego (dominio público).

Fuentes (todas de licencia abierta / dominio público):
  - Reina Valera 1909: ya incluida en el repo (json/es_rvr.json).
  - Hebreo + morfología + Strong: github.com/openscriptures/morphhb (CC BY 4.0)
  - Diccionarios Strong: github.com/openscriptures/strongs (dominio público)

Uso:
  python3 tools/build_data.py            # construye todo
  python3 tools/build_data.py --no-net   # sólo lo que no requiere descargar
"""
import json
import os
import re
import sys
import subprocess
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
CACHE = os.path.join(ROOT, "tools", ".cache")

RAW = "https://raw.githubusercontent.com"
MORPHHB = RAW + "/openscriptures/morphhb/master/wlc/{osis}.xml"
STRONGS_HE = RAW + "/openscriptures/strongs/master/hebrew/strongs-hebrew-dictionary.js"
STRONGS_GR = RAW + "/openscriptures/strongs/master/greek/strongs-greek-dictionary.js"

# ---------------------------------------------------------------------------
# Metadatos canónicos de los 66 libros.
# Columnas: abreviatura en json/es_rvr.json, id estable (slug), nombre español,
#           id OSIS (para cruzar con el hebreo), testamento.
# ---------------------------------------------------------------------------
BOOKS = [
    # abbrev, id,      nombre español,        osis,    testamento
    ("gn",   "genesis",        "Génesis",            "Gen",   "AT"),
    ("ex",   "exodo",          "Éxodo",              "Exod",  "AT"),
    ("lv",   "levitico",       "Levítico",           "Lev",   "AT"),
    ("nm",   "numeros",        "Números",            "Num",   "AT"),
    ("dt",   "deuteronomio",   "Deuteronomio",       "Deut",  "AT"),
    ("js",   "josue",          "Josué",              "Josh",  "AT"),
    ("jud",  "jueces",         "Jueces",             "Judg",  "AT"),
    ("rt",   "rut",            "Rut",                "Ruth",  "AT"),
    ("1sm",  "1-samuel",       "1 Samuel",           "1Sam",  "AT"),
    ("2sm",  "2-samuel",       "2 Samuel",           "2Sam",  "AT"),
    ("1kgs", "1-reyes",        "1 Reyes",            "1Kgs",  "AT"),
    ("2kgs", "2-reyes",        "2 Reyes",            "2Kgs",  "AT"),
    ("1ch",  "1-cronicas",     "1 Crónicas",         "1Chr",  "AT"),
    ("2ch",  "2-cronicas",     "2 Crónicas",         "2Chr",  "AT"),
    ("ezr",  "esdras",         "Esdras",             "Ezra",  "AT"),
    ("ne",   "nehemias",       "Nehemías",           "Neh",   "AT"),
    ("et",   "ester",          "Ester",              "Esth",  "AT"),
    ("job",  "job",            "Job",                "Job",   "AT"),
    ("ps",   "salmos",         "Salmos",             "Ps",    "AT"),
    ("prv",  "proverbios",     "Proverbios",         "Prov",  "AT"),
    ("ec",   "eclesiastes",    "Eclesiastés",        "Eccl",  "AT"),
    ("so",   "cantares",       "Cantares",           "Song",  "AT"),
    ("is",   "isaias",         "Isaías",             "Isa",   "AT"),
    ("jr",   "jeremias",       "Jeremías",           "Jer",   "AT"),
    ("lm",   "lamentaciones",  "Lamentaciones",      "Lam",   "AT"),
    ("ez",   "ezequiel",       "Ezequiel",           "Ezek",  "AT"),
    ("dn",   "daniel",         "Daniel",             "Dan",   "AT"),
    ("ho",   "oseas",          "Oseas",              "Hos",   "AT"),
    ("jl",   "joel",           "Joel",               "Joel",  "AT"),
    ("am",   "amos",           "Amós",               "Amos",  "AT"),
    ("ob",   "abdias",         "Abdías",             "Obad",  "AT"),
    ("jn",   "jonas",          "Jonás",              "Jonah", "AT"),
    ("mi",   "miqueas",        "Miqueas",            "Mic",   "AT"),
    ("na",   "nahum",          "Nahúm",              "Nah",   "AT"),
    ("hk",   "habacuc",        "Habacuc",            "Hab",   "AT"),
    ("zp",   "sofonias",       "Sofonías",           "Zeph",  "AT"),
    ("hg",   "hageo",          "Hageo",              "Hag",   "AT"),
    ("zc",   "zacarias",       "Zacarías",           "Zech",  "AT"),
    ("ml",   "malaquias",      "Malaquías",          "Mal",   "AT"),
    ("mt",   "mateo",          "Mateo",              "Matt",  "NT"),
    ("mk",   "marcos",         "Marcos",             "Mark",  "NT"),
    ("lk",   "lucas",          "Lucas",              "Luke",  "NT"),
    ("jo",   "juan",           "Juan",               "John",  "NT"),
    ("act",  "hechos",         "Hechos",             "Acts",  "NT"),
    ("rm",   "romanos",        "Romanos",            "Rom",   "NT"),
    ("1co",  "1-corintios",    "1 Corintios",        "1Cor",  "NT"),
    ("2co",  "2-corintios",    "2 Corintios",        "2Cor",  "NT"),
    ("gl",   "galatas",        "Gálatas",            "Gal",   "NT"),
    ("eph",  "efesios",        "Efesios",            "Eph",   "NT"),
    ("ph",   "filipenses",     "Filipenses",         "Phil",  "NT"),
    ("cl",   "colosenses",     "Colosenses",         "Col",   "NT"),
    ("1ts",  "1-tesalonicenses","1 Tesalonicenses",  "1Thess","NT"),
    ("2ts",  "2-tesalonicenses","2 Tesalonicenses",  "2Thess","NT"),
    ("1tm",  "1-timoteo",      "1 Timoteo",          "1Tim",  "NT"),
    ("2tm",  "2-timoteo",      "2 Timoteo",          "2Tim",  "NT"),
    ("tt",   "tito",           "Tito",               "Titus", "NT"),
    ("phm",  "filemon",        "Filemón",            "Phlm",  "NT"),
    ("hb",   "hebreos",        "Hebreos",            "Heb",   "NT"),
    ("jm",   "santiago",       "Santiago",           "Jas",   "NT"),
    ("1pe",  "1-pedro",        "1 Pedro",            "1Pet",  "NT"),
    ("2pe",  "2-pedro",        "2 Pedro",            "2Pet",  "NT"),
    ("1jo",  "1-juan",         "1 Juan",             "1John", "NT"),
    ("2jo",  "2-juan",         "2 Juan",             "2John", "NT"),
    ("3jo",  "3-juan",         "3 Juan",             "3John", "NT"),
    ("jd",   "judas",          "Judas",              "Jude",  "NT"),
    ("re",   "apocalipsis",    "Apocalipsis",        "Rev",   "NT"),
]

OSIS_NS = "{http://www.bibletechnologies.net/2003/OSIS/namespace}"


def log(*a):
    print(*a, flush=True)


def fetch(url, dest):
    """Descarga con curl (respeta el proxy del entorno). Cachea en disco."""
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    r = subprocess.run(
        ["curl", "-sS", "-L", "--max-time", "120", url, "-o", dest],
        capture_output=True, text=True,
    )
    if r.returncode != 0 or not os.path.exists(dest) or os.path.getsize(dest) == 0:
        raise RuntimeError("Fallo al descargar %s: %s" % (url, r.stderr[:300]))
    return dest


# ---------------------------------------------------------------------------
# 1) Español (Reina Valera 1909)
# ---------------------------------------------------------------------------
def build_spanish():
    src = os.path.join(ROOT, "json", "es_rvr.json")
    data = json.load(open(src, encoding="utf-8-sig"))
    by_abbrev = {b["abbrev"]: b for b in data}
    outdir = os.path.join(DATA, "es")
    os.makedirs(outdir, exist_ok=True)
    n_ver = 0
    for abbrev, bid, name, osis, test in BOOKS:
        b = by_abbrev.get(abbrev)
        if not b:
            log("  AVISO: falta libro español", abbrev)
            continue
        chapters = b["chapters"]
        json.dump(
            {"id": bid, "name": name, "chapters": chapters},
            open(os.path.join(outdir, bid + ".json"), "w", encoding="utf-8"),
            ensure_ascii=False, separators=(",", ":"),
        )
        n_ver += sum(len(c) for c in chapters)
    log("  Español RV1909: %d libros, %d versículos" % (len(BOOKS), n_ver))


# ---------------------------------------------------------------------------
# 2) Hebreo (Antiguo Testamento) con Strong + morfología
# ---------------------------------------------------------------------------
def parse_hebrew_word(w):
    """Convierte un <w> de OSIS en {h, s, sa, ps, m}."""
    text = "".join(w.itertext())
    text = text.replace("/", "")  # quitar separador de morfemas para mostrar
    lemma = (w.get("lemma") or "").strip()
    morph = (w.get("morph") or "").strip()
    if morph.startswith("H"):
        morph = morph[1:]

    strongs = []          # todos los números de Strong del vocablo
    augmented = []        # con sufijo (p.ej. 1254a) para desambiguar homónimos
    for part in lemma.split("/"):
        part = part.strip()
        m = re.match(r"(\d+)\s*([a-z])?", part)
        if m:
            strongs.append(m.group(1))
            augmented.append(m.group(1) + (m.group(2) or ""))
    primary = strongs[0] if strongs else ""   # la raíz (los prefijos son letras)
    primary_aug = augmented[0] if augmented else ""
    out = {"h": text, "s": primary}
    if primary_aug and primary_aug != primary:
        out["sa"] = primary_aug
    if len(strongs) > 1:
        out["ps"] = strongs
    if morph:
        out["m"] = morph
    return out


def build_hebrew(use_net=True):
    outdir = os.path.join(DATA, "hebrew")
    os.makedirs(outdir, exist_ok=True)
    total_words = 0
    done = 0
    for abbrev, bid, name, osis, test in BOOKS:
        if test != "AT":
            continue
        cache = os.path.join(CACHE, osis + ".xml")
        if use_net:
            fetch(MORPHHB.format(osis=osis), cache)
        if not os.path.exists(cache):
            log("  AVISO: sin XML hebreo para", osis)
            continue
        tree = ET.parse(cache)
        root = tree.getroot()
        # chapters[chap_index][verse_index] = [words...]
        chapters = {}
        for verse in root.iter(OSIS_NS + "verse"):
            osis_id = verse.get("osisID")
            if not osis_id:
                continue
            # osisID puede ser "Gen.1.1" (a veces rango con espacios)
            ref = osis_id.split()[0]
            parts = ref.split(".")
            if len(parts) != 3:
                continue
            _, c, v = parts
            c, v = int(c), int(v)
            words = [parse_hebrew_word(w) for w in verse.findall(OSIS_NS + "w")]
            total_words += len(words)
            chapters.setdefault(c, {})[v] = words
        # a listas ordenadas
        max_c = max(chapters) if chapters else 0
        out_ch = []
        for c in range(1, max_c + 1):
            verses = chapters.get(c, {})
            max_v = max(verses) if verses else 0
            out_ch.append([verses.get(v, []) for v in range(1, max_v + 1)])
        json.dump(
            {"id": bid, "name": name, "osis": osis, "dir": "rtl", "chapters": out_ch},
            open(os.path.join(outdir, bid + ".json"), "w", encoding="utf-8"),
            ensure_ascii=False, separators=(",", ":"),
        )
        done += 1
    log("  Hebreo AT: %d libros, %d palabras analizadas" % (done, total_words))


# ---------------------------------------------------------------------------
# 3) Diccionarios Strong (hebreo y griego)
# ---------------------------------------------------------------------------
def js_to_json(path):
    txt = open(path, encoding="utf-8").read()
    i = txt.find("{")
    j = txt.rfind("}")
    if i < 0 or j < 0:
        raise RuntimeError("No se encontró el objeto JSON en " + path)
    obj = txt[i:j + 1]
    return json.loads(obj)


def build_strongs(use_net=True):
    specs = [
        ("he", STRONGS_HE, "strongs-hebrew-dictionary.js", "strongs_he.json"),
        ("gr", STRONGS_GR, "strongs-greek-dictionary.js", "strongs_gr.json"),
    ]
    for lang, url, cache_name, out_name in specs:
        cache = os.path.join(CACHE, cache_name)
        if use_net:
            fetch(url, cache)
        if not os.path.exists(cache):
            log("  AVISO: sin diccionario Strong", lang)
            continue
        raw = js_to_json(cache)
        out = {}
        for key, e in raw.items():
            # key = "H1" / "G1" -> guardamos sólo lo útil y compacto
            out[key] = {
                "lemma": e.get("lemma", ""),
                "xlit": e.get("xlit") or e.get("translit") or "",
                "pron": e.get("pron") or e.get("pronunciation") or "",
                "def": e.get("strongs_def", "") or "",
                "kjv": e.get("kjv_def", "") or "",
                "deriv": e.get("derivation", "") or "",
            }
        json.dump(
            out, open(os.path.join(DATA, out_name), "w", encoding="utf-8"),
            ensure_ascii=False, separators=(",", ":"),
        )
        log("  Diccionario Strong %s: %d entradas" % (lang, len(out)))


# ---------------------------------------------------------------------------
# 4) books.json
# ---------------------------------------------------------------------------
def build_books():
    src = os.path.join(ROOT, "json", "es_rvr.json")
    data = json.load(open(src, encoding="utf-8-sig"))
    caps = {b["abbrev"]: len(b["chapters"]) for b in data}
    out = []
    for i, (abbrev, bid, name, osis, test) in enumerate(BOOKS):
        out.append({
            "n": i + 1,
            "id": bid,
            "name": name,
            "abbrev": abbrev,
            "osis": osis,
            "testament": test,
            "chapters": caps.get(abbrev, 0),
            "hasHebrew": test == "AT",
            "hasGreek": test == "NT",
        })
    json.dump(out, open(os.path.join(DATA, "books.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=0)
    log("  books.json: %d libros" % len(out))


# ---------------------------------------------------------------------------
# 5) Concordancia hebrea: Strong -> apariciones (para "estudio de palabra")
#    Refs compactas "booknum.chap.verse" (booknum = 1..39, orden canónico AT).
# ---------------------------------------------------------------------------
def build_concordance():
    outdir = os.path.join(DATA, "hebrew")
    index = {}   # "H1254" -> [ "1.1.1", ... ]
    booknum = 0
    for abbrev, bid, name, osis, test in BOOKS:
        if test != "AT":
            continue
        booknum += 1
        path = os.path.join(outdir, bid + ".json")
        if not os.path.exists(path):
            continue
        b = json.load(open(path, encoding="utf-8"))
        for ci, ch in enumerate(b["chapters"], 1):
            for vi, verse in enumerate(ch, 1):
                seen = set()
                for w in verse:
                    s = w.get("s")
                    if not s or s in seen:
                        continue
                    seen.add(s)
                    index.setdefault("H" + s, []).append("%d.%d.%d" % (booknum, ci, vi))
    out = {k: {"n": len(v), "refs": v} for k, v in index.items()}
    json.dump(out, open(os.path.join(DATA, "concordance_he.json"), "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    log("  Concordancia hebrea: %d palabras indexadas" % len(out))


# ---------------------------------------------------------------------------
# 6) Catálogo de versiones para comparar (reutiliza json/*.json del repo)
# ---------------------------------------------------------------------------
def build_versions():
    idx_path = os.path.join(ROOT, "json", "index.json")
    index = json.load(open(idx_path, encoding="utf-8-sig"))
    versions = []
    # La versión base en español, con nombre honesto.
    versions.append({"id": "es_rvr", "name": "Reina Valera 1909", "lang": "Español",
                     "file": "json/es_rvr.json", "base": True})
    for lang in index:
        for v in lang["versions"]:
            ab = v["abbreviation"]
            if ab == "es_rvr":
                continue
            versions.append({"id": ab, "name": v["name"], "lang": lang["language"],
                             "file": "json/%s.json" % ab})
    json.dump(versions, open(os.path.join(DATA, "versions.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=0)
    log("  Catálogo de versiones: %d (para comparar)" % len(versions))


def main():
    use_net = "--no-net" not in sys.argv
    os.makedirs(DATA, exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)
    log("== Construyendo base de datos ==")
    log("[1/6] books.json");        build_books()
    log("[2/6] Español RV1909");    build_spanish()
    log("[3/6] Diccionarios Strong"); build_strongs(use_net)
    log("[4/6] Hebreo AT");         build_hebrew(use_net)
    log("[5/6] Concordancia");      build_concordance()
    log("[6/6] Catálogo versiones"); build_versions()
    log("== Listo ==")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera data/plans.json: planes de lectura (día -> capítulos)."""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
books = json.load(open(os.path.join(DATA, "books.json"), encoding="utf-8"))
BYID = {b["id"]: b for b in books}
NAME = {b["id"]: b["name"] for b in books}


def refs(bookid, c1, c2):
    return ["%s:%d" % (bookid, c) for c in range(c1, c2 + 1)]


def one_per_day(bookid, n):
    return [["%s:%d" % (bookid, c)] for c in range(1, n + 1)]


def chunk(all_refs, ndays):
    """Reparte una lista de refs en ndays grupos lo más parejos posible."""
    per = len(all_refs) / ndays
    out, i = [], 0.0
    used = 0
    for d in range(ndays):
        start = used
        end = round((d + 1) * per)
        if d == ndays - 1:
            end = len(all_refs)
        out.append(all_refs[start:end])
        used = end
    return [g for g in out if g]


def seq_books(ids):
    out = []
    for bid in ids:
        out += refs(bid, 1, BYID[bid]["chapters"])
    return out


NT_IDS = [b["id"] for b in books if b["testament"] == "NT"]
ALL_IDS = [b["id"] for b in books]
GOSPELS = ["mateo", "marcos", "lucas", "juan"]

plans = [
    {
        "id": "juan-21",
        "title": "Conoce a Jesús",
        "desc": "El evangelio de Juan, un capítulo al día. Perfecto para empezar.",
        "icon": "✝️",
        "dias": one_per_day("juan", 21),
    },
    {
        "id": "proverbios-31",
        "title": "Sabiduría para cada día",
        "desc": "Un capítulo de Proverbios al día, durante un mes.",
        "icon": "🦉",
        "dias": one_per_day("proverbios", 31),
    },
    {
        "id": "salmos-30",
        "title": "Salmos: 30 días con Dios",
        "desc": "Cinco salmos al día para orar y adorar.",
        "icon": "🎵",
        "dias": chunk(seq_books(["salmos"]), 30),
    },
    {
        "id": "evangelios-40",
        "title": "La vida de Jesús",
        "desc": "Los cuatro evangelios (Mateo a Juan) en 40 días.",
        "icon": "📖",
        "dias": chunk(seq_books(GOSPELS), 40),
    },
    {
        "id": "nt-60",
        "title": "Nuevo Testamento en 60 días",
        "desc": "Recorre todo el Nuevo Testamento en dos meses.",
        "icon": "🕊️",
        "dias": chunk(seq_books(NT_IDS), 60),
    },
    {
        "id": "biblia-365",
        "title": "La Biblia en un año",
        "desc": "Toda la Biblia, de Génesis a Apocalipsis, en 365 días.",
        "icon": "🌍",
        "dias": chunk(seq_books(ALL_IDS), 365),
    },
]

json.dump(plans, open(os.path.join(DATA, "plans.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
for p in plans:
    print("  %-22s %3d días" % (p["title"], len(p["dias"])))
print("plans.json: %d planes" % len(plans))

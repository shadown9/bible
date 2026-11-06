/* ============================================================
   app.js — controlador de la aplicación.
   ============================================================ */
import { Data, books, bookById, bookByNum } from "./data.js";
import { Store } from "./store.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Estado de navegación
const nav = { book: Store.get("last").book, chapter: Store.get("last").chapter };
let BOOKS = [];

// --- versículos para "del día" ---
const DAILY = [
  ["juan", 3, 16], ["salmos", 23, 1], ["genesis", 1, 1], ["proverbios", 3, 5],
  ["filipenses", 4, 13], ["isaias", 41, 10], ["romanos", 8, 28], ["josue", 1, 9],
  ["salmos", 46, 1], ["mateo", 6, 33], ["jeremias", 29, 11], ["salmos", 119, 105],
  ["1-corintios", 13, 4], ["hebreos", 11, 1], ["salmos", 27, 1], ["efesios", 2, 8],
  ["miqueas", 6, 8], ["exodo", 14, 14], ["salmos", 91, 1], ["mateo", 11, 28],
  ["santiago", 1, 5], ["galatas", 5, 22], ["isaias", 40, 31], ["deuteronomio", 31, 6],
];

/* ---------------------------------------------------------------
   Arranque
--------------------------------------------------------------- */
async function init() {
  applyTheme(Store.get("theme"));
  document.documentElement.style.setProperty("--fs-read", Store.get("fontSize") + "rem");
  BOOKS = await books();

  // Pestañas inferiores
  $$(".tab").forEach((t) => t.addEventListener("click", () => showView(t.dataset.view)));
  // Barra superior
  $("#btnNav").addEventListener("click", openNavigator);
  $("#btnTheme").addEventListener("click", cycleTheme);
  $("#btnInterlinear").addEventListener("click", toggleInterlinear);
  // Cerrar hojas
  $$("[data-close]").forEach((b) => b.addEventListener("click", closeSheets));

  $("#btnInterlinear").setAttribute("aria-pressed", String(Store.get("interlinear")));
  await renderReader();
  registerSW();
}

/* ---------------------------------------------------------------
   Navegación entre vistas
--------------------------------------------------------------- */
function showView(name) {
  $$(".view").forEach((v) => v.classList.toggle("is-active", v.id === "view-" + name));
  $$(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.view === name));
  window.scrollTo({ top: 0 });
  if (name === "compare") renderCompare();
  if (name === "search") renderSearch();
  if (name === "settings") renderSettings();
}

/* ---------------------------------------------------------------
   Tema
--------------------------------------------------------------- */
function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); }
function cycleTheme() {
  const order = ["auto", "light", "dark"];
  const next = order[(order.indexOf(Store.get("theme")) + 1) % 3];
  Store.set("theme", next); applyTheme(next);
  toast("Tema: " + ({ auto: "automático", light: "claro", dark: "oscuro" }[next]));
}

/* ---------------------------------------------------------------
   Selector de libro / capítulo
--------------------------------------------------------------- */
function openNavigator() {
  const sheet = $("#navigator");
  sheet.hidden = false;
  renderBookList("AT");
  $$("#navigator .pill").forEach((p) =>
    p.onclick = () => {
      $$("#navigator .pill").forEach((x) => x.classList.toggle("is-active", x === p));
      renderBookList(p.dataset.test);
    });
}
function renderBookList(testament) {
  const body = $("#navBody");
  $("#navTitle").textContent = testament === "AT" ? "Antiguo Testamento" : "Nuevo Testamento";
  const grid = el("div", "book-grid");
  BOOKS.filter((b) => b.testament === testament).forEach((b) => {
    const btn = el("button", b.hasHebrew ? "heb" : null, b.name);
    btn.onclick = () => renderChapterList(b);
    grid.appendChild(btn);
  });
  body.replaceChildren(grid);
}
function renderChapterList(b) {
  const body = $("#navBody");
  $("#navTitle").textContent = b.name;
  const back = el("button", "backlink", "‹ Libros");
  back.onclick = () => renderBookList(b.testament);
  const grid = el("div", "chap-grid");
  for (let c = 1; c <= b.chapters; c++) {
    const btn = el("button", null, String(c));
    btn.onclick = () => { closeSheets(); goTo(b.id, c); };
    grid.appendChild(btn);
  }
  body.replaceChildren(back, grid);
}

async function goTo(bookId, chapter, verse) {
  nav.book = bookId; nav.chapter = chapter;
  Store.setLast(bookId, chapter);
  showView("read");
  await renderReader(verse);
}

/* ---------------------------------------------------------------
   Vista Leer
--------------------------------------------------------------- */
async function renderReader(scrollVerse) {
  const view = $("#view-read");
  const b = await bookById(nav.book);
  $("#refLabel").textContent = `${b.name} ${nav.chapter}`;
  // el botón interlineal sólo tiene sentido en el AT
  $("#btnInterlinear").style.opacity = b.hasHebrew ? "1" : ".4";

  view.replaceChildren(loadingEl());
  try {
    const es = await Data.es(nav.book);
    const verses = es.chapters[nav.chapter - 1] || [];
    const frag = document.createDocumentFragment();

    if (nav.book === Store.get("last").book) frag.appendChild(await dailyCard());
    frag.appendChild(el("h2", "chapter-title", `${b.name} ${nav.chapter}`));

    const interlinear = Store.get("interlinear") && b.hasHebrew;
    let heb = null;
    if (interlinear) {
      try { heb = await Data.hebrew(nav.book); } catch (e) { heb = null; }
    }

    verses.forEach((text, i) => {
      const n = i + 1;
      if (interlinear && heb) {
        frag.appendChild(interlinearVerse(n, text, (heb.chapters[nav.chapter - 1] || [])[i] || []));
      } else {
        const p = el("p", "verse");
        p.id = `v${n}`;
        p.innerHTML = `<span class="verse__n">${n}</span>${esc(text)}`;
        frag.appendChild(p);
      }
    });
    frag.appendChild(chapterPager(b));
    view.replaceChildren(frag);

    if (scrollVerse) {
      const t = $(`#v${scrollVerse}`) || $(`#iln${scrollVerse}`);
      if (t) { t.classList.add("is-hl"); t.scrollIntoView({ block: "center" }); }
    }
  } catch (e) {
    view.replaceChildren(errorEl(e));
  }
}

function interlinearVerse(n, es, words) {
  const box = el("div", "iln"); box.id = `iln${n}`;
  box.appendChild(el("div", "iln__es", `<span class="verse__n">${n}</span>${esc(es)}`));
  const row = el("div", "iln__heb");
  words.forEach((w) => {
    if (!w.h) return;
    const code = w.s ? "H" + w.s : null;
    const btn = el("button", "hw");
    btn.innerHTML = `<span class="hw__h">${esc(w.h)}</span>` +
      (code && Store.get("showStrongs") ? `<span class="hw__s">${code}</span>` : "");
    if (code) btn.onclick = () => openWord(code, w.sa ? "H" + w.sa : null);
    row.appendChild(btn);
  });
  box.appendChild(row);
  return box;
}

function chapterPager(b) {
  const wrap = el("div", "row");
  wrap.style.marginTop = "1.2rem";
  const prev = el("button", "iconbtn", "‹ Anterior");
  const next = el("button", "iconbtn", "Siguiente ›");
  prev.style.minWidth = next.style.minWidth = "auto";
  prev.style.padding = next.style.padding = ".5rem .9rem";
  prev.disabled = nav.chapter <= 1;
  next.disabled = nav.chapter >= b.chapters;
  prev.onclick = () => goTo(b.id, nav.chapter - 1);
  next.onclick = () => goTo(b.id, nav.chapter + 1);
  wrap.append(prev, next);
  return wrap;
}

function toggleInterlinear() {
  const v = !Store.get("interlinear");
  Store.set("interlinear", v);
  $("#btnInterlinear").setAttribute("aria-pressed", String(v));
  bookById(nav.book).then((b) => {
    if (v && !b.hasHebrew) toast("El interlineal griego del NT llegará pronto 🙂");
    renderReader();
  });
}

/* ---------------------------------------------------------------
   Estudio de palabra (diccionario Strong + concordancia)
--------------------------------------------------------------- */
async function openWord(code, augmented) {
  const sheet = $("#word");
  const body = $("#wordBody");
  sheet.hidden = false;
  body.replaceChildren(loadingEl());
  try {
    const dict = await Data.strongsHe();
    const entry = dict[code] || (augmented && dict[augmented]) || null;
    const es = await Data.strongsHeEs().catch(() => ({}));
    const defEs = es[code] || (augmented && es[augmented]) || null;
    const conc = await Data.concordanceHe();
    const occ = conc[code] || (augmented && conc[augmented]) || { n: 0, refs: [] };

    const frag = document.createDocumentFragment();
    const head = el("div", "wh");
    head.innerHTML =
      `<div class="wh__h">${entry ? esc(entry.lemma) : "—"}</div>` +
      `<div class="wh__x">${entry ? esc(entry.xlit) : ""} ${entry && entry.pron ? "· <i>" + esc(entry.pron) + "</i>" : ""}</div>` +
      `<span class="wh__code">${code}${augmented && augmented !== code ? " (" + augmented + ")" : ""}</span>`;
    frag.appendChild(head);

    if (defEs) {
      frag.appendChild(wsec("Significado (español)", esc(defEs)));
    }
    if (entry) {
      frag.appendChild(wsec(defEs ? "Definición ampliada (Strong, inglés)" : "Definición (Strong, inglés)",
        esc(entry.def || entry.kjv || "—")));
      if (entry.deriv) frag.appendChild(wsec("Origen", esc(entry.deriv)));
      if (entry.kjv && entry.kjv !== entry.def)
        frag.appendChild(wsec("Traducido como (KJV)", esc(entry.kjv)));
      if (!defEs)
        frag.appendChild(el("p", "muted", "ℹ️ El significado en español está disponible para los ~1000 términos más frecuentes; esta palabra es menos común y por ahora se muestra el Strong en inglés."));
    } else {
      frag.appendChild(el("p", "muted", "No hay entrada de diccionario para esta palabra."));
    }

    const occSec = el("div", "wsec");
    occSec.appendChild(el("h4", null, `Apariciones en el AT — ${occ.n}`));
    const list = el("div", "occ");
    for (const ref of occ.refs.slice(0, 80)) {
      const [bn, c, v] = ref.split(".").map(Number);
      const bk = await bookByNum(bn);
      if (!bk) continue;
      const btn = el("button", null, `${bk.name} ${c}:${v}`);
      btn.onclick = () => { closeSheets(); goTo(bk.id, c, v); };
      list.appendChild(btn);
    }
    occSec.appendChild(list);
    if (occ.n > 80) occSec.appendChild(el("p", "muted", `…y ${occ.n - 80} más.`));
    frag.appendChild(occSec);

    body.replaceChildren(frag);
  } catch (e) {
    body.replaceChildren(errorEl(e));
  }
}
function wsec(title, html) {
  const s = el("div", "wsec");
  s.appendChild(el("h4", null, title));
  s.appendChild(el("p", null, html));
  return s;
}

/* ---------------------------------------------------------------
   Comparar versiones
--------------------------------------------------------------- */
async function renderCompare() {
  const view = $("#view-compare");
  view.replaceChildren(loadingEl());
  try {
    const b = await bookById(nav.book);
    const vers = await Data.versions();
    const picks = Store.get("compare");

    const head = el("div");
    head.appendChild(el("p", "muted", `${b.name} ${nav.chapter} — elige versiones (toca para añadir o quitar):`));
    const pick = el("div", "cmp-pick");
    const options = [...vers];
    if (b.hasHebrew) options.unshift({ id: "he_wlc", name: "Hebreo (WLC)", lang: "Hebreo" });
    options.forEach((o) => {
      const on = picks.includes(o.id);
      const btn = el("button", "pill" + (on ? " is-active" : ""), `${o.name}`);
      btn.onclick = () => {
        let p = Store.get("compare").slice();
        if (p.includes(o.id)) p = p.filter((x) => x !== o.id);
        else if (p.length < 4) p.push(o.id);
        else { toast("Máximo 4 versiones a la vez"); return; }
        Store.set("compare", p);
        renderCompare();
      };
      pick.appendChild(btn);
    });
    head.appendChild(pick);

    const grid = el("div", "cmp-grid" + (picks.length === 2 ? " two" : ""));
    for (const id of picks) {
      const col = el("div", "cmp-col");
      const meta = id === "he_wlc"
        ? { name: "Hebreo (WLC)", lang: "Hebreo" }
        : vers.find((v) => v.id === id) || { name: id, lang: "" };
      col.appendChild(el("div", "cmp-col__h", `${esc(meta.name)} <small>${esc(meta.lang)}</small>`));
      const bdy = el("div", "cmp-col__b");
      bdy.appendChild(await versionVerses(id, b));
      col.appendChild(bdy);
      grid.appendChild(col);
    }
    view.replaceChildren(head, grid);
  } catch (e) {
    view.replaceChildren(errorEl(e));
  }
}

async function versionVerses(id, b) {
  const frag = document.createDocumentFragment();
  if (id === "he_wlc") {
    const heb = await Data.hebrew(b.id);
    const vs = heb.chapters[nav.chapter - 1] || [];
    vs.forEach((words, i) => {
      const line = words.map((w) => w.h).join(" ");
      const p = el("p", "cmp-v rtl");
      p.innerHTML = `${esc(line)}`;
      frag.appendChild(p);
    });
    return frag;
  }
  const meta = (await Data.versions()).find((v) => v.id === id);
  const file = meta ? meta.file : `json/${id}.json`;
  const arr = await Data.versionFile(file);
  const vs = (arr[b.n - 1] && arr[b.n - 1].chapters[nav.chapter - 1]) || [];
  vs.forEach((text, i) => {
    const p = el("p", "cmp-v");
    p.innerHTML = `<span class="verse__n">${i + 1}</span>${esc(text)}`;
    frag.appendChild(p);
  });
  return frag;
}

/* ---------------------------------------------------------------
   Buscar (en el texto en español)
--------------------------------------------------------------- */
let searchReady = false;
function renderSearch() {
  const view = $("#view-search");
  if (searchReady) return;
  const box = el("div", "search-box");
  const input = el("input");
  input.type = "search";
  input.placeholder = "Buscar palabra o frase…";
  input.id = "searchInput";
  const btn = el("button", "iconbtn", "Buscar");
  btn.style.minWidth = "auto"; btn.style.padding = ".5rem 1rem";
  box.append(input, btn);
  const results = el("div"); results.id = "searchResults";
  results.appendChild(el("p", "muted", "Escribe al menos 3 letras y pulsa Buscar. Se busca en la Reina Valera 1909."));
  view.replaceChildren(box, results);

  const run = () => doSearch(input.value.trim());
  btn.onclick = run;
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
  searchReady = true;
}

async function doSearch(q) {
  const results = $("#searchResults");
  if (q.length < 3) { results.replaceChildren(el("p", "muted", "Escribe al menos 3 letras.")); return; }
  results.replaceChildren(loadingEl());
  try {
    const arr = await Data.versionFile("json/es_rvr.json");
    const nq = norm(q);
    const out = [];
    for (let bi = 0; bi < arr.length && out.length < 300; bi++) {
      const bk = BOOKS[bi];
      const chapters = arr[bi].chapters;
      for (let ci = 0; ci < chapters.length; ci++) {
        const vs = chapters[ci];
        for (let vi = 0; vi < vs.length; vi++) {
          if (norm(vs[vi]).includes(nq)) {
            out.push({ bk, c: ci + 1, v: vi + 1, t: vs[vi] });
            if (out.length >= 300) break;
          }
        }
        if (out.length >= 300) break;
      }
    }
    const frag = document.createDocumentFragment();
    frag.appendChild(el("p", "muted", out.length ? `${out.length}${out.length >= 300 ? "+" : ""} resultado(s)` : "Sin resultados."));
    const re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
    out.forEach((r) => {
      const d = el("div", "result");
      const hl = esc(r.t).replace(re, "<mark>$1</mark>");
      d.innerHTML = `<div class="result__ref">${esc(r.bk.name)} ${r.c}:${r.v}</div><div class="result__t">${hl}</div>`;
      d.onclick = () => goTo(r.bk.id, r.c, r.v);
      frag.appendChild(d);
    });
    results.replaceChildren(frag);
  } catch (e) {
    results.replaceChildren(errorEl(e));
  }
}

/* ---------------------------------------------------------------
   Ajustes
--------------------------------------------------------------- */
function renderSettings() {
  const view = $("#view-settings");
  const s = Store.all();
  const frag = document.createDocumentFragment();

  // Tema
  const c1 = el("div", "card"); c1.appendChild(el("h3", null, "Apariencia"));
  const rTheme = el("div", "row", "<span>Tema</span>");
  const segT = el("div", "seg");
  [["auto", "Auto"], ["light", "Claro"], ["dark", "Oscuro"]].forEach(([val, lbl]) => {
    const b = el("button", s.theme === val ? "is-active" : null, lbl);
    b.onclick = () => { Store.set("theme", val); applyTheme(val); renderSettings(); };
    segT.appendChild(b);
  });
  rTheme.appendChild(segT); c1.appendChild(rTheme);

  const rFont = el("div", "row", "<span>Tamaño de letra</span>");
  const segF = el("div", "seg");
  [["A−", -0.08], ["A", "reset"], ["A+", 0.08]].forEach(([lbl, d]) => {
    const b = el("button", null, lbl);
    b.onclick = () => {
      let fs = Store.get("fontSize");
      fs = d === "reset" ? 1.12 : Math.min(1.6, Math.max(0.9, fs + d));
      Store.set("fontSize", fs);
      document.documentElement.style.setProperty("--fs-read", fs + "rem");
    };
    segF.appendChild(b);
  });
  rFont.appendChild(segF); c1.appendChild(rFont);
  frag.appendChild(c1);

  // Interlineal
  const c2 = el("div", "card"); c2.appendChild(el("h3", null, "Estudio del hebreo"));
  c2.appendChild(toggleRow("Mostrar número de Strong", "showStrongs", () => { if (nav) renderReader(); }));
  c2.appendChild(el("p", "muted", "En el Antiguo Testamento, activa el botón עב (arriba) para ver el hebreo palabra por palabra y tócalo para estudiar cada término."));
  frag.appendChild(c2);

  // Acerca de
  const c3 = el("div", "card"); c3.appendChild(el("h3", null, "Acerca de"));
  c3.appendChild(el("p", "muted",
    "<b>Texto español:</b> Reina Valera 1909 (dominio público). La RV1960 tiene derechos de autor; " +
    "se podrá añadir en el futuro con licencia.<br><br>" +
    "<b>Hebreo:</b> Códice de Leningrado / OpenScriptures (CC BY 4.0), con morfología y números de Strong.<br>" +
    "<b>Diccionarios:</b> Concordancia Strong (dominio público).<br><br>" +
    "Hecho para aprender la Palabra de forma profunda y sencilla."));
  frag.appendChild(c3);

  view.replaceChildren(frag);
}
function toggleRow(label, key, after) {
  const row = el("div", "row", `<span>${label}</span>`);
  const seg = el("div", "seg");
  [["Sí", true], ["No", false]].forEach(([lbl, val]) => {
    const b = el("button", Store.get(key) === val ? "is-active" : null, lbl);
    b.onclick = () => { Store.set(key, val); if (after) after(); renderSettings(); };
    seg.appendChild(b);
  });
  row.appendChild(seg);
  return row;
}

/* ---------------------------------------------------------------
   Versículo del día
--------------------------------------------------------------- */
async function dailyCard() {
  const day = Math.floor(Date.now() / 864e5);
  const [bookId, c, v] = DAILY[day % DAILY.length];
  const card = el("div", "daily");
  try {
    const b = await bookById(bookId);
    if (!b) return el("span");
    const es = await Data.es(bookId);
    const text = es.chapters[c - 1][v - 1];
    card.innerHTML = `<small>Versículo del día</small><p>"${esc(text)}"</p><small>${esc(b.name)} ${c}:${v}</small>`;
    card.style.cursor = "pointer";
    card.onclick = () => goTo(bookId, c, v);
  } catch (e) { return el("span"); }
  return card;
}

/* ---------------------------------------------------------------
   Utilidades UI
--------------------------------------------------------------- */
function loadingEl() { return el("div", "loading", '<span class="spin"></span>'); }
function errorEl(e) {
  console.error(e);
  return el("div", "loading", "⚠️ " + esc(e.message || "Error al cargar."));
}
function closeSheets() { $$(".sheet").forEach((s) => (s.hidden = true)); }
let toastT;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2200);
}

/* ---------------------------------------------------------------
   Service worker (offline)
--------------------------------------------------------------- */
function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();

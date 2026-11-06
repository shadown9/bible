/* ============================================================
   app.js — controlador (rediseño simple y táctil)
   Idea central: la lectura está siempre limpia; tocas un
   versículo y aparece TODO (resaltar, favorito, hebreo,
   comparar, copiar).
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
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const COLORS = ["amarillo", "verde", "azul", "rosa", "naranja"];
const nav = { book: Store.get("last").book, chapter: Store.get("last").chapter };
let BOOKS = [];

const DAILY = [
  ["juan", 3, 16], ["salmos", 23, 1], ["genesis", 1, 1], ["proverbios", 3, 5],
  ["filipenses", 4, 13], ["isaias", 41, 10], ["romanos", 8, 28], ["josue", 1, 9],
  ["salmos", 46, 1], ["mateo", 6, 33], ["jeremias", 29, 11], ["salmos", 119, 105],
  ["1-corintios", 13, 4], ["hebreos", 11, 1], ["salmos", 27, 1], ["efesios", 2, 8],
  ["miqueas", 6, 8], ["exodo", 14, 14], ["salmos", 91, 1], ["mateo", 11, 28],
  ["santiago", 1, 5], ["galatas", 5, 22], ["isaias", 40, 31], ["deuteronomio", 31, 6],
];

/* ----------------------------- Arranque ----------------------------- */
async function init() {
  applyTheme(Store.get("theme"));
  document.documentElement.style.setProperty("--fs-read", Store.get("fontSize") + "rem");
  BOOKS = await books();

  $$(".tab").forEach((t) => t.addEventListener("click", () => showView(t.dataset.view)));
  $("#btnNav").addEventListener("click", openNavigator);
  $("#btnTheme").addEventListener("click", cycleTheme);
  // cada botón/fondo [data-close] cierra SOLO su propia hoja (permite apilar)
  document.addEventListener("click", (e) => {
    const c = e.target.closest("[data-close]");
    if (c) { const s = c.closest(".sheet"); if (s) s.hidden = true; }
  });

  updateMarksBadge();
  await renderReader();
  registerSW();
}

/* --------------------------- Navegación vistas --------------------------- */
function showView(name) {
  $$(".view").forEach((v) => v.classList.toggle("is-active", v.id === "view-" + name));
  $$(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.view === name));
  window.scrollTo({ top: 0 });
  if (name === "marks") renderMarks();
  if (name === "search") renderSearch();
  if (name === "settings") renderSettings();
}

function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); }
function cycleTheme() {
  const order = ["auto", "light", "dark"];
  const next = order[(order.indexOf(Store.get("theme")) + 1) % 3];
  Store.set("theme", next); applyTheme(next);
  toast("Tema: " + ({ auto: "automático", light: "claro", dark: "oscuro" }[next]));
}

/* --------------------------- Libro / capítulo --------------------------- */
function openNavigator() {
  $("#navigator").hidden = false;
  renderBookList("AT");
  $$("#navigator .pill").forEach((p) =>
    p.onclick = () => {
      $$("#navigator .pill").forEach((x) => x.classList.toggle("is-active", x === p));
      renderBookList(p.dataset.test);
    });
}
function renderBookList(testament) {
  $("#navTitle").textContent = testament === "AT" ? "Antiguo Testamento" : "Nuevo Testamento";
  const grid = el("div", "book-grid");
  BOOKS.filter((b) => b.testament === testament).forEach((b) => {
    const btn = el("button", b.hasHebrew ? "heb" : null, b.name);
    btn.onclick = () => renderChapterList(b);
    grid.appendChild(btn);
  });
  $("#navBody").replaceChildren(grid);
}
function renderChapterList(b) {
  $("#navTitle").textContent = b.name;
  const back = el("button", "backlink", "‹ Libros");
  back.onclick = () => renderBookList(b.testament);
  const grid = el("div", "chap-grid");
  for (let c = 1; c <= b.chapters; c++) {
    const btn = el("button", null, String(c));
    btn.onclick = () => { $("#navigator").hidden = true; goTo(b.id, c); };
    grid.appendChild(btn);
  }
  $("#navBody").replaceChildren(back, grid);
}

async function goTo(bookId, chapter, verse) {
  nav.book = bookId; nav.chapter = chapter;
  Store.setLast(bookId, chapter);
  $$(".sheet").forEach((s) => (s.hidden = true));
  showView("read");
  await renderReader(verse);
}

/* ------------------------------- Leer ------------------------------- */
async function renderReader(scrollVerse) {
  const view = $("#view-read");
  const b = await bookById(nav.book);
  $("#refLabel").textContent = `${b.name} ${nav.chapter}`;
  view.replaceChildren(loadingEl());
  try {
    const es = await Data.es(nav.book);
    const verses = es.chapters[nav.chapter - 1] || [];
    const frag = document.createDocumentFragment();

    if (!Store.get("seenTip")) frag.appendChild(tipCard());
    if (nav.book === Store.get("last").book && nav.chapter === Store.get("last").chapter)
      frag.appendChild(await dailyCard());
    frag.appendChild(el("h2", "chapter-title", `${b.name} ${nav.chapter}`));

    verses.forEach((text, i) => {
      frag.appendChild(verseEl(b, nav.chapter, i + 1, text));
    });
    frag.appendChild(pager(b));
    view.replaceChildren(frag);

    if (scrollVerse) {
      const t = $(`#v${scrollVerse}`);
      if (t) { t.classList.add("flash"); t.scrollIntoView({ block: "center" }); }
    }
  } catch (e) { view.replaceChildren(errorEl(e)); }
}

function verseEl(b, c, v, text) {
  const ref = `${b.id}:${c}:${v}`;
  const p = el("p", "verse"); p.id = `v${v}`; p.dataset.ref = ref;
  const color = Store.getHighlight(ref);
  if (color) p.classList.add("hl-" + color);
  const star = Store.isFavorite(ref) ? '<span class="verse__fav">★</span>' : "";
  p.innerHTML = `<span class="verse__n">${v}</span>${esc(text)}${star}`;
  p.onclick = () => openVerse(b, c, v, text);
  return p;
}

function pager(b) {
  const wrap = el("div", "pager");
  const prev = el("button", null, "‹ Anterior");
  const next = el("button", null, "Siguiente ›");
  prev.disabled = nav.chapter <= 1;
  next.disabled = nav.chapter >= b.chapters;
  prev.onclick = () => goTo(b.id, nav.chapter - 1);
  next.onclick = () => goTo(b.id, nav.chapter + 1);
  wrap.append(prev, next);
  return wrap;
}

function tipCard() {
  const t = el("div", "tip",
    "<span>💡</span><span>Toca cualquier versículo para <b>resaltarlo con colores</b>, guardarlo en <b>favoritos</b> o <b>estudiarlo palabra por palabra</b> en hebreo con su significado.</span>");
  const x = el("button", null, "✕");
  x.onclick = () => { Store.set("seenTip", true); t.remove(); };
  t.appendChild(x);
  return t;
}

/* ------------------- Menú de acciones del versículo -------------------
   Los botones leen el estado EN VIVO y actualizan en el sitio (sin
   reconstruir el menú), para que marcar/desmarcar varias veces sea fiable
   también en el móvil. */
function openVerse(b, c, v, text) {
  const ref = `${b.id}:${c}:${v}`;
  $("#verseHead").innerHTML = `<strong>${esc(b.name)} ${c}:${v}</strong><p>${esc(text)}</p>`;

  // franja de colores
  const sw = $("#swatches"); sw.replaceChildren();
  COLORS.forEach((col) => {
    const s = el("button", "swatch"); s.dataset.c = col;
    s.setAttribute("aria-label", "Resaltar " + col);
    s.onclick = () => {
      const now = Store.getHighlight(ref);
      const next = now === col ? null : col;       // mismo color = quitar
      Store.setHighlight(ref, next);
      updateVerseDom(ref); updateMarksBadge(); refreshSwatches(ref);
      toast(next ? "Resaltado ✓" : "Resaltado quitado");
    };
    sw.appendChild(s);
  });
  const none = el("button", "swatch swatch--none", "✕");
  none.setAttribute("aria-label", "Quitar resaltado");
  none.onclick = () => {
    Store.setHighlight(ref, null);
    updateVerseDom(ref); updateMarksBadge(); refreshSwatches(ref);
    toast("Resaltado quitado");
  };
  sw.appendChild(none);
  refreshSwatches(ref);

  // acciones
  const acts = $("#verseActions"); acts.replaceChildren();
  const fav = el("button", "action");
  const paintFav = () => {
    const on = Store.isFavorite(ref);
    fav.className = "action" + (on ? " on" : "");
    fav.innerHTML = `<span class="action__i">${on ? "★" : "☆"}</span><span>${on ? "En favoritos" : "Favorito"}</span>`;
  };
  fav.onclick = () => {
    const on = Store.toggleFavorite(ref);
    updateVerseDom(ref); updateMarksBadge(); paintFav();
    toast(on ? "Guardado en favoritos ⭐" : "Quitado de favoritos");
  };
  paintFav();
  acts.appendChild(fav);
  acts.appendChild(actionBtn("📋", "Copiar", "", () => copyVerse(`${b.name} ${c}:${v}`, text)));
  if (b.hasHebrew)
    acts.appendChild(actionBtn("עב", "Estudiar palabra por palabra", "action--wide", () => { $("#verse").hidden = true; openStudy(b, c, v, text); }));

  $("#verse").hidden = false;
}
function refreshSwatches(ref) {
  const cur = Store.getHighlight(ref);
  $$("#swatches .swatch").forEach((s) => {
    const on = s.classList.contains("swatch--none") ? !cur : (s.dataset.c === cur);
    s.classList.toggle("sel", on);
  });
}
function actionBtn(icon, label, extra, fn) {
  const b = el("button", "action " + extra);
  b.innerHTML = `<span class="action__i">${icon}</span><span>${label}</span>`;
  b.onclick = fn;
  return b;
}

// actualiza en el acto el versículo visible (sin recargar el capítulo)
function updateVerseDom(ref) {
  const [, , v] = ref.split(":");
  const p = $(`#v${v}`);
  if (!p || p.dataset.ref !== ref) return;
  COLORS.forEach((c) => p.classList.remove("hl-" + c));
  const col = Store.getHighlight(ref);
  if (col) p.classList.add("hl-" + col);
  const base = p.innerHTML.replace(/<span class="verse__fav">★<\/span>$/, "");
  p.innerHTML = Store.isFavorite(ref) ? base + '<span class="verse__fav">★</span>' : base;
}

async function copyVerse(label, text) {
  const payload = `"${text}"\n— ${label} (RV1909)`;
  try { await navigator.clipboard.writeText(payload); toast("Versículo copiado ✓"); }
  catch (e) { toast("No se pudo copiar en este navegador"); }
}

/* --------- Estudiar un versículo palabra por palabra (panel) ---------
   Cada palabra hebrea con su pronunciación y su SIGNIFICADO en español.
   Esto es estudiar el original, no leerlo en otro idioma. */
async function openStudy(b, c, v, esText) {
  $("#panelTitle").textContent = `${b.name} ${c}:${v} — Estudio`;
  const body = $("#panelBody"); body.replaceChildren(loadingEl());
  $("#panel").hidden = false;
  try {
    const [heb, dict, esMap] = await Promise.all([
      Data.hebrew(b.id), Data.strongsHe(), Data.strongsHeEs().catch(() => ({})),
    ]);
    const words = (heb.chapters[c - 1] || [])[v - 1] || [];
    const frag = document.createDocumentFragment();

    // versículo en español como referencia
    frag.appendChild(el("div", "study-es", `<span class="verse__n">${v}</span>${esc(esText)}`));
    frag.appendChild(el("h4", "cmp-sel-h", "Palabra por palabra · hebreo → español"));

    const list = el("div", "sw-list");
    words.forEach((w) => {
      if (!w.h) return;
      const code = w.s ? "H" + w.s : null;
      const codeA = w.sa ? "H" + w.sa : null;
      const entry = code ? dict[code] : null;
      let mean = (code && esMap[code]) || (codeA && esMap[codeA]) || "";
      let enOnly = false;
      if (!mean && entry) { mean = entry.def || entry.kjv || ""; enOnly = true; }
      if (mean.length > 95) mean = mean.slice(0, 95) + "…";
      const translit = entry ? entry.xlit : "";
      const row = el("div", "sw-word");
      row.innerHTML =
        `<span class="sw-word__heb">${esc(w.h)}</span>` +
        `<span class="sw-word__mid">` +
          (translit ? `<span class="sw-word__translit">${esc(translit)}</span>` : "") +
          `<span class="sw-word__mean">${esc(mean || "—")}${enOnly ? ' <i class="en">(ingl.)</i>' : ""}</span>` +
        `</span>` +
        (code ? `<span class="sw-word__code">${code} ›</span>` : "");
      if (code) row.onclick = () => openWord(code, codeA);
      list.appendChild(row);
    });
    frag.appendChild(list);
    frag.appendChild(el("p", "iln__hint", "👆 Toca una palabra para ver su significado completo y dónde más aparece en la Biblia"));
    body.replaceChildren(frag);
  } catch (e) { body.replaceChildren(errorEl(e)); }
}

/* --------------- Estudio de palabra (diccionario Strong) --------------- */
async function openWord(code, augmented) {
  const body = $("#wordBody");
  $("#word").hidden = false;
  body.replaceChildren(loadingEl());
  try {
    const dict = await Data.strongsHe();
    const entry = dict[code] || (augmented && dict[augmented]) || null;
    const esMap = await Data.strongsHeEs().catch(() => ({}));
    const defEs = esMap[code] || (augmented && esMap[augmented]) || null;
    const conc = await Data.concordanceHe();
    const occ = conc[code] || (augmented && conc[augmented]) || { n: 0, refs: [] };

    const frag = document.createDocumentFragment();
    const head = el("div", "wh");
    head.innerHTML =
      `<div class="wh__h">${entry ? esc(entry.lemma) : "—"}</div>` +
      `<div class="wh__x">${entry ? esc(entry.xlit) : ""} ${entry && entry.pron ? "· <i>" + esc(entry.pron) + "</i>" : ""}</div>` +
      `<span class="wh__code">${code}</span>`;
    frag.appendChild(head);

    if (defEs) frag.appendChild(wsec("Significado", esc(defEs), "wsec--es"));
    if (entry) {
      frag.appendChild(wsec(defEs ? "Definición ampliada (Strong, inglés)" : "Definición (Strong, inglés)", esc(entry.def || entry.kjv || "—")));
      if (entry.deriv) frag.appendChild(wsec("Origen", esc(entry.deriv)));
    }

    const occSec = el("div", "wsec");
    occSec.appendChild(el("h4", null, `Aparece ${occ.n} ${occ.n === 1 ? "vez" : "veces"} en el AT`));
    const list = el("div", "occ");
    for (const r of occ.refs.slice(0, 60)) {
      const [bn, c, v] = r.split(".").map(Number);
      const bk = await bookByNum(bn); if (!bk) continue;
      const btn = el("button", null, `${bk.name} ${c}:${v}`);
      btn.onclick = () => { $$(".sheet").forEach((s) => (s.hidden = true)); goTo(bk.id, c, v); };
      list.appendChild(btn);
    }
    occSec.appendChild(list);
    if (occ.n > 60) occSec.appendChild(el("p", "muted", `…y ${occ.n - 60} más.`));
    frag.appendChild(occSec);
    body.replaceChildren(frag);
  } catch (e) { body.replaceChildren(errorEl(e)); }
}
function wsec(title, html, extra) {
  const s = el("div", "wsec " + (extra || ""));
  s.appendChild(el("h4", null, title));
  s.appendChild(el("p", null, html));
  return s;
}

/* ------------------------------ Mis marcas ------------------------------ */
let marksTab = "favoritos";
function renderMarks() {
  const view = $("#view-marks");
  const head = el("div"); head.style.marginBottom = "1rem";
  const seg = el("div", "seg");
  [["favoritos", "⭐ Favoritos"], ["resaltados", "🎨 Resaltados"]].forEach(([k, lbl]) => {
    const btn = el("button", marksTab === k ? "is-active" : null, lbl);
    btn.onclick = () => { marksTab = k; renderMarks(); };
    seg.appendChild(btn);
  });
  head.appendChild(seg);
  const list = el("div"); list.id = "marksList";
  list.appendChild(loadingEl());
  view.replaceChildren(head, list);
  fillMarks();
}
async function fillMarks() {
  const list = $("#marksList");
  const refs = marksTab === "favoritos"
    ? Store.favorites()
    : Object.keys(Store.highlights());
  if (!refs.length) {
    list.replaceChildren(el("div", "empty",
      `<span class="empty__i">${marksTab === "favoritos" ? "⭐" : "🎨"}</span>` +
      `Aún no tienes ${marksTab}.<br>Toca un versículo mientras lees para ${marksTab === "favoritos" ? "guardarlo" : "resaltarlo"}.`));
    return;
  }
  const frag = document.createDocumentFragment();
  for (const ref of refs) {
    const [bid, c, v] = ref.split(":");
    const b = BOOKS.find((x) => x.id === bid); if (!b) continue;
    let text = "";
    try { const es = await Data.es(bid); text = es.chapters[c - 1][v - 1] || ""; } catch (e) {}
    const item = el("div", "mark");
    const color = Store.getHighlight(ref);
    if (marksTab === "resaltados" && color) {
      const dot = el("span", "mark__dot"); dot.style.background = swatchColor(color); item.appendChild(dot);
    } else {
      item.appendChild(el("span", "mark__dot", "")); item.lastChild.style.background = "var(--gold)";
    }
    const bd = el("div", "mark__body",
      `<div class="mark__ref">${esc(b.name)} ${c}:${v}</div><div class="mark__t">${esc(text)}</div>`);
    bd.onclick = () => goTo(bid, +c, +v);
    const x = el("button", "mark__x", "✕");
    x.onclick = (e) => {
      e.stopPropagation();
      if (marksTab === "favoritos") Store.toggleFavorite(ref); else Store.setHighlight(ref, null);
      updateMarksBadge(); fillMarks();
    };
    item.append(bd, x);
    frag.appendChild(item);
  }
  list.replaceChildren(frag);
}
function swatchColor(c) {
  return { amarillo: "#facc15", verde: "#4ade80", azul: "#60a5fa", rosa: "#f472b6", naranja: "#fb923c" }[c] || "#facc15";
}
function updateMarksBadge() {
  const tab = $('.tab[data-view="marks"]');
  let badge = tab.querySelector(".tab__badge");
  const n = Store.marksCount();
  if (!n) { if (badge) badge.remove(); return; }
  if (!badge) { badge = el("span", "tab__badge"); tab.appendChild(badge); }
  badge.textContent = n > 99 ? "99+" : n;
}

/* ------------------------------- Buscar ------------------------------- */
let searchReady = false;
function renderSearch() {
  const view = $("#view-search");
  if (searchReady) return;
  const box = el("div", "search-box");
  const input = el("input"); input.type = "search"; input.placeholder = "Buscar palabra o frase…"; input.id = "searchInput";
  const btn = el("button", "iconbtn", "Buscar"); btn.style.minWidth = "auto"; btn.style.padding = ".6rem 1rem";
  box.append(input, btn);
  const results = el("div"); results.id = "searchResults";
  results.appendChild(el("p", "muted", "Escribe al menos 3 letras. Se busca en la Reina Valera 1909."));
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
      const bk = BOOKS[bi]; const chapters = arr[bi].chapters;
      for (let ci = 0; ci < chapters.length; ci++) {
        const vs = chapters[ci];
        for (let vi = 0; vi < vs.length; vi++) {
          if (norm(vs[vi]).includes(nq)) { out.push({ bk, c: ci + 1, v: vi + 1, t: vs[vi] }); if (out.length >= 300) break; }
        }
        if (out.length >= 300) break;
      }
    }
    const frag = document.createDocumentFragment();
    frag.appendChild(el("p", "muted", out.length ? `${out.length}${out.length >= 300 ? "+" : ""} resultado(s)` : "Sin resultados."));
    const re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
    out.forEach((r) => {
      const d = el("div", "result");
      d.innerHTML = `<div class="result__ref">${esc(r.bk.name)} ${r.c}:${r.v}</div><div class="result__t">${esc(r.t).replace(re, "<mark>$1</mark>")}</div>`;
      d.onclick = () => goTo(r.bk.id, r.c, r.v);
      frag.appendChild(d);
    });
    results.replaceChildren(frag);
  } catch (e) { results.replaceChildren(errorEl(e)); }
}

/* ------------------------------- Ajustes ------------------------------- */
function renderSettings() {
  const view = $("#view-settings");
  const s = Store.all();
  const frag = document.createDocumentFragment();

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
      fs = d === "reset" ? 1.14 : Math.min(1.7, Math.max(0.9, fs + d));
      Store.set("fontSize", fs);
      document.documentElement.style.setProperty("--fs-read", fs + "rem");
    };
    segF.appendChild(b);
  });
  rFont.appendChild(segF); c1.appendChild(rFont);
  frag.appendChild(c1);

  const c3 = el("div", "card"); c3.appendChild(el("h3", null, "Cómo usar la app"));
  c3.appendChild(el("p", "muted",
    "📖 <b>Lee</b> y <b>toca cualquier versículo</b> para abrir su menú: resaltar con colores, guardar en favoritos o estudiarlo.<br><br>" +
    "עב <b>Estudiar palabra por palabra</b> (Antiguo Testamento): ves cada palabra hebrea con su pronunciación y su significado en español; toca una palabra para ver todo su sentido y dónde más aparece.<br><br>" +
    "⭐ En <b>Mis marcas</b> encuentras todo lo que guardaste."));
  frag.appendChild(c3);

  const c4 = el("div", "card"); c4.appendChild(el("h3", null, "Acerca de"));
  c4.appendChild(el("p", "muted",
    "<b>Texto:</b> Reina Valera 1909 (dominio público). La RV1960 tiene derechos de autor.<br>" +
    "<b>Hebreo:</b> Códice de Leningrado / OpenScriptures (CC BY 4.0).<br>" +
    "<b>Significados:</b> ~1000 términos hebreos traducidos al español + Concordancia Strong.<br><br>" +
    "Hecho para aprender la Palabra de forma profunda y sencilla.<br>" +
    "<span style='opacity:.7'>Versión 1.0 · actualizada 6 nov 2026</span>"));
  frag.appendChild(c4);
  view.replaceChildren(frag);
}

/* ---------------------------- Versículo del día ---------------------------- */
async function dailyCard() {
  const day = Math.floor(Date.now() / 864e5);
  const [bookId, c, v] = DAILY[day % DAILY.length];
  const card = el("div", "daily");
  try {
    const b = await bookById(bookId); if (!b) return el("span");
    const es = await Data.es(bookId);
    const text = es.chapters[c - 1][v - 1];
    card.innerHTML = `<small>Versículo del día</small><p>"${esc(text)}"</p><small>${esc(b.name)} ${c}:${v}</small>`;
    card.onclick = () => goTo(bookId, c, v);
  } catch (e) { return el("span"); }
  return card;
}

/* ------------------------------ Utilidades ------------------------------ */
function loadingEl() { return el("div", "loading", '<span class="spin"></span>'); }
function errorEl(e) { console.error(e); return el("div", "loading", "⚠️ " + esc(e.message || "Error al cargar.")); }
let toastT;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2000);
}
function registerSW() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

init();

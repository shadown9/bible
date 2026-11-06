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

/* --------- Estudiar un versículo (panel) ---------
   Una sola pantalla: arriba el versículo en Español · Hebreo · Inglés
   (lo que importa, por defecto), y debajo el análisis palabra por
   palabra con el significado de cada término hebreo en español.
   Elegir versiones NO cierra la pantalla. */
const LANG_ES = {
  "Español": "Español", "Hebreo": "Hebreo", "English": "Inglés", "Arabic": "Árabe",
  "Chinese": "Chino", "German": "Alemán", "Greek": "Griego (moderno)", "Esperanto": "Esperanto",
  "Finnish": "Finés", "French": "Francés", "Korean": "Coreano", "Portuguese": "Portugués",
  "Romanian": "Rumano", "Russian": "Ruso", "Vietnamese": "Vietnamita",
};

async function openStudy(b, c, v, esText) {
  const ref = `${b.id}:${c}:${v}`;
  $("#panelTitle").textContent = `${b.name} ${c}:${v} — Guía de estudio`;
  const body = $("#panelBody"); body.replaceChildren(loadingEl());
  $("#panel").hidden = false;
  try {
    const [heb, dict, esMap, vers] = await Promise.all([
      Data.hebrew(b.id), Data.strongsHe(), Data.strongsHeEs().catch(() => ({})), Data.versions(),
    ]);
    const core = [
      { id: "es_rvr", name: "Reina Valera 1909", lang: "Español" },
      { id: "he_wlc", name: "Hebreo (original)", lang: "Hebreo", rtl: true },
      { id: "en_kjv", name: "King James", lang: "Inglés" },
    ];
    const rest = vers.filter((x) => x.id !== "es_rvr" && x.id !== "en_kjv")
      .map((x) => ({ id: x.id, name: x.name, lang: LANG_ES[x.lang] || x.lang, file: x.file }));
    const options = [...core, ...rest];
    let picks = Store.get("compare").filter((id) => options.some((o) => o.id === id));
    if (!picks.length) picks = ["es_rvr", "he_wlc", "en_kjv"];
    Store.set("compare", picks);
    const words = (heb.chapters[c - 1] || [])[v - 1] || [];

    const frag = document.createDocumentFragment();
    frag.appendChild(explainerCard());
    frag.appendChild(el("p", "study-intro", "Estudia este versículo en 6 pasos. Toca cada paso para abrirlo. No necesitas saber hebreo: la app te explica todo."));

    // Paso 1 — Lee y observa
    const s1 = el("div");
    s1.appendChild(el("div", "study-es", `<span class="verse__n">${v}</span>${esc(esText)}`));
    s1.appendChild(el("p", "step-q", "Léelo despacio y pregúntate: ¿Quién habla o actúa? ¿Qué sucede? ¿Hay palabras que se repiten o te llaman la atención?"));
    s1.appendChild(noteBox(ref, "obs", "Escribe lo que observas…"));
    frag.appendChild(stepCard(1, "Lee y observa", "¿Qué dice el texto?", s1, true));

    // Paso 2 — El original (hebreo)
    const s2 = el("div");
    s2.appendChild(el("p", "step-q", "Aquí ves cada palabra del texto hebreo con su significado en español. Fíjate en las palabras clave; toca cualquiera para ver más."));
    s2.appendChild(legendCard());
    s2.appendChild(buildWordByWord(words, dict, esMap));
    frag.appendChild(stepCard(2, "Mira el original", "Las palabras en hebreo y su significado", s2, false));

    // Paso 3 — Compara
    const s3 = el("div");
    s3.appendChild(el("p", "step-q", "El mismo versículo en español, hebreo e inglés. Comparar versiones ayuda a entenderlo mejor."));
    const rows = el("div"); rows.id = "cmpRows"; s3.appendChild(rows);
    s3.appendChild(compareSelector(b, c, v, options));
    frag.appendChild(stepCard(3, "Compara versiones", "El versículo en varios idiomas", s3, false));

    // Paso 4 — Interpreta
    const s4 = el("div");
    s4.appendChild(el("p", "step-q", "Con lo que observaste y el significado de las palabras: ¿Qué quiso decir el autor a sus primeros lectores? ¿Qué nos enseña sobre Dios?"));
    s4.appendChild(noteBox(ref, "int", "Escribe qué significa…"));
    frag.appendChild(stepCard(4, "¿Qué significa?", "Interpretación", s4, false));

    // Paso 5 — Aplica
    const s5 = el("div");
    s5.appendChild(el("p", "step-q", "¿Qué debo creer, cambiar o hacer hoy por lo que dice este versículo? Escribe una acción concreta."));
    s5.appendChild(noteBox(ref, "app", "Escribe cómo lo aplicas a tu vida…"));
    frag.appendChild(stepCard(5, "¿Qué hago yo?", "Aplicación a tu vida", s5, false));

    // Paso 6 — Ora y guarda
    const s6 = el("div");
    s6.appendChild(el("p", "step-q", "Responde a Dios en oración por lo que aprendiste. Y guarda este versículo para recordarlo:"));
    const acts = el("div", "step-actions");
    const favB = el("button", "action");
    const paintFav = () => {
      const on = Store.isFavorite(ref);
      favB.className = "action" + (on ? " on" : "");
      favB.innerHTML = `<span class="action__i">${on ? "★" : "☆"}</span><span>${on ? "En favoritos" : "Guardar en favoritos"}</span>`;
    };
    favB.onclick = () => { const on = Store.toggleFavorite(ref); updateVerseDom(ref); updateMarksBadge(); paintFav(); toast(on ? "Guardado ⭐" : "Quitado"); };
    paintFav();
    const hlB = el("button", "action");
    const paintHl = () => {
      const on = Store.getHighlight(ref) === "amarillo";
      hlB.className = "action" + (on ? " on" : "");
      hlB.innerHTML = `<span class="action__i">🎨</span><span>${on ? "Resaltado" : "Resaltar"}</span>`;
    };
    hlB.onclick = () => { const on = Store.getHighlight(ref) === "amarillo"; Store.setHighlight(ref, on ? null : "amarillo"); updateVerseDom(ref); updateMarksBadge(); paintHl(); toast(on ? "Resaltado quitado" : "Resaltado ✓"); };
    paintHl();
    acts.append(favB, hlB);
    s6.appendChild(acts);
    frag.appendChild(stepCard(6, "Ora y guarda", "Responde y recuerda", s6, false));

    body.replaceChildren(frag);
    await drawStudyRows(b, c, v, options);
  } catch (e) { body.replaceChildren(errorEl(e)); }
}

/* --- piezas de la guía de estudio --- */
function explainerCard() {
  const d = el("details", "explainer");
  d.appendChild(el("summary", null, "❓ ¿Primera vez? Qué significan estas cosas"));
  const body = el("div", "explainer__b");
  body.innerHTML =
    "<p><b>¿Por qué el hebreo?</b> El Antiguo Testamento se escribió en hebreo. Mirar la palabra original te ayuda a entender mejor lo que quiso decir el autor, más allá de la traducción.</p>" +
    "<p><b>La palabra en hebreo</b> se lee de derecha a izquierda (ejemplo: הָיָה).</p>" +
    "<p><b>La pronunciación</b> (en <i>cursiva</i>, como «háyah») te dice cómo suena esa palabra.</p>" +
    "<p><b>El código Strong</b> (como «H1961») es un número que identifica cada palabra hebrea. Con él puedes ver su significado exacto y todos los versículos donde aparece, aunque no sepas hebreo.</p>" +
    "<p><b>El significado</b> es qué quiere decir esa palabra en español.</p>";
  d.appendChild(body);
  return d;
}
function stepCard(num, title, subtitle, bodyEl, open) {
  const d = el("details", "step"); if (open) d.open = true;
  const sum = el("summary");
  sum.innerHTML = `<span class="step__n">${num}</span><span class="step__tt"><b>${esc(title)}</b><small>${esc(subtitle)}</small></span><span class="step__chev">▾</span>`;
  d.appendChild(sum);
  const wrap = el("div", "step__b");
  wrap.appendChild(bodyEl);
  d.appendChild(wrap);
  return d;
}
function noteBox(ref, key, placeholder) {
  const wrap = el("div", "note");
  wrap.appendChild(el("div", "note__lab", "📝 Tu nota"));
  const ta = document.createElement("textarea");
  ta.className = "note__ta"; ta.placeholder = placeholder; ta.rows = 3;
  ta.value = Store.getNote(ref, key);
  ta.addEventListener("input", () => Store.setNote(ref, key, ta.value.trim()));
  wrap.appendChild(ta);
  return wrap;
}
function legendCard() {
  return el("div", "legend",
    "En cada tarjeta: <b>palabra hebrea</b> · <i>cómo suena</i> · <b>significado en español</b> · su <b>código</b>. Toca una tarjeta para ver todo.");
}
function buildWordByWord(words, dict, esMap) {
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
  return list;
}
function compareSelector(b, c, v, options) {
  const det = el("details", "cmp-add");
  det.appendChild(el("summary", null, "＋ Elegir idiomas y versiones"));
  const sel = el("div", "cmp-pick");
  options.forEach((o) => {
    const chip = el("button", "vchip");
    const paint = () => {
      const on = Store.get("compare").includes(o.id);
      chip.className = "vchip" + (on ? " on" : "");
      chip.innerHTML = `<span class="vchip__c">${on ? "✓" : "＋"}</span> ${esc(o.lang)}${o.id !== "he_wlc" ? ` <small>${esc(o.name)}</small>` : ""}`;
    };
    chip.onclick = () => {
      let arr = Store.get("compare").slice();
      if (arr.includes(o.id)) {
        if (arr.length <= 1) { toast("Deja al menos una versión"); return; }
        arr = arr.filter((x) => x !== o.id);
      } else {
        if (arr.length >= 5) { toast("Máximo 5 a la vez"); return; }
        arr.push(o.id);
      }
      Store.set("compare", arr);
      paint(); drawStudyRows(b, c, v, options);
    };
    paint();
    sel.appendChild(chip);
  });
  det.appendChild(sel);
  return det;
}

async function drawStudyRows(b, c, v, options) {
  const rows = $("#cmpRows"); if (!rows) return;
  rows.replaceChildren(loadingEl());
  const picks = Store.get("compare");
  const frag = document.createDocumentFragment();
  for (const id of picks) {
    const o = options.find((x) => x.id === id) || { name: id, lang: "" };
    const row = el("div", "cmp-row");
    // etiqueta en español, con el idioma bien visible (p.ej. HEBREO)
    row.appendChild(el("div", "cmp-row__h", `<b>${esc(o.lang)}</b> <small>${esc(o.name || "")}</small>`));
    let txt = "—", rtl = false;
    try {
      if (id === "he_wlc") {
        const heb = await Data.hebrew(b.id);
        const ws = (heb.chapters[c - 1] || [])[v - 1] || [];
        txt = ws.map((w) => w.h).join(" "); rtl = true;
      } else {
        const arr = await Data.versionFile(o.file || `json/${id}.json`);
        txt = (arr[b.n - 1] && arr[b.n - 1].chapters[c - 1] && arr[b.n - 1].chapters[c - 1][v - 1]) || "—";
      }
    } catch (e) { txt = "(no disponible)"; }
    row.appendChild(el("div", "cmp-row__t" + (rtl ? " rtl" : ""), esc(txt)));
    frag.appendChild(row);
  }
  rows.replaceChildren(frag);
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
    // Cabecera: palabra hebrea y pronunciación, cada una ETIQUETADA
    const head = el("div", "wh");
    const pron = entry ? (entry.xlit + (entry.pron ? ` · ${entry.pron}` : "")) : "";
    head.innerHTML =
      `<div class="wlab">Palabra en hebreo</div>` +
      `<div class="wh__h">${entry ? esc(entry.lemma) : "—"}</div>` +
      (pron ? `<div class="wlab">Cómo se pronuncia</div><div class="wh__x"><i>${esc(pron)}</i></div>` : "");
    frag.appendChild(head);

    // Significado en español (lo más importante)
    if (defEs) frag.appendChild(wsec("Qué significa (en español)", esc(defEs), "wsec--es"));
    else if (entry) frag.appendChild(wsec("Qué significa", esc(entry.def || entry.kjv || "—"), "wsec--es"));

    // Explicación del código Strong (para que no sea un misterio)
    const codeBox = el("div", "wcode");
    codeBox.innerHTML =
      `<div class="wcode__top"><span class="wcode__badge">${code}</span><span class="wcode__t">Código Strong</span></div>` +
      `<p class="muted">Es el número que identifica esta palabra hebrea. Con él puedes ver su significado exacto y todos los versículos donde aparece, aunque no sepas hebreo.</p>`;
    frag.appendChild(codeBox);

    // Detalle adicional en inglés (opcional)
    if (defEs && entry && (entry.def || entry.kjv))
      frag.appendChild(wsec("Más detalle (en inglés, opcional)", esc(entry.def || entry.kjv)));
    if (entry && entry.deriv)
      frag.appendChild(wsec("De dónde viene la palabra", esc(entry.deriv)));

    // Apariciones, con explicación de para qué sirve
    const occSec = el("div", "wsec");
    occSec.appendChild(el("h4", null, `Dónde más aparece · ${occ.n} ${occ.n === 1 ? "vez" : "veces"}`));
    occSec.appendChild(el("p", "muted", "Ver la misma palabra en otros versículos te ayuda a entender mejor su sentido. Toca uno para ir allí:"));
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

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

// Géneros literarios: nombre y cómo leer cada uno (lo #1 de la hermenéutica)
const GENRES = {
  narrativa: { n: "Narrativa / Historia", c: "Cuenta hechos reales. Pregúntate qué está haciendo DIOS en la historia, no solo qué hacen los personajes. No todo lo que se narra se aprueba: observa, no copies sin pensar." },
  ley: { n: "Ley", c: "Son instrucciones del pacto de Dios con Israel. Busca el principio y el carácter de Dios detrás de cada mandato, y cómo se cumple en Cristo." },
  sabiduria: { n: "Sabiduría", c: "Enseña a vivir bien. Los proverbios son principios generales, no promesas absolutas. Job y Eclesiastés plantean las grandes preguntas de la vida." },
  poesia: { n: "Poesía", c: "Usa imágenes, sentimientos y paralelismo (repetir una idea con otras palabras). No la leas de forma tan literal; siente lo que expresa a Dios." },
  profecia: { n: "Profecía", c: "Más que predecir el futuro, es llamar al pueblo a volver a Dios. Fíjate en el pecado que denuncia, el juicio y la esperanza que anuncia." },
  evangelio: { n: "Evangelio", c: "Presenta la vida, muerte y resurrección de Jesús. Cada evangelista lo cuenta con un énfasis. Observa qué revela de quién es Jesús." },
  hechos: { n: "Historia (la iglesia)", c: "Narra cómo creció la iglesia por el Espíritu. Describe lo que pasó; no todo es un mandato para repetir, pero muestra el patrón de la misión." },
  epistola: { n: "Carta", c: "Es una carta a una situación concreta. Lee el párrafo entero, sigue el argumento, y pregunta qué les decía a ellos antes de aplicarlo hoy." },
  apocaliptica: { n: "Apocalíptica", c: "Usa visiones y símbolos para dar esperanza a los perseguidos. No fuerces cada símbolo; capta el mensaje central: Dios vence." },
};

/* ----------------------------- Arranque ----------------------------- */
async function init() {
  applyTheme(Store.get("theme"));
  document.documentElement.style.setProperty("--fs-read", Store.get("fontSize") + "rem");
  BOOKS = await books();

  $$(".tab").forEach((t) => t.addEventListener("click", () => showView(t.dataset.view)));
  $("#btnNav").addEventListener("click", openNavigator);
  $("#btnTheme").addEventListener("click", cycleTheme);
  $("#btnHelp").addEventListener("click", () => showWelcome());
  // Buscador rápido desde cualquier pantalla (la lupa de arriba)
  $("#btnFind").addEventListener("click", openFind);
  $("#findClose").addEventListener("click", closeFind);
  const fi = $("#findInput");
  fi.addEventListener("input", () => { clearTimeout(findT); findT = setTimeout(() => liveFind(fi.value.trim()), 180); });
  fi.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeFind(); return; }
    if (e.key !== "Enter") return;
    const r = parseReference(fi.value.trim());
    if (r) { goTo(BOOKS[r.bi].id, Math.min(Math.max(1, r.c), BOOKS[r.bi].chapters), r.v); closeFind(); }
  });
  // cada botón/fondo [data-close] cierra SOLO su propia hoja (permite apilar)
  document.addEventListener("click", (e) => {
    const c = e.target.closest("[data-close]");
    if (c) { const s = c.closest(".sheet"); if (s) s.hidden = true; }
  });

  // Bloquear el scroll del fondo cuando hay un panel/hoja abierto
  const overlays = [...$$(".sheet"), $("#welcome")].filter(Boolean);
  const updateScrollLock = () => {
    const open = overlays.some((s) => !s.hidden);
    document.documentElement.classList.toggle("locked", open);
  };
  const obs = new MutationObserver(updateScrollLock);
  overlays.forEach((s) => obs.observe(s, { attributes: true, attributeFilter: ["hidden"] }));

  updateMarksBadge();
  await renderReader();
  if (!Store.get("onboarded")) showWelcome();
  registerSW();
}

/* --------- Bienvenida / ¿Cómo se usa? (para que sea intuitivo) --------- */
function showWelcome() {
  const body = $("#welcomeBody");
  const steps = [
    ["📖", "Elige qué leer", "Toca el nombre del libro arriba (por ejemplo «Génesis 1») para elegir cualquier libro y capítulo."],
    ["👆", "Toca un versículo", "Aparece un menú con todo: resaltar con colores, guardar en favoritos, y estudiarlo a fondo."],
    ["🧭", "Te guío paso a paso", "No necesitas saber hebreo ni nada de antes. La app te explica cada cosa en español, sencillo."],
    ["⭐", "Tus marcas, siempre", "Lo que resaltes o guardes queda reunido en la pestaña «Mis marcas»."],
  ];
  const frag = document.createDocumentFragment();
  frag.appendChild(el("div", "wc-hero",
    `<div class="wc-hero__i">📖</div><h2>Tu Biblia de Estudio</h2><p>Lee y entiende la Biblia de forma fácil, paso a paso. Así funciona:</p>`));
  steps.forEach(([i, t, d]) => {
    frag.appendChild(el("div", "wc-step",
      `<span class="wc-step__i">${i}</span><span class="wc-step__t"><b>${esc(t)}</b><span>${esc(d)}</span></span>`));
  });
  const go = el("button", "wc-go", "Empezar a leer");
  go.onclick = closeWelcome;
  frag.appendChild(go);
  const tip = el("p", "muted");
  tip.style.cssText = "text-align:center;margin-top:.8rem;font-size:.82rem";
  tip.innerHTML = "Puedes volver a ver esto con el botón <b>?</b> de arriba.";
  frag.appendChild(tip);
  body.replaceChildren(frag);
  $("#welcome").hidden = false;
}
function closeWelcome() {
  Store.set("onboarded", true);
  $("#welcome").hidden = true;
}

/* --------------------------- Navegación vistas --------------------------- */
function showView(name) {
  if (name !== "short") shortStop();            // al salir del Short, cortamos el audio
  $$(".view").forEach((v) => v.classList.toggle("is-active", v.id === "view-" + name));
  $$(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.view === name));
  document.documentElement.classList.toggle("short-mode", name === "short");
  window.scrollTo({ top: 0 });
  if (name === "short") renderShort();
  if (name === "discover") renderDiscover();
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
    const btn = el("button", b.hasHebrew ? "heb" : (b.hasGreek ? "grk" : null), b.name);
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
    if (nav.book === Store.get("last").book && nav.chapter === Store.get("last").chapter) {
      frag.appendChild(await dailyCard());
      const disc = el("button", "disc-cta", "🧭 Descubre planes de lectura y temas →");
      disc.onclick = () => showView("discover");
      frag.appendChild(disc);
    }
    frag.appendChild(el("h2", "chapter-title", `${b.name} ${nav.chapter}`));

    // barra del libro: género + "Sobre este libro"
    const intro = await Data.booksIntro().catch(() => ({}));
    const bi = intro[b.id];
    if (bi) {
      const bar = el("div", "bookbar");
      const gen = GENRES[bi.g];
      const chip = el("span", "bookbar__genre", gen ? gen.n : "");
      const btn = el("button", "bookbar__about", `ℹ️ Sobre ${b.name}`);
      btn.onclick = () => openBookIntro(b, bi);
      bar.append(chip, btn);
      frag.appendChild(bar);
    }

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

// Pantalla "Sobre este libro": género, cómo leerlo e introducción
async function openBookIntro(b, bi) {
  $("#panelTitle").textContent = `Sobre ${b.name}`;
  const body = $("#panelBody");
  const frag = document.createDocumentFragment();
  const gen = GENRES[bi.g];

  if (gen) {
    const gc = el("div", "bookintro__genre");
    gc.innerHTML = `<div class="cmp-sel-h">Tipo de texto (género)</div><div class="bi-genre-name">${esc(gen.n)}</div><p class="muted">${esc(gen.c)}</p>`;
    frag.appendChild(gc);
  }

  const facts = el("div", "bi-facts");
  const row = (lab, val) => val ? `<div class="bi-fact"><span>${lab}</span><b>${esc(val)}</b></div>` : "";
  facts.innerHTML =
    row("Autor", bi.autor) + row("Fecha", bi.fecha) + row("Escrito para", bi.para);
  frag.appendChild(facts);

  if (bi.prop) frag.appendChild(wsec("De qué trata", esc(bi.prop)));
  if (bi.tema) frag.appendChild(wsec("Tema central", esc(bi.tema)));

  if (bi.clave) {
    const [kb, kc, kv] = bi.clave.split(":");
    const ks = el("div", "wsec");
    ks.appendChild(el("h4", null, "Versículo clave"));
    const kbtn = el("button", "occ-key");
    kbtn.textContent = `${b.name} ${kc}:${kv}  ›`;
    kbtn.onclick = () => { $$(".sheet").forEach((s) => (s.hidden = true)); goTo(kb, +kc, +kv); };
    ks.appendChild(kbtn);
    frag.appendChild(ks);
  }

  if (bi.bosquejo && bi.bosquejo.length) {
    const os = el("div", "wsec");
    os.appendChild(el("h4", null, "Bosquejo"));
    const ul = el("ul", "bi-outline");
    bi.bosquejo.forEach((p) => ul.appendChild(el("li", null, esc(p))));
    os.appendChild(ul);
    frag.appendChild(os);
  }

  body.replaceChildren(frag);
  $("#panel").hidden = false;
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
  const mem = el("button", "action");
  const paintMem = () => {
    const on = Store.memHas(ref);
    mem.className = "action" + (on ? " on" : "");
    mem.innerHTML = `<span class="action__i">🧠</span><span>${on ? "Memorizando" : "Memorizar"}</span>`;
  };
  mem.onclick = () => { const on = Store.memToggle(ref); paintMem(); toast(on ? "Añadido a memorizar 🧠" : "Quitado de memorizar"); };
  paintMem();
  acts.appendChild(mem);
  if (b.hasHebrew || b.hasGreek)
    acts.appendChild(actionBtn(b.hasHebrew ? "עב" : "Ω", "Estudiar palabra por palabra", "action--wide", () => { $("#verse").hidden = true; openStudy(b, c, v, text); }));

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
    const lang = b.hasHebrew ? "he" : "gr";          // AT = hebreo, NT = griego
    const origId = lang === "he" ? "he_wlc" : "gr_sblgnt";
    const origLangName = lang === "he" ? "Hebreo" : "Griego";
    const [orig, dict, esMap, vers] = await Promise.all([
      lang === "he" ? Data.hebrew(b.id) : Data.greek(b.id),
      lang === "he" ? Data.strongsHe() : Data.strongsGr(),
      (lang === "he" ? Data.strongsHeEs() : Data.strongsGrEs()).catch(() => ({})),
      Data.versions(),
    ]);
    const core = [
      { id: "es_rvr", name: "Reina-Valera Gómez", lang: "Español" },
      { id: origId, name: origLangName + " (original)", lang: origLangName, rtl: lang === "he", orig: lang },
      { id: "en_kjv", name: "King James", lang: "Inglés" },
    ];
    const rest = vers.filter((x) => x.id !== "es_rvr" && x.id !== "en_kjv")
      .map((x) => ({ id: x.id, name: x.name, lang: LANG_ES[x.lang] || x.lang, file: x.file }));
    const options = [...core, ...rest];
    // el "slot" del original sigue el idioma del libro (hebreo/griego)
    let picks = Store.get("compare").map((id) =>
      (id === "he_wlc" || id === "gr_sblgnt") ? origId : id)
      .filter((id) => options.some((o) => o.id === id));
    picks = [...new Set(picks)];
    if (!picks.length) picks = ["es_rvr", origId, "en_kjv"];
    Store.set("compare", picks);
    const words = (orig.chapters[c - 1] || [])[v - 1] || [];

    const frag = document.createDocumentFragment();
    frag.appendChild(explainerCard(lang));
    frag.appendChild(el("p", "study-intro", "Estudia este versículo en 7 pasos. Toca cada paso para abrirlo. No necesitas saber " + (lang === "he" ? "hebreo" : "griego") + ": la app te explica todo."));

    // Paso 1 — Ora y lee
    const s1 = el("div");
    s1.appendChild(el("p", "step-q", "Antes de empezar, pide a Dios en una breve oración que te enseñe por su Palabra. Luego lee el versículo despacio; si puedes, lee también el de antes y el de después."));
    s1.appendChild(el("div", "study-es", `<span class="verse__n">${v}</span>${esc(esText)}`));
    frag.appendChild(stepCard(1, "Ora y lee", "Prepárate y lee el texto", s1, true));

    // Paso 2 — Observa
    const s2 = el("div");
    s2.appendChild(el("p", "step-q", "¿Qué DICE el texto? Fíjate en los detalles: ¿Quién habla o actúa? ¿A quién? ¿Qué sucede? ¿Cuándo y dónde? ¿Hay palabras que se repiten o te llaman la atención?"));
    s2.appendChild(noteBox(ref, "obs", "Escribe lo que observas…"));
    frag.appendChild(stepCard(2, "Observa", "¿Qué dice el texto?", s2, false));

    // Paso 3 — Contexto (la "C" de OICA: la clave para no equivocarse)
    const s3 = el("div");
    s3.appendChild(el("p", "step-q", "Ningún versículo se entiende solo. Pregúntate: ¿Qué pasó ANTES y DESPUÉS? ¿Quién escribió este libro y a quién? ¿Qué tipo de texto es: historia, poesía, ley, profecía o carta? El contexto es la clave para no sacar ideas equivocadas."));
    s3.appendChild(noteBox(ref, "ctx", "Escribe el contexto que descubras…"));
    frag.appendChild(stepCard(3, "Mira el contexto", "¿Qué hay alrededor?", s3, false));

    // Paso 4 — Mira el original
    const origAdj = lang === "he" ? "hebreo" : "griego";
    const s4 = el("div");
    s4.appendChild(el("p", "step-q", `Compara el versículo en español con sus palabras en ${origAdj}. Cada palabra aparece en su orden original con su significado, para que veas cuál es cuál.`));
    s4.appendChild(el("div", "study-es", `<span class="verse__n">${v}</span>${esc(esText)}`));
    s4.appendChild(legendCard(lang));
    s4.appendChild(buildWordByWord(words, dict, esMap, lang));
    s4.appendChild(el("p", "step-note", `⚠️ El ${origAdj} y el español no van palabra por palabra en el mismo orden, y una palabra puede traducirse con varias (o ninguna). Guíate por el significado. El sentido real lo decide el contexto, no solo el diccionario.`));
    frag.appendChild(stepCard(4, "Mira el original", `Las palabras en ${origAdj} y su significado`, s4, false));

    // Paso 5 — Compara
    const s5 = el("div");
    s5.appendChild(el("p", "step-q", "El mismo versículo en español, hebreo e inglés. Comparar ayuda a entenderlo. (En el paso anterior, al tocar una palabra, también puedes ver en qué otros versículos aparece: eso se llama correlación.)"));
    const rows = el("div"); rows.id = "cmpRows"; s5.appendChild(rows);
    s5.appendChild(compareSelector(b, c, v, options));
    frag.appendChild(stepCard(5, "Compara", "El versículo en varios idiomas", s5, false));

    // Paso 6 — Interpreta
    const s6 = el("div");
    s6.appendChild(el("p", "step-q", "Une todo lo anterior: ¿Qué quiso decir el autor a sus PRIMEROS lectores, en su contexto? ¿Qué nos enseña sobre Dios? (Primero qué significó para ellos; luego, qué significa hoy.)"));
    s6.appendChild(noteBox(ref, "int", "Escribe qué significa…"));
    frag.appendChild(stepCard(6, "¿Qué significa?", "Interpretación", s6, false));

    // Paso 7 — Aplica y responde
    const s7 = el("div");
    s7.appendChild(el("p", "step-q", "¿Qué debo creer, cambiar o hacer hoy por lo que dice este versículo? Escribe una acción concreta, responde a Dios en oración, y guárdalo para recordarlo:"));
    s7.appendChild(noteBox(ref, "app", "Escribe cómo lo aplicas a tu vida…"));
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
    s7.appendChild(acts);
    frag.appendChild(stepCard(7, "Aplica y responde", "¿Qué hago yo? Ora y guarda", s7, false));

    body.replaceChildren(frag);
    await drawStudyRows(b, c, v, options);
  } catch (e) { body.replaceChildren(errorEl(e)); }
}

/* --- piezas de la guía de estudio --- */
function explainerCard(lang) {
  const he = lang !== "gr";
  const d = el("details", "explainer");
  d.appendChild(el("summary", null, "❓ ¿Primera vez? Qué significan estas cosas"));
  const body = el("div", "explainer__b");
  const porque = he
    ? "<p><b>¿Por qué el hebreo?</b> El Antiguo Testamento se escribió en hebreo. Mirar la palabra original ayuda a entender mejor al autor, más allá de la traducción.</p>" +
      "<p><b>La palabra en hebreo</b> se lee de derecha a izquierda (ejemplo: הָיָה).</p>"
    : "<p><b>¿Por qué el griego?</b> El Nuevo Testamento se escribió en griego. Mirar la palabra original ayuda a entender mejor al autor, más allá de la traducción.</p>" +
      "<p><b>La palabra en griego</b> se lee de izquierda a derecha (ejemplo: ἀγάπη).</p>";
  body.innerHTML =
    "<p><b>¿Qué método sigue esta guía?</b> El <b>método inductivo</b>, el más usado para estudiar la Biblia: observar, interpretar y aplicar, añadiendo el <b>contexto</b> (en español se enseña como <b>OICA</b>). La meta: entender qué quiso decir el autor en su tiempo y qué significa hoy.</p>" +
    porque +
    "<p><b>La pronunciación</b> (en <i>cursiva</i>) te dice cómo suena la palabra.</p>" +
    "<p><b>El código Strong</b> (como «" + (he ? "H1961" : "G26") + "») es un número que identifica cada palabra original; con él ves su significado y dónde más aparece, aunque no sepas " + (he ? "hebreo" : "griego") + ".</p>";
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
function legendCard(lang) {
  const pal = (lang === "gr") ? "palabra griega" : "palabra hebrea";
  return el("div", "legend",
    `En cada tarjeta: <b>${pal}</b> · <i>cómo suena</i> · <b>significado en español</b> · su <b>código</b>. Toca una tarjeta para ver todo.`);
}
function buildWordByWord(words, dict, esMap, lang) {
  const pfx = (lang === "gr") ? "G" : "H";
  const list = el("div", "sw-list");
  words.forEach((w) => {
    const wordText = w.h || w.g;
    if (!wordText) return;
    const code = w.s ? pfx + w.s : null;
    const codeA = w.sa ? pfx + w.sa : null;
    const entry = code ? dict[code] : null;
    let mean = (code && esMap[code]) || (codeA && esMap[codeA]) || "";
    let enOnly = false;
    if (!mean && entry) { mean = entry.def || entry.kjv || ""; enOnly = true; }
    // separar el significado principal (la palabra clave) del resto
    let primary = mean, rest = "";
    if (mean) {
      const cut = mean.search(/[;,]/);
      if (cut > 0) { primary = mean.slice(0, cut).trim(); rest = mean.slice(cut + 1).trim(); }
    }
    if (rest.length > 55) rest = rest.slice(0, 55) + "…";
    const translit = entry ? entry.xlit : "";
    const row = el("div", "sw-word");
    const wcls = (lang === "gr") ? "sw-word__grk" : "sw-word__heb";
    row.innerHTML =
      `<span class="${wcls}">${esc(wordText)}</span>` +
      `<span class="sw-word__mid">` +
        (translit ? `<span class="sw-word__translit">${esc(translit)}</span>` : "") +
        `<span class="sw-word__mean"><b>${esc(primary || "—")}</b>${enOnly ? ' <i class="en">(ingl.)</i>' : ""}` +
          (rest ? `<span class="sw-word__more">${esc(rest)}</span>` : "") +
        `</span>` +
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
      const hideName = (o.id === "he_wlc" || o.id === "gr_sblgnt");
      chip.innerHTML = `<span class="vchip__c">${on ? "✓" : "＋"}</span> ${esc(o.lang)}${hideName ? "" : ` <small>${esc(o.name)}</small>`}`;
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
    let txt = "—", rtl = false, grk = false;
    try {
      if (id === "he_wlc") {
        const heb = await Data.hebrew(b.id);
        const ws = (heb.chapters[c - 1] || [])[v - 1] || [];
        txt = ws.map((w) => w.h).join(" "); rtl = true;
      } else if (id === "gr_sblgnt") {
        const gk = await Data.greek(b.id);
        const ws = (gk.chapters[c - 1] || [])[v - 1] || [];
        txt = ws.map((w) => w.g).join(" "); grk = true;
      } else {
        const arr = await Data.versionFile(o.file || `json/${id}.json`);
        txt = (arr[b.n - 1] && arr[b.n - 1].chapters[c - 1] && arr[b.n - 1].chapters[c - 1][v - 1]) || "—";
      }
    } catch (e) { txt = "(no disponible)"; }
    row.appendChild(el("div", "cmp-row__t" + (rtl ? " rtl" : "") + (grk ? " grk" : ""), esc(txt)));
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
    const gr = code[0] === "G";
    const idiom = gr ? "griego" : "hebreo";
    const dict = await (gr ? Data.strongsGr() : Data.strongsHe());
    const entry = dict[code] || (augmented && dict[augmented]) || null;
    const esMap = await (gr ? Data.strongsGrEs() : Data.strongsHeEs()).catch(() => ({}));
    const defEs = esMap[code] || (augmented && esMap[augmented]) || null;
    const conc = await (gr ? Data.concordanceGr() : Data.concordanceHe());
    const occ = conc[code] || (augmented && conc[augmented]) || { n: 0, refs: [] };

    const frag = document.createDocumentFragment();
    // Cabecera: palabra original y pronunciación, cada una ETIQUETADA
    const head = el("div", "wh");
    const pron = entry ? (entry.xlit + (entry.pron ? ` · ${entry.pron}` : "")) : "";
    head.innerHTML =
      `<div class="wlab">Palabra en ${idiom}</div>` +
      `<div class="wh__h${gr ? " wh__h--grk" : ""}">${entry ? esc(entry.lemma) : "—"}</div>` +
      (pron ? `<div class="wlab">Cómo se pronuncia</div><div class="wh__x"><i>${esc(pron)}</i></div>` : "");
    frag.appendChild(head);

    // Significado en español (lo más importante)
    if (defEs) frag.appendChild(wsec("Qué significa (en español)", esc(defEs), "wsec--es"));
    else if (entry) frag.appendChild(wsec("Qué significa", esc(entry.def || entry.kjv || "—"), "wsec--es"));

    // Explicación del código Strong (para que no sea un misterio)
    const codeBox = el("div", "wcode");
    codeBox.innerHTML =
      `<div class="wcode__top"><span class="wcode__badge">${code}</span><span class="wcode__t">Código Strong</span></div>` +
      `<p class="muted">Es el número que identifica esta palabra ${idiom}. Con él puedes ver su significado exacto y todos los versículos donde aparece, aunque no sepas ${idiom}.</p>`;
    frag.appendChild(codeBox);

    // Detalle adicional en inglés (opcional)
    if (defEs && entry && (entry.def || entry.kjv))
      frag.appendChild(wsec("Más detalle (en inglés, opcional)", esc(entry.def || entry.kjv)));
    if (entry && entry.deriv) {
      frag.appendChild(wsec("De dónde viene la palabra", esc(entry.deriv)));
      frag.appendChild(el("p", "muted", "⚠️ El origen ayuda, pero el significado real lo decide el contexto donde se usa la palabra, no su raíz."));
    }

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

/* ------------------------------ Descubre ------------------------------ */
function nameOf(bid) { const b = BOOKS.find((x) => x.id === bid); return b ? b.name : bid; }
function formatDay(day) {
  const parts = []; let i = 0;
  while (i < day.length) {
    const [bid, c] = day[i].split(":"); let c1 = +c, c2 = +c, j = i + 1;
    while (j < day.length) { const [b2, cc] = day[j].split(":"); if (b2 === bid && +cc === c2 + 1) { c2 = +cc; j++; } else break; }
    parts.push(nameOf(bid) + " " + (c1 === c2 ? c1 : c1 + "–" + c2));
    i = j;
  }
  return parts.join(", ");
}
async function renderDiscover() {
  const view = $("#view-discover");
  view.replaceChildren(loadingEl());
  try {
    const [plans, temas] = await Promise.all([Data.plans(), Data.temas()]);
    const frag = document.createDocumentFragment();
    frag.appendChild(el("h2", "disc-h", "Descubre"));
    frag.appendChild(el("p", "disc-sub", "Un camino para cada día: memoriza, lee y descubre."));

    // Tarjeta de memorización (juego + racha)
    const due = Store.memDueCount(), total = Store.memCount(), streak = Store.streakGet();
    const memc = el("button", "mem-cta");
    memc.innerHTML =
      `<span class="mem-cta__i">🧠</span>` +
      `<span class="mem-cta__b"><span class="mem-cta__t">Memoriza versículos</span>` +
      `<span class="mem-cta__d">${total ? (due ? `${due} para repasar hoy` : "Al día ✓") + ` · ${total} en tu mazo` : "Un juego para grabar la Palabra"}</span></span>` +
      (streak ? `<span class="mem-cta__streak">🔥 ${streak}</span>` : `<span class="mem-cta__go">›</span>`);
    memc.onclick = () => openMemorize();
    frag.appendChild(memc);

    const namec = el("button", "disc-cta", "✡️ Tu nombre en hebreo · sus letras, su número y su significado →");
    namec.onclick = () => openNameHebrew();
    frag.appendChild(namec);

    frag.appendChild(el("div", "sec-h", "Planes de lectura"));
    plans.forEach((pl) => {
      const done = Store.planCount(pl.id), total = pl.dias.length, pct = Math.round((100 * done) / total);
      const card = el("button", "plan-card");
      card.innerHTML =
        `<span class="plan-card__i">${pl.icon || "📖"}</span>` +
        `<span class="plan-card__b"><span class="plan-card__t">${esc(pl.title)}</span>` +
        `<span class="plan-card__d">${esc(pl.desc)}</span>` +
        (done ? `<span class="plan-prog"><span class="plan-bar"><i style="width:${pct}%"></i></span><small>${done}/${total}</small></span>` : "") +
        `</span>`;
      card.onclick = () => openPlan(pl);
      frag.appendChild(card);
    });

    frag.appendChild(el("div", "sec-h", "Temas · qué dice la Biblia sobre…"));
    const tg = el("div", "tema-grid");
    temas.forEach((t) => {
      const c = el("button", "tema-card");
      c.innerHTML = `<span class="tema-card__i">${t.icon || "📖"}</span><span class="tema-card__t">${esc(t.title)}</span>`;
      c.onclick = () => openTema(t);
      tg.appendChild(c);
    });
    frag.appendChild(tg);
    view.replaceChildren(frag);
  } catch (e) { view.replaceChildren(errorEl(e)); }
}
function openPlan(pl) {
  $("#panelTitle").textContent = pl.title;
  const body = $("#panelBody");
  const frag = document.createDocumentFragment();
  frag.appendChild(el("p", "muted", esc(pl.desc)));
  const total = pl.dias.length;
  const header = el("div");
  const paintHeader = () => {
    const done = Store.planCount(pl.id);
    header.innerHTML = `<div class="plan-prog" style="margin:.6rem 0 1rem"><span class="plan-bar"><i style="width:${Math.round((100 * done) / total)}%"></i></span><small>${done}/${total} días</small></div>`;
  };
  paintHeader();
  frag.appendChild(header);
  pl.dias.forEach((day, i) => {
    const row = el("div", "day-row");
    const chk = el("button", "day-check" + (Store.isPlanDay(pl.id, i) ? " done" : ""), "✓");
    chk.onclick = (e) => { e.stopPropagation(); const now = Store.togglePlanDay(pl.id, i); chk.classList.toggle("done", now); paintHeader(); };
    const b = el("div", "day-row__b", `<div class="day-row__n">Día ${i + 1}</div><div class="day-row__r">${esc(formatDay(day))}</div>`);
    const go = el("span", "day-go", "›");
    row.append(chk, b, go);
    row.onclick = () => { const [bid, c] = day[0].split(":"); $$(".sheet").forEach((s) => (s.hidden = true)); goTo(bid, +c); };
    frag.appendChild(row);
  });
  body.replaceChildren(frag);
  $("#panel").hidden = false;
}
async function openTema(t) {
  $("#panelTitle").textContent = t.title;
  const body = $("#panelBody"); body.replaceChildren(loadingEl());
  $("#panel").hidden = false;
  try {
    const frag = document.createDocumentFragment();
    frag.appendChild(el("p", "muted", `Lo que dice la Biblia sobre ${t.title.toLowerCase()}. Toca un versículo para leerlo y estudiarlo.`));
    for (const r of t.verses) {
      const [bid, c, v] = r.split(":");
      let txt = "";
      try { const e = await Data.es(bid); txt = e.chapters[+c - 1][+v - 1] || ""; } catch (err) {}
      const item = el("div", "tema-v");
      item.innerHTML = `<div class="tema-v__r">${esc(nameOf(bid))} ${c}:${v}</div><div class="tema-v__t">${esc(txt)}</div>`;
      item.onclick = () => { $$(".sheet").forEach((s) => (s.hidden = true)); goTo(bid, +c, +v); };
      frag.appendChild(item);
    }
    body.replaceChildren(frag);
  } catch (e) { body.replaceChildren(errorEl(e)); }
}

/* --------------------- Memorizar (juego + racha) --------------------- */
const MEM_SUGGEST = ["juan:3:16", "salmos:23:1", "filipenses:4:13", "proverbios:3:5", "josue:1:9",
  "romanos:8:28", "salmos:119:105", "isaias:41:10", "mateo:6:33", "juan:14:6", "filipenses:4:6", "salmos:46:1"];
const MEM_LABEL = ["Nuevo", "Empezando", "Aprendiendo", "Avanzado", "Casi", "Dominado ✓"];
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function refName(ref) { const [bid, c, v] = ref.split(":"); return `${nameOf(bid)} ${c}:${v}`; }
async function verseText(ref) { const [bid, c, v] = ref.split(":"); const e = await Data.es(bid); return (e.chapters[+c - 1] || [])[+v - 1] || ""; }
const dayNum = () => Math.floor(Date.now() / 864e5);
// vibración sutil (solo móviles que la soporten): hace el juego más satisfactorio
const buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };

async function openMemorize() {
  $("#panelTitle").textContent = "Memorizar";
  const body = $("#panelBody"); body.replaceChildren(loadingEl());
  $("#panel").hidden = false;
  try {
    const deck = Store.memAll();
    const due = Store.memDueCount(), streak = Store.streakGet(), mastered = Store.memMastered();
    const frag = document.createDocumentFragment();
    const stats = el("div", "mem-stats");
    stats.innerHTML =
      `<div class="mem-stat"><b>🔥 ${streak}</b><span>racha (días)</span></div>` +
      `<div class="mem-stat"><b>${due}</b><span>para repasar</span></div>` +
      `<div class="mem-stat"><b>${mastered}/${deck.length}</b><span>dominados</span></div>`;
    frag.appendChild(stats);

    if (deck.length) {
      const q = deck.filter((d) => (d.due || 0) <= dayNum());
      const practiceRefs = () => (q.length ? q : deck).map((d) => d.ref);
      const go = el("button", "wc-go", due ? `Practicar (${due})` : "Repasar de nuevo");
      go.onclick = () => startPractice(practiceRefs());
      frag.appendChild(go);

      // Galería de juegos: deja ver y elegir cada modo (antes estaban escondidos).
      frag.appendChild(el("div", "sec-h", "O elige un juego"));
      const games = el("div", "mem-games");
      for (const [mode, icon, title, desc] of MEM_GALLERY) {
        const card = el("button", "mem-game",
          `<span class="mem-game__i">${icon}</span>` +
          `<span class="mem-game__t"><b>${esc(title)}</b><small>${esc(desc)}</small></span>`);
        card.onclick = () => startPractice(practiceRefs(), mode);
        games.appendChild(card);
      }
      frag.appendChild(games);

      frag.appendChild(el("div", "sec-h", "Tus versículos"));
      for (const d of deck) {
        let txt = ""; try { txt = await verseText(d.ref); } catch (e) {}
        const dots = [0, 1, 2, 3, 4].map((i) => `<span class="mem-dot${i < d.lvl ? " on" : ""}"></span>`).join("");
        const item = el("div", "mem-item");
        const bd = el("div", "mem-item__b");
        bd.innerHTML = `<div class="mem-item__r">${esc(refName(d.ref))} <small>· ${MEM_LABEL[d.lvl]}</small></div>` +
          `<div class="mem-item__t">${esc(txt)}</div><div class="mem-dots">${dots}</div>`;
        bd.onclick = () => startPractice([d.ref]);
        const x = el("button", "mark__x", "✕");
        x.onclick = (e) => { e.stopPropagation(); Store.memToggle(d.ref); openMemorize(); };
        item.append(bd, x);
        frag.appendChild(item);
      }
    }

    frag.appendChild(el("div", "sec-h", deck.length ? "Añade más" : "Empieza con estos"));
    frag.appendChild(el("p", "muted", "Toca para añadir a tu mazo. También puedes tocar «Memorizar» en cualquier versículo mientras lees."));
    const sg = el("div", "cmp-pick");
    for (const ref of MEM_SUGGEST) {
      if (Store.memHas(ref)) continue;
      const chip = el("button", "vchip", `＋ ${esc(refName(ref))}`);
      chip.onclick = () => { Store.memToggle(ref); openMemorize(); };
      sg.appendChild(chip);
    }
    frag.appendChild(sg);
    body.replaceChildren(frag);
  } catch (e) { body.replaceChildren(errorEl(e)); }
}

// Rondas cortas: practicamos pocos versículos por tanda para que no canse,
// y ofrecemos «seguir» con los que queden (el bucle adictivo del «una más»).
const SESSION_MAX = 5;
async function startPractice(refs, forceMode) {
  const all = [...refs];
  const queue = all.slice(0, SESSION_MAX);
  const rest = all.slice(SESSION_MAX);
  let i = 0;
  const step = async () => {
    if (i >= queue.length) return finishPractice(queue.length, rest, forceMode);
    const ref = queue[i];
    let text = ""; try { text = await verseText(ref); } catch (e) {}
    const m = Store.memAll().find((x) => x.ref === ref);
    gameCard(ref, text, m ? m.lvl : 0, i, queue.length, () => { Store.memBump(ref); i++; step(); }, forceMode);
  };
  step();
}
function finishPractice(n, rest = [], forceMode) {
  Store.streakMark();
  const body = $("#panelBody");
  const d = el("div", "mem-done",
    `<div class="mem-done__i">🎉</div><h3>¡Bien hecho!</h3>` +
    `<p class="muted">Practicaste ${n} versículo${n === 1 ? "" : "s"}. Racha: 🔥 ${Store.streakGet()} día${Store.streakGet() === 1 ? "" : "s"}.</p>`);
  buzz([0, 30, 40, 30, 40, 60]);
  const frag = document.createDocumentFragment();
  frag.appendChild(d);
  if (rest.length) {
    const more = el("button", "wc-go", `Seguir · ${rest.length} más`);
    more.onclick = () => startPractice(rest, forceMode);
    frag.appendChild(more);
  }
  const b = el("button", rest.length ? "mem-peekbtn" : "wc-go", "Volver");
  b.onclick = () => openMemorize();
  frag.appendChild(b);
  body.replaceChildren(frag);
}
/* --- Modos de juego: la app los rota según cuánto domines el versículo --- */
const MEM_MODES = {
  armaLearn: { name: "🧠 Aprende el versículo", hint: "Mira el texto y tócalo en orden para fijarlo:" },
  arma:      { name: "🧩 Arma el versículo", hint: "Toca las palabras en el orden correcto:" },
  trozos:    { name: "🧱 Ordena los trozos", hint: "Toca los trozos en orden hasta formar el versículo:" },
  hueco:     { name: "⬜ Rellena los huecos", hint: "Toca las palabras que faltan, en orden:" },
  letra:     { name: "🔤 Primera letra", hint: "Solo ves la primera letra. Toca las palabras en orden de memoria:" },
};
// Conjuntos de modos por nivel (0..5). Cada nivel ofrece varios juegos para
// que haya variedad DESDE EL PRIMER versículo; al subir de nivel entran los
// modos más difíciles (y desaparece la ayuda del texto a la vista).
const MEM_LEVEL_MODES = [
  ["armaLearn", "arma", "trozos"],   // 0 · nuevo
  ["arma", "trozos", "hueco"],       // 1
  ["trozos", "hueco", "arma"],       // 2
  ["hueco", "arma", "letra"],        // 3
  ["hueco", "letra", "trozos"],      // 4
  ["letra", "hueco"],                // 5 · dominado
];
// Juegos que el usuario puede elegir a mano desde la galería.
const MEM_GALLERY = [
  ["arma", "🧩", "Arma el versículo", "Ordena las palabras"],
  ["trozos", "🧱", "Ordena los trozos", "Reordena las frases"],
  ["hueco", "⬜", "Rellena los huecos", "Completa lo que falta"],
  ["letra", "🔤", "Primera letra", "Solo la inicial, de memoria"],
];
let lastMode = null;
function modeForLevel(lvl) {
  const set = MEM_LEVEL_MODES[Math.max(0, Math.min(lvl | 0, 5))];
  let m = set[Math.floor(Math.random() * set.length)];
  if (m === lastMode && set.length > 1) {        // no repetir el mismo juego dos veces seguidas
    m = set[(set.indexOf(m) + 1) % set.length];
  }
  lastMode = m;
  return m;
}
function firstLetterMask(w) {
  const n = w.length;
  if (n <= 1) return w;
  return w[0] + "·".repeat(Math.min(n - 1, 6));
}

function gameCard(ref, text, lvl, idx, total, onDone, forceMode) {
  const body = $("#panelBody");
  const mode = forceMode || modeForLevel(lvl);
  const words = text.split(/\s+/).filter(Boolean);
  const frag = document.createDocumentFragment();
  frag.appendChild(el("div", "mem-progress", `Versículo ${idx + 1} de ${total}`));
  frag.appendChild(el("div", "mem-mode", esc(MEM_MODES[mode].name)));
  frag.appendChild(el("div", "mem-ref", refName(ref)));

  // El texto se ve solo en modo aprendizaje; en el resto, un vistazo rápido.
  const peek = el("div", "mem-peek" + (mode === "armaLearn" ? " show" : ""), esc(text));
  frag.appendChild(peek);
  if (mode !== "armaLearn") {
    const pb = el("button", "mem-peekbtn", "👁 Ver un momento");
    pb.onclick = () => { peek.classList.add("show"); setTimeout(() => peek.classList.remove("show"), 1800); };
    frag.appendChild(pb);
  }
  frag.appendChild(el("p", "mem-hint", MEM_MODES[mode].hint));

  const status = el("div", "mem-status");
  let errors = 0;
  const win = () => {
    status.className = "mem-status win";
    status.textContent = errors === 0 ? "✓ ¡Perfecto!" : "✓ ¡Lo lograste!";
    buzz([0, 22, 32, 45]);
    setTimeout(onDone, 1100);
  };
  const onErr = () => { errors++; };

  if (mode === "trozos") {
    let parts = text.split(/(?<=[,;:.—])\s+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 3) {
      parts = [];
      for (let i = 0; i < words.length; i += 3) parts.push(words.slice(i, i + 3).join(" "));
    }
    buildSequence(frag, status, parts, win, onErr, "mem-pool--chunks");
  } else if (mode === "hueco") {
    buildFill(frag, status, words, huecoSlots(words), win, onErr);
  } else if (mode === "letra") {
    buildFill(frag, status, words, new Set(words.map((_, i) => i)), win, onErr, true);
  } else {
    buildSequence(frag, status, words, win, onErr);
  }

  body.replaceChildren(frag);
  body.scrollTop = 0;
}

// Tocar fichas sueltas para reconstruir una secuencia (arma / trozos).
function buildSequence(frag, status, tokens, win, onErr, poolCls) {
  const target = el("div", "mem-target");
  frag.appendChild(target);
  frag.appendChild(status);
  const pool = el("div", "mem-pool" + (poolCls ? " " + poolCls : ""));
  let next = 0;
  shuffle(tokens.map((_, i) => i)).forEach((ti) => {
    const chip = el("button", "mem-chip", esc(tokens[ti]));
    chip._t = tokens[ti];
    chip.onclick = () => {
      if (chip.disabled) return;
      if (chip._t === tokens[next]) {               // comparación por texto: tolera palabras repetidas
        chip.classList.add("used"); chip.disabled = true; buzz(8);
        target.appendChild(el("span", "mem-w", esc(tokens[next]) + " "));
        next++;
        if (next === tokens.length) {
          target.classList.add("ok");
          pool.querySelectorAll("button").forEach((b) => (b.disabled = true));
          win();
        }
      } else {
        chip.classList.add("shake"); onErr();
        setTimeout(() => chip.classList.remove("shake"), 420);
      }
    };
    pool.appendChild(chip);
  });
  frag.appendChild(pool);
}

// Elige ~40% de las palabras (preferiblemente largas) para dejar en blanco.
function huecoSlots(words) {
  const cand = words.map((_, i) => i).filter((i) => words[i].replace(/[^\p{L}]/gu, "").length >= 4);
  const pool = cand.length >= 2 ? cand : words.map((_, i) => i);
  const k = Math.max(1, Math.round(pool.length * 0.4));
  return new Set(shuffle(pool).slice(0, k));
}

// Rellenar huecos dentro de la frase (hueco / primera letra).
function buildFill(frag, status, words, slotSet, win, onErr, maskAll) {
  const sentence = el("div", "mem-sentence");
  const slots = [];
  words.forEach((w, i) => {
    if (slotSet.has(i)) {
      const sp = el("span", "mem-slot", esc(maskAll ? firstLetterMask(w) : "___"));
      sentence.appendChild(sp);
      slots.push({ w, span: sp });
    } else {
      sentence.appendChild(el("span", "mem-word", esc(w)));
    }
    sentence.appendChild(document.createTextNode(" "));
  });
  frag.appendChild(sentence);
  frag.appendChild(status);

  let next = 0;
  const pool = el("div", "mem-pool");
  shuffle(slots.map((_, k) => k)).forEach((sk) => {
    const chip = el("button", "mem-chip", esc(slots[sk].w));
    chip._t = slots[sk].w;
    chip.onclick = () => {
      if (chip.disabled) return;
      if (chip._t === slots[next].w) {              // por texto: cualquier ficha con la palabra correcta vale
        chip.classList.add("used"); chip.disabled = true; buzz(8);
        const sp = slots[next].span;
        sp.textContent = slots[next].w;
        sp.classList.add("filled");
        next++;
        if (next === slots.length) {
          pool.querySelectorAll("button").forEach((b) => (b.disabled = true));
          win();
        }
      } else {
        chip.classList.add("shake"); onErr();
        setTimeout(() => chip.classList.remove("shake"), 420);
      }
    };
    pool.appendChild(chip);
  });
  frag.appendChild(pool);
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

/* -------------------- Tu nombre en hebreo (curiosidad) -------------------- */
// char hebreo -> [nombre, valor (gematría), imagen/significado de la letra]
const HEB = {
  "א": ["Álef", 1, "buey · fuerza, principio"], "ב": ["Bet", 2, "casa · hogar"],
  "ג": ["Guímel", 3, "camello · dar, avanzar"], "ד": ["Dálet", 4, "puerta · camino"],
  "ה": ["He", 5, "ventana · aliento, revelación"], "ו": ["Vav", 6, "gancho · unión"],
  "ז": ["Zayin", 7, "espada · sustento"], "ח": ["Jet", 8, "muro · vida, protección"],
  "ט": ["Tet", 9, "serpiente · bien escondido"], "י": ["Yod", 10, "mano · obra, lo pequeño"],
  "כ": ["Caf", 20, "palma · cubrir"], "ל": ["Lámed", 30, "aguijón · aprender, enseñar"],
  "מ": ["Mem", 40, "agua · fuente"], "נ": ["Nun", 50, "pez · vida, continuidad"],
  "ס": ["Sámej", 60, "apoyo · sostén"], "ע": ["Ayin", 70, "ojo · ver, fuente"],
  "פ": ["Pe", 80, "boca · palabra"], "צ": ["Tsadi", 90, "anzuelo · justicia"],
  "ק": ["Cof", 100, "nuca · santidad"], "ר": ["Resh", 200, "cabeza · principio"],
  "ש": ["Shin", 300, "diente · fuego"], "ת": ["Tav", 400, "señal · pacto, verdad"],
};
const NAME_MAP = { a: "א", b: "ב", c: "כ", d: "ד", e: null, f: "פ", g: "ג", h: null, i: "י", j: "ח", k: "כ", l: "ל", m: "מ", n: "נ", o: "ו", p: "פ", q: "ק", r: "ר", s: "ס", t: "ת", u: "ו", v: "ו", w: "ו", x: "ס", y: "י", z: "ז" };
const NAME_DIG = { ch: "ח", ll: "י", rr: "ר", qu: "ק", gu: "ג" };
const NUM_NOTE = {
  7: "plenitud y descanso (los 7 días de la creación).",
  10: "plenitud (los Diez Mandamientos).",
  12: "el pueblo de Dios (12 tribus, 12 apóstoles).",
  14: "el número de David (Mateo ordena su genealogía en tres grupos de 14).",
  18: "en hebreo חי (jai) significa «vida».",
  26: "el número del Nombre de Dios, YHWH (יהוה).",
  30: "la edad de comenzar el llamado: David reinó, los levitas servían y Jesús empezó su ministerio a los 30.",
  40: "tiempo de prueba y preparación (el diluvio, el desierto, el ayuno de 40 días).",
  70: "las naciones del mundo; los 70 ancianos de Israel.",
};
function nameToHebrew(name) {
  const s = (name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const out = []; let i = 0;
  while (i < s.length) {
    const two = s.slice(i, i + 2), one = s[i];
    if (NAME_DIG[two]) { out.push(NAME_DIG[two]); i += 2; continue; }
    if (one === "c" && /[ei]/.test(s[i + 1] || "")) { out.push("ס"); i += 1; continue; } // c suave = s
    const h = NAME_MAP[one];
    if (h) out.push(h);
    i += 1;
  }
  return out;
}
const digitRoot = (n) => { while (n > 9) n = ("" + n).split("").reduce((a, b) => a + +b, 0); return n; };

function openNameHebrew() {
  $("#panelTitle").textContent = "Tu nombre en hebreo";
  const body = $("#panelBody");
  const box = el("div", "nh-box");
  const inp = el("input"); inp.type = "text"; inp.id = "nhInput"; inp.placeholder = "Escribe un nombre (ej. Deivy)"; inp.autocomplete = "off"; inp.autocapitalize = "off";
  box.appendChild(inp);
  const res = el("div", "nh-res"); res.id = "nhRes";
  body.replaceChildren(box, res);
  $("#panel").hidden = false;
  inp.addEventListener("input", () => renderName(inp.value));
  renderName("");
  setTimeout(() => inp.focus(), 60);
}
function renderName(name) {
  const res = $("#nhRes"); if (!res) return;
  const clean = (name || "").trim();
  if (!clean) { res.replaceChildren(el("p", "muted", "Escribe un nombre y verás sus letras hebreas, el valor de cada una y el total. Es una curiosidad (gematría), para reflexionar.")); return; }
  const chars = nameToHebrew(clean);
  if (!chars.length) { res.replaceChildren(el("p", "muted", "Prueba con letras (sin números ni símbolos).")); return; }
  const total = chars.reduce((s, c) => s + HEB[c][1], 0);
  const frag = document.createDocumentFragment();
  frag.appendChild(el("div", "nh-word", esc(chars.join(""))));
  frag.appendChild(el("div", "nh-translit", esc(clean) + " · se lee de derecha a izquierda"));
  const tbl = el("div", "nh-letters");
  chars.forEach((c) => {
    const [nm, v, mn] = HEB[c];
    tbl.appendChild(el("div", "nh-let",
      `<span class="nh-let__c">${c}</span><span class="nh-let__b"><b>${esc(nm)} · ${v}</b><small>${esc(mn)}</small></span>`));
  });
  frag.appendChild(tbl);
  const dr = digitRoot(total);
  frag.appendChild(el("div", "nh-total", `Valor total: <b>${total}</b>` + (total !== dr ? ` · raíz ${dr}` : "")));
  const notes = [];
  if (NUM_NOTE[total]) notes.push(`El <b>${total}</b> es ${NUM_NOTE[total]}`);
  else { const match = Object.values(HEB).find((d) => d[1] === total); if (match) notes.push(`Coincide con la letra <b>${match[0]}</b> (${match[2]}).`); }
  if (NUM_NOTE[dr] && dr !== total) notes.push(`Su raíz <b>${dr}</b>: ${NUM_NOTE[dr]}`);
  if (notes.length) { const n = el("div", "nh-note"); n.innerHTML = notes.join("<br>"); frag.appendChild(n); }
  frag.appendChild(el("p", "nh-disc", "Es una transcripción aproximada por sonido, y la gematría es una tradición interpretativa judía: algo para reflexionar y disfrutar, no una definición oficial ni adivinación."));
  res.replaceChildren(frag);
}

/* ------------------ Buscador rápido (lupa de la barra) ------------------ */
let findT;
function openFind() {
  $("#find").hidden = false;
  $("#findResults").replaceChildren(el("p", "short-sr__hint", "Escribe un versículo (Josué 1:9) o una palabra. Los resultados salen solos."));
  const fi = $("#findInput"); fi.value = "";
  setTimeout(() => fi.focus(), 50);
}
function closeFind() { $("#find").hidden = true; }
async function liveFind(q) {
  const box = $("#findResults"); if (!box) return;
  if (!q) { box.replaceChildren(el("p", "short-sr__hint", "Escribe un versículo o una palabra.")); return; }
  const frag = document.createDocumentFragment();
  const ref = parseReference(q);
  if (ref) {
    const bk = BOOKS[ref.bi]; const c = Math.min(Math.max(1, ref.c), bk.chapters);
    const go = el("button", "short-go",
      `<span class="short-go__i">📖</span><span class="short-go__t"><b>Ir a ${esc(bk.name)} ${c}:${ref.v}</b><small>Abrir y leer este versículo</small></span><span class="short-go__a">›</span>`);
    go.onclick = () => { goTo(bk.id, c, ref.v); closeFind(); };
    frag.appendChild(go);
  }
  box.replaceChildren(frag);
  const letters = q.replace(/[^\p{L}]/gu, "");
  if (letters.length < 3) { if (!ref) box.appendChild(el("p", "short-sr__hint", "Escribe al menos 3 letras para buscar una palabra.")); return; }
  const tok = ++liveFind._t;
  try {
    const arr = await Data.versionFile("json/es_rvr.json");
    if (tok !== liveFind._t) return;
    const nq = norm(q); const out = [];
    for (let bi = 0; bi < arr.length && out.length < 60; bi++) {
      const chapters = arr[bi].chapters;
      for (let ci = 0; ci < chapters.length && out.length < 60; ci++) {
        const vs = chapters[ci];
        for (let vi = 0; vi < vs.length; vi++) {
          if (norm(vs[vi]).includes(nq)) { out.push({ bi, c: ci + 1, v: vi + 1, t: vs[vi] }); if (out.length >= 60) break; }
        }
      }
    }
    if (tok !== liveFind._t) return;
    if (out.length) box.appendChild(el("p", "short-sr__hint", `${out.length}${out.length >= 60 ? "+" : ""} coincidencia(s) · toca para ir`));
    else if (!ref) box.appendChild(el("p", "short-sr__hint", "Sin coincidencias. Prueba «Juan 3:16» o una palabra."));
    out.forEach((r) => {
      const d = el("div", "short-sr");
      d.innerHTML = `<div class="short-sr__r">${esc(BOOKS[r.bi].name)} ${r.c}:${r.v}</div><div class="short-sr__t">${esc(r.t)}</div>`;
      d.onclick = () => { goTo(BOOKS[r.bi].id, r.c, r.v); closeFind(); };
      box.appendChild(d);
    });
  } catch (e) {}
}
liveFind._t = 0;

/* ------------------------------- Buscar ------------------------------- */
let searchReady = false;
let searchT;
function renderSearch() {
  const view = $("#view-search");
  if (searchReady) return;
  const box = el("div", "search-box");
  const input = el("input"); input.type = "search"; input.placeholder = "Versículo (Josué 1:9) o una palabra…"; input.id = "searchInput";
  const btn = el("button", "iconbtn", "Buscar"); btn.style.minWidth = "auto"; btn.style.padding = ".6rem 1rem";
  box.append(input, btn);
  const results = el("div"); results.id = "searchResults";
  results.appendChild(el("p", "muted", "Escribe un versículo (ej. «Josué 1:9» o «Juan 3 16») o una palabra. Los resultados salen solos."));
  view.replaceChildren(box, results);
  const run = () => doSearch(input.value.trim());
  btn.onclick = run;
  input.addEventListener("input", () => { clearTimeout(searchT); searchT = setTimeout(run, 180); });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const r = parseReference(input.value.trim());
    if (r) goTo(BOOKS[r.bi].id, Math.min(Math.max(1, r.c), BOOKS[r.bi].chapters), r.v);
    else run();
  });
  searchReady = true;
}
async function doSearch(q) {
  const results = $("#searchResults");
  if (!results) return;
  if (!q) { results.replaceChildren(el("p", "muted", "Escribe un versículo o una palabra.")); return; }
  const frag = document.createDocumentFragment();
  // 1) ¿es una referencia? (Josué 1:9, Juan 3 16, echos 3:19…)
  const ref = parseReference(q);
  if (ref) {
    const bk = BOOKS[ref.bi]; const c = Math.min(Math.max(1, ref.c), bk.chapters);
    const go = el("button", "short-go",
      `<span class="short-go__i">📖</span><span class="short-go__t"><b>Ir a ${esc(bk.name)} ${c}:${ref.v}</b><small>Abrir y leer este versículo</small></span><span class="short-go__a">›</span>`);
    go.onclick = () => goTo(bk.id, c, ref.v);
    frag.appendChild(go);
  }
  results.replaceChildren(frag);
  // 2) búsqueda por palabra (3+ letras)
  const letters = q.replace(/[^\p{L}]/gu, "");
  if (letters.length < 3) { if (!ref) results.appendChild(el("p", "muted", "Escribe al menos 3 letras para buscar una palabra.")); return; }
  const tok = ++doSearch._t;
  const loading = loadingEl(); results.appendChild(loading);
  try {
    const arr = await Data.versionFile("json/es_rvr.json");
    if (tok !== doSearch._t) return;
    const nq = norm(q); const out = [];
    for (let bi = 0; bi < arr.length && out.length < 300; bi++) {
      const bk = BOOKS[bi]; const chapters = arr[bi].chapters;
      for (let ci = 0; ci < chapters.length && out.length < 300; ci++) {
        const vs = chapters[ci];
        for (let vi = 0; vi < vs.length; vi++) {
          if (norm(vs[vi]).includes(nq)) { out.push({ bk, c: ci + 1, v: vi + 1, t: vs[vi] }); if (out.length >= 300) break; }
        }
      }
    }
    if (tok !== doSearch._t) return;
    loading.remove();
    if (out.length) results.appendChild(el("p", "muted", `${out.length}${out.length >= 300 ? "+" : ""} resultado(s)`));
    else if (!ref) results.appendChild(el("p", "muted", "Sin resultados."));
    const re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
    out.forEach((r) => {
      const d = el("div", "result");
      d.innerHTML = `<div class="result__ref">${esc(r.bk.name)} ${r.c}:${r.v}</div><div class="result__t">${esc(r.t).replace(re, "<mark>$1</mark>")}</div>`;
      d.onclick = () => goTo(r.bk.id, r.c, r.v);
      results.appendChild(d);
    });
  } catch (e) { try { loading.remove(); } catch (_) {} results.appendChild(errorEl(e)); }
}
doSearch._t = 0;

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
    "<b>Texto:</b> Santa Biblia Reina-Valera Gómez (RVG), © Dr. Humberto Gómez Caballero. " +
    "Se usa con permiso para distribución gratuita, sin fines de lucro y sin cambiar las palabras. Fuente: eBible.org.<br>" +
    "La RV1960 no se incluye porque tiene derechos de autor que no permiten su copia gratuita.<br>" +
    "<b>Hebreo:</b> Códice de Leningrado / OpenScriptures (CC BY 4.0).<br>" +
    "<b>Significados:</b> ~1000 términos hebreos traducidos al español + Concordancia Strong.<br><br>" +
    "Hecho para aprender la Palabra de forma profunda y sencilla.<br>" +
    "<span style='opacity:.7'>Versión 2.0 · Reina-Valera Gómez</span>"));
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

/* ======================================================================
   Biblia en Short — feed vertical con audio (memorizar deslizando)
   Un versículo por pantalla; deslizas hacia arriba y aparece el
   siguiente, leyéndose en voz alta (voz del navegador, gratis).
   ====================================================================== */
const SH = {
  bi: 0, c: 1, v: 1,          // posición actual (índice de libro, cap, versículo)
  audioOn: true,              // audio habilitado (si no, es lectura silenciosa)
  playing: false,             // está leyendo y auto-avanzando
  reps: 2,                    // veces que se lee cada versículo antes de avanzar (1,2,3,∞)
  playCount: 0,               // lecturas ya hechas del versículo actual
  rate: 1,                    // velocidad de lectura
  speakOffset: 0,             // caracteres de la referencia leída antes del versículo
  animating: false,
};
let shortBuilt = false;
let _voices = [];
const RATES = [["0.75", 0.75, "Lento"], ["1", 1, "Normal"], ["1.25", 1.25, "Rápido"]];
const REPS = [1, 2, 3, Infinity];
// Iconos SVG monocromos (se ven iguales en todos los dispositivos, sin emojis descoloridos)
const ICO = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  spk: '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 4V6L7 10z"/><path d="M15 8.5a4 4 0 010 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 4V6L7 10z"/><path d="M15 9.5l5 5M20 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  loop: '<svg viewBox="0 0 24 24"><path d="M7 7h8v2.2L18.5 6 15 2.8V5H5v6h2V7zm10 10H9v-2.2L5.5 18 9 21.2V19h10v-6h-2v4z"/></svg>',
  speed: '<svg viewBox="0 0 24 24"><path d="M12 5a9 9 0 00-7.8 13.6h15.6A9 9 0 0012 5zm1 7.7V9h-2v3.7a2 2 0 102 0z"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><path d="M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3z"/><path d="M6 11a6 6 0 0012 0h-2a4 4 0 01-8 0zm5 7h2v3h-2z"/></svg>',
};

function hasTTS() { return typeof window !== "undefined" && "speechSynthesis" in window; }
function primeVoices() {
  if (!hasTTS()) return;
  try {
    _voices = speechSynthesis.getVoices();
    if (!_voices.length) speechSynthesis.onvoiceschanged = () => { _voices = speechSynthesis.getVoices(); };
  } catch (e) {}
}
function spanishVoices() {
  if (!_voices.length && hasTTS()) { try { _voices = speechSynthesis.getVoices(); } catch (e) {} }
  return _voices.filter((v) => /(^|[-_])es/i.test(v.lang));
}
// Puntúa una voz para elegir la más natural que tenga el dispositivo.
function voiceScore(v) {
  let s = 0; const n = (v.name || "").toLowerCase();
  if (v.localService === false) s += 3;   // voces de red (p. ej. Google en Android) suelen ser mejores
  if (/google|natural|neural|premium|enhanced|mejorad|siri|mónica|monica|paulina|jorge|helena|lucia|lucía/.test(n)) s += 2;
  if (/^es[-_](us|mx|es)/i.test(v.lang)) s += 1;
  return s;
}
function bestVoice() {
  const list = spanishVoices(); if (!list.length) return null;
  return [...list].sort((a, b) => voiceScore(b) - voiceScore(a))[0];
}
function spanishVoice() {
  const list = spanishVoices(); if (!list.length) return null;
  const saved = (Store.get("short") || {}).voiceName;
  return list.find((v) => v.name === saved) || bestVoice();
}
function cycleVoice() {
  const list = spanishVoices();
  if (!list.length) { toast("Este dispositivo no tiene voces en español instaladas."); return; }
  const cur = spanishVoice();
  let i = list.findIndex((v) => cur && v.name === cur.name);
  i = (i + 1) % list.length;
  const v = list[i];
  const prev = Store.get("short") || {};
  Store.set("short", { ...prev, voiceName: v.name });
  toast("Voz: " + (v.name || v.lang));
  renderShortControls();
  if (SH.playing) speakCurrent();
}

function loadShortPrefs() {
  const s = Store.get("short") || {};
  SH.audioOn = s.audio !== false;
  SH.reps = s.reps === null || s.reps === undefined ? 2 : (s.reps === "inf" ? Infinity : s.reps);
  SH.rate = s.rate || 1;
}
function saveShortPrefs() {
  const prev = Store.get("short") || {};
  const book = BOOKS[SH.bi] ? BOOKS[SH.bi].id : "juan";
  Store.set("short", { ...prev, book, chapter: SH.c, verse: SH.v, audio: SH.audioOn, reps: SH.reps === Infinity ? "inf" : SH.reps, rate: SH.rate });
}

// Avanza/retrocede un versículo cruzando capítulos y libros. Devuelve {bi,c,v} o null en los extremos.
async function moveRef(bi, c, v, dir) {
  const es = await Data.es(BOOKS[bi].id);
  const chap = es.chapters;
  if (dir > 0) {
    if (v < (chap[c - 1] || []).length) return { bi, c, v: v + 1 };
    if (c < chap.length) return { bi, c: c + 1, v: 1 };
    if (bi < BOOKS.length - 1) return { bi: bi + 1, c: 1, v: 1 };
    return null;
  } else {
    if (v > 1) return { bi, c, v: v - 1 };
    if (c > 1) return { bi, c: c - 1, v: (chap[c - 2] || []).length };
    if (bi > 0) {
      const pb = await Data.es(BOOKS[bi - 1].id);
      const lc = pb.chapters.length;
      return { bi: bi - 1, c: lc, v: pb.chapters[lc - 1].length };
    }
    return null;
  }
}

async function cardData(bi, c, v) {
  const book = BOOKS[bi];
  const es = await Data.es(book.id);
  const text = (es.chapters[c - 1] || [])[v - 1] || "";
  return { ref: `${book.name} ${c}:${v}`, text, book };
}

function renderShort() {
  const view = $("#view-short");
  if (!shortBuilt) { buildShortUI(view); shortBuilt = true; loadShortPrefs(); }
  primeVoices();
  setShortStart().then(() => { renderShortControls(); showCard(0); });
}

async function setShortStart() {
  const s = Store.get("short") || { book: "juan", chapter: 3, verse: 16 };
  let bi = BOOKS.findIndex((b) => b.id === s.book); if (bi < 0) bi = 0;
  // valida contra los datos reales
  const es = await Data.es(BOOKS[bi].id);
  let c = Math.min(Math.max(1, s.chapter || 1), es.chapters.length);
  let v = Math.min(Math.max(1, s.verse || 1), es.chapters[c - 1].length);
  SH.bi = bi; SH.c = c; SH.v = v; SH.playCount = 0;
}

function buildShortUI(view) {
  view.innerHTML =
    `<div class="short-top">` +
      `<button class="short-ic" id="shortExit" aria-label="Salir">✕</button>` +
      `<div class="short-top__ref" id="shortTopRef"></div>` +
      `<button class="short-ic" id="shortSave" aria-label="Guardar en mi mazo" title="Guardar para memorizar">🧠</button>` +
      `<button class="short-ic" id="shortSearchBtn" aria-label="Buscar">🔍</button>` +
    `</div>` +
    `<div class="short-stage" id="shortStage"></div>` +
    `<div class="short-sidenav">` +
      `<button class="short-arrow" id="shortUp" aria-label="Anterior">▲</button>` +
      `<button class="short-arrow" id="shortDown" aria-label="Siguiente">▼</button>` +
    `</div>` +
    `<div class="short-hint" id="shortHint">Desliza ↑ para el siguiente versículo</div>` +
    `<div class="short-ctl" id="shortCtl"></div>` +
    `<div class="short-search" id="shortSearch" hidden>` +
      `<div class="short-search__bar">` +
        `<input id="shortSearchInput" type="search" placeholder="Ej: Juan 3:16, Salmos 23, o una palabra…" />` +
        `<button class="short-ic" id="shortSearchClose" aria-label="Cerrar">✕</button>` +
      `</div>` +
      `<div class="short-search__results" id="shortSearchResults"></div>` +
    `</div>`;

  $("#shortExit").onclick = () => showView("read");
  $("#shortUp").onclick = () => userNav(-1);
  $("#shortDown").onclick = () => userNav(1);
  $("#shortSave").onclick = toggleShortSave;
  $("#shortSearchBtn").onclick = openShortSearch;
  $("#shortSearchClose").onclick = closeShortSearch;
  const si = $("#shortSearchInput");
  si.addEventListener("input", () => onShortSearchInput(si.value));
  si.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const ref = parseReference(si.value.trim());
    if (ref) { shortJump(ref.bi, ref.c, ref.v); closeShortSearch(); }
  });

  const searchOpen = () => !$("#shortSearch").hidden;
  // Gestos de deslizar (táctil)
  let ty = null, tx = null;
  view.addEventListener("touchstart", (e) => { if (searchOpen()) return; ty = e.touches[0].clientY; tx = e.touches[0].clientX; }, { passive: true });
  view.addEventListener("touchend", (e) => {
    if (ty == null) return;
    const dy = e.changedTouches[0].clientY - ty, dx = e.changedTouches[0].clientX - tx;
    ty = null;
    if (Math.abs(dy) < 45 || Math.abs(dx) > Math.abs(dy)) return;  // ignora toques y gestos horizontales
    userNav(dy < 0 ? 1 : -1);
  }, { passive: true });

  // Rueda del ratón (escritorio)
  let wheelLock = false;
  view.addEventListener("wheel", (e) => {
    if (searchOpen() || Math.abs(e.deltaY) < 12 || wheelLock) return;
    wheelLock = true; setTimeout(() => (wheelLock = false), 420);
    userNav(e.deltaY > 0 ? 1 : -1);
  }, { passive: true });

  // Teclado (solo cuando el Short está activo)
  document.addEventListener("keydown", (e) => {
    if (!document.documentElement.classList.contains("short-mode")) return;
    if (!$("#shortSearch").hidden) return;  // no robar teclas al buscador
    if (e.key === "ArrowDown" || e.key === " ") { e.preventDefault(); userNav(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); userNav(-1); }
    else if (e.key === "Escape") showView("read");
  });
}

function renderShortControls() {
  const ctl = $("#shortCtl");
  if (!ctl) return;
  const dock = el("div", "short-dock");

  const aud = el("button", "short-cbtn short-icbtn" + (SH.audioOn ? "" : " off"), SH.audioOn ? ICO.spk : ICO.mute);
  aud.title = SH.audioOn ? "Apagar audio" : "Encender audio"; aud.onclick = toggleAudio;
  dock.appendChild(aud);

  if (SH.audioOn) {
    const repLbl = SH.reps === Infinity ? "∞" : SH.reps + "×";
    const rep = el("button", "short-cbtn short-cbtn--num", ICO.loop + `<span class="lbl">${repLbl}</span>`);
    rep.title = "Veces que se lee cada versículo antes de pasar al siguiente"; rep.onclick = cycleReps;
    dock.appendChild(rep);

    const pp = el("button", "short-cbtn short-cbtn--play short-btn--play", SH.playing ? ICO.pause : ICO.play);
    pp.title = SH.playing ? "Pausa" : "Reproducir"; pp.onclick = playPause;
    dock.appendChild(pp);

    const rate = RATES.find((r) => r[1] === SH.rate) || RATES[1];
    const rt = el("button", "short-cbtn short-cbtn--num", ICO.speed + `<span class="lbl">${rate[0]}×</span>`);
    rt.title = "Velocidad: " + rate[2]; rt.onclick = cycleRate;
    dock.appendChild(rt);

    if (spanishVoices().length > 1) {
      const vc = el("button", "short-cbtn short-icbtn", ICO.mic);
      vc.title = "Cambiar de voz"; vc.onclick = cycleVoice;
      dock.appendChild(vc);
    }
  } else {
    dock.appendChild(el("span", "short-dock__hint", "Lectura silenciosa"));
  }
  ctl.replaceChildren(dock);
}

async function showCard(dir) {
  const stage = $("#shortStage");
  if (!stage) return;
  let data;
  try { data = await cardData(SH.bi, SH.c, SH.v); } catch (e) { stage.replaceChildren(errorEl(e)); return; }
  const card = el("div", "short-card");
  card.innerHTML = `<div class="short-card__in"><div class="short-ref">${esc(data.ref)}</div>` +
    `<div class="short-text"></div>` +
    `<div class="short-tap" aria-hidden="true">toca para ${SH.audioOn ? "escuchar" : "leer de nuevo"}</div></div>`;
  // Texto en palabras (para el resaltado "karaoke" que sigue a la voz)
  const built = buildVerseSpans(data.text);
  card.querySelector(".short-text").appendChild(built.node);
  SH.curSpans = built.spans; SH.curText = data.text;
  const inner = card.querySelector(".short-card__in");
  inner.onclick = () => { if (SH.audioOn) { if (!SH.playing) playPause(); else speakCurrent(); } };

  const old = stage.firstElementChild;
  if (!old || dir === 0) {
    stage.replaceChildren(card);
  } else {
    SH.animating = true;
    card.classList.add(dir > 0 ? "from-bottom" : "from-top");
    stage.appendChild(card);
    requestAnimationFrame(() => {
      card.classList.remove("from-bottom", "from-top");
      old.classList.add(dir > 0 ? "to-top" : "to-bottom");
    });
    setTimeout(() => { try { old.remove(); } catch (e) {} SH.animating = false; }, 520);
  }
  const ref = data.ref;
  const tr = $("#shortTopRef"); if (tr) tr.textContent = ref;
  updateShortSave();
  const hint = $("#shortHint"); if (hint && (SH.c !== 1 || SH.v !== 1 || SH.bi !== 0)) hint.classList.add("gone");
}

// Divide el texto en palabras envueltas en <span> con su rango de caracteres,
// para iluminar la palabra que la voz está leyendo (evento onboundary).
function buildVerseSpans(text) {
  const frag = document.createDocumentFragment();
  const spans = []; let idx = 0;
  for (const part of text.split(/(\s+)/)) {
    if (part === "") continue;
    if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); idx += part.length; }
    else {
      const s = el("span", "sw", esc(part));
      frag.appendChild(s); spans.push({ el: s, start: idx, end: idx + part.length }); idx += part.length;
    }
  }
  return { node: frag, spans };
}
function litWord(charIndex) {
  const spans = SH.curSpans; if (!spans) return;
  const ci = charIndex - (SH.speakOffset || 0);   // descuenta la referencia leída al inicio
  if (ci < 0) { clearLit(); return; }              // aún está diciendo la referencia
  const sp = spans.find((s) => ci >= s.start && ci < s.end);
  if (sp) for (const s of spans) s.el.classList.toggle("lit", s === sp);
}
function clearLit() { if (SH.curSpans) for (const s of SH.curSpans) s.el.classList.remove("lit"); }

function shortRefStr() { return `${BOOKS[SH.bi].id}:${SH.c}:${SH.v}`; }
function updateShortSave() {
  const btn = $("#shortSave"); if (!btn) return;
  const on = Store.memHas(shortRefStr());
  btn.classList.toggle("on", on);
  btn.textContent = on ? "🧠" : "🧠";
  btn.title = on ? "Guardado en tu mazo" : "Guardar para memorizar";
}
function toggleShortSave() {
  const added = Store.memToggle(shortRefStr());
  updateShortSave();
  toast(added ? "Guardado en tu mazo 🧠" : "Quitado del mazo");
}

// Navegación manual (deslizar/flechas): reinicia el ancla del grupo.
async function userNav(dir) {
  if (SH.animating) return;
  const nx = await moveRef(SH.bi, SH.c, SH.v, dir);
  if (!nx) { bounce(); return; }
  SH.bi = nx.bi; SH.c = nx.c; SH.v = nx.v;
  SH.playCount = 0;
  await showCard(dir);
  saveShortPrefs();
  if (SH.audioOn && SH.playing) speakCurrent();
}
function bounce() {
  const c = $("#shortStage .short-card");
  if (c) { c.classList.add("bounce"); setTimeout(() => c.classList.remove("bounce"), 300); }
}

function buildSpoken(ref, text) {
  // Primero dice la referencia (Juan 3, 16) y luego el versículo.
  const prefix = ref.replace(":", ", ") + ". ";
  return { full: prefix + text, offset: prefix.length };
}
function speakCurrent() {
  if (!SH.audioOn) return;
  // IMPORTANTE: hablar de forma SÍNCRONA (sin await) para que el navegador
  // móvil lo permita dentro del toque. Usamos el texto ya cargado en la tarjeta.
  if (SH.curText != null && BOOKS[SH.bi]) {
    const ref = `${BOOKS[SH.bi].name} ${SH.c}:${SH.v}`;
    const { full, offset } = buildSpoken(ref, SH.curText);
    speakText(full, offset);
  } else {
    cardData(SH.bi, SH.c, SH.v).then(({ ref, text }) => {
      const { full, offset } = buildSpoken(ref, text);
      speakText(full, offset);
    }).catch(() => {});
  }
}
function speakText(text, offset = 0) {
  if (!hasTTS() || !SH.audioOn || !text) return;
  // Cancelar solo si realmente hay algo sonando (cancel+speak seguido rompe el audio en algunos móviles).
  try { if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel(); } catch (e) {}
  clearLit();
  SH.speakOffset = offset;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "es-ES"; u.rate = SH.rate;
  const v = spanishVoice(); if (v) u.voice = v;
  u.onboundary = (e) => { if (!e.name || e.name === "word") litWord(e.charIndex || 0); };
  u.onend = onSpeakEnd;
  pulse(true);
  try { speechSynthesis.speak(u); } catch (e) {}
}
function onSpeakEnd() {
  pulse(false); clearLit();
  if (!SH.playing || !SH.audioOn) return;
  SH.playCount++;
  // repite el mismo versículo hasta completar las repeticiones; luego auto-avanza
  if (SH.reps === Infinity || SH.playCount < SH.reps) { speakCurrent(); return; }
  SH.playCount = 0;
  autoForward();
}
async function autoForward() {
  const nx = await moveRef(SH.bi, SH.c, SH.v, 1);
  if (!nx) { SH.playing = false; renderShortControls(); return; }
  SH.bi = nx.bi; SH.c = nx.c; SH.v = nx.v;
  await showCard(1); saveShortPrefs(); speakCurrent();
}

function playPause() {
  if (!hasTTS()) { toast("Tu navegador no tiene lectura de voz."); return; }
  SH.playing = !SH.playing;
  if (SH.playing) {
    SH.audioOn = true;
    SH.playCount = 0;
    speakCurrent();
    // Si el dispositivo no tiene ninguna voz instalada, avisa (no sonará nada).
    setTimeout(() => {
      try {
        if (SH.playing && !speechSynthesis.getVoices().length && !speechSynthesis.speaking && !speechSynthesis.pending) {
          toast("Tu teléfono no tiene una voz instalada para leer. Revisa «Texto a voz» en Ajustes.");
        }
      } catch (e) {}
    }, 900);
  } else {
    try { speechSynthesis.cancel(); } catch (e) {}
    pulse(false); clearLit();
  }
  renderShortControls(); saveShortPrefs();
}
function toggleAudio() {
  SH.audioOn = !SH.audioOn;
  if (!SH.audioOn) { SH.playing = false; try { speechSynthesis.cancel(); } catch (e) {} pulse(false); clearLit(); }
  renderShortControls(); saveShortPrefs();
}
function cycleReps() {
  const i = REPS.indexOf(SH.reps);
  SH.reps = REPS[(i + 1) % REPS.length];
  SH.playCount = 0;
  renderShortControls(); saveShortPrefs();
}
function cycleRate() {
  const i = RATES.findIndex((r) => r[1] === SH.rate);
  SH.rate = RATES[(i + 1) % RATES.length][1];
  renderShortControls(); saveShortPrefs();
  if (SH.playing) speakCurrent();  // aplica la velocidad al instante
}
function pulse(on) {
  const c = $("#shortStage .short-card");
  if (c) c.classList.toggle("speaking", on);
}
function shortStop() {
  SH.playing = false;
  if (hasTTS()) { try { speechSynthesis.cancel(); } catch (e) {} }
}

/* --- Buscador propio del Short: en vivo y tolerante --- */
function openShortSearch() {
  $("#shortSearch").hidden = false;
  liveShortSearch("");
  setTimeout(() => $("#shortSearchInput").focus(), 50);
}
function closeShortSearch() { $("#shortSearch").hidden = true; }

// Encuentra el libro aunque se escriba parcial, sin acentos o con faltas (p. ej. "echos" -> Hechos).
function findBook(bq) {
  bq = norm(bq).replace(/\s+/g, " ").trim();
  const bqNoSp = bq.replace(/\s+/g, "");
  if (!bq) return -1;
  const C = BOOKS.map((b) => ({ n: norm(b.name), a: norm(b.abbrev), ns: norm(b.name).replace(/\s+/g, "") }));
  let i = C.findIndex((c) => c.n === bq || c.a === bq || c.ns === bqNoSp);
  if (i < 0) i = C.findIndex((c) => c.n.startsWith(bq) || c.ns.startsWith(bqNoSp));
  if (i < 0) i = C.findIndex((c) => c.n.includes(bq));
  return i;
}
// Interpreta "Juan 3:16", "juan 3 16", "echos 3.19", e incluso "Hechos 319" (sin separador).
function parseReference(q) {
  const cleaned = q.replace(/[:.,]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const parts = cleaned.split(" ");
  const nums = [];
  while (parts.length && /^\d+$/.test(parts[parts.length - 1])) nums.unshift(parts.pop());
  if (!parts.length || !nums.length) return null;
  const bi = findBook(parts.join(" "));
  if (bi < 0) return null;
  let c = +nums[0], v = nums[1] ? +nums[1] : 1;
  // "Hechos 319" -> capítulo 3, versículo 19 (si 319 no es un capítulo válido)
  if (nums.length === 1 && c > BOOKS[bi].chapters && nums[0].length >= 2) {
    for (let k = 1; k < nums[0].length; k++) {
      const cc = +nums[0].slice(0, k), vv = +nums[0].slice(k);
      if (cc >= 1 && cc <= BOOKS[bi].chapters && vv >= 1) { c = cc; v = vv; break; }
    }
  }
  return { bi, c, v };
}

let shortSearchT;
function onShortSearchInput(v) {
  clearTimeout(shortSearchT);
  shortSearchT = setTimeout(() => liveShortSearch(v.trim()), 180);
}
async function liveShortSearch(q) {
  const box = $("#shortSearchResults");
  if (!box) return;
  if (!q) {
    box.replaceChildren(el("p", "short-sr__hint", "Escribe una referencia (Juan 3:16, Hechos 3:19) o una palabra. Los resultados aparecen solos."));
    return;
  }
  const frag = document.createDocumentFragment();
  const ref = parseReference(q);
  if (ref) {
    const bk = BOOKS[ref.bi];
    const c = Math.min(Math.max(1, ref.c), bk.chapters);
    const go = el("button", "short-go", `<span class="short-go__i">📖</span><span class="short-go__t"><b>Ir a ${esc(bk.name)} ${c}:${ref.v}</b><small>Abrir este versículo</small></span><span class="short-go__a">›</span>`);
    go.onclick = () => { shortJump(ref.bi, c, ref.v); closeShortSearch(); };
    frag.appendChild(go);
  }
  box.replaceChildren(frag);
  // Búsqueda por palabra (si hay 3+ letras)
  const letters = q.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 3) {
    const token = ++liveShortSearch._t;
    try {
      const arr = await Data.versionFile("json/es_rvr.json");
      if (token !== liveShortSearch._t) return;   // llegó otra búsqueda más nueva
      const nq = norm(q); const out = [];
      for (let bi = 0; bi < arr.length && out.length < 50; bi++) {
        const chapters = arr[bi].chapters;
        for (let ci = 0; ci < chapters.length && out.length < 50; ci++) {
          const vs = chapters[ci];
          for (let vi = 0; vi < vs.length; vi++) {
            if (norm(vs[vi]).includes(nq)) { out.push({ bi, c: ci + 1, v: vi + 1, t: vs[vi] }); if (out.length >= 50) break; }
          }
        }
      }
      if (token !== liveShortSearch._t) return;
      if (out.length) {
        box.appendChild(el("p", "short-sr__hint", `${out.length}${out.length >= 50 ? "+" : ""} coincidencia(s) · toca para ir`));
        out.forEach((r) => {
          const d = el("div", "short-sr");
          d.innerHTML = `<div class="short-sr__r">${esc(BOOKS[r.bi].name)} ${r.c}:${r.v}</div><div class="short-sr__t">${esc(r.t)}</div>`;
          d.onclick = () => { shortJump(r.bi, r.c, r.v); closeShortSearch(); };
          box.appendChild(d);
        });
      } else if (!ref) {
        box.appendChild(el("p", "short-sr__hint", "Sin coincidencias. Prueba «Juan 3:16» o una palabra."));
      }
    } catch (e) {}
  } else if (!ref) {
    box.appendChild(el("p", "short-sr__hint", "Sigue escribiendo…"));
  }
}
liveShortSearch._t = 0;

async function shortJump(bi, c, v) {
  try {
    const es = await Data.es(BOOKS[bi].id);
    c = Math.min(Math.max(1, c), es.chapters.length);
    v = Math.min(Math.max(1, v), es.chapters[c - 1].length);
  } catch (e) {}
  SH.bi = bi; SH.c = c; SH.v = v;
  SH.playCount = 0;
  await showCard(0); saveShortPrefs();
  if (SH.audioOn && SH.playing) speakCurrent();
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
  if (!("serviceWorker" in navigator)) return;
  // Si ya nos controlaba una versión y entra una nueva, recargamos una sola
  // vez de forma silenciosa: el usuario siempre tiene lo último sin tener que
  // refrescar a mano. En la primera visita (sin controlador) no recargamos.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register("sw.js").then((reg) => {
    reg.update().catch(() => {});
    // Al volver a abrir la pestaña, buscamos actualizaciones.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => {});
    });
  }).catch(() => {});
}

init();

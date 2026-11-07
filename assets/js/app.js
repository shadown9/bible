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
  $$(".view").forEach((v) => v.classList.toggle("is-active", v.id === "view-" + name));
  $$(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.view === name));
  window.scrollTo({ top: 0 });
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
      { id: "es_rvr", name: "Reina Valera 1909", lang: "Español" },
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

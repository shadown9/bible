/* ============================================================
   store.js — preferencias, posición y MARCAS del usuario
   (resaltados de colores y favoritos) en localStorage, con
   manejo seguro de errores.
   ============================================================ */

const KEY = "biblia-estudio:v2";

const DEFAULTS = {
  theme: "auto",          // auto | light | dark
  fontSize: 1.14,         // rem del texto de lectura
  last: { book: "genesis", chapter: 1 }, // última posición
  compare: ["es_rvr", "he_wlc", "en_kjv"], // versiones por defecto: español, hebreo, inglés
  highlights: {},         // "libro:cap:ver" -> color (amarillo|verde|azul|rosa|naranja)
  favorites: [],          // ["libro:cap:ver", ...] (más reciente primero)
  seenTip: false,         // si ya mostramos el consejo inicial
  onboarded: false,       // si ya mostramos la bienvenida
  notes: {},              // "libro:cap:ver" -> { obs, int, app } notas del estudio guiado
  plans: {},              // planId -> [índices de días completados]
  memorize: {},           // ref -> { lvl, due } (repetición espaciada)
  streak: { last: 0, count: 0 }, // racha de práctica (día -> nº)
};

// intervalos de repaso en días según el nivel alcanzado (0..5)
const MEM_INT = [0, 1, 3, 7, 14, 30];
const today = () => Math.floor(Date.now() / 864e5);

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const merged = { ...DEFAULTS, ...JSON.parse(raw) };
      // migración: quien tenía el default antiguo pasa al nuevo (español/hebreo/inglés)
      if (Array.isArray(merged.compare) && merged.compare.length === 2 &&
          merged.compare[0] === "es_rvr" && merged.compare[1] === "en_kjv") {
        merged.compare = ["es_rvr", "he_wlc", "en_kjv"];
      }
      return merged;
    }
  } catch (e) { /* almacenamiento no disponible */ }
  return JSON.parse(JSON.stringify(DEFAULTS));
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { /* modo privado, etc.: la app sigue funcionando */ }
}

export const Store = {
  get: (k) => state[k],
  set: (k, v) => { state[k] = v; persist(); },
  all: () => ({ ...state }),
  setLast: (book, chapter) => { state.last = { book, chapter }; persist(); },

  // --- Resaltados ---
  getHighlight: (ref) => state.highlights[ref] || null,
  setHighlight: (ref, color) => {
    if (color) state.highlights[ref] = color;
    else delete state.highlights[ref];
    persist();
  },
  highlights: () => ({ ...state.highlights }),

  // --- Favoritos ---
  isFavorite: (ref) => state.favorites.includes(ref),
  toggleFavorite: (ref) => {
    const i = state.favorites.indexOf(ref);
    if (i >= 0) state.favorites.splice(i, 1);
    else state.favorites.unshift(ref);
    persist();
    return state.favorites.includes(ref);
  },
  favorites: () => [...state.favorites],

  // conteo de marcas (para la pestaña)
  marksCount: () =>
    state.favorites.length + Object.keys(state.highlights).length,

  // --- Planes de lectura ---
  planDone: (planId) => (state.plans[planId] || []).slice(),
  isPlanDay: (planId, i) => (state.plans[planId] || []).includes(i),
  togglePlanDay: (planId, i) => {
    const arr = state.plans[planId] || (state.plans[planId] = []);
    const k = arr.indexOf(i);
    if (k >= 0) arr.splice(k, 1); else arr.push(i);
    if (!arr.length) delete state.plans[planId];
    persist();
    return (state.plans[planId] || []).includes(i);
  },
  planCount: (planId) => (state.plans[planId] || []).length,

  // --- Memorización (repetición espaciada + racha) ---
  memHas: (ref) => !!state.memorize[ref],
  memToggle: (ref) => {
    if (state.memorize[ref]) delete state.memorize[ref];
    else state.memorize[ref] = { lvl: 0, due: 0 };
    persist();
    return !!state.memorize[ref];
  },
  memAll: () => Object.entries(state.memorize).map(([ref, m]) => ({ ref, lvl: m.lvl, due: m.due })),
  memDueCount: () => {
    const t = today();
    return Object.values(state.memorize).filter((m) => (m.due || 0) <= t).length;
  },
  memBump: (ref) => {
    const m = state.memorize[ref]; if (!m) return;
    m.lvl = Math.min((m.lvl || 0) + 1, 5);
    m.due = today() + MEM_INT[m.lvl];
    persist();
  },
  memCount: () => Object.keys(state.memorize).length,
  memMastered: () => Object.values(state.memorize).filter((m) => m.lvl >= 5).length,
  streakGet: () => state.streak.count || 0,
  streakMark: () => {
    const t = today(), s = state.streak;
    if (s.last === t) return s.count;
    s.count = (s.last === t - 1) ? (s.count || 0) + 1 : 1;
    s.last = t; persist();
    return s.count;
  },

  // --- Notas del estudio guiado ---
  getNote: (ref, key) => (state.notes[ref] && state.notes[ref][key]) || "",
  setNote: (ref, key, val) => {
    if (!state.notes[ref]) state.notes[ref] = {};
    if (val) state.notes[ref][key] = val;
    else { delete state.notes[ref][key]; if (!Object.keys(state.notes[ref]).length) delete state.notes[ref]; }
    persist();
  },
};

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
  notes: {},              // "libro:cap:ver" -> { obs, int, app } notas del estudio guiado
};

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

  // --- Notas del estudio guiado ---
  getNote: (ref, key) => (state.notes[ref] && state.notes[ref][key]) || "",
  setNote: (ref, key, val) => {
    if (!state.notes[ref]) state.notes[ref] = {};
    if (val) state.notes[ref][key] = val;
    else { delete state.notes[ref][key]; if (!Object.keys(state.notes[ref]).length) delete state.notes[ref]; }
    persist();
  },
};

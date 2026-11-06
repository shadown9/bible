/* ============================================================
   store.js — estado del usuario (preferencias y posición) en
   localStorage, con manejo seguro de errores.
   ============================================================ */

const KEY = "biblia-estudio:v1";

const DEFAULTS = {
  theme: "auto",          // auto | light | dark
  fontSize: 1.12,         // rem del texto de lectura
  interlinear: false,     // mostrar interlineal hebreo en Leer
  showStrongs: true,      // mostrar nº de Strong bajo cada palabra
  last: { book: "genesis", chapter: 1 }, // última posición
  compare: ["es_rvr", "en_kjv"],         // versiones elegidas para comparar
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) { /* almacenamiento no disponible */ }
  return { ...DEFAULTS };
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
};

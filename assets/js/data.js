/* ============================================================
   data.js — carga y caché de todos los activos de datos.
   Todo es estático (GitHub Pages); se cachea en memoria y el
   service worker lo guarda para uso sin conexión.
   ============================================================ */

const cache = new Map();

async function getJSON(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
  // Algunos archivos del repo original traen BOM: lo quitamos antes de parsear.
  const txt = (await res.text()).replace(/^﻿/, "");
  const data = JSON.parse(txt);
  cache.set(url, data);
  return data;
}

export const Data = {
  books: () => getJSON("data/books.json"),
  es: (bookId) => getJSON(`data/es/${bookId}.json`),
  hebrew: (bookId) => getJSON(`data/hebrew/${bookId}.json`),
  greek: (bookId) => getJSON(`data/greek/${bookId}.json`),
  strongsHe: () => getJSON("data/strongs_he.json"),
  strongsHeEs: () => getJSON("data/strongs_he_es.json"),
  strongsGr: () => getJSON("data/strongs_gr.json"),
  strongsGrEs: () => getJSON("data/strongs_gr_es.json"),
  concordanceHe: () => getJSON("data/concordance_he.json"),
  concordanceGr: () => getJSON("data/concordance_gr.json"),
  versions: () => getJSON("data/versions.json"),
  booksIntro: () => getJSON("data/books_intro.json"),
  // Archivos de versiones del repo original: [{abbrev, name, chapters:[[...]]}]
  versionFile: (file) => getJSON(file),
};

// Índice de libros cargado una vez; utilidades de acceso.
let _books = null;
export async function books() {
  if (!_books) _books = await Data.books();
  return _books;
}
export async function bookById(id) {
  return (await books()).find((b) => b.id === id);
}
export async function bookByNum(n) {
  return (await books()).find((b) => b.n === n);
}

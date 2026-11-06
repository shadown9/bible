# 📖 Biblia de Estudio

Aplicación web (PWA) para **estudiar la Biblia de forma profunda y sencilla**: lectura
cómoda, comparación de versiones y análisis del **hebreo palabra por palabra** con
números de Strong, diccionario y concordancia. Funciona en el celular y en la
computadora, se instala desde el navegador y **funciona sin conexión**.

> Objetivo: que cualquiera pueda acercarse al texto original —no solo a una
> traducción— de manera dinámica, visual y fácil de entender.

## ✨ Funciones

- **Leer** cualquiera de los 66 libros, con navegación por libro y capítulo.
- **Interlineal hebreo** (Antiguo Testamento): activa el botón **עב** y ve cada
  versículo palabra por palabra en hebreo, con su número de Strong.
- **Estudio de palabra**: toca una palabra hebrea y abre su entrada del diccionario
  Strong (lema, transliteración, pronunciación, definición y origen) más **todas sus
  apariciones** en el Antiguo Testamento.
- **Comparar versiones**: hasta 4 versiones lado a lado (incluido el texto hebreo).
- **Buscar** cualquier palabra o frase en el texto en español.
- **Versículo del día**, modo claro/oscuro y tamaño de letra ajustable.
- **PWA**: instalable y disponible sin conexión.

## 📚 Fuentes de datos (todas de licencia abierta)

| Recurso | Fuente | Licencia |
|---|---|---|
| Texto en español | **Reina Valera 1909** | Dominio público |
| Antiguo Testamento en hebreo (morfología + Strong) | Códice de Leningrado · [OpenScriptures MorphHB](https://github.com/openscriptures/morphhb) | CC BY 4.0 |
| Diccionarios Strong (hebreo y griego) | [OpenScriptures Strong's](https://github.com/openscriptures/strongs) | Dominio público |
| Otras 18 versiones (para comparar) | Proyecto original *Bible: XML and JSON* | CC BY-NC |

> **Nota sobre la Reina Valera 1960:** la RV1960 tiene derechos de autor (Sociedades
> Bíblicas Unidas) y **no puede distribuirse libremente**. Por eso la app usa la
> **RV1909** (dominio público), que es de la misma familia Reina-Valera y de lenguaje
> casi idéntico. Si en el futuro se obtiene una licencia, la RV1960 se puede añadir.

## 🗂️ Estructura del proyecto

```
index.html                 # app (punto de entrada; se sirve en la raíz)
manifest.webmanifest       # configuración PWA
sw.js                      # service worker (uso sin conexión)
assets/
  css/app.css              # estilos
  js/{app,data,store}.js   # lógica de la app (ES modules)
  icons/                   # iconos PWA
data/                      # base de datos generada (ver más abajo)
  books.json               # metadatos de los 66 libros
  es/<libro>.json          # texto RV1909 por libro
  hebrew/<libro>.json      # AT hebreo interlineal (palabra + Strong + morfología)
  strongs_he.json          # diccionario Strong hebreo
  strongs_gr.json          # diccionario Strong griego
  concordance_he.json      # concordancia hebrea (Strong -> apariciones)
  versions.json            # catálogo de versiones para comparar
json/ , xml/               # versiones bíblicas originales (varios idiomas)
tools/build_data.py        # pipeline reproducible que genera data/
```

## 🔧 Regenerar la base de datos

Todos los activos de `data/` se generan de forma reproducible:

```bash
python3 tools/build_data.py          # descarga fuentes y construye todo
python3 tools/build_data.py --no-net # reconstruye solo lo local (sin descargar)
```

## ▶️ Probar en local

```bash
python3 -m http.server 8777
# abre http://localhost:8777
```

## 🚀 Publicar gratis (GitHub Pages)

1. En GitHub: **Settings → Pages**.
2. En *Source* elige la rama de este proyecto y la carpeta **/(root)**.
3. Guarda. En unos minutos tendrás la app publicada en una URL pública, gratis.

## 🗺️ Hoja de ruta

- Interlineal **griego** del Nuevo Testamento (con Strong).
- Definiciones Strong **traducidas al español**.
- Vocabulario hebreo con **repetición espaciada** (tipo tarjetas).
- Planes de lectura, racha diaria y logros.
- Notas y resaltados del usuario.

## 📄 Licencia

Código bajo los términos del repositorio. Cada versión bíblica y recurso pertenece a
sus respectivos autores; ver la tabla de fuentes.

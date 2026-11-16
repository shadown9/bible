# Panel de administración · El Mundo en 2026

Herramienta **100% local** para editar el contenido del sitio `mundo-2026/` sin tocar código.
No se publica en la web, no usa internet, no pide ni guarda contraseñas ni tokens.

## Cómo usarlo

1. Clona o descarga este repositorio en tu computadora.
2. Abre `mundo-2026-admin/index.html` con doble clic (Chrome o Edge recomendado).
3. Pulsa **"Abrir carpeta mundo-2026…"** y elige la carpeta `mundo-2026` del repositorio
   (la que contiene `index.html` y `en/`). En Firefox/Safari, carga los dos archivos a mano.
4. Edita: elige sección y tarjeta, cambia los campos en español e inglés, **Aplicar**,
   revisa la **Vista previa** y **Guardar**.
5. Publica: `git add mundo-2026 && git commit -m "Actualizar calendario" && git push`
   (o con GitHub Desktop). Vercel despliega solo el cambio.

## Reglas importantes

- **No reordenes ni elimines tarjetas ya publicadas**: los contadores de «me gusta» de la
  app de claude.ai dependen de la posición de cada tarjeta dentro de su sección.
  Añadir tarjetas **al final** de una sección es siempre seguro.
- Mantén los dos idiomas con el **mismo número de tarjetas** por sección (el panel las
  crea en pareja automáticamente y avisa si quedan desparejadas).
- En las descripciones, usa `<strong>…</strong>` solo para resultados verificados con fuente.

## Seguridad

- El sitio público es estático: sin login, sin base de datos, sin servidor — no hay
  superficie de ataque.
- Este panel corre solo en tu máquina; el control de acceso real es tu cuenta de GitHub.
  Activa la **verificación en dos pasos** en GitHub si no la tienes.
- El motor automático (tareas programadas de Claude) actualiza el contenido cada mes por
  su cuenta; este panel es para tus ediciones manuales. Ambos escriben al mismo sitio,
  así que haz `git pull` antes de editar.

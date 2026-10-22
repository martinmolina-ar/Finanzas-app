---
name: modernizar-sitio
description: Rediseña y moderniza sitios web existentes (landings de promos, sitios de marca, maquetas, apps web) respetando a rajatabla los recursos de cada proyecto: colores de marca exactos, logos, tipografías propias, imágenes y textos legales. Extrae el kit de marca del código, deriva un sistema de tokens moderno (escalas OKLCH, neutros con matiz, contraste AA, modo oscuro), aplica una base CSS actual y verifica con capturas en celular y escritorio. Usalo siempre que el usuario pida "modernizar", "renovar", "lavarle la cara", "hacer una versión más moderna", "rediseñar", "actualizar el diseño" o "mejorar el look" de un sitio, landing, promo o maqueta, aunque no diga la palabra skill, y también cuando pase un zip o carpeta de un sitio y pida mejorarlo visualmente.
---

# Modernizar sitio

Objetivo: tomar un sitio que ya existe y entregar una versión más moderna **que siga siendo inconfundiblemente de esa marca**. Lo nuevo se nota en el oficio (tipografía, ritmo, jerarquía, interacción, accesibilidad, performance), no en cambiar la identidad.

Precedencia, siempre: **lo que pide el usuario > el manual o kit de marca del proyecto > este skill**.

## Qué no se toca nunca

- Los hex de marca. Se derivan escalas alrededor de ellos, pero el color original queda tal cual y es el que se usa en logo, superficies de marca y acento principal.
- Logos: ni se recolorean, ni se deforman, ni se recortan. Se respeta su versión positivo/negativo (ej. `logo_blanco.svg` sobre fondo de color).
- Tipografías propias del proyecto (`@font-face` con archivos locales). Si el sitio usa una fuente de marca, esa es la display y casi siempre también la de texto. Solo se suma una segunda familia si la marca no tiene una y el sitio la necesita.
- Fotos de producto y premios, y textos legales o de bases y condiciones. Se pueden reencuadrar con `object-fit` o `aspect-ratio`, pero no se inventa contenido ni se cambian datos (fechas, montos, CUIT, premios, sorteos).

Si algo de esto choca con la accesibilidad (por ejemplo, blanco sobre el verde de marca no llega a 4.5:1), **no se cambia la marca**: se usa el escalón accesible para ese caso puntual (`--marca-boton`, `--marca-texto`) y se le avisa al usuario.

## Flujo

### 1. Inventario de marca

```bash
python3 -I scripts/extraer_marca.py <carpeta_del_sitio> --out <trabajo>/brand.json
```

Lista los colores por uso con su nombre de variable CSS, las fuentes (`@font-face`, `font-family`, Google Fonts), los logos y las imágenes con su peso. Leé además el CSS principal y el HTML para entender la estructura. Si hay un manual de marca (PDF o brandbook), manda por sobre lo que se infiere del código.

Con eso, escribí en 5 líneas el **brief**: qué es el sitio, para quién es, qué tiene que lograr (participar de la promo, registrarse, canjear) y qué detalle propio del rubro conviene mostrar como contenido (unidades, productos, mecánica real). Si no está claro, preguntá eso solo.

### 2. Tokens

```bash
python3 -I scripts/derivar_tokens.py --marca <nombre>=#hex [--marca <nombre2>=#hex] \
   [--tinta #hex] [--fondo #hex] [--sin-oscuro] --out <trabajo>/tokens.css
```

- La primera `--marca` es el acento principal. Usá los nombres que ya tenga el proyecto (verde, rojo, azul…).
- `--tinta` y `--fondo` solo si la marca los tiene definidos. Si no, se derivan neutros con el matiz de la marca (nunca gris puro).
- Leé los AVISOS de contraste que imprime y aplicalos: texto chico sobre color de marca → `--<marca>-boton`; color de marca como texto sobre fondo claro → `--<marca>-texto`.
- Modo oscuro: generalo si el sitio es una app o herramienta, o si el usuario lo pide. Una landing de promo con identidad fuerte puede quedarse solo en claro (`--sin-oscuro`), pero que sea una decisión y no un olvido.

### 3. Plan de diseño (antes de escribir código)

Escribilo como comentario arriba del CSS nuevo:
- **Color**: qué rol cumple cada token de marca (acento, superficie de marca, texto). Un solo acento dominante; el segundo color de marca va para un único rol (por ejemplo, CTA o premio).
- **Tipo**: la familia de marca en display y texto, la escala (`--t-*` de base.css) y qué pesos se usan para qué.
- **Layout**: una línea con el concepto y un wireframe ASCII del hero y las secciones.
- **Momento**: el único gesto memorable (un hero con la foto del premio a sangre, un contador de cierre, un reveal de la mecánica). Todo lo demás queda quieto.

Después revisalo contra `references/anti-genericos.md`. Si una parte del plan podría ser de cualquier sitio, cambiala por algo que salga del mundo de esta marca.

### 4. Construir

- Arrancá desde `assets/base.css` (capas `reset, base, layout, componentes, utilidades`) + `tokens.css`. El CSS del proyecto va sin capa, así siempre gana.
- Definí `--fuente-display` y `--fuente-texto` con los `@font-face` del proyecto y un fallback real. Convertí `.otf`/`.ttf` a `.woff2` si se puede (`pip install fonttools brotli` y `pyftsubset` o `fonttools ttLib.woff2 compress`), y conservá los originales.
- Patrones por tipo de sección: `references/patrones.md` (promos, sitios de marca, apps y backoffice).
- Principios de diseño detallados: `references/principios.md`.
- Imágenes: `width` y `height` siempre, `loading="lazy"` salvo la del hero (que va con `fetchpriority="high"`), y `<picture>` con webp/avif si hay herramienta para convertirlas. Avisá cuando una imagen pese más de 300KB.
- Copy: rioplatense si el sitio lo es (vos, tocá, sumá). Los CTA dicen exactamente qué pasa ("Cargá tu ticket", no "Enviar"). No se inventan premios, fechas ni condiciones: si falta un dato, va un marcador visible `[FECHA DE CIERRE]` y se avisa.
- Mantené rutas y nombres de archivos de los assets para que el resultado se pueda deployar en el mismo lugar (Netlify o Vercel).

### 5. Verificar

```bash
node scripts/capturas.cjs <archivo.html | url> <trabajo>/capturas
```

Saca capturas en 390px y 1440px, en claro y oscuro, y reporta scroll horizontal, elementos que se salen, imágenes rotas, fuentes que no cargaron, errores de consola, links sin texto y objetivos táctiles de menos de 40px. **Mirá las capturas** (con Read sobre el PNG), corregí lo que se ve mal y repetí una vez. Después recorré `references/checklist.md`.

### 6. Entregar

- El sitio modernizado en una carpeta nueva (`<proyecto>-v2/` o la que pida el usuario), sin pisar el original.
- Un resumen corto: qué se mantuvo, qué cambió y por qué, y los avisos (contraste de la marca, imágenes pesadas, datos faltantes).
- Si el usuario quiere ver el antes y el después, poné las capturas lado a lado.

## Archivos del skill

| Archivo | Para qué |
|---|---|
| `scripts/extraer_marca.py` | Inventario de colores, fuentes, logos e imágenes de un sitio |
| `scripts/derivar_tokens.py` | Escalas OKLCH, neutros, contraste y tokens claro/oscuro desde los hex de marca |
| `scripts/capturas.cjs` | Capturas en celular/escritorio y claro/oscuro, más reporte de problemas |
| `assets/base.css` | Fundación CSS moderna: escala fluida, layout sin márgenes sueltos, componentes accesibles |
| `references/principios.md` | Reglas de diseño: tipografía, color, layout, movimiento, copy |
| `references/anti-genericos.md` | Lo que delata un diseño "hecho por IA" y cómo evitarlo |
| `references/patrones.md` | Tratamientos modernos por sección: promo, marca, app, backoffice |
| `references/checklist.md` | Control de calidad antes de entregar |

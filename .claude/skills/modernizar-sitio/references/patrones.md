# Patrones por tipo de sitio

Tratamientos modernos para las secciones que se repiten. Son puntos de partida, no plantillas: cada uno se adapta al mundo de la marca.

## Landing de promo

Una promo tiene una sola tarea: que la persona participe. Todo se ordena alrededor de eso.

**Header**: el logo de la marca y el de la promo si existe, más un CTA corto ("Participá"). Sticky con fondo translúcido (`.header`). Sin menú hamburguesa si hay 3 links o menos.

**Hero**: lo más característico de la promo, que casi siempre es **el premio** o la foto de la campaña. Titular con la promesa concreta ("Ganá una moto 0 km comprando Castrol"), una bajada con la condición clave, el CTA principal y la fecha de cierre visible. En celular, la imagen va arriba o detrás con un degradé legible, nunca texto sobre una foto sin protección. Si la promo tiene fecha de cierre, un contador o "Quedan 12 días" es un buen candidato a momento memorable.

**Mecánica** (`.pasos`): es una secuencia real, así que la numeración se justifica. Entre 3 y 4 pasos con verbo al principio ("Comprá", "Cargá tu ticket", "Sumá chances"). Íconos de línea consistentes, todos de la misma familia y con el mismo trazo.

**Premios**: una grilla (`.grilla --min: 14rem`) o un carrusel con snap (`.scroll-x`) en celular. Todas las fotos con el mismo `aspect-ratio` y `object-fit: contain` sobre `--superficie-2` si son productos recortados, o `cover` si son fotos. Nombre y cantidad ("x 10") en tipografía tabular. El premio mayor puede romper la grilla y ocupar 2 columnas: esa jerarquía es información.

**Formulario de participación**: una columna, labels visibles y el `inputmode` correcto (DNI, teléfono). Si se sube el ticket, una zona para soltar el archivo con preview. La validación aparece al salir del campo (`:user-invalid`), no al cargar. Un único CTA con verbo. La confirmación repite el verbo y dice qué sigue ("Ticket cargado. Te avisamos por mail si ganás el 15/12").

**Ganadores**: una tabla o lista con fecha de sorteo, inicial del apellido y localidad. Antes del sorteo, un estado vacío que diga cuándo se publican.

**Bases y condiciones y FAQ**: un acordeón nativo (`.acordeon` con `details`). El texto legal se mantiene íntegro; solo se le da legibilidad (medida, interlineado, `.legal`).

**Footer**: logos, legales obligatorios (permiso de lotería y CUIT si lo hay), links a bases y redes. Es chico, pero tiene que pasar el contraste.

## Sitio de marca o institucional

- El hero con la foto propia más fuerte y un titular que diga qué hacen, en el idioma del cliente.
- Las secciones como bandas (`.banda`, `.banda--acento`, `.banda--suave`) alternando ritmo, no todas iguales. Una sola banda de color de marca pleno tiene más fuerza que cinco.
- `.split` texto e imagen alternando lados, con fotos reales.
- Productos o servicios en grilla de tarjetas solo si son objetos comparables. Si no, una lista con buena tipografía.
- Contacto: dirección, teléfono y mail como texto seleccionable, mapa enlazado (no embebido si pesa) y un formulario corto.

## App web o prototipo móvil

- Pantalla completa con `100dvh`, header sticky que respete `safe-area-inset-top` y tabbar inferior con `safe-area-inset-bottom`.
- Un estado inicial realista con datos de ejemplo marcados como tales, nunca una pantalla vacía.
- El estado se codifica en forma y en color: pills de estado, chips o una franja de severidad. Lo que necesita atención se ve de un vistazo.
- Transiciones que responden a la acción, como una vista que entra o un sheet que sube. Nada decorativo.
- Los objetivos táctiles miden 44px o más, con `touch-action: manipulation` y sin delay.

## Backoffice o dashboard

- Primero el resumen, después el detalle. Las tiles de números grandes van solo si esos números son el punto.
- Tablas con `tabular-nums`, números alineados a la derecha, encabezado sticky y scroll horizontal propio en celular.
- Los gráficos van a escala, con etiquetas que nombren valores reales, colores de los tokens (que se lean en los dos temas), una grilla tenue y el último punto destacado.
- Los colores semánticos (ok, aviso, error) son independientes del acento de marca.
- Los filtros arriba, con su estado visible ("Mayo a octubre 2026 · Todos los distribuidores").

# Principios de diseño

Reglas destiladas de los skills de diseño (artifact-design, frontend-design) y adaptadas para rediseñar sitios **con una marca que ya existe**. Donde la marca define algo, manda la marca.

## Pararse en el tema

- Antes de diseñar: un tema concreto, su público y **una sola tarea** de la página (participar, registrarse, canjear, comprar).
- Las decisiones distintivas salen del mundo del tema: sus materiales, herramientas, jerga y unidades. Un lubricentro tiene litros, viscosidades (5W-30), facturas y CUIT; un súper tiene tickets, sucursales y góndolas. Al menos un detalle así tiene que aparecer **como contenido**, no como adorno.
- Siempre contenido real. Nunca lorem ipsum. Si falta un dato, va un marcador visible entre corchetes.

## Tipografía

La tipografía define la personalidad, y en un rediseño es donde más se nota lo moderno.

- Si la marca tiene fuente propia, se usa para todo y la personalidad sale del **tratamiento**: pesos contrastados (Light 300 para los bajadas, Bold 700 para los titulares), tamaños grandes en display, interletrado negativo leve en titulares (-0.01 a -0.03em) y positivo en etiquetas chicas.
- Si no tiene: una display con carácter, usada con mesura, y una de texto que la complemente. Google Fonts o archivos locales, siempre con un fallback real en la pila. Evitá las familias de siempre (Inter, Space Grotesk, Poppins, Montserrat) salvo que sean de la marca.
- Escala fija y usada con disciplina (`--t-sm` … `--t-4xl` en base.css). Nada de tamaños sueltos.
- Medida de lectura de alrededor de 65 caracteres. Titulares con `text-wrap: balance` y párrafos con `pretty`.
- Interlineado: alrededor de 1.5 para texto y 1.05–1.15 para display grande. Las serif llevan algo más.
- `font-variant-numeric: tabular-nums` donde haya números en columna (puntos, precios, tablas).
- Cuidado con los tics: una sola palabra del titular en otro color o itálica, etiquetas en MAYÚSCULAS espaciadas arriba de cada título, o etiquetas que no aportan nada.

## Color

- Un acento dominante (el color principal de marca) y el resto en neutros. El segundo color de marca cumple **un solo** rol, como el CTA, la urgencia o el premio.
- Neutros con el matiz de la marca, nunca gris puro. `derivar_tokens.py` ya los genera así.
- Los componentes usan **roles** (`--fondo`, `--superficie`, `--texto`, `--acento`…), nunca hex sueltos. Así el modo oscuro y los ajustes salen gratis.
- Color semántico (error, ok, aviso) aparte del acento. Si la marca es roja, el error no puede depender solo del color: lleva ícono y texto.
- Contraste: 4.5:1 para texto normal y 3:1 para texto grande (24px o más, o 19px en bold) y para bordes de controles. Si el color de marca no llega, se usa su escalón accesible solo en ese caso.
- Modo oscuro: no es invertir. Se bajan las superficies, se aclara el acento cuando funciona como texto (`--marca-texto` cambia solo) y se mantiene el hex original en superficies grandes de marca.

## Layout y espaciado

- Hermanos con `gap` (flex o grid), no con márgenes en cada elemento. Espacios de la escala `--e-*`.
- Gutter lateral mínimo de 16px que respete el notch: `max(16px, env(safe-area-inset-left))`.
- Mobile first de verdad: todo funciona a 360–390px sin scroll horizontal. Las filas se envuelven o se apilan. Los hijos de flex o grid con texto llevan `min-width: 0`.
- Solo las tablas, los carruseles y el código pueden ser más anchos, dentro de su propio contenedor con `overflow-x: auto`.
- Hero dimensionado por su contenido, no `100vh`. El primer pantallazo tiene que mostrar qué es y qué hacer.
- Elementos repetidos (tarjetas de premios, pasos) con los mismos bordes, la misma línea de base y el mismo padding. La cantidad de columnas se elige para que no queden huérfanos ni huecos.
- Las tarjetas (borde, fondo, radio, sombra) se usan solo para lo que tiene que separarse del fondo, no para todos los bloques. Si todo es tarjeta, nada lo es.
- Los radios van por rol: control, tarjeta o pill. No un único `rounded-lg` para todo.

## Estructura como información

La numeración, las etiquetas, los separadores y los íconos tienen que decir algo cierto. Los pasos numerados van solo si el contenido es una secuencia real (la mecánica de la promo sí; "beneficios" no).

## Movimiento

- Un solo momento orquestado (la entrada del hero o el reveal de la mecánica) vale más que diez efectos sueltos.
- El movimiento que responde a una acción (abrir, confirmar, cargar) es bienvenido si muestra qué cambió.
- La página está completa en reposo: nada queda en `opacity: 0` esperando un observer. Si la animación no corre, el contenido igual se ve.
- Siempre respetar `prefers-reduced-motion`.

## Copy

- Escrito desde el lado del usuario: las cosas se llaman por lo que la gente reconoce, no por cómo está armado el sistema.
- Voz activa. El botón dice qué pasa ("Cargar ticket") y la confirmación repite el verbo ("Ticket cargado").
- Los errores dicen qué pasó y cómo arreglarlo, sin pedir disculpas ni quedarse en vaguedades. Un estado vacío invita a actuar.
- Oraciones cortas y directas. Nada de rayas para incisos, "no es X, es Y", dos puntos con revelación ni frases hechas.

## Construcción

- HTML semántico: `header`, `main`, `section` con encabezado, `nav`, `footer`, `button` para acciones y `a` para navegar.
- Foco visible en todo lo interactivo, link para saltar al contenido, `alt` real en las imágenes de contenido y `alt=""` en las decorativas.
- Cada `input` con su `label` visible y `autocomplete` e `inputmode` correctos (DNI: `inputmode="numeric"`; email: `type="email" autocomplete="email"`).
- Objetivos táctiles de 44px como mínimo.
- Ojo con la especificidad: una regla por tipo (`.section`) y otra por elemento (`.cta`) que tocan el mismo padding se pisan sin avisar. Las capas de base.css ayudan.
- Imágenes con `width` y `height` (sin saltos de layout), lazy salvo la del hero, y formatos modernos.
- Sin dependencias pesadas para cosas que CSS ya resuelve: `details` para acordeones, `dialog` para modales, `:has()`, container queries, `color-mix()` y scroll-snap.

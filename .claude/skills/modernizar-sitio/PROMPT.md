Quiero una versión más moderna de este sitio. Tiene que seguir siendo inconfundiblemente de la marca: lo nuevo se tiene que notar en el oficio (tipografía, ritmo, jerarquía, interacción, accesibilidad, performance), no en un cambio de identidad. Si tenés instalado el skill "modernizar-sitio", usalo y seguí su flujo. Si no, seguí estas instrucciones.

Contexto opcional (completá lo que sepas y borrá lo demás):
- Carpeta o URL del sitio: [ ]
- Qué es y para quién: [ej. promo de Gillette para compradores de súper, participan cargando el ticket]
- Única tarea de la página: [participar / registrarse / canjear / comprar]
- Manual de marca: [ruta al PDF o "no hay"]
- Modo oscuro: [sí / no / decidí vos]

## 1. Lo que NO se toca

- Los colores de marca: se usan los hex exactos. Podés derivar tonos alrededor, pero el original queda igual en logo, superficies de marca y acento principal.
- Los logos: no se recolorean, no se deforman y no se recortan. Usá la versión positiva o negativa que corresponda al fondo.
- Las tipografías propias (archivos @font-face del proyecto): son la display y casi siempre también la de texto. Una segunda familia entra solo si la marca no tiene ninguna.
- Las fotos de productos y premios, y los textos legales, las bases, las fechas, los montos, los premios y el CUIT. Las fotos se pueden reencuadrar con aspect-ratio y object-fit. No se inventan datos: si falta uno, dejá un marcador visible como [FECHA DE CIERRE] y avisame.
- Las rutas y los nombres de los assets, para que el resultado se pueda deployar en el mismo lugar.

Precedencia: lo que te pido yo, después el manual o kit de marca, después estas reglas. Si la accesibilidad choca con la marca (por ejemplo, blanco sobre el color de marca da menos de 4.5:1), no cambies la marca: usá un tono accesible derivado solo para ese caso y avisame.

## 2. Inventario (antes de diseñar)

Leé el HTML y el CSS y listame:
- Los colores, por cantidad de usos y con su nombre de variable.
- Las fuentes (@font-face, font-family, Google Fonts).
- Los logos.
- Las imágenes, con sus dimensiones y peso. Marcá las de más de 300KB.

Escribí un brief de 5 líneas: qué es el sitio, para quién, cuál es su única tarea y qué detalle propio del rubro (unidades, productos, mecánica real, jerga) conviene mostrar como contenido.

## 3. Tokens

- Armá escalas de 50 a 950 para cada color de marca en OKLCH. El hex original va exacto en su escalón más cercano.
- Neutros con el matiz de la marca o de su tinta, nunca gris puro.
- Calculá el contraste WCAG de cada color de marca contra blanco y contra la tinta, y definí:
  - --sobre-marca: el texto que va encima del color de marca.
  - --marca-boton: el escalón donde el texto blanco llega a 4.5:1.
  - --marca-texto: el escalón que funciona como texto sobre fondo claro con 4.5:1, y otro para fondo oscuro.
- Los componentes usan solo roles: --fondo, --superficie, --superficie-2, --texto, --texto-suave, --borde, --acento, --sobre-acento, --acento-texto, --acento-boton, --acento-suave, --foco, --error, --ok. Nada de hex sueltos en los componentes.
- Si hay modo oscuro, armalo así:
  - Todos los tokens en :root, con los valores claros.
  - `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }` y `:root[data-theme="dark"] {…}`, los dos con los mismos valores oscuros y color-scheme: dark.
  - No es invertir: bajá las superficies, aclará el acento cuando funciona como texto y mantené el hex original en las superficies grandes de marca.
- Si la marca usa rojo, el error no puede depender solo del color: lleva ícono y texto.

## 4. Plan de diseño (antes de escribir código)

Escribilo como comentario arriba del CSS:
- Color: qué rol cumple cada color de marca. Un acento dominante. El segundo color de marca cumple un solo rol (CTA, urgencia o premio).
- Tipo: la familia, una escala fluida con clamp() y qué peso se usa para qué. Mucho contraste de pesos, interletrado levemente negativo en titulares grandes y unos 65 caracteres de medida de lectura.
- Layout: una línea con el concepto y un wireframe ASCII del hero y las secciones.
- Momento: un único gesto memorable que salga del mundo de esta marca. Todo lo demás, quieto.

Revisá el plan: si para otra marca del mismo rubro te saldría lo mismo, es genérico y hay que cambiarlo. Evitá estos defaults salvo que te los pida:
- Fondo crema con serif y acento terracota.
- Casi negro con un único acento verde ácido.
- Estética de diario con filetes finos.
- Todo en tarjetas idénticas con la misma sombra y el mismo radio.
- Hero con gradiente violeta.
- Inter, Space Grotesk, Poppins o Montserrat (salvo que sean de la marca).
- Etiquetas en MAYÚSCULAS espaciadas arriba de cada título.
- Metadatos con punto medio en todos lados.
- Una flecha → en todos los botones.
- Numeración 01/02/03 en algo que no es una secuencia.
- Emojis como íconos.
- Todo centrado.
- Una sola palabra del titular resaltada en color.
- Fade-in en cada sección.

## 5. Construcción

- CSS moderno en capas (@layer reset, base, layout, componentes, utilidades). Hermanos con gap, no con márgenes sueltos. Escalas fijas de tipo y espacio, sin tamaños sueltos.
- Gutter lateral de max(16px, env(safe-area-inset-left/right)). Mobile first real: a 390px nada se sale ni genera scroll horizontal. Los hijos de flex o grid que tienen texto llevan min-width: 0.
- Hero dimensionado por su contenido, no 100vh. En el primer pantallazo se entiende qué es y qué hay que hacer.
- Tarjetas solo para lo que tiene que separarse del fondo. Radios por rol (control, tarjeta, pill), no uno para todo.
- Pasos numerados solo si el contenido es una secuencia real, como la mecánica de una promo.
- Para cada sección de una promo:
  - Hero con el premio o la foto de campaña, la promesa concreta, la condición clave, el CTA y la fecha de cierre.
  - Mecánica en 3 o 4 pasos que empiecen con verbo.
  - Premios en una grilla con el mismo aspect-ratio. En celular, un carrusel con scroll-snap. El premio mayor puede ocupar 2 columnas.
  - Formulario en una columna, con labels visibles, inputmode y autocomplete correctos, validación al salir del campo (:user-invalid) y un único CTA con verbo. La confirmación repite el verbo y dice qué sigue.
  - Ganadores con un estado vacío que diga cuándo se publican.
  - Bases y FAQ en `<details>`, con el texto legal íntegro.
  - Footer con los legales completos y contraste suficiente.
- Header sticky con top: env(safe-area-inset-top). Link para saltar al contenido, foco visible en todo, objetivos táctiles de 44px o más, `alt` real en las imágenes de contenido y alt="" en las decorativas.
- Imágenes con width y height, loading="lazy" salvo el hero (que va con fetchpriority="high"), y webp o avif si podés convertir. Fuentes en woff2 con font-display: swap y solo los pesos que se usan.
- Sin librerías para lo que CSS ya resuelve: details, dialog, :has(), container queries, color-mix(), scroll-snap y animation-timeline.
- Movimiento: un solo momento orquestado. Nada queda en opacity: 0 esperando un observer. Respetá prefers-reduced-motion.
- Copy en rioplatense si el sitio lo es (vos, sumá, tocá). Voz activa. El botón dice exactamente qué pasa ("Cargá tu ticket", no "Enviar"). Los errores dicen qué pasó y cómo arreglarlo, sin disculpas. Oraciones cortas. Nada de rayas para incisos ni de "no es X, es Y".

## 6. Verificación

- Sacá capturas de página completa a 390px y a 1440px, en claro y en oscuro si hay. Puede ser con Playwright o con lo que tengas. Miralas, corregí lo que se vea mal y repetí una vez.
- Chequeá que:
  - No haya scroll horizontal.
  - No haya imágenes rotas ni fuentes que no cargaron.
  - No haya errores de consola.
  - Ningún botón o link quede sin texto.
  - Se cumpla el contraste AA.
  - Los hex de marca estén intactos.
  - Los logos no estén deformados.
  - Los legales y datos sean idénticos al original.
- Si algo no lo pudiste verificar, decímelo explícitamente.

## 7. Entrega

- El sitio nuevo en una carpeta aparte (<proyecto>-v2/), sin pisar el original.
- Un resumen corto: qué se mantuvo, qué cambió y por qué, los avisos (contraste de la marca, imágenes pesadas, datos faltantes) y el antes y después en capturas.

# Checklist antes de entregar

## Marca
- [ ] Los hex de marca están intactos en logo, superficies de marca y acento.
- [ ] Los logos no están deformados ni recoloreados, y su versión es la correcta según el fondo.
- [ ] Las tipografías propias cargan: `capturas.cjs` no reporta fuentes fallidas y no hay fallback visible en las capturas.
- [ ] Los textos legales, fechas, premios y montos son idénticos al original, o quedaron marcados como faltantes.

## Diseño
- [ ] El plan está escrito y pasó la revisión de `anti-genericos.md`.
- [ ] Hay un único momento memorable y el resto está quieto.
- [ ] Hay al menos un detalle propio del rubro, mostrado como contenido.
- [ ] La escala tipográfica y la de espacios se respetan (no hay tamaños sueltos).
- [ ] Las tarjetas se usan solo donde algo se separa del fondo.

## Responsive y accesibilidad
- [ ] No hay scroll horizontal a 390px. Ningún elemento se sale del viewport.
- [ ] Contraste AA en texto y controles. Los avisos de `derivar_tokens.py` quedaron resueltos.
- [ ] El foco es visible y hay link para saltar al contenido.
- [ ] Todos los inputs tienen label. Todos los botones y links tienen texto accesible.
- [ ] Los objetivos táctiles miden 44px o más.
- [ ] Se respeta `prefers-reduced-motion`.
- [ ] En modo oscuro (si existe) no queda ningún color literal que solo funcione en claro.

## Performance
- [ ] Las imágenes tienen `width` y `height`, lazy salvo el hero, y ninguna supera 300KB sin aviso.
- [ ] Las fuentes van en woff2 con `font-display: swap`, solo con los pesos que se usan.
- [ ] No hay librerías para cosas que CSS ya resuelve.

## Entrega
- [ ] El trabajo está en una carpeta nueva y el original quedó intacto.
- [ ] Las rutas de los assets funcionan desde la carpeta nueva, sin recursos rotos.
- [ ] Se entrega un resumen de qué se mantuvo, qué cambió y qué avisos quedan.

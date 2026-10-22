#!/usr/bin/env python3
"""Deriva un sistema de tokens moderno a partir de los colores de marca, sin tocarlos.

- Cada color de marca queda EXACTO en su escalón más cercano (el hex original no se altera).
- Genera escalas 50-950 en OKLCH (pasos perceptualmente parejos, sin grises sucios).
- Neutros con el matiz del color principal (no gris puro).
- Calcula contraste WCAG y elige qué texto va sobre cada color, y qué escalón usar
  cuando el color de marca tiene que funcionar como texto sobre fondo claro u oscuro.
- Escribe tokens.css con tema claro + oscuro (o solo claro con --sin-oscuro).

Uso:
    python3 derivar_tokens.py --marca verde=#009343 --marca rojo=#F00023 [--tinta #14212b]
                              [--fondo #EBF0F0] [--sin-oscuro] [--out tokens.css]

La primera --marca es el acento principal.
"""
import argparse
import math
import sys

STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
STEP_L = [0.975, 0.94, 0.88, 0.80, 0.71, 0.62, 0.53, 0.45, 0.37, 0.29, 0.22]


# ---------- color math (sRGB <-> OKLCH) ----------
def hex_to_rgb(h):
    h = h.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6:
        raise ValueError(f"hex inválido: #{h}")
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


def rgb_to_hex(rgb):
    return "#" + "".join("%02x" % round(max(0, min(1, c)) * 255) for c in rgb)


def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def delin(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def rgb_to_oklch(rgb):
    r, g, b = (lin(c) for c in rgb)
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = (math.copysign(abs(x) ** (1 / 3), x) for x in (l, m, s))
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return L, math.hypot(A, B), math.degrees(math.atan2(B, A)) % 360


def oklch_to_rgb_raw(L, C, H):
    A, B = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
    m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
    s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return [delin(c) if c >= 0 else -delin(-c) for c in (r, g, b)]


def oklch_to_hex(L, C, H):
    # baja croma hasta entrar en gamut sRGB (mantiene luz y matiz)
    lo, hi = 0.0, C
    rgb = oklch_to_rgb_raw(L, C, H)
    if all(-1e-4 <= c <= 1 + 1e-4 for c in rgb):
        return rgb_to_hex(rgb)
    for _ in range(24):
        mid = (lo + hi) / 2
        if all(-1e-4 <= c <= 1 + 1e-4 for c in oklch_to_rgb_raw(L, mid, H)):
            lo = mid
        else:
            hi = mid
    return rgb_to_hex(oklch_to_rgb_raw(L, lo, H))


def luminance(h):
    r, g, b = (lin(c) for c in hex_to_rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


# ---------- escalas ----------
def scale(hex_, keep_exact=True):
    L0, C0, H0 = rgb_to_oklch(hex_to_rgb(hex_))
    out = {}
    for st, L in zip(STEPS, STEP_L):
        if L > L0:
            k = ((1 - L) / max(1e-3, 1 - L0)) ** 0.9
        else:
            k = (L / max(1e-3, L0)) ** 0.6
        out[st] = oklch_to_hex(L, C0 * k, H0)
    anchor = min(STEPS, key=lambda s: abs(STEP_L[STEPS.index(s)] - L0))
    if keep_exact:
        out[anchor] = "#" + hex_.lstrip("#").lower()
    return out, anchor, (L0, C0, H0)


def neutral_scale(hue, chroma=0.012):
    return {st: oklch_to_hex(L, chroma * (0.6 if L > 0.9 or L < 0.3 else 1), hue) for st, L in zip(STEPS, STEP_L)}


def first_passing(sc, bg, ratio, order):
    for st in order:
        if contrast(sc[st], bg) >= ratio:
            return st
    return order[-1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--marca", action="append", required=True, help="nombre=#hex (la primera es el acento)")
    ap.add_argument("--tinta", help="color de texto de la marca, si existe")
    ap.add_argument("--fondo", help="fondo claro de la marca, si existe")
    ap.add_argument("--matiz-neutro", type=float, help="matiz OKLCH de los neutros (default: el de --tinta, o el del acento)")
    ap.add_argument("--sin-oscuro", action="store_true")
    ap.add_argument("--out", default="tokens.css")
    a = ap.parse_args()

    brands = []
    for item in a.marca:
        if "=" not in item:
            sys.exit(f"--marca espera nombre=#hex, vino {item}")
        n, h = item.split("=", 1)
        brands.append((n.strip(), h.strip()))

    main_name, main_hex = brands[0]
    _, _, (Lm, Cm, Hm) = scale(main_hex)
    Hn = a.matiz_neutro
    if Hn is None and a.tinta:
        _, Ct, Ht = rgb_to_oklch(hex_to_rgb(a.tinta))
        Hn = Ht if Ct > 0.02 else Hm
    neu = neutral_scale(Hm if Hn is None else Hn)
    white = "#ffffff"
    ink = a.tinta or neu[950]
    bg_light = a.fondo or neu[50]
    bg_dark = neu[950]

    lines = ["/* Generado por derivar_tokens.py. Los hex de marca están intactos; el resto se deriva en OKLCH. */",
             ":root {"]
    report = []
    dark = []
    for name, hx in brands:
        sc, anchor, _ = scale(hx)
        for st in STEPS:
            lines.append(f"  --{name}-{st}: {sc[st]};")
        # a igualdad práctica se prefiere blanco (convención de casi todas las marcas)
        on = white if contrast(hx, white) + 0.3 >= contrast(hx, ink) else ink
        lines.append(f"  --{name}: {hx.lower()};            /* original, escalón {anchor} */")
        lines.append(f"  --sobre-{name}: {on};      /* texto sobre {name}: {contrast(hx, on):.2f}:1 */")
        # escalón para usar como texto sobre fondo claro / oscuro (AA 4.5)
        t_light = first_passing(sc, bg_light, 4.5, [s for s in STEPS if s >= 500])
        t_dark = first_passing(sc, bg_dark, 4.5, [s for s in reversed(STEPS) if s <= 500])
        lines.append(f"  --{name}-texto: var(--{name}-{t_light});")
        # fondo de botón con texto blanco legible (AA): el original si alcanza, si no el escalón más cercano que pase
        btn = first_passing(sc, white, 4.5, [s for s in STEPS if s >= anchor])
        lines.append(f"  --{name}-boton: var(--{name}-{btn});   /* blanco encima: {contrast(sc[btn], white):.2f}:1 */")
        dark.append(f"  --{name}-texto: var(--{name}-{t_dark});")
        report.append((name, hx, anchor, contrast(hx, white), contrast(hx, ink), on, t_light, t_dark, sc))
    for st in STEPS:
        lines.append(f"  --neutro-{st}: {neu[st]};")

    def sem(fondo, sup, sup2, texto, suave, borde):
        return [f"  --fondo: {fondo};", f"  --superficie: {sup};", f"  --superficie-2: {sup2};",
                f"  --texto: {texto};", f"  --texto-suave: {suave};", f"  --borde: {borde};"]

    lines += ["", "  /* roles: los componentes usan SOLO estos */"]
    lines += sem(bg_light, "#ffffff", neu[100], ink, neu[700], neu[200])
    lines += [f"  --acento: var(--{main_name});", f"  --sobre-acento: var(--sobre-{main_name});",
              f"  --acento-texto: var(--{main_name}-texto);",
              f"  --acento-boton: var(--{main_name}-boton);",
              "  --error: #c4001a;", "  --ok: #1a7f37;", "  --aviso: #9a5b00;",
              f"  --acento-suave: color-mix(in oklch, var(--{main_name}) 12%, var(--superficie));",
              "  --foco: var(--acento-texto);", "  color-scheme: light;", "}"]

    if not a.sin_oscuro:
        dk = sem(bg_dark, neu[900], neu[800], neu[50], neu[300], neu[800])
        dk += dark
        dk += ["  --error: #ff7a7a;", "  --ok: #5fd07d;", "  --aviso: #f0b45a;"]
        dk += [f"  --acento-suave: color-mix(in oklch, var(--{main_name}) 22%, var(--superficie));",
               "  color-scheme: dark;"]
        body = "\n".join("  " + l for l in dk)
        lines += ["", "@media (prefers-color-scheme: dark) {", '  :root:not([data-theme="light"]) {', body, "  }", "}",
                  ':root[data-theme="dark"] {', "\n".join(dk), "}"]

    with open(a.out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")

    print(f"# Tokens -> {a.out}\n")
    print(f"Neutros con matiz {(Hm if Hn is None else Hn):.0f}°")
    print(f"Tinta {ink} | fondo claro {bg_light} | fondo oscuro {bg_dark}\n")
    for name, hx, anchor, cw, ci, on, tl, td, sc in report:
        print(f"{name} {hx}: escalón {anchor}; contraste vs blanco {cw:.2f}, vs tinta {ci:.2f} -> texto encima: {on}")
        print(f"   como texto sobre claro usar {name}-{tl} ({sc[tl]}, {contrast(sc[tl], bg_light):.2f}:1); "
              f"sobre oscuro {name}-{td} ({sc[td]}, {contrast(sc[td], bg_dark):.2f}:1)")
        if max(cw, ci) < 4.5:
            print(f"   AVISO: ningún texto chico llega a 4.5:1 sobre {hx}. Con texto grande (>=24px o 19px bold) alcanza 3:1; "
                  f"para botones con texto chico usar --{name}-boton")
    print(f"\nTexto sobre fondo claro: {contrast(ink, bg_light):.2f}:1 | texto suave: {contrast(neu[700], bg_light):.2f}:1")


if __name__ == "__main__":
    main()

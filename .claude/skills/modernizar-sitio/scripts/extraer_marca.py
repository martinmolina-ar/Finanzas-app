#!/usr/bin/env python3
"""Inventario de marca de un sitio existente.

Recorre una carpeta (HTML, CSS, SVG, JS) y junta lo que el rediseño tiene que respetar:
colores (con frecuencia y nombre de variable CSS si lo hay), tipografías (@font-face,
font-family, Google Fonts), logos e imágenes (con dimensiones).

Uso:
    python3 extraer_marca.py <carpeta_del_sitio> [--out brand.json]

Imprime un resumen legible y escribe brand.json (lo consume derivar_tokens.py).
"""
import argparse
import colorsys
import json
import os
import re
import sys
from collections import Counter, defaultdict

TEXT_EXT = {".html", ".htm", ".css", ".scss", ".svg", ".js", ".jsx", ".ts", ".tsx", ".vue", ".php", ".liquid"}
IMG_EXT = {".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".svg"}
FONT_EXT = {".woff2", ".woff", ".ttf", ".otf", ".eot"}
SKIP_DIRS = {"node_modules", ".git", "__MACOSX", ".netlify", ".vercel", "dist", "build", ".next"}

HEX_RE = re.compile(r"#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b")
RGB_RE = re.compile(r"rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)")
VAR_RE = re.compile(r"(--[\w-]+)\s*:\s*([^;}{]+)")
FONTFACE_RE = re.compile(r"@font-face\s*{([^}]*)}", re.S)
FAMILY_RE = re.compile(r"font-family\s*:\s*([^;}\"]+(?:\"[^\"]*\"[^;}]*)*)")
GFONTS_RE = re.compile(r"fonts\.googleapis\.com/css2?\?([^\"')\s]+)")


def norm_hex(h):
    h = h.lstrip("#").lower()
    if len(h) in (3, 4):
        h = "".join(c * 2 for c in h)
    return "#" + h[:6]  # el alpha se descarta para agrupar


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def describe(h):
    r, g, b = (c / 255 for c in hex_to_rgb(h))
    hh, l, s = colorsys.rgb_to_hls(r, g, b)
    if s < 0.12 or l < 0.06 or l > 0.96:
        kind = "neutro"
    else:
        kind = "color"
    return kind, round(hh * 360), round(s, 2), round(l, 2)


def walk(root):
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS and not x.startswith("._")]
        for f in files:
            if f.startswith("._"):
                continue
            yield os.path.join(d, f)


def img_size(path):
    try:
        if path.endswith(".svg"):
            with open(path, encoding="utf-8", errors="ignore") as fh:
                head = fh.read(4000)
            vb = re.search(r'viewBox="([\d.\s-]+)"', head)
            if vb:
                p = vb.group(1).split()
                return f"{float(p[2]):g}x{float(p[3]):g} (viewBox)"
            return "svg"
        from PIL import Image  # opcional
        with Image.open(path) as im:
            return f"{im.width}x{im.height}"
    except Exception:
        return "?"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root")
    ap.add_argument("--out", default="brand.json")
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    if not os.path.isdir(root):
        sys.exit(f"No existe la carpeta {root}")

    colors = Counter()
    color_files = defaultdict(set)
    var_names = defaultdict(set)
    fontfaces, families, gfonts = [], Counter(), set()
    images, fonts, logos = [], [], []

    for path in walk(root):
        rel = os.path.relpath(path, root)
        ext = os.path.splitext(path)[1].lower()
        if ext in FONT_EXT:
            fonts.append(rel)
        if ext in IMG_EXT:
            entry = {"file": rel, "size": img_size(path), "kb": round(os.path.getsize(path) / 1024)}
            (logos if "logo" in rel.lower() or "isotipo" in rel.lower() or "brand" in rel.lower() else images).append(entry)
        if ext not in TEXT_EXT:
            continue
        try:
            txt = open(path, encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        # .min.js de terceros meten ruido
        if ext == ".js" and (".min." in rel or len(txt) > 400_000):
            continue
        for m in HEX_RE.finditer(txt):
            h = norm_hex(m.group(0))
            colors[h] += 1
            color_files[h].add(rel)
        for m in RGB_RE.finditer(txt):
            r, g, b = (min(255, int(x)) for x in m.groups()[:3])
            h = "#%02x%02x%02x" % (r, g, b)
            colors[h] += 1
            color_files[h].add(rel)
        for name, val in VAR_RE.findall(txt):
            for m in HEX_RE.finditer(val):
                var_names[norm_hex(m.group(0))].add(name)
        for body in FONTFACE_RE.findall(txt):
            fam = re.search(r"font-family\s*:\s*['\"]?([^;'\"]+)", body)
            w = re.search(r"font-weight\s*:\s*([^;]+)", body)
            st = re.search(r"font-style\s*:\s*([^;]+)", body)
            src = re.findall(r"url\(([^)]+)\)", body)
            fontfaces.append({
                "family": fam.group(1).strip() if fam else "?",
                "weight": w.group(1).strip() if w else "400",
                "style": st.group(1).strip() if st else "normal",
                "src": [s.strip("'\" ") for s in src],
                "in": rel,
            })
        for f in FAMILY_RE.findall(txt):
            f = re.sub(r"\s*!important\s*$", "", f.strip())
            if f and not f.startswith("var(") and f != "inherit":
                families[f] += 1
        for q in GFONTS_RE.findall(txt):
            gfonts.add(q)

    palette = []
    for h, n in colors.most_common():
        kind, hue, sat, lig = describe(h)
        palette.append({
            "hex": h, "usos": n, "tipo": kind, "hue": hue, "sat": sat, "luz": lig,
            "variables": sorted(var_names.get(h, [])), "archivos": sorted(color_files[h])[:5],
        })

    out = {
        "raiz": root,
        "colores": palette,
        "font_face": fontfaces,
        "font_family": [{"valor": k, "usos": v} for k, v in families.most_common()],
        "google_fonts": sorted(gfonts),
        "archivos_fuente": sorted(fonts),
        "logos": logos,
        "imagenes": sorted(images, key=lambda x: -x["kb"]),
    }
    with open(a.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)

    # Resumen
    print(f"# Inventario de marca: {root}\n")
    print("## Colores de marca (cromáticos, por uso)")
    for c in [p for p in palette if p["tipo"] == "color"][:14]:
        v = f"  {', '.join(c['variables'])}" if c["variables"] else ""
        print(f"  {c['hex']}  x{c['usos']:<4} h{c['hue']:>3} s{c['sat']:.2f} l{c['luz']:.2f}{v}")
    print("\n## Neutros (por uso)")
    for c in [p for p in palette if p["tipo"] == "neutro"][:8]:
        v = f"  {', '.join(c['variables'])}" if c["variables"] else ""
        print(f"  {c['hex']}  x{c['usos']:<4} l{c['luz']:.2f}{v}")
    print("\n## Tipografía")
    seen = set()
    for f in fontfaces:
        k = (f["family"], f["weight"], f["style"])
        if k not in seen:
            seen.add(k)
            print(f"  @font-face {f['family']} {f['weight']} {f['style']}  <- {', '.join(f['src'][:1])}")
    for f in out["font_family"][:6]:
        print(f"  font-family: {f['valor']}  (x{f['usos']})")
    for g in out["google_fonts"]:
        print(f"  Google Fonts: {g}")
    print("\n## Logos")
    for l in logos:
        print(f"  {l['file']}  {l['size']}  {l['kb']}KB")
    print(f"\n## Imágenes ({len(images)})")
    for i in out["imagenes"][:12]:
        flag = "  <- pesada, convertir a webp/avif" if i["kb"] > 300 else ""
        print(f"  {i['file']}  {i['size']}  {i['kb']}KB{flag}")
    print(f"\nEscrito {a.out}")


if __name__ == "__main__":
    main()

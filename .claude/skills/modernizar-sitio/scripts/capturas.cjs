#!/usr/bin/env node
/*
 Revisión visual de una página: capturas de pantalla completa en celular (390px) y escritorio (1440px),
 en claro y oscuro, y un reporte de problemas que se ven mal sin mirar:
 scroll horizontal, elementos que se salen del viewport, imágenes rotas, fuentes que no cargaron,
 errores de consola, botones/links sin texto accesible, objetivos táctiles chicos.

 Uso:
   node capturas.cjs <archivo.html | url> [carpeta_salida] [--solo-claro]
*/
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

function loadPlaywright() {
  try { return require("playwright"); } catch (_) {}
  const root = execSync("npm root -g").toString().trim();
  return require(path.join(root, "playwright"));
}

(async () => {
  const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
  const soloClaro = process.argv.includes("--solo-claro");
  if (!args[0]) { console.error("Uso: node capturas.cjs <archivo.html | url> [salida]"); process.exit(1); }
  const target = /^https?:/.test(args[0]) ? args[0] : "file://" + path.resolve(args[0]);
  const out = path.resolve(args[1] || "capturas");
  fs.mkdirSync(out, { recursive: true });

  const { chromium } = loadPlaywright();
  const launch = {};
  if (fs.existsSync("/opt/pw-browsers/chromium")) {
    // entorno remoto de Claude: usar el Chromium preinstalado si la versión de Playwright no coincide
    try { await chromium.launch().then(b => b.close()); } catch (_) {
      const dir = fs.readdirSync("/opt/pw-browsers").find(d => /^chromium-\d+$/.test(d));
      if (dir) launch.executablePath = path.join("/opt/pw-browsers", dir, "chrome-linux", "chrome");
    }
  }
  const browser = await chromium.launch(launch);
  const combos = [
    { name: "celular", width: 390, height: 844, mobile: true },
    { name: "escritorio", width: 1440, height: 900, mobile: false },
  ];
  const schemes = soloClaro ? ["light"] : ["light", "dark"];
  let problemas = 0;

  for (const c of combos) for (const scheme of schemes) {
    const ctx = await browser.newContext({
      viewport: { width: c.width, height: c.height }, deviceScaleFactor: c.mobile ? 2 : 1,
      isMobile: c.mobile, hasTouch: c.mobile, colorScheme: scheme,
    });
    const page = await ctx.newPage();
    const errores = [];
    page.on("console", m => { if (m.type() === "error") errores.push(m.text()); });
    page.on("pageerror", e => errores.push(String(e)));
    page.on("requestfailed", r => errores.push("No cargó: " + r.url()));
    await page.goto(target, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(400);

    const r = await page.evaluate(({ w, mobile }) => {
      const res = { overflowX: document.documentElement.scrollWidth - window.innerWidth, fuera: [], rotas: [], sinNombre: [], chicos: [], fuentes: [] };
      for (const el of document.querySelectorAll("body *")) {
        const b = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (b.width && (b.right > w + 1 || b.left < -1) && cs.position !== "fixed" && !el.closest("[data-scroll-x], .scroll-x")) {
          let p = el.parentElement, clipped = false;
          while (p) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") { clipped = true; break; } p = p.parentElement; }
          if (!clipped) res.fuera.push(el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""));
        }
      }
      for (const img of document.images) if (img.complete && img.naturalWidth === 0) res.rotas.push(img.getAttribute("src"));
      for (const el of document.querySelectorAll("a, button, [role=button]")) {
        const name = (el.getAttribute("aria-label") || el.textContent || "").trim() || (el.querySelector("img[alt]") || {}).alt;
        if (!name) res.sinNombre.push(el.outerHTML.slice(0, 80));
        if (mobile) { const b = el.getBoundingClientRect(); if (b.width && b.height && (b.height < 40 || b.width < 40) && getComputedStyle(el).display !== "inline") res.chicos.push((el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30) + ` (${Math.round(b.width)}x${Math.round(b.height)})`); }
      }
      if (document.fonts) for (const f of document.fonts) if (f.status === "error") res.fuentes.push(f.family + " " + f.weight);
      return res;
    }, { w: c.width, mobile: c.mobile });

    const file = path.join(out, `${c.name}-${scheme === "light" ? "claro" : "oscuro"}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const lista = [];
    if (r.overflowX > 0) lista.push(`scroll horizontal de ${r.overflowX}px`);
    if (r.fuera.length) lista.push(`se salen del viewport: ${[...new Set(r.fuera)].slice(0, 8).join(", ")}`);
    if (r.rotas.length) lista.push(`imágenes rotas: ${r.rotas.join(", ")}`);
    if (r.fuentes.length) lista.push(`fuentes que fallaron: ${r.fuentes.join(", ")}`);
    if (r.sinNombre.length) lista.push(`links/botones sin texto accesible: ${r.sinNombre.length}`);
    if (r.chicos.length) lista.push(`objetivos táctiles < 40px: ${r.chicos.slice(0, 6).join("; ")}${r.chicos.length > 6 ? "…" : ""}`);
    if (errores.length) lista.push(`consola: ${[...new Set(errores)].slice(0, 5).join(" | ")}`);
    problemas += lista.length;
    console.log(`\n${path.basename(file)}${lista.length ? "" : "  OK"}`);
    for (const l of lista) console.log("  - " + l);
    await ctx.close();
  }
  await browser.close();
  console.log(`\nCapturas en ${out}. ${problemas ? problemas + " avisos para revisar." : "Sin avisos."}`);
})().catch(e => { console.error(e); process.exit(1); });

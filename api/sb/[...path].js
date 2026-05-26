// api/sb/[...path].js
// Proxy limpio hacia Supabase — solo reenvía los headers necesarios.
// Así evitamos REQUEST_HEADER_TOO_LARGE (Vercel rewrite agrega headers propios).

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  try {
    const pathArr = req.query.path || [];
    const path = Array.isArray(pathArr) ? pathArr.join('/') : pathArr;
    const qIdx = req.url.indexOf('?');
    const qs = qIdx !== -1 ? req.url.slice(qIdx) : '';
    const url = `https://hjjtmzfvalhqhqokzume.supabase.co/${path}${qs}`;

    // Solo estos headers — sin x-forwarded-*, x-vercel-*, etc.
    const ALLOWED = ['apikey', 'authorization', 'content-type', 'accept', 'prefer', 'x-client-info', 'range'];
    const headers = {};
    for (const h of ALLOWED) {
      if (req.headers[h]) headers[h] = req.headers[h];
    }

    let body;
    if (!['GET', 'HEAD'].includes(req.method)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      if (buf.length > 0) body = buf;
    }

    const response = await fetch(url, { method: req.method, headers, body });

    // Reenviar headers de respuesta (salvo los que Node no acepta)
    const SKIP_RESP = ['transfer-encoding', 'connection', 'content-encoding'];
    response.headers.forEach((v, k) => {
      if (!SKIP_RESP.includes(k.toLowerCase())) {
        try { res.setHeader(k, v); } catch (_) {}
      }
    });

    const buffer = await response.arrayBuffer();
    res.status(response.status).send(Buffer.from(buffer));
  } catch (err) {
    console.error('[proxy] error:', err);
    res.status(502).json({ message: 'Proxy error: ' + String(err) });
  }
}

// api/sb-proxy.js
// Proxy limpio hacia Supabase — sin headers de Vercel (x-forwarded-*, x-vercel-*, etc.)
// La ruta llega en req.query._sbpath, el resto del query string va directo a Supabase.

export const config = { api: { bodyParser: false } };

const SUPABASE_URL = 'https://hjjtmzfvalhqhqokzume.supabase.co';
const ALLOWED_HEADERS = ['apikey', 'authorization', 'content-type', 'accept', 'prefer', 'x-client-info', 'range'];
const SKIP_RESP_HEADERS = ['transfer-encoding', 'connection', 'content-encoding'];

export default async function handler(req, res) {
  try {
    // El path viene del rewrite: /sb/rest/v1/foo → ?_sbpath=rest/v1/foo
    const rawPath = Array.isArray(req.query._sbpath)
      ? req.query._sbpath.join('/')
      : (req.query._sbpath || '');

    // Reconstruir query sin _sbpath para mandarlo a Supabase tal cual
    const fullUrl = new URL(req.url, 'http://localhost');
    fullUrl.searchParams.delete('_sbpath');
    const qs = fullUrl.search; // '' o '?select=*&...'

    const targetUrl = `${SUPABASE_URL}/${rawPath}${qs}`;

    // Solo headers que Supabase necesita — nada de Vercel
    const headers = {};
    for (const h of ALLOWED_HEADERS) {
      if (req.headers[h]) headers[h] = req.headers[h];
    }

    // Body para POST/PATCH/DELETE
    let body;
    if (!['GET', 'HEAD'].includes(req.method)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      if (buf.length > 0) body = buf;
    }

    const upstream = await fetch(targetUrl, { method: req.method, headers, body });

    // Reenviar headers de respuesta
    upstream.headers.forEach((v, k) => {
      if (!SKIP_RESP_HEADERS.includes(k.toLowerCase())) {
        try { res.setHeader(k, v); } catch (_) {}
      }
    });

    const buffer = await upstream.arrayBuffer();
    res.status(upstream.status).send(Buffer.from(buffer));
  } catch (err) {
    console.error('[sb-proxy] error:', err);
    res.status(502).json({ message: 'Proxy error: ' + String(err) });
  }
}

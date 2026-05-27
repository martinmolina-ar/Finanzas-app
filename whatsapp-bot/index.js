import 'dotenv/config';
import express from 'express';

// Log de inicio para diagnosticar en Railway
console.log('Iniciando servidor...');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'OK' : 'FALTA');
console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'OK' : 'FALTA');
console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? 'OK' : 'FALTA');
import twilio from 'twilio';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const app = express();

// Stripe webhook necesita el body raw
app.use('/stripe-webhook', express.raw({ type: 'application/json' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// CORS para la app
app.use((req, res, next) => {
  const allowed = ['https://www.pampa-app.ar', 'https://pampa-app.ar', (process.env.APP_URL || '').trim()].filter(Boolean);
  const origin = req.headers.origin || '';
  if (allowed.includes(origin) || !origin) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, prefer, x-client-info, range');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ─── STRIPE ────────────────────────────────────────────────────

// Crear sesión de pago
app.post('/create-checkout', async (req, res) => {
  const { type, userId, email } = req.body;

  const configs = {
    no_ads: {
      mode: 'payment',
      line_items: [{ price: process.env.STRIPE_NO_ADS_PRICE_ID, quantity: 1 }],
    },
    whatsapp: {
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_WHATSAPP_PRICE_ID, quantity: 1 }],
    },
  };

  const config = configs[type];
  if (!config) return res.status(400).json({ error: 'Tipo inválido' });

  try {
    const session = await stripe.checkout.sessions.create({
      ...config,
      payment_method_types: ['card'],
      success_url: `${process.env.APP_URL}?payment=success&type=${type}`,
      cancel_url: `${process.env.APP_URL}?payment=cancelled`,
      customer_email: email,
      client_reference_id: userId,
      metadata: { userId, type },
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook de Stripe — actualiza el plan en Supabase
app.post('/stripe-webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { userId, type } = session.metadata;

    if (type === 'no_ads') {
      await supabase.from('profiles')
        .upsert({ user_id: userId, no_ads: true }, { onConflict: 'user_id' });
    }

    if (type === 'whatsapp') {
      await supabase.from('profiles')
        .upsert({ user_id: userId, whatsapp_active: true, whatsapp_subscription_id: session.subscription }, { onConflict: 'user_id' });
    }
  }

  // Suscripción cancelada → desactivar WhatsApp
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const { data: profile } = await supabase
      .from('profiles').select('user_id').eq('whatsapp_subscription_id', sub.id).single();
    if (profile) {
      await supabase.from('profiles')
        .update({ whatsapp_active: false, whatsapp_subscription_id: null })
        .eq('user_id', profile.user_id);
    }
  }

  res.json({ received: true });
});

// ─── WHATSAPP BOT ───────────────────────────────────────────────

// Transacciones pendientes de confirmación: phone → { tx, date, expiresAt }
const pendingTxMap = new Map();
const PENDING_TTL_MS = 5 * 60 * 1000; // 5 minutos

// Limpieza periódica de pendientes expirados
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingTxMap) {
    if (now > v.expiresAt) pendingTxMap.delete(k);
  }
}, 60_000);

// Match fuzzy de cuenta: busca la cuenta cuyo nombre coincida mejor con lo que dijo el usuario
function matchAccount(txAccount, accountNames, messageText) {
  if (!accountNames.length) return txAccount;
  const msgLower = messageText.toLowerCase();

  // Si el usuario mencionó explícitamente "efectivo" y hay una cuenta con ese nombre
  if (/efectivo/i.test(msgLower)) {
    const efectivoAcc = accountNames.find(a => /efectivo/i.test(a));
    if (efectivoAcc) return efectivoAcc;
  }

  // Si la cuenta que sugirió la IA está en la lista (match exacto o parcial), usarla
  if (txAccount) {
    const exact = accountNames.find(a => a.toLowerCase() === txAccount.toLowerCase());
    if (exact) return exact;
    const partial = accountNames.find(a => a.toLowerCase().includes(txAccount.toLowerCase()) || txAccount.toLowerCase().includes(a.toLowerCase()));
    if (partial) return partial;
  }

  // Fallback: primera cuenta de la lista
  return accountNames[0];
}

async function parseTransaction(text, accounts = ['Efectivo'], defaultAccount = 'Efectivo') {
  const msg = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `Extraé los datos de esta transacción financiera y respondé SOLO con JSON válido, sin texto extra.

Mensaje: "${text}"

Cuentas disponibles del usuario: ${accounts.join(', ')}
Cuenta por defecto si no se especifica ninguna: ${defaultAccount}

REGLAS IMPORTANTES:
- Si el usuario menciona "efectivo" como forma de pago Y existe una cuenta llamada "Efectivo" en la lista, usá ESA cuenta.
- "method" y "account" son conceptos distintos: method es la forma de pago (débito/crédito/transferencia/efectivo), account es la cuenta bancaria.
- Si dice "pagué con débito/transferencia/tarjeta" pero no nombra una cuenta específica, usá la cuenta por defecto.
- amount debe ser el número exacto que aparece en el mensaje (ej: "1500" → 1500).
- Si no podés identificar algún campo usá valores por defecto sensatos.
- Si el mensaje no es una transacción respondé: {"error": "no es una transacción"}

JSON esperado:
{
  "type": "gasto" | "ingreso" | "transferencia",
  "amount": número entero sin decimales,
  "description": "descripción corta",
  "category": una de ["Comida","Alquiler","Servicios","Ocio","Transporte","Suscripciones","Salud","Varios","Sueldo","Ventas","Intereses","Regalo"],
  "method": "debito" | "credito" | "transferencia" | "efectivo",
  "account": una de las cuentas disponibles (exactamente como aparece en la lista)
}`
    }]
  });
  try { return JSON.parse(msg.content[0].text.trim()); }
  catch { return { error: 'parse_error' }; }
}

const CONFIRM_WORDS = new Set(['si', 'sí', 'yes', 'dale', 'ok', 'confirmar', 'confirmo', 'guardá', 'guarda', '👍', '✅']);
const CANCEL_WORDS  = new Set(['no', 'nope', 'cancelar', 'cancela', 'no guardes', '❌', '🙅']);

app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body?.trim();
  const twiml = new twilio.twiml.MessagingResponse();
  const reply = (msg) => { twiml.message(msg); res.type('text/xml').send(twiml.toString()); };

  if (!body) return reply('¿En qué te puedo ayudar? Mandame un gasto, ej: "gasté 3500 en almuerzo"');

  const phone = from.replace('whatsapp:', '');
  const { data: profile } = await supabase.from('profiles').select('user_id, whatsapp_active').eq('phone', phone).single();

  if (!profile) return reply(`No encontré tu cuenta. Vinculá tu número en la app:\n⚙️ Perfil → Vincular WhatsApp\n\nTu número: ${phone}`);
  if (!profile.whatsapp_active) return reply('Tu plan no incluye el bot de WhatsApp.\n\nActivalo desde la app por $1/mes 👉 Menú → Planes');

  const bodyLower = body.toLowerCase().trim();

  // ── Respuesta a confirmación pendiente ──────────────────────────
  const pending = pendingTxMap.get(phone);
  if (pending && Date.now() < pending.expiresAt) {
    if (CONFIRM_WORDS.has(bodyLower)) {
      pendingTxMap.delete(phone);
      const { tx, date } = pending;
      try {
        await supabase.from('transactions').insert({
          id: Date.now().toString(), user_id: profile.user_id,
          amount: tx.amount, description: tx.description, category: tx.category,
          account: tx.account, method: tx.method, type: tx.type,
          to_account: null, is_recurring: false,
          income_type: tx.type === 'ingreso' ? 'variable' : null, date,
        });
        const emoji = tx.type === 'ingreso' ? '✅' : '🔴';
        const sign  = tx.type === 'ingreso' ? '+' : '-';
        return reply(`${emoji} *Guardado*\n${sign}$${tx.amount.toLocaleString('es-AR')} · ${tx.description}\n📂 ${tx.category} · 🏦 ${tx.account}`);
      } catch (e) {
        console.error('Error guardando tx confirmada:', e);
        return reply('Hubo un error al guardar. Intentá de nuevo.');
      }
    }
    if (CANCEL_WORDS.has(bodyLower)) {
      pendingTxMap.delete(phone);
      return reply('Ok, lo descarto. Mandame otro movimiento cuando quieras.');
    }
    // Si no es ni sí ni no, ignora el pending y procesa como nuevo mensaje
    pendingTxMap.delete(phone);
  }

  // ── Obtener cuentas reales del usuario ───────────────────────────
  const { data: userAccounts } = await supabase.from('accounts').select('name').eq('user_id', profile.user_id);
  const accountNames = userAccounts?.map(a => a.name) || [];
  const defaultAccount = accountNames[0] || 'Efectivo';

  // ── Comandos especiales ──────────────────────────────────────────
  if (['resumen', 'balance'].includes(bodyLower)) {
    const today = new Date();
    const { data: txs } = await supabase.from('transactions').select('type, amount')
      .eq('user_id', profile.user_id)
      .gte('date', `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`);
    const income  = txs?.filter(t => t.type === 'ingreso').reduce((s,t) => s+t.amount, 0) || 0;
    const expense = txs?.filter(t => t.type === 'gasto').reduce((s,t) => s+t.amount, 0) || 0;
    return reply(`📊 *Resumen ${today.toLocaleString('es-AR',{month:'long'})}*\n\n✅ Ingresos: $${income.toLocaleString('es-AR')}\n🔴 Gastos: $${expense.toLocaleString('es-AR')}\n💰 Balance: $${(income-expense).toLocaleString('es-AR')}`);
  }

  // ── Parsear transacción ──────────────────────────────────────────
  let tx;
  try {
    tx = await parseTransaction(body, accountNames.length ? accountNames : ['Efectivo'], defaultAccount);
  } catch (e) {
    console.error('Error parseando:', e);
    return reply('Hubo un error procesando tu mensaje 😅 Intentá de nuevo en un momento.');
  }

  if (tx.error) return reply(`No entendí ese mensaje. Probá:\n• "gasté 2500 en almuerzo"\n• "cobré sueldo 150000"\n• "uber 1800 con efectivo"\n\nO escribí *resumen* para ver tu balance.`);

  // Post-proceso: verificar account con fuzzy match
  tx.account = matchAccount(tx.account, accountNames, body);

  // Guardar como pendiente y pedir confirmación
  const date = new Date().toISOString().split('T')[0];
  pendingTxMap.set(phone, { tx, date, expiresAt: Date.now() + PENDING_TTL_MS });

  const typeEmoji = tx.type === 'ingreso' ? '💰' : tx.type === 'transferencia' ? '↔️' : '💸';
  const sign = tx.type === 'ingreso' ? '+' : tx.type === 'transferencia' ? '' : '-';
  const methodLabel = { debito: 'débito', credito: 'crédito', transferencia: 'transferencia', efectivo: 'efectivo' }[tx.method] || tx.method;

  return reply(
    `${typeEmoji} *${tx.type === 'gasto' ? 'Gasto' : tx.type === 'ingreso' ? 'Ingreso' : 'Transferencia'}* de ${sign}$${tx.amount.toLocaleString('es-AR')}\n` +
    `📂 ${tx.category}\n` +
    `💳 ${methodLabel}\n` +
    `🏦 ${tx.account}\n` +
    `✏️ ${tx.description}\n\n` +
    `¿Lo guardo? Respondé *sí* o *no*.`
  );
});

// ─── MERCADO PAGO OAUTH ────────────────────────────────────────

const MP_CLIENT_ID = process.env.MP_CLIENT_ID;
const MP_CLIENT_SECRET = process.env.MP_CLIENT_SECRET;
const MP_REDIRECT_URI = process.env.MP_REDIRECT_URI; // ej: https://xxx.railway.app/mp-callback

// 1. Redirigir al usuario a MP para autorizar
app.get('/mp-auth', (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id requerido' });
  if (!MP_CLIENT_ID || !MP_REDIRECT_URI) return res.status(500).json({ error: 'MP no configurado' });

  const url = `https://auth.mercadopago.com/authorization?client_id=${MP_CLIENT_ID}&redirect_uri=${encodeURIComponent(MP_REDIRECT_URI)}&response_type=code&scope=read&state=${user_id}`;
  res.redirect(url);
});

// 2. Callback: MP nos manda el code, lo cambiamos por token y lo guardamos
app.get('/mp-callback', async (req, res) => {
  const { code, state: user_id } = req.query;
  const APP_URL = (process.env.APP_URL || '').trim();

  if (!code || !user_id) return res.redirect(`${APP_URL}?mp_error=missing_params`);

  try {
    const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: MP_CLIENT_ID,
        client_secret: MP_CLIENT_SECRET,
        code,
        redirect_uri: MP_REDIRECT_URI,
      }).toString()
    });

    const tokenData = await tokenRes.json();
    console.log('MP token response:', JSON.stringify(tokenData));

    if (tokenData.error || !tokenData.access_token) {
      const errMsg = encodeURIComponent(tokenData.message || tokenData.error || 'no_token');
      return res.redirect(`${APP_URL}?mp_error=${errMsg}`);
    }

    await supabase.from('profiles').upsert({
      user_id,
      mp_access_token: tokenData.access_token,
      mp_refresh_token: tokenData.refresh_token || null,
      mp_user_id: String(tokenData.user_id),
    }, { onConflict: 'user_id' });

    res.redirect(`${APP_URL}?mp_connected=true`);
  } catch (err) {
    console.error('MP callback error:', err);
    res.redirect(`${(process.env.APP_URL || '').trim()}?mp_error=server_error`);
  }
});

// 3. Desconectar MP
app.post('/mp-disconnect', async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id requerido' });
  await supabase.from('profiles').update({ mp_access_token: null, mp_refresh_token: null, mp_user_id: null }).eq('user_id', user_id);
  res.json({ ok: true });
});

// 4. Sync: usa el token guardado del usuario
app.get('/mp-sync', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id requerido' });

  const { data: profile } = await supabase.from('profiles').select('mp_access_token, mp_user_id, mp_dni').eq('user_id', user_id).single();
  if (!profile?.mp_access_token) return res.status(401).json({ error: 'MP no conectado' });

  const token = profile.mp_access_token;
  const mpUserId = String(profile.mp_user_id || '');
  const myDni = profile.mp_dni || null; // DNI guardado en primer sync

  try {
    const endDate = new Date().toISOString();
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const [paymentsRes, balanceRes] = await Promise.all([
      fetch(`https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&range=date_created&begin_date=${startDate}&end_date=${endDate}&limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }),
      fetch('https://api.mercadopago.com/v1/account/balance', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
    ]);

    const [paymentsData, balanceData] = await Promise.all([paymentsRes.json(), balanceRes.json()]);

    // mpUserId viene de la columna mp_user_id guardada en el OAuth callback
    const myMpId = mpUserId;
    console.log('My MP ID:', myMpId);
    console.log('Payments count:', paymentsData.results?.length);

    const balance =
      balanceData.available_balance ??
      balanceData.total_amount ??
      balanceData.own_money ??
      (Array.isArray(balanceData.accounts) ? balanceData.accounts.find(a => a.currency_id === 'ARS')?.available_balance : null) ??
      0;

    const payments = (paymentsData.results || [])
      .filter(p => ['approved', 'settled'].includes(p.status) && Math.abs(p.transaction_amount) > 0)
      .map(p => {
        const collectorId = String(p.collector?.id || '');
        const payerId = String(p.payer?.id || '');
        const op = p.operation_type;

        // Determinar tipo basado en la dirección real del dinero
        let type;
        if (op === 'account_fund') {
          if (payerId === myMpId && p.payment_type_id === 'bank_transfer') {
            type = 'transferencia'; // yo moví plata de mi banco a MP
          } else if (payerId === myMpId) {
            type = 'gasto'; // usé mi tarjeta para cargarle plata a alguien
          } else {
            type = 'ingreso'; // alguien me cargó plata a mí
          }
        } else if (op === 'money_transfer') {
          if (collectorId && collectorId !== myMpId) {
            type = 'gasto';    // yo mandé plata a alguien
          } else if (payerId && payerId !== myMpId) {
            type = 'ingreso';  // alguien me mandó plata
          } else {
            type = 'gasto';    // default: salida de plata
          }
        } else {
          // regular_payment, recurring_payment, etc.
          type = collectorId === myMpId ? 'ingreso' : 'gasto';
        }

        // Descripción inteligente: usar nombre del statement_descriptor si la desc es genérica
        const rawDesc = (p.description || '').trim();
        const stmtRaw = (p.statement_descriptor || '').trim();
        // Limpiar "MERPAGO * FLORENCIAVIVANASOSA" → "Florencia Vivana Sosa"
        const personName = stmtRaw
          .replace(/MERPAGO\s*\*\s*/i, '')
          .replace(/MERPAGO\s*/i, '')
          .trim()
          .toLowerCase()
          .replace(/\b\w/g, c => c.toUpperCase());

        const isGeneric = ['varios', 'var', 'bank transfer', ''].includes(rawDesc.toLowerCase());
        const desc = isGeneric && personName ? personName : (rawDesc || personName || 'Mercado Pago');

        // Categoría
        const descLow = desc.toLowerCase();
        const isRendimiento = descLow.includes('rendimiento') || descLow.includes('fondo') || descLow.includes('interest') || op === 'investment_return' || op === 'money_market';
        const category = type === 'transferencia' ? 'Transferencia'
          : isRendimiento ? 'Intereses'
          : type === 'ingreso' ? 'Ventas'
          : descLow.includes('suscripci') || descLow.includes('meli+') ? 'Suscripciones'
          : descLow.includes('edenor') || descLow.includes('edesur') || descLow.includes('aysa') || descLow.includes('metrogas') || descLow.includes('luz') || descLow.includes('gas') || descLow.includes('agua') ? 'Servicios'
          : descLow.includes('hospital') || descLow.includes('medic') || descLow.includes('farmaci') ? 'Salud'
          : descLow.includes('correo') || descLow.includes('andreani') || descLow.includes('oca ') ? 'Transporte'
          : 'Varios';

        const card = p.card || {};
        const cardLastFour = card.last_four_digits || null;
        const cardMethod = p.payment_method_id || null; // visa, mastercard, amex
        const cardHolderDni = card.cardholder?.identification?.number || null;
        // Es mi tarjeta si el DNI del titular coincide con el del usuario conectado
        const isOwnCard = !cardHolderDni || cardHolderDni === myDni;

        const method = p.payment_type_id === 'credit_card' ? 'credito'
          : p.payment_type_id === 'debit_card' ? 'debito'
          : p.payment_type_id === 'bank_transfer' ? 'transferencia'
          : 'efectivo';

        // Calcular monto real incluyendo comisiones de MP (fee_details)
        // CSV: REAL_AMOUNT = TRANSACTION_AMOUNT + FEE_AMOUNT (ambos negativos en gastos)
        // Para gastos: costo real = monto + comisión (lo que realmente salió del bolsillo)
        // Para ingresos: monto neto = monto - comisión (lo que realmente entró después de que MP cobró)
        // Para transferencias entre cuentas propias: sin comisión
        const totalFees = (p.fee_details || []).reduce((sum, f) => sum + Math.abs(f.amount || 0), 0);
        const baseAmount = Math.abs(p.transaction_amount);
        const realAmount = type === 'transferencia'
          ? baseAmount
          : type === 'ingreso'
            ? Math.max(0, baseAmount - totalFees) // ingreso neto luego de comisión MP
            : baseAmount + totalFees;              // gasto real incluyendo comisión MP

        return {
          id: `mp_${p.id}`,
          date: p.date_approved?.split('T')[0] || p.date_created?.split('T')[0],
          amount: realAmount,
          description: desc,
          type,
          method,
          category,
          // Info para que el frontend asigne la cuenta correcta
          cardLastFour,
          cardMethod,
          isOwnCard,
          paymentType: p.payment_type_id, // account_money, credit_card, bank_transfer
        };
      });

    // Auto-detectar DNI del usuario si no lo tenemos guardado
    let detectedDni = myDni;
    if (!detectedDni) {
      const dniCount = {};
      for (const p of paymentsData.results || []) {
        const dni = p.card?.cardholder?.identification?.number;
        if (dni) dniCount[dni] = (dniCount[dni] || 0) + 1;
      }
      detectedDni = Object.entries(dniCount).sort((a,b) => b[1]-a[1])[0]?.[0] || null;
      if (detectedDni) {
        await supabase.from('profiles').update({ mp_dni: detectedDni }).eq('user_id', user_id);
      }
    }
    // Recalcular isOwnCard con el DNI detectado
    const finalPayments = payments.map(p => ({
      ...p,
      isOwnCard: p.paymentType === 'credit_card' || p.paymentType === 'debit_card'
        ? (p.isOwnCard || false)
        : true, // account_money y bank_transfer siempre son del usuario
    }));

    res.json({ payments: finalPayments, balance, total: finalPayments.length });
  } catch (err) {
    console.error('MP sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── SUPABASE PROXY ────────────────────────────────────────────────────────────
// Proxy limpio a Supabase: solo reenvía los headers necesarios, sin x-forwarded-* de Vercel.
// Safari puede hacer las peticiones sin CORS preflight fallido (mismo origen via Railway).
const SUPABASE_BASE = 'https://hjjtmzfvalhqhqokzume.supabase.co';
const SB_ALLOWED_HEADERS = ['apikey', 'authorization', 'content-type', 'accept', 'prefer', 'x-client-info', 'range'];
const SB_SKIP_RESP = ['transfer-encoding', 'connection', 'content-encoding'];

app.all('/sb-proxy/*', async (req, res) => {
  try {
    const sbPath = req.params[0] || '';
    const qs = Object.keys(req.query).length ? '?' + new URLSearchParams(req.query).toString() : '';
    const targetUrl = `${SUPABASE_BASE}/${sbPath}${qs}`;

    const headers = {};
    for (const h of SB_ALLOWED_HEADERS) {
      if (req.headers[h]) headers[h] = req.headers[h];
    }

    let body;
    if (!['GET', 'HEAD'].includes(req.method) && req.body) {
      body = JSON.stringify(req.body);
      if (!headers['content-type']) headers['content-type'] = 'application/json';
    }

    const upstream = await fetch(targetUrl, { method: req.method, headers, body });

    upstream.headers.forEach((v, k) => {
      if (!SB_SKIP_RESP.includes(k.toLowerCase())) {
        try { res.setHeader(k, v); } catch (_) {}
      }
    });

    const buf = await upstream.arrayBuffer();
    res.status(upstream.status).send(Buffer.from(buf));
  } catch (err) {
    console.error('[sb-proxy] error:', err);
    res.status(502).json({ message: 'Proxy error: ' + String(err) });
  }
});

app.get('/health', (_, res) => res.json({ ok: true, env: { supabase: !!process.env.SUPABASE_URL, anthropic: !!process.env.ANTHROPIC_API_KEY, stripe: !!process.env.STRIPE_SECRET_KEY, mp: !!process.env.MP_ACCESS_TOKEN } }));

// Error handler global
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor corriendo en puerto ${PORT}`));

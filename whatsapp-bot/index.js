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
  res.header('Access-Control-Allow-Origin', (process.env.APP_URL || '*').trim());
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

async function parseTransaction(text, accounts = ['Efectivo'], defaultAccount = 'Efectivo') {
  const msg = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `Extraé los datos de esta transacción financiera y respondé SOLO con JSON válido, sin texto extra.

Mensaje: "${text}"

Cuentas disponibles del usuario: ${accounts.join(', ')}
Cuenta por defecto si no se especifica: ${defaultAccount}

JSON esperado:
{
  "type": "gasto" | "ingreso" | "transferencia",
  "amount": número entero sin decimales,
  "description": "descripción corta",
  "category": una de ["Comida","Alquiler","Servicios","Ocio","Transporte","Suscripciones","Salud","Varios","Sueldo","Ventas","Intereses","Regalo"],
  "method": "debito" | "credito" | "transferencia" | "efectivo",
  "account": una de las cuentas disponibles
}

IMPORTANTE: amount debe ser el número tal como aparece en el mensaje (ej: "1500" → 1500, no convertir a otras unidades).
Si no podés identificar algún campo usá valores por defecto sensatos.
Si el mensaje no es una transacción respondé: {"error": "no es una transacción"}`
    }]
  });
  try { return JSON.parse(msg.content[0].text.trim()); }
  catch { return { error: 'parse_error' }; }
}

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

  // Obtener cuentas reales del usuario
  const { data: userAccounts } = await supabase.from('accounts').select('name').eq('user_id', profile.user_id);
  const accountNames = userAccounts?.map(a => a.name) || [];
  const defaultAccount = accountNames[0] || 'Efectivo';

  if (['resumen', 'balance'].includes(body.toLowerCase())) {
    const today = new Date();
    const { data: txs } = await supabase.from('transactions').select('type, amount')
      .eq('user_id', profile.user_id)
      .gte('date', `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`);
    const income = txs?.filter(t => t.type === 'ingreso').reduce((s,t) => s+t.amount, 0) || 0;
    const expense = txs?.filter(t => t.type === 'gasto').reduce((s,t) => s+t.amount, 0) || 0;
    return reply(`📊 *Resumen ${today.toLocaleString('es-AR',{month:'long'})}*\n\n✅ Ingresos: $${income.toLocaleString()}\n🔴 Gastos: $${expense.toLocaleString()}\n💰 Balance: $${(income-expense).toLocaleString()}`);
  }

  const tx = await parseTransaction(body, accountNames.length ? accountNames : ['Efectivo'], defaultAccount);
  if (tx.error) return reply(`No entendí. Probá:\n• "gasté 2500 en almuerzo"\n• "cobré sueldo 150000"\n\nO escribí *resumen* para ver tu balance.`);

  const id = Date.now().toString();
  const date = new Date().toISOString().split('T')[0];
  await supabase.from('transactions').insert({ id, user_id: profile.user_id, amount: tx.amount, description: tx.description, category: tx.category, account: tx.account, method: tx.method, type: tx.type, to_account: null, is_recurring: false, income_type: tx.type === 'ingreso' ? 'variable' : null, date });

  const emoji = tx.type === 'ingreso' ? '✅' : '🔴';
  const sign = tx.type === 'ingreso' ? '+' : '-';
  reply(`${emoji} *${tx.description}*\n${sign} $${tx.amount.toLocaleString()} · ${tx.category}\n📅 ${date} · ${tx.account}\n\n_Guardado en FinanzasApp_`);
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

  const { data: profile } = await supabase.from('profiles').select('mp_access_token, mp_user_id').eq('user_id', user_id).single();
  if (!profile?.mp_access_token) return res.status(401).json({ error: 'MP no conectado' });

  const token = profile.mp_access_token;
  const mpUserId = String(profile.mp_user_id || '');

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
        // payer.id viene null en la API de MP — solo usamos collector
        // Si collector soy yo → ingreso (alguien me pagó)
        // Si collector es otro → gasto (yo pagué a alguien)
        const iAmCollector = myMpId && collectorId === myMpId;

        const isTransfer =
          p.operation_type === 'money_transfer' ||
          p.operation_type === 'account_fund';

        const type = isTransfer ? 'transferencia'
          : iAmCollector ? 'ingreso'
          : 'gasto'; // default: yo pagué

        const desc = p.description || p.statement_descriptor || p.payment_method_id || 'Mercado Pago';
        const category = isTransfer ? 'Transferencia'
          : type === 'gasto'
            ? (desc.toLowerCase().includes('suscripci') ? 'Suscripciones'
              : desc.toLowerCase().includes('luz') || desc.toLowerCase().includes('gas') || desc.toLowerCase().includes('agua') || desc.toLowerCase().includes('servicio') ? 'Servicios'
              : 'Varios')
          : 'Ventas';

        return {
          id: `mp_${p.id}`,
          date: p.date_approved?.split('T')[0] || p.date_created?.split('T')[0],
          amount: Math.abs(p.transaction_amount),
          description: desc,
          type,
          method: p.payment_type_id === 'credit_card' ? 'credito'
                  : p.payment_type_id === 'debit_card' ? 'debito'
                  : 'transferencia',
          category,
        };
      });

    const sampleP = paymentsData.results?.[0];
    res.json({
      payments, balance, total: payments.length,
      _debug: {
        myMpId,
        samplePayerId: sampleP?.payer?.id,
        sampleCollectorId: sampleP?.collector?.id,
        sampleAmount: sampleP?.transaction_amount,
        sampleDesc: sampleP?.description,
      }
    });
  } catch (err) {
    console.error('MP sync error:', err);
    res.status(500).json({ error: err.message });
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

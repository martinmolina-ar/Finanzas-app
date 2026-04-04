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
  res.header('Access-Control-Allow-Origin', process.env.APP_URL || '*');
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

async function parseTransaction(text) {
  const msg = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `Extraé los datos de esta transacción financiera y respondé SOLO con JSON válido, sin texto extra.

Mensaje: "${text}"

JSON esperado:
{
  "type": "gasto" | "ingreso" | "transferencia",
  "amount": número,
  "description": "descripción corta",
  "category": una de ["Comida","Alquiler","Servicios","Ocio","Transporte","Suscripciones","Salud","Varios","Sueldo","Ventas","Intereses","Regalo"],
  "method": "debito" | "credito" | "transferencia" | "efectivo",
  "account": "Galicia" | "Mercado Pago" | "Efectivo" | "Naranja X"
}

Si no podés identificar algún campo usá valores por defecto sensatos. Si el mensaje no es una transacción respondé: {"error": "no es una transacción"}`
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
  if (!profile.whatsapp_active) return reply('Tu plan no incluye el bot de WhatsApp.\n\nActivalo desde la app por $1/mes 👉 Perfil → Planes');

  if (['resumen', 'balance'].includes(body.toLowerCase())) {
    const today = new Date();
    const { data: txs } = await supabase.from('transactions').select('type, amount')
      .eq('user_id', profile.user_id)
      .gte('date', `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`);
    const income = txs?.filter(t => t.type === 'ingreso').reduce((s,t) => s+t.amount, 0) || 0;
    const expense = txs?.filter(t => t.type === 'gasto').reduce((s,t) => s+t.amount, 0) || 0;
    return reply(`📊 *Resumen ${today.toLocaleString('es-AR',{month:'long'})}*\n\n✅ Ingresos: $${income.toLocaleString()}\n🔴 Gastos: $${expense.toLocaleString()}\n💰 Balance: $${(income-expense).toLocaleString()}`);
  }

  const tx = await parseTransaction(body);
  if (tx.error) return reply(`No entendí. Probá:\n• "gasté 2500 en almuerzo"\n• "cobré sueldo 150000"\n\nO escribí *resumen* para ver tu balance.`);

  const id = Date.now().toString();
  const date = new Date().toISOString().split('T')[0];
  await supabase.from('transactions').insert({ id, user_id: profile.user_id, amount: tx.amount, description: tx.description, category: tx.category, account: tx.account, method: tx.method, type: tx.type, to_account: null, is_recurring: false, income_type: tx.type === 'ingreso' ? 'variable' : null, date });

  const emoji = tx.type === 'ingreso' ? '✅' : '🔴';
  const sign = tx.type === 'ingreso' ? '+' : '-';
  reply(`${emoji} *${tx.description}*\n${sign} $${tx.amount.toLocaleString()} · ${tx.category}\n📅 ${date} · ${tx.account}\n\n_Guardado en FinanzasApp_`);
});

app.get('/health', (_, res) => res.json({ ok: true, env: { supabase: !!process.env.SUPABASE_URL, anthropic: !!process.env.ANTHROPIC_API_KEY, stripe: !!process.env.STRIPE_SECRET_KEY } }));

// Error handler global
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor corriendo en puerto ${PORT}`));

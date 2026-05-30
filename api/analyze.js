// POST /api/analyze
// Body: { user_id, transactions, accounts, month, year }
// Returns: { analysis: string, data: {...} }

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).end();

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { transactions = [], accounts = [], month, year, userName = 'Usuario' } = req.body;

  // Filter current month and previous month transactions
  const targetMonth = month || new Date().getMonth() + 1;
  const targetYear = year || new Date().getFullYear();
  const prevMonth = targetMonth === 1 ? 12 : targetMonth - 1;
  const prevYear = targetMonth === 1 ? targetYear - 1 : targetYear;

  const currentMonthTxs = transactions.filter(t => {
    const [y, m] = t.date.split('-').map(Number);
    return y === targetYear && m === targetMonth;
  });

  const prevMonthTxs = transactions.filter(t => {
    const [y, m] = t.date.split('-').map(Number);
    return y === prevYear && m === prevMonth;
  });

  const fmt = n => `$${Math.round(n).toLocaleString('es-AR')}`;

  // Summarize by category
  const summarizeByCategory = (txs) => {
    const map = {};
    txs.filter(t => t.type === 'gasto').forEach(t => {
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8);
  };

  const currentIncome = currentMonthTxs.filter(t => t.type === 'ingreso').reduce((s, t) => s + t.amount, 0);
  const currentExpense = currentMonthTxs.filter(t => t.type === 'gasto').reduce((s, t) => s + t.amount, 0);
  const prevIncome = prevMonthTxs.filter(t => t.type === 'ingreso').reduce((s, t) => s + t.amount, 0);
  const prevExpense = prevMonthTxs.filter(t => t.type === 'gasto').reduce((s, t) => s + t.amount, 0);
  const currentCategories = summarizeByCategory(currentMonthTxs);
  const prevCategories = summarizeByCategory(prevMonthTxs);
  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const prompt = `Eres un asesor financiero personal amigable para la app Pampa (Argentina). Analizá los datos financieros de ${userName} para ${MONTHS[targetMonth-1]} ${targetYear} y dá un análisis claro, útil y motivador en español argentino (tuteo).

DATOS DE ${MONTHS[targetMonth-1].toUpperCase()} ${targetYear}:
- Ingresos: ${fmt(currentIncome)}
- Gastos: ${fmt(currentExpense)}
- Ahorro: ${fmt(currentIncome - currentExpense)} (${currentIncome > 0 ? ((1 - currentExpense/currentIncome)*100).toFixed(0) : 0}% de ahorro)
- Gastos por categoría: ${currentCategories.map(([c,v]) => `${c}: ${fmt(v)}`).join(', ')}

DATOS DE ${MONTHS[prevMonth-1].toUpperCase()} ${prevYear}:
- Ingresos: ${fmt(prevIncome)}
- Gastos: ${fmt(prevExpense)}
- Gastos por categoría: ${prevCategories.map(([c,v]) => `${c}: ${fmt(v)}`).join(', ')}

Respondé con un JSON con esta estructura EXACTA (sin markdown, solo JSON puro):
{
  "titulo": "Análisis de [Mes]",
  "resumen": "2-3 oraciones resumiendo el mes en tono positivo y directo",
  "highlights": [
    { "tipo": "positivo|negativo|neutro", "texto": "observación corta y específica" }
  ],
  "categoriaDestacada": { "nombre": "categoria con más gasto", "monto": numero, "comparacion": "texto comparando con mes anterior" },
  "consejo": "1 consejo accionable y concreto para el próximo mes",
  "score": numero del 1 al 10 que califica el mes financiero
}

Máximo 4 highlights. Sé específico con números. Tono amigable pero directo.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Anthropic API error');

    const text = data.content[0].text;
    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid response format');
    const analysis = JSON.parse(jsonMatch[0]);

    res.json({ ok: true, analysis, month: targetMonth, year: targetYear });
  } catch (err) {
    console.error('[analyze] error:', err);
    res.status(500).json({ error: err.message });
  }
}

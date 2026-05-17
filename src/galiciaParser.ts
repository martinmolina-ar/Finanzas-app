import * as XLSX from 'xlsx';

export interface ParsedTx {
  id: string;
  date: string;
  amount: number;
  description: string;
  type: 'gasto' | 'ingreso' | 'transferencia';
  method: 'debito' | 'credito' | 'transferencia' | 'efectivo';
  category: string;
  account: string;
  currency: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const parseArgNum = (s: string | number | null | undefined): number => {
  if (!s) return 0;
  return parseFloat(String(s).replace(/\./g, '').replace(',', '.')) || 0;
};

// DD/MM/YYYY → YYYY-MM-DD
const parseXLSXDate = (s: string): string => {
  const [d, m, y] = s.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

// DD-MM-YY → 20YY-MM-DD
const parsePDFDate = (s: string): string => {
  const [d, m, y] = s.split('-');
  return `20${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

const uid = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const categorizeMerchant = (desc: string): string => {
  const d = desc.toLowerCase();
  if (/uber|cabify|sube|transporte|peaje|ypf|shell|axion|combust|nafta|bp /.test(d)) return 'Transporte';
  if (/rappi|pedidos|mcdonalds|burger|carrefour|disco|jumbo|coto|market|kiosco|panaderia|restaurant|pizz|sushi|jevi|super|almacen|fiamb|verdur|minimarket/.test(d)) return 'Comida';
  if (/netflix|spotify|amazon|disney|hbo|youtube|apple|claude|openai|meli\+|paramount|shein|chatgpt/.test(d)) return 'Suscripciones';
  if (/farmaci|medic|hospital|clinica|salud|ihelp/.test(d)) return 'Salud';
  if (/edenor|edesur|aysa|metrogas|movistar|claro|personal|telecom|internet|fibertel/.test(d)) return 'Servicios';
  if (/cine|teatro|arena|show|evento|hoyts|carp|racing|boca|river|futbol|musica|concierto/.test(d)) return 'Ocio';
  if (/alquiler|expensas|inmobil/.test(d)) return 'Alquiler';
  return 'Varios';
};

// ── XLSX parser (extracto cuenta banco) ─────────────────────────────────────

export const parseGaliciaXLSX = async (
  file: File,
  accountName: string,
  currency: string
): Promise<ParsedTx[]> => {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });

  // Find the header row
  const headerIdx = rows.findIndex((r) => String(r[0]).trim() === 'Fecha');
  if (headerIdx === -1) throw new Error('No se encontró la fila de encabezados en el XLSX');

  const results: ParsedTx[] = [];

  for (const r of rows.slice(headerIdx + 1)) {
    const dateStr = String(r[0] || '').trim();
    if (!/\d{2}\/\d{2}\/\d{4}/.test(dateStr)) continue;

    const date = parseXLSXDate(dateStr);
    const movRaw = String(r[1] || '').trim();
    const lines = movRaw.split('\n').map((l) => l.trim()).filter(Boolean);
    const typeLine = (lines[0] || '').toUpperCase();
    const nameLine = lines[1] || '';

    const debito = parseArgNum(r[2]);
    const credito = parseArgNum(r[3]);
    const amount = Math.max(debito, credito);
    if (amount === 0) continue;

    let type: ParsedTx['type'];
    let method: ParsedTx['method'];
    let category: string;
    let desc: string;

    if (typeLine.includes('PAGO TARJETA')) {
      type = 'transferencia'; method = 'transferencia'; category = 'Transferencia';
      const card = typeLine.includes('VISA') ? 'Galicia Visa' : typeLine.includes('AMEX') ? 'Galicia Amex' : 'Tarjeta';
      desc = `Pago ${card}`;
    } else if (typeLine.includes('COMPRA DEBITO')) {
      type = 'gasto'; method = 'debito';
      desc = nameLine.replace(/MERPAGO\s*\*\s*/gi, '').replace(/4517\w+/g, '').trim() || typeLine;
      category = categorizeMerchant(desc);
    } else if (typeLine.includes('PAGO EN TRANSPORTE') || typeLine.includes('SUBE')) {
      type = 'gasto'; method = 'debito'; category = 'Transporte';
      desc = 'SUBE';
    } else if (typeLine.includes('TRANSFERENCIA A TERCEROS')) {
      type = 'gasto'; method = 'transferencia'; category = 'Varios';
      desc = nameLine || 'Transferencia enviada';
    } else if (
      typeLine.includes('TRANSFERENCIA DE TERCEROS') ||
      typeLine.includes('CREDITO TRANSFERENCIA') ||
      typeLine.includes('TRANSFERENCIA COELSA')
    ) {
      type = 'ingreso'; method = 'transferencia'; category = 'Ventas';
      desc = nameLine || 'Transferencia recibida';
    } else if (typeLine.includes('EXTRACCION') || typeLine.includes('EXTRACCIÓN')) {
      type = 'gasto'; method = 'efectivo'; category = 'Varios';
      desc = 'Extracción ATM';
    } else if (typeLine.includes('RENDIMIENTO')) {
      type = 'ingreso'; method = 'transferencia'; category = 'Intereses';
      desc = 'Rendimiento';
    } else if (typeLine.includes('DEP.EFVO') || typeLine.includes('DEPOSITO EFECTIVO')) {
      type = 'ingreso'; method = 'efectivo'; category = 'Ventas';
      desc = 'Depósito efectivo';
    } else if (
      typeLine.includes('COMPRA VENTA') ||
      typeLine.includes('COMPRA MONEDA') ||
      typeLine.includes('VENTA MONEDA')
    ) {
      type = 'transferencia'; method = 'transferencia'; category = 'Transferencia';
      desc = 'Compra/Venta divisas';
    } else if (debito > 0) {
      type = 'gasto'; method = 'debito';
      desc = nameLine || typeLine;
      category = categorizeMerchant(desc);
    } else {
      type = 'ingreso'; method = 'transferencia';
      desc = nameLine || typeLine;
      category = 'Ventas';
    }

    results.push({
      id: uid('gal'),
      date,
      amount,
      description: desc.substring(0, 60),
      type,
      method,
      category,
      account: accountName,
      currency,
    });
  }

  return results;
};

// ── PDF parser (resumen tarjeta Visa/Amex) ───────────────────────────────────

export const parseGaliciaPDF = async (
  file: File,
  accountName: string
): Promise<ParsedTx[]> => {
  const pdfjsLib = await import('pdfjs-dist');
  // Use CDN worker to avoid bundling issues
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await (pdfjsLib as any).getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

  type Item = { x: number; y: number; str: string };
  const allPageLines: string[][] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Group by rounded y (within 3-unit tolerance)
    const lineMap = new Map<number, Item[]>();
    for (const raw of content.items) {
      const item = raw as any;
      if (!item.str?.trim()) continue;
      const iy = Math.round(item.transform[5]);
      let key = iy;
      for (const [ky] of lineMap) {
        if (Math.abs(ky - iy) <= 3) { key = ky; break; }
      }
      if (!lineMap.has(key)) lineMap.set(key, []);
      lineMap.get(key)!.push({ x: item.transform[4], y: iy, str: item.str });
    }

    // Sort top→bottom, left→right within each line
    const sortedLines = [...lineMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) => items.sort((a, b) => a.x - b.x).map((i) => i.str));

    allPageLines.push(...sortedLines);
  }

  const transactions: ParsedTx[] = [];
  const DATE_RE = /^\d{2}-\d{2}-\d{2}$/;
  const AMOUNT_RE = /^[\d.]+,\d{2}$/;
  const CUOTA_RE = /^\d{2}\/\d{2}$/;
  const COMPROBANTE_RE = /^\d{5,}$/;
  const SKIP_RE = /Total Consumos|TOTAL A PAGAR|SALDO ANTERIOR|SU PAGO|CONSOLIDADO|Página|Resumen N°|CNEL|CUIT|Sucursal|Monotributo|MARTIN MOLINA|N° Cuenta|Tarjeta Créd|AMERICAN EXPRESS|VISA$/i;
  const TAX_RE = /IMPUESTO|IIBB|IVA RG|DB\.RG|SELLO/i;

  for (const lineTokens of allPageLines) {
    const tokens = lineTokens.map((s) => s.trim()).filter(Boolean);
    if (!tokens.length) continue;

    // Check if first token is a date
    if (!DATE_RE.test(tokens[0])) continue;
    const lineStr = tokens.join(' ');
    if (SKIP_RE.test(lineStr)) continue;

    // Taxes at end of statement — still real charges, import them
    const isTax = TAX_RE.test(lineStr);

    // Find amount token
    const amountIdx = tokens.map((t, i) => ({ t, i }))
      .filter(({ t }) => AMOUNT_RE.test(t))
      .pop()?.i ?? -1;
    if (amountIdx === -1) continue;

    const amount = parseArgNum(tokens[amountIdx]);
    if (amount <= 0) continue;

    const date = parsePDFDate(tokens[0]);

    // Build description from remaining tokens
    const descTokens = tokens.slice(1, amountIdx).filter(
      (t) =>
        t !== '*' &&
        t !== 'K' &&
        t !== 'USD' &&
        !CUOTA_RE.test(t) &&
        !COMPROBANTE_RE.test(t) &&
        !AMOUNT_RE.test(t) &&
        !/^\d+,\d{2}$/.test(t)
    );

    let desc = descTokens
      .join(' ')
      .replace(/MERPAGO\s*\*\s*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    let category: string;
    if (isTax) {
      desc = desc || 'Impuesto tarjeta';
      category = 'Servicios';
    } else {
      if (!desc) desc = 'Consumo tarjeta';
      category = categorizeMerchant(desc);
    }

    transactions.push({
      id: uid('cc'),
      date,
      amount,
      description: desc.substring(0, 60),
      type: 'gasto',
      method: 'credito',
      category,
      account: accountName,
      currency: 'ARS',
    });
  }

  return transactions;
};

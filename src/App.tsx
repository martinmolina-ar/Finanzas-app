import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import * as XLSX from 'xlsx';
import { supabase } from './supabase';
import { parseGaliciaXLSX, parseGaliciaPDF, type ParsedTx } from './galiciaParser';
import { requestNotificationPermission, checkBudgetAlerts } from './notifications';
import { AdBanner } from './AdBanner';
import { UpgradeModal } from './UpgradeModal';
import {
  Plus, Wallet, TrendingUp, PieChart, LayoutDashboard, X,
  ArrowLeft, Settings, HelpCircle, User, Calculator, ArrowDownLeft,
  ArrowUpRight, Pencil, Search, Users,
  ChevronLeft, ChevronRight, ShoppingBag, Car, Home, Zap, Coffee,
  Smartphone, Gift, Lock, Flame, CheckCircle2, ArrowRightLeft,
  Calendar, Percent, BarChart3, Trash2, LogOut,
  Eye, EyeOff, Mail, Lock as LockIcon, Send, Moon, Bell, Camera,
  AlertTriangle, Filter, CreditCard, Banknote, PiggyBank, Target,
  DollarSign, RefreshCw, Activity, Upload
} from 'lucide-react';

// --- LOGO PAMPA (El Hornero — ave nacional argentina) ---

const PampaLogo = ({ size = 56 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="pampaBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7c3aed" />
        <stop offset="100%" stopColor="#5b21b6" />
      </linearGradient>
    </defs>
    {/* Background */}
    <rect width="100" height="100" rx="22" fill="url(#pampaBg)" />

    {/* ── Hornero bird (facing left, white + golden beak) ── */}

    {/* Body */}
    <ellipse cx="53" cy="57" rx="25" ry="18" fill="white" />
    {/* Head */}
    <circle cx="34" cy="40" r="15" fill="white" />
    {/* Tail — upswept right */}
    <path d="M76 52 Q90 40 87 60 Q81 57 76 55 Z" fill="white" />

    {/* Wing — subtle shadow overlay */}
    <ellipse cx="56" cy="53" rx="20" ry="11" fill="rgba(91,33,182,0.18)" transform="rotate(-10 56 53)" />

    {/* Beak — golden, pointing left */}
    <path d="M21 38 L9 34 L9 44 Z" fill="#fbbf24" />

    {/* Eye */}
    <circle cx="29" cy="37" r="3.5" fill="#3b0764" />
    <circle cx="28" cy="36" r="1.3" fill="white" />

    {/* Throat stripe (characteristic hornero marking) */}
    <path d="M26 47 Q34 52 42 49" stroke="rgba(91,33,182,0.25)" strokeWidth="3" strokeLinecap="round" fill="none" />

    {/* Legs */}
    <line x1="46" y1="74" x2="42" y2="86" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="56" y1="75" x2="59" y2="86" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    {/* Feet */}
    <line x1="42" y1="86" x2="35" y2="89" stroke="white" strokeWidth="2" strokeLinecap="round" />
    <line x1="42" y1="86" x2="45" y2="90" stroke="white" strokeWidth="2" strokeLinecap="round" />
    <line x1="59" y1="86" x2="53" y2="89" stroke="white" strokeWidth="2" strokeLinecap="round" />
    <line x1="59" y1="86" x2="62" y2="90" stroke="white" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// --- TIPOS ---

const INITIAL_USER = { name: "Martin", email: "martin@demo.com", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Martin" };
const ESTIMATED_SALARY = 850000;

type TransactionType = 'ingreso' | 'gasto' | 'transferencia';
type IncomeType = 'fijo' | 'variable';
type PaymentMethod = 'debito' | 'credito' | 'transferencia' | 'efectivo';
type Currency = 'ARS' | 'USD' | 'BRL' | 'EUR' | 'UYU' | 'CLP' | 'COP' | 'VES';
type AccountType = 'gastos' | 'ahorro' | 'credito' | 'efectivo';

const CURRENCY_SYMBOLS: Record<string, string> = {
  ARS: '$', USD: 'U$S', BRL: 'R$', EUR: '€',
  UYU: '$U', CLP: 'CLP$', COP: 'COP$', VES: 'Bs.'
};
const CURRENCY_FLAGS: Record<string, string> = {
  ARS: '🇦🇷', USD: '🇺🇸', BRL: '🇧🇷', EUR: '🇪🇺',
  UYU: '🇺🇾', CLP: '🇨🇱', COP: '🇨🇴', VES: '🇻🇪'
};

interface Transaction {
  id: string;
  amount: number;
  description: string;
  category: string;
  account: string;
  toAccount?: string;
  method: PaymentMethod;
  type: TransactionType;
  incomeType?: IncomeType;
  isRecurring?: boolean;
  date: string;
}

interface AccountItem {
  id: string;
  name: string;
  provider: string;
  initialBalance: number;
  limit?: number;
  type: AccountType;
  currency: Currency;
  lastFour?: string;
}

interface Budget {
  category: string;
  limit: number;
}

interface Debt {
  id: string;
  person: string;
  concept: string;
  originalAmount: number;
  remainingAmount: number;
  type: 'me_deben' | 'les_debo';
  date: string;
  currency: Currency;
}

interface Habit {
  id: string;
  name: string;
  emoji: string;
  color: string;
  frequency: 'daily' | 'weekly';
  createdAt: string;
}

interface HabitLog {
  id: string;
  habitId: string;
  date: string;
}

type Investment = {
  id: string;
  user_id: string;
  name: string;
  type: 'crypto' | 'stock' | 'etf' | 'fund' | 'asset' | 'other';
  ticker?: string;
  quantity: number;
  purchase_price: number;
  current_price?: number;
  currency: string;
  notes?: string;
};

const HABIT_COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

interface DolarRates {
  blue: number;
  oficial: number;
  mep: number;
  fx: Record<string, number>; // ARS por 1 unidad de moneda extranjera
  updatedAt: string;
}

// --- ERRORES EN CASTELLANO ---
const traducirError = (msg: string): string => {
  const errores: Record<string, string> = {
    'Invalid login credentials': 'Email o contraseña incorrectos',
    'Email not confirmed': 'Confirmá tu email antes de ingresar. Revisá tu bandeja de entrada',
    'User already registered': 'Ya existe una cuenta con ese email',
    'email rate limit exceeded': 'Demasiados intentos. Esperá unos minutos y volvé a intentarlo',
    'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres',
    'Unable to validate email address: invalid format': 'El formato del email no es válido',
    'signup_disabled': 'El registro está deshabilitado temporalmente',
    'Email already registered': 'Ya existe una cuenta con ese email',
    'Auth session missing': 'Sesión expirada. Volvé a iniciar sesión',
    'New password should be different from the old password': 'La nueva contraseña debe ser diferente a la actual',
    'For security purposes, you can only request this after': 'Por seguridad, esperá unos segundos antes de intentar nuevamente',
  };
  for (const [key, value] of Object.entries(errores)) {
    if (msg.toLowerCase().includes(key.toLowerCase())) return value;
  }
  return msg; // Si no hay traducción, mostrar el original
};

// --- FORMATO ARGENTINO ---
// "1500.50" → "1.500,50" (para mostrar)
const fmtARS = (num: number): string => {
  const [int, dec] = num.toFixed(2).split('.');
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec === '00' ? intFmt : `${intFmt},${dec}`;
};

// Input mientras el usuario escribe: acepta dígitos y una coma, agrega puntos automáticamente
const formatInput = (raw: string): string => {
  const clean = raw.replace(/[^0-9,]/g, '');
  const [intPart, decPart] = clean.split(',');
  const intFmt = (intPart || '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decPart !== undefined ? `${intFmt},${decPart.slice(0, 2)}` : intFmt;
};

// "1.500,50" → 1500.50 (para guardar en DB)
const parseInput = (display: string): number => {
  return Number(display.replace(/\./g, '').replace(',', '.')) || 0;
};

// --- CONSTANTES ---

const ACCOUNT_LABELS: Record<AccountType, string> = {
  'gastos': 'Cuenta Bancaria', 'ahorro': 'Ahorro', 'credito': 'Tarjeta de Crédito', 'efectivo': 'Efectivo'
};

const ACCOUNT_TYPE_ICONS: Record<AccountType, any> = {
  'gastos': Wallet,
  'ahorro': PiggyBank,
  'credito': CreditCard,
  'efectivo': Banknote,
};

const BANK_CONFIG: Record<string, { color: string, bg: string, label: string }> = {
  'Galicia': { color: '#FF6C0C', bg: 'bg-orange-100', label: 'Galicia' },
  'Mercado Pago': { color: '#009EE3', bg: 'bg-blue-100', label: 'Mercado Pago' },
  'Naranja X': { color: '#FF4D00', bg: 'bg-orange-50', label: 'Naranja X' },
  'Lemon': { color: '#00F068', bg: 'bg-green-100', label: 'Lemon Cash' },
  'Efectivo': { color: '#1D1D1F', bg: 'bg-gray-100', label: 'Efectivo' },
  'Santander': { color: '#EC0000', bg: 'bg-red-100', label: 'Santander' },
  'BBVA': { color: '#004481', bg: 'bg-blue-50', label: 'BBVA' },
  'Brubank': { color: '#6F2CFF', bg: 'bg-purple-100', label: 'Brubank' },
  'Dólar Colchón': { color: '#10B981', bg: 'bg-emerald-100', label: 'Caja Fuerte' },
  'Crypto': { color: '#F7931A', bg: 'bg-orange-50', label: 'Billetera Crypto' },
  'Inversion': { color: '#4F46E5', bg: 'bg-indigo-100', label: 'Inversión' },
  'Default': { color: '#6B7280', bg: 'bg-gray-100', label: 'Otro' }
};

const CATEGORIES: Record<TransactionType, string[]> = {
  gasto: ['Comida', 'Alquiler', 'Servicios', 'Ocio', 'Transporte', 'Suscripciones', 'Salud', 'Varios', 'Pago de deuda'],
  ingreso: ['Sueldo', 'Ventas', 'Intereses', 'Regalo', 'Cobro de deuda', 'Préstamo recibido'],
  transferencia: ['Ahorro', 'Pago Tarjeta', 'Movimiento']
};

const CHART_COLORS = ['#FF6C0C', '#009EE3', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1'];

const CATEGORY_EMOJI: Record<string, string> = {
  'Comida': '🍔', 'Alquiler': '🏠', 'Servicios': '⚡', 'Ocio': '🛍️',
  'Transporte': '🚗', 'Suscripciones': '📱', 'Salud': '🏥', 'Varios': '📦',
  'Sueldo': '💼', 'Ventas': '💰', 'Intereses': '📈', 'Regalo': '🎁',
  'Ahorro': '🔒', 'Movimiento': '↔️', 'Pago Tarjeta': '💳', 'Ajuste': '⚙️',
  'Pago de deuda': '🤝', 'Cobro de deuda': '💵', 'Préstamo recibido': '📥', 'Préstamo otorgado': '📤',
};
const getCategoryEmoji = (category: string, overrides?: Record<string, string>): string =>
  overrides?.[category] || CATEGORY_EMOJI[category] || '📋';

/** Emoji con tinte violeta de marca */
const VE = ({ e, className = '' }: { e: string; className?: string }) => (
  <span className={`emoji-vi${className ? ' ' + className : ''}`}>{e}</span>
);

// Emojis disponibles para picker
const EMOJI_LIST = [
  '🍔','🍕','☕','🍷','🎂','🏠','🚗','✈️','🚌','👗','💊','🏥','📚','🎮','⚡','📱',
  '🎁','🛒','💼','📈','💵','💰','🔒','🤝','🏋️','🎵','⚽','🔧','🎓','💻','📷','🎸',
  '🌍','👶','🐷','🎪','🛍️','🚀','🎬','🐾','⚙️','🌱','💡','🎯','🏆','❤️','⭐','🐶',
];

const PAYMENT_METHODS: { key: PaymentMethod, label: string, emoji: string }[] = [
  { key: 'debito', label: 'Débito', emoji: '💳' },
  { key: 'credito', label: 'Crédito', emoji: '🏦' },
  { key: 'transferencia', label: 'Transf.', emoji: '📲' },
  { key: 'efectivo', label: 'Efectivo', emoji: '💵' },
];

const INITIAL_BUDGETS: Budget[] = [
  { category: 'Comida', limit: 100000 },
  { category: 'Alquiler', limit: 270000 },
  { category: 'Transporte', limit: 50000 },
  { category: 'Ocio', limit: 40000 },
  { category: 'Servicios', limit: 30000 },
];

const INITIAL_TRANSACTIONS: Transaction[] = [
  // Abril 2026
  { id: '12', amount: 950000, description: 'Sueldo Abr', category: 'Sueldo', account: 'Galicia', method: 'transferencia', type: 'ingreso', incomeType: 'fijo', date: '2026-04-01' },
  { id: '13', amount: 48000, description: 'Supermercado', category: 'Comida', account: 'Naranja X', method: 'credito', type: 'gasto', date: '2026-04-02' },
  { id: '14', amount: 250000, description: 'Alquiler Abr', category: 'Alquiler', account: 'Galicia', method: 'transferencia', type: 'gasto', date: '2026-04-01' },
  { id: '15', amount: 15000, description: 'Uber', category: 'Transporte', account: 'Mercado Pago', method: 'debito', type: 'gasto', date: '2026-04-02' },
  // Diciembre 2025
  { id: '1', amount: 950000, description: 'Sueldo Dic', category: 'Sueldo', account: 'Galicia', method: 'transferencia', type: 'ingreso', incomeType: 'fijo', date: '2025-12-01' },
  { id: '2', amount: 150000, description: 'Venta Celular', category: 'Ventas', account: 'Mercado Pago', method: 'transferencia', type: 'ingreso', incomeType: 'variable', date: '2025-12-03' },
  { id: '3', amount: 12500, description: 'Cena', category: 'Ocio', account: 'Mercado Pago', method: 'debito', type: 'gasto', date: '2025-12-05' },
  { id: '4', amount: 45000, description: 'Super', category: 'Comida', account: 'Naranja X', method: 'credito', type: 'gasto', date: '2025-12-06' },
  { id: '5', amount: 250000, description: 'Alquiler', category: 'Alquiler', account: 'Galicia', method: 'transferencia', type: 'gasto', date: '2025-12-07' },
  // Noviembre 2025
  { id: '6', amount: 800000, description: 'Sueldo Nov', category: 'Sueldo', account: 'Galicia', method: 'transferencia', type: 'ingreso', date: '2025-11-01' },
  { id: '7', amount: 600000, description: 'Gastos Nov', category: 'Varios', account: 'Galicia', method: 'debito', type: 'gasto', date: '2025-11-20' },
  // Octubre 2025
  { id: '8', amount: 750000, description: 'Sueldo Oct', category: 'Sueldo', account: 'Galicia', method: 'transferencia', type: 'ingreso', date: '2025-10-01' },
  { id: '9', amount: 400000, description: 'Gastos Oct', category: 'Varios', account: 'Mercado Pago', method: 'debito', type: 'gasto', date: '2025-10-15' },
  // Agosto 2025
  { id: '10', amount: 720000, description: 'Sueldo Ago', category: 'Sueldo', account: 'Galicia', method: 'transferencia', type: 'ingreso', date: '2025-08-01' },
  { id: '11', amount: 350000, description: 'Gastos Ago', category: 'Varios', account: 'Efectivo', method: 'efectivo', type: 'gasto', date: '2025-08-15' },
];

const INITIAL_ACCOUNTS: AccountItem[] = [
  { id: 'acc1', name: 'Galicia', provider: 'Galicia', initialBalance: 120000, type: 'gastos', currency: 'ARS' },
  { id: 'acc2', name: 'Mercado Pago', provider: 'Mercado Pago', initialBalance: 45000, type: 'gastos', currency: 'ARS' },
  { id: 'acc3', name: 'Efectivo', provider: 'Efectivo', initialBalance: 50000, type: 'efectivo', currency: 'ARS' },
  { id: 'acc4', name: 'Naranja X', provider: 'Naranja X', initialBalance: 0, limit: 800000, type: 'credito', currency: 'ARS' },
  { id: 'acc5', name: 'Dólar Colchón', provider: 'Dólar Colchón', initialBalance: 2500, type: 'ahorro', currency: 'USD' },
  { id: 'acc6', name: 'S&P 500', provider: 'Inversion', initialBalance: 450000, type: 'ahorro', currency: 'ARS' },
];

const FAQS = [
  { q: "¿Se conecta con mi banco?", a: "No directamente. Pero podés importar tu extracto de Galicia (archivo .xlsx desde el home banking) y los resúmenes de tarjeta Visa/Amex (.pdf). También sincronizamos con Mercado Pago si conectás tu cuenta." },
  { q: "¿Cómo importo mi extracto de Galicia?", a: "Entrá a Cuentas → tocá tu cuenta Galicia → 'Importar extracto'. Podés subir el archivo .xlsx del extracto bancario o los PDFs de resumen de tarjeta. La app los procesa y te muestra una previa para confirmar qué movimientos importar." },
  { q: "¿Cómo sincronizo Mercado Pago?", a: "Desde Configuración → Mercado Pago → Conectar. Usás tu cuenta de MP (OAuth seguro, sin contraseña). Una vez conectado podés sincronizar tus movimientos con un toque. Los importes ya incluyen las comisiones." },
  { q: "¿Puedo registrar compra de dólares?", a: "Sí. Creá un movimiento tipo Transferencia, elegí tu cuenta ARS como origen y tu cuenta USD como destino. Aparece un campo extra para poner el monto recibido en USD. La app calcula el tipo de cambio automáticamente." },
  { q: "¿Cómo manejo cuentas en USD?", a: "Al crear una cuenta elegí moneda USD. Los saldos en dólares se muestran por separado en el Dashboard con su equivalente en pesos según la cotización del día." },
  { q: "¿Necesito dar mis datos reales?", a: "Solo necesitás un email y contraseña. El nombre puede ser un apodo. No pedimos DNI, CUIL ni ningún dato de identidad." },
  { q: "¿Qué es 'Neto para Gastar'?", a: "Tu liquidez real: el total de tus cuentas bancarias y efectivo en ARS. No incluye ahorros en USD, inversiones, ni deudas." },
  { q: "¿Cómo ajusto el saldo de una cuenta?", a: "Entrá a Cuentas, tocá la cuenta, luego 'Editar / Ajustar Saldo'. Escribís el saldo actual y se recalcula automáticamente sin generar ningún movimiento." },
  { q: "¿Cómo agrego una categoría propia?", a: "Al crear un movimiento, en el selector de Categoría elegí '＋ Agregar categoría...' y escribí el nombre. También podés asignarle un emoji." },
  { q: "¿Qué son los Presupuestos?", a: "Definís un límite de gasto mensual por categoría. La barra se llena según lo gastado en el mes actual. Se configuran desde el Menú → Presupuestos." },
  { q: "¿Cómo funciona la sección Deudas?", a: "Registrás lo que te deben (activos) y lo que debés (pasivos). Podés registrar pagos parciales o totales que se aplican como transacción y descuentan del pendiente." },
  { q: "¿Puedo pagar una deuda desde un movimiento?", a: "Sí. Al crear un gasto, elegí la categoría 'Pago de deuda' y seleccioná la deuda. Al guardar, el monto se descuenta automáticamente del pendiente." },
  { q: "¿Cómo funciona el bloqueo automático?", a: "La app se bloquea sola a los 3 minutos de inactividad y si la mandás al fondo más de 30 segundos. Para desbloquear usás Face ID, Touch ID, o tu contraseña." },
  { q: "¿Cómo exporto mis movimientos a Excel?", a: "En la pestaña Actividad, tocá el botón 📥 Excel (arriba a la derecha). Se descarga un archivo .xlsx con todos los movimientos filtrados." },
  { q: "¿De dónde sale la cotización del dólar?", a: "Se obtiene en tiempo real de dolarapi.com (dólar blue, oficial y MEP). Podés actualizarla manualmente con el botón ↺ en el Dashboard." },
  { q: "¿Los datos son privados?", a: "Sí. Cada usuario solo ve sus propios datos. Usamos Supabase con Row Level Security: es imposible que un usuario acceda a los datos de otro." },
];

const CATEGORY_ICONS: Record<string, any> = {
  'Comida': Coffee, 'Alquiler': Home, 'Servicios': Zap, 'Ocio': ShoppingBag,
  'Transporte': Car, 'Suscripciones': Smartphone, 'Salud': Plus, 'Sueldo': ArrowDownLeft,
  'Ventas': ArrowDownLeft, 'Intereses': TrendingUp, 'Regalo': Gift, 'Ahorro': Lock,
  'Movimiento': ArrowRightLeft, 'Ajuste': Settings
};

// --- COMPONENTES VISUALES ---

const useCountUp = (target: number, duration = 800) => {
  const [val, setVal] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const start = prev.current;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - elapsed, 3);
      setVal(Math.round(start + diff * ease));
      if (elapsed < 1) requestAnimationFrame(tick);
      else prev.current = target;
    };
    const raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
};

const AnimatedNumber = ({ value, prefix = '$' }: { value: number, prefix?: string }) => {
  const animated = useCountUp(value);
  return <>{prefix} {fmtARS(animated)}</>;
};

const ReportsDonut = ({ data, total, title }: { data: any[], total: number, title: string }) => (
  <div className="glass p-6 rounded-[2rem] flex flex-col items-center">
    <h3 className="font-bold text-gray-800 mb-6 w-full">{title}</h3>
    {total === 0 ? (
      <p className="text-sm text-gray-400 py-6">Sin movimientos en este período</p>
    ) : (
      <>
        <div className="relative w-48 h-48 mb-6">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#F3F4F6" strokeWidth="15" />
            {data.reduce((acc: any, cat: any, i: number) => {
              const dash = `${cat.percentage} ${100 - cat.percentage}`;
              const el = <circle key={i} cx="50" cy="50" r="40" fill="transparent" stroke={cat.color} strokeWidth="15" strokeDasharray={dash} strokeDashoffset={-acc.offset} />;
              acc.offset += cat.percentage; acc.els.push(el); return acc;
            }, { offset: 0, els: [] }).els}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center px-3">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total</span>
            <span className="text-sm font-bold text-center leading-tight break-all">$ {fmtARS(total)}</span>
          </div>
        </div>
        <div className="w-full space-y-3">
          {data.map((cat: any, i: number) => {
            const Icon = CATEGORY_ICONS[cat.category] || PieChart;
            return (
              <div key={i} className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: cat.color }}><Icon size={12} /></div>
                  <span className="text-sm font-medium">{cat.category}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold">$ {fmtARS(cat.amount)}</span>
                  <span className="text-[10px] text-gray-400 ml-2">{cat.percentage.toFixed(1)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </>
    )}
  </div>
);

const ReportsBarChart = ({ historyData }: { historyData: any[] }) => {
  const [activeBar, setActiveBar] = useState<number | null>(null);
  const maxVal = Math.max(...historyData.map(d => Math.max(d.income, d.expense)), 1);

  return (
    <div className="glass p-6 rounded-[2rem]">
      <h3 className="font-bold text-gray-800 mb-4">Evolución Mensual</h3>
      <div className="flex justify-between items-end h-48 gap-3 mt-4 overflow-x-auto pb-4 pt-10 px-2 hide-scrollbar">
        {historyData.map((d, i) => (
          <div key={i} className="flex-1 min-w-[50px] flex flex-col items-center gap-1 relative h-full justify-end cursor-pointer"
            onClick={() => setActiveBar(activeBar === i ? null : i)}
            onMouseEnter={() => setActiveBar(i)} onMouseLeave={() => setActiveBar(null)}>
            {(activeBar === i) && (
              <div className="absolute -top-28 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] p-3 rounded-xl z-50 pointer-events-none whitespace-nowrap shadow-xl flex flex-col gap-1 min-w-[80px]">
                <p className="text-gray-400 font-bold border-b border-gray-700 pb-1 mb-1 text-center">{d.label.toUpperCase()}</p>
                <div className="flex justify-between gap-3"><span className="text-gray-400">Ing:</span><span className="text-green-400 font-bold">$ {fmtARS(d.income)}</span></div>
                <div className="flex justify-between gap-3"><span className="text-gray-400">Gas:</span><span className="text-white font-bold">$ {fmtARS(d.expense)}</span></div>
                <div className="flex justify-between gap-3 border-t border-gray-700 pt-1 mt-1"><span className="text-gray-400">Bal:</span><span className={`font-bold ${d.income - d.expense >= 0 ? 'text-blue-400' : 'text-red-400'}`}>$ {fmtARS((d.income - d.expense))}</span></div>
                <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-gray-900 rotate-45"></div>
              </div>
            )}
            <div className="flex gap-1.5 items-end h-full w-full justify-center">
              <div style={{ height: `${Math.max((d.income / maxVal) * 100, 4)}%` }} className={`w-3 rounded-t-full ${d.isCurrent ? 'bg-green-500' : 'bg-green-200'} transition-all duration-300`}></div>
              <div style={{ height: `${Math.max((d.expense / maxVal) * 100, 4)}%` }} className={`w-3 rounded-t-full ${d.isCurrent ? 'bg-black' : 'bg-gray-300'} transition-all duration-300`}></div>
            </div>
            <span className={`text-[10px] ${d.isCurrent ? 'font-bold text-black' : 'text-gray-400'} whitespace-nowrap lowercase`}>{d.label}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-4 mt-4">
        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-500 rounded-full" /><span className="text-xs">Ingresos</span></div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-black rounded-full" /><span className="text-xs">Egresos</span></div>
      </div>
    </div>
  );
};

// --- MODAL PRESUPUESTOS ---

const BudgetModal = ({ budgets, onSave, onClose, extraCategories = [] }: { budgets: Budget[], onSave: (b: Budget[]) => void, onClose: () => void, extraCategories?: string[] }) => {
  const [local, setLocal] = useState<Budget[]>(budgets);
  const update = (i: number, field: keyof Budget, value: any) => {
    const n = [...local]; n[i] = { ...n[i], [field]: value }; setLocal(n);
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass rounded-t-[2rem] sm:rounded-[2rem] p-6 w-full sm:max-w-sm max-h-[85vh] overflow-y-auto animate-fade-slide" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <div><h3 className="text-xl font-bold">Presupuestos</h3><p className="text-xs text-gray-400 mt-0.5">Límite mensual por categoría</p></div>
          <button onClick={onClose} className="p-2 bg-gray-100 rounded-full"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          {local.map((b, i) => (
            <div key={i} className="bg-gray-50 rounded-2xl p-3 flex items-center gap-3">
              <VE e={getCategoryEmoji(b.category)} className="text-2xl" />
              <div className="flex-1 space-y-1">
                <select value={b.category} onChange={e => update(i, 'category', e.target.value)} className="w-full bg-white p-2 rounded-xl text-sm font-bold outline-none">
                  {[...CATEGORIES.gasto, ...extraCategories].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                  <input type="number" value={b.limit || ''} onChange={e => update(i, 'limit', Number(e.target.value))} placeholder="0" className="w-full bg-white p-2 pl-6 rounded-xl text-sm font-bold outline-none" />
                </div>
              </div>
              <button onClick={() => setLocal(local.filter((_, j) => j !== i))} className="p-2 text-red-400 hover:bg-red-50 rounded-full"><Trash2 size={16} /></button>
            </div>
          ))}
          <button onClick={() => setLocal([...local, { category: 'Comida', limit: 0 }])} className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-bold text-gray-400">
            + Agregar categoría
          </button>
        </div>
        <button onClick={() => { onSave(local); onClose(); }} className="w-full mt-6 bg-black text-white font-bold py-4 rounded-2xl">Guardar Presupuestos</button>
      </div>
    </div>
  );
};

// --- REPORTES ---

const ReportsView = ({ transactions }: { transactions: Transaction[] }) => {
  const [reportDate, setReportDate] = useState(new Date());
  const [reportScope, setReportScope] = useState<'month' | 'custom'>('month');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [showRangePicker, setShowRangePicker] = useState(false);

  const reportTransactions = useMemo(() => transactions.filter(t => {
    if (reportScope === 'custom' && customRange.start && customRange.end) return t.date >= customRange.start && t.date <= customRange.end;
    const [y, m] = t.date.split('-').map(Number);
    return y === reportDate.getFullYear() && m === (reportDate.getMonth() + 1);
  }), [transactions, reportDate, reportScope, customRange]);

  const reportStats = {
    income: reportTransactions.filter(t => t.type === 'ingreso').reduce((s, t) => s + t.amount, 0),
    expense: reportTransactions.filter(t => t.type === 'gasto').reduce((s, t) => s + t.amount, 0),
  };
  const balance = reportStats.income - reportStats.expense;

  const expensesByCategory = Object.entries(
    reportTransactions.filter(t => t.type === 'gasto').reduce((acc, t) => ({ ...acc, [t.category]: (acc[t.category] || 0) + t.amount }), {} as Record<string, number>)
  ).sort((a, b) => b[1] - a[1]).map(([cat, val], i, arr) => {
    const total = arr.reduce((s, [, v]) => s + v, 0);
    return { category: cat, amount: val, percentage: total ? (val / total) * 100 : 0, color: CHART_COLORS[i % CHART_COLORS.length] };
  });

  const INCOME_COLORS = ['#10B981', '#059669', '#34D399', '#6EE7B7', '#065F46', '#A7F3D0', '#047857'];
  const incomesByCategory = Object.entries(
    reportTransactions.filter(t => t.type === 'ingreso').reduce((acc, t) => ({ ...acc, [t.category]: (acc[t.category] || 0) + t.amount }), {} as Record<string, number>)
  ).sort((a, b) => b[1] - a[1]).map(([cat, val], i, arr) => {
    const total = arr.reduce((s, [, v]) => s + v, 0);
    return { category: cat, amount: val, percentage: total ? (val / total) * 100 : 0, color: INCOME_COLORS[i % INCOME_COLORS.length] };
  });

  const historyData = useMemo(() => {
    const data: any[] = [];
    const current = new Date();
    let endDate: Date;
    if (reportScope === 'month') {
      current.setFullYear(reportDate.getFullYear(), reportDate.getMonth() - 5, 1);
      endDate = new Date(reportDate.getFullYear(), reportDate.getMonth(), 1);
    } else if (customRange.start && customRange.end) {
      const s = new Date(customRange.start);
      current.setFullYear(s.getFullYear(), s.getMonth(), 1);
      endDate = new Date(customRange.end); endDate.setDate(1);
    } else return data;

    while (current.getFullYear() < endDate.getFullYear() || (current.getFullYear() === endDate.getFullYear() && current.getMonth() <= endDate.getMonth())) {
      const m = current.getMonth(), y = current.getFullYear();
      const txs = transactions.filter(t => { const [ty, tm] = t.date.split('-').map(Number); return ty === y && tm === (m + 1); });
      data.push({
        label: `${current.toLocaleString('es-ES', { month: 'short' }).replace('.', '')}-${y.toString().slice(2)}`,
        income: txs.filter(t => t.type === 'ingreso').reduce((a, b) => a + b.amount, 0),
        expense: txs.filter(t => t.type === 'gasto').reduce((a, b) => a + b.amount, 0),
        isCurrent: m === reportDate.getMonth() && y === reportDate.getFullYear() && reportScope === 'month'
      });
      current.setMonth(current.getMonth() + 1);
    }
    return data;
  }, [transactions, reportDate, reportScope, customRange]);

  const changeReportDate = (d: number) => { const n = new Date(reportDate); n.setMonth(n.getMonth() + d); setReportDate(n); };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between py-2 mb-2">
          <button onClick={() => changeReportDate(-1)} className="p-2 bg-gray-50 rounded-full"><ChevronLeft /></button>
          <div onClick={() => setShowRangePicker(!showRangePicker)} className="flex flex-col items-center cursor-pointer">
            <span className="text-xl font-bold capitalize">
              {reportScope === 'month' ? `${reportDate.toLocaleString('es-ES', { month: 'long' })} ${reportDate.getFullYear()}` : 'Rango Personalizado'}
            </span>
            <span className="text-[10px] text-blue-500 font-bold flex items-center gap-1">{showRangePicker ? 'Ocultar' : 'Ajustar Periodo'} <Filter size={10} /></span>
          </div>
          <button onClick={() => changeReportDate(1)} className="p-2 bg-gray-50 rounded-full"><ChevronRight /></button>
        </div>
        {showRangePicker && (
          <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-2 animate-in slide-in-from-top-2">
            <button onClick={() => { setReportScope('month'); setShowRangePicker(false); }} className={`col-span-2 py-2 rounded-xl text-xs font-bold mb-2 ${reportScope === 'month' ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'}`}>Vista Mensual</button>
            <div><label className="text-xs font-bold text-gray-400">Desde</label><input type="date" value={customRange.start} onChange={e => { setCustomRange({ ...customRange, start: e.target.value }); setReportScope('custom'); }} className="w-full bg-gray-50 p-2 rounded-xl text-sm font-bold" /></div>
            <div><label className="text-xs font-bold text-gray-400">Hasta</label><input type="date" value={customRange.end} onChange={e => { setCustomRange({ ...customRange, end: e.target.value }); setReportScope('custom'); }} className="w-full bg-gray-50 p-2 rounded-xl text-sm font-bold" /></div>
          </div>
        )}
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <div className="p-4 border-b border-white/30 flex justify-between"><span className="text-gray-600">Entradas</span><span className="font-bold text-green-600">+ $ {fmtARS(reportStats.income)}</span></div>
        <div className="p-4 border-b border-gray-100 flex justify-between"><span className="text-gray-600">Salidas</span><span className="font-bold text-black">- $ {fmtARS(reportStats.expense)}</span></div>
        <div className="p-4 bg-gray-50 flex justify-between"><span className="font-bold text-gray-800">Balance</span><span className={`font-bold ${balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>$ {fmtARS(balance)}</span></div>
      </div>
      <ReportsDonut data={incomesByCategory} total={reportStats.income} title="Ingresos por categoría" />
      <ReportsDonut data={expensesByCategory} total={reportStats.expense} title="Gastos por categoría" />
      <ReportsBarChart historyData={historyData} />
    </div>
  );
};

// --- INVESTMENTS VIEW ---

const InvestmentsView = ({
  investments,
  blueRate,
  onSave,
  onDelete,
  onBack,
}: {
  investments: Investment[];
  blueRate: number;
  onSave: (inv: Investment) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [form, setForm] = useState<Partial<Investment>>({
    name: '', type: 'crypto', ticker: '', quantity: 1, purchase_price: 0, currency: 'USD',
  });

  const openAdd = () => { setEditing(null); setForm({ name: '', type: 'crypto', ticker: '', quantity: 1, purchase_price: 0, currency: 'USD' }); setShowForm(true); };
  const openEdit = (inv: Investment) => { setEditing(inv); setForm({ ...inv }); setShowForm(true); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const inv: Investment = {
      id: editing?.id || Date.now().toString(),
      user_id: editing?.user_id || '',
      name: form.name || '',
      type: form.type as Investment['type'] || 'other',
      ticker: form.ticker || undefined,
      quantity: Number(form.quantity) || 1,
      purchase_price: Number(form.purchase_price) || 0,
      current_price: form.current_price ? Number(form.current_price) : undefined,
      currency: form.currency || 'USD',
      notes: form.notes || undefined,
    };
    onSave(inv);
    setShowForm(false);
  };

  const totalARS = investments.reduce((s, inv) => {
    const price = inv.current_price || inv.purchase_price;
    const val = price * inv.quantity;
    return s + (inv.currency === 'USD' ? val * blueRate : val);
  }, 0);

  const TYPE_LABELS: Record<string, string> = { crypto: '🪙 Crypto', stock: '📈 Acción', etf: '📊 ETF', fund: '🏦 Fondo', asset: '🏠 Activo', other: '📋 Otro' };

  return (
    <div className="space-y-5 animate-in fade-in">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm"><ArrowLeft size={20} /></button>
        <h2 className="text-2xl font-bold flex-1">Inversiones</h2>
        <button onClick={openAdd} className="bg-black text-white px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1"><Plus size={14} /> Agregar</button>
      </div>

      {/* Total portfolio */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-3xl p-5 text-white">
        <p className="text-sm font-medium opacity-80">Portafolio total (ARS)</p>
        <p className="text-4xl font-bold mt-1">$ {fmtARS(totalARS)}</p>
        {blueRate > 0 && <p className="text-xs mt-1 opacity-60">≈ U$S {fmtARS(totalARS / blueRate)} · Blue ${fmtARS(blueRate)}</p>}
      </div>

      {investments.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <div className="text-5xl">📈</div>
          <p className="font-bold text-lg">Sin inversiones registradas</p>
          <p className="text-sm text-gray-400">Registrá tus cripto, acciones o cualquier activo</p>
          <button onClick={openAdd} className="bg-black text-white px-6 py-3 rounded-2xl font-bold">Agregar inversión</button>
        </div>
      ) : (
        <div className="space-y-3">
          {investments.map(inv => {
            const price = inv.current_price || inv.purchase_price;
            const valueUSD = price * inv.quantity;
            const valueARS = inv.currency === 'USD' ? valueUSD * blueRate : valueUSD;
            const gainPct = inv.current_price && inv.purchase_price > 0
              ? ((inv.current_price - inv.purchase_price) / inv.purchase_price) * 100
              : null;
            return (
              <div key={inv.id} className="glass rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-indigo-100 rounded-2xl flex items-center justify-center text-lg flex-shrink-0">
                    {inv.type === 'crypto' ? '🪙' : inv.type === 'stock' ? '📈' : inv.type === 'etf' ? '📊' : '💼'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold truncate">{inv.name}</p>
                      {inv.ticker && <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{inv.ticker}</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{inv.quantity} × {inv.currency === 'USD' ? 'U$S' : '$'} {fmtARS(price)} = <span className="font-bold text-gray-700">$ {fmtARS(valueARS)}</span></p>
                    {gainPct !== null && (
                      <p className={`text-xs font-bold mt-0.5 ${gainPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {gainPct >= 0 ? '▲' : '▼'} {Math.abs(gainPct).toFixed(1)}%
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => openEdit(inv)} className="text-gray-400 p-1"><Pencil size={14} /></button>
                    <button onClick={() => onDelete(inv.id)} className="text-red-400 p-1"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 backdrop-blur-md" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-t-[2rem] w-full max-w-sm max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold">{editing ? 'Editar' : 'Nueva'} inversión</h3>
                <button type="button" onClick={() => setShowForm(false)} className="p-2 bg-gray-100 rounded-full"><X size={16} /></button>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">Nombre</label>
                <input required className="w-full bg-gray-50 rounded-xl p-3 text-sm font-bold" placeholder="Bitcoin, Apple, etc." value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Tipo</label>
                  <select className="w-full bg-gray-50 rounded-xl p-3 text-sm font-bold" value={form.type || 'crypto'} onChange={e => setForm(f => ({ ...f, type: e.target.value as Investment['type'] }))}>
                    {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Moneda</label>
                  <select className="w-full bg-gray-50 rounded-xl p-3 text-sm font-bold" value={form.currency || 'USD'} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                    <option value="USD">USD</option>
                    <option value="ARS">ARS</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">Ticker (opcional)</label>
                <input className="w-full bg-gray-50 rounded-xl p-3 text-sm font-bold uppercase" placeholder="BTC, AAPL..." value={form.ticker || ''} onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Cantidad</label>
                  <input required type="number" step="any" min="0" className="w-full bg-gray-50 rounded-xl p-3 text-sm font-bold" value={form.quantity || ''} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Precio compra</label>
                  <input required type="number" step="any" min="0" className="w-full bg-gray-50 rounded-xl p-3 text-sm font-bold" value={form.purchase_price || ''} onChange={e => setForm(f => ({ ...f, purchase_price: Number(e.target.value) }))} />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">Precio actual (opcional)</label>
                <input type="number" step="any" min="0" className="w-full bg-gray-50 rounded-xl p-3 text-sm font-bold" placeholder="Dejar vacío para usar precio de compra" value={form.current_price || ''} onChange={e => setForm(f => ({ ...f, current_price: e.target.value ? Number(e.target.value) : undefined }))} />
              </div>
              <button type="submit" className="w-full bg-black text-white font-bold py-3.5 rounded-2xl">
                {editing ? 'Guardar cambios' : 'Agregar inversión'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// --- AUTH ---

const AuthScreen = ({
  onLogin, onRegister, onForgot
}: {
  onLogin: (email: string, password: string) => Promise<string | null>;
  onRegister: (name: string, email: string, password: string) => Promise<string | null>;
  onForgot: (email: string) => Promise<string | null>;
}) => {
  const [view, setView] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [name, setName] = useState(''); const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false); const [error, setError] = useState(''); const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!email || !password) return setError("Completá todos los campos");
    setLoading(true);
    const err = await onLogin(email, password);
    setLoading(false);
    if (err) setError(err);
  };
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!name || !email || !password) return setError("Datos incompletos");
    if (password !== confirmPass) return setError("Las contraseñas no coinciden");
    setLoading(true);
    const err = await onRegister(name, email, password);
    setLoading(false);
    if (err) setError(err); else { setSuccessMsg("Revisá tu email para confirmar la cuenta"); }
  };
  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!email) return setError("Ingresá tu email");
    setLoading(true);
    const err = await onForgot(email);
    setLoading(false);
    if (err) setError(err); else { setSuccessMsg(email); }
  };

  const inputCls = "w-full bg-white/10 text-white placeholder:text-white/40 border border-white/10 focus:border-white/30 p-3.5 rounded-2xl outline-none transition-colors text-sm";
  const btnPrimary = "w-full py-3.5 rounded-2xl font-bold text-white text-sm transition-all active:scale-[0.98] disabled:opacity-50";

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center p-6" style={{background: 'linear-gradient(145deg, #0a0a1a 0%, #1a0533 35%, #0d1f3c 65%, #0a1628 100%)'}}>

      {/* Orbs decorativos */}
      <div className="absolute top-[-120px] left-[-80px] w-[380px] h-[380px] rounded-full pointer-events-none" style={{background: 'radial-gradient(circle, rgba(139,92,246,0.45), transparent 70%)', filter: 'blur(60px)'}} />
      <div className="absolute bottom-[-100px] right-[-60px] w-[320px] h-[320px] rounded-full pointer-events-none" style={{background: 'radial-gradient(circle, rgba(16,185,129,0.35), transparent 70%)', filter: 'blur(60px)'}} />
      <div className="absolute top-[40%] right-[-40px] w-[220px] h-[220px] rounded-full pointer-events-none" style={{background: 'radial-gradient(circle, rgba(245,158,11,0.25), transparent 70%)', filter: 'blur(50px)'}} />
      <div className="absolute top-[20%] left-[10%] w-[160px] h-[160px] rounded-full pointer-events-none" style={{background: 'radial-gradient(circle, rgba(236,72,153,0.2), transparent 70%)', filter: 'blur(40px)'}} />

      {/* Logo */}
      <div className="mb-8 text-center relative z-10 animate-fade-slide flex flex-col items-center gap-3">
        <div style={{filter: 'drop-shadow(0 0 32px rgba(139,92,246,0.6))'}}>
          <PampaLogo size={72} />
        </div>
        <div>
          <h1 className="text-5xl font-black text-white tracking-[-2px] mb-1" style={{textShadow: '0 0 40px rgba(139,92,246,0.5)'}}>PAMPA</h1>
          <p className="text-xs text-white/40 tracking-[4px] uppercase font-medium">Tu orden personal</p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm relative z-10 animate-fade-slide p-7 rounded-[2rem]" style={{background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(32px) saturate(160%)', WebkitBackdropFilter: 'blur(32px) saturate(160%)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 32px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)'}}>

        {view === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <h2 className="text-lg font-bold text-white text-center mb-5">Bienvenido de vuelta</h2>
            <div className="relative">
              <Mail className="absolute left-4 top-3.5 text-white/30" size={18} />
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls + " pl-11"} />
            </div>
            <div className="relative">
              <LockIcon className="absolute left-4 top-3.5 text-white/30" size={18} />
              <input type={showPass ? "text" : "password"} placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} className={inputCls + " pl-11 pr-11"} />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-3.5 text-white/30 hover:text-white/60 transition-colors">{showPass ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
            {error && <p className="text-red-400 text-xs text-center">{error}</p>}
            <button disabled={loading} className={btnPrimary} style={{background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', boxShadow: '0 8px 24px rgba(124,58,237,0.4)'}}>
              {loading ? 'Ingresando...' : 'Entrar →'}
            </button>
            <div className="text-center space-y-2 pt-1">
              <button type="button" onClick={() => setView('forgot')} className="text-xs text-white/30 hover:text-white/50 transition-colors">¿Olvidaste tu contraseña?</button>
              <p className="text-xs text-white/30">¿No tenés cuenta? <button type="button" onClick={() => setView('register')} className="text-violet-400 font-bold hover:text-violet-300 transition-colors">Registrate</button></p>
            </div>
          </form>
        )}

        {view === 'register' && (
          <form onSubmit={handleRegister} className="space-y-3.5">
            <div className="flex items-center gap-3 mb-4">
              <button type="button" onClick={() => setView('login')} className="text-white/40 hover:text-white/70 transition-colors"><ArrowLeft size={20} /></button>
              <h2 className="text-lg font-bold text-white">Crear cuenta</h2>
            </div>
            {successMsg ? (
              <div className="text-center py-6 space-y-3">
                <div className="text-5xl mb-2">🎉</div>
                <p className="text-white font-bold text-lg">¡Cuenta creada!</p>
                <p className="text-sm text-white/50">{successMsg}</p>
                <button type="button" onClick={() => { setView('login'); setSuccessMsg(''); }} className={btnPrimary + " mt-2"} style={{background: 'linear-gradient(135deg, #7c3aed, #6d28d9)'}}>Ir al login</button>
              </div>
            ) : (
              <>
                <div className="rounded-2xl p-3 space-y-1" style={{background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)'}}>
                  <p className="text-xs font-bold text-white/70">🔒 Tu privacidad es prioridad</p>
                  <p className="text-[11px] text-white/40 leading-relaxed">Solo email y contraseña. Sin DNI ni datos bancarios.</p>
                </div>
                <input type="text" placeholder="Nombre (puede ser un apodo)" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
                <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
                <input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} className={inputCls} />
                <input type="password" placeholder="Confirmar contraseña" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} className={inputCls} />
                {error && <p className="text-red-400 text-xs text-center">{error}</p>}
                <button disabled={loading} className={btnPrimary} style={{background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', boxShadow: '0 8px 24px rgba(124,58,237,0.4)'}}>
                  {loading ? 'Creando...' : 'Crear Cuenta →'}
                </button>
              </>
            )}
          </form>
        )}

        {view === 'forgot' && (
          <form onSubmit={handleRecover} className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <button type="button" onClick={() => { setView('login'); setSuccessMsg(''); setError(''); }} className="text-white/40 hover:text-white/70 transition-colors"><ArrowLeft size={20} /></button>
              <h2 className="text-lg font-bold text-white">Recuperar acceso</h2>
            </div>
            {!successMsg ? (
              <>
                <p className="text-sm text-white/40">Te mandamos un link para crear una nueva contraseña.</p>
                {error && <p className="text-red-400 text-xs text-center">{error}</p>}
                <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
                <button disabled={loading} className={btnPrimary} style={{background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', boxShadow: '0 8px 24px rgba(124,58,237,0.4)'}}>
                  {loading ? 'Enviando...' : 'Enviar link →'}
                </button>
              </>
            ) : (
              <div className="text-center py-4 space-y-3">
                <div className="text-5xl mb-2">📬</div>
                <p className="text-white font-bold">¡Listo!</p>
                <p className="text-sm text-white/40">Revisá <strong className="text-white/60">{email}</strong> y seguí el link.</p>
                <button type="button" onClick={() => { setView('login'); setSuccessMsg(''); }} className={btnPrimary + " mt-2"} style={{background: 'linear-gradient(135deg, #7c3aed, #6d28d9)'}}>Volver al login</button>
              </div>
            )}
          </form>
        )}
      </div>

      <p className="mt-6 text-[11px] text-white/20 relative z-10 tracking-wide">
        Tus datos, solo tuyos 🔒 ·{' '}
        <a href="/privacidad.html" target="_blank" className="underline underline-offset-2 hover:text-white/40 transition-colors">
          Política de privacidad
        </a>
      </p>
    </div>
  );
};

// --- FUTURO (con labels e inputs formateados) ---

const FutureView = ({ liquidBalance }: { liquidBalance: number }) => {
  const [loanSim, setLoanSim] = useState({ amount: 1000000, rate: 80, months: 12, result: null as number | null });
  const [pfSim, setPfSim] = useState({ amount: 100000, days: 30, tna: 75, result: null as number | null });
  const [compSim, setCompSim] = useState({ amount: 100000, items: [{ name: 'Mercado Pago', tna: 32.2 }, { name: 'Cocos', tna: 35.5 }] });

  const calcLoan = () => { const r = (loanSim.rate / 100) / 12; const q = loanSim.amount * (r * Math.pow(1 + r, loanSim.months)) / (Math.pow(1 + r, loanSim.months) - 1); setLoanSim({ ...loanSim, result: q }); };
  const calcPF = () => { setPfSim({ ...pfSim, result: pfSim.amount + pfSim.amount * (pfSim.tna / 100) * (pfSim.days / 365) }); };
  const updComp = (i: number, f: string, v: string) => { const n = [...compSim.items]; n[i] = { ...n[i], [f]: f === 'tna' ? Number(v) : v }; setCompSim({ ...compSim, items: n }); };

  const Lbl = ({ c }: { c: string }) => <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 mb-1 block">{c}</label>;

  return (
    <div className="space-y-6 animate-in fade-in">
      <h2 className="text-2xl font-bold">Proyecciones</h2>
      <div className="glass p-6 rounded-[2rem]">
        <div className="flex items-center gap-3 mb-5"><div className="bg-indigo-100 p-2 rounded-full text-indigo-600"><Calculator /></div><h3 className="font-bold">Simulador Préstamo</h3></div>
        <div className="space-y-3">
          <div><Lbl c="Monto a pedir ($)" /><input type="number" value={loanSim.amount} onChange={e => setLoanSim({ ...loanSim, amount: Number(e.target.value) })} className="w-full bg-gray-50 p-3 rounded-xl" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Lbl c="TNA (%)" /><input type="number" value={loanSim.rate} onChange={e => setLoanSim({ ...loanSim, rate: Number(e.target.value) })} className="w-full bg-gray-50 p-3 rounded-xl" /></div>
            <div><Lbl c="Cuotas (meses)" /><input type="number" value={loanSim.months} onChange={e => setLoanSim({ ...loanSim, months: Number(e.target.value) })} className="w-full bg-gray-50 p-3 rounded-xl" /></div>
          </div>
          <button onClick={calcLoan} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold">Calcular Cuota</button>
          {loanSim.result && (
            <div className={`p-4 rounded-xl text-center ${loanSim.result / ESTIMATED_SALARY > 0.3 ? 'bg-red-50 border border-red-100' : 'bg-indigo-50'}`}>
              <p className={`text-xs font-bold uppercase ${loanSim.result / ESTIMATED_SALARY > 0.3 ? 'text-red-600' : 'text-indigo-600'}`}>Cuota Mensual</p>
              <p className={`text-3xl font-bold mt-1 ${loanSim.result / ESTIMATED_SALARY > 0.3 ? 'text-red-700' : 'text-indigo-700'}`}>$ {fmtARS(Math.round(loanSim.result))}</p>
              <p className="text-xs text-gray-400 mt-1">Total a devolver: $ {fmtARS(Math.round(loanSim.result * loanSim.months))}</p>
              {loanSim.result / ESTIMATED_SALARY > 0.3 && <p className="text-[10px] text-red-500 font-bold mt-2 flex items-center justify-center gap-1"><AlertTriangle size={10} /> Riesgo Alto (&gt;30% ingresos)</p>}
            </div>
          )}
        </div>
      </div>
      <div className="glass p-6 rounded-[2rem]">
        <div className="flex items-center gap-3 mb-5"><div className="bg-green-100 p-2 rounded-full text-green-600"><Percent /></div><h3 className="font-bold">Simulador Plazo Fijo</h3></div>
        <div className="space-y-3">
          <div><Lbl c="Monto a invertir ($)" /><div className="flex gap-2"><input type="number" value={pfSim.amount || ''} onChange={e => setPfSim({ ...pfSim, amount: Number(e.target.value) })} className="w-full bg-gray-50 p-3 rounded-xl flex-1" /><button onClick={() => setPfSim({ ...pfSim, amount: liquidBalance })} className="text-xs bg-green-100 text-green-700 px-3 rounded-xl font-bold whitespace-nowrap">Usar Saldo</button></div></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Lbl c="Plazo (días)" /><input type="number" value={pfSim.days} onChange={e => setPfSim({ ...pfSim, days: Number(e.target.value) })} className="w-full bg-gray-50 p-3 rounded-xl" /></div>
            <div><Lbl c="TNA (%)" /><input type="number" value={pfSim.tna} onChange={e => setPfSim({ ...pfSim, tna: Number(e.target.value) })} className="w-full bg-gray-50 p-3 rounded-xl" /></div>
          </div>
          <button onClick={calcPF} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold">Calcular Retorno</button>
          {pfSim.result && <div className="bg-green-50 p-4 rounded-xl text-center"><p className="text-xs text-green-600 font-bold uppercase">Total al Vencimiento</p><p className="text-3xl font-bold text-green-700 mt-1">$ {fmtARS(Math.round(pfSim.result))}</p><p className="text-xs text-green-500 mt-1">Ganás: $ {fmtARS(Math.round(pfSim.result - pfSim.amount))}</p></div>}
        </div>
      </div>
      <div className="glass p-6 rounded-[2rem]">
        <div className="flex items-center gap-3 mb-5"><div className="bg-blue-100 p-2 rounded-full text-blue-600"><BarChart3 /></div><h3 className="font-bold">Comparar Tasas (30 días)</h3></div>
        <div className="space-y-3">
          <div><Lbl c="Monto ($)" /><input type="number" value={compSim.amount} onChange={e => setCompSim({ ...compSim, amount: Number(e.target.value) })} className="w-full bg-gray-50 p-3 rounded-xl" /></div>
          {compSim.items.map((it, i) => (
            <div key={i} className="flex items-center bg-gray-50 p-3 rounded-xl gap-2">
              <div className="flex gap-2 items-center flex-1"><input value={it.name} onChange={e => updComp(i, 'name', e.target.value)} placeholder="Entidad" className="bg-transparent flex-1 font-bold text-sm outline-none" /><span className="text-gray-300">|</span><input value={it.tna} onChange={e => updComp(i, 'tna', e.target.value)} className="bg-transparent w-10 font-bold text-sm outline-none" /><span className="text-gray-400 text-sm">%</span></div>
              <span className="text-green-600 font-bold text-sm">+ $ {fmtARS(Math.round(compSim.amount * (it.tna / 100) * (30 / 365)))}</span>
              <button onClick={() => setCompSim({ ...compSim, items: compSim.items.filter((_, j) => j !== i) })} className="text-red-400"><Trash2 size={14} /></button>
            </div>
          ))}
          <button onClick={() => setCompSim({ ...compSim, items: [...compSim.items, { name: '', tna: 0 }] })} className="text-xs text-blue-600 font-bold">+ Agregar entidad</button>
        </div>
      </div>
    </div>
  );
};

// --- PERFIL ---

const ProfileView = ({ user, onUpdate, onBack, showToast }: { user: any, onUpdate: (data: any) => void, onBack: () => void, showToast: (msg: string) => void }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user.name); const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone || '');
  useEffect(() => { if (user.phone) setPhone(user.phone); }, [user.phone]);
  const [pass, setPass] = useState({ current: '', new: '', confirm: '' });
  const [saved, setSaved] = useState(false);
  const [passError, setPassError] = useState('');
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError('');
    if (pass.new) {
      if (!pass.current) return setPassError("Ingresá tu contraseña actual");
      if (pass.new !== pass.confirm) return setPassError("Las contraseñas no coinciden");
      if (pass.new.length < 6) return setPassError("La nueva contraseña debe tener al menos 6 caracteres");
      const { error } = await supabase.auth.updateUser({ password: pass.new });
      if (error) return setPassError(error.message);
    }
    onUpdate({ name, email, phone });
    await supabase.auth.updateUser({ data: { name } });
    const normalizedPhone = phone ? (phone.startsWith('+') ? phone : `+${phone}`) : '';
    const prevPhone = user.phone || '';
    if (normalizedPhone && user.id) {
      await supabase.from('profiles').upsert({ user_id: user.id, phone: normalizedPhone });
      // Si el teléfono fue agregado o cambió, vincular en el bot y enviar mensaje de bienvenida
      if (normalizedPhone !== prevPhone) {
        try {
          await fetch('https://pampa-whatsapp-bot-production.up.railway.app/link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: normalizedPhone, user_id: user.id, name }),
          });
          showToast('✅ Cambios guardados · 📱 Revisá WhatsApp para confirmar la conexión');
        } catch {
          showToast('✅ Cambios guardados (WhatsApp no disponible en este momento)');
        }
        setPass({ current: '', new: '', confirm: '' });
        setSaved(true); setTimeout(() => setSaved(false), 3000);
        return;
      }
    }
    setPass({ current: '', new: '', confirm: '' });
    setSaved(true); setTimeout(() => setSaved(false), 3000);
    showToast('✅ Cambios guardados');
  };
  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 256;
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        // Crop cuadrado desde el centro
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        const base64 = canvas.toDataURL('image/jpeg', 0.85);
        onUpdate({ avatar: base64 });
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex items-center gap-3"><button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm"><ArrowLeft size={20} /></button><h2 className="text-2xl font-bold">Mi Perfil</h2></div>
      <form onSubmit={save} className="glass p-6 rounded-[2rem] space-y-5">
        <div className="flex justify-center"><div className="relative cursor-pointer" onClick={() => fileRef.current?.click()}><img src={user.avatar} className="w-24 h-24 rounded-full bg-gray-200 border-4 border-gray-50 object-cover" /><div className="absolute bottom-0 right-0 p-2 bg-black text-white rounded-full shadow"><Camera size={16} /></div><input type="file" ref={fileRef} className="hidden" accept="image/*" onChange={handlePhoto} /></div></div>
        <div className="space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-50 p-3 rounded-xl border outline-none" placeholder="Nombre" />
          <input value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-gray-50 p-3 rounded-xl border outline-none" placeholder="Email" />
          <div className="bg-green-50 rounded-xl p-3 space-y-2">
            <p className="text-xs font-bold text-green-700 flex items-center gap-1">💬 Vincular WhatsApp</p>
            <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-white p-2.5 rounded-lg border outline-none text-sm" placeholder="+5491112345678" />
            <p className="text-[10px] text-green-600">Con tu número vinculado podés registrar gastos mandando mensajes al bot.</p>
            {phone && user.phone && phone === user.phone && (
              <button type="button" onClick={async () => {
                try {
                  const r = await fetch('https://pampa-whatsapp-bot-production.up.railway.app/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: phone.startsWith('+') ? phone : `+${phone}`, user_id: user.id, name }) });
                  if (r.ok) showToast('📱 Mensaje enviado a tu WhatsApp');
                  else showToast('❌ No se pudo enviar. Revisá el número.');
                } catch { showToast('❌ Error al conectar con el bot'); }
              }} className="w-full text-xs bg-green-600 text-white py-1.5 rounded-lg font-bold">
                📩 Enviar mensaje de prueba
              </button>
            )}
          </div>
          <div className="border-t pt-4 space-y-2">
            <p className="font-bold text-sm text-gray-400 uppercase mb-2">Cambiar Contraseña (Opcional)</p>
            <input type="password" placeholder="Contraseña Actual" value={pass.current} onChange={e => setPass({ ...pass, current: e.target.value })} className="w-full bg-gray-50 p-3 rounded-xl border outline-none text-sm" />
            <div className="flex gap-2">
              <input type="password" placeholder="Nueva" value={pass.new} onChange={e => setPass({ ...pass, new: e.target.value })} className="w-full bg-gray-50 p-3 rounded-xl border outline-none text-sm" />
              <input type="password" placeholder="Confirmar" value={pass.confirm} onChange={e => setPass({ ...pass, confirm: e.target.value })} className="w-full bg-gray-50 p-3 rounded-xl border outline-none text-sm" />
            </div>
            {passError && <p className="text-red-500 text-xs">{passError}</p>}
          </div>
        </div>
        <button className={`w-full font-bold py-3 rounded-xl shadow-lg transition-colors ${saved ? 'bg-green-500 text-white' : 'bg-black text-white'}`}>{saved ? '✓ Guardado' : 'Guardar Cambios'}</button>
      </form>
    </div>
  );
};

// --- AYUDA ---

const HelpView = ({ onBack, onShowTutorial }: { onBack: () => void, onShowTutorial?: () => void }) => {
  const [asunto, setAsunto] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [sent, setSent] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!asunto.trim() || !mensaje.trim()) return;
    const sub = encodeURIComponent(`[Pampa] ${asunto}`);
    const bod = encodeURIComponent(mensaje);
    window.open(`mailto:martinmolina022@gmail.com?subject=${sub}&body=${bod}`);
    setSent(true);
    setAsunto(''); setMensaje('');
    setTimeout(() => setSent(false), 4000);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex items-center gap-3"><button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm"><ArrowLeft size={20} /></button><h2 className="text-2xl font-bold">Ayuda</h2></div>

      {/* FAQs con acordeón */}
      <div className="glass p-6 rounded-[2rem] space-y-1">
        <h3 className="font-bold text-lg mb-4">Preguntas Frecuentes</h3>
        {onShowTutorial && (
          <button onClick={onShowTutorial} className="w-full flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 mb-4 text-left">
            <span className="text-2xl">🎓</span>
            <div>
              <p className="font-bold text-indigo-700 text-sm">Ver tutorial de bienvenida</p>
              <p className="text-xs text-indigo-400">Repasá todas las funciones de la app</p>
            </div>
          </button>
        )}
        {FAQS.map((f, i) => (
          <div key={i} className="border-b last:border-0">
            <button className="w-full text-left py-3 flex justify-between items-center gap-2" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
              <span className="font-bold text-sm">{f.q}</span>
              <span className="text-gray-400 flex-shrink-0 text-lg">{openFaq === i ? '−' : '+'}</span>
            </button>
            {openFaq === i && <p className="text-sm text-gray-500 pb-3">{f.a}</p>}
          </div>
        ))}
      </div>

      {/* Contacto */}
      <div className="glass p-6 rounded-[2rem]">
        <h3 className="font-bold text-lg mb-1">Contacto</h3>
        <p className="text-xs text-gray-400 mb-4">¿Tenés una duda, sugerencia o encontraste un error? Escribinos.</p>
        {sent ? (
          <div className="bg-green-50 rounded-2xl p-5 text-center space-y-1">
            <p className="text-2xl">✅</p>
            <p className="font-bold text-green-700">¡Mensaje enviado!</p>
            <p className="text-sm text-green-600">Se abrió tu cliente de correo. Gracias por escribirnos.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div><label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Asunto</label><input value={asunto} onChange={e => setAsunto(e.target.value)} placeholder="Ej: Sugerencia, Bug, Consulta..." className="w-full bg-gray-50 p-3 rounded-xl outline-none border mt-1" /></div>
            <div><label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Mensaje</label><textarea value={mensaje} onChange={e => setMensaje(e.target.value)} placeholder="Escribí tu mensaje acá..." className="w-full bg-gray-50 p-3 rounded-xl h-28 outline-none border mt-1 resize-none" /></div>
            <button type="submit" disabled={!asunto.trim() || !mensaje.trim()} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50"><Send size={18} /> Enviar</button>
          </form>
        )}
      </div>
    </div>
  );
};

// ============================================================
// DEUDAS
// ============================================================

const DebtCard = ({ debt, onPay, onEdit, onDelete, confirmDeleteId, onConfirmDelete, onCancelDelete }: {
  debt: Debt; onPay: (d: Debt) => void; onEdit: (d: Debt) => void; onDelete: (id: string) => void;
  confirmDeleteId: string | null; onConfirmDelete: (id: string) => void; onCancelDelete: () => void;
}) => {
  const pct = debt.originalAmount > 0 ? Math.max(0, Math.min(100, ((debt.originalAmount - debt.remainingAmount) / debt.originalAmount) * 100)) : 0;
  const isPaid = debt.remainingAmount <= 0;
  return (
    <div className={`glass rounded-2xl p-4 ${isPaid ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold">{debt.person}</p>
            {isPaid && <span className="text-[10px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">✓ Saldado</span>}
          </div>
          {debt.concept && <p className="text-xs text-gray-500 mt-0.5">{debt.concept}</p>}
          <p className="text-xs text-gray-400 mt-0.5">{debt.date}</p>
        </div>
        <div className="text-right ml-3">
          <p className="font-bold text-base">{debt.currency === 'USD' ? 'u$s' : '$'} {fmtARS(debt.remainingAmount)}</p>
          {debt.remainingAmount !== debt.originalAmount && <p className="text-[10px] text-gray-400">de {debt.currency === 'USD' ? 'u$s' : '$'} {fmtARS(debt.originalAmount)}</p>}
        </div>
      </div>
      {!isPaid && debt.remainingAmount < debt.originalAmount && (
        <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3">
          <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {confirmDeleteId === debt.id ? (
        <div className="flex gap-2 mt-2">
          <button onClick={onCancelDelete} className="flex-1 py-2 bg-gray-100 rounded-xl text-sm font-bold">Cancelar</button>
          <button onClick={() => onConfirmDelete(debt.id)} className="flex-1 py-2 bg-red-500 text-white rounded-xl text-sm font-bold">Sí, eliminar</button>
        </div>
      ) : (
        <div className="flex gap-2 mt-2">
          {!isPaid && <button onClick={() => onPay(debt)} className={`flex-1 py-2 text-xs font-bold rounded-xl ${debt.type === 'me_deben' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{debt.type === 'me_deben' ? '💰 Cobrar' : '💸 Pagar'}</button>}
          <button onClick={() => onEdit(debt)} className="px-3 py-2 bg-gray-100 rounded-xl"><Pencil size={14} /></button>
          <button onClick={() => onDelete(debt.id)} className="px-3 py-2 bg-gray-100 rounded-xl text-red-500"><Trash2 size={14} /></button>
        </div>
      )}
    </div>
  );
};

const DebtView = ({ debts, accounts, onAdd, onEdit, onDelete, onPay, onBack, dolarRates }: {
  debts: Debt[]; accounts: AccountItem[];
  onAdd: (d: Omit<Debt, 'id'>, sourceAccount?: string) => Promise<void>;
  onEdit: (d: Debt) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPay: (debtId: string, debtAmountReduced: number, accountName: string, txAmount: number) => Promise<void>;
  onBack: () => void;
  dolarRates: DolarRates | null;
}) => {
  const emptyForm = { person: '', concept: '', amount: '', type: 'me_deben' as 'me_deben' | 'les_debo', date: new Date().toISOString().split('T')[0], currency: 'ARS' as Currency };
  const [showForm, setShowForm] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [sourceAccount, setSourceAccount] = useState('');
  const [payingDebt, setPayingDebt] = useState<Debt | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [payAmount, setPayAmount] = useState('');
  const [payArsAmount, setPayArsAmount] = useState('');
  const [payAccount, setPayAccount] = useState(accounts[0]?.name || '');
  const [confirmDeleteDebtId, setConfirmDeleteDebtId] = useState<string | null>(null);

  const meDeben = debts.filter(d => d.type === 'me_deben' && d.remainingAmount > 0);
  const lesDebo = debts.filter(d => d.type === 'les_debo' && d.remainingAmount > 0);
  const saldados = debts.filter(d => d.remainingAmount <= 0);
  const totalMeDeben = meDeben.reduce((s, d) => s + (d.currency === 'ARS' ? d.remainingAmount : 0), 0);
  const totalLesDebo = lesDebo.reduce((s, d) => s + (d.currency === 'ARS' ? d.remainingAmount : 0), 0);
  const totalMeDebenUSD = meDeben.reduce((s, d) => s + (d.currency === 'USD' ? d.remainingAmount : 0), 0);
  const totalLesDeboUSD = lesDebo.reduce((s, d) => s + (d.currency === 'USD' ? d.remainingAmount : 0), 0);

  const openAdd = (type: 'me_deben' | 'les_debo' = 'me_deben') => {
    setEditingDebt(null);
    setForm({ ...emptyForm, type });
    setSourceAccount('');
    setShowForm(true);
  };

  const openEdit = (d: Debt) => {
    setEditingDebt(d);
    setForm({ person: d.person, concept: d.concept, amount: fmtARS(d.remainingAmount), type: d.type, date: d.date, currency: d.currency });
    setSourceAccount('');
    setShowForm(true);
  };

  const saveForm = async () => {
    if (!form.person.trim() || !form.amount) return;
    const amount = parseInput(form.amount);
    if (editingDebt) {
      await onEdit({ ...editingDebt, person: form.person, concept: form.concept, remainingAmount: amount, date: form.date, currency: form.currency, type: form.type });
    } else {
      await onAdd({ person: form.person, concept: form.concept, originalAmount: amount, remainingAmount: amount, type: form.type, date: form.date, currency: form.currency }, sourceAccount || undefined);
    }
    setShowForm(false);
  };

  const openPay = (d: Debt) => {
    setPayingDebt(d);
    setPayAmount('');
    setPayArsAmount('');
    // Si la deuda es USD, sugerir una cuenta USD primero; si no hay, usar la primera
    const suggestedAccount = d.currency === 'USD'
      ? (accounts.find(a => a.currency === 'USD')?.name || accounts[0]?.name || '')
      : (accounts[0]?.name || '');
    setPayAccount(suggestedAccount);
  };

  const selectedPayAccountCurrency = accounts.find(a => a.name === payAccount)?.currency ?? 'ARS';
  const isUSDDebt = payingDebt?.currency === 'USD';
  const needsConversion = isUSDDebt && selectedPayAccountCurrency === 'ARS';
  const blueRate = dolarRates?.blue ?? 0;

  const savePay = async () => {
    if (!payingDebt || !payAmount) return;
    const debtAmountReduced = parseInput(payAmount); // en la moneda de la deuda
    let txAmount: number;
    if (needsConversion) {
      // Depositar equivalente en ARS al blue
      txAmount = payArsAmount ? parseInput(payArsAmount) : Math.round(debtAmountReduced * blueRate);
    } else {
      txAmount = debtAmountReduced;
    }
    await onPay(payingDebt.id, debtAmountReduced, payAccount, txAmount);
    setPayingDebt(null);
  };

  return (
    <div className="space-y-5 animate-in fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm"><ArrowLeft size={20} /></button><h2 className="text-2xl font-bold">Deudas</h2></div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-50 rounded-2xl p-4 cursor-pointer" onClick={() => openAdd('me_deben')}>
          <p className="text-xs font-bold text-green-600 uppercase">📥 Me deben</p>
          {totalMeDeben > 0 && <p className="text-xl font-bold text-green-700 mt-1">$ {fmtARS(totalMeDeben)}</p>}
          {totalMeDebenUSD > 0 && <p className={`font-bold text-green-600 ${totalMeDeben > 0 ? 'text-sm' : 'text-xl mt-1'}`}>u$s {fmtARS(totalMeDebenUSD)}</p>}
          {totalMeDeben === 0 && totalMeDebenUSD === 0 && <p className="text-xl font-bold text-green-700 mt-1">$ 0</p>}
          <p className="text-xs text-green-500 mt-0.5">{meDeben.length} activa{meDeben.length !== 1 ? 's' : ''} · + Agregar</p>
        </div>
        <div className="bg-red-50 rounded-2xl p-4 cursor-pointer" onClick={() => openAdd('les_debo')}>
          <p className="text-xs font-bold text-red-600 uppercase">📤 Les debo</p>
          {totalLesDebo > 0 && <p className="text-xl font-bold text-red-700 mt-1">$ {fmtARS(totalLesDebo)}</p>}
          {totalLesDeboUSD > 0 && <p className={`font-bold text-red-600 ${totalLesDebo > 0 ? 'text-sm' : 'text-xl mt-1'}`}>u$s {fmtARS(totalLesDeboUSD)}</p>}
          {totalLesDebo === 0 && totalLesDeboUSD === 0 && <p className="text-xl font-bold text-red-700 mt-1">$ 0</p>}
          <p className="text-xs text-red-500 mt-0.5">{lesDebo.length} activa{lesDebo.length !== 1 ? 's' : ''} · + Agregar</p>
        </div>
      </div>

      {(totalMeDeben > 0 || totalLesDebo > 0 || totalMeDebenUSD > 0 || totalLesDeboUSD > 0) && (
        <div className="rounded-2xl p-4 bg-blue-50 space-y-1">
          <p className="text-xs font-bold text-gray-500 uppercase mb-2">Neto</p>
          {(totalMeDeben > 0 || totalLesDebo > 0) && (
            <div className="flex items-baseline gap-1.5">
              <span className={`text-xl font-bold ${totalMeDeben >= totalLesDebo ? 'text-blue-700' : 'text-orange-700'}`}>
                {totalMeDeben >= totalLesDebo ? '+' : '-'} $ {fmtARS(Math.abs(totalMeDeben - totalLesDebo))}
              </span>
              <span className="text-xs text-gray-400">ARS</span>
            </div>
          )}
          {(totalMeDebenUSD > 0 || totalLesDeboUSD > 0) && (
            <div className="flex items-baseline gap-1.5">
              <span className={`text-xl font-bold ${totalMeDebenUSD >= totalLesDeboUSD ? 'text-blue-700' : 'text-orange-700'}`}>
                {totalMeDebenUSD >= totalLesDeboUSD ? '+' : '-'} u$s {fmtARS(Math.abs(totalMeDebenUSD - totalLesDeboUSD))}
              </span>
              <span className="text-xs text-gray-400">USD</span>
            </div>
          )}
          <p className="text-xs text-gray-400 pt-1">
            {(totalMeDeben + totalMeDebenUSD) >= (totalLesDebo + totalLesDeboUSD) ? 'Te deben más de lo que debés' : 'Debés más de lo que te deben'}
          </p>
        </div>
      )}

      {meDeben.length > 0 && (<div><p className="text-xs font-bold text-gray-400 uppercase ml-1 mb-2">📥 Me deben</p><div className="space-y-2">{meDeben.map(d => <DebtCard key={d.id} debt={d} onPay={openPay} onEdit={openEdit} onDelete={id => setConfirmDeleteDebtId(id)} confirmDeleteId={confirmDeleteDebtId} onConfirmDelete={async id => { await onDelete(id); setConfirmDeleteDebtId(null); }} onCancelDelete={() => setConfirmDeleteDebtId(null)} />)}</div></div>)}
      {lesDebo.length > 0 && (<div><p className="text-xs font-bold text-gray-400 uppercase ml-1 mb-2">📤 Les debo</p><div className="space-y-2">{lesDebo.map(d => <DebtCard key={d.id} debt={d} onPay={openPay} onEdit={openEdit} onDelete={id => setConfirmDeleteDebtId(id)} confirmDeleteId={confirmDeleteDebtId} onConfirmDelete={async id => { await onDelete(id); setConfirmDeleteDebtId(null); }} onCancelDelete={() => setConfirmDeleteDebtId(null)} />)}</div></div>)}
      {saldados.length > 0 && (<div><p className="text-xs font-bold text-gray-400 uppercase ml-1 mb-2">✓ Saldados</p><div className="space-y-2">{saldados.map(d => <DebtCard key={d.id} debt={d} onPay={openPay} onEdit={openEdit} onDelete={id => setConfirmDeleteDebtId(id)} confirmDeleteId={confirmDeleteDebtId} onConfirmDelete={async id => { await onDelete(id); setConfirmDeleteDebtId(null); }} onCancelDelete={() => setConfirmDeleteDebtId(null)} />)}</div></div>)}

      {debts.length === 0 && (
        <div className="text-center py-12 space-y-3"><div className="text-5xl">🤝</div><p className="font-bold text-gray-500">Sin deudas registradas</p><p className="text-sm text-gray-400">Tocá "Me deben" o "Les debo" para agregar</p></div>
      )}

      {/* Modal alta/edición */}
      {showForm && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="glass rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-xl font-bold">{editingDebt ? 'Editar deuda' : 'Nueva deuda'}</h3><button onClick={() => setShowForm(false)} className="p-2 bg-gray-100 rounded-full"><X size={18} /></button></div>
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button type="button" onClick={() => setForm({ ...form, type: 'me_deben' })} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${form.type === 'me_deben' ? 'bg-white shadow text-green-700' : 'text-gray-500'}`}>📥 Me deben</button>
              <button type="button" onClick={() => setForm({ ...form, type: 'les_debo' })} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${form.type === 'les_debo' ? 'bg-white shadow text-red-700' : 'text-gray-500'}`}>📤 Les debo</button>
            </div>
            <input placeholder="Persona (ej: Agustín)" value={form.person} onChange={e => setForm({ ...form, person: e.target.value })} className="w-full bg-gray-50 p-3 rounded-xl outline-none border" />
            <input placeholder="Concepto (ej: Préstamo auto, viaje)" value={form.concept} onChange={e => setForm({ ...form, concept: e.target.value })} className="w-full bg-gray-50 p-3 rounded-xl outline-none border" />
            <input type="text" inputMode="decimal" placeholder="Monto" value={form.amount} onChange={e => setForm({ ...form, amount: formatInput(e.target.value) })} className="w-full bg-gray-50 p-3 rounded-xl outline-none border" />
            <div className="flex gap-2">
              <div className="flex bg-gray-100 p-1 rounded-xl flex-1">{(['ARS', 'USD'] as Currency[]).map(c => <button key={c} type="button" onClick={() => setForm({ ...form, currency: c })} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${form.currency === c ? 'bg-white shadow' : ''}`}>{c === 'ARS' ? '🇦🇷 ARS' : '🇺🇸 USD'}</button>)}</div>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="flex-1 bg-gray-50 p-2 rounded-xl outline-none border text-sm" />
            </div>
            {!editingDebt && accounts.length > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">
                  {form.type === 'me_deben' ? '💸 ¿De qué cuenta salió el dinero?' : '💰 ¿En qué cuenta lo recibiste?'} <span className="text-gray-300 font-normal">(opcional)</span>
                </label>
                <select
                  value={sourceAccount}
                  onChange={e => setSourceAccount(e.target.value)}
                  className="w-full bg-gray-50 p-3 rounded-xl outline-none border text-sm"
                >
                  <option value="">— No afectar ninguna cuenta —</option>
                  {accounts.map(a => (
                    <option key={a.name} value={a.name}>{a.name} {a.currency === 'USD' ? '(USD)' : a.currency === 'EUR' ? '(EUR)' : ''}</option>
                  ))}
                </select>
                {sourceAccount && (
                  <p className="text-[11px] text-blue-500 ml-1">
                    {form.type === 'me_deben'
                      ? `✓ Se va a descontar el monto de "${sourceAccount}"`
                      : `✓ Se va a acreditar el monto en "${sourceAccount}"`}
                  </p>
                )}
              </div>
            )}
            <button onClick={saveForm} className="w-full bg-black text-white font-bold py-3 rounded-2xl">Guardar</button>
          </div>
        </div>
      )}

      {/* Modal pago/cobro */}
      {payingDebt && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => setPayingDebt(null)}>
          <div className="glass rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold">{payingDebt.type === 'me_deben' ? '💰 Registrar cobro' : '💸 Registrar pago'}</h3>
              <button onClick={() => setPayingDebt(null)} className="p-2 bg-gray-100 rounded-full"><X size={18} /></button>
            </div>

            <div className="bg-gray-50 rounded-2xl p-3">
              <p className="font-bold">{payingDebt.person}</p>
              {payingDebt.concept && <p className="text-sm text-gray-500">{payingDebt.concept}</p>}
              <p className="text-sm text-gray-400 mt-1">
                Pendiente: <span className="font-bold text-black">{payingDebt.currency === 'USD' ? 'u$s' : '$'} {fmtARS(payingDebt.remainingAmount)}</span>
              </p>
            </div>

            {/* Monto en la moneda de la deuda */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">
                Monto {payingDebt.type === 'me_deben' ? 'cobrado' : 'pagado'} {isUSDDebt ? '(USD)' : '(ARS)'}
              </label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-gray-400 font-bold pl-1">{isUSDDebt ? 'u$s' : '$'}</span>
                <input type="text" inputMode="decimal" placeholder="0" value={payAmount}
                  onChange={e => {
                    setPayAmount(formatInput(e.target.value));
                    if (needsConversion && blueRate > 0) {
                      setPayArsAmount(fmtARS(Math.round(parseInput(formatInput(e.target.value)) * blueRate)));
                    }
                  }}
                  className="flex-1 bg-gray-50 p-3 rounded-xl outline-none border" />
              </div>
              <button type="button"
                onClick={() => {
                  setPayAmount(fmtARS(payingDebt.remainingAmount));
                  if (needsConversion && blueRate > 0) setPayArsAmount(fmtARS(Math.round(payingDebt.remainingAmount * blueRate)));
                }}
                className="text-xs text-indigo-600 font-bold mt-1 ml-1">
                {payingDebt.type === 'me_deben' ? 'Cobrar' : 'Pagar'} todo ({isUSDDebt ? 'u$s' : '$'} {fmtARS(payingDebt.remainingAmount)})
              </button>
            </div>

            {/* Cuenta */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{payingDebt.type === 'me_deben' ? 'Acreditar en' : 'Débitar de'}</label>
              <select value={payAccount} onChange={e => {
                setPayAccount(e.target.value);
                const newCurrency = accounts.find(a => a.name === e.target.value)?.currency ?? 'ARS';
                if (isUSDDebt && newCurrency === 'ARS' && payAmount && blueRate > 0) {
                  setPayArsAmount(fmtARS(Math.round(parseInput(payAmount) * blueRate)));
                }
              }} className="w-full bg-gray-50 p-3 rounded-xl outline-none border mt-1 text-sm">
                {accounts.map(a => <option key={a.id} value={a.name}>{a.name} {a.currency === 'USD' ? '🇺🇸' : '🇦🇷'}</option>)}
              </select>
            </div>

            {/* Conversión ARS — solo cuando deuda USD y cuenta ARS */}
            {needsConversion && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2">
                <p className="text-xs font-bold text-amber-700">💱 Convertir a pesos (cuenta ARS)</p>
                <p className="text-[11px] text-amber-600">Blue: ${fmtARS(blueRate)} · Sugerido: ${payAmount ? fmtARS(Math.round(parseInput(payAmount) * blueRate)) : '0'}</p>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 font-bold text-sm">$</span>
                  <input type="text" inputMode="decimal" placeholder="Monto en ARS" value={payArsAmount}
                    onChange={e => setPayArsAmount(formatInput(e.target.value))}
                    className="flex-1 bg-white p-2.5 rounded-xl outline-none border border-amber-200 text-sm" />
                </div>
              </div>
            )}

            <button onClick={savePay} disabled={!payAmount || !payAccount || (needsConversion && !payArsAmount)}
              className="w-full bg-black text-white font-bold py-3 rounded-2xl disabled:opacity-50">
              {payingDebt.type === 'me_deben' ? 'Registrar cobro' : 'Registrar pago'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// PANTALLA DE BLOQUEO
// ============================================================

const LockScreen = ({ user, onUnlock, onSignOut }: { user: any; onUnlock: () => void; onSignOut: () => void }) => {
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    // Detectar si hay autenticación biométrica (Face ID / Touch ID) disponible
    if (window.PublicKeyCredential) {
      (window.PublicKeyCredential as any).isUserVerifyingPlatformAuthenticatorAvailable?.()
        .then((available: boolean) => setBiometricAvailable(available))
        .catch(() => setBiometricAvailable(false));
    }
  }, []);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pass) return setError('Ingresá tu contraseña');
    setLoading(true); setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password: pass });
    setLoading(false);
    if (authError) setError('Contraseña incorrecta');
    else onUnlock();
  };

  const unlockBiometric = async () => {
    setError(''); setLoading(true);
    try {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 60000,
          userVerification: 'required',
          rpId: window.location.hostname,
          allowCredentials: [],
        }
      });
      // Si WebAuthn pasa (biometría OK), renovar sesión de Supabase silenciosamente
      const { error: sessionError } = await supabase.auth.refreshSession();
      if (sessionError) throw sessionError;
      onUnlock();
    } catch {
      setError('No se pudo verificar. Usá tu contraseña.');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center p-6 overflow-hidden"
      style={{ background: 'linear-gradient(145deg, #0a0a1a 0%, #1a0533 35%, #0d1f3c 65%, #0a1628 100%)' }}>

      {/* Orbs decorativos */}
      <div className="absolute top-[-80px] left-[-60px] w-[320px] h-[320px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.5), transparent 70%)', filter: 'blur(60px)' }} />
      <div className="absolute bottom-[-60px] right-[-40px] w-[280px] h-[280px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.3), transparent 70%)', filter: 'blur(60px)' }} />
      <div className="absolute top-[35%] right-[-30px] w-[200px] h-[200px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.2), transparent 70%)', filter: 'blur(50px)' }} />

      <div className="w-full max-w-xs flex flex-col items-center gap-5 relative z-10 animate-fade-slide">

        {/* Logo + avatar */}
        <div className="flex flex-col items-center gap-3">
          <div style={{ filter: 'drop-shadow(0 0 24px rgba(139,92,246,0.5))' }}>
            <PampaLogo size={52} />
          </div>
          <div className="relative">
            <img src={user.avatar} className="w-20 h-20 rounded-full border-2 border-white/20 object-cover" />
            <div className="absolute -bottom-1 -right-1 rounded-full p-1.5"
              style={{ background: 'rgba(139,92,246,0.8)', backdropFilter: 'blur(8px)' }}>
              <Lock className="text-white" size={12} />
            </div>
          </div>
        </div>

        {/* Nombre */}
        <div className="text-center -mt-1">
          <p className="text-white font-bold text-xl tracking-tight">{user.name}</p>
          <p className="text-white/40 text-sm">{user.email}</p>
        </div>

        {/* Card de unlock */}
        <div className="w-full rounded-3xl p-5 space-y-3"
          style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(32px) saturate(160%)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
          <form onSubmit={unlock} className="space-y-3">
            <input
              type="password"
              value={pass}
              onChange={e => setPass(e.target.value)}
              placeholder="Contraseña"
              autoFocus
              className="w-full text-white placeholder:text-white/30 p-4 rounded-2xl outline-none text-center text-lg tracking-widest"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            />
            {error && <p className="text-red-400 text-xs text-center font-medium">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full font-bold py-3.5 rounded-2xl text-white disabled:opacity-50 transition-all active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', boxShadow: '0 8px 24px rgba(109,40,217,0.4)' }}
            >
              {loading ? 'Verificando...' : 'Desbloquear'}
            </button>
          </form>

          {biometricAvailable && (
            <button
              onClick={unlockBiometric}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 text-white/50 text-sm py-1.5 hover:text-white/80 transition-colors"
            >
              <span className="text-lg">🔐</span> Usar Face ID / Touch ID
            </button>
          )}
        </div>

        <button
          onClick={onSignOut}
          className="text-white/25 text-xs hover:text-white/50 transition-colors"
        >
          Cerrar sesión y salir
        </button>
      </div>
    </div>
  );
};

// ============================================================
// HÁBITOS
// ============================================================

const HabitsView = ({
  habits, logs, onAdd, onDelete, onToggle, onBack, userId
}: {
  habits: Habit[];
  logs: HabitLog[];
  onAdd: (h: Omit<Habit, 'id' | 'createdAt'>) => void;
  onDelete: (id: string) => void;
  onToggle: (habitId: string, date: string) => void;
  onBack: () => void;
  userId: string;
}) => {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ name: string; emoji: string; color: string; frequency: 'daily' | 'weekly' }>({ name: '', emoji: '✅', color: '#10B981', frequency: 'daily' });
  const today = new Date().toISOString().split('T')[0];

  const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { date: d.toISOString().split('T')[0], label: DAY_LABELS[d.getDay()] };
  });

  const getStreak = (habitId: string) => {
    let streak = 0;
    const d = new Date();
    const todayStr = d.toISOString().split('T')[0];
    // Si hoy no está completado, empezar desde ayer para no romper la racha
    if (!logs.some(l => l.habitId === habitId && l.date === todayStr)) {
      d.setDate(d.getDate() - 1);
    }
    while (true) {
      const dateStr = d.toISOString().split('T')[0];
      if (logs.some(l => l.habitId === habitId && l.date === dateStr)) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  };

  const isCompleted = (habitId: string, date: string) => logs.some(l => l.habitId === habitId && l.date === date);
  const todayCompleted = habits.filter(h => isCompleted(h.id, today)).length;
  const completionRate = habits.length ? Math.round((todayCompleted / habits.length) * 100) : 0;

  const HABIT_EMOJIS = [
    '✅','🎯','⭐','🔥','💎','🏆','🌟','✨',
    '🏃','🚴','🏋️','🤸','🧘','🚶','⛹️','🏊',
    '💪','🦾','🧠','❤️','🫀','😴','🛁','🚿',
    '💧','🥗','🍎','🥦','🥑','🍳','☕','🫖',
    '📚','📝','✍️','🎨','🎸','🎵','🎮','🖥️',
    '💰','💸','📊','🏦','💡','🌱','🌿','🌳',
    '🧹','🏠','👨‍👩‍👧','🤝','🙏','😊','☀️','🌙',
    '💊','🩺','🧴','🪥','💆','🧖','🫧','🌊',
  ];

  const HABIT_SUGGESTIONS = [
    { name: 'Tomar agua', emoji: '💧', color: '#3B82F6', frequency: 'daily' as const },
    { name: 'Hacer ejercicio', emoji: '🏃', color: '#10B981', frequency: 'daily' as const },
    { name: 'Revisar finanzas', emoji: '💰', color: '#8B5CF6', frequency: 'daily' as const },
    { name: 'Leer', emoji: '📚', color: '#F59E0B', frequency: 'daily' as const },
    { name: 'Meditar', emoji: '🧘', color: '#6366F1', frequency: 'daily' as const },
    { name: 'Dormir 8 horas', emoji: '😴', color: '#1D4ED8', frequency: 'daily' as const },
    { name: 'Sin delivery', emoji: '🥗', color: '#059669', frequency: 'daily' as const },
    { name: 'Ducha fría', emoji: '🚿', color: '#0EA5E9', frequency: 'daily' as const },
    { name: 'Sin cigarrillos', emoji: '🚭', color: '#DC2626', frequency: 'daily' as const },
    { name: 'Escribir', emoji: '✍️', color: '#7C3AED', frequency: 'daily' as const },
    { name: 'Limpiar la casa', emoji: '🧹', color: '#D97706', frequency: 'weekly' as const },
    { name: 'Andar en bici', emoji: '🚴', color: '#16A34A', frequency: 'weekly' as const },
    { name: 'Ahorrar del día', emoji: '💸', color: '#0D9488', frequency: 'daily' as const },
    { name: 'Sin alcohol', emoji: '🙅', color: '#9D174D', frequency: 'daily' as const },
  ];

  return (
    <div className="space-y-5 animate-in fade-in">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm"><ArrowLeft size={20} /></button>
        <h2 className="text-2xl font-bold flex-1">Hábitos</h2>
        <button onClick={() => setShowForm(true)} className="bg-black text-white px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1"><Plus size={14} /> Nuevo</button>
      </div>

      <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-3xl p-5 text-white">
        <p className="text-sm font-medium opacity-80">Hoy completaste</p>
        <p className="text-4xl font-bold mt-1">{todayCompleted}<span className="text-xl opacity-60">/{habits.length}</span></p>
        <div className="mt-3 bg-white/20 rounded-full h-2">
          <div className="bg-white h-2 rounded-full transition-all duration-700" style={{ width: `${completionRate}%` }} />
        </div>
        <p className="text-xs mt-2 opacity-70">{completionRate}% completado</p>
      </div>

      {habits.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <div className="text-5xl">🌱</div>
          <p className="font-bold text-lg">Empezá tu primer hábito</p>
          <p className="text-sm text-gray-400">Los pequeños hábitos generan grandes cambios</p>
          <button onClick={() => setShowForm(true)} className="bg-black text-white px-6 py-3 rounded-2xl font-bold">Crear hábito</button>
        </div>
      ) : (
        <div className="space-y-3">
          {habits.map(habit => {
            const streak = getStreak(habit.id);
            const completedToday = isCompleted(habit.id, today);
            return (
              <div key={habit.id} className="glass rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onToggle(habit.id, today)}
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 transition-all active:scale-90"
                    style={{ backgroundColor: completedToday ? habit.color : '#F3F4F6' }}
                  >
                    {completedToday ? '✅' : habit.emoji}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold">{habit.name}</p>
                      {streak > 0 && <span className="text-xs font-bold text-orange-500 flex items-center gap-1"><Flame size={11} /> {streak}d</span>}
                    </div>
                    <div className="flex gap-1 mt-2">
                      {last7.map(({ date, label }) => (
                        <button key={date} onClick={() => onToggle(habit.id, date)} className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center transition-colors" style={{ backgroundColor: isCompleted(habit.id, date) ? habit.color : '#F3F4F6' }}>
                            {isCompleted(habit.id, date) && <span className="text-white text-[9px] font-bold">✓</span>}
                          </div>
                          <span className="text-[9px] font-bold" style={{ color: date === today ? '#6366F1' : '#9CA3AF' }}>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => onDelete(habit.id)} className="p-2 text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-t-[2rem] w-full max-w-lg flex flex-col" style={{maxHeight:'88vh'}} onClick={e => e.stopPropagation()}>

            {/* Header fijo — siempre visible */}
            <div className="px-5 pt-5 pb-3 shrink-0">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold">Nuevo Hábito</h3>
                <button onClick={() => setShowForm(false)} className="p-2 bg-gray-100 rounded-full"><X size={18} /></button>
              </div>

              {/* Input nombre — FUERA del scroll, siempre visible */}
              <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-3 py-2 border-2" style={{borderColor: form.color}}>
                <span className="text-2xl">{form.emoji}</span>
                <input
                  value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="Nombre del hábito..."
                  className="flex-1 bg-transparent outline-none text-base font-semibold min-w-0"
                />
              </div>
            </div>

            {/* Scroll solo para el resto de opciones */}
            <div className="overflow-y-scroll flex-1 px-5 pb-3 space-y-4" style={{WebkitOverflowScrolling:'touch' as any}}>

              {/* Sugerencias */}
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase mb-2">💡 Elegí uno o escribí el tuyo</p>
                <div className="flex flex-wrap gap-2">
                  {HABIT_SUGGESTIONS.map(s => (
                    <button
                      key={s.name}
                      type="button"
                      onMouseDown={e => { e.preventDefault(); setForm({ name: s.name, emoji: s.emoji, color: s.color, frequency: s.frequency }); }}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium border-2 transition-all active:scale-95 ${form.name === s.name ? 'border-purple-400 bg-purple-50 text-purple-700' : 'border-gray-100 bg-gray-50 text-gray-700'}`}
                    >
                      <span>{s.emoji}</span><span>{s.name}</span>
                      {s.frequency === 'weekly' && <span className="text-[9px] text-gray-400 font-bold">SEM</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Emojis */}
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase mb-2">Emoji</p>
                <div className="grid gap-1.5" style={{gridTemplateColumns:'repeat(8, 1fr)'}}>
                  {HABIT_EMOJIS.map(e => (
                    <button
                      key={e}
                      type="button"
                      onMouseDown={ev => { ev.preventDefault(); setForm({...form, emoji: e}); }}
                      className={`text-2xl py-1.5 rounded-xl transition-all active:scale-110 ${form.emoji === e ? 'bg-purple-100 shadow' : ''}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase mb-2">Color</p>
                <div className="flex gap-3 flex-wrap">
                  {HABIT_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onMouseDown={ev => { ev.preventDefault(); setForm({...form, color: c}); }}
                      className={`w-10 h-10 rounded-full transition-transform active:scale-110 ${form.color === c ? 'scale-125 ring-4 ring-offset-2 ring-gray-300' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Frecuencia */}
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase mb-2">Frecuencia</p>
                <div className="flex bg-gray-100 p-1 rounded-2xl gap-1">
                  {(['daily', 'weekly'] as const).map(f => (
                    <button
                      key={f}
                      type="button"
                      onMouseDown={ev => { ev.preventDefault(); setForm({...form, frequency: f}); }}
                      className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${form.frequency === f ? 'bg-white shadow text-black' : 'text-gray-400'}`}
                    >
                      {f === 'daily' ? '📅 Diario' : '📆 Semanal'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Botón crear — fijo abajo */}
            <div className="px-5 py-4 shrink-0 border-t border-gray-100">
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  if (!form.name.trim()) return;
                  onAdd(form);
                  setShowForm(false);
                  setForm({ name: '', emoji: '✅', color: '#10B981', frequency: 'daily' });
                }}
                disabled={!form.name.trim()}
                className="w-full font-bold py-4 rounded-2xl text-base transition-all disabled:opacity-40"
                style={{ backgroundColor: form.color, color: 'white' }}
              >
                {form.emoji} Crear "{form.name || 'hábito'}"
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// TUTORIAL DE ONBOARDING
// ============================================================

const TUTORIAL_STEPS = [
  {
    emoji: '👋',
    title: '¡Bienvenido a Pampa!',
    body: 'Tu app personal para controlar ingresos, gastos, ahorros y deudas. Todo en un solo lugar, sin conectar tu banco.',
  },
  {
    emoji: '➕',
    title: 'Registrá tus movimientos',
    body: 'Tocá el botón + para agregar un gasto, ingreso o transferencia. Elegí cuenta, categoría y listo. También podés importar el extracto de Galicia o sincronizar Mercado Pago.',
  },
  {
    emoji: '🏦',
    title: 'Tus cuentas y tarjetas',
    body: 'En la pestaña Cuentas ves el saldo de cada cuenta y tarjeta. Podés tener cuentas en ARS y USD. Para las tarjetas muestra cuánto disponible te queda del límite.',
  },
  {
    emoji: '💱',
    title: 'Operá en dólares',
    body: 'Creá cuentas en USD y registrá compras de dólares como una transferencia entre tu cuenta ARS y tu cuenta USD. La app calcula y muestra el tipo de cambio automáticamente.',
  },
  {
    emoji: '📊',
    title: 'Reportes y presupuestos',
    body: 'En Reportes ves tus gastos por categoría con gráficos y podés filtrar por período. Configurá presupuestos mensuales por categoría para que la app te avise cuando te estás pasando.',
  },
  {
    emoji: '💬',
    title: 'Bot de WhatsApp',
    body: 'Vinculá tu número en Perfil → WhatsApp y registrá gastos mandando mensajes como "gasté 5000 en uber con débito" o "entraron 20000 propina". El bot aprende tus alias y te manda recordatorios diarios.',
  },
  {
    emoji: '🌿',
    title: 'Hábitos financieros',
    body: 'En Reportes → Hábitos creá rutinas de ahorro o control de gastos. Tachá cada día que la cumplís y seguí tu racha. Ideal para "no gastar en delivery", "revisar finanzas" o "ahorrar $X por día".',
  },
  {
    emoji: '🤝',
    title: 'Deudas y préstamos',
    body: 'En Reportes → Deudas registrá plata que te deben o que debés. Podés ir marcando pagos parciales y la app lleva el saldo pendiente de cada deuda automáticamente.',
  },
  {
    emoji: '📈',
    title: 'Proyección de ahorros',
    body: 'En Reportes → Proyección simulá cuánto ahorrás en 1, 2 o 5 años con distintas tasas. Compará plazos fijos, cajas de ahorro y más para elegir la mejor opción para tu plata.',
  },
  {
    emoji: '🔒',
    title: 'Privado y seguro',
    body: 'La app se bloquea sola después de 3 minutos de inactividad. Tus datos están en la nube con cifrado y solo vos los podés ver. ¡Ya estás listo para empezar!',
  },
];

// ============================================================
// APP PRINCIPAL
// ============================================================

export default function App() {
  // ── Detección de nueva versión del SW ─────────────────────────────────────
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegistered(r) { r && setInterval(() => r.update(), 60 * 60 * 1000); }, // re-check cada hora
  });

  // ── Chequeo de versión independiente (funciona en Safari aunque el SW no actualice) ──
  const [newVersionReady, setNewVersionReady] = useState(false);
  useEffect(() => {
    let currentVersion: string | null = null;
    const check = async () => {
      try {
        const res = await fetch('/version.txt?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const v = (await res.text()).trim();
        if (!currentVersion) { currentVersion = v; return; }   // primer chequeo: guardar baseline
        if (v !== currentVersion) setNewVersionReady(true);     // versión nueva → mostrar banner
      } catch { /* sin red, ignorar */ }
    };
    check();
    const id = setInterval(check, 2 * 60 * 1000); // cada 2 minutos
    return () => clearInterval(id);
  }, []);

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem('tutorialDone'));
  const [tutorialStep, setTutorialStep] = useState(0);
  const closeTutorial = () => { localStorage.setItem('tutorialDone', '1'); setShowTutorial(false); };
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accountsList, setAccountsList] = useState<AccountItem[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [toasts, setToasts] = useState<{id: string, msg: string, type: 'success'|'error'}[]>([]);
  const showToast = useCallback((msg: string, type: 'success'|'error' = 'success') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showMenu, setShowMenu] = useState(false);
  // ── AI Analysis ──
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiMonth, setAiMonth] = useState(new Date().getMonth() + 1);
  const [aiYear, setAiYear] = useState(new Date().getFullYear());
  // ── Investments ──
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [showInvestments, setShowInvestments] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [locked, setLocked] = useState(() => localStorage.getItem('appLocked') === 'true');
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenAt = useRef<number | null>(null);

  // Función para bloquear — persiste en localStorage para que nuevas pestañas también bloqueen
  const lockApp = useCallback(() => {
    localStorage.setItem('appLocked', 'true');
    setLocked(true);
  }, []);

  const unlockApp = useCallback(() => {
    localStorage.removeItem('appLocked');
    setLocked(false);
  }, []);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [selectedAccountForAction, setSelectedAccountForAction] = useState<AccountItem | null>(null);
  const [settings, setSettings] = useState({ notifications: false, darkMode: false });
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');
  const [userPlan, setUserPlan] = useState({ noAds: false, whatsappActive: false, mpConnected: false, phone: '' });
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [mpSyncing, setMpSyncing] = useState(false);
  const [mpPreview, setMpPreview] = useState<any[] | null>(null);
  const [mpBalance, setMpBalance] = useState<number | null>(null);
  const [mpSelected, setMpSelected] = useState<Set<string>>(new Set());
  const [mpCardMapping, setMpCardMapping] = useState<Record<string, string>>({}); // cardKey → accountName
  // ── Galicia import ──
  const [importPreview, setImportPreview] = useState<ParsedTx[] | null>(null);
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());
  const [importParsing, setImportParsing] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const importTargetAccount = useRef<AccountItem | null>(null);

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

  const handleMpConnect = () => {
    window.location.href = `${BACKEND_URL}/mp-auth?user_id=${currentUser.id}`;
  };

  const handleMpDisconnect = async () => {
    await fetch(`${BACKEND_URL}/mp-disconnect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: currentUser.id }) });
    setUserPlan(p => ({ ...p, mpConnected: false }));
    showToast('Mercado Pago desconectado');
  };

  const handleMpSync = async (accountName: string) => {
    setMpSyncing(true);
    try {
      const res = await fetch(`${BACKEND_URL}/mp-sync?user_id=${currentUser.id}`);
      if (!res.ok) throw new Error('Error al conectar con Mercado Pago');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      // Filtrar los que ya existen en transacciones (por id mp_XXXX)
      const existingIds = new Set(transactions.map(t => t.id));
      const newTxs = (data.payments || []).filter((p: any) => !existingIds.has(p.id) && p.date);
      const preview = newTxs.map((p: any) => {
        // Determinar cuenta según medio de pago
        let account = accountName; // default: MP
        if (p.paymentType === 'bank_transfer') {
          // Buscar cuenta Galicia en ARS (excluir USD)
          const galicia = accountsList.find(a => a.name.toLowerCase().includes('galicia') && a.currency !== 'USD')
            || accountsList.find(a => a.name.toLowerCase().includes('galicia'));
          if (galicia) account = galicia.name;
        } else if ((p.paymentType === 'credit_card' || p.paymentType === 'debit_card') && p.cardLastFour) {
          // 1. Campo lastFour dedicado (más preciso)
          const matchedByField = accountsList.find(a => a.lastFour === p.cardLastFour);
          // 2. Últimos 4 en el nombre (compatibilidad)
          const matchedByName = accountsList.find(a => a.name.includes(p.cardLastFour));
          const matched = matchedByField || matchedByName;
          if (matched) account = matched.name;
          else {
            const byBrand = accountsList.find(a => a.name.toLowerCase().includes(p.cardMethod?.toLowerCase() || ''));
            if (byBrand) account = byBrand.name;
          }
        }
        return { ...p, account };
      });
      setMpPreview(preview);
      // Auto-destildar pagos con tarjeta ajena (isOwnCard === false)
      setMpSelected(new Set(preview.filter((p: any) => p.isOwnCard !== false).map((p: any) => p.id)));
      setMpBalance(data.balance);
      // Detectar tarjetas sin cuenta asignada
      const unmatched: Record<string, string> = {};
      preview.forEach((p: any) => {
        if (p.cardLastFour && p.isOwnCard !== false) {
          const key = `${p.cardMethod?.toUpperCase() || 'TARJETA'} ****${p.cardLastFour}`;
          const hasAccount = accountsList.some(a => a.lastFour === p.cardLastFour || a.name.includes(p.cardLastFour));
          if (!hasAccount) unmatched[key] = accountName;
        }
      });
      setMpCardMapping(unmatched);
    } catch (e: any) {
      showToast(e.message || 'Error al sincronizar MP', 'error');
    } finally {
      setMpSyncing(false);
    }
  };

  const handleMpImport = async () => {
    if (!mpPreview?.length) return;
    const toImport = mpPreview.filter(p => mpSelected.has(p.id)).slice(0, 100).map((p: any) => {
      // Aplicar card mapping si corresponde
      if (p.cardLastFour) {
        const cardKey = `${p.cardMethod?.toUpperCase() || 'TARJETA'} ****${p.cardLastFour}`;
        if (mpCardMapping[cardKey]) return { ...p, account: mpCardMapping[cardKey] };
      }
      return p;
    });
    const rows = toImport.map((p: any) => ({
      id: p.id, user_id: currentUser.id, amount: p.amount,
      description: p.description, category: p.category,
      account: p.account, method: p.method, type: p.type,
      to_account: null, is_recurring: false, income_type: p.type === 'ingreso' ? 'variable' : null, date: p.date
    }));
    await supabase.from('transactions').upsert(rows, { onConflict: 'id' });
    const newTxObjs = toImport.map((p: any) => ({
      id: p.id, amount: p.amount, description: p.description, category: p.category,
      account: p.account, method: p.method, type: p.type, date: p.date,
      isRecurring: false, incomeType: p.type === 'ingreso' ? 'variable' : undefined
    } as Transaction));
    setTransactions(prev => {
      const existingIds = new Set(prev.map(t => t.id));
      return [...newTxObjs.filter(t => !existingIds.has(t.id)), ...prev];
    });
    // Ajustar saldo real de la cuenta Mercado Pago usando el balance de la API
    if (mpBalance !== null) {
      // Buscar la cuenta de MP específicamente (no la primera transacción)
      const mpAcc = accountsList.find(a =>
        a.name.toLowerCase().includes('mercado pago') ||
        a.name.toLowerCase().includes('mercadopago')
      );
      if (mpAcc) {
        // Merge existing txs (from state snapshot at call time) with newly imported ones
        const existingIds = new Set(transactions.map(t => t.id));
        const allTxs = [...newTxObjs.filter(t => !existingIds.has(t.id)), ...transactions];
        const income      = allTxs.filter(t => t.type === 'ingreso'       && t.account   === mpAcc.name).reduce((s,t) => s+t.amount, 0);
        const expense     = allTxs.filter(t => t.type === 'gasto'          && t.account   === mpAcc.name).reduce((s,t) => s+t.amount, 0);
        const transferOut = allTxs.filter(t => t.type === 'transferencia' && t.account   === mpAcc.name).reduce((s,t) => s+t.amount, 0);
        const transferIn  = allTxs.filter(t => t.type === 'transferencia' && t.toAccount === mpAcc.name).reduce((s,t) => s+t.amount, 0);
        // initial_balance = saldo_real - (ingresos - gastos - transferOut + transferIn)
        const newInitial = mpBalance - income + expense + transferOut - transferIn;
        await supabase.from('accounts').update({ initial_balance: newInitial }).eq('id', mpAcc.id);
        setAccountsList(prev => prev.map(a => a.id === mpAcc.id ? { ...a, initialBalance: newInitial } : a));
      }
    }
    setMpPreview(null);
    showToast(`${toImport.length} movimientos importados de MP ✓`);
  };
  const [dolarRates, setDolarRates] = useState<DolarRates | null>(null);
  const [dolarLoading, setDolarLoading] = useState(false);
  const [activityFilter, setActivityFilter] = useState<{ search: string; type: string; category: string; account: string; method: string; month: string; }>({ search: '', type: '', category: '', account: '', method: '', month: '' });
  const [showByCurrency, setShowByCurrency] = useState(false);
  const [defaultAccountName, setDefaultAccountName] = useState<string>(() => localStorage.getItem('pampa_default_account') || '');

  const [accForm, setAccForm] = useState({ id: '', name: '', provider: 'Default', balance: '', type: 'gastos' as AccountType, limit: '', currency: 'ARS' as Currency, emoji: '', lastFour: '' });
  const [confirmDeleteAccountId, setConfirmDeleteAccountId] = useState<string | null>(null);
  const [transForm, setTransForm] = useState({
    id: '', amount: '', description: '', type: 'gasto' as TransactionType,
    category: 'Comida', account: '', toAccount: '', method: 'debito' as PaymentMethod,
    date: '', isRecurring: false, incomeType: 'fijo' as IncomeType, debtPaymentId: '',
    toAmount: ''
  });
  const [customCategories, setCustomCategories] = useState<Record<string, string[]>>(() => {
    try { return JSON.parse(localStorage.getItem('customCategories') || '{}'); } catch { return {}; }
  });
  const [customCategoryEmojis, setCustomCategoryEmojis] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('customCategoryEmojis') || '{}'); } catch { return {}; }
  });
  const [customAccountEmojis, setCustomAccountEmojis] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('customAccountEmojis') || '{}'); } catch { return {}; }
  });
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [newCategoryEmoji, setNewCategoryEmoji] = useState('📋');
  const [shoppingItems, setShoppingItems] = useState<{id:string; text:string; checked:boolean}[]>(() => {
    try { return JSON.parse(localStorage.getItem('pampa_shopping') || '[]'); } catch { return []; }
  });
  const [shoppingInput, setShoppingInput] = useState('');

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      // Si el token cacheado es gigante (foto base64 en user_metadata), forzar refresh
      if (session?.access_token && session.access_token.length > 5000) {
        console.warn('⚠️ Token demasiado grande, forzando refresh de sesión...');
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.session?.access_token && refreshed.session.access_token.length < 5000) {
          const u = refreshed.session.user!;
          setCurrentUser((prev: any) => ({ ...prev, id: u.id, name: u.user_metadata?.name || u.email?.split('@')[0] || 'Usuario', email: u.email || '', avatar: u.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.email}` }));
          setAuthLoading(false);
          return;
        }
        // Si el refresh también da un token grande, sign out para limpiar
        await supabase.auth.signOut();
        setAuthLoading(false);
        return;
      }
      if (error || !session) {
        // Try to refresh session before giving up
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.session?.user) {
          const u = refreshed.session.user;
          setCurrentUser((prev: any) => ({ ...prev, id: u.id, name: u.user_metadata?.name || u.email?.split('@')[0] || 'Usuario', email: u.email || '', avatar: u.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.email}` }));
        }
      } else if (session?.user) {
        const u = session.user;
        setCurrentUser((prev: any) => ({ ...prev, id: u.id, name: u.user_metadata?.name || u.email?.split('@')[0] || 'Usuario', email: u.email || '', avatar: u.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.email}` }));
      }
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowPasswordReset(true);
        return;
      }
      if (session?.user) {
        const u = session.user;
        setCurrentUser((prev: any) => ({ ...prev, id: u.id, name: u.user_metadata?.name || u.email?.split('@')[0] || 'Usuario', email: u.email || '', avatar: u.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.email}` }));
      } else if (event === 'SIGNED_OUT') {
        // Only clear data on explicit sign out, not on token refresh events
        setCurrentUser(null);
        setTransactions([]); setAccountsList([]); setBudgets([]);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Bloqueo por inactividad (3 minutos) y al volver del background
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      lockApp();
    }, 3 * 60 * 1000); // 3 minutos
  }, [lockApp]);

  useEffect(() => {
    if (!currentUser) return;
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(e => document.addEventListener(e, resetInactivityTimer, { passive: true }));
    resetInactivityTimer();
    return () => {
      events.forEach(e => document.removeEventListener(e, resetInactivityTimer));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [currentUser, resetInactivityTimer]);

  useEffect(() => {
    if (!currentUser) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
      } else if (document.visibilityState === 'visible' && hiddenAt.current) {
        // Bloquear si estuvo en background más de 30 segundos
        if (Date.now() - hiddenAt.current > 30_000) {
          lockApp();
        }
        hiddenAt.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [currentUser]);

  // Sincronizar bloqueo entre pestañas via localStorage events
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'appLocked') {
        setLocked(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Cargar datos del usuario desde Supabase
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const retryCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Muestra aviso de "despertando servidor" después de 5s de loading
  const [loadingSlow, setLoadingSlow] = useState(false);
  useEffect(() => {
    if (!dataLoading) { setLoadingSlow(false); return; }
    const t = setTimeout(() => setLoadingSlow(true), 5000);
    return () => clearTimeout(t);
  }, [dataLoading]);

  // Failsafe: si dataLoading lleva más de 25s activo, auto-recarga la página una vez
  // Esto cubre cualquier edge case donde Safari/SW deja la app bloqueada en loading
  useEffect(() => {
    if (!dataLoading) return;
    const failsafe = setTimeout(() => {
      const reloadCount = parseInt(sessionStorage.getItem('_pampa_reload_count') || '0');
      if (reloadCount < 2) {
        sessionStorage.setItem('_pampa_reload_count', String(reloadCount + 1));
        window.location.reload();
      }
    }, 75000);
    return () => clearTimeout(failsafe);
  }, [dataLoading]);

  // Auto-retry: cuando hay timeout, reintenta en 3s (Supabase ya se despertó)
  useEffect(() => {
    if (dataError && dataError.includes('⏱️') && currentUser?.id && retryCountdown === null) {
      setRetryCountdown(3);
    }
  }, [dataError]);

  useEffect(() => {
    if (retryCountdown === null) return;
    if (retryCountdown <= 0) {
      setRetryCountdown(null);
      if (currentUser?.id) loadUserData(currentUser.id);
      return;
    }
    const id = setTimeout(() => setRetryCountdown(n => n !== null ? n - 1 : null), 1000);
    return () => clearTimeout(id);
  }, [retryCountdown]);

  const loadUserData = useCallback(async (userId: string) => {
    setDataLoading(true);
    setDataError(null);
    setRetryCountdown(null);

    // Promise.race: si las queries tardan más de 20s, el timeout gana y rechaza.
    // Más confiable que AbortController en Safari con SW activo.
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 60000)
    );

    try {
      const [r1, r2, r3, r4, r5, r6] = await Promise.race([
        Promise.all([
          supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }),
          supabase.from('accounts').select('*').eq('user_id', userId),
          supabase.from('budgets').select('*').eq('user_id', userId),
          supabase.from('debts').select('*').eq('user_id', userId).order('date', { ascending: false }),
          supabase.from('habits').select('*').eq('user_id', userId).order('created_at'),
          supabase.from('habit_logs').select('*').eq('user_id', userId),
        ]),
        timeoutPromise,
      ]);

      // Log all errors for debugging
      const allErrors = [r1, r2, r3, r4, r5, r6].map((r: any, i) => r.error ? `[${['tx','acc','bud','dbt','hab','hlog'][i]}] ${r.error.code}: ${r.error.message}` : null).filter(Boolean);
      if (allErrors.length) console.warn('⚠️ Query errors:', allErrors);

      // If main tables fail with auth error → refresh and retry once
      const hasAuthError = [r1, r2].some((r: any) => r.error?.code === 'PGRST301' || r.error?.message?.includes('JWT') || r.error?.status === 401);
      if (hasAuthError) {
        console.warn('⚠️ Auth error — refrescando sesión y reintentando...');
        const { error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr) {
          setDataError(`Sesión expirada. Por favor cerrá sesión y volvé a entrar. (${refreshErr.message})`);
          return;
        }
        const [rr1, rr2, rr3, rr4, rr5, rr6] = await Promise.race([
          Promise.all([
            supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }),
            supabase.from('accounts').select('*').eq('user_id', userId),
            supabase.from('budgets').select('*').eq('user_id', userId),
            supabase.from('debts').select('*').eq('user_id', userId).order('date', { ascending: false }),
            supabase.from('habits').select('*').eq('user_id', userId).order('created_at'),
            supabase.from('habit_logs').select('*').eq('user_id', userId),
          ]),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 20000)),
        ]);
        if (rr1.error) { setDataError(`Error tras refresh: ${rr1.error.message} (${rr1.error.code})`); return; }
        if (rr2.error) { setDataError(`Error cuentas tras refresh: ${rr2.error.message} (${rr2.error.code})`); return; }
        if (rr1.data) setTransactions(rr1.data.map((t: any) => ({ id: t.id, amount: t.amount, description: t.description, category: t.category, account: t.account, toAccount: t.to_account, method: t.method, type: t.type, incomeType: t.income_type, isRecurring: t.is_recurring, date: t.date })));
        if (rr2.data) setAccountsList(rr2.data.map((a: any) => ({ id: a.id, name: a.name, provider: a.provider, initialBalance: a.initial_balance, limit: a.limit_amount, type: a.type, currency: a.currency, lastFour: a.last_four || undefined })));
        if (rr3.data) setBudgets(rr3.data.map((b: any) => ({ category: b.category, limit: b.limit_amount })));
        if (rr4.data) setDebts(rr4.data.map((d: any) => ({ id: d.id, person: d.person, concept: d.concept || '', originalAmount: d.original_amount, remainingAmount: d.remaining_amount, type: d.type, date: d.date, currency: d.currency })));
        if (rr5.data) setHabits(rr5.data.map((h: any) => ({ id: h.id, name: h.name, emoji: h.emoji, color: h.color, frequency: h.frequency, createdAt: h.created_at })));
        if (rr6.data) setHabitLogs(rr6.data.map((l: any) => ({ id: l.id, habitId: l.habit_id, date: l.date })));
        return; // success after refresh
      }

      if (r1.error) { console.error('❌ Transactions:', r1.error); setDataError(`Transacciones: ${r1.error.message} (${r1.error.code})`); }
      if (r2.error) { console.error('❌ Accounts:', r2.error); setDataError(e => e || `Cuentas: ${r2.error!.message} (${r2.error!.code})`); }

      if (r1.data) setTransactions(r1.data.map((t: any) => ({ id: t.id, amount: t.amount, description: t.description, category: t.category, account: t.account, toAccount: t.to_account, method: t.method, type: t.type, incomeType: t.income_type, isRecurring: t.is_recurring, date: t.date })));
      if (r2.data) setAccountsList(r2.data.map((a: any) => ({ id: a.id, name: a.name, provider: a.provider, initialBalance: a.initial_balance, limit: a.limit_amount, type: a.type, currency: a.currency, lastFour: a.last_four || undefined })));
      if (r3.data) setBudgets(r3.data.map((b: any) => ({ category: b.category, limit: b.limit_amount })));
      if (r4.data) setDebts(r4.data.map((d: any) => ({ id: d.id, person: d.person, concept: d.concept || '', originalAmount: d.original_amount, remainingAmount: d.remaining_amount, type: d.type, date: d.date, currency: d.currency })));
      if (r5.data) setHabits(r5.data.map((h: any) => ({ id: h.id, name: h.name, emoji: h.emoji, color: h.color, frequency: h.frequency, createdAt: h.created_at })));
      if (r6.data) setHabitLogs(r6.data.map((l: any) => ({ id: l.id, habitId: l.habit_id, date: l.date })));

      // ── El loading de datos principales terminó — quitar el skeleton AHORA ──
      setDataLoading(false);

      // ── Carga de inversiones (no bloquea el loading) ──
      try {
        const { data: invData } = await supabase.from('investments').select('*').eq('user_id', userId);
        if (invData) setInvestments(invData.map((i: any) => ({ id: i.id, user_id: i.user_id, name: i.name, type: i.type, ticker: i.ticker || undefined, quantity: i.quantity, purchase_price: i.purchase_price, current_price: i.current_price || undefined, currency: i.currency, notes: i.notes || undefined })));
      } catch { /* inversiones no crítico */ }

      // ── Carga secundaria: perfil + metadata — no bloquea el loading indicator ──
      // Se hace con try/catch propio para que un fallo acá no afecte los datos ya cargados
      try {
        const { data: profile } = await supabase.from('profiles').select('no_ads, whatsapp_active, phone, mp_access_token').eq('user_id', userId).single();
        if (profile) {
          setUserPlan({ noAds: profile.no_ads || false, whatsappActive: profile.whatsapp_active || false, mpConnected: !!profile.mp_access_token, phone: profile.phone || '' });
          if (profile.phone) setCurrentUser((u: any) => ({ ...u, phone: profile.phone }));
        }
      } catch { /* perfil no crítico */ }
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser?.user_metadata) {
          const meta = authUser.user_metadata;
          // Migrar a localStorage si todavía están en user_metadata, luego borrarlos del JWT
          let needsCleanup = false;
          if (meta.custom_categories) { setCustomCategories(meta.custom_categories); localStorage.setItem('customCategories', JSON.stringify(meta.custom_categories)); needsCleanup = true; }
          if (meta.custom_category_emojis) { setCustomCategoryEmojis(meta.custom_category_emojis); localStorage.setItem('customCategoryEmojis', JSON.stringify(meta.custom_category_emojis)); needsCleanup = true; }
          if (meta.custom_account_emojis) { setCustomAccountEmojis(meta.custom_account_emojis); localStorage.setItem('customAccountEmojis', JSON.stringify(meta.custom_account_emojis)); needsCleanup = true; }
          // Limpiar user_metadata para que el JWT vuelva a ser pequeño
          if (needsCleanup) {
            supabase.auth.updateUser({ data: { custom_categories: null, custom_category_emojis: null, custom_account_emojis: null } });
          }
        }
      } catch { /* metadata no crítica */ }

    } catch (err: any) {
      console.error('❌ Error cargando datos:', err);
      if (err?.message === 'TIMEOUT') {
        setDataError('⏱️ El servidor tardó demasiado. Reintentando automáticamente...');
      } else {
        setDataError(err?.message || JSON.stringify(err));
      }
    } finally {
      // finally SIEMPRE corre — incluso si Promise.race rechaza por timeout
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUser?.id) return;
    loadUserData(currentUser.id);
  }, [currentUser?.id, loadUserData]);

  // Scroll al top al cambiar de pestaña
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'instant' as any });
  }, [activeTab]);

  // Cotización del dólar — dolarapi.com + open.er-api.com para otras monedas
  const fetchDolarRates = async () => {
    setDolarLoading(true);
    try {
      const [dolarRes, fxRes] = await Promise.all([
        fetch('https://dolarapi.com/v1/dolares'),
        fetch('https://open.er-api.com/v6/latest/USD'),
      ]);
      const [dolarData, fxData] = await Promise.all([dolarRes.json(), fxRes.json()]);
      const blue = dolarData.find((d: any) => d.casa === 'blue');
      const oficial = dolarData.find((d: any) => d.casa === 'oficial');
      const mep = dolarData.find((d: any) => d.casa === 'bolsa');
      const blueRate = blue?.venta ?? 0;
      const oficialRate = oficial?.venta ?? blueRate;
      const fx: Record<string, number> = {};
      if (fxData?.rates) {
        for (const cur of ['BRL', 'EUR', 'UYU', 'CLP', 'COP', 'VES']) {
          if (fxData.rates[cur]) fx[cur] = oficialRate / fxData.rates[cur];
        }
      }
      setDolarRates({ blue: blueRate, oficial: oficialRate, mep: mep?.venta ?? 0, fx, updatedAt: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) });
    } catch { /* sin conexión */ }
    finally { setDolarLoading(false); }
  };

  useEffect(() => { fetchDolarRates(); }, []);

  useEffect(() => {
    if ('Notification' in window) setNotifPermission(Notification.permission);
  }, []);

  // Manejar redirects de Stripe y Mercado Pago
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const type = params.get('type');
    if (payment === 'success') {
      // Reload from Supabase to confirm backend webhook applied the plan
      if (currentUser?.id) loadUserData(currentUser.id);
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('mp_connected') === 'true') {
      setUserPlan(p => ({ ...p, mpConnected: true }));
      showToast('✅ Mercado Pago conectado correctamente');
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('mp_error')) {
      showToast(`Error al conectar MP: ${params.get('mp_error')}`, 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Chequear alertas de presupuesto cuando cambian las transacciones
  useEffect(() => {
    if (settings.notifications && notifPermission === 'granted' && budgets.length && transactions.length) {
      checkBudgetAlerts(budgets, transactions);
    }
  }, [transactions, budgets, settings.notifications, notifPermission]);

  useEffect(() => {
    localStorage.setItem('pampa_shopping', JSON.stringify(shoppingItems));
  }, [shoppingItems]);

  if (showPasswordReset) return (
    <div className="min-h-screen flex items-center justify-center p-6 overflow-hidden"
      style={{ background: 'linear-gradient(145deg, #0a0a1a 0%, #1a0533 35%, #0d1f3c 65%, #0a1628 100%)' }}>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center flex flex-col items-center gap-3">
          <PampaLogo size={56} />
          <h1 className="text-3xl font-black text-white tracking-tight">Nueva contraseña</h1>
          <p className="text-sm text-white/40">Elegí una contraseña segura para tu cuenta</p>
        </div>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const np = fd.get('newpass') as string;
          const cp = fd.get('confirmpass') as string;
          const errEl = document.getElementById('reset-error');
          if (np.length < 6) { if (errEl) errEl.textContent = 'Mínimo 6 caracteres'; return; }
          if (np !== cp) { if (errEl) errEl.textContent = 'Las contraseñas no coinciden'; return; }
          const { error } = await supabase.auth.updateUser({ password: np });
          if (error) { if (errEl) errEl.textContent = error.message; return; }
          setShowPasswordReset(false);
        }}>
          <input
            name="newpass" type="password" placeholder="Nueva contraseña" required
            className="w-full px-4 py-3.5 rounded-2xl text-white placeholder-white/30 outline-none text-sm"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
          />
          <input
            name="confirmpass" type="password" placeholder="Confirmar contraseña" required
            className="w-full px-4 py-3.5 rounded-2xl text-white placeholder-white/30 outline-none text-sm"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
          />
          <p id="reset-error" className="text-red-400 text-xs text-center min-h-[16px]"></p>
          <button type="submit"
            className="w-full py-3.5 rounded-2xl text-white font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', boxShadow: '0 8px 24px rgba(124,58,237,0.4)' }}>
            Guardar contraseña
          </button>
        </form>
      </div>
    </div>
  );

  // ── Hooks que deben ir ANTES de cualquier early return ────────────────────
  // (React Rules of Hooks: siempre llamarlos en el mismo orden en cada render)
  const activityAvailableMonths = useMemo(() => {
    const months = new Set(transactions.map(t => t.date?.slice(0, 7)).filter(Boolean));
    return Array.from(months).sort().reverse();
  }, [transactions]);
  const activityAvailableCategories = useMemo(() => {
    const cats = new Set(transactions.map(t => t.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [transactions]);
  const filteredTxs = useMemo(() => transactions.filter(t => {
    if (activityFilter.search) {
      const q = activityFilter.search.toLowerCase();
      if (!t.description?.toLowerCase().includes(q) && !t.category?.toLowerCase().includes(q) && !t.account?.toLowerCase().includes(q)) return false;
    }
    if (activityFilter.type && t.type !== activityFilter.type) return false;
    if (activityFilter.category && t.category !== activityFilter.category) return false;
    if (activityFilter.account && t.account !== activityFilter.account) return false;
    if (activityFilter.method && t.method !== activityFilter.method) return false;
    if (activityFilter.month && !t.date?.startsWith(activityFilter.month)) return false;
    return true;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [transactions, activityFilter]);

  if (authLoading) return (
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center"><Wallet className="text-white" size={24} /></div>
        <p className="text-sm text-gray-400 font-medium">Cargando...</p>
      </div>
    </div>
  );

  if (!currentUser) return (
    <AuthScreen
      onLogin={async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? traducirError(error.message) : null;
      }}
      onRegister={async (name, email, password) => {
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
        return error ? traducirError(error.message) : null;
      }}
      onForgot={async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        return error ? traducirError(error.message) : null;
      }}
    />
  );

  // --- LOCK SCREEN ---
  if (locked && currentUser) return (
    <LockScreen
      user={currentUser}
      onUnlock={() => { unlockApp(); resetInactivityTimer(); }}
      onSignOut={async () => { unlockApp(); await supabase.auth.signOut(); setCurrentUser(null); }}
    />
  );

  // --- CÁLCULOS ---

  const accountBalances = accountsList.map(acc => {
    const income = transactions.filter(t => t.type === 'ingreso' && t.account === acc.name).reduce((s, t) => s + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'gasto' && t.account === acc.name).reduce((s, t) => s + t.amount, 0);
    const transferOut = transactions.filter(t => t.type === 'transferencia' && t.account === acc.name).reduce((s, t) => s + t.amount, 0);
    const transferIn = transactions.filter(t => t.type === 'transferencia' && t.toAccount === acc.name).reduce((s, t) => s + t.amount, 0);
    return { ...acc, current: acc.initialBalance + income - expense - transferOut + transferIn };
  });

  const blueRate = dolarRates?.blue ?? 0;

  const toARS = (amount: number, currency: string) => {
    if (currency === 'ARS') return amount;
    if (currency === 'USD') return amount * (dolarRates?.blue ?? 0);
    return amount * (dolarRates?.fx?.[currency] ?? 0);
  };

  const liquidBalance = accountBalances
    .filter(a => a.type === 'gastos' || a.type === 'efectivo')
    .reduce((s, a) => s + toARS(a.current, a.currency), 0);
  const usdTotal = accountBalances.filter(a => a.currency === 'USD').reduce((s, a) => s + a.current, 0);

  // Agrupar totales por moneda (para la vista "por moneda")
  const totalsByCurrency = Object.entries(
    accountBalances.reduce((acc, a) => {
      acc[a.currency] = (acc[a.currency] ?? 0) + a.current;
      return acc;
    }, {} as Record<string, number>)
  ).filter(([, v]) => Math.abs(v) > 0);

  // --- ACTIVOS / PASIVOS desglosados ---
  const activosBancos = accountBalances.filter(a => (a.type === 'gastos' || a.type === 'efectivo') && a.currency === 'ARS').reduce((s, a) => s + Math.max(0, a.current), 0);
  const activosAhorroARS = accountBalances.filter(a => a.type === 'ahorro' && a.currency === 'ARS').reduce((s, a) => s + Math.max(0, a.current), 0);
  const activosUSD = accountBalances.filter(a => a.currency === 'USD').reduce((s, a) => s + Math.max(0, a.current), 0);
  const activosMeDeben = debts.filter(d => d.type === 'me_deben' && d.remainingAmount > 0).reduce((s, d) => s + toARS(d.remainingAmount, d.currency), 0);
  const totalActivos = activosBancos + activosAhorroARS + activosUSD * blueRate + activosMeDeben;
  const pasivosTarjetas = accountBalances.filter(a => a.type === 'credito').reduce((s, a) => s + Math.abs(Math.min(0, a.current)), 0);
  const pasivosDeudas = debts.filter(d => d.type === 'les_debo' && d.remainingAmount > 0).reduce((s, d) => s + toARS(d.remainingAmount, d.currency), 0);
  const totalPasivos = pasivosTarjetas + pasivosDeudas;
  const investmentsValueARS = investments.reduce((s, inv) => {
    const price = inv.current_price || inv.purchase_price;
    const valueInCurrency = price * inv.quantity;
    return s + (inv.currency === 'USD' ? valueInCurrency * blueRate : valueInCurrency);
  }, 0);
  const patrimonioNeto = totalActivos + investmentsValueARS - totalPasivos;

  const today = new Date();
  const currentMonthTxs = transactions.filter(t => { const [y, m] = t.date.split('-').map(Number); return y === today.getFullYear() && m === today.getMonth() + 1; });
  const monthlyStats = {
    income: currentMonthTxs.filter(t => t.type === 'ingreso').reduce((s, t) => s + t.amount, 0),
    expense: currentMonthTxs.filter(t => t.type === 'gasto').reduce((s, t) => s + t.amount, 0),
  };
  const percentageBurn = monthlyStats.income > 0 ? (monthlyStats.expense / monthlyStats.income) * 100 : 0;


  // --- HANDLERS ---

  const changeTab = (tab: string) => { setActiveTab(tab); setShowMenu(false); };

  // ── AI Analysis handler ──
  const handleAiAnalysis = async () => {
    if (!currentUser) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const r = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions,
          accounts: accountsList,
          month: aiMonth,
          year: aiYear,
          userName: currentUser.name,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error al analizar');
      setAiAnalysis(data.analysis);
    } catch (err: any) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  // ── Investment handlers ──
  const handleSaveInvestment = async (inv: Investment) => {
    if (!currentUser) return;
    const row = { id: inv.id, user_id: currentUser.id, name: inv.name, type: inv.type, ticker: inv.ticker || null, quantity: inv.quantity, purchase_price: inv.purchase_price, current_price: inv.current_price || null, currency: inv.currency, notes: inv.notes || null };
    const existing = investments.find(i => i.id === inv.id);
    if (existing) {
      await supabase.from('investments').update(row).eq('id', inv.id);
      setInvestments(prev => prev.map(i => i.id === inv.id ? inv : i));
    } else {
      await supabase.from('investments').insert(row);
      setInvestments(prev => [inv, ...prev]);
    }
  };

  const handleDeleteInvestment = async (id: string) => {
    await supabase.from('investments').delete().eq('id', id);
    setInvestments(prev => prev.filter(i => i.id !== id));
  };
  const handleLogout = async () => {
    setShowMenu(false);
    await supabase.auth.signOut();
    setCurrentUser(null);
    setTransactions([]); setAccountsList([]); setBudgets([]);
    window.location.reload();
  };
  const handleUpdateProfile = async (data: any) => {
    setCurrentUser((prev: any) => ({ ...prev, ...data }));
    if (data.phone !== undefined) setUserPlan(p => ({ ...p, phone: data.phone || '' }));
    const metaUpdate: any = {};
    if (data.name) metaUpdate.name = data.name;
    if (data.avatar) metaUpdate.avatar_url = data.avatar;
    if (Object.keys(metaUpdate).length) {
      await supabase.auth.updateUser({ data: metaUpdate });
    }
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!transForm.account) return alert('Primero agregá una cuenta en la sección Cuentas');
    if (!transForm.amount || parseInput(transForm.amount) === 0) return alert('Ingresá un monto válido');
    if (transForm.type === 'transferencia' && !transForm.toAccount) return alert('Seleccioná una cuenta destino');

    try {
      // Detect cross-currency transfer (e.g. ARS → USD)
      const srcAcc = accountsList.find(a => a.name === transForm.account);
      const dstAcc = accountsList.find(a => a.name === transForm.toAccount);
      const isCrossCurrency = transForm.type === 'transferencia' && srcAcc && dstAcc && srcAcc.currency !== dstAcc.currency;

      if (isCrossCurrency) {
        if (!transForm.toAmount || parseInput(transForm.toAmount) === 0) return alert(`Ingresá el monto recibido en ${dstAcc!.currency}`);
        const desc = transForm.description || `Compra ${dstAcc!.currency}`;
        const idOut = Date.now().toString();
        const idIn  = (Date.now() + 1).toString();
        const txOut: Transaction = { id: idOut, amount: parseInput(transForm.amount), description: desc, category: 'Transferencia', account: transForm.account, toAccount: transForm.toAccount, method: 'transferencia', type: 'gasto', date: transForm.date, isRecurring: false };
        const txIn:  Transaction = { id: idIn,  amount: parseInput(transForm.toAmount), description: desc, category: 'Transferencia', account: transForm.toAccount, toAccount: transForm.account, method: 'transferencia', type: 'ingreso', date: transForm.date, isRecurring: false };
        const rowOut = { id: idOut, user_id: currentUser.id, amount: txOut.amount, description: desc, category: 'Transferencia', account: transForm.account, to_account: transForm.toAccount, method: 'transferencia', type: 'gasto', income_type: null, is_recurring: false, date: transForm.date };
        const rowIn  = { id: idIn,  user_id: currentUser.id, amount: txIn.amount,  description: desc, category: 'Transferencia', account: transForm.toAccount, to_account: transForm.account, method: 'transferencia', type: 'ingreso', income_type: null, is_recurring: false, date: transForm.date };
        const { error: insErr } = await supabase.from('transactions').insert([rowOut, rowIn]);
        if (insErr) { showToast('❌ Error al guardar: ' + insErr.message); return; }
        setTransactions(prev => [txIn, txOut, ...prev]);
        showToast('Conversión guardada ✓');
        setShowTransactionModal(false);
        return;
      }

      const tx = { ...transForm, id: transForm.id || Date.now().toString(), amount: parseInput(transForm.amount) } as Transaction;
      const dbRow = { id: tx.id, user_id: currentUser.id, amount: tx.amount, description: tx.description, category: tx.category, account: tx.account, to_account: tx.type === 'transferencia' ? (tx.toAccount || null) : null, method: tx.method, type: tx.type, income_type: tx.incomeType || null, is_recurring: tx.isRecurring || false, date: tx.date };
      if (transForm.id) {
        const { error: updErr } = await supabase.from('transactions').update(dbRow).eq('id', transForm.id);
        if (updErr) { showToast('❌ Error al actualizar: ' + updErr.message); return; }
        setTransactions(prev => prev.map(t => t.id === transForm.id ? tx : t));
      } else {
        const { error: insErr } = await supabase.from('transactions').insert(dbRow);
        if (insErr) { showToast('❌ Error al guardar: ' + insErr.message); return; }
        setTransactions(prev => [tx, ...prev]);
      }
      // Si es pago de deuda, reducir el monto pendiente
      if (transForm.category === 'Pago de deuda' && transForm.debtPaymentId) {
        const debt = debts.find(d => d.id === transForm.debtPaymentId);
        if (debt) {
          const newRemaining = Math.max(0, debt.remainingAmount - tx.amount);
          await supabase.from('debts').update({ remaining_amount: newRemaining }).eq('id', debt.id);
          setDebts(prev => prev.map(d => d.id === debt.id ? { ...d, remainingAmount: newRemaining } : d));
        }
      }
      showToast(transForm.id ? 'Movimiento actualizado ✓' : 'Movimiento guardado ✓');
      setShowTransactionModal(false);
    } catch (err: any) {
      console.error('❌ handleSaveTransaction error:', err);
      showToast('❌ Error inesperado: ' + (err?.message || String(err)));
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) { showToast('❌ Error al eliminar: ' + error.message); return; }
    setTransactions(prev => prev.filter(t => t.id !== id));
    setShowTransactionModal(false);
    setConfirmDeleteId(null);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accForm.name.trim()) return alert('Ingresá un nombre para la cuenta');
    if (!accForm.id && accForm.balance === '') return alert('Ingresá un saldo inicial (puede ser 0)');
    if (accForm.id) {
      const old = accountBalances.find(a => a.id === accForm.id);
      // For credit cards, user enters "disponible" — convert back to actual balance (negative)
      const newBal = accForm.type === 'credito' && accForm.limit
        ? parseInput(accForm.balance) - parseInput(accForm.limit)
        : parseInput(accForm.balance);
      // Recalcular saldo_inicial para que el saldo_actual coincida con lo ingresado,
      // sin crear ninguna transacción de ajuste.
      // saldo_actual = saldo_inicial + ingresos - gastos - transferencias_salida + transferencias_entrada
      // => saldo_inicial_nuevo = newBal - (ingresos - gastos - transf_salida + transf_entrada)
      let newInitialBalance = newBal;
      if (old) {
        const income = transactions.filter(t => t.type === 'ingreso' && t.account === old.name).reduce((s, t) => s + t.amount, 0);
        const expense = transactions.filter(t => t.type === 'gasto' && t.account === old.name).reduce((s, t) => s + t.amount, 0);
        const transferOut = transactions.filter(t => t.type === 'transferencia' && t.account === old.name).reduce((s, t) => s + t.amount, 0);
        const transferIn = transactions.filter(t => t.type === 'transferencia' && t.toAccount === old.name).reduce((s, t) => s + t.amount, 0);
        newInitialBalance = newBal - income + expense + transferOut - transferIn;
      }
      const lastFourClean = accForm.lastFour.replace(/\D/g, '').slice(0, 4) || null;
      const { error: accUpdErr } = await supabase.from('accounts').update({ name: accForm.name, provider: accForm.provider, type: accForm.type, currency: accForm.currency, initial_balance: newInitialBalance, limit_amount: accForm.limit ? parseInput(accForm.limit) : null, last_four: lastFourClean }).eq('id', accForm.id);
      if (accUpdErr) { showToast('❌ Error al guardar cuenta: ' + accUpdErr.message); return; }
      setAccountsList(accountsList.map(a => a.id === accForm.id ? { ...a, name: accForm.name, provider: accForm.provider, type: accForm.type, currency: accForm.currency, initialBalance: newInitialBalance, limit: parseInput(accForm.limit), lastFour: lastFourClean || undefined } : a));
      // Guardar emoji personalizado en localStorage + Supabase
      const updatedAccEmojis = { ...customAccountEmojis, [accForm.id]: accForm.emoji };
      if (!accForm.emoji) delete updatedAccEmojis[accForm.id];
      setCustomAccountEmojis(updatedAccEmojis);
      localStorage.setItem('customAccountEmojis', JSON.stringify(updatedAccEmojis));
      // Solo localStorage — NO user_metadata
    } else {
      const parsedInitialBal = accForm.type === 'credito' && accForm.limit
        ? parseInput(accForm.balance) - parseInput(accForm.limit) // available → actual (negative)
        : parseInput(accForm.balance);
      const lastFourClean = accForm.lastFour.replace(/\D/g, '').slice(0, 4) || null;
      const newAcc = { ...accForm, id: Date.now().toString(), initialBalance: parsedInitialBal, limit: accForm.limit ? parseInput(accForm.limit) : undefined, lastFour: lastFourClean || undefined };
      const { error: accInsErr } = await supabase.from('accounts').insert({ id: newAcc.id, user_id: currentUser.id, name: newAcc.name, provider: newAcc.provider, initial_balance: newAcc.initialBalance, limit_amount: newAcc.limit || null, type: newAcc.type, currency: newAcc.currency, last_four: lastFourClean });
      if (accInsErr) { showToast('❌ Error al crear cuenta: ' + accInsErr.message); return; }
      setAccountsList([...accountsList, newAcc]);
      if (accForm.emoji) {
        const updatedAccEmojis = { ...customAccountEmojis, [newAcc.id]: accForm.emoji };
        setCustomAccountEmojis(updatedAccEmojis);
        localStorage.setItem('customAccountEmojis', JSON.stringify(updatedAccEmojis));
        // Solo localStorage — NO user_metadata
      }
    }
    showToast('Cuenta guardada ✓');
    setShowAccountModal(false);
  };

  const handleFileImport = async (file: File, acc: AccountItem) => {
    setImportParsing(true);
    setSelectedAccountForAction(null);
    try {
      let parsed: ParsedTx[];
      const isPDF = file.name.toLowerCase().endsWith('.pdf');
      const isXLSX = file.name.toLowerCase().match(/\.xlsx?$/);
      if (isPDF) {
        parsed = await parseGaliciaPDF(file, acc.name);
      } else if (isXLSX) {
        parsed = await parseGaliciaXLSX(file, acc.name, acc.currency);
      } else {
        throw new Error('Formato no soportado. Usá PDF o XLSX.');
      }
      // Filter out already-imported transactions
      const existingIds = new Set(transactions.map(t => t.id));
      // Deduplicate by date+amount+description within the file
      const seen = new Set<string>();
      const newTxs = parsed.filter(p => {
        const key = `${p.date}_${p.amount}_${p.description}`;
        if (seen.has(key) || existingIds.has(p.id)) return false;
        seen.add(key);
        return true;
      });
      setImportPreview(newTxs);
      setImportSelected(new Set(newTxs.map(t => t.id)));
    } catch (e: any) {
      alert(`Error al procesar el archivo: ${e.message}`);
    }
    setImportParsing(false);
  };

  const handleBankImport = async () => {
    if (!importPreview?.length) return;
    const toImport = importPreview.filter(p => importSelected.has(p.id));
    if (!toImport.length) return;
    const rows = toImport.map(p => ({
      id: p.id, user_id: currentUser.id, amount: p.amount,
      description: p.description, category: p.category,
      account: p.account, method: p.method, type: p.type,
      to_account: null, is_recurring: false,
      income_type: p.type === 'ingreso' ? 'variable' : null,
      date: p.date,
    }));
    await supabase.from('transactions').upsert(rows, { onConflict: 'id' });
    const newTxObjs = toImport.map(p => ({
      id: p.id, amount: p.amount, description: p.description,
      category: p.category, account: p.account, method: p.method,
      type: p.type, date: p.date, isRecurring: false,
      incomeType: p.type === 'ingreso' ? 'variable' : undefined,
    } as Transaction));
    setTransactions(prev => {
      const ids = new Set(prev.map(t => t.id));
      return [...newTxObjs.filter(t => !ids.has(t.id)), ...prev];
    });
    setImportPreview(null);
    showToast(`${toImport.length} movimientos importados ✓`);
  };

  const handleDeleteAccount = async (accId: string) => {
    await supabase.from('accounts').delete().eq('id', accId);
    setAccountsList(prev => prev.filter(a => a.id !== accId));
    setConfirmDeleteAccountId(null);
    setSelectedAccountForAction(null);
    showToast('Cuenta eliminada');
  };

  const openTxModal = (tx?: Transaction, type: TransactionType = 'gasto', accountName?: string, toAccountName?: string) => {
    if (tx) {
      setTransForm({ id: tx.id, amount: fmtARS(tx.amount), description: tx.description, type: tx.type, category: tx.category, account: tx.account, toAccount: tx.toAccount || '', method: tx.method, date: tx.date, isRecurring: tx.isRecurring || false, incomeType: tx.incomeType || 'fijo', debtPaymentId: '', toAmount: '' });
    } else {
      const savedDefaults = (() => { try { return JSON.parse(localStorage.getItem('pampa_tx_defaults') || '{}'); } catch { return {}; } })();
      const defaultCategory = savedDefaults[`category_${type}`] || CATEGORIES[type][0];
      const defaultMethod = savedDefaults[`method_${type}`] || 'debito';
      const def = accountName || defaultAccountName || savedDefaults[`account_${type}`] || accountsList[0]?.name || '';
      const toDefault = toAccountName || accountsList.find(a => a.name !== def)?.name || '';
      setTransForm({ id: '', amount: '', description: '', type, category: defaultCategory, account: def, toAccount: toDefault, method: defaultMethod, date: new Date().toISOString().split('T')[0], isRecurring: false, incomeType: 'fijo', debtPaymentId: '', toAmount: '' });
    }
    setShowTransactionModal(true);
  };

  const openAccModal = (acc?: any) => {
    if (acc) {
      const displayBalance = acc.type === 'credito' && acc.limit != null
        ? fmtARS(acc.limit + acc.current) // available = limit - debt (current is negative)
        : fmtARS(acc.current);
      setAccForm({ id: acc.id, name: acc.name, provider: acc.provider, balance: displayBalance, type: acc.type, limit: acc.limit ? fmtARS(acc.limit) : '', currency: acc.currency, emoji: customAccountEmojis[acc.id] || '', lastFour: acc.lastFour || '' });
    } else {
      setAccForm({ id: '', name: '', provider: 'Default', balance: '', type: 'gastos', limit: '', currency: 'ARS', emoji: '', lastFour: '' });
    }
    setShowAccountModal(true);
  };

  const allCategories = (type: TransactionType): string[] => [
    ...CATEGORIES[type],
    ...(customCategories[type] || []),
  ];

  const addCustomCategory = (name: string, type: TransactionType, emoji?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const updatedCats = { ...customCategories, [type]: [...(customCategories[type] || []), trimmed] };
    setCustomCategories(updatedCats);
    localStorage.setItem('customCategories', JSON.stringify(updatedCats));
    let updatedEmojis = customCategoryEmojis;
    if (emoji && emoji !== '📋') {
      updatedEmojis = { ...customCategoryEmojis, [trimmed]: emoji };
      setCustomCategoryEmojis(updatedEmojis);
      localStorage.setItem('customCategoryEmojis', JSON.stringify(updatedEmojis));
    }
    // Solo localStorage — NO user_metadata (infla el JWT a 44KB y rompe todos los requests)
    setTransForm(f => ({ ...f, category: trimmed }));
    setAddingCategory(false);
    setNewCategoryInput('');
    setNewCategoryEmoji('📋');
  };

  // getCatEmoji: usa overrides del usuario + defaults
  const getCatEmoji = (cat: string) => getCategoryEmoji(cat, customCategoryEmojis);

  // --- HANDLERS DEUDAS ---

  const handleSaveDebt = async (d: Omit<Debt, 'id'>, sourceAccount?: string) => {
    const newDebt: Debt = { ...d, id: Date.now().toString() };
    await supabase.from('debts').insert({ id: newDebt.id, user_id: currentUser.id, person: newDebt.person, concept: newDebt.concept, original_amount: newDebt.originalAmount, remaining_amount: newDebt.remainingAmount, type: newDebt.type, date: newDebt.date, currency: newDebt.currency });
    setDebts(prev => [newDebt, ...prev]);

    if (sourceAccount) {
      // me_deben = yo presté = gasto de la cuenta; les_debo = me prestaron = ingreso en la cuenta
      const txType: TransactionType = newDebt.type === 'me_deben' ? 'gasto' : 'ingreso';
      const category = newDebt.type === 'me_deben' ? 'Préstamo otorgado' : 'Préstamo recibido';
      const description = newDebt.type === 'me_deben'
        ? `Préstamo a ${newDebt.person}`
        : `Préstamo de ${newDebt.person}`;
      const tx: Transaction = {
        id: (Date.now() + 1).toString(),
        amount: newDebt.originalAmount,
        description,
        category,
        account: sourceAccount,
        method: 'transferencia',
        type: txType,
        date: newDebt.date,
        isRecurring: false,
      };
      const dbRow = { id: tx.id, user_id: currentUser.id, amount: tx.amount, description: tx.description, category: tx.category, account: tx.account, to_account: null, method: tx.method, type: tx.type, income_type: null, is_recurring: false, date: tx.date };
      const { error: txErr } = await supabase.from('transactions').insert(dbRow);
      if (txErr) {
        showToast('⚠️ Deuda guardada pero error en transacción: ' + txErr.message);
      } else {
        setTransactions(prev => [tx, ...prev]);
        const verb = txType === 'gasto' ? 'descontado de' : 'acreditado en';
        showToast(`Deuda guardada ✓ · Monto ${verb} "${sourceAccount}"`);
        return;
      }
    }

    showToast('Deuda guardada ✓');
  };

  const handleEditDebt = async (d: Debt) => {
    await supabase.from('debts').update({ person: d.person, concept: d.concept, remaining_amount: d.remainingAmount, type: d.type, date: d.date, currency: d.currency }).eq('id', d.id);
    setDebts(prev => prev.map(x => x.id === d.id ? d : x));
  };

  const handleDeleteDebt = async (id: string) => {
    await supabase.from('debts').delete().eq('id', id);
    setDebts(prev => prev.filter(d => d.id !== id));
    showToast('Eliminado ✓');
  };

  // --- HANDLERS HÁBITOS ---

  const handleAddHabit = async (data: Omit<Habit, 'id' | 'createdAt'>) => {
    const id = Date.now().toString();
    const habit: Habit = { ...data, id, createdAt: new Date().toISOString() };
    await supabase.from('habits').insert({ id, user_id: currentUser.id, name: data.name, emoji: data.emoji, color: data.color, frequency: data.frequency });
    setHabits(prev => [...prev, habit]);
    showToast('Hábito creado ✓');
  };

  const handleDeleteHabit = async (id: string) => {
    await supabase.from('habits').delete().eq('id', id);
    setHabits(prev => prev.filter(h => h.id !== id));
    setHabitLogs(prev => prev.filter(l => l.habitId !== id));
    showToast('Hábito eliminado');
  };

  const handleToggleHabit = async (habitId: string, date: string) => {
    const existing = habitLogs.find(l => l.habitId === habitId && l.date === date);
    if (existing) {
      await supabase.from('habit_logs').delete().eq('id', existing.id);
      setHabitLogs(prev => prev.filter(l => l.id !== existing.id));
    } else {
      const id = Date.now().toString();
      await supabase.from('habit_logs').insert({ id, habit_id: habitId, user_id: currentUser.id, date });
      setHabitLogs(prev => [...prev, { id, habitId, date }]);
    }
  };

  const handlePayDebt = async (debtId: string, debtAmountReduced: number, accountName: string, txAmount: number) => {
    const debt = debts.find(d => d.id === debtId);
    if (!debt) return;
    const newRemaining = Math.max(0, debt.remainingAmount - debtAmountReduced);
    const txType: TransactionType = debt.type === 'me_deben' ? 'ingreso' : 'gasto';
    const desc = debt.type === 'me_deben' ? `Cobro: ${debt.person}` : `Pago: ${debt.person}`;
    const fullDesc = debt.concept ? `${desc} · ${debt.concept}` : desc;
    const tx: Transaction = { id: Date.now().toString(), amount: txAmount, description: fullDesc, category: debt.type === 'me_deben' ? 'Cobro de deuda' : 'Pago de deuda', account: accountName, method: 'transferencia', type: txType, date: new Date().toISOString().split('T')[0] };
    await supabase.from('transactions').insert({ id: tx.id, user_id: currentUser.id, amount: tx.amount, description: tx.description, category: tx.category, account: tx.account, to_account: null, method: tx.method, type: tx.type, income_type: null, is_recurring: false, date: tx.date });
    setTransactions(prev => [tx, ...prev]);
    await supabase.from('debts').update({ remaining_amount: newRemaining }).eq('id', debtId);
    setDebts(prev => prev.map(d => d.id === debtId ? { ...d, remainingAmount: newRemaining } : d));
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="min-h-screen pampa-bg text-[#1D1D1F] font-sans flex flex-col">


      {/* ── DOCK MENU ────────────────────────────────── */}
      <div className={`fixed inset-0 z-[80] flex items-center justify-center px-6 transition-all duration-300 ${showMenu ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        {/* Backdrop */}
        <div
          className={`absolute inset-0 transition-all duration-300 ${showMenu ? 'opacity-100' : 'opacity-0'}`}
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
          onClick={() => setShowMenu(false)}
        />
        {/* Card */}
        <div className={`relative z-10 w-full max-w-xs rounded-[2rem] overflow-hidden transition-all duration-300 ${showMenu ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'}`}
          style={{ background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)', border: '1px solid rgba(255,255,255,0.9)', boxShadow: '0 32px 80px rgba(0,0,0,0.18)' }}>
          {/* Perfil */}
          <div className="px-5 pt-5 pb-4 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <img src={currentUser.avatar} className="w-11 h-11 rounded-full object-cover ring-2 ring-black/10" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-gray-900 truncate">{currentUser.name}</p>
              <p className="text-xs text-gray-400 truncate">{currentUser.email}</p>
            </div>
            <button onClick={() => setShowMenu(false)} className="w-7 h-7 rounded-full flex items-center justify-center bg-black/8" style={{ background: 'rgba(0,0,0,0.07)' }}>
              <X size={14} className="text-gray-500" />
            </button>
          </div>
          {/* Items */}
          <div className="py-2">
            {[
              { emoji: '👤', label: 'Mi Perfil', tab: 'profile', action: null },
              { emoji: '💸', label: 'Deudas', tab: 'debts', action: null },
              { emoji: '🔥', label: 'Hábitos', tab: 'habits', action: null },
              { emoji: '📊', label: 'Inversiones', tab: null, action: () => { setShowInvestments(true); setShowMenu(false); } },
              { emoji: '🛒', label: 'Lista de compras', tab: 'shopping', action: null },
              { emoji: '📈', label: 'Proyecciones', tab: 'future', action: null },
              { emoji: '🎯', label: 'Presupuestos', tab: null, action: () => { setShowBudgetModal(true); setShowMenu(false); } },
              { emoji: '⚡', label: userPlan.noAds && userPlan.whatsappActive ? 'Plan Pro ✓' : 'Planes', tab: null, action: () => { setShowUpgradeModal(true); setShowMenu(false); } },
              { emoji: '⚙️', label: 'Configuración', tab: 'settings', action: null },
              { emoji: '❓', label: 'Ayuda', tab: 'help', action: null },
            ].map(({ emoji, label, tab, action }) => (
              <button key={label} onClick={action || (() => changeTab(tab!))}
                className="flex items-center gap-3.5 w-full px-5 py-3 text-left transition-colors hover:bg-black/5 active:bg-black/10"
                style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <VE e={emoji} className="text-lg w-7 text-center flex-shrink-0" />
                <span className="text-sm font-medium text-gray-800 flex-1">{label}</span>
                <span className="text-gray-300 text-sm">›</span>
              </button>
            ))}
          </div>
          {/* Logout */}
          <div className="px-5 py-4" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <button onClick={handleLogout} className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-bold transition-colors" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>
              <LogOut size={16} /> Cerrar Sesión
            </button>
          </div>
        </div>
      </div>

      {/* ── HEADER ───────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-[#F5F5F7]/95 backdrop-blur-md px-5 py-3 flex justify-between items-center border-b border-gray-200/50 shadow-sm flex-none">
        <div className="flex items-center gap-2.5">
          <PampaLogo size={36} />
          <div><span className="text-[10px] text-[#86868B] font-medium uppercase tracking-wide">PAMPA</span><h1 className="text-xl font-bold tracking-tight text-black leading-tight">{currentUser.name}</h1></div>
        </div>
        <button onClick={() => setShowMenu(true)} className="w-9 h-9 rounded-full overflow-hidden border-2 border-white shadow-sm"><img src={currentUser.avatar} className="w-full h-full object-cover" /></button>
      </div>

      {/* ── CONTENIDO ────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-5 pt-5 pb-36 space-y-5">
        <div key={showInvestments ? 'investments' : activeTab} className="animate-fade-slide">

        {showInvestments && (
          <InvestmentsView
            investments={investments}
            blueRate={blueRate}
            onSave={handleSaveInvestment}
            onDelete={handleDeleteInvestment}
            onBack={() => setShowInvestments(false)}
          />
        )}

        {!showInvestments && activeTab === 'profile' && <ProfileView user={currentUser} onUpdate={handleUpdateProfile} onBack={() => changeTab('dashboard')} showToast={showToast} />}
        {!showInvestments && activeTab === 'shopping' && (
          <div className="space-y-4 animate-fade-slide">
            <div className="flex items-center gap-3 mb-2">
              <button onClick={() => changeTab('dashboard')} className="p-2 glass rounded-full"><ArrowLeft size={20} /></button>
              <h2 className="text-2xl font-bold">Lista de Compras</h2>
              {shoppingItems.some(i => i.checked) && (
                <button onClick={() => setShoppingItems(prev => prev.filter(i => !i.checked))} className="ml-auto text-xs text-red-500 font-bold">
                  Limpiar ✓
                </button>
              )}
            </div>

            {/* Input agregar */}
            <div className="glass rounded-2xl flex items-center gap-3 px-4 py-3">
              <span className="text-xl">🛒</span>
              <input
                type="text"
                placeholder="Agregar ítem..."
                className="flex-1 bg-transparent outline-none text-sm font-medium placeholder:text-gray-400"
                value={shoppingInput}
                onChange={e => setShoppingInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && shoppingInput.trim()) {
                    setShoppingItems(prev => [{ id: Date.now().toString(), text: shoppingInput.trim(), checked: false }, ...prev]);
                    setShoppingInput('');
                  }
                }}
              />
              <button
                onClick={() => {
                  if (!shoppingInput.trim()) return;
                  setShoppingItems(prev => [{ id: Date.now().toString(), text: shoppingInput.trim(), checked: false }, ...prev]);
                  setShoppingInput('');
                }}
                className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white font-bold text-lg"
              >+</button>
            </div>

            {/* Items */}
            {shoppingItems.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-5xl mb-3">🛍️</p>
                <p className="font-medium">Lista vacía</p>
                <p className="text-xs mt-1">Agregá lo que necesitás comprar</p>
              </div>
            ) : (
              <div className="glass rounded-[2rem] overflow-hidden">
                {/* Pendientes */}
                {shoppingItems.filter(i => !i.checked).map((item, idx, arr) => (
                  <div key={item.id} className={`flex items-center gap-3 px-4 py-3.5 transition-all ${idx < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                    <button
                      onClick={() => setShoppingItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: true } : i))}
                      className="w-6 h-6 rounded-full border-2 border-gray-300 flex-shrink-0 transition-all"
                    />
                    <span className="flex-1 text-sm font-medium">{item.text}</span>
                    <button onClick={() => setShoppingItems(prev => prev.filter(i => i.id !== item.id))} className="text-gray-300 hover:text-red-400 transition-colors p-1">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {/* Comprados */}
                {shoppingItems.filter(i => i.checked).length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-gray-50">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Comprado ({shoppingItems.filter(i => i.checked).length})</p>
                    </div>
                    {shoppingItems.filter(i => i.checked).map((item, idx, arr) => (
                      <div key={item.id} className={`flex items-center gap-3 px-4 py-3 opacity-50 ${idx < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                        <button
                          onClick={() => setShoppingItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: false } : i))}
                          className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0"
                        >
                          <span className="text-white text-xs font-bold">✓</span>
                        </button>
                        <span className="flex-1 text-sm line-through text-gray-400">{item.text}</span>
                        <button onClick={() => setShoppingItems(prev => prev.filter(i => i.id !== item.id))} className="text-gray-200 hover:text-red-400 transition-colors p-1">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {!showInvestments && activeTab === 'help' && <HelpView onBack={() => changeTab('dashboard')} onShowTutorial={() => { setTutorialStep(0); setShowTutorial(true); }} />}
        {!showInvestments && activeTab === 'reports' && (
          <div className="space-y-5 animate-in fade-in">
            {/* ── Análisis IA ── */}
            <div className="glass rounded-[2rem] p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🤖</span>
                  <span className="font-bold text-gray-900">Análisis IA</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={aiMonth}
                    onChange={e => { setAiMonth(Number(e.target.value)); setAiAnalysis(null); }}
                    className="text-xs bg-gray-50 border border-gray-200 rounded-xl px-2 py-1 font-bold"
                  >
                    {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((m, i) => (
                      <option key={i} value={i + 1}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={aiYear}
                    onChange={e => { setAiYear(Number(e.target.value)); setAiAnalysis(null); }}
                    className="text-xs bg-gray-50 border border-gray-200 rounded-xl px-2 py-1 font-bold"
                  >
                    {[new Date().getFullYear() - 1, new Date().getFullYear()].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAiAnalysis}
                    disabled={aiLoading}
                    className="bg-purple-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl disabled:opacity-50 flex items-center gap-1"
                  >
                    {aiLoading ? <><RefreshCw size={11} className="animate-spin" /> Analizando...</> : 'Analizar'}
                  </button>
                </div>
              </div>
              {aiError && (
                <div className="bg-red-50 rounded-xl p-3 text-xs text-red-600 font-medium">{aiError}</div>
              )}
              {!aiAnalysis && !aiLoading && !aiError && (
                <p className="text-xs text-gray-400 text-center py-4">Seleccioná el mes y presioná Analizar para obtener un análisis personalizado de tus finanzas.</p>
              )}
              {aiAnalysis && (
                <div className="space-y-3">
                  {/* Score */}
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-gray-800">{aiAnalysis.titulo}</p>
                    <div className="flex items-center gap-1 bg-purple-50 px-2.5 py-1 rounded-full">
                      <span className="text-xs font-bold text-purple-700">Score {aiAnalysis.score}/10</span>
                      <span className="text-xs">{aiAnalysis.score >= 8 ? '🌟' : aiAnalysis.score >= 5 ? '⭐' : '📉'}</span>
                    </div>
                  </div>
                  {/* Resumen */}
                  <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 rounded-xl p-3">{aiAnalysis.resumen}</p>
                  {/* Highlights */}
                  {aiAnalysis.highlights?.length > 0 && (
                    <div className="space-y-2">
                      {aiAnalysis.highlights.map((h: any, i: number) => (
                        <div key={i} className={`flex items-start gap-2 text-xs p-2.5 rounded-xl ${h.tipo === 'positivo' ? 'bg-green-50 text-green-700' : h.tipo === 'negativo' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                          <span>{h.tipo === 'positivo' ? '✅' : h.tipo === 'negativo' ? '⚠️' : 'ℹ️'}</span>
                          <span className="font-medium">{h.texto}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Categoría destacada */}
                  {aiAnalysis.categoriaDestacada && (
                    <div className="bg-amber-50 rounded-xl p-3 flex items-start gap-2">
                      <span className="text-base">📊</span>
                      <div>
                        <p className="text-xs font-bold text-amber-800">Categoría más gastada: {aiAnalysis.categoriaDestacada.nombre}</p>
                        <p className="text-xs text-amber-600 mt-0.5">{aiAnalysis.categoriaDestacada.comparacion}</p>
                      </div>
                    </div>
                  )}
                  {/* Consejo */}
                  {aiAnalysis.consejo && (
                    <div className="bg-purple-50 rounded-xl p-3 flex items-start gap-2">
                      <span className="text-base">💡</span>
                      <p className="text-xs text-purple-700 font-medium">{aiAnalysis.consejo}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* ── Reportes estándar ── */}
            <ReportsView transactions={transactions} />
          </div>
        )}
        {!showInvestments && activeTab === 'future' && <FutureView liquidBalance={liquidBalance} />}
        {!showInvestments && activeTab === 'debts' && (
          <DebtView
            debts={debts}
            accounts={accountsList}
            onAdd={handleSaveDebt}
            onEdit={handleEditDebt}
            onDelete={handleDeleteDebt}
            onPay={handlePayDebt}
            onBack={() => changeTab('dashboard')}
            dolarRates={dolarRates}
          />
        )}

        {!showInvestments && activeTab === 'habits' && (
          <HabitsView
            habits={habits}
            logs={habitLogs}
            onAdd={handleAddHabit}
            onDelete={handleDeleteHabit}
            onToggle={handleToggleHabit}
            onBack={() => changeTab('dashboard')}
            userId={currentUser.id}
          />
        )}

        {!showInvestments && activeTab === 'settings' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex items-center gap-3"><button onClick={() => changeTab('dashboard')} className="p-2 bg-white rounded-full shadow-sm"><ArrowLeft size={20} /></button><h2 className="text-2xl font-bold">Configuración</h2></div>
            <div className="glass p-6 rounded-[2rem] space-y-5">
              <div className="flex justify-between items-center"><div className="flex items-center gap-3"><Moon size={20} /><div><p className="font-bold">Modo Oscuro</p><p className="text-xs text-gray-400">Próximamente</p></div></div><div onClick={() => setSettings(s => ({ ...s, darkMode: !s.darkMode }))} className={`w-11 h-6 rounded-full relative cursor-pointer transition-colors ${settings.darkMode ? 'bg-black' : 'bg-gray-200'}`}><div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow transition-all ${settings.darkMode ? 'right-0.5' : 'left-0.5'}`} /></div></div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3"><Bell size={20} /><div><p className="font-bold">Notificaciones</p><p className="text-xs text-gray-400">{notifPermission === 'denied' ? 'Bloqueadas en el navegador' : notifPermission === 'granted' ? 'Activas' : 'Tap para activar'}</p></div></div>
                <div onClick={async () => {
                  if (!settings.notifications) {
                    const ok = await requestNotificationPermission();
                    if (ok) { setNotifPermission('granted'); setSettings(s => ({ ...s, notifications: true })); }
                    else setNotifPermission(Notification.permission as NotificationPermission);
                  } else {
                    setSettings(s => ({ ...s, notifications: false }));
                  }
                }} className={`w-11 h-6 rounded-full relative cursor-pointer transition-colors ${settings.notifications ? 'bg-green-500' : 'bg-gray-200'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow transition-all ${settings.notifications ? 'right-0.5' : 'left-0.5'}`} />
                </div>
              </div>
              <button onClick={handleLogout} className="w-full flex items-center gap-3 text-red-600 font-bold border-t pt-5"><LogOut size={20} /> Cerrar Sesión</button>
            </div>
          </div>
        )}

        {/* ── DASHBOARD ──────────────────────────────── */}
        {!showInvestments && activeTab === 'dashboard' && (
          <div className="space-y-5 animate-in fade-in">

            {/* ── Greeting header ── */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 font-medium">
                  {(() => {
                    const h = new Date().getHours();
                    return h < 12 ? '🌅 Buenos días' : h < 19 ? '☀️ Buenas tardes' : '🌙 Buenas noches';
                  })()}
                </p>
                <h1 className="text-2xl font-bold text-gray-900">{currentUser?.name?.split(' ')[0] || 'Pampa'}</h1>
              </div>
              <div className="flex items-center gap-2">
                {habits.length > 0 && (() => {
                  const bestStreak = Math.max(...habits.map(h => {
                    let s = 0;
                    const d = new Date();
                    const todayStr = d.toISOString().split('T')[0];
                    const dc = new Date();
                    if (!habitLogs.some(l => l.habitId === h.id && l.date === todayStr)) dc.setDate(dc.getDate() - 1);
                    while (true) {
                      const ds = dc.toISOString().split('T')[0];
                      if (habitLogs.some(l => l.habitId === h.id && l.date === ds)) { s++; dc.setDate(dc.getDate() - 1); } else break;
                    }
                    return s;
                  }));
                  return bestStreak > 0 ? (
                    <span className="flex items-center gap-1 bg-orange-50 border border-orange-200 text-orange-600 text-xs font-bold px-2.5 py-1 rounded-full">
                      🔥 {bestStreak} días de racha
                    </span>
                  ) : null;
                })()}
                <button onClick={() => currentUser?.id && loadUserData(currentUser.id)} title="Recargar">
                  <RefreshCw size={15} className={`text-gray-400 ${dataLoading ? 'animate-spin text-purple-500' : ''}`} />
                </button>
              </div>
            </div>

            {/* Balance principal — Patrimonio Neto como hero */}
            <div className="glass rounded-[2rem] p-5">
              {dataLoading ? (
                /* Skeleton mientras carga */
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
                  <div className="h-10 bg-gray-200 rounded-xl w-48 mt-2" />
                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-start justify-between gap-1">
                    <div className="h-8 bg-gray-200 rounded-lg w-20" />
                    <div className="h-8 bg-gray-200 rounded-lg w-20" />
                    <div className="h-8 bg-gray-200 rounded-lg w-14" />
                  </div>
                  {loadingSlow && (
                    <p className="text-xs text-orange-500 mt-3 text-center">⏳ Despertando servidor... puede tardar hasta 60s</p>
                  )}
                </div>
              ) : dataError ? (
                /* Error con retry */
                <div className="mt-2 space-y-2">
                  <p className="text-red-500 text-xs">{dataError}</p>
                  {retryCountdown !== null ? (
                    <div className="bg-orange-50 rounded-xl px-4 py-2 flex items-center justify-between">
                      <span className="text-orange-600 text-xs font-medium">Reintentando en {retryCountdown}s...</span>
                      <button onClick={() => { setRetryCountdown(null); loadUserData(currentUser.id); }} className="text-orange-700 text-xs font-bold underline">Ahora</button>
                    </div>
                  ) : (
                    <button onClick={() => loadUserData(currentUser.id)} className="bg-red-500 text-white text-xs font-bold px-4 py-2 rounded-xl w-full">
                      Reintentar
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-[10px] text-[#86868B] font-bold uppercase tracking-wide">Patrimonio Neto</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-light text-[#86868B]">$</span>
                    <h2 className="text-4xl font-semibold tracking-tighter">{fmtARS(patrimonioNeto)}</h2>
                  </div>
                  {/* Neto para gastar — métrica secundaria prominente */}
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">Neto para Gastar</p>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="text-sm font-light text-gray-500">$</span>
                          <span className="text-2xl font-semibold text-gray-800">{fmtARS(liquidBalance)}</span>
                        </div>
                        {(() => {
                          const todayStr = new Date().toISOString().split('T')[0];
                          const spentToday = transactions.filter(t => t.type === 'gasto' && t.date === todayStr).reduce((s, t) => s + t.amount, 0);
                          return spentToday > 0 ? (
                            <p className="text-[10px] text-red-400 font-medium mt-0.5">- $ {fmtARS(spentToday)} gastado hoy</p>
                          ) : null;
                        })()}
                      </div>
                      {totalsByCurrency.some(([c]) => c !== 'ARS') && (
                        <button onClick={() => setShowByCurrency(v => !v)} className="text-[10px] font-bold text-purple-500 bg-purple-50 px-2 py-1 rounded-full">
                          {showByCurrency ? 'ARS' : 'monedas'}
                        </button>
                      )}
                    </div>
                    {showByCurrency && (
                      <div className="mt-2 space-y-0.5">
                        {totalsByCurrency.map(([cur, val]) => (
                          <div key={cur} className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">{(CURRENCY_FLAGS as any)[cur] || '🌐'} {cur}</span>
                            <span className="font-bold text-gray-700">{(CURRENCY_SYMBOLS as any)[cur] || cur} {fmtARS(val)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-start justify-between gap-1">
                    <div>
                      <p className="text-[10px] text-green-500 font-bold uppercase">Ingresos</p>
                      <p className="text-xs font-bold text-green-600 mt-0.5 whitespace-nowrap">$ {fmtARS(monthlyStats.income)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-red-500 font-bold uppercase flex items-center justify-center gap-0.5"><Flame size={9} />Gastos</p>
                      <p className="text-xs font-bold text-red-500 mt-0.5 whitespace-nowrap">$ {fmtARS(monthlyStats.expense)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Balance</p>
                      <p className={`text-sm font-bold mt-0.5 ${monthlyStats.income - monthlyStats.expense >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                        {monthlyStats.income - monthlyStats.expense >= 0 ? '+' : ''}$ {fmtARS(monthlyStats.income - monthlyStats.expense)}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Aviso carga manual */}
            <p className="text-[10px] text-gray-400 text-center -mt-2">✏️ Todos los datos son ingresados manualmente · Sin conexión a bancos</p>

            {/* Diagnóstico visible cuando hay error o datos en 0 */}
            {!dataLoading && transactions.length === 0 && accountsList.length === 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 text-center space-y-3">
                {retryCountdown !== null ? (
                  <>
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-8 h-8 rounded-full border-2 border-orange-400 flex items-center justify-center">
                        <span className="text-orange-600 font-bold text-sm">{retryCountdown}</span>
                      </div>
                      <p className="text-orange-700 font-bold text-sm">El servidor está despertando...</p>
                    </div>
                    <p className="text-orange-500 text-xs">Supabase free tier entra en pausa después de un tiempo. Reintentando automáticamente en {retryCountdown}s.</p>
                    <button
                      onClick={() => { setRetryCountdown(null); currentUser?.id && loadUserData(currentUser.id); }}
                      className="w-full bg-orange-500 text-white text-xs font-bold px-3 py-2 rounded-xl"
                    >⚡ Reintentar ahora</button>
                  </>
                ) : (
                  <>
                    <p className="text-red-600 font-bold text-sm">⚠️ No se cargaron datos</p>
                    {dataError ? (
                      <p className="text-red-500 text-xs font-mono break-all bg-red-100 rounded-xl p-2">{dataError}</p>
                    ) : (
                      <p className="text-red-400 text-xs">Sin error visible — las queries llegaron vacías</p>
                    )}
                    <p className="text-gray-400 text-xs">User: {currentUser?.email} · ID: {currentUser?.id?.slice(0,8)}...</p>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => currentUser?.id && loadUserData(currentUser.id)}
                        className="flex-1 bg-red-500 text-white text-xs font-bold px-3 py-2 rounded-xl"
                      >🔄 Reintentar</button>
                      <button
                        onClick={() => { localStorage.removeItem('sw_supabase_fix_v2'); window.location.href = '/?reset=1'; }}
                        className="flex-1 bg-purple-600 text-white text-xs font-bold px-3 py-2 rounded-xl"
                      >🧹 Limpiar caché</button>
                      <button
                        onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }}
                        className="w-full bg-gray-700 text-white text-xs font-bold px-3 py-2 rounded-xl"
                      >🚪 Cerrar sesión</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Ad Banner — solo para usuarios free */}
            {!userPlan.noAds && <AdBanner onUpgrade={() => setShowUpgradeModal(true)} />}

            {/* Widget WhatsApp — no mostrar mientras cargan los datos del plan */}
            {dataLoading ? null : !userPlan.whatsappActive ? (
              /* Promo: no tiene el plan */
              <div className="rounded-2xl p-4 flex items-center gap-3" style={{background:'linear-gradient(135deg,#25D366 0%,#128C7E 100%)'}}>
                <div className="text-3xl shrink-0">💬</div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm">Bot de WhatsApp</p>
                  <p className="text-green-100 text-xs mt-0.5">Registrá gastos con mensajes de voz o texto</p>
                </div>
                <button
                  onClick={() => setShowUpgradeModal(true)}
                  className="bg-white text-green-700 font-bold text-xs px-3 py-2 rounded-xl shrink-0"
                >
                  $1/mes
                </button>
              </div>
            ) : !userPlan.phone ? (
              /* Tiene el plan pero no configuró el teléfono */
              <div className="rounded-2xl p-4 flex items-center gap-3 bg-green-50 border-2 border-green-200">
                <div className="text-2xl">💬</div>
                <div className="flex-1">
                  <p className="font-bold text-green-800 text-sm">WhatsApp activo ✓</p>
                  <p className="text-green-600 text-xs mt-0.5">Configurá tu número para empezar</p>
                </div>
                <button
                  onClick={() => changeTab('profile')}
                  className="bg-green-600 text-white font-bold text-xs px-3 py-2 rounded-xl shrink-0"
                >
                  Configurar
                </button>
              </div>
            ) : (
              /* Todo activo */
              <div className="rounded-2xl p-3 flex items-center gap-3 bg-green-50 border border-green-100">
                <div className="w-9 h-9 bg-green-500 rounded-xl flex items-center justify-center shrink-0">
                  <span className="text-white text-lg">💬</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-green-800 text-sm">WhatsApp conectado</p>
                  <p className="text-green-500 text-xs truncate">{userPlan.phone}</p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const r = await fetch('https://pampa-whatsapp-bot-production.up.railway.app/link', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone: userPlan.phone, user_id: currentUser.id, name: currentUser.name }),
                      });
                      if (r.ok) showToast('📱 Mensaje enviado a WhatsApp');
                      else showToast('❌ Error al enviar. Revisá los logs del bot.');
                    } catch { showToast('❌ Error al conectar con el bot'); }
                  }}
                  className="text-green-600 text-xs font-bold bg-green-100 px-3 py-2 rounded-xl shrink-0"
                >
                  Probar
                </button>
              </div>
            ) /* cierra dataLoading ? null : */ }

            {/* Widget Dólar */}
            <div className="glass-dark rounded-2xl p-4 text-white">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2"><DollarSign size={15} className="text-green-400" /><span className="text-xs font-bold text-gray-300 uppercase tracking-wide">Dólar Hoy</span></div>
                <button onClick={fetchDolarRates} className="text-gray-400 hover:text-white transition-colors">
                  <RefreshCw size={14} className={dolarLoading ? 'animate-spin' : ''} />
                </button>
              </div>
              {dolarRates ? (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[{ label: 'Blue', val: dolarRates.blue }, { label: 'Oficial', val: dolarRates.oficial }, { label: 'MEP', val: dolarRates.mep }].map(({ label, val }) => (
                      <div key={label}><p className="text-[10px] text-gray-400 uppercase">{label}</p><p className="text-base font-bold">$ {fmtARS(val)}</p></div>
                    ))}
                  </div>
                  {usdTotal > 0 && (
                    <div className="bg-white/10 rounded-xl p-2.5 flex justify-between items-center">
                      <span className="text-xs text-gray-300">Tus u$s {fmtARS(usdTotal)}</span>
                      <span className="text-sm font-bold text-green-400">≈ $ {fmtARS((usdTotal * dolarRates.blue))}</span>
                    </div>
                  )}
                  {/* Otras monedas en portfolio */}
                  {accountBalances
                    .map(a => a.currency)
                    .filter((c, i, arr) => c !== 'ARS' && c !== 'USD' && arr.indexOf(c) === i)
                    .map(cur => ({ cur, rate: dolarRates.fx?.[cur] }))
                    .filter(({ rate }) => rate && rate > 0)
                    .map(({ cur, rate }) => (
                      <div key={cur} className="flex justify-between items-center text-sm mt-1">
                        <span className="text-gray-400">{CURRENCY_FLAGS[cur]} {cur}</span>
                        <span className="text-white font-bold">$ {fmtARS(rate!)}</span>
                      </div>
                    ))
                  }
                  <p className="text-[10px] text-gray-500 mt-2 text-right">Act. {dolarRates.updatedAt} · dolarapi.com</p>
                </>
              ) : (
                <div className="flex items-center gap-2 text-gray-400 py-1"><RefreshCw size={13} className="animate-spin" /><span className="text-sm">Cargando cotización...</span></div>
              )}
            </div>

            {/* Presupuestos */}
            {budgets.length > 0 && (
              <div className="glass rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/30 flex justify-between items-center">
                  <span className="font-bold">Presupuestos del mes</span>
                  <button onClick={() => setShowBudgetModal(true)} className="text-xs text-blue-500 font-bold flex items-center gap-1"><Pencil size={11} /> Editar</button>
                </div>
                {budgets.map(b => {
                  const spent = currentMonthTxs.filter(t => t.type === 'gasto' && t.category === b.category).reduce((s, t) => s + t.amount, 0);
                  const pct = b.limit > 0 ? Math.min((spent / b.limit) * 100, 100) : 0;
                  const isOver = spent > b.limit, isWarn = pct > 80 && !isOver;
                  return (
                    <div key={b.category} className="px-4 py-3 border-b border-gray-50 last:border-0">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-sm font-bold"><VE e={getCategoryEmoji(b.category)} /> {b.category}</span>
                        <span className={`text-xs font-bold ${isOver ? 'text-red-500' : isWarn ? 'text-yellow-600' : 'text-gray-400'}`}>$ {fmtARS(spent)} / $ {fmtARS(b.limit)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: isOver ? '#EF4444' : isWarn ? '#F59E0B' : '#10B981' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Patrimonio neto — desglose activos/pasivos */}
            <div className="glass rounded-[2rem] overflow-hidden">
              {/* Header */}
              <div className="px-5 pt-5 pb-4 flex justify-between items-start border-b border-white/30">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Patrimonio Neto Real</span>
                  <p className={`text-3xl font-bold mt-0.5 ${patrimonioNeto >= 0 ? 'text-black' : 'text-red-600'}`}>
                    {patrimonioNeto < 0 ? '-' : ''} $ {fmtARS(Math.abs(Math.round(patrimonioNeto)))}
                  </p>
                  {!dolarRates && <p className="text-[10px] text-gray-400 mt-1">Actualizando cotización USD...</p>}
                </div>
                <div className={`px-3 py-1.5 rounded-full text-xs font-bold ${patrimonioNeto >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {patrimonioNeto >= 0 ? '▲ Positivo' : '▼ Negativo'}
                </div>
              </div>

              {/* Activos */}
              <div className="px-5 py-3 border-b border-gray-50">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-green-600 uppercase tracking-wide">✅ Activos</span>
                  <span className="text-sm font-bold text-green-700">$ {fmtARS(Math.round(totalActivos))}</span>
                </div>
                <div className="space-y-1.5">
                  {activosBancos > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">🏦 Bancos / Efectivo</span>
                      <span className="text-xs font-bold text-gray-600">$ {fmtARS(Math.round(activosBancos))}</span>
                    </div>
                  )}
                  {activosAhorroARS > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">🐷 Ahorros e Inversiones</span>
                      <span className="text-xs font-bold text-gray-600">$ {fmtARS(Math.round(activosAhorroARS))}</span>
                    </div>
                  )}
                  {activosUSD > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">🇺🇸 USD (u$s {fmtARS(activosUSD)} × ${fmtARS(blueRate)})</span>
                      <span className="text-xs font-bold text-gray-600">$ {fmtARS(Math.round(activosUSD * blueRate))}</span>
                    </div>
                  )}
                  {activosMeDeben > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">🤝 Me deben</span>
                      <span className="text-xs font-bold text-gray-600">$ {fmtARS(Math.round(activosMeDeben))}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Pasivos */}
              <div className="px-5 py-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-red-500 uppercase tracking-wide">🔴 Pasivos</span>
                  <span className="text-sm font-bold text-red-600">$ {fmtARS(Math.round(totalPasivos))}</span>
                </div>
                {totalPasivos === 0 ? (
                  <p className="text-xs text-gray-300 italic">Sin deudas registradas</p>
                ) : (
                  <div className="space-y-1.5">
                    {pasivosTarjetas > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-400">💳 Tarjetas de crédito</span>
                        <span className="text-xs font-bold text-red-500">- $ {fmtARS(Math.round(pasivosTarjetas))}</span>
                      </div>
                    )}
                    {pasivosDeudas > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-400">🤝 Deudas personales</span>
                        <span className="text-xs font-bold text-red-500">- $ {fmtARS(Math.round(pasivosDeudas))}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Empty state para usuario nuevo */}
            {accountsList.length === 0 && (
              <div className="glass rounded-[2rem] p-6 text-center space-y-4">
                <div className="text-5xl">👋</div>
                <h3 className="font-bold text-lg">¡Bienvenido a Pampa!</h3>
                <p className="text-sm text-gray-500">Empezá agregando tus cuentas bancarias para ver tu balance real.</p>
                <button onClick={() => { changeTab('accounts'); setTimeout(() => openAccModal(), 100); }} className="w-full bg-black text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2">
                  <Plus size={18} /> Agregar mi primera cuenta
                </button>
                <div className="bg-gray-50 rounded-2xl p-4 text-left space-y-2 mt-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">📋 Cómo funciona</p>
                  <p className="text-xs text-gray-400">• Todo se carga <strong>manualmente</strong> — vos ingresás tus movimientos a mano o por WhatsApp.</p>
                  <p className="text-xs text-gray-400">• <strong>No se conecta</strong> a tu banco ni accede a tus cuentas.</p>
                  <p className="text-xs text-gray-400">• No pedimos DNI, CUIL ni datos sensibles.</p>
                </div>
              </div>
            )}

            {/* Widget Hábitos */}
            {habits.length > 0 && (() => {
              const today = new Date().toISOString().split('T')[0];
              const todayDone = habits.filter(h => habitLogs.some(l => l.habitId === h.id && l.date === today)).length;
              const pct = Math.round((todayDone / habits.length) * 100);
              return (
                <button onClick={() => changeTab('habits')} className="glass rounded-2xl p-4 w-full text-left active:scale-[0.98] transition-transform">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🔥</span>
                      <span className="font-bold text-sm">Hábitos de hoy</span>
                    </div>
                    <span className="text-xs text-gray-400 font-medium">{todayDone}/{habits.length} · {pct}%</span>
                  </div>
                  <div className="flex gap-2 mb-3">
                    {habits.slice(0, 6).map(h => {
                      const done = habitLogs.some(l => l.habitId === h.id && l.date === today);
                      return (
                        <div key={h.id} className={`w-9 h-9 rounded-full flex items-center justify-center text-base transition-all ${done ? 'opacity-100 scale-100' : 'opacity-30 scale-95'}`} style={{ backgroundColor: done ? h.color + '30' : '#F3F4F6' }}>
                          {done ? '✅' : h.emoji}
                        </div>
                      );
                    })}
                    {habits.length > 6 && <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-400 font-bold">+{habits.length - 6}</div>}
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#22c55e' : '#6366f1' }} />
                  </div>
                </button>
              );
            })()}

            {/* Widget Inversiones */}
            <button onClick={() => setShowInvestments(true)} className="glass rounded-2xl px-4 py-3 w-full flex items-center gap-3 active:scale-[0.98] transition-transform">
              <span className="text-2xl">📊</span>
              <div className="flex-1 text-left">
                <p className="font-bold text-sm">Inversiones</p>
                {investments.length > 0 ? (
                  <p className="text-xs text-gray-400">
                    {investments.length} activo{investments.length !== 1 ? 's' : ''} · $ {fmtARS(investments.reduce((s, inv) => {
                      const price = inv.current_price || inv.purchase_price;
                      const val = price * inv.quantity;
                      return s + (inv.currency === 'USD' ? val * blueRate : val);
                    }, 0))}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400">Registrá tus cripto, acciones y activos</p>
                )}
              </div>
              <span className="text-gray-300 text-sm">›</span>
            </button>

            {/* Shortcut lista de compras */}
            {shoppingItems.filter(i => !i.checked).length > 0 && (
              <button onClick={() => changeTab('shopping')} className="glass rounded-2xl px-4 py-3 w-full flex items-center gap-3 active:scale-[0.98] transition-transform">
                <span className="text-2xl">🛒</span>
                <div className="flex-1 text-left">
                  <p className="font-bold text-sm">Lista de compras</p>
                  <p className="text-xs text-gray-400">{shoppingItems.filter(i => !i.checked).length} ítem{shoppingItems.filter(i => !i.checked).length !== 1 ? 's' : ''} pendiente{shoppingItems.filter(i => !i.checked).length !== 1 ? 's' : ''}</p>
                </div>
                <span className="text-gray-300 text-sm">›</span>
              </button>
            )}

            {/* Actividad reciente */}
            {accountsList.length > 0 && (
            <div className="glass rounded-[2rem] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/30 flex justify-between items-center">
                <span className="font-bold">Actividad Reciente</span>
                <button onClick={() => changeTab('activity')} className="text-xs text-blue-500 font-bold">Ver todo</button>
              </div>
              {transactions.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-sm font-medium">Sin movimientos aún</p>
                  <p className="text-xs mt-1">Usá el botón + para agregar uno</p>
                </div>
              ) : transactions.slice(0, 4).map((t, i) => (
                <div key={t.id} onClick={() => openTxModal(t)} className={`px-4 py-3 flex items-center justify-between cursor-pointer transition-all duration-150 hover:bg-gray-50 active:scale-[0.99] ${i !== 3 ? 'border-b border-gray-50' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base flex-shrink-0 ${t.type === 'ingreso' ? 'bg-green-100' : t.type === 'transferencia' ? 'bg-blue-100' : 'bg-gray-100'}`}><VE e={getCatEmoji(t.category)} /></div>
                    <div><p className="font-bold text-sm">{t.description}</p><p className="text-xs text-gray-400">{t.account}{t.type === 'transferencia' && t.toAccount ? ` → ${t.toAccount}` : ''} · {t.date}</p></div>
                  </div>
                  <span className={`font-bold text-sm ml-2 flex-shrink-0 ${t.type === 'ingreso' ? 'text-green-600' : t.type === 'transferencia' ? 'text-blue-600' : 'text-black'}`}>
                    {t.type === 'ingreso' ? '+' : t.type === 'transferencia' ? '↔' : '-'} ${fmtARS(t.amount)}
                  </span>
                </div>
              ))}
            </div>
            )}
          </div>
        )}

        {/* ── CUENTAS ────────────────────────────────── */}
        {!showInvestments && activeTab === 'accounts' && (
          <div className="space-y-5 animate-in fade-in">
            <div className="flex justify-between items-center"><h2 className="text-2xl font-bold">Mis Cuentas</h2><button onClick={() => openAccModal()} className="bg-black text-white px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1"><Plus size={14} /> Agregar</button></div>
            {(['gastos', 'efectivo', 'credito', 'ahorro'] as AccountType[]).map(type => {
              const accs = accountBalances.filter(a => a.type === type);
              if (!accs.length) return null;
              const TypeIcon = ACCOUNT_TYPE_ICONS[type];
              return (
                <div key={type}>
                  <p className="text-xs font-bold text-gray-400 uppercase ml-1 mb-2">{ACCOUNT_LABELS[type]}</p>
                  <div className="space-y-2">
                    {accs.map(acc => {
                      const conf = BANK_CONFIG[acc.provider] || BANK_CONFIG['Default'];
                      const isCredit = acc.type === 'credito';
                      const debt = Math.abs(acc.current);
                      const available = isCredit && acc.limit ? acc.limit - debt : null;
                      return (
                        <div key={acc.id} onClick={() => setSelectedAccountForAction(acc)} className="glass rounded-2xl p-4 flex justify-between items-center cursor-pointer active:scale-[0.98] transition-transform">
                          <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${conf.bg}`}>
                              {customAccountEmojis[acc.id] ? <VE e={customAccountEmojis[acc.id]} className="text-2xl" /> : <TypeIcon size={22} style={{ color: conf.color }} />}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="font-bold">{acc.name}</p>
                                {acc.name === defaultAccountName && <span className="text-[10px] bg-yellow-100 text-yellow-600 font-bold px-1.5 py-0.5 rounded-full">⭐ predeterminada</span>}
                              </div>
                              {isCredit && available !== null && <p className="text-[11px] text-red-400">Gastado: ${fmtARS(debt)} / ${fmtARS(acc.limit!)}</p>}
                              {acc.currency !== 'ARS' && <p className="text-[11px] text-gray-400">Cuenta en {acc.currency}</p>}
                            </div>
                          </div>
                          <div className="text-right">
                            {isCredit
                              ? available !== null
                                ? <><p className="font-bold text-base">${fmtARS(available)}</p><p className="text-[10px] text-gray-400 font-bold uppercase">Disponible</p></>
                                : <><p className="font-bold text-base text-red-500">- ${fmtARS(debt)}</p><p className="text-[10px] text-red-400 font-bold uppercase">Deuda</p></>
                              : <p className="font-bold text-base">{CURRENCY_SYMBOLS[acc.currency] || acc.currency} {fmtARS(acc.current)}</p>
                            }
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── ACTIVIDAD ──────────────────────────────── */}
        {!showInvestments && activeTab === 'activity' && (() => {
          const activeFilterCount = [activityFilter.type, activityFilter.category, activityFilter.account, activityFilter.method, activityFilter.month].filter(Boolean).length;
          const clearAllFilters = () => setActivityFilter({ search: '', type: '', category: '', account: '', method: '', month: '' });
          const chipBase = 'flex-shrink-0 text-xs font-bold px-3 py-2 rounded-full border transition-colors cursor-pointer appearance-none';
          const chipOff = 'bg-white text-gray-600 border-gray-200';
          const chipOn  = 'bg-purple-600 text-white border-purple-600';
          return (
            <div className="space-y-3 animate-in fade-in">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold">Actividad</h2>
                  {activeFilterCount > 0 && (
                    <button onClick={clearAllFilters} className="text-[10px] bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full">
                      {activeFilterCount} filtro{activeFilterCount > 1 ? 's' : ''} ✕
                    </button>
                  )}
                </div>
                <button
                  onClick={() => {
                    const rows = filteredTxs.map(t => ({
                      'Fecha': t.date, 'Descripción': t.description,
                      'Tipo': t.type === 'gasto' ? 'Gasto' : t.type === 'ingreso' ? 'Ingreso' : 'Transferencia',
                      'Categoría': t.category, 'Cuenta': t.account, 'Cuenta Destino': t.toAccount || '',
                      'Método': t.method, 'Monto': t.amount, 'Recurrente': t.isRecurring ? 'Sí' : 'No',
                    }));
                    const ws = XLSX.utils.json_to_sheet(rows);
                    ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 10 }];
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
                    XLSX.writeFile(wb, `Pampa_${new Date().toISOString().split('T')[0]}.xlsx`);
                  }}
                  className="flex items-center gap-1.5 bg-green-600 text-white text-xs font-bold px-3 py-2 rounded-xl"
                ><span>📥</span> Excel</button>
              </div>

              {/* Buscador */}
              <div className="flex items-center glass px-3 py-2.5 rounded-xl gap-2">
                <Search size={16} className="text-gray-400 flex-shrink-0" />
                <input type="text" placeholder="Descripción, categoría, cuenta..." value={activityFilter.search}
                  onChange={e => setActivityFilter(f => ({ ...f, search: e.target.value }))} className="w-full outline-none text-sm bg-transparent" />
                {activityFilter.search && <button onClick={() => setActivityFilter(f => ({ ...f, search: '' }))} className="text-gray-400 flex-shrink-0"><X size={16} /></button>}
              </div>

              {/* Chips de filtro */}
              <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
                {/* Tipo */}
                <select value={activityFilter.type}
                  onChange={e => setActivityFilter(f => ({ ...f, type: e.target.value }))}
                  className={`${chipBase} ${activityFilter.type ? chipOn : chipOff}`}>
                  <option value="">Todos los tipos</option>
                  <option value="gasto">💸 Gastos</option>
                  <option value="ingreso">💰 Ingresos</option>
                  <option value="transferencia">↔️ Transf.</option>
                </select>

                {/* Mes */}
                <select value={activityFilter.month}
                  onChange={e => setActivityFilter(f => ({ ...f, month: e.target.value }))}
                  className={`${chipBase} ${activityFilter.month ? chipOn : chipOff}`}>
                  <option value="">Todos los meses</option>
                  {activityAvailableMonths.map(m => {
                    const [y, mo] = m.split('-');
                    const label = new Date(Number(y), Number(mo) - 1, 1).toLocaleString('es-AR', { month: 'long', year: 'numeric' });
                    return <option key={m} value={m}>{label.charAt(0).toUpperCase() + label.slice(1)}</option>;
                  })}
                </select>

                {/* Cuenta */}
                <select value={activityFilter.account}
                  onChange={e => setActivityFilter(f => ({ ...f, account: e.target.value }))}
                  className={`${chipBase} ${activityFilter.account ? chipOn : chipOff}`}>
                  <option value="">Todas las cuentas</option>
                  {accountsList.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                </select>

                {/* Categoría */}
                <select value={activityFilter.category}
                  onChange={e => setActivityFilter(f => ({ ...f, category: e.target.value }))}
                  className={`${chipBase} ${activityFilter.category ? chipOn : chipOff}`}>
                  <option value="">Todas las categorías</option>
                  {activityAvailableCategories.map(c => <option key={c} value={c}>{getCatEmoji(c)} {c}</option>)}
                </select>

                {/* Método */}
                <select value={activityFilter.method}
                  onChange={e => setActivityFilter(f => ({ ...f, method: e.target.value }))}
                  className={`${chipBase} ${activityFilter.method ? chipOn : chipOff}`}>
                  <option value="">Todos los métodos</option>
                  <option value="debito">🟦 Débito</option>
                  <option value="credito">🟪 Crédito</option>
                  <option value="transferencia">🔄 Transferencia</option>
                  <option value="efectivo">💵 Efectivo</option>
                </select>
              </div>

              {/* Conteo */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400 font-medium">{filteredTxs.length} movimiento{filteredTxs.length !== 1 ? 's' : ''}</p>
                {filteredTxs.length > 0 && (
                  <p className="text-xs text-gray-400">
                    Total: <span className="font-bold text-gray-600">
                      {filteredTxs.filter(t => t.type === 'gasto').length > 0 && `-$${fmtARS(filteredTxs.filter(t=>t.type==='gasto').reduce((s,t)=>s+t.amount,0))}`}
                      {filteredTxs.filter(t => t.type === 'gasto').length > 0 && filteredTxs.filter(t => t.type === 'ingreso').length > 0 && ' · '}
                      {filteredTxs.filter(t => t.type === 'ingreso').length > 0 && `+$${fmtARS(filteredTxs.filter(t=>t.type==='ingreso').reduce((s,t)=>s+t.amount,0))}`}
                    </span>
                  </p>
                )}
              </div>

              {/* Lista */}
              <div className="space-y-2">
                {filteredTxs.map(t => (
                  <div key={t.id} onClick={() => openTxModal(t)} className="glass p-4 rounded-2xl flex items-center justify-between cursor-pointer transition-all duration-150 active:scale-[0.99]">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base flex-shrink-0 ${t.type === 'ingreso' ? 'bg-green-100' : t.type === 'transferencia' ? 'bg-blue-100' : 'bg-gray-100'}`}><VE e={getCatEmoji(t.category)} /></div>
                      <div>
                        <p className="font-bold text-sm">{t.description}</p>
                        <p className="text-xs text-gray-400">{t.date} · {t.account}{t.type === 'transferencia' && t.toAccount ? ` → ${t.toAccount}` : ''}{t.isRecurring ? ' · 🔄' : ''}</p>
                      </div>
                    </div>
                    <span className={`font-bold text-sm ml-2 flex-shrink-0 ${t.type === 'ingreso' ? 'text-green-600' : t.type === 'transferencia' ? 'text-blue-600' : 'text-black'}`}>
                      {t.type === 'ingreso' ? '+' : t.type === 'transferencia' ? '↔' : '-'} ${fmtARS(t.amount)}
                    </span>
                  </div>
                ))}
                {filteredTxs.length === 0 && (
                  <div className="text-center py-16">
                    <Search size={40} className="mx-auto mb-3 text-gray-200" />
                    <p className="font-medium text-gray-400">Sin resultados</p>
                    {activeFilterCount > 0 && <button onClick={clearAllFilters} className="mt-3 text-sm text-purple-500 font-bold">Borrar filtros</button>}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
        </div>
      </main>

      {/* ── NAVBAR ───────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 glass-nav pb-8 pt-2 z-40">
        <div className="flex justify-around items-center h-16 max-w-md mx-auto px-2">
          {[
            { icon: LayoutDashboard, label: 'Inicio', tab: 'dashboard' },
            { icon: Wallet, label: 'Cuentas', tab: 'accounts' },
          ].map(({ icon: Icon, label, tab }) => (
            <button key={tab} onClick={() => changeTab(tab)} className={`flex flex-col items-center gap-1 w-14 transition-all duration-200 ${activeTab === tab ? 'text-black' : 'text-gray-400'}`}>
              <Icon size={22} strokeWidth={activeTab === tab ? 2.5 : 2} className={activeTab === tab ? 'scale-110' : ''} /><span className="text-[10px] font-bold">{label}</span>
            </button>
          ))}
          <button onClick={() => openTxModal()} className="-mt-10 bg-black text-white w-16 h-16 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-90 transition-transform border-4 border-[#F5F5F7]"><Plus size={30} /></button>
          {[
            { icon: Activity, label: 'Actividad', tab: 'activity' },
            { icon: PieChart, label: 'Reportes', tab: 'reports' },
          ].map(({ icon: Icon, label, tab }) => (
            <button key={tab} onClick={() => changeTab(tab)} className={`flex flex-col items-center gap-1 w-14 transition-all duration-200 ${activeTab === tab ? 'text-black' : 'text-gray-400'}`}>
              <Icon size={22} strokeWidth={activeTab === tab ? 2.5 : 2} className={activeTab === tab ? 'scale-110' : ''} /><span className="text-[10px] font-bold">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* ── MODAL TRANSACCIÓN ────────────────────────── */}
      {showTransactionModal && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-md" onClick={() => { setShowTransactionModal(false); setConfirmDeleteId(null); }}>
          <div className="bg-white rounded-t-[2rem] sm:rounded-[2rem] w-full sm:max-w-sm max-h-[92vh] overflow-y-auto animate-fade-slide shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Colored header stripe based on type */}
            {(() => {
              const creditCards = accountsList.filter(a => a.type === 'credito');
              const isCreditPayment = transForm.type === 'transferencia' && accountsList.find(a => a.name === transForm.toAccount)?.type === 'credito';
              const headerBg = isCreditPayment ? 'from-purple-500 to-violet-600'
                : transForm.type === 'gasto' ? 'from-rose-400 to-red-500'
                : transForm.type === 'ingreso' ? 'from-emerald-400 to-green-500'
                : 'from-blue-400 to-indigo-500';
              const amountColor = isCreditPayment ? 'text-violet-600'
                : transForm.type === 'gasto' ? 'text-rose-500'
                : transForm.type === 'ingreso' ? 'text-emerald-500'
                : 'text-blue-500';
              return (
                <>
                  {/* Top handle + header */}
                  <div className={`bg-gradient-to-br ${headerBg} rounded-t-[2rem] sm:rounded-t-[2rem] px-6 pt-5 pb-6`}>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-white">{transForm.id ? 'Editar' : 'Nuevo'} Movimiento</h3>
                      <button onClick={() => { setShowTransactionModal(false); setConfirmDeleteId(null); }} className="p-2 bg-white/20 rounded-full backdrop-blur-sm"><X size={16} className="text-white" /></button>
                    </div>
                    {/* Type selector */}
                    <div className="flex gap-1.5 bg-black/15 p-1 rounded-2xl">
                      {(['gasto', 'ingreso', 'transferencia'] as TransactionType[]).map(t => {
                        if (t === 'transferencia' && accountsList.length < 2) return null;
                        const labels: Record<string, string> = { gasto: 'Gasto', ingreso: 'Ingreso', transferencia: 'Transf.' };
                        return (
                          <button key={t} type="button"
                            onClick={() => { setTransForm({ ...transForm, type: t, category: allCategories(t as TransactionType)[0] }); setAddingCategory(false); setNewCategoryInput(''); }}
                            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${transForm.type === t && !isCreditPayment ? 'bg-white text-gray-800 shadow-md' : 'text-white/80'}`}>
                            {labels[t]}
                          </button>
                        );
                      })}
                      {creditCards.length > 0 && (
                        <button type="button" onClick={() => {
                          const firstBank = accountsList.find(a => a.type !== 'credito')?.name || '';
                          const firstCard = creditCards[0].name;
                          setTransForm({ ...transForm, type: 'transferencia', account: firstBank, toAccount: firstCard, description: `Pago ${firstCard}`, category: 'Transferencia' });
                          setAddingCategory(false);
                        }} className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${isCreditPayment ? 'bg-white text-gray-800 shadow-md' : 'text-white/80'}`}>💳 Tarjeta</button>
                      )}
                    </div>
                    {/* Amount input — big & bold */}
                    {(() => {
                      const _srcCur = accountsList.find(a => a.name === transForm.account)?.currency;
                      const _dstCur = accountsList.find(a => a.name === transForm.toAccount)?.currency;
                      const _showCurHint = transForm.type === 'transferencia' && transForm.toAccount && _srcCur && _dstCur && _srcCur !== _dstCur;
                      return (
                        <div className="mt-4 text-center">
                          {_showCurHint && <p className="text-[10px] text-white/60 font-bold uppercase mb-1">Monto enviado ({_srcCur})</p>}
                          <input type="text" inputMode="decimal" placeholder="$ 0"
                            className="w-full text-center text-5xl font-black outline-none bg-transparent text-white placeholder-white/40"
                            autoFocus
                            onChange={e => { setTransForm({ ...transForm, amount: formatInput(e.target.value) }); }}
                            value={transForm.amount}
                          />
                        </div>
                      );
                    })()}
                    {isCreditPayment && (
                      <div className="flex items-center gap-2 bg-white/15 rounded-xl px-3 py-2 mt-3">
                        <CreditCard size={13} className="text-white/80 flex-shrink-0" />
                        <p className="text-[11px] text-white/90 font-medium">Pago de tarjeta — reduce la deuda pendiente</p>
                      </div>
                    )}
                  </div>

                  {/* Body */}
                  <div className="px-5 py-4">
                    <form onSubmit={handleSaveTransaction} className="space-y-3">
                      {/* Date */}
                      <div className="flex justify-center">
                        <div className="flex items-center gap-2 bg-gray-50 px-4 py-2.5 rounded-2xl border border-gray-100">
                          <Calendar size={14} className="text-gray-400" />
                          <input type="date" value={transForm.date} onChange={e => setTransForm({ ...transForm, date: e.target.value })} className="bg-transparent font-medium text-sm outline-none text-gray-600" />
                        </div>
                      </div>
                      {/* Description */}
                      <input placeholder="Descripción del movimiento" className="w-full bg-gray-50 border border-gray-100 px-4 py-3 rounded-2xl outline-none text-sm text-gray-700 placeholder-gray-400" onChange={e => setTransForm({ ...transForm, description: e.target.value })} value={transForm.description} />
                      {/* Category + Account */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Categoría</label>
                          {addingCategory ? (
                            <div className="mt-1 space-y-2">
                              <div className="flex gap-1">
                                <button type="button" className="text-xl w-10 h-10 flex-shrink-0 bg-gray-100 rounded-xl flex items-center justify-center"><VE e={newCategoryEmoji} /></button>
                                <input
                                  autoFocus type="text" value={newCategoryInput}
                                  onChange={e => setNewCategoryInput(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomCategory(newCategoryInput, transForm.type, newCategoryEmoji); } }}
                                  placeholder="Nueva categoría"
                                  className="flex-1 bg-gray-50 p-2.5 rounded-xl text-sm outline-none border border-indigo-300 min-w-0"
                                />
                                <button type="button" onClick={() => addCustomCategory(newCategoryInput, transForm.type, newCategoryEmoji)} className="px-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold">✓</button>
                                <button type="button" onClick={() => { setAddingCategory(false); setNewCategoryInput(''); setNewCategoryEmoji('📋'); }} className="px-2.5 bg-gray-200 rounded-xl text-sm">✕</button>
                              </div>
                              <div className="grid grid-cols-8 gap-1 max-h-20 overflow-y-auto bg-gray-50 rounded-xl p-1.5">
                                {EMOJI_LIST.map(e => (
                                  <button key={e} type="button" onClick={() => setNewCategoryEmoji(e)} className={`text-lg p-1 rounded-lg transition-colors ${newCategoryEmoji === e ? 'bg-indigo-100 ring-1 ring-indigo-400' : 'hover:bg-gray-200'}`}><VE e={e} /></button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <select className="w-full bg-gray-50 border border-gray-100 px-3 py-3 rounded-2xl text-sm mt-1 outline-none" value={transForm.category} onChange={e => { if (e.target.value === '__add__') setAddingCategory(true); else setTransForm({ ...transForm, category: e.target.value }); }}>
                              {allCategories(transForm.type).map(c => <option key={c} value={c}>{c}</option>)}
                              <option value="__add__">＋ Agregar categoría...</option>
                            </select>
                          )}
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Cuenta</label>
                          <select className="w-full bg-gray-50 border border-gray-100 px-3 py-3 rounded-2xl text-sm mt-1 outline-none" value={transForm.account} onChange={e => { if (e.target.value === '__add__') { openAccModal(); } else setTransForm({ ...transForm, account: e.target.value }); }}>
                            {accountsList.map(a => <option key={a.id} value={a.name}>{a.type === 'ahorro' ? `🐷 ${a.name}` : a.name}</option>)}
                            <option value="__add__">＋ Nueva cuenta...</option>
                          </select>
                          {accountsList.find(a => a.name === transForm.account)?.type === 'ahorro' && (
                            <p className="text-[10px] text-amber-600 font-medium mt-1 ml-1">🐷 No afecta el Neto para Gastar</p>
                          )}
                        </div>
                      </div>
                      {/* Transfer destination */}
                      {transForm.type === 'transferencia' && (() => {
                        const isCreditPayment2 = accountsList.find(a => a.name === transForm.toAccount)?.type === 'credito';
                        const creditCards2 = accountsList.filter(a => a.type === 'credito' && a.name !== transForm.account);
                        const otherAccounts2 = accountsList.filter(a => a.type !== 'credito' && a.name !== transForm.account);
                        const srcCurrency = accountsList.find(a => a.name === transForm.account)?.currency || 'ARS';
                        const dstCurrency = accountsList.find(a => a.name === transForm.toAccount)?.currency || 'ARS';
                        const isCrossCurrency = transForm.toAccount !== '' && srcCurrency !== dstCurrency;
                        return (
                          <>
                            <div>
                              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">
                                {isCreditPayment2 ? '💳 Tarjeta a Pagar' : 'Cuenta Destino'}
                              </label>
                              <select className={`w-full px-3 py-3 rounded-2xl text-sm mt-1 outline-none border ${isCreditPayment2 ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-100'}`} value={transForm.toAccount} onChange={e => {
                                const newCard = e.target.value;
                                const isNewCredit = accountsList.find(a => a.name === newCard)?.type === 'credito';
                                setTransForm({ ...transForm, toAccount: newCard, toAmount: '', description: isNewCredit ? `Pago ${newCard}` : transForm.description });
                              }}>
                                {isCreditPayment2 ? (
                                  <>
                                    {creditCards2.map(a => <option key={a.id} value={a.name}>💳 {a.name}</option>)}
                                    {otherAccounts2.length > 0 && <optgroup label="Otras cuentas">{otherAccounts2.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}</optgroup>}
                                  </>
                                ) : (
                                  accountsList.filter(a => a.name !== transForm.account).map(a => <option key={a.id} value={a.name}>{a.type === 'credito' ? `💳 ${a.name}` : a.name}</option>)
                                )}
                              </select>
                            </div>
                            {isCrossCurrency && (
                              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3">
                                <label className="text-[10px] font-bold text-blue-500 uppercase ml-1">💱 Monto recibido en {dstCurrency}</label>
                                <input type="text" inputMode="decimal" placeholder={`0.00 ${dstCurrency}`}
                                  className="w-full bg-transparent border-b border-blue-200 py-2 outline-none text-base font-medium mt-1"
                                  value={transForm.toAmount}
                                  onChange={e => setTransForm({ ...transForm, toAmount: formatInput(e.target.value) })}
                                />
                                {transForm.amount && transForm.toAmount && parseInput(transForm.toAmount) > 0 && (
                                  <p className="text-[10px] text-blue-500 mt-1 ml-1">Tipo de cambio: {srcCurrency} {fmtARS(parseInput(transForm.amount) / parseInput(transForm.toAmount))} por {dstCurrency}</p>
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()}
                      {/* Debt payment link */}
                      {transForm.category === 'Pago de deuda' && transForm.type === 'gasto' && (
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">¿A cuál deuda aplicar?</label>
                          <select className="w-full bg-orange-50 border border-orange-200 px-3 py-3 rounded-2xl text-sm mt-1 outline-none"
                            value={transForm.debtPaymentId}
                            onChange={e => {
                              const debt = debts.find(d => d.id === e.target.value);
                              setTransForm({ ...transForm, debtPaymentId: e.target.value, description: debt ? `Pago: ${debt.person}${debt.concept ? ` · ${debt.concept}` : ''}` : transForm.description, amount: debt ? fmtARS(debt.remainingAmount) : transForm.amount });
                            }}>
                            <option value="">— Sin vincular —</option>
                            {debts.filter(d => d.type === 'les_debo' && d.remainingAmount > 0).map(d => (
                              <option key={d.id} value={d.id}>📤 {d.person}{d.concept ? ` · ${d.concept}` : ''} — ${fmtARS(d.remainingAmount)}</option>
                            ))}
                          </select>
                          {transForm.debtPaymentId && <p className="text-[10px] text-orange-600 font-medium mt-1 ml-1">✓ Al guardar se descontará del saldo pendiente</p>}
                        </div>
                      )}
                      {/* Payment method */}
                      {transForm.type !== 'transferencia' && (
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Método de Pago</label>
                          <div className="grid grid-cols-4 gap-2 mt-1">
                            {PAYMENT_METHODS.map(m => (
                              <button key={m.key} type="button" onClick={() => setTransForm({ ...transForm, method: m.key })}
                                className={`py-2.5 rounded-2xl text-xs font-bold flex flex-col items-center gap-1 transition-all ${transForm.method === m.key ? 'bg-gray-900 text-white shadow-lg' : 'bg-gray-100 text-gray-500'}`}>
                                <VE e={m.emoji} className="text-base" /><span>{m.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Income type */}
                      {transForm.type === 'ingreso' && (
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Tipo de Ingreso</label>
                          <div className="flex bg-gray-100 p-1 rounded-2xl mt-1">
                            {(['fijo', 'variable'] as IncomeType[]).map(t => (
                              <button key={t} type="button" onClick={() => setTransForm({ ...transForm, incomeType: t })}
                                className={`flex-1 py-2 text-xs font-bold rounded-xl capitalize transition-all ${transForm.incomeType === t ? 'bg-white shadow' : ''}`}>{t}</button>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Recurring toggle */}
                      <div className="flex items-center justify-between bg-gray-50 rounded-2xl px-4 py-3">
                        <span className="text-sm font-medium text-gray-600">Recurrente / Fijo</span>
                        <button type="button" onClick={() => setTransForm({ ...transForm, isRecurring: !transForm.isRecurring })}
                          className={`w-11 h-6 rounded-full relative transition-colors ${transForm.isRecurring ? 'bg-gray-900' : 'bg-gray-200'}`}>
                          <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow transition-all ${transForm.isRecurring ? 'right-0.5' : 'left-0.5'}`} />
                        </button>
                      </div>
                      {/* Guardar como predeterminado */}
                      {!transForm.id && (
                        <button type="button" onClick={() => {
                          const cur = (() => { try { return JSON.parse(localStorage.getItem('pampa_tx_defaults') || '{}'); } catch { return {}; } })();
                          const updated = { ...cur, [`category_${transForm.type}`]: transForm.category, [`account_${transForm.type}`]: transForm.account, [`method_${transForm.type}`]: transForm.method };
                          localStorage.setItem('pampa_tx_defaults', JSON.stringify(updated));
                          showToast('✅ Predeterminado guardado');
                        }} className="w-full py-2.5 rounded-2xl text-xs font-bold text-gray-400 bg-gray-50 border border-gray-100">
                          Usar como predeterminado para {transForm.type === 'gasto' ? 'gastos' : transForm.type === 'ingreso' ? 'ingresos' : 'transferencias'}
                        </button>
                      )}
                      {/* Save */}
                      <button type="submit"
                        className={`w-full text-white font-bold py-4 rounded-2xl text-base bg-gradient-to-r ${isCreditPayment ? 'from-purple-500 to-violet-600' : transForm.type === 'gasto' ? 'from-rose-400 to-red-500' : transForm.type === 'ingreso' ? 'from-emerald-400 to-green-500' : 'from-blue-400 to-indigo-500'} shadow-lg`}>
                        {transForm.id ? 'Guardar cambios' : 'Guardar movimiento'}
                      </button>
                      {transForm.id && (
                        confirmDeleteId === transForm.id ? (
                          <div className="bg-red-50 rounded-2xl p-4 space-y-2">
                            <p className="text-center text-sm font-bold text-red-700">¿Eliminar este movimiento?</p>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm">Cancelar</button>
                              <button type="button" onClick={() => handleDeleteTransaction(transForm.id)} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-bold text-sm">Sí, eliminar</button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setConfirmDeleteId(transForm.id)} className="w-full py-3 rounded-2xl text-red-500 font-bold text-sm flex items-center justify-center gap-2 bg-red-50">
                            <Trash2 size={16} /> Eliminar movimiento
                          </button>
                        )
                      )}
                    </form>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── MODAL CUENTA ─────────────────────────────── */}
      {showAccountModal && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowAccountModal(false)}>
          <div className="glass rounded-t-[2rem] sm:rounded-[2rem] p-6 w-full sm:max-w-sm max-h-[92vh] overflow-y-auto animate-fade-slide" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5"><h3 className="text-xl font-bold">{accForm.id ? 'Editar' : 'Nueva'} Cuenta</h3><button onClick={() => setShowAccountModal(false)} className="p-2 bg-gray-100 rounded-full"><X size={18} /></button></div>
            <form onSubmit={handleSaveAccount} className="space-y-4">
              {!accForm.id && <p className="text-[11px] text-gray-400 bg-gray-50 p-3 rounded-xl">ℹ️ <strong>Carga manual:</strong> Pampa no se conecta a tu banco. Ingresá el saldo actual y registrá tus movimientos a mano o por WhatsApp.</p>}
              <div><label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Banco / Entidad</label><select value={accForm.provider} onChange={e => setAccForm({ ...accForm, provider: e.target.value })} className="w-full bg-gray-50 p-3 rounded-xl border mt-1">{Object.keys(BANK_CONFIG).map(k => <option key={k} value={k}>{BANK_CONFIG[k].label}</option>)}</select></div>
              <div><label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Nombre</label><input placeholder="Ej: Galicia Ahorro" value={accForm.name} onChange={e => setAccForm({ ...accForm, name: e.target.value })} className="w-full bg-gray-50 p-3 rounded-xl border mt-1" /></div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Tipo de Cuenta</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {(['gastos', 'ahorro', 'credito', 'efectivo'] as AccountType[]).map(t => (
                    <button key={t} type="button" onClick={() => setAccForm({ ...accForm, type: t })} className={`py-2.5 text-xs font-bold rounded-xl transition-colors ${accForm.type === t ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'}`}>{ACCOUNT_LABELS[t]}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Moneda</label>
                <div className="grid grid-cols-4 gap-1 bg-gray-100 p-1 rounded-xl mt-1">
                  {(['ARS', 'USD', 'BRL', 'EUR', 'UYU', 'CLP', 'COP', 'VES'] as Currency[]).map(c => (
                    <button key={c} type="button" onClick={() => setAccForm({ ...accForm, currency: c })} className={`py-2 text-xs font-bold rounded-lg transition-all ${accForm.currency === c ? 'bg-white shadow' : ''}`}>{CURRENCY_FLAGS[c]} {c}</button>
                  ))}
                </div>
              </div>
              {(accForm.type === 'credito' || accForm.type === 'gastos') && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Últimos 4 dígitos de la tarjeta <span className="text-gray-300 normal-case">(para matching con MP)</span></label>
                  <input
                    type="text" inputMode="numeric" maxLength={4} placeholder="ej: 7960"
                    value={accForm.lastFour}
                    onChange={e => setAccForm({ ...accForm, lastFour: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    className="w-full bg-gray-50 p-3 rounded-xl border mt-1 tracking-widest font-mono"
                  />
                </div>
              )}
              {accForm.type === 'credito' && (
                <div><label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Límite de la Tarjeta</label><input type="text" inputMode="decimal" placeholder="0" value={accForm.limit} onChange={e => setAccForm({ ...accForm, limit: formatInput(e.target.value) })} className="w-full bg-gray-50 p-3 rounded-xl border mt-1" /></div>
              )}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">
                  {accForm.type === 'credito' ? 'Crédito Disponible' : 'Saldo Actual'}
                </label>
                <input type="text" inputMode="decimal" placeholder="0" value={accForm.balance} onChange={e => setAccForm({ ...accForm, balance: formatInput(e.target.value) })} className="w-full bg-gray-50 p-3 rounded-xl border mt-1" />
                {accForm.type === 'credito' && <p className="text-[10px] text-gray-400 ml-1 mt-1">Lo que aún podés gastar con esta tarjeta.</p>}
              </div>
              {accForm.id && <p className="text-xs text-gray-400 p-2 bg-gray-50 rounded-xl">✏️ Podés corregir el saldo sin que se genere ningún movimiento.</p>}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Ícono personalizado (opcional)</label>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0"><VE e={accForm.emoji || '🏦'} /></div>
                  <div className="grid grid-cols-8 gap-1 flex-1 max-h-20 overflow-y-auto bg-gray-50 rounded-xl p-1.5">
                    <button type="button" onClick={() => setAccForm({ ...accForm, emoji: '' })} className={`text-lg p-1 rounded-lg ${!accForm.emoji ? 'bg-indigo-100 ring-1 ring-indigo-400' : 'hover:bg-gray-200'}`}><VE e="🏦" /></button>
                    {EMOJI_LIST.map(e => (
                      <button key={e} type="button" onClick={() => setAccForm({ ...accForm, emoji: e })} className={`text-lg p-1 rounded-lg transition-colors ${accForm.emoji === e ? 'bg-indigo-100 ring-1 ring-indigo-400' : 'hover:bg-gray-200'}`}><VE e={e} /></button>
                    ))}
                  </div>
                </div>
              </div>
              <button className="w-full bg-black text-white font-bold py-3 rounded-2xl">Guardar</button>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL ACCIÓN CUENTA ───────────────────────── */}
      {selectedAccountForAction && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => { setSelectedAccountForAction(null); setConfirmDeleteAccountId(null); }}>
          <div className="glass rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-sm animate-fade-slide" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5"><h3 className="text-xl font-bold">{selectedAccountForAction.name}</h3><button onClick={() => { setSelectedAccountForAction(null); setConfirmDeleteAccountId(null); }} className="p-2 bg-gray-100 rounded-full"><X size={18} /></button></div>
            {selectedAccountForAction.type === 'ahorro' && (
              <div className="flex items-center gap-2 mb-3 bg-amber-50 rounded-2xl px-3 py-2">
                <PiggyBank size={14} className="text-amber-600" />
                <p className="text-xs text-amber-700 font-medium">Cuenta de ahorro — no suma al Neto para Gastar</p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <button onClick={() => { openTxModal(undefined, 'ingreso', selectedAccountForAction.name); setSelectedAccountForAction(null); }} className="p-4 bg-green-50 rounded-2xl text-green-800 font-bold flex flex-col items-center gap-2 text-xs">
                <ArrowDownLeft size={20} />
                {selectedAccountForAction.type === 'ahorro' ? 'Depositar' : 'Ingresar'}
              </button>
              <button onClick={() => { openTxModal(undefined, 'gasto', selectedAccountForAction.name); setSelectedAccountForAction(null); }} className="p-4 bg-red-50 rounded-2xl text-red-800 font-bold flex flex-col items-center gap-2 text-xs">
                <ArrowUpRight size={20} />
                {selectedAccountForAction.type === 'ahorro' ? 'Retirar' : 'Gastar'}
              </button>
              <button onClick={() => { openTxModal(undefined, 'transferencia', selectedAccountForAction.name); setSelectedAccountForAction(null); }} className="p-4 bg-blue-50 rounded-2xl text-blue-800 font-bold flex flex-col items-center gap-2 text-xs"><ArrowRightLeft size={20} /> Transferir</button>
            </div>
            {selectedAccountForAction.type === 'credito' && (
              <button onClick={() => {
                const fromAcc = accountsList.find(a => a.type !== 'credito');
                openTxModal(undefined, 'transferencia', fromAcc?.name, selectedAccountForAction.name);
                setSelectedAccountForAction(null);
              }} className="w-full py-3 bg-purple-50 rounded-2xl font-bold text-purple-700 flex items-center justify-center gap-2 mb-2">
                <CreditCard size={16} /> Pagar tarjeta
              </button>
            )}
            {(selectedAccountForAction.provider === 'Mercado Pago' || selectedAccountForAction.name.toLowerCase().includes('mercado pago') || selectedAccountForAction.name.toLowerCase().includes('mercadopago')) && (
              userPlan.mpConnected ? (
                <div className="flex gap-2 mb-2">
                  <button onClick={() => { handleMpSync(selectedAccountForAction.name); setSelectedAccountForAction(null); }}
                    className="flex-1 py-3 bg-sky-50 rounded-2xl font-bold text-sky-700 flex items-center justify-center gap-2">
                    <RefreshCw size={16} className={mpSyncing ? 'animate-spin' : ''} />
                    {mpSyncing ? 'Sincronizando...' : 'Sincronizar'}
                  </button>
                  <button onClick={() => { handleMpDisconnect(); setSelectedAccountForAction(null); }}
                    className="py-3 px-4 bg-red-50 rounded-2xl font-bold text-red-500 text-sm">
                    Desconectar
                  </button>
                </div>
              ) : (
                <button onClick={() => { setSelectedAccountForAction(null); handleMpConnect(); }}
                  className="w-full py-3 bg-sky-500 rounded-2xl font-bold text-white flex items-center justify-center gap-2 mb-2">
                  🔗 Conectar con Mercado Pago
                </button>
              )
            )}
            {/* Importar extracto Galicia */}
            {(selectedAccountForAction.provider === 'Galicia' || selectedAccountForAction.name.toLowerCase().includes('galicia')) && (
              <button
                onClick={() => { importTargetAccount.current = selectedAccountForAction; importFileRef.current?.click(); }}
                disabled={importParsing}
                className="w-full py-3 bg-blue-50 rounded-2xl font-bold text-blue-700 flex items-center justify-center gap-2 mb-1"
              >
                <Upload size={16} />
                {importParsing ? 'Procesando...' : 'Importar extracto / resumen'}
              </button>
            )}
            <div className="flex gap-2 mb-1">
              <button onClick={() => { openAccModal(selectedAccountForAction); setSelectedAccountForAction(null); }} className="flex-1 py-3 bg-gray-100 rounded-2xl font-bold text-gray-600 flex items-center justify-center gap-2 text-sm"><Pencil size={15} /> Editar</button>
              <button onClick={() => {
                const name = selectedAccountForAction!.name;
                const isAlready = defaultAccountName === name;
                if (isAlready) {
                  setDefaultAccountName('');
                  localStorage.removeItem('pampa_default_account');
                  showToast('Cuenta predeterminada eliminada');
                } else {
                  setDefaultAccountName(name);
                  localStorage.setItem('pampa_default_account', name);
                  showToast(`⭐ ${name} es ahora la predeterminada`);
                }
                setSelectedAccountForAction(null);
              }} className={`flex-1 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 text-sm ${defaultAccountName === selectedAccountForAction?.name ? 'bg-yellow-100 text-yellow-700' : 'bg-yellow-50 text-yellow-600'}`}>
                ⭐ {defaultAccountName === selectedAccountForAction?.name ? 'Quitar' : 'Predeterminada'}
              </button>
            </div>
            {confirmDeleteAccountId === selectedAccountForAction?.id ? (
              <div className="mt-2 p-3 bg-red-50 rounded-2xl border border-red-200">
                <p className="text-xs text-red-700 font-bold mb-2 text-center">⚠️ ¿Eliminar "{selectedAccountForAction?.name}"? Esta acción no se puede deshacer.</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDeleteAccountId(null)} className="flex-1 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600">Cancelar</button>
                  <button onClick={() => handleDeleteAccount(selectedAccountForAction!.id)} className="flex-1 py-2 bg-red-500 rounded-xl text-sm font-bold text-white">Sí, eliminar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmDeleteAccountId(selectedAccountForAction?.id || null)} className="w-full py-3 bg-red-50 rounded-2xl font-bold text-red-500 flex items-center justify-center gap-2 text-sm mt-1">
                <Trash2 size={15} /> Eliminar cuenta
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── INPUT OCULTO GALICIA ─────────────────────── */}
      <input
        type="file"
        ref={importFileRef}
        className="hidden"
        accept=".pdf,.xlsx,.xls"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          const acc = importTargetAccount.current;
          if (file && acc) await handleFileImport(file, acc);
          e.target.value = '';
        }}
      />

      {/* ── MODAL PREVIEW GALICIA ────────────────────── */}
      {importPreview && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-bold">Importar movimientos</h3>
                <button onClick={() => setImportPreview(null)} className="p-2 bg-gray-100 rounded-full"><X size={18} /></button>
              </div>
              {importPreview.length > 0 ? (
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm text-gray-500">{importSelected.size} de {importPreview.length} seleccionados</p>
                  <button
                    onClick={() => setImportSelected(
                      importSelected.size === importPreview.length
                        ? new Set()
                        : new Set(importPreview.map(p => p.id))
                    )}
                    className="text-xs font-bold text-sky-600"
                  >
                    {importSelected.size === importPreview.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-400 mt-1">No hay movimientos nuevos para importar.</p>
              )}
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {importPreview.map(p => (
                <div
                  key={p.id}
                  onClick={() => {
                    const s = new Set(importSelected);
                    s.has(p.id) ? s.delete(p.id) : s.add(p.id);
                    setImportSelected(s);
                  }}
                  className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-colors ${importSelected.has(p.id) ? 'border-sky-300 bg-sky-50' : 'border-gray-100 bg-gray-50 opacity-50'}`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${importSelected.has(p.id) ? 'bg-sky-500 border-sky-500' : 'border-gray-300'}`}>
                    {importSelected.has(p.id) && <div className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{p.description}</p>
                    <p className="text-xs text-gray-400">{p.date} · {p.category} · {p.account}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold ${p.type === 'ingreso' ? 'text-green-600' : p.type === 'transferencia' ? 'text-blue-600' : 'text-red-500'}`}>
                      {p.type === 'ingreso' ? '+' : p.type === 'transferencia' ? '↔' : '-'}
                      ${p.amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-gray-400 capitalize">{p.method}</p>
                  </div>
                </div>
              ))}
            </div>
            {importPreview.length > 0 && (
              <div className="p-4 border-t border-gray-100">
                <button
                  onClick={handleBankImport}
                  disabled={importSelected.size === 0}
                  className="w-full py-3 bg-sky-500 rounded-2xl font-bold text-white disabled:opacity-40"
                >
                  Importar {importSelected.size} movimiento{importSelected.size !== 1 ? 's' : ''}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL PREVIEW MP ─────────────────────────── */}
      {mpPreview && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-bold">Sincronizar Mercado Pago</h3>
                <button onClick={() => setMpPreview(null)} className="p-2 bg-gray-100 rounded-full"><X size={18} /></button>
              </div>
              {mpPreview.length > 0 && (
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm text-gray-500">{mpSelected.size} de {mpPreview.length} seleccionados</p>
                  <button onClick={() => setMpSelected(mpSelected.size === mpPreview.length ? new Set() : new Set(mpPreview.map(p => p.id)))}
                    className="text-xs font-bold text-sky-600">
                    {mpSelected.size === mpPreview.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </button>
                </div>
              )}
              {Object.keys(mpCardMapping).length > 0 && (
                <div className="mt-3 space-y-2">
                  {Object.entries(mpCardMapping).map(([cardKey, assignedAccount]) => (
                    <div key={cardKey} className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      <p className="text-xs font-bold text-amber-700 mb-1">⚠️ {cardKey} no tiene cuenta creada</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-amber-600 flex-shrink-0">Imputar a:</p>
                        <select value={assignedAccount}
                          onChange={e => setMpCardMapping(prev => ({ ...prev, [cardKey]: e.target.value }))}
                          className="flex-1 text-xs border border-amber-300 rounded-lg px-2 py-1 bg-white">
                          {accountsList.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {mpPreview.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">No hay movimientos nuevos para importar.</p>
            )}
            {mpPreview.length > 0 && (
              <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
                {mpPreview.map((p: any) => {
                  const selected = mpSelected.has(p.id);
                  return (
                    <div key={p.id} onClick={() => setMpSelected(prev => { const s = new Set(prev); selected ? s.delete(p.id) : s.add(p.id); return s; })}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2 cursor-pointer transition-colors ${selected ? 'bg-sky-50 border border-sky-200' : 'bg-gray-50 opacity-50'}`}>
                      <div className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center border-2 ${selected ? 'bg-sky-500 border-sky-500' : 'border-gray-300'}`}>
                        {selected && <span className="text-white text-[10px] font-bold">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{p.description}</p>
                        <p className="text-xs text-gray-400">{p.date} · {p.category} · {p.account}</p>
                        {p.isOwnCard === false && <p className="text-[10px] text-orange-500 font-bold">⚠️ Tarjeta ajena</p>}
                      </div>
                      <span className={`text-sm font-bold whitespace-nowrap ${p.type === 'ingreso' ? 'text-emerald-600' : p.type === 'gasto' ? 'text-red-500' : 'text-blue-500'}`}>
                        {p.type === 'ingreso' ? '+' : p.type === 'gasto' ? '-' : '↔'} {fmtARS(p.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="p-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setMpPreview(null)} className="flex-1 py-3 bg-gray-100 rounded-2xl font-bold text-gray-600">Cancelar</button>
              {mpSelected.size > 0 && (
                <button onClick={handleMpImport} className="flex-1 py-3 bg-sky-500 rounded-2xl font-bold text-white">
                  Importar {mpSelected.size > 100 ? '100' : mpSelected.size}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL UPGRADE ────────────────────────────── */}
      {showUpgradeModal && (
        <UpgradeModal
          userId={currentUser.id}
          email={currentUser.email}
          noAds={userPlan.noAds}
          whatsappActive={userPlan.whatsappActive}
          onClose={() => setShowUpgradeModal(false)}
        />
      )}

      {/* ── MODAL PRESUPUESTOS ───────────────────────── */}
      {showBudgetModal && <BudgetModal budgets={budgets} extraCategories={customCategories['gasto'] || []} onSave={async (newBudgets) => {
        await supabase.from('budgets').delete().eq('user_id', currentUser.id);
        if (newBudgets.length) {
          const { error } = await supabase.from('budgets').insert(newBudgets.map(b => ({ user_id: currentUser.id, category: b.category, limit_amount: b.limit })));
          if (error) { showToast('❌ Error al guardar presupuestos'); loadUserData(currentUser.id); return; }
        }
        setBudgets(newBudgets);
      }} onClose={() => setShowBudgetModal(false)} />}

      {/* ── TUTORIAL DE ONBOARDING ───────────────────── */}
      {showTutorial && (
        <div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={closeTutorial}>
          <div className="bg-white w-full max-w-md rounded-t-[2rem] p-8 pb-10 animate-fade-slide" onClick={e => e.stopPropagation()}>
            {/* Indicadores de paso */}
            <div className="flex gap-1.5 justify-center mb-6">
              {TUTORIAL_STEPS.map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === tutorialStep ? 'w-6 bg-black' : 'w-1.5 bg-gray-200'}`} />
              ))}
            </div>
            {/* Contenido */}
            <div className="text-center">
              <div className="text-6xl mb-4">{TUTORIAL_STEPS[tutorialStep].emoji}</div>
              <h2 className="text-xl font-bold mb-3">{TUTORIAL_STEPS[tutorialStep].title}</h2>
              <p className="text-gray-500 text-sm leading-relaxed">{TUTORIAL_STEPS[tutorialStep].body}</p>
            </div>
            {/* Botones */}
            <div className="flex gap-3 mt-8">
              <button onClick={closeTutorial} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-500 font-bold text-sm">Saltar</button>
              <button
                onClick={() => {
                  if (tutorialStep < TUTORIAL_STEPS.length - 1) setTutorialStep(t => t + 1);
                  else closeTutorial();
                }}
                className="flex-2 flex-[2] py-3 rounded-2xl bg-black text-white font-bold text-sm"
              >
                {tutorialStep < TUTORIAL_STEPS.length - 1 ? 'Siguiente →' : '¡Empezar!'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BANNER NUEVA VERSIÓN ─────────────────────── */}
      {(needRefresh || newVersionReady) && (
        <div className="fixed bottom-24 left-4 right-4 z-[300] bg-black text-white rounded-2xl p-4 flex items-center justify-between shadow-2xl gap-3">
          <div>
            <p className="font-bold text-sm">🆕 Nueva versión disponible</p>
            <p className="text-xs text-gray-400 mt-0.5">Actualizá para ver los últimos cambios</p>
          </div>
          <button
            onClick={() => { updateServiceWorker(true); window.location.reload(); }}
            className="bg-white text-black text-xs font-bold px-4 py-2 rounded-xl shrink-0"
          >
            Actualizar
          </button>
        </div>
      )}

      {/* ── TOASTS ───────────────────────────────────── */}
      <div className="fixed top-4 left-0 right-0 z-[200] flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map(t => (
          <div key={t.id} className={`flex items-center gap-2 px-4 py-3 rounded-2xl shadow-xl text-white text-sm font-bold animate-in slide-in-from-top-4 fade-in duration-300 ${t.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
            {t.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}


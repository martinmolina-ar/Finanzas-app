import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from './supabase';
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
  DollarSign, RefreshCw, Activity
} from 'lucide-react';

// --- TIPOS ---

const INITIAL_USER = { name: "Martin", email: "martin@demo.com", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Martin" };
const ESTIMATED_SALARY = 850000;

type TransactionType = 'ingreso' | 'gasto' | 'transferencia';
type IncomeType = 'fijo' | 'variable';
type PaymentMethod = 'debito' | 'credito' | 'transferencia' | 'efectivo';
type Currency = 'ARS' | 'USD';
type AccountType = 'gastos' | 'ahorro' | 'credito' | 'efectivo';

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

const HABIT_COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

interface DolarRates {
  blue: number;
  oficial: number;
  mep: number;
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
  ingreso: ['Sueldo', 'Ventas', 'Intereses', 'Regalo'],
  transferencia: ['Ahorro', 'Pago Tarjeta', 'Movimiento']
};

const CHART_COLORS = ['#FF6C0C', '#009EE3', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1'];

const CATEGORY_EMOJI: Record<string, string> = {
  'Comida': '🍔', 'Alquiler': '🏠', 'Servicios': '⚡', 'Ocio': '🛍️',
  'Transporte': '🚗', 'Suscripciones': '📱', 'Salud': '🏥', 'Varios': '📦',
  'Sueldo': '💼', 'Ventas': '💰', 'Intereses': '📈', 'Regalo': '🎁',
  'Ahorro': '🔒', 'Movimiento': '↔️', 'Pago Tarjeta': '💳', 'Ajuste': '⚙️',
  'Pago de deuda': '🤝',
};
const getCategoryEmoji = (category: string, overrides?: Record<string, string>): string =>
  overrides?.[category] || CATEGORY_EMOJI[category] || '📋';

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
  { q: "¿Se conecta con mi banco?", a: "No. FinanzasApp no tiene integración con bancos ni acceso a tus cuentas. Todo se carga manualmente: vos ingresás tus movimientos a mano." },
  { q: "¿Necesito dar mis datos reales?", a: "Solo necesitás un email y contraseña. El nombre puede ser un apodo. No pedimos DNI, CUIL ni ningún dato de identidad." },
  { q: "¿Qué es 'Neto para Gastar'?", a: "Tu liquidez real: el total de tus cuentas bancarias y efectivo en ARS. No incluye ahorros, inversiones, ni deudas." },
  { q: "¿Cómo ajusto el saldo de una cuenta?", a: "Entrá a Cuentas, tocá la cuenta, luego 'Editar / Ajustar Saldo'. Podés escribir el saldo actual y se recalcula automáticamente sin generar ningún movimiento." },
  { q: "¿Cómo agrego una categoría propia?", a: "Al crear un movimiento, en el selector de Categoría elegí '＋ Agregar categoría...' y escribí el nombre. También podés asignarle un emoji." },
  { q: "¿Qué son los Presupuestos?", a: "Definís un límite de gasto mensual por categoría. La barra se llena según lo gastado en el mes actual. Se configuran desde el Menú → Presupuestos." },
  { q: "¿Cómo funciona la sección Deudas?", a: "Registrás lo que te deben (activos) y lo que debés (pasivos). Podés registrar pagos parciales o totales, que se aplican como transacción en la cuenta elegida y descuentan del pendiente." },
  { q: "¿Puedo pagar una deuda desde un movimiento?", a: "Sí. Al crear un gasto, elegí la categoría 'Pago de deuda' y seleccioná la deuda. Al guardar, el monto se descuenta automáticamente del pendiente." },
  { q: "¿Cómo funciona el bloqueo automático?", a: "La app se bloquea sola a los 3 minutos de inactividad y también si la mandás al fondo más de 30 segundos. Para desbloquear usás Face ID, Touch ID, o tu contraseña." },
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
    requestAnimationFrame(tick);
  }, [target, duration]);
  return val;
};

const AnimatedNumber = ({ value, prefix = '$' }: { value: number, prefix?: string }) => {
  const animated = useCountUp(value);
  return <>{prefix} {fmtARS(animated)}</>;
};

const ReportsDonut = ({ data, total, title }: { data: any[], total: number, title: string }) => (
  <div className="bg-white p-6 rounded-[2rem] shadow-sm flex flex-col items-center">
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
    <div className="bg-white p-6 rounded-[2rem] shadow-sm">
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
      <div className="bg-white rounded-t-[2rem] sm:rounded-[2rem] p-6 w-full sm:max-w-sm max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <div><h3 className="text-xl font-bold">Presupuestos</h3><p className="text-xs text-gray-400 mt-0.5">Límite mensual por categoría</p></div>
          <button onClick={onClose} className="p-2 bg-gray-100 rounded-full"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          {local.map((b, i) => (
            <div key={i} className="bg-gray-50 rounded-2xl p-3 flex items-center gap-3">
              <span className="text-2xl">{getCategoryEmoji(b.category)}</span>
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
      <div className="bg-white rounded-2xl shadow-sm p-4">
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between"><span className="text-gray-600">Entradas</span><span className="font-bold text-green-600">+ $ {fmtARS(reportStats.income)}</span></div>
        <div className="p-4 border-b border-gray-100 flex justify-between"><span className="text-gray-600">Salidas</span><span className="font-bold text-black">- $ {fmtARS(reportStats.expense)}</span></div>
        <div className="p-4 bg-gray-50 flex justify-between"><span className="font-bold text-gray-800">Balance</span><span className={`font-bold ${balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>$ {fmtARS(balance)}</span></div>
      </div>
      <ReportsDonut data={incomesByCategory} total={reportStats.income} title="Ingresos por categoría" />
      <ReportsDonut data={expensesByCategory} total={reportStats.expense} title="Gastos por categoría" />
      <ReportsBarChart historyData={historyData} />
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

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex flex-col items-center justify-center p-6">
      <div className="mb-8 flex flex-col items-center">
        <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center shadow-xl rotate-3 mb-4"><Wallet className="text-white" size={32} /></div>
        <h1 className="text-2xl font-bold tracking-tight">FinanzasApp</h1>
      </div>
      <div className="bg-white p-8 rounded-[2rem] shadow-xl w-full max-w-sm border border-gray-100">
        {view === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <h2 className="text-xl font-bold text-center mb-4">Iniciar Sesión</h2>
            <div className="relative"><Mail className="absolute left-4 top-3.5 text-gray-400" size={20} /><input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-gray-50 pl-12 p-3 rounded-xl outline-none" /></div>
            <div className="relative"><LockIcon className="absolute left-4 top-3.5 text-gray-400" size={20} /><input type={showPass ? "text" : "password"} placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-gray-50 pl-12 pr-12 p-3 rounded-xl outline-none" /><button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-3.5 text-gray-400">{showPass ? <EyeOff size={20} /> : <Eye size={20} />}</button></div>
            {error && <p className="text-red-500 text-xs text-center">{error}</p>}
            <button disabled={loading} className="w-full bg-black text-white font-bold py-3 rounded-xl shadow-lg disabled:opacity-50">{loading ? 'Ingresando...' : 'Entrar'}</button>
            <div className="text-center space-y-2 mt-4"><button type="button" onClick={() => setView('forgot')} className="text-xs text-gray-500">¿Olvidaste tu contraseña?</button><p className="text-xs text-gray-400">¿No tenés cuenta? <button type="button" onClick={() => setView('register')} className="text-indigo-600 font-bold">Registrate</button></p></div>
          </form>
        )}
        {view === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="flex items-center gap-2 mb-2"><button type="button" onClick={() => setView('login')}><ArrowLeft /></button><h2 className="text-xl font-bold">Registro</h2></div>
            {successMsg ? (
              <div className="text-center py-6 space-y-3">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="text-green-500" size={36} />
                </div>
                <p className="text-green-700 font-bold text-lg">¡Cuenta creada!</p>
                <p className="text-sm text-gray-500">{successMsg}</p>
                <button type="button" onClick={() => { setView('login'); setSuccessMsg(''); }} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl shadow-lg mt-2">Ir al login</button>
              </div>
            ) : (
              <>
                <div className="bg-blue-50 rounded-xl p-3 space-y-1">
                  <p className="text-xs font-bold text-blue-700">🔒 Tu privacidad es prioridad</p>
                  <p className="text-[11px] text-blue-600 leading-relaxed">Solo necesitás un email y contraseña. El nombre puede ser cualquiera — no pedimos DNI ni datos personales reales. No tenemos acceso a tus cuentas bancarias; todo lo cargás vos manualmente.</p>
                </div>
                <input type="text" placeholder="Nombre (puede ser un apodo)" value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-50 p-3 rounded-xl outline-none" />
                <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-gray-50 p-3 rounded-xl outline-none" />
                <input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-gray-50 p-3 rounded-xl outline-none" />
                <input type="password" placeholder="Confirmar" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} className="w-full bg-gray-50 p-3 rounded-xl outline-none" />
                {error && <p className="text-red-500 text-xs text-center">{error}</p>}
                <button disabled={loading} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl shadow-lg disabled:opacity-50">{loading ? 'Creando...' : 'Crear Cuenta'}</button>
              </>
            )}
          </form>
        )}
        {view === 'forgot' && (
          <form onSubmit={handleRecover} className="space-y-4">
            <div className="flex items-center gap-2 mb-2"><button type="button" onClick={() => { setView('login'); setSuccessMsg(''); setError(''); }}><ArrowLeft /></button><h2 className="text-xl font-bold">Recuperar contraseña</h2></div>
            {!successMsg ? (
              <>
                <p className="text-sm text-gray-500">Ingresá tu email y te mandamos un link para crear una nueva contraseña.</p>
                {error && <p className="text-red-500 text-xs text-center">{error}</p>}
                <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-gray-50 p-3 rounded-xl outline-none" />
                <button disabled={loading} className="w-full bg-black text-white font-bold py-3 rounded-xl disabled:opacity-50">{loading ? 'Enviando...' : 'Enviar link'}</button>
              </>
            ) : (
              <div className="text-center py-6 space-y-3">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="text-green-500" size={36} />
                </div>
                <p className="text-green-700 font-bold text-lg">¡Listo!</p>
                <p className="text-sm text-gray-500">Revisá tu bandeja de entrada en <strong>{email}</strong> y seguí el link para crear una nueva contraseña.</p>
                <p className="text-xs text-gray-400">Si no lo ves, revisá la carpeta de spam.</p>
                <button type="button" onClick={() => { setView('login'); setSuccessMsg(''); }} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl shadow-lg mt-2">Volver al inicio</button>
              </div>
            )}
          </form>
        )}
      </div>
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
      <div className="bg-white p-6 rounded-[2rem] shadow-sm">
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
      <div className="bg-white p-6 rounded-[2rem] shadow-sm">
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
      <div className="bg-white p-6 rounded-[2rem] shadow-sm">
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

const ProfileView = ({ user, onUpdate, onBack }: { user: any, onUpdate: (data: any) => void, onBack: () => void }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user.name); const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone || '');
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
    if (phone && user.id) {
      await supabase.from('profiles').upsert({ user_id: user.id, phone: phone.startsWith('+') ? phone : `+${phone}` });
    }
    setPass({ current: '', new: '', confirm: '' });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
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
      <form onSubmit={save} className="bg-white p-6 rounded-[2rem] shadow-sm space-y-5">
        <div className="flex justify-center"><div className="relative cursor-pointer" onClick={() => fileRef.current?.click()}><img src={user.avatar} className="w-24 h-24 rounded-full bg-gray-200 border-4 border-gray-50 object-cover" /><div className="absolute bottom-0 right-0 p-2 bg-black text-white rounded-full shadow"><Camera size={16} /></div><input type="file" ref={fileRef} className="hidden" accept="image/*" onChange={handlePhoto} /></div></div>
        <div className="space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-50 p-3 rounded-xl border outline-none" placeholder="Nombre" />
          <input value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-gray-50 p-3 rounded-xl border outline-none" placeholder="Email" />
          <div className="bg-green-50 rounded-xl p-3 space-y-1">
            <p className="text-xs font-bold text-green-700 flex items-center gap-1">💬 Vincular WhatsApp</p>
            <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-white p-2.5 rounded-lg border outline-none text-sm" placeholder="+5491112345678" />
            <p className="text-[10px] text-green-600">Con tu número vinculado podés registrar gastos mandando mensajes al bot.</p>
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

const HelpView = ({ onBack }: { onBack: () => void }) => {
  const [asunto, setAsunto] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [sent, setSent] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!asunto.trim() || !mensaje.trim()) return;
    const sub = encodeURIComponent(`[FinanzasApp] ${asunto}`);
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
      <div className="bg-white p-6 rounded-[2rem] shadow-sm space-y-1">
        <h3 className="font-bold text-lg mb-4">Preguntas Frecuentes</h3>
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
      <div className="bg-white p-6 rounded-[2rem] shadow-sm">
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
    <div className={`bg-white rounded-2xl p-4 shadow-sm border ${isPaid ? 'border-green-200 opacity-60' : 'border-gray-100'}`}>
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
  onAdd: (d: Omit<Debt, 'id'>) => Promise<void>;
  onEdit: (d: Debt) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPay: (debtId: string, debtAmountReduced: number, accountName: string, txAmount: number) => Promise<void>;
  onBack: () => void;
  dolarRates: DolarRates | null;
}) => {
  const emptyForm = { person: '', concept: '', amount: '', type: 'me_deben' as 'me_deben' | 'les_debo', date: new Date().toISOString().split('T')[0], currency: 'ARS' as Currency };
  const [showForm, setShowForm] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
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
    setShowForm(true);
  };

  const openEdit = (d: Debt) => {
    setEditingDebt(d);
    setForm({ person: d.person, concept: d.concept, amount: fmtARS(d.remainingAmount), type: d.type, date: d.date, currency: d.currency });
    setShowForm(true);
  };

  const saveForm = async () => {
    if (!form.person.trim() || !form.amount) return;
    const amount = parseInput(form.amount);
    if (editingDebt) {
      await onEdit({ ...editingDebt, person: form.person, concept: form.concept, remainingAmount: amount, date: form.date, currency: form.currency, type: form.type });
    } else {
      await onAdd({ person: form.person, concept: form.concept, originalAmount: amount, remainingAmount: amount, type: form.type, date: form.date, currency: form.currency });
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
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
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
            <button onClick={saveForm} className="w-full bg-black text-white font-bold py-3 rounded-2xl">Guardar</button>
          </div>
        </div>
      )}

      {/* Modal pago/cobro */}
      {payingDebt && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => setPayingDebt(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
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
    <div className="fixed inset-0 z-[999] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in">
      <div className="w-full max-w-xs flex flex-col items-center gap-5">
        <div className="relative">
          <img src={user.avatar} className="w-24 h-24 rounded-full border-4 border-white/20 object-cover" />
          <div className="absolute -bottom-2 -right-2 bg-white/20 rounded-full p-2">
            <Lock className="text-white" size={16} />
          </div>
        </div>
        <div className="text-center">
          <p className="text-white font-bold text-xl">{user.name}</p>
          <p className="text-white/50 text-sm">{user.email}</p>
        </div>
        <form onSubmit={unlock} className="w-full space-y-3">
          <input
            type="password"
            value={pass}
            onChange={e => setPass(e.target.value)}
            placeholder="Contraseña"
            autoFocus
            className="w-full bg-white/10 text-white placeholder:text-white/30 p-4 rounded-2xl outline-none text-center text-lg tracking-widest border border-white/10 focus:border-white/30"
          />
          {error && <p className="text-red-400 text-xs text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black font-bold py-3.5 rounded-2xl disabled:opacity-50"
          >
            {loading ? 'Verificando...' : 'Desbloquear'}
          </button>
        </form>
        {biometricAvailable && (
          <button
            onClick={unlockBiometric}
            disabled={loading}
            className="flex items-center gap-2 text-white/60 text-sm py-2 hover:text-white/90 transition-colors"
          >
            <span className="text-xl">🔐</span> Usar Face ID / Touch ID
          </button>
        )}
        <button
          onClick={onSignOut}
          className="text-white/30 text-xs mt-2 hover:text-white/60 transition-colors"
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

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });

  const getStreak = (habitId: string) => {
    let streak = 0;
    const d = new Date();
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

  const HABIT_EMOJIS = ['✅','🏃','💪','📚','💧','🧘','🥗','😴','🚴','🎯','✍️','🧹','💊','🌿','🎸','🖥️','📝','🏋️','🛁','☀️'];

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
              <div key={habit.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onToggle(habit.id, today)}
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 transition-all active:scale-90"
                    style={{ backgroundColor: completedToday ? habit.color : '#F3F4F6' }}
                  >
                    {completedToday ? '✅' : habit.emoji}
                  </button>
                  <div className="flex-1">
                    <p className="font-bold">{habit.name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      {streak > 0 && <span className="text-xs font-bold text-orange-500 flex items-center gap-1"><Flame size={12} /> {streak} días</span>}
                      <div className="flex gap-1">
                        {last7.map(date => (
                          <div key={date} className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: isCompleted(habit.id, date) ? habit.color : '#F3F4F6' }}>
                            {isCompleted(habit.id, date) && <span className="text-white text-[8px] font-bold">✓</span>}
                          </div>
                        ))}
                      </div>
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
          <div className="bg-white rounded-t-[2rem] p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Nuevo Hábito</h3>
              <button onClick={() => setShowForm(false)} className="p-2 bg-gray-100 rounded-full"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Nombre</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ej: Hacer ejercicio" className="w-full bg-gray-50 p-3 rounded-xl border mt-1 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Emoji</label>
                <div className="grid grid-cols-10 gap-1 mt-1 bg-gray-50 rounded-xl p-2">
                  {HABIT_EMOJIS.map(e => (
                    <button key={e} type="button" onClick={() => setForm({...form, emoji: e})} className={`text-xl p-1 rounded-lg ${form.emoji === e ? 'bg-white shadow' : ''}`}>{e}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Color</label>
                <div className="flex gap-2 mt-1">
                  {HABIT_COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setForm({...form, color: c})} className={`w-8 h-8 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : ''}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Frecuencia</label>
                <div className="flex bg-gray-100 p-1 rounded-xl mt-1">
                  {(['daily', 'weekly'] as const).map(f => (
                    <button key={f} type="button" onClick={() => setForm({...form, frequency: f})} className={`flex-1 py-2 text-xs font-bold rounded-lg ${form.frequency === f ? 'bg-white shadow' : ''}`}>{f === 'daily' ? 'Diario' : 'Semanal'}</button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => {
                  if (!form.name.trim()) return;
                  onAdd(form);
                  setShowForm(false);
                  setForm({ name: '', emoji: '✅', color: '#10B981', frequency: 'daily' });
                }}
                className="w-full bg-black text-white font-bold py-4 rounded-2xl"
              >
                Crear Hábito
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// APP PRINCIPAL
// ============================================================

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
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
  const [userPlan, setUserPlan] = useState({ noAds: false, whatsappActive: false });
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [dolarRates, setDolarRates] = useState<DolarRates | null>(null);
  const [dolarLoading, setDolarLoading] = useState(false);
  const [activityFilter, setActivityFilter] = useState({ search: '' });

  const [accForm, setAccForm] = useState({ id: '', name: '', provider: 'Default', balance: '', type: 'gastos' as AccountType, limit: '', currency: 'ARS' as Currency, emoji: '' });
  const [transForm, setTransForm] = useState({
    id: '', amount: '', description: '', type: 'gasto' as TransactionType,
    category: 'Comida', account: '', toAccount: '', method: 'debito' as PaymentMethod,
    date: '', isRecurring: false, incomeType: 'fijo' as IncomeType, debtPaymentId: ''
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

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u = session.user;
        setCurrentUser({ id: u.id, name: u.user_metadata?.name || u.email?.split('@')[0] || 'Usuario', email: u.email || '', avatar: u.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.email}` });
      }
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const u = session.user;
        setCurrentUser({ id: u.id, name: u.user_metadata?.name || u.email?.split('@')[0] || 'Usuario', email: u.email || '', avatar: u.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.email}` });
      } else {
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
  useEffect(() => {
    if (!currentUser?.id) return;
    const load = async () => {
      const [{ data: txs }, { data: accs }, { data: buds }, { data: dts }, { data: hbts }, { data: hlogs }] = await Promise.all([
        supabase.from('transactions').select('*').eq('user_id', currentUser.id).order('date', { ascending: false }),
        supabase.from('accounts').select('*').eq('user_id', currentUser.id),
        supabase.from('budgets').select('*').eq('user_id', currentUser.id),
        supabase.from('debts').select('*').eq('user_id', currentUser.id).order('date', { ascending: false }),
        supabase.from('habits').select('*').eq('user_id', currentUser.id).order('created_at'),
        supabase.from('habit_logs').select('*').eq('user_id', currentUser.id),
      ]);
      if (txs) setTransactions(txs.map((t: any) => ({ id: t.id, amount: t.amount, description: t.description, category: t.category, account: t.account, toAccount: t.to_account, method: t.method, type: t.type, incomeType: t.income_type, isRecurring: t.is_recurring, date: t.date })));
      if (accs) setAccountsList(accs.map((a: any) => ({ id: a.id, name: a.name, provider: a.provider, initialBalance: a.initial_balance, limit: a.limit_amount, type: a.type, currency: a.currency })));
      if (buds) setBudgets(buds.map((b: any) => ({ category: b.category, limit: b.limit_amount })));
      if (dts) setDebts(dts.map((d: any) => ({ id: d.id, person: d.person, concept: d.concept || '', originalAmount: d.original_amount, remainingAmount: d.remaining_amount, type: d.type, date: d.date, currency: d.currency })));
      if (hbts) setHabits(hbts.map((h: any) => ({ id: h.id, name: h.name, emoji: h.emoji, color: h.color, frequency: h.frequency, createdAt: h.created_at })));
      if (hlogs) setHabitLogs(hlogs.map((l: any) => ({ id: l.id, habitId: l.habit_id, date: l.date })));
      // Cargar plan
      const { data: profile } = await supabase.from('profiles').select('no_ads, whatsapp_active, phone').eq('user_id', currentUser.id).single();
      if (profile) {
        setUserPlan({ noAds: profile.no_ads || false, whatsappActive: profile.whatsapp_active || false });
        if (profile.phone) setCurrentUser((u: any) => ({ ...u, phone: profile.phone }));
      }
      // Cargar customizaciones desde user_metadata (no requiere columnas extra en DB)
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser?.user_metadata) {
        const meta = authUser.user_metadata;
        if (meta.custom_categories) { setCustomCategories(meta.custom_categories); localStorage.setItem('customCategories', JSON.stringify(meta.custom_categories)); }
        if (meta.custom_category_emojis) { setCustomCategoryEmojis(meta.custom_category_emojis); localStorage.setItem('customCategoryEmojis', JSON.stringify(meta.custom_category_emojis)); }
        if (meta.custom_account_emojis) { setCustomAccountEmojis(meta.custom_account_emojis); localStorage.setItem('customAccountEmojis', JSON.stringify(meta.custom_account_emojis)); }
      }
    };
    load();
  }, [currentUser?.id]);

  // Scroll al top al cambiar de pestaña
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'instant' as any });
  }, [activeTab]);

  // Cotización del dólar — dolarapi.com
  const fetchDolarRates = async () => {
    setDolarLoading(true);
    try {
      const res = await fetch('https://dolarapi.com/v1/dolares');
      const data = await res.json();
      const blue = data.find((d: any) => d.casa === 'blue');
      const oficial = data.find((d: any) => d.casa === 'oficial');
      const mep = data.find((d: any) => d.casa === 'bolsa');
      setDolarRates({
        blue: blue?.venta ?? 0,
        oficial: oficial?.venta ?? 0,
        mep: mep?.venta ?? 0,
        updatedAt: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      });
    } catch { /* sin conexión o CORS en dev */ }
    finally { setDolarLoading(false); }
  };

  useEffect(() => { fetchDolarRates(); }, []);

  useEffect(() => {
    if ('Notification' in window) setNotifPermission(Notification.permission);
  }, []);

  // Manejar redirect de Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const type = params.get('type');
    if (payment === 'success') {
      if (type === 'no_ads') setUserPlan(p => ({ ...p, noAds: true }));
      if (type === 'whatsapp') setUserPlan(p => ({ ...p, whatsappActive: true }));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Chequear alertas de presupuesto cuando cambian las transacciones
  useEffect(() => {
    if (settings.notifications && notifPermission === 'granted' && budgets.length && transactions.length) {
      checkBudgetAlerts(budgets, transactions);
    }
  }, [transactions, budgets, settings.notifications, notifPermission]);

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

  const liquidBalance = accountBalances.filter(a => (a.type === 'gastos' || a.type === 'efectivo') && a.currency === 'ARS').reduce((s, a) => s + a.current, 0);
  const usdTotal = accountBalances.filter(a => a.currency === 'USD').reduce((s, a) => s + a.current, 0);
  const arsTotal = accountBalances.filter(a => a.currency === 'ARS').reduce((s, a) => s + a.current, 0);
  const blueRate = dolarRates?.blue ?? 0;
  const patrimonioTotal = arsTotal + blueRate * usdTotal;

  // --- ACTIVOS / PASIVOS desglosados ---
  const activosBancos = accountBalances.filter(a => (a.type === 'gastos' || a.type === 'efectivo') && a.currency === 'ARS').reduce((s, a) => s + Math.max(0, a.current), 0);
  const activosAhorroARS = accountBalances.filter(a => a.type === 'ahorro' && a.currency === 'ARS').reduce((s, a) => s + Math.max(0, a.current), 0);
  const activosUSD = accountBalances.filter(a => a.currency === 'USD').reduce((s, a) => s + Math.max(0, a.current), 0);
  const activosMeDeben = debts.filter(d => d.type === 'me_deben' && d.remainingAmount > 0).reduce((s, d) => s + (d.currency === 'ARS' ? d.remainingAmount : d.remainingAmount * blueRate), 0);
  const totalActivos = activosBancos + activosAhorroARS + activosUSD * blueRate + activosMeDeben;
  const pasivosTarjetas = accountBalances.filter(a => a.type === 'credito').reduce((s, a) => s + Math.abs(Math.min(0, a.current)), 0);
  const pasivosDeudas = debts.filter(d => d.type === 'les_debo' && d.remainingAmount > 0).reduce((s, d) => s + (d.currency === 'ARS' ? d.remainingAmount : d.remainingAmount * blueRate), 0);
  const totalPasivos = pasivosTarjetas + pasivosDeudas;
  const patrimonioNeto = totalActivos - totalPasivos;

  const today = new Date();
  const currentMonthTxs = transactions.filter(t => { const [y, m] = t.date.split('-').map(Number); return y === today.getFullYear() && m === today.getMonth() + 1; });
  const monthlyStats = {
    income: currentMonthTxs.filter(t => t.type === 'ingreso').reduce((s, t) => s + t.amount, 0),
    expense: currentMonthTxs.filter(t => t.type === 'gasto').reduce((s, t) => s + t.amount, 0),
  };
  const percentageBurn = monthlyStats.income > 0 ? (monthlyStats.expense / monthlyStats.income) * 100 : 0;

  const filteredTxs = transactions.filter(t => {
    if (!activityFilter.search) return true;
    const q = activityFilter.search.toLowerCase();
    return t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || t.account.toLowerCase().includes(q);
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // --- HANDLERS ---

  const changeTab = (tab: string) => { setActiveTab(tab); setShowMenu(false); };
  const handleLogout = async () => { await supabase.auth.signOut(); setActiveTab('dashboard'); setShowMenu(false); };
  const handleUpdateProfile = async (data: any) => {
    setCurrentUser({ ...currentUser, ...data });
    const metaUpdate: any = {};
    if (data.name) metaUpdate.name = data.name;
    if (data.avatar) metaUpdate.avatar_url = data.avatar;
    if (Object.keys(metaUpdate).length) {
      await supabase.auth.updateUser({ data: metaUpdate });
    }
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transForm.account) return alert('Primero agregá una cuenta en la sección Cuentas');
    if (!transForm.amount || parseInput(transForm.amount) === 0) return alert('Ingresá un monto válido');
    if (transForm.type === 'transferencia' && !transForm.toAccount) return alert('Seleccioná una cuenta destino');
    const tx = { ...transForm, id: transForm.id || Date.now().toString(), amount: parseInput(transForm.amount) } as Transaction;
    const dbRow = { id: tx.id, user_id: currentUser.id, amount: tx.amount, description: tx.description, category: tx.category, account: tx.account, to_account: tx.type === 'transferencia' ? (tx.toAccount || null) : null, method: tx.method, type: tx.type, income_type: tx.incomeType || null, is_recurring: tx.isRecurring || false, date: tx.date };
    if (transForm.id) {
      await supabase.from('transactions').update(dbRow).eq('id', transForm.id);
      setTransactions(transactions.map(t => t.id === transForm.id ? tx : t));
    } else {
      await supabase.from('transactions').insert(dbRow);
      setTransactions([tx, ...transactions]);
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
  };

  const handleDeleteTransaction = async (id: string) => {
    await supabase.from('transactions').delete().eq('id', id);
    setTransactions(transactions.filter(t => t.id !== id));
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
      await supabase.from('accounts').update({ name: accForm.name, provider: accForm.provider, type: accForm.type, currency: accForm.currency, initial_balance: newInitialBalance, limit_amount: accForm.limit ? parseInput(accForm.limit) : null }).eq('id', accForm.id);
      setAccountsList(accountsList.map(a => a.id === accForm.id ? { ...a, name: accForm.name, provider: accForm.provider, type: accForm.type, currency: accForm.currency, initialBalance: newInitialBalance, limit: parseInput(accForm.limit) } : a));
      // Guardar emoji personalizado en localStorage + Supabase
      const updatedAccEmojis = { ...customAccountEmojis, [accForm.id]: accForm.emoji };
      if (!accForm.emoji) delete updatedAccEmojis[accForm.id];
      setCustomAccountEmojis(updatedAccEmojis);
      localStorage.setItem('customAccountEmojis', JSON.stringify(updatedAccEmojis));
      supabase.auth.updateUser({ data: { custom_account_emojis: updatedAccEmojis } });
    } else {
      const parsedInitialBal = accForm.type === 'credito' && accForm.limit
        ? parseInput(accForm.balance) - parseInput(accForm.limit) // available → actual (negative)
        : parseInput(accForm.balance);
      const newAcc = { ...accForm, id: Date.now().toString(), initialBalance: parsedInitialBal, limit: accForm.limit ? parseInput(accForm.limit) : undefined };
      await supabase.from('accounts').insert({ id: newAcc.id, user_id: currentUser.id, name: newAcc.name, provider: newAcc.provider, initial_balance: newAcc.initialBalance, limit_amount: newAcc.limit || null, type: newAcc.type, currency: newAcc.currency });
      setAccountsList([...accountsList, newAcc]);
      if (accForm.emoji) {
        const updatedAccEmojis = { ...customAccountEmojis, [newAcc.id]: accForm.emoji };
        setCustomAccountEmojis(updatedAccEmojis);
        localStorage.setItem('customAccountEmojis', JSON.stringify(updatedAccEmojis));
        supabase.auth.updateUser({ data: { custom_account_emojis: updatedAccEmojis } });
      }
    }
    showToast('Cuenta guardada ✓');
    setShowAccountModal(false);
  };

  const openTxModal = (tx?: Transaction, type: TransactionType = 'gasto', accountName?: string, toAccountName?: string) => {
    if (tx) {
      setTransForm({ id: tx.id, amount: fmtARS(tx.amount), description: tx.description, type: tx.type, category: tx.category, account: tx.account, toAccount: tx.toAccount || '', method: tx.method, date: tx.date, isRecurring: tx.isRecurring || false, incomeType: tx.incomeType || 'fijo', debtPaymentId: '' });
    } else {
      const def = accountName || accountsList[0]?.name || '';
      const toDefault = toAccountName || accountsList.find(a => a.name !== def)?.name || '';
      setTransForm({ id: '', amount: '', description: '', type, category: CATEGORIES[type][0], account: def, toAccount: toDefault, method: 'debito', date: new Date().toISOString().split('T')[0], isRecurring: false, incomeType: 'fijo', debtPaymentId: '' });
    }
    setShowTransactionModal(true);
  };

  const openAccModal = (acc?: any) => {
    if (acc) {
      const displayBalance = acc.type === 'credito' && acc.limit != null
        ? fmtARS(acc.limit + acc.current) // available = limit - debt (current is negative)
        : fmtARS(acc.current);
      setAccForm({ id: acc.id, name: acc.name, provider: acc.provider, balance: displayBalance, type: acc.type, limit: acc.limit ? fmtARS(acc.limit) : '', currency: acc.currency, emoji: customAccountEmojis[acc.id] || '' });
    } else {
      setAccForm({ id: '', name: '', provider: 'Default', balance: '', type: 'gastos', limit: '', currency: 'ARS', emoji: '' });
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
    // Persistir en Supabase Auth user_metadata
    supabase.auth.updateUser({ data: { custom_categories: updatedCats, custom_category_emojis: updatedEmojis } });
    setTransForm(f => ({ ...f, category: trimmed }));
    setAddingCategory(false);
    setNewCategoryInput('');
    setNewCategoryEmoji('📋');
  };

  // getCatEmoji: usa overrides del usuario + defaults
  const getCatEmoji = (cat: string) => getCategoryEmoji(cat, customCategoryEmojis);

  // --- HANDLERS DEUDAS ---

  const handleSaveDebt = async (d: Omit<Debt, 'id'>) => {
    const newDebt: Debt = { ...d, id: Date.now().toString() };
    await supabase.from('debts').insert({ id: newDebt.id, user_id: currentUser.id, person: newDebt.person, concept: newDebt.concept, original_amount: newDebt.originalAmount, remaining_amount: newDebt.remainingAmount, type: newDebt.type, date: newDebt.date, currency: newDebt.currency });
    setDebts(prev => [newDebt, ...prev]);
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
    const tx: Transaction = { id: Date.now().toString(), amount: txAmount, description: fullDesc, category: debt.type === 'me_deben' ? 'Intereses' : 'Pago de deuda', account: accountName, method: 'transferencia', type: txType, date: new Date().toISOString().split('T')[0] };
    await supabase.from('transactions').insert({ id: tx.id, user_id: currentUser.id, amount: tx.amount, description: tx.description, category: tx.category, account: tx.account, to_account: null, method: tx.method, type: tx.type, income_type: null, is_recurring: false, date: tx.date });
    setTransactions(prev => [tx, ...prev]);
    await supabase.from('debts').update({ remaining_amount: newRemaining }).eq('id', debtId);
    setDebts(prev => prev.map(d => d.id === debtId ? { ...d, remainingAmount: newRemaining } : d));
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F] font-sans flex flex-col">

      {/* ── MENÚ LATERAL ─────────────────────────────── */}
      <div className={`fixed inset-0 z-[80] ${showMenu ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <div className={`absolute inset-0 bg-black/40 transition-opacity ${showMenu ? 'opacity-100' : 'opacity-0'}`} onClick={() => setShowMenu(false)} />
        <div className={`absolute top-0 right-0 bottom-0 w-3/4 max-w-xs bg-white shadow-2xl transition-transform p-6 flex flex-col ${showMenu ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex justify-between items-center mb-5"><h2 className="text-xl font-bold">Menú</h2><button onClick={() => setShowMenu(false)} className="p-2 bg-gray-100 rounded-full"><X size={20} /></button></div>
          <div className="flex items-center gap-3 mb-5 p-3 bg-gray-50 rounded-2xl">
            <img src={currentUser.avatar} className="w-11 h-11 rounded-full object-cover" />
            <div><p className="font-bold text-sm">{currentUser.name}</p><p className="text-xs text-gray-500">{currentUser.email}</p></div>
          </div>
          <div className="space-y-1 flex-1">
            {[
              { icon: User, label: 'Mi Perfil', tab: 'profile' },
              { icon: Users, label: 'Deudas', tab: 'debts' },
              { icon: CheckCircle2, label: 'Hábitos', tab: 'habits' },
              { icon: TrendingUp, label: 'Proyecciones', tab: 'future' },
              { icon: Target, label: 'Presupuestos', tab: null, action: () => { setShowBudgetModal(true); setShowMenu(false); } },
              { icon: Zap, label: userPlan.noAds && userPlan.whatsappActive ? 'Plan Pro ✓' : 'Planes', tab: null, action: () => { setShowUpgradeModal(true); setShowMenu(false); } },
              { icon: Settings, label: 'Configuración', tab: 'settings' },
              { icon: HelpCircle, label: 'Ayuda', tab: 'help' },
            ].map(({ icon: Icon, label, tab, action }) => (
              <button key={label} onClick={action || (() => changeTab(tab!))} className="flex items-center gap-3 w-full p-3 hover:bg-gray-50 rounded-xl text-left">
                <Icon size={20} className="text-gray-500" /><span className="font-medium">{label}</span>
              </button>
            ))}
          </div>
          <button onClick={handleLogout} className="flex items-center justify-center gap-2 p-4 bg-red-50 text-red-600 font-bold rounded-xl"><LogOut size={20} /> Cerrar Sesión</button>
        </div>
      </div>

      {/* ── HEADER ───────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-[#F5F5F7]/95 backdrop-blur-md px-5 py-3 flex justify-between items-center border-b border-gray-200/50 shadow-sm flex-none">
        <div><span className="text-[10px] text-[#86868B] font-medium uppercase tracking-wide">Finanzas Personales</span><h1 className="text-xl font-bold tracking-tight text-black leading-tight">{currentUser.name}</h1></div>
        <button onClick={() => setShowMenu(true)} className="w-9 h-9 rounded-full overflow-hidden border-2 border-white shadow-sm"><img src={currentUser.avatar} className="w-full h-full object-cover" /></button>
      </div>

      {/* ── CONTENIDO ────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-5 pt-5 pb-36 space-y-5">

        {activeTab === 'profile' && <ProfileView user={currentUser} onUpdate={handleUpdateProfile} onBack={() => changeTab('dashboard')} />}
        {activeTab === 'help' && <HelpView onBack={() => changeTab('dashboard')} />}
        {activeTab === 'reports' && <ReportsView transactions={transactions} />}
        {activeTab === 'future' && <FutureView liquidBalance={liquidBalance} />}
        {activeTab === 'debts' && (
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

        {activeTab === 'habits' && (
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

        {activeTab === 'settings' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex items-center gap-3"><button onClick={() => changeTab('dashboard')} className="p-2 bg-white rounded-full shadow-sm"><ArrowLeft size={20} /></button><h2 className="text-2xl font-bold">Configuración</h2></div>
            <div className="bg-white p-6 rounded-[2rem] shadow-sm space-y-5">
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
        {activeTab === 'dashboard' && (
          <div className="space-y-5 animate-in fade-in">

            {/* Balance principal — compacto para no cortarse */}
            <div className="bg-white rounded-[2rem] p-5 shadow-sm border border-gray-100">
              <span className="text-[#86868B] font-medium text-xs tracking-wide uppercase">Neto para Gastar</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-light text-[#86868B]">$</span>
                <h2 className="text-4xl font-semibold tracking-tighter">{fmtARS(liquidBalance)}</h2>
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
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Impacto</p>
                  <p className="text-sm font-bold text-gray-700 mt-0.5">{percentageBurn.toFixed(0)}%</p>
                </div>
              </div>
            </div>

            {/* Aviso carga manual */}
            <p className="text-[10px] text-gray-400 text-center -mt-2">✏️ Todos los datos son ingresados manualmente · Sin conexión a bancos</p>

            {/* Ad Banner — solo para usuarios free */}
            {!userPlan.noAds && <AdBanner onUpgrade={() => setShowUpgradeModal(true)} />}

            {/* Widget Dólar */}
            <div className="bg-gray-900 rounded-2xl p-4 text-white">
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
                  <p className="text-[10px] text-gray-500 mt-2 text-right">Act. {dolarRates.updatedAt} · dolarapi.com</p>
                </>
              ) : (
                <div className="flex items-center gap-2 text-gray-400 py-1"><RefreshCw size={13} className="animate-spin" /><span className="text-sm">Cargando cotización...</span></div>
              )}
            </div>

            {/* Presupuestos */}
            {budgets.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
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
                        <span className="text-sm font-bold">{getCategoryEmoji(b.category)} {b.category}</span>
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
            <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
              {/* Header */}
              <div className="px-5 pt-5 pb-4 flex justify-between items-start border-b border-gray-100">
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
              <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 text-center space-y-4">
                <div className="text-5xl">👋</div>
                <h3 className="font-bold text-lg">¡Bienvenido a FinanzasApp!</h3>
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

            {/* Actividad reciente */}
            {accountsList.length > 0 && (
            <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
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
                <div key={t.id} onClick={() => openTxModal(t)} className={`px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 ${i !== 3 ? 'border-b border-gray-50' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base flex-shrink-0 ${t.type === 'ingreso' ? 'bg-green-100' : t.type === 'transferencia' ? 'bg-blue-100' : 'bg-gray-100'}`}>{getCatEmoji(t.category)}</div>
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
        {activeTab === 'accounts' && (
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
                        <div key={acc.id} onClick={() => setSelectedAccountForAction(acc)} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex justify-between items-center cursor-pointer active:scale-[0.98] transition-transform">
                          <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${conf.bg}`}>
                              {customAccountEmojis[acc.id] ? <span className="text-2xl">{customAccountEmojis[acc.id]}</span> : <TypeIcon size={22} style={{ color: conf.color }} />}
                            </div>
                            <div>
                              <p className="font-bold">{acc.name}</p>
                              {isCredit && available !== null && <p className="text-[11px] text-red-400">Gastado: ${fmtARS(debt)} / ${fmtARS(acc.limit!)}</p>}
                              {acc.currency === 'USD' && <p className="text-[11px] text-gray-400">Cuenta en dólares</p>}
                            </div>
                          </div>
                          <div className="text-right">
                            {isCredit
                              ? available !== null
                                ? <><p className="font-bold text-base">${fmtARS(available)}</p><p className="text-[10px] text-gray-400 font-bold uppercase">Disponible</p></>
                                : <><p className="font-bold text-base text-red-500">- ${fmtARS(debt)}</p><p className="text-[10px] text-red-400 font-bold uppercase">Deuda</p></>
                              : <p className="font-bold text-base">{acc.currency === 'USD' ? 'u$s' : '$'} {fmtARS(acc.current)}</p>
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
        {activeTab === 'activity' && (
          <div className="space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Actividad</h2>
              <button
                onClick={() => {
                  const rows = filteredTxs.map(t => ({
                    'Fecha': t.date,
                    'Descripción': t.description,
                    'Tipo': t.type === 'gasto' ? 'Gasto' : t.type === 'ingreso' ? 'Ingreso' : 'Transferencia',
                    'Categoría': t.category,
                    'Cuenta': t.account,
                    'Cuenta Destino': t.toAccount || '',
                    'Método': t.method,
                    'Monto': t.amount,
                    'Recurrente': t.isRecurring ? 'Sí' : 'No',
                  }));
                  const ws = XLSX.utils.json_to_sheet(rows);
                  ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 10 }];
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
                  XLSX.writeFile(wb, `FinanzasApp_${new Date().toISOString().split('T')[0]}.xlsx`);
                }}
                className="flex items-center gap-1.5 bg-green-600 text-white text-xs font-bold px-3 py-2 rounded-xl"
              >
                <span>📥</span> Exportar Excel
              </button>
            </div>
            <div className="flex items-center bg-white px-3 py-2.5 rounded-xl border shadow-sm gap-2">
              <Search size={16} className="text-gray-400 flex-shrink-0" />
              <input type="text" placeholder="Descripción, categoría, cuenta..." value={activityFilter.search} onChange={e => setActivityFilter({ search: e.target.value })} className="w-full outline-none text-sm" />
              {activityFilter.search && <button onClick={() => setActivityFilter({ search: '' })} className="text-gray-400 flex-shrink-0"><X size={16} /></button>}
            </div>
            <p className="text-xs text-gray-400 font-medium">{filteredTxs.length} movimiento{filteredTxs.length !== 1 ? 's' : ''}</p>
            <div className="space-y-2">
              {filteredTxs.map(t => (
                <div key={t.id} onClick={() => openTxModal(t)} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer active:scale-[0.99] transition-transform">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base flex-shrink-0 ${t.type === 'ingreso' ? 'bg-green-100' : t.type === 'transferencia' ? 'bg-blue-100' : 'bg-gray-100'}`}>{getCatEmoji(t.category)}</div>
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
                <div className="text-center py-16"><Search size={40} className="mx-auto mb-3 text-gray-200" /><p className="font-medium text-gray-400">Sin resultados</p><p className="text-sm text-gray-300 mt-1">"{activityFilter.search}"</p></div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── NAVBAR ───────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-gray-200 pb-8 pt-2 z-40 shadow-sm">
        <div className="flex justify-around items-center h-16 max-w-md mx-auto px-2">
          {[
            { icon: LayoutDashboard, label: 'Inicio', tab: 'dashboard' },
            { icon: Wallet, label: 'Cuentas', tab: 'accounts' },
          ].map(({ icon: Icon, label, tab }) => (
            <button key={tab} onClick={() => changeTab(tab)} className={`flex flex-col items-center gap-1 w-14 ${activeTab === tab ? 'text-black' : 'text-gray-400'}`}>
              <Icon size={22} strokeWidth={activeTab === tab ? 2.5 : 2} /><span className="text-[10px] font-bold">{label}</span>
            </button>
          ))}
          <button onClick={() => openTxModal()} className="-mt-10 bg-black text-white w-16 h-16 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all border-4 border-[#F5F5F7]"><Plus size={30} /></button>
          {[
            { icon: Activity, label: 'Actividad', tab: 'activity' },
            { icon: PieChart, label: 'Reportes', tab: 'reports' },
          ].map(({ icon: Icon, label, tab }) => (
            <button key={tab} onClick={() => changeTab(tab)} className={`flex flex-col items-center gap-1 w-14 ${activeTab === tab ? 'text-black' : 'text-gray-400'}`}>
              <Icon size={22} strokeWidth={activeTab === tab ? 2.5 : 2} /><span className="text-[10px] font-bold">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* ── MODAL TRANSACCIÓN ────────────────────────── */}
      {showTransactionModal && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm" onClick={() => { setShowTransactionModal(false); setConfirmDeleteId(null); }}>
          <div className="bg-white rounded-t-[2rem] sm:rounded-[2rem] p-6 w-full sm:max-w-sm max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">{transForm.id ? 'Editar' : 'Nuevo'} Movimiento</h3>
              <button onClick={() => { setShowTransactionModal(false); setConfirmDeleteId(null); }} className="p-2 bg-gray-100 rounded-full"><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveTransaction} className="space-y-4">
              {(() => {
                const creditCards = accountsList.filter(a => a.type === 'credito');
                const isCreditPayment = transForm.type === 'transferencia' && accountsList.find(a => a.name === transForm.toAccount)?.type === 'credito';
                return (
                  <>
                    <div className="flex bg-gray-100 p-1 rounded-xl">
                      {(['gasto', 'ingreso', 'transferencia'] as TransactionType[]).map(t => {
                        if (t === 'transferencia' && accountsList.length < 2) return null;
                        return <button key={t} type="button" onClick={() => { setTransForm({ ...transForm, type: t, category: allCategories(t as TransactionType)[0] }); setAddingCategory(false); setNewCategoryInput(''); }} className={`flex-1 py-2 text-xs font-bold rounded-lg uppercase transition-all ${transForm.type === t && !isCreditPayment ? 'bg-white shadow' : ''}`}>{t}</button>;
                      })}
                      {creditCards.length > 0 && (
                        <button type="button" onClick={() => {
                          const firstBank = accountsList.find(a => a.type !== 'credito')?.name || '';
                          const firstCard = creditCards[0].name;
                          setTransForm({ ...transForm, type: 'transferencia', account: firstBank, toAccount: firstCard, description: `Pago ${firstCard}`, category: 'Transferencia' });
                          setAddingCategory(false);
                        }} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${isCreditPayment ? 'bg-purple-600 text-white shadow' : ''}`}>💳 Tarjeta</button>
                      )}
                    </div>
                    {isCreditPayment && (
                      <div className="flex items-center gap-2 bg-purple-50 rounded-xl px-3 py-2">
                        <CreditCard size={14} className="text-purple-600 flex-shrink-0" />
                        <p className="text-xs text-purple-700 font-medium">Pago de tarjeta — reduce la deuda de la tarjeta seleccionada</p>
                      </div>
                    )}
                  </>
                );
              })()}
              <div className="flex justify-center">
                <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-full border">
                  <Calendar size={14} className="text-gray-400" />
                  <input type="date" value={transForm.date} onChange={e => setTransForm({ ...transForm, date: e.target.value })} className="bg-transparent font-medium text-sm outline-none text-gray-600" />
                </div>
              </div>
              <input type="text" inputMode="decimal" placeholder="$ 0" className="w-full text-center text-4xl font-bold outline-none py-2" autoFocus
                onChange={e => {
                  setTransForm({ ...transForm, amount: formatInput(e.target.value) });
                }}
                value={transForm.amount}
              />
              <input placeholder="Descripción" className="w-full border-b py-2 outline-none text-base" onChange={e => setTransForm({ ...transForm, description: e.target.value })} value={transForm.description} />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Categoría</label>
                  {addingCategory ? (
                    <div className="mt-1 space-y-2">
                      <div className="flex gap-1">
                        <button type="button" className="text-xl w-10 h-10 flex-shrink-0 bg-gray-100 rounded-xl flex items-center justify-center">{newCategoryEmoji}</button>
                        <input
                          autoFocus
                          type="text"
                          value={newCategoryInput}
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
                          <button key={e} type="button" onClick={() => setNewCategoryEmoji(e)} className={`text-lg p-1 rounded-lg transition-colors ${newCategoryEmoji === e ? 'bg-indigo-100 ring-1 ring-indigo-400' : 'hover:bg-gray-200'}`}>{e}</button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <select className="w-full bg-gray-50 p-3 rounded-xl text-sm mt-1" value={transForm.category} onChange={e => { if (e.target.value === '__add__') setAddingCategory(true); else setTransForm({ ...transForm, category: e.target.value }); }}>
                      {allCategories(transForm.type).map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="__add__">＋ Agregar categoría...</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Cuenta</label>
                  <select className="w-full bg-gray-50 p-3 rounded-xl text-sm mt-1" value={transForm.account} onChange={e => { if (e.target.value === '__add__') { openAccModal(); } else setTransForm({ ...transForm, account: e.target.value }); }}>
                    {accountsList.map(a => <option key={a.id} value={a.name}>{a.type === 'ahorro' ? `🐷 ${a.name}` : a.name}</option>)}
                    <option value="__add__">＋ Nueva cuenta...</option>
                  </select>
                  {accountsList.find(a => a.name === transForm.account)?.type === 'ahorro' && (
                    <p className="text-[10px] text-amber-600 font-medium mt-1 ml-1">🐷 Cuenta de ahorro — no afecta el Neto para Gastar</p>
                  )}
                </div>
              </div>
              {transForm.type === 'transferencia' && (() => {
                const isCreditPayment = accountsList.find(a => a.name === transForm.toAccount)?.type === 'credito';
                const creditCards = accountsList.filter(a => a.type === 'credito' && a.name !== transForm.account);
                const otherAccounts = accountsList.filter(a => a.type !== 'credito' && a.name !== transForm.account);
                return (
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">
                      {isCreditPayment ? '💳 Tarjeta a Pagar' : 'Cuenta Destino'}
                    </label>
                    <select className={`w-full p-3 rounded-xl text-sm mt-1 ${isCreditPayment ? 'bg-purple-50 border border-purple-200' : 'bg-gray-50'}`} value={transForm.toAccount} onChange={e => {
                      const newCard = e.target.value;
                      const isNewCredit = accountsList.find(a => a.name === newCard)?.type === 'credito';
                      setTransForm({ ...transForm, toAccount: newCard, description: isNewCredit ? `Pago ${newCard}` : transForm.description });
                    }}>
                      {isCreditPayment ? (
                        <>
                          {creditCards.map(a => <option key={a.id} value={a.name}>💳 {a.name}</option>)}
                          {otherAccounts.length > 0 && <optgroup label="Otras cuentas">{otherAccounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}</optgroup>}
                        </>
                      ) : (
                        accountsList.filter(a => a.name !== transForm.account).map(a => <option key={a.id} value={a.name}>{a.type === 'credito' ? `💳 ${a.name}` : a.name}</option>)
                      )}
                    </select>
                  </div>
                );
              })()}
              {transForm.category === 'Pago de deuda' && transForm.type === 'gasto' && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">¿A cuál deuda aplicar?</label>
                  <select
                    className="w-full bg-orange-50 border border-orange-200 p-3 rounded-xl text-sm mt-1"
                    value={transForm.debtPaymentId}
                    onChange={e => {
                      const debt = debts.find(d => d.id === e.target.value);
                      setTransForm({ ...transForm, debtPaymentId: e.target.value, description: debt ? `Pago: ${debt.person}${debt.concept ? ` · ${debt.concept}` : ''}` : transForm.description, amount: debt ? fmtARS(debt.remainingAmount) : transForm.amount });
                    }}
                  >
                    <option value="">— Sin vincular —</option>
                    {debts.filter(d => d.type === 'les_debo' && d.remainingAmount > 0).map(d => (
                      <option key={d.id} value={d.id}>📤 {d.person}{d.concept ? ` · ${d.concept}` : ''} — ${fmtARS(d.remainingAmount)}</option>
                    ))}
                  </select>
                  {transForm.debtPaymentId && <p className="text-[10px] text-orange-600 font-medium mt-1 ml-1">✓ Al guardar se descontará del saldo pendiente</p>}
                </div>
              )}
              {transForm.type !== 'transferencia' && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Método de Pago</label>
                  <div className="grid grid-cols-4 gap-2 mt-1">
                    {PAYMENT_METHODS.map(m => (
                      <button key={m.key} type="button" onClick={() => setTransForm({ ...transForm, method: m.key })} className={`py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all ${transForm.method === m.key ? 'bg-black text-white shadow-md' : 'bg-gray-100 text-gray-500'}`}>
                        <span className="text-base">{m.emoji}</span><span>{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {transForm.type === 'ingreso' && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Tipo de Ingreso</label>
                  <div className="flex bg-gray-100 p-1 rounded-xl mt-1">
                    {(['fijo', 'variable'] as IncomeType[]).map(t => (
                      <button key={t} type="button" onClick={() => setTransForm({ ...transForm, incomeType: t })} className={`flex-1 py-2 text-xs font-bold rounded-lg capitalize ${transForm.incomeType === t ? 'bg-white shadow' : ''}`}>{t}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Recurrente / Fijo</span>
                <button type="button" onClick={() => setTransForm({ ...transForm, isRecurring: !transForm.isRecurring })} className={`w-11 h-6 rounded-full relative transition-colors ${transForm.isRecurring ? 'bg-black' : 'bg-gray-200'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow transition-all ${transForm.isRecurring ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>
              <button type="submit" className="w-full bg-black text-white font-bold py-4 rounded-2xl text-base">Guardar</button>
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
        </div>
      )}

      {/* ── MODAL CUENTA ─────────────────────────────── */}
      {showAccountModal && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowAccountModal(false)}>
          <div className="bg-white rounded-t-[2rem] sm:rounded-[2rem] p-6 w-full sm:max-w-sm max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5"><h3 className="text-xl font-bold">{accForm.id ? 'Editar' : 'Nueva'} Cuenta</h3><button onClick={() => setShowAccountModal(false)} className="p-2 bg-gray-100 rounded-full"><X size={18} /></button></div>
            <form onSubmit={handleSaveAccount} className="space-y-4">
              {!accForm.id && <p className="text-[11px] text-gray-400 bg-gray-50 p-3 rounded-xl">ℹ️ <strong>Carga manual:</strong> FinanzasApp no se conecta a tu banco. Ingresá el saldo actual y registrá tus movimientos a mano o por WhatsApp.</p>}
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
                <div className="flex bg-gray-100 p-1 rounded-xl mt-1">
                  {(['ARS', 'USD'] as Currency[]).map(c => (
                    <button key={c} type="button" onClick={() => setAccForm({ ...accForm, currency: c })} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${accForm.currency === c ? 'bg-white shadow' : ''}`}>{c === 'ARS' ? '🇦🇷 ARS' : '🇺🇸 USD'}</button>
                  ))}
                </div>
              </div>
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
                  <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">{accForm.emoji || '🏦'}</div>
                  <div className="grid grid-cols-8 gap-1 flex-1 max-h-20 overflow-y-auto bg-gray-50 rounded-xl p-1.5">
                    <button type="button" onClick={() => setAccForm({ ...accForm, emoji: '' })} className={`text-lg p-1 rounded-lg ${!accForm.emoji ? 'bg-indigo-100 ring-1 ring-indigo-400' : 'hover:bg-gray-200'}`}>🏦</button>
                    {EMOJI_LIST.map(e => (
                      <button key={e} type="button" onClick={() => setAccForm({ ...accForm, emoji: e })} className={`text-lg p-1 rounded-lg transition-colors ${accForm.emoji === e ? 'bg-indigo-100 ring-1 ring-indigo-400' : 'hover:bg-gray-200'}`}>{e}</button>
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
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedAccountForAction(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5"><h3 className="text-xl font-bold">{selectedAccountForAction.name}</h3><button onClick={() => setSelectedAccountForAction(null)} className="p-2 bg-gray-100 rounded-full"><X size={18} /></button></div>
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
            <button onClick={() => { openAccModal(selectedAccountForAction); setSelectedAccountForAction(null); }} className="w-full py-3 bg-gray-100 rounded-2xl font-bold text-gray-600 flex items-center justify-center gap-2"><Pencil size={16} /> Editar / Ajustar Saldo</button>
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
        setBudgets(newBudgets);
        await supabase.from('budgets').delete().eq('user_id', currentUser.id);
        if (newBudgets.length) await supabase.from('budgets').insert(newBudgets.map(b => ({ user_id: currentUser.id, category: b.category, limit_amount: b.limit })));
      }} onClose={() => setShowBudgetModal(false)} />}

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

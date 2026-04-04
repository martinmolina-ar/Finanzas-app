import React, { useState } from 'react';
import { X, Zap, MessageCircle, CheckCircle2, Loader } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

interface Props {
  userId: string;
  email: string;
  noAds: boolean;
  whatsappActive: boolean;
  onClose: () => void;
}

export const UpgradeModal = ({ userId, email, noAds, whatsappActive, onClose }: Props) => {
  const [loading, setLoading] = useState<string | null>(null);

  const checkout = async (type: 'no_ads' | 'whatsapp') => {
    setLoading(type);
    try {
      const res = await fetch(`${BACKEND_URL}/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, userId, email }),
      });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      window.location.href = url;
    } catch (err: any) {
      alert('Error al iniciar el pago: ' + err.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-t-[2rem] sm:rounded-[2rem] p-6 w-full sm:max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xl font-bold">Planes</h3>
            <p className="text-xs text-gray-400 mt-0.5">Mejorá tu experiencia</p>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-100 rounded-full"><X size={18} /></button>
        </div>

        <div className="space-y-3">

          {/* Sin Ads */}
          <div className={`rounded-2xl border-2 p-4 ${noAds ? 'border-green-200 bg-green-50' : 'border-gray-100'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <Zap size={20} className="text-indigo-600" />
                </div>
                <div>
                  <p className="font-bold">Sin publicidad</p>
                  <p className="text-xs text-gray-400">Pago único, para siempre</p>
                </div>
              </div>
              {noAds ? (
                <div className="flex items-center gap-1 text-green-600 font-bold text-sm">
                  <CheckCircle2 size={16} /> Activo
                </div>
              ) : (
                <button
                  onClick={() => checkout('no_ads')}
                  disabled={loading === 'no_ads'}
                  className="bg-black text-white font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                >
                  {loading === 'no_ads' ? <Loader size={14} className="animate-spin" /> : null}
                  $3
                </button>
              )}
            </div>
            {!noAds && (
              <ul className="mt-3 space-y-1">
                {['Sin anuncios para siempre', 'Un solo pago', 'Incluye futuras versiones'].map(f => (
                  <li key={f} className="text-xs text-gray-500 flex items-center gap-1.5">
                    <CheckCircle2 size={11} className="text-indigo-400 flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* WhatsApp Bot */}
          <div className={`rounded-2xl border-2 p-4 ${whatsappActive ? 'border-green-200 bg-green-50' : 'border-gray-100'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <MessageCircle size={20} className="text-green-600" />
                </div>
                <div>
                  <p className="font-bold">Bot de WhatsApp</p>
                  <p className="text-xs text-gray-400">Suscripción mensual</p>
                </div>
              </div>
              {whatsappActive ? (
                <div className="flex items-center gap-1 text-green-600 font-bold text-sm">
                  <CheckCircle2 size={16} /> Activo
                </div>
              ) : (
                <button
                  onClick={() => checkout('whatsapp')}
                  disabled={loading === 'whatsapp'}
                  className="bg-green-600 text-white font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                >
                  {loading === 'whatsapp' ? <Loader size={14} className="animate-spin" /> : null}
                  $1/mes
                </button>
              )}
            </div>
            {!whatsappActive && (
              <ul className="mt-3 space-y-1">
                {['Registrá gastos por WhatsApp', 'Pedí tu resumen mensual', 'Claude entiende lenguaje natural'].map(f => (
                  <li key={f} className="text-xs text-gray-500 flex items-center gap-1.5">
                    <CheckCircle2 size={11} className="text-green-400 flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>

        <p className="text-[10px] text-center text-gray-400 mt-4">
          Pagos seguros con Stripe · Cancelá cuando quieras
        </p>
      </div>
    </div>
  );
};

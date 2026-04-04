import React from 'react';
import { X } from 'lucide-react';

// Reemplazá XXXXXXXXXXXXXXXX con tu publisher ID de Google AdSense
const ADSENSE_CLIENT = 'ca-pub-XXXXXXXXXXXXXXXX';
const ADSENSE_SLOT = '1234567890';

declare global {
  interface Window { adsbygoogle: any[]; }
}

export const AdBanner = ({ onUpgrade }: { onUpgrade: () => void }) => {
  const isProduction = import.meta.env.PROD && ADSENSE_CLIENT !== 'ca-pub-XXXXXXXXXXXXXXXX';

  React.useEffect(() => {
    if (!isProduction) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {}
  }, []);

  if (isProduction) {
    return (
      <div className="relative w-full overflow-hidden rounded-xl">
        <ins
          className="adsbygoogle block"
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={ADSENSE_SLOT}
          data-ad-format="auto"
          data-full-width-responsive="true"
          style={{ display: 'block' }}
        />
      </div>
    );
  }

  // Placeholder en dev / sin AdSense configurado
  return (
    <div className="relative bg-gray-100 border border-dashed border-gray-300 rounded-xl px-4 py-3 flex items-center justify-between">
      <div>
        <p className="text-[10px] text-gray-400 uppercase font-bold">Publicidad</p>
        <p className="text-xs text-gray-500 mt-0.5">Espacio publicitario · Google AdSense</p>
      </div>
      <button
        onClick={onUpgrade}
        className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1.5 rounded-lg whitespace-nowrap"
      >
        Quitar ads $3
      </button>
    </div>
  );
};

import { createClient } from '@supabase/supabase-js';

// En producción usamos el proxy en Railway (/sb-proxy → supabase.co)
// Railway no agrega headers extra → sin REQUEST_HEADER_TOO_LARGE
// CORS preflight va a Railway (siempre activo, sin cold start) → Safari funciona
const supabaseUrl = import.meta.env.PROD
  ? 'https://finanzas-app-production-c783.up.railway.app/sb-proxy'
  : 'https://hjjtmzfvalhqhqokzume.supabase.co';

const supabaseAnonKey = 'sb_publishable_GUYrUqljWI29aHi2ZrH_ew_Bm1X9OXv';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

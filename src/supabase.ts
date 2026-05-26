import { createClient } from '@supabase/supabase-js';

// En producción usamos la serverless function de Vercel (/api/sb → supabase.co)
// Solo reenvía headers necesarios → sin REQUEST_HEADER_TOO_LARGE ni CORS preflight
const supabaseUrl = import.meta.env.PROD
  ? 'https://www.pampa-app.ar/api/sb'
  : 'https://hjjtmzfvalhqhqokzume.supabase.co';

const supabaseAnonKey = 'sb_publishable_GUYrUqljWI29aHi2ZrH_ew_Bm1X9OXv';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

import { createClient } from '@supabase/supabase-js';

// URL directa — sin proxy por ahora
// Chrome siempre funciona; Safari tiene cold start timeout pero el retry lo resuelve
const supabaseUrl = 'https://hjjtmzfvalhqhqokzume.supabase.co';

const supabaseAnonKey = 'sb_publishable_GUYrUqljWI29aHi2ZrH_ew_Bm1X9OXv';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

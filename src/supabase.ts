import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hjjtmzfvalhqhqokzume.supabase.co';
const supabaseAnonKey = 'sb_publishable_GUYrUqljWI29aHi2ZrH_ew_Bm1X9OXv';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);


import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tglzslthvlcwwwdsqqti.supabase.co';
const supabaseKey = 'sb_publishable_BnBYminI7e24fHbVwf2BPw_aviPNEfa';

export const supabase = createClient(supabaseUrl, supabaseKey);

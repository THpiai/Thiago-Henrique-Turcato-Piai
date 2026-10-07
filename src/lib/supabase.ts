import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://wdsaiwehttuvduhdflwv.supabase.co'
// Chave publicável: feita para ficar no app; quem protege os dados são as regras (RLS) do banco.
const key = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_-CFTp_3-UKVbEDa3rmgQwg_5UMG6lqw'

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'fdm-auth' },
})

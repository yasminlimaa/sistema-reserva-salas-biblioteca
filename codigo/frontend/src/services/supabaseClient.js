import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const chaveAnon = import.meta.env.VITE_SUPABASE_ANON_KEY

// Fica null quando as variáveis não estão definidas; o provedor supabase avisa isso ao usuário.
export const supabase = url && chaveAnon ? createClient(url, chaveAnon) : null

import * as mock from './mock.js'
import * as api from './api.js'
import * as supabase from './supabase.js'

// Escolhe o provedor de autenticação pela variável VITE_AUTH_PROVIDER.
// As telas só conhecem este objeto; trocar de backend ou de banco não exige mexer nos formulários.
const provedores = { mock, api, supabase }
const nome = import.meta.env.VITE_AUTH_PROVIDER || 'mock'

if (!provedores[nome]) {
  throw new Error(`VITE_AUTH_PROVIDER inválido: "${nome}". Use mock, api ou supabase.`)
}

export const authService = provedores[nome]

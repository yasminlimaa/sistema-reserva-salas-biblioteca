// Em desenvolvimento, os valores relativos passam pelo proxy do Vite.
// Em produção, podem apontar diretamente para cada serviço.
const env = import.meta.env ?? {}

export const apiUrls = {
  usuarios: env.VITE_USUARIOS_API_URL || '/api/usuarios',
  salas: env.VITE_SALAS_API_URL || '/api/salas',
  reservas: env.VITE_RESERVAS_API_URL || '/api/reservas',
}

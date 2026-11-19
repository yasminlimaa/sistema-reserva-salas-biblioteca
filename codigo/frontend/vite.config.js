import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = (nome, padrao) => env[nome] || padrao

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/usuarios': { target: target('USUARIOS_API_PROXY_TARGET', 'http://127.0.0.1:3003'), changeOrigin: true, rewrite: (path) => path.replace(/^\/api\/usuarios/, '') },
        '/api/salas': { target: target('SALAS_API_PROXY_TARGET', 'http://127.0.0.1:3002'), changeOrigin: true, rewrite: (path) => path.replace(/^\/api\/salas/, '') },
        '/api/reservas': { target: target('RESERVAS_API_PROXY_TARGET', 'http://127.0.0.1:3001'), changeOrigin: true, rewrite: (path) => path.replace(/^\/api\/reservas/, '') },
      },
    },
  }
})

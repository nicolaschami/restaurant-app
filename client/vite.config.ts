import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // Tells Vite how to process @import "tailwindcss";
  ],
  server: {
    port: 5173,
    proxy: {
      // Forwards any request starting with /api to your Express backend
      '/api': {
        //target: 'http://localhost:5000', // 👈 Make sure this matches your Express backend port
        target: 'http://127.0.0.1:5000', // 👈 Change localhost to 127.0.0.1
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
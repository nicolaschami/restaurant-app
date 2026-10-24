import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // Tells Vite how to process @import "tailwindcss";
  ],
  define: {
    // Defines 'global' in browser environment for Node libraries
    global: 'window',
  },
  resolve: {
    alias: {
      // Maps Node buffer imports to the browser polyfill package
      buffer: 'buffer/',
    },
  },
  server: {
    port: 5173,
    // Development only (cloud-ready, 2026-10-26): the screens call /api, /uploads and
    // /ws on their OWN address — like on the server, where RES delivers both the
    // screens and the API. Here Vite forwards those to the RES server on port 3000.
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:3000', ws: true, changeOrigin: true },
    },
  },
})
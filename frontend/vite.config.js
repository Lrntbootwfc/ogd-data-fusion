// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'

// // https://vite.dev/config/
// export default defineConfig({
//   plugins: [react()],
// })


// frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(),tailwindcss()],
  server: {
    proxy: {
      // Proxy all requests starting with /api to the Flask backend
      '/api': {
        target: 'http://127.0.0.1:5000', // The address where Flask is running
        changeOrigin: true,
        // rewrite: (path) => path.replace(/^\/api/, ''), // Use this if you want to drop /api
      },
    },
  },
})
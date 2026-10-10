import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite"; // Import the new Tailwind CSS Vite plugin

// https://vitejs.dev/config/
export default defineConfig({
  base: '',
  plugins: [
    react(),
    tailwindcss(), // Add the Tailwind CSS Vite plugin
  ],
  ssr: {
    noExternal: ['@tailwindcss/vite']
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
})

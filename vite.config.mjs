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
    // The live preview is proxied through a <port>-<sandboxId>.e2b.app hostname.
    allowedHosts: ['.e2b.app'],
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
})

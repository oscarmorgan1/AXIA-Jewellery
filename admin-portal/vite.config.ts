import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The portal is served from /admin on the same Firebase Hosting site as the
// storefront. `npm run build` writes to ../admin, which firebase.json serves.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  build: { outDir: '../admin', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  // In dev, /api goes to the local server (`npm run serve`, port 5050).
  server: { port: 5173, host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:5050' } },
});

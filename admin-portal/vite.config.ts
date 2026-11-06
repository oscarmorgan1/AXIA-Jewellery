import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The portal is served from /admin on the same Firebase Hosting site as the
// storefront. `npm run build` writes to ../admin, which firebase.json serves.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  build: {
    outDir: '../admin', emptyOutDir: true, chunkSizeWarningLimit: 600,
    // Libraries in their own files: they change rarely, so browsers keep them cached across portal updates.
    rollupOptions: {
      output: {
        manualChunks: (id: string) => /node_modules\/(@firebase|firebase)\//.test(id) ? 'firebase'
          : /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id) ? 'react' : undefined,
      },
    },
  },
  // In dev, /api goes to the local server (`npm run serve`, port 5050).
  server: { port: 5173, host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:5050' } },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The customer portal, served at /portal by the same server as the storefront.
// It lives beside the admin portal so it can share the sign-in design (AuthShell),
// the styles and the Firebase setup, but it's a separate build: no admin code
// ships to customers. `npm run build` writes it to ../portal.
export default defineConfig({
  root: 'portal',
  base: '/portal/',
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: '../../portal', emptyOutDir: true, chunkSizeWarningLimit: 600,
    rollupOptions: {
      // sync.ts is the storefront's saved-bag sync, loaded by assets/js/axia.js
      // from a fixed address (/portal/sync.js), so it isn't hashed.
      input: { index: 'portal/index.html', sync: 'portal/sync.ts' },
      output: {
        entryFileNames: chunk => chunk.name === 'sync' ? 'sync.js' : 'assets/[name]-[hash].js',
        manualChunks: (id: string) => /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id) ? 'react' : undefined,
      },
    },
  },
  // In dev, /api goes to the local server (`npm run serve`, port 5050).
  server: { port: 5174, host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:5050' } },
});

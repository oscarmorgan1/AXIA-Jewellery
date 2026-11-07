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
      output: {
        manualChunks: (id: string) => /node_modules\/(@firebase|firebase)\//.test(id) ? 'firebase'
          : /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id) ? 'react' : undefined,
      },
    },
  },
  // In dev, /api goes to the local server (`npm run serve`, port 5050).
  server: { port: 5174, host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:5050' } },
});

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth';
import App from './App';
import { ConfirmProvider } from './components/Confirm';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter basename="/admin">
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);

// Service worker so the portal can be added to the home screen. Production
// builds only: in dev it would get in the way of Vite's live reload. It caches
// no portal data, only an offline notice (see public/sw.js).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' }).catch(err => console.warn('Service worker not registered', err));
  });
}

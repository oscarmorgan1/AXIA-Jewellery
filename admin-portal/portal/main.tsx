import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AccountProvider } from './account';
import App from './App';
import '../src/styles.css';
import './portal.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccountProvider>
      <BrowserRouter basename="/portal">
        <App />
      </BrowserRouter>
    </AccountProvider>
  </StrictMode>,
);

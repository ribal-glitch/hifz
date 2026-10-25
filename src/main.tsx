import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { StoreProvider } from './store';
import './styles.css';

// Neue Versionen werden im Hintergrund geladen und beim nächsten Öffnen aktiv.
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StoreProvider>
    <App />
  </StoreProvider>,
);

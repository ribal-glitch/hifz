import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource/eb-garamond/latin-500.css';
import '@fontsource/eb-garamond/latin-ext-500.css';
import '@fontsource/eb-garamond/latin-600.css';
import '@fontsource/eb-garamond/latin-ext-600.css';
import { App } from './App';
import { AudioProvider } from './audio';
import { StoreProvider } from './store';
import './styles.css';

// Neue Versionen werden im Hintergrund geladen und beim nächsten Öffnen aktiv.
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StoreProvider>
    <AudioProvider>
      <App />
    </AudioProvider>
  </StoreProvider>,
);

import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-ext-400.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-ext-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-ext-700.css';
import { App } from './App';
import { AudioProvider } from './audio';
import { IS_ARTIFACT } from './platform';
import { StoreProvider } from './store';
import './styles.css';

// Neue Versionen werden im Hintergrund geladen und beim nächsten Öffnen aktiv.
if (IS_ARTIFACT) document.documentElement.classList.add('artifact');
else registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StoreProvider>
    <AudioProvider>
      <App />
    </AudioProvider>
  </StoreProvider>,
);

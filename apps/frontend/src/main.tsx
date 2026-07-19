import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './lib/i18n';
import { fetchMe } from './lib/api';
import { useAuthStore } from './stores/authStore';

async function bootstrap() {
  // Vor dem ersten Render aufgelöst, damit der Auth-Guard nie flackert.
  // fetchMe wirft nie — nicht eingeloggt (oder Fehler) ergibt user = null.
  const user = await fetchMe();
  useAuthStore.getState().setUser(user);

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();

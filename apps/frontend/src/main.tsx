import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './lib/i18n';
import { fetchMe, initSession } from './lib/api';
import { useSessionStore } from './stores/sessionStore';
import { useAuthStore } from './stores/authStore';

async function bootstrap() {
  try {
    // fetchMe wirft nie — Gäste (oder Auth-Fehler) ergeben schlicht user = null.
    const [sessionId, user] = await Promise.all([initSession(), fetchMe()]);
    useSessionStore.getState().setSessionId(sessionId);
    useAuthStore.getState().setUser(user);
  } catch (e) {
    console.error('Session-Initialisierung fehlgeschlagen:', e);
    useSessionStore.getState().setError('Verbindung zum Server fehlgeschlagen. Bitte Seite neu laden.');
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();

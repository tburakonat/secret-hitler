import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './lib/i18n';
import { initSession } from './lib/api';
import { useSessionStore } from './stores/sessionStore';

async function bootstrap() {
  try {
    const sessionId = await initSession();
    useSessionStore.getState().setSessionId(sessionId);
  } catch (e) {
    console.error('Session-Initialisierung fehlgeschlagen:', e);
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();

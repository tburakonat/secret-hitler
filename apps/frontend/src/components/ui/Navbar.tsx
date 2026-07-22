import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { logout } from '../../lib/api';
import { socket } from '../../lib/socket';
import { useAuthStore } from '../../stores/authStore';
import { useLobbyStore } from '../../stores/lobbyStore';
import { useGameStore } from '../../stores/gameStore';
import { Button } from './Button';
import { RulesModal } from './RulesModal';

const LANGUAGES = ['de', 'en', 'tr'] as const;
type Lang = typeof LANGUAGES[number];

const LANGUAGE_LABELS: Record<Lang, string> = {
  de: 'Deutsch',
  en: 'English',
  tr: 'Türkçe',
};

export function Navbar() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clearUser = useAuthStore((s) => s.clearUser);
  const lobbyId = useLobbyStore((s) => s.lobbyId);
  const phase = useGameStore((s) => s.phase);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const baseLang = i18n.language.split('-')[0];
  const current: Lang = (LANGUAGES as readonly string[]).includes(baseLang)
    ? (baseLang as Lang)
    : 'en';

  function setLanguage(lang: Lang) {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
  }

  const gameRunning = phase !== null && phase !== 'game_over';

  function handleLogoutClick() {
    // In einer Lobby oder laufenden Runde hat der Logout Nebenwirkungen
    // (Lobby verlassen bzw. Spielabbruch für alle) — vorher bestätigen lassen.
    if (lobbyId) {
      setConfirmOpen(true);
    } else {
      void doLogout();
    }
  }

  async function doLogout() {
    setLoggingOut(true);
    try {
      // Der Server räumt auf (Lobby verlassen / Spiel abbrechen) und trennt
      // alle Sockets dieses Users.
      await logout();
    } finally {
      clearUser();
      useLobbyStore.getState().reset();
      useGameStore.getState().reset();
      socket.disconnect();
      setConfirmOpen(false);
      setLoggingOut(false);
      navigate('/login');
    }
  }

  return (
    <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-800 bg-gray-900 px-4 py-2">
      <span className="text-sm font-semibold tracking-wide text-white">Secret Hitler</span>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setRulesOpen(true)}
          aria-label={t('rules.navLabel')}
          title={t('rules.navLabel')}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-600 text-xs font-semibold text-gray-300 hover:border-gray-400 hover:text-white"
        >
          ?
        </button>

        {user ? (
          <>
            <span className="max-w-40 truncate text-xs text-gray-400">{user.nickname}</span>
            <button
              onClick={handleLogoutClick}
              className="text-xs font-medium text-gray-300 hover:text-white"
            >
              {t('auth.logout')}
            </button>
          </>
        ) : (
          <Link to="/login" className="text-xs font-medium text-gray-300 hover:text-white">
            {t('auth.loginLink')}
          </Link>
        )}

        <select
          value={current}
          onChange={(e) => setLanguage(e.target.value as Lang)}
          className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs font-medium text-white"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {LANGUAGE_LABELS[lang]}
            </option>
          ))}
        </select>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-lg border border-gray-700 bg-gray-900 p-6">
            <h2 className="text-lg font-semibold text-white">{t('auth.logoutConfirmTitle')}</h2>
            <p className="mt-2 text-sm text-gray-300">
              {gameRunning ? t('auth.logoutConfirmGame') : t('auth.logoutConfirmLobby')}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={loggingOut}>
                {t('common.cancel')}
              </Button>
              <Button onClick={() => void doLogout()} disabled={loggingOut}>
                {loggingOut ? t('common.loading') : t('auth.logoutConfirmButton')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </nav>
  );
}

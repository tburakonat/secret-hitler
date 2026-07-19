import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { logout } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';

const LANGUAGES = ['de', 'en', 'tr'] as const;
type Lang = typeof LANGUAGES[number];

const LANGUAGE_LABELS: Record<Lang, string> = {
  de: 'Deutsch',
  en: 'English',
  tr: 'Türkçe',
};

export function Navbar() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const clearUser = useAuthStore((s) => s.clearUser);

  const baseLang = i18n.language.split('-')[0];
  const current: Lang = (LANGUAGES as readonly string[]).includes(baseLang)
    ? (baseLang as Lang)
    : 'en';

  function setLanguage(lang: Lang) {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
  }

  // Fasst Socket/Lobby bewusst nicht an — die Spiel-Identität hängt am
  // sessionId-Cookie, nicht am Login.
  async function handleLogout() {
    await logout();
    clearUser();
  }

  return (
    <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-800 bg-gray-900 px-4 py-2">
      <span className="text-sm font-semibold tracking-wide text-white">Secret Hitler</span>

      <div className="flex items-center gap-3">
        {user ? (
          <>
            <span className="max-w-40 truncate text-xs text-gray-400">{user.email}</span>
            <button
              onClick={handleLogout}
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
    </nav>
  );
}

import { useTranslation } from 'react-i18next';

const LANGUAGES = ['de', 'en'] as const;
type Lang = typeof LANGUAGES[number];

export function Navbar() {
  const { i18n } = useTranslation();
  const current: Lang = i18n.language.startsWith('de') ? 'de' : 'en';

  function setLanguage(lang: Lang) {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
  }

  return (
    <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-800 bg-gray-900 px-4 py-2">
      <span className="text-sm font-semibold tracking-wide text-white">Secret Hitler</span>

      <div className="flex rounded-md border border-gray-700 p-0.5">
        {LANGUAGES.map((lang) => (
          <button
            key={lang}
            onClick={() => setLanguage(lang)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              current === lang
                ? 'bg-gray-700 text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {lang.toUpperCase()}
          </button>
        ))}
      </div>
    </nav>
  );
}

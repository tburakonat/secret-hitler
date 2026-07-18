import { useTranslation } from 'react-i18next';

const LANGUAGES = ['de', 'en', 'tr'] as const;
type Lang = typeof LANGUAGES[number];

const LANGUAGE_LABELS: Record<Lang, string> = {
  de: 'Deutsch',
  en: 'English',
  tr: 'Türkçe',
};

export function Navbar() {
  const { i18n } = useTranslation();
  const baseLang = i18n.language.split('-')[0];
  const current: Lang = (LANGUAGES as readonly string[]).includes(baseLang)
    ? (baseLang as Lang)
    : 'en';

  function setLanguage(lang: Lang) {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
  }

  return (
    <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-800 bg-gray-900 px-4 py-2">
      <span className="text-sm font-semibold tracking-wide text-white">Secret Hitler</span>

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
    </nav>
  );
}

import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { AuthApiError, login, register } from '../lib/api';
import { socket } from '../lib/socket';
import { useAuthStore } from '../stores/authStore';

type Tab = 'login' | 'register';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = tab === 'login'
        ? await login({ email: email.trim(), password })
        : await register({ email: email.trim(), nickname: nickname.trim(), password });
      setUser(user);
      // Falls ein Socket mit unauthentifiziertem Handshake existiert: trennen,
      // damit die nächste Verbindung das frische authToken-Cookie mitschickt.
      socket.disconnect();
      navigate('/');
    } catch (err) {
      const code = err instanceof AuthApiError ? err.code : 'GENERIC';
      setError(t(`auth.errors.${code}`));
      setLoading(false);
    }
  }

  // Bereits eingeloggt (z. B. Direktaufruf von /login) → zurück zur Startseite.
  // `loading` schützt den Moment direkt nach dem Submit, in dem setUser schon
  // gesetzt ist, aber navigate('/') noch nicht gegriffen hat.
  if (user && !loading) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white">
            {t('home.title')}
          </h1>
          <p className="mt-1 text-gray-400">{t('auth.subtitle')}</p>
        </div>

        {/* Tab-Switcher */}
        <div className="flex rounded-lg border border-gray-700 p-1">
          {(['login', 'register'] as Tab[]).map((t2) => (
            <button
              key={t2}
              onClick={() => { setTab(t2); setError(null); }}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                tab === t2
                  ? 'bg-red-700 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t2 === 'login' ? t('auth.loginTab') : t('auth.registerTab')}
            </button>
          ))}
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              label={t('auth.email')}
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
            />

            {tab === 'register' && (
              <Input
                id="nickname"
                autoComplete="username"
                label={t('auth.nickname')}
                placeholder={t('auth.nicknamePlaceholder')}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={32}
              />
            )}

            <div className="space-y-1">
              <Input
                id="password"
                type="password"
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                label={t('auth.password')}
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={128}
              />
              {tab === 'register' && (
                <p className="text-xs text-gray-500">{t('auth.passwordHint')}</p>
              )}
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading
                ? t('common.loading')
                : tab === 'login'
                  ? t('auth.loginButton')
                  : t('auth.registerButton')}
            </Button>

            {error && (
              <p className="rounded-md bg-red-900/40 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}
          </form>
        </Card>
      </div>
    </div>
  );
}

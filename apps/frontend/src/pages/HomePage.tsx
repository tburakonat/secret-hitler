import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GAME_CONSTANTS } from '@secret-hitler/shared';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { socket, emitLobbyCreate, emitLobbyJoin } from '../lib/socket';
import { useSocketEvents } from '../hooks/useSocketEvents';
import { useLobbyStore } from '../stores/lobbyStore';
import type { LobbyUpdatedPayload, ErrorPayload } from '@secret-hitler/shared';

type Tab = 'create' | 'join';

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { setLobby } = useLobbyStore();

  const [tab, setTab] = useState<Tab>('create');
  const [isPublic, setIsPublic] = useState(true);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useSocketEvents({
    'lobby:updated': (payload: LobbyUpdatedPayload) => {
      setLobby({ lobbyId: payload.lobbyId, code: payload.code, players: payload.players, hostId: payload.hostId });
      if (payload.selfId) useLobbyStore.getState().setMyPlayerId(payload.selfId);

      setLoading(false);
      navigate('/lobby');
    },
    'error': (payload: ErrorPayload) => {
      setError(payload.message);
      setLoading(false);
    },
  });

  function connectAndEmit(action: () => void) {
    setError(null);
    setLoading(true);

    if (!socket.connected) {
      socket.connect();
      socket.once('connect', action);
    } else {
      action();
    }
  }

  function handleCreate() {
    connectAndEmit(() => emitLobbyCreate({ isPublic, maxPlayers }));
  }

  function handleJoin() {
    connectAndEmit(() => emitLobbyJoin({ code: code.trim() || undefined }));
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white">
            {t('home.title')}
          </h1>
          <p className="mt-1 text-gray-400">{t('home.subtitle')}</p>
        </div>

        {/* Tab-Switcher */}
        <div className="flex rounded-lg border border-gray-700 p-1">
          {(['create', 'join'] as Tab[]).map((t2) => (
            <button
              key={t2}
              onClick={() => { setTab(t2); setError(null); }}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                tab === t2
                  ? 'bg-red-700 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t2 === 'create' ? t('home.createTab') : t('home.joinTab')}
            </button>
          ))}
        </div>

        <Card>
          <div className="space-y-4">
            {tab === 'create' && (
              <>
                {/* isPublic Toggle */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <span className="text-sm font-medium text-gray-300">
                    {t('home.isPublic')}
                  </span>
                  <div
                    onClick={() => setIsPublic((v) => !v)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      isPublic ? 'bg-red-700' : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        isPublic ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                </label>

                {/* maxPlayers Slider */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-300">
                    {t('home.maxPlayers')}: {maxPlayers}
                  </label>
                  <input
                    type="range"
                    min={GAME_CONSTANTS.MIN_PLAYERS}
                    max={GAME_CONSTANTS.MAX_PLAYERS}
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(Number(e.target.value))}
                    className="w-full accent-red-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{GAME_CONSTANTS.MIN_PLAYERS}</span>
                    <span>{GAME_CONSTANTS.MAX_PLAYERS}</span>
                  </div>
                </div>

                <Button
                  onClick={handleCreate}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? t('common.loading') : t('home.createButton')}
                </Button>
              </>
            )}

            {tab === 'join' && (
              <>
                <Input
                  id="code"
                  label={t('home.code')}
                  placeholder={t('home.codePlaceholder')}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  maxLength={GAME_CONSTANTS.LOBBY_CODE_LENGTH}
                />

                <Button
                  onClick={handleJoin}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? t('common.loading') : t('home.joinButton')}
                </Button>
              </>
            )}

            {error && (
              <p className="rounded-md bg-red-900/40 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

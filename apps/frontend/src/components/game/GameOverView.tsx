import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../stores/gameStore';
import { useLobbyStore } from '../../stores/lobbyStore';
import { emitLobbyLeave, emitLobbyReturn } from '../../lib/socket';

function RoleIcon({ role }: { role: string }) {
  if (role === 'liberal') {
    return (
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (role === 'hitler') {
    return (
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  }
  return (
    <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

const roleStyles: Record<string, { card: string; badge: string; icon: string }> = {
  liberal: {
    card: 'bg-blue-950/60 border-blue-600',
    badge: 'bg-blue-600/20 text-blue-300 border border-blue-600/40',
    icon: 'text-blue-400',
  },
  fascist: {
    card: 'bg-red-950/60 border-red-700',
    badge: 'bg-red-700/20 text-red-300 border border-red-700/40',
    icon: 'text-red-400',
  },
  hitler: {
    card: 'bg-orange-950/60 border-orange-600',
    badge: 'bg-orange-600/20 text-orange-300 border border-orange-600/40',
    icon: 'text-orange-400',
  },
};

const rolePriority: Record<string, number> = { hitler: 0, fascist: 1, liberal: 2 };

export function GameOverView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const gameOver = useGameStore((s) => s.gameOver);
  const players = useLobbyStore((s) => s.players);
  const gamePlayers = useGameStore((s) => s.players);

  if (!gameOver) return null;

  const isLiberalWin = gameOver.winner === 'liberal';
  const rawPlayers = gamePlayers.length > 0 ? gamePlayers : players;

  const sortedPlayers = [...rawPlayers].sort((a, b) => {
    const roleA = gameOver.roles[a.id] ?? 'liberal';
    const roleB = gameOver.roles[b.id] ?? 'liberal';
    return (rolePriority[roleA] ?? 2) - (rolePriority[roleB] ?? 2);
  });

  const fascistGroup = sortedPlayers.filter((p) =>
    ['hitler', 'fascist'].includes(gameOver.roles[p.id] ?? '')
  );
  const liberalGroup = sortedPlayers.filter(
    (p) => (gameOver.roles[p.id] ?? 'liberal') === 'liberal'
  );

  function handleBackToLobby() {
    emitLobbyReturn();
    useGameStore.getState().reset();
    navigate('/lobby');
  }

  function handleLeave() {
    emitLobbyLeave();
    useGameStore.getState().reset();
    useLobbyStore.getState().reset();
    navigate('/');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/90 p-4 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-2xl space-y-6 py-8">

        {/* Winner Banner */}
        <div className={`rounded-2xl border-2 p-8 text-center shadow-2xl ${
          isLiberalWin
            ? 'border-blue-500 bg-blue-950/50 shadow-blue-900/40'
            : 'border-red-600 bg-red-950/50 shadow-red-900/40'
        }`}>
          <div className={`mb-2 text-5xl font-black tracking-tight ${
            isLiberalWin ? 'text-blue-300' : 'text-red-300'
          }`}>
            {isLiberalWin ? t('game.over.liberalWin') : t('game.over.fascistWin')}
          </div>
          <div className={`text-base font-medium ${isLiberalWin ? 'text-blue-400/80' : 'text-red-400/80'}`}>
            {t(`game.over.conditions.${gameOver.condition}`)}
          </div>
        </div>

        {/* Player Role Cards */}
        <div className="space-y-5">
          {[
            { group: fascistGroup, label: t('game.over.fascistsTitle'), headerClass: 'text-red-400' },
            { group: liberalGroup, label: t('game.over.liberalsTitle'), headerClass: 'text-blue-400' },
          ].map(({ group, label, headerClass }) => (
            <div key={label}>
              <h4 className={`mb-2 text-center text-xs font-semibold uppercase tracking-widest ${headerClass}`}>
                {label}
              </h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {group.map((p) => {
                  const role = gameOver.roles[p.id] ?? 'liberal';
                  const styles = roleStyles[role] ?? roleStyles.liberal;
                  const isDead = !p.isAlive;
                  return (
                    <div
                      key={p.id}
                      className={`flex flex-col items-center gap-2 rounded-xl border p-4 ${styles.card} ${isDead ? 'opacity-60 grayscale' : ''}`}
                    >
                      <div className={styles.icon}>
                        <RoleIcon role={role} />
                      </div>
                      <span className={`max-w-full truncate text-sm font-semibold ${isDead ? 'text-gray-400 line-through' : 'text-white'}`}>
                        {p.nickname}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${styles.badge}`}>
                        {t(`game.roles.${role}`)}
                      </span>
                      {isDead && (
                        <span className="rounded-full border border-gray-600/40 bg-gray-700/60 px-2 py-0.5 text-xs font-bold text-gray-400">
                          {t('game.over.executed')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleBackToLobby}
            className="flex-1 rounded-xl border border-gray-600 bg-gray-800 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-700 hover:border-gray-500"
          >
            {t('game.over.backToLobby')}
          </button>
          <button
            onClick={handleLeave}
            className="flex-1 rounded-xl border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm font-semibold text-red-400 transition-colors hover:bg-red-900/40 hover:text-red-300"
          >
            {t('game.over.leave')}
          </button>
        </div>

      </div>
    </div>
  );
}

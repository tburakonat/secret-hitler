import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import { emitNominateChancellor } from '../../lib/socket';
import { useGameStore } from '../../stores/gameStore';
import { useLobbyStore } from '../../stores/lobbyStore';

export function NominationView() {
  const { t } = useTranslation();
  const { presidentId, lastPresidentId, lastChancellorId, players, isSpecialElection } = useGameStore();
  const myPlayerId = useLobbyStore((s) => s.myPlayerId);

  const isPresident = myPlayerId === presidentId;

  if (!isPresident) {
    return (
      <div className="space-y-2">
        {isSpecialElection && (
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-yellow-400">
            {t('game.executive.specialElectionBadge')}
          </p>
        )}
        <p className="text-center text-gray-400">{t('game.nomination.waiting')}</p>
      </div>
    );
  }

  const aliveCount = players.filter((p) => p.isAlive).length;
  const ineligibleIds = new Set<string>([presidentId!]);
  if (aliveCount <= 5) {
    if (lastChancellorId) ineligibleIds.add(lastChancellorId);
  } else {
    if (lastPresidentId) ineligibleIds.add(lastPresidentId);
    if (lastChancellorId) ineligibleIds.add(lastChancellorId);
  }

  const candidates = players.filter((p) => p.isAlive && p.id !== presidentId);

  return (
    <div className="space-y-3">
      {isSpecialElection && (
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-yellow-400">
          {t('game.executive.specialElectionBadge')}
        </p>
      )}
      <p className="text-center text-sm font-medium text-white">{t('game.nomination.prompt')}</p>
      <ul className="space-y-2">
        {candidates.map((p) => {
          const isIneligible = ineligibleIds.has(p.id);
          const reason = p.id === lastChancellorId
            ? t('game.lastChancellor')
            : p.id === lastPresidentId
              ? t('game.lastPresident')
              : null;
          return (
            <li key={p.id}>
              <Button
                variant="outline"
                className="w-full"
                disabled={isIneligible}
                onClick={() => !isIneligible && emitNominateChancellor({ chancellorId: p.id })}
              >
                <span>{p.nickname}</span>
                {reason && (
                  <span className="ml-2 text-xs text-gray-400">({reason})</span>
                )}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

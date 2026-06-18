import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import { emitChoosePlayer, emitPeekConfirm, emitInspectConfirm } from '../../lib/socket';
import { useGameStore } from '../../stores/gameStore';
import { useLobbyStore } from '../../stores/lobbyStore';
import type { ExecutiveAction } from '@secret-hitler/shared';

const actionKey: Record<ExecutiveAction, string> = {
  inspect:          'game.executive.inspect',
  special_election: 'game.executive.specialElection',
  execute:          'game.executive.execute',
  peek:             'game.executive.peek',
};

export function ExecutiveView({ action }: { action: ExecutiveAction }) {
  const { t } = useTranslation();
  const { players, presidentId, peekCards, clearPeekCards, inspectResult, clearInspectResult } = useGameStore();
  const myPlayerId = useLobbyStore((s) => s.myPlayerId);

  const isPresident = myPlayerId === presidentId;

  if (!isPresident) {
    return <p className="text-center text-gray-400">{t('game.executive.waiting')}</p>;
  }

  if (action === 'peek') {
    if (!peekCards) {
      return <p className="text-center text-gray-400">{t('common.loading')}</p>;
    }
    return (
      <div className="space-y-4">
        <p className="text-center text-sm font-medium text-white">{t('game.executive.peek')}</p>
        <div className="flex justify-center gap-3">
          {peekCards.map((card, i) => (
            <span
              key={i}
              className={`rounded-lg px-4 py-3 text-sm font-semibold ${
                card === 'liberal'
                  ? 'bg-blue-700 text-blue-100'
                  : 'bg-red-700 text-red-100'
              }`}
            >
              {t(`game.roles.${card === 'liberal' ? 'liberal' : 'fascist'}`)}
            </span>
          ))}
        </div>
        <div className="flex justify-center">
          <Button
            onClick={() => {
              clearPeekCards();
              emitPeekConfirm();
            }}
          >
            {t('game.executive.peekDismiss')}
          </Button>
        </div>
      </div>
    );
  }

  if (action === 'inspect' && inspectResult) {
    const targetPlayer = players.find((p) => p.id === inspectResult.targetId);
    return (
      <div className="space-y-4">
        <p className="text-center text-sm font-medium text-white">{t('game.executive.inspect')}</p>
        <div className="flex justify-center">
          <span
            className={`rounded-lg px-6 py-4 text-sm font-semibold ${
              inspectResult.party === 'liberal'
                ? 'bg-blue-700 text-blue-100'
                : 'bg-red-700 text-red-100'
            }`}
          >
            {targetPlayer?.nickname ?? inspectResult.targetId}:{' '}
            {t(`game.roles.${inspectResult.party}`)}
          </span>
        </div>
        <div className="flex justify-center">
          <Button
            onClick={() => {
              clearInspectResult();
              emitInspectConfirm();
            }}
          >
            {t('game.executive.inspectDismiss')}
          </Button>
        </div>
      </div>
    );
  }

  const targets = players.filter((p) => p.isAlive && p.id !== presidentId);

  return (
    <div className="space-y-3">
      <p className="text-center text-sm font-medium text-white">{t(actionKey[action])}</p>
      <ul className="space-y-2">
        {targets.map((p) => (
          <li key={p.id}>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => emitChoosePlayer({ targetId: p.id })}
            >
              {p.nickname}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

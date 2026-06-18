import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import { emitVetoResponse } from '../../lib/socket';
import { useGameStore } from '../../stores/gameStore';
import { useLobbyStore } from '../../stores/lobbyStore';

export function VetoResponseView() {
  const { t } = useTranslation();
  const presidentId = useGameStore((s) => s.presidentId);
  const myPlayerId = useLobbyStore((s) => s.myPlayerId);

  if (myPlayerId !== presidentId) {
    return <p className="text-center text-gray-400">{t('game.legislative.vetoPendingWaiting')}</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-center text-sm font-medium text-white">
        {t('game.legislative.vetoResponseTitle')}
      </p>
      <p className="text-center text-xs text-gray-400">
        {t('game.legislative.vetoResponseDescription')}
      </p>
      <div className="flex gap-3">
        <Button
          variant="primary"
          className="flex-1"
          onClick={() => emitVetoResponse({ accept: true })}
        >
          {t('game.legislative.vetoAcceptButton')}
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => emitVetoResponse({ accept: false })}
        >
          {t('game.legislative.vetoDenyButton')}
        </Button>
      </div>
    </div>
  );
}

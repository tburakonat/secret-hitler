import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import { emitChancellorEnact, emitVetoRequest } from '../../lib/socket';
import { useGameStore } from '../../stores/gameStore';
import { useLobbyStore } from '../../stores/lobbyStore';

export function ChancellorCardsView() {
  const { t } = useTranslation();
  const { chancellorCards, chancellorId, vetoAvailable, vetoPending } = useGameStore();
  const myPlayerId = useLobbyStore((s) => s.myPlayerId);
  const [vetoRequested, setVetoRequested] = useState(false);

  const isChancellor = myPlayerId === chancellorId;

  useEffect(() => {
    if (!vetoPending) {
      setVetoRequested(false);
    }
  }, [vetoPending]);

  if (!isChancellor) {
    return (
      <p className="text-center text-gray-400">
        {vetoPending
          ? t('game.legislative.vetoPendingWaiting')
          : t('game.legislative.waiting')}
      </p>
    );
  }

  if (vetoPending || vetoRequested) {
    return <p className="text-center text-gray-400">{t('game.legislative.vetoWaitingPresident')}</p>;
  }

  if (!chancellorCards) {
    return <p className="text-center text-gray-400">{t('game.legislative.waiting')}</p>;
  }

  function handleVetoRequest() {
    setVetoRequested(true);
    emitVetoRequest();
  }

  return (
    <div className="space-y-3">
      <p className="text-center text-sm font-medium text-white">
        {t('game.legislative.chancellorTitle')}
      </p>
      <div className="flex items-start gap-3">
        {chancellorCards.map((card, i) => (
          <button
            key={i}
            onClick={() => emitChancellorEnact({ cardIndex: i as 0 | 1 })}
            className={`flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 aspect-[2/3] font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 ${
              card === 'liberal'
                ? 'border-blue-500 bg-gradient-to-b from-blue-800/80 to-blue-950 text-blue-100 hover:-translate-y-1 hover:border-blue-400 hover:shadow-lg hover:shadow-blue-600/30 focus-visible:ring-blue-500'
                : 'border-red-600 bg-gradient-to-b from-red-800/80 to-red-950 text-red-100 hover:-translate-y-1 hover:border-red-500 hover:shadow-lg hover:shadow-red-600/30 focus-visible:ring-red-600'
            }`}
          >
            <span
              className={`text-3xl leading-none ${card === 'liberal' ? 'text-blue-300' : 'text-red-400'}`}
              aria-hidden="true"
            >
              {card === 'liberal' ? '★' : '◆'}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest">
              {card === 'liberal' ? t('game.roles.liberal') : t('game.roles.fascist')}
            </span>
          </button>
        ))}
      </div>
      {vetoAvailable && (
        <Button variant="ghost" className="w-full" onClick={handleVetoRequest}>
          {t('game.legislative.vetoRequest')}
        </Button>
      )}
    </div>
  );
}

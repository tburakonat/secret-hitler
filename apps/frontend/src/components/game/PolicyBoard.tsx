import { useTranslation } from 'react-i18next';
import { GAME_CONSTANTS } from '@secret-hitler/shared';

interface PolicyBoardProps {
  liberalPolicies: number;
  fascistPolicies: number;
  electionTracker: number;
}

export function PolicyBoard({ liberalPolicies, fascistPolicies, electionTracker }: PolicyBoardProps) {
  const { t } = useTranslation();

  const electionFilledStyles = [
    'bg-yellow-500 border-yellow-400 shadow-sm shadow-yellow-500/30',
    'bg-orange-500 border-orange-400 shadow-sm shadow-orange-500/30',
    'bg-red-600 border-red-500 shadow-sm shadow-red-600/30',
  ];
  const electionEmptyStyles = [
    'border-yellow-900/50',
    'border-orange-900/50',
    'border-red-900/50',
  ];

  return (
    <div className="space-y-3">

      {/* Liberal Board */}
      <div className="rounded-xl border border-blue-800/60 bg-gradient-to-br from-blue-950/80 to-gray-900 p-3 shadow-lg shadow-blue-950/50">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-400">
            {t('game.liberalPolicies')}
          </p>
          <span className="text-xs font-bold tabular-nums text-blue-300">
            {liberalPolicies} / {GAME_CONSTANTS.LIBERAL_POLICIES_TO_WIN}
          </span>
        </div>
        <div className="flex items-start gap-2">
          {Array.from({ length: GAME_CONSTANTS.LIBERAL_POLICIES_TO_WIN }).map((_, i) => (
            <div
              key={i}
              className={`relative flex flex-1 flex-col items-center justify-center rounded-lg border-2 aspect-[3/4] transition-all duration-300 ${
                i < liberalPolicies
                  ? 'border-blue-400 bg-gradient-to-b from-blue-500 to-blue-700 shadow-md shadow-blue-500/40'
                  : 'border-blue-900/40 bg-gray-900/60'
              }`}
            >
              {i < liberalPolicies ? (
                <span className="select-none text-base leading-none text-white" aria-hidden="true">✦</span>
              ) : (
                <span className="select-none text-xs font-bold text-blue-900/40">{i + 1}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Fascist Board */}
      <div className="rounded-xl border border-red-900/60 bg-gradient-to-br from-red-950/80 to-gray-900 p-3 shadow-lg shadow-red-950/50">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-red-400">
            {t('game.fascistPolicies')}
          </p>
          <span className="text-xs font-bold tabular-nums text-red-300">
            {fascistPolicies} / {GAME_CONSTANTS.FASCIST_POLICIES_TO_WIN}
          </span>
        </div>
        <div className="flex items-start gap-2">
          {Array.from({ length: GAME_CONSTANTS.FASCIST_POLICIES_TO_WIN }).map((_, i) => (
            <div
              key={i}
              className={`relative flex flex-1 flex-col items-center justify-center rounded-lg border-2 aspect-[3/4] transition-all duration-300 ${
                i < fascistPolicies
                  ? 'border-red-400 bg-gradient-to-b from-red-600 to-red-900 shadow-md shadow-red-600/40'
                  : 'border-red-950/50 bg-gray-900/60'
              }`}
            >
              {i < fascistPolicies ? (
                <span className="select-none text-base leading-none text-red-100" aria-hidden="true">✦</span>
              ) : (
                <span className="select-none text-xs font-bold text-red-950/50">{i + 1}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Election Tracker */}
      <div className="rounded-xl border border-yellow-900/40 bg-gray-900/80 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-yellow-500">
            {t('game.electionTracker')}
          </p>
          {electionTracker > 0 && (
            <span className="text-xs font-bold tabular-nums text-yellow-400">
              {electionTracker} / {GAME_CONSTANTS.MAX_ELECTION_TRACKER}
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: GAME_CONSTANTS.MAX_ELECTION_TRACKER }).map((_, i) => (
            <div
              key={i}
              className={`flex h-7 flex-1 items-center justify-center rounded border-2 text-xs font-bold transition-colors ${
                i < electionTracker
                  ? `${electionFilledStyles[i]} text-white`
                  : `bg-gray-900 ${electionEmptyStyles[i]} text-gray-700`
              }`}
            >
              {i < electionTracker ? '!' : String(i + 1)}
            </div>
          ))}
        </div>
        {electionTracker > 0 && electionTracker >= GAME_CONSTANTS.MAX_ELECTION_TRACKER - 1 && (
          <p className="mt-1.5 text-center text-xs font-medium text-orange-400">
            {electionTracker === GAME_CONSTANTS.MAX_ELECTION_TRACKER
              ? '⚠ Gesetz wird erzwungen!'
              : '⚠ Noch eine abgelehnte Wahl erzwingt ein Gesetz'}
          </p>
        )}
      </div>

    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import { emitVote } from '../../lib/socket';
import { useGameStore } from '../../stores/gameStore';
import { useLobbyStore } from '../../stores/lobbyStore';

export function ElectionView() {
  const { t } = useTranslation();

  const { presidentId, chancellorId, electionVoteCount, myVote, setMyVote, players: gamePlayers } = useGameStore();
  const lobbyPlayers = useLobbyStore((s) => s.players);
  const myPlayerId = useLobbyStore((s) => s.myPlayerId);

  const players = gamePlayers.length > 0 ? gamePlayers : lobbyPlayers;
  const alivePlayers = players.filter((p) => p.isAlive);
  const totalCount = alivePlayers.length;

  const presidentName = players.find((p) => p.id === presidentId)?.nickname ?? '?';
  const chancellorName = players.find((p) => p.id === chancellorId)?.nickname ?? '?';

  const isAlive = alivePlayers.some((p) => p.id === myPlayerId);
  const hasVoted = myVote !== null;

  function vote(v: 'ja' | 'nein') {
    setMyVote(v);
    emitVote({ vote: v });
  }

  return (
    <div className="space-y-5">

      {/* Kontext: wer steht zur Wahl */}
      <div>
        <p className="mb-2 text-center text-xs font-medium uppercase tracking-wider text-gray-400">
          {t('game.election.voteFor')}
        </p>
        <div className="flex items-center justify-center gap-3">
          <GovernmentBadge label={t('game.president')} name={presidentName} color="blue" />
          <span className="text-gray-500">+</span>
          <GovernmentBadge label={t('game.chancellor')} name={chancellorName} color="green" />
        </div>
      </div>

      {/* Fortschritt */}
      <div className="space-y-2">
        <p className="text-center text-sm text-gray-400">
          {t('game.election.votesCast', { count: electionVoteCount, total: totalCount })}
        </p>
        <div className="flex justify-center gap-1.5">
          {Array.from({ length: totalCount }).map((_, i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-full ${
                i < electionVoteCount ? 'bg-white' : 'bg-gray-700'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Abstimmung */}
      {!isAlive ? (
        <p className="text-center text-sm text-gray-500">{t('game.election.waiting')}</p>
      ) : hasVoted ? (
        <div className="space-y-2">
          <p className="text-center text-xs font-medium uppercase tracking-wider text-gray-400">
            {t('game.election.yourVote')}
          </p>
          <div className="flex gap-3">
            <VoteDisplay vote="ja" selected={myVote === 'ja'} />
            <VoteDisplay vote="nein" selected={myVote === 'nein'} />
          </div>
          <p className="text-center text-xs text-gray-500">{t('game.election.waiting')}</p>
        </div>
      ) : (
        <div className="flex gap-3">
          <Button
            className="flex-1 text-lg font-bold"
            size="lg"
            onClick={() => vote('ja')}
          >
            {t('game.election.ja')}
          </Button>
          <Button
            className="flex-1 text-lg font-bold"
            variant="outline"
            size="lg"
            onClick={() => vote('nein')}
          >
            {t('game.election.nein')}
          </Button>
        </div>
      )}
    </div>
  );
}

function GovernmentBadge({ label, name, color }: { label: string; name: string; color: 'blue' | 'green' }) {
  const styles = {
    blue:  'border-blue-600 bg-blue-950/50',
    green: 'border-green-600 bg-green-950/50',
  };
  const textStyles = {
    blue:  'text-blue-300',
    green: 'text-green-300',
  };
  return (
    <div className={`rounded-lg border px-4 py-2 text-center ${styles[color]}`}>
      <p className={`text-xs font-medium uppercase tracking-wider ${textStyles[color]}`}>{label}</p>
      <p className="mt-0.5 font-semibold text-white">{name}</p>
    </div>
  );
}

function VoteDisplay({ vote, selected }: { vote: 'ja' | 'nein'; selected: boolean }) {
  const base = 'flex-1 rounded-md border-2 py-3 text-center text-lg font-bold transition-all';
  const styles = {
    ja:   selected ? 'border-green-500 bg-green-900/60 text-green-200' : 'border-gray-700 bg-gray-900 text-gray-600',
    nein: selected ? 'border-red-600 bg-red-900/60 text-red-200'   : 'border-gray-700 bg-gray-900 text-gray-600',
  };
  return <div className={`${base} ${styles[vote]}`}>{vote === 'ja' ? 'Ja' : 'Nein'}</div>;
}

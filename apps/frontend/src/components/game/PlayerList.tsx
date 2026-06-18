import { useTranslation } from 'react-i18next';
import type { Player } from '@secret-hitler/shared';

interface PlayerListProps {
  players: Player[];
  hostId: string | null;
  myPlayerId?: string | null;
  presidentId?: string | null;
  chancellorId?: string | null;
  lastPresidentId?: string | null;
  lastChancellorId?: string | null;
  rotationPositions?: Map<string, number | 'S'>;
}

export function PlayerList({ players, hostId, myPlayerId, presidentId, chancellorId, lastPresidentId, lastChancellorId, rotationPositions }: PlayerListProps) {
  const { t } = useTranslation();

  return (
    <ul className="space-y-2">
      {players.map((p) => {
        const isMe = p.id === myPlayerId;
        const rotPos = rotationPositions?.get(p.id);
        return (
          <li
            key={p.id}
            className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
              !p.isAlive
                ? 'bg-gray-900 text-gray-500 line-through'
                : isMe
                  ? 'bg-gray-700 text-white ring-1 ring-inset ring-white/20'
                  : 'bg-gray-800 text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              {p.isAlive && rotPos !== undefined && (
                rotPos === 'S'
                  ? <span className="w-5 text-center text-xs font-bold text-yellow-400">★</span>
                  : <span className="w-5 text-center text-xs font-mono text-gray-400">{rotPos}</span>
              )}
              {(!p.isAlive || rotPos === undefined) && rotationPositions !== undefined && (
                <span className="w-5" />
              )}
              <span className="font-medium">{p.nickname}</span>
            </span>
            <span className="flex gap-1.5">

              {p.id === hostId && <Badge color="yellow">Host</Badge>}
              {p.id === presidentId && <Badge color="blue">{t('game.president')}</Badge>}
              {p.id === chancellorId && <Badge color="green">{t('game.chancellor')}</Badge>}
              {p.id === lastPresidentId && p.id !== presidentId && <Badge color="gray">{t('game.lastPresident')}</Badge>}
              {p.id === lastChancellorId && p.id !== chancellorId && <Badge color="gray">{t('game.lastChancellor')}</Badge>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: 'yellow' | 'blue' | 'green' | 'red' | 'white' | 'gray' }) {
  const colors = {
    yellow: 'bg-yellow-900/50 text-yellow-300',
    blue:   'bg-blue-900/50 text-blue-300',
    green:  'bg-green-900/50 text-green-300',
    red:    'bg-red-900/50 text-red-300',
    white:  'bg-white/10 text-white',
    gray:   'bg-gray-700/50 text-gray-400',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}

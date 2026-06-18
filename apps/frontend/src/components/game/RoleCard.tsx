import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../../stores/gameStore';
import type { Role } from '@secret-hitler/shared';

const ROLE_STYLES: Record<Role, string> = {
  liberal: 'border-blue-500 bg-blue-950/60 text-blue-200',
  fascist: 'border-red-600 bg-red-950/60 text-red-200',
  hitler:  'border-red-900 bg-red-950/80 text-red-100',
};

export function RoleCard() {
  const { t } = useTranslation();
  const myRole = useGameStore((s) => s.myRole);
  const myTeammates = useGameStore((s) => s.myTeammates);
  const [visible, setVisible] = useState(false);

  if (!myRole) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900">
      <button
        onClick={() => setVisible((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-300 hover:text-white"
      >
        <span>{t('game.myRole')}</span>
        <span className="text-xs text-gray-500">
          {visible ? t('game.hideRole') : t('game.showRole')}
        </span>
      </button>

      {visible && (
        <div className={`mx-3 mb-3 rounded-md border px-4 py-3 ${ROLE_STYLES[myRole]}`}>
          <p className="text-lg font-bold tracking-wide">
            {t(`game.roles.${myRole}`)}
          </p>

          {myTeammates && myTeammates.length > 0 && (
            <div className="mt-2 border-t border-current/20 pt-2">
              <p className="text-xs opacity-60">{t('game.teammates')}</p>
              <ul className="mt-1 space-y-0.5">
                {myTeammates.map((tm) => (
                  <li key={tm.id} className="text-sm">
                    {tm.nickname}{' '}
                    <span className="opacity-50">
                      ({t(`game.roles.${tm.role}`)})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

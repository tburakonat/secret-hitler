import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { PolicyBoard } from '../components/game/PolicyBoard';
import { PlayerList } from '../components/game/PlayerList';
import { NominationView } from '../components/game/NominationView';
import { ElectionView } from '../components/game/ElectionView';
import { PresidentCardsView } from '../components/game/PresidentCardsView';
import { ChancellorCardsView } from '../components/game/ChancellorCardsView';
import { VetoResponseView } from '../components/game/VetoResponseView';
import { ExecutiveView } from '../components/game/ExecutiveView';
import { GameOverView } from '../components/game/GameOverView';
import { RoleCard } from '../components/game/RoleCard';
import { useSocketEvents } from '../hooks/useSocketEvents';
import { useGameStore } from '../stores/gameStore';
import { useLobbyStore } from '../stores/lobbyStore';
import { useSessionStore } from '../stores/sessionStore';
import { connectAndReconnect, emitGameAbort } from '../lib/socket';
import type { LobbyUpdatedPayload, PolicyType, GameAbortedPayload } from '@secret-hitler/shared';
import type {
  GameStateSync,
  GameRoleAssignedPayload,
  ElectionVoteCastPayload,
  ElectionResultPayload,
  LegislativePresidentCardsPayload,
  LegislativeChancellorCardsPayload,
  LegislativePolicyEnactedPayload,
  LegislativeVetoResolvedPayload,
  ExecutiveActionRequiredPayload,
  ExecutivePeekResultPayload,
  ExecutiveInspectResultPayload,
  ExecutiveInspectConfirmedPayload,
  ExecutiveSpecialElectionPayload,
  ExecutivePlayerExecutedPayload,
  GameOverPayload,
} from '@secret-hitler/shared';

function computeRotation(
  players: Array<{ id: string; isAlive: boolean; seatIndex: number }>,
  presidentId: string,
  isSpecialElection: boolean,
  specialElectionReturnId: string | null,
): Map<string, number | 'S'> {
  const result = new Map<string, number | 'S'>();
  const alive = [...players]
    .filter(p => p.isAlive)
    .sort((a, b) => a.seatIndex - b.seatIndex);
  if (alive.length === 0) return result;

  if (isSpecialElection && specialElectionReturnId) {
    result.set(presidentId, 'S');
    const returnIdx = alive.findIndex(p => p.id === specialElectionReturnId);
    if (returnIdx === -1) return result;
    let counter = 1;
    for (let i = 0; i < alive.length; i++) {
      const player = alive[(returnIdx + i) % alive.length];
      if (player.id !== presidentId) result.set(player.id, counter++);
    }
  } else {
    const presIdx = alive.findIndex(p => p.id === presidentId);
    if (presIdx === -1) return result;
    for (let i = 0; i < alive.length; i++) {
      const player = alive[(presIdx + i) % alive.length];
      result.set(player.id, i + 1);
    }
  }
  return result;
}

export default function GamePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const sessionId = useSessionStore((s) => s.sessionId);

  useEffect(() => {
    if (sessionId) connectAndReconnect(sessionId);
  }, [sessionId]);

  const {
    phase,
    presidentId,
    chancellorId,
    lastPresidentId,
    lastChancellorId,
    electionTracker,
    liberalPolicies,
    fascistPolicies,
    vetoUnlocked,
    vetoPending,
    isSpecialElection,
    specialElectionReturnId,
    players: gamePlayers,
    applyStateSync,
    setRole,
    setElectionVoteCast,
    setPresidentialCards,
    setChancellorCards,
    setElectionResult,
    setVetoPending,
    setPeekCards,
    setInspectResult,
    setPlayerDead,
    wasExecuted,
    setWasExecuted,
    setGameOver,
  } = useGameStore();

  const lobbyPlayers = useLobbyStore((s) => s.players);
  const hostId = useLobbyStore((s) => s.hostId);
  const myPlayerId = useLobbyStore((s) => s.myPlayerId);

  // Aktuell aktive Executive-Action (wenn Phase = executive_action)
  const [executiveAction, setExecutiveAction] = useState<string | null>(null);
  // Kurzzeitige Anzeige wenn eine Policy erlassen wurde
  const [lastPolicyEnacted, setLastPolicyEnacted] = useState<PolicyType | null>(null);
  // Kurzzeitige Anzeige des Veto-Ergebnisses
  const [lastVetoResult, setLastVetoResult] = useState<{ accepted: boolean; presidentNickname: string } | null>(null);
  // Kurzzeitige Anzeige bei Sonderwahl
  const [specialElectionAnnouncement, setSpecialElectionAnnouncement] = useState<{ newNickname: string; choosingNickname: string } | null>(null);
  // Kurzzeitige Ankündigungen für Executive Actions
  const [executionAnnouncement, setExecutionAnnouncement] = useState<{ nickname: string; wasHitler: boolean } | null>(null);
  const [inspectAnnouncement, setInspectAnnouncement] = useState<{ presidentNickname: string; targetNickname: string } | null>(null);
  const [vetoRequestedAnnouncement, setVetoRequestedAnnouncement] = useState<string | null>(null);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);

  const isHost = myPlayerId !== null && myPlayerId === hostId;

  useSocketEvents({
    'lobby:updated': (p: LobbyUpdatedPayload) => {
      // During game_over, each player navigates individually — don't auto-redirect on others' actions
      if (useGameStore.getState().phase === 'game_over') return;
      useGameStore.getState().reset();
      useLobbyStore.getState().setLobby({ lobbyId: p.lobbyId, code: p.code, players: p.players, hostId: p.hostId });
      if (p.selfId) useLobbyStore.getState().setMyPlayerId(p.selfId);
      navigate('/lobby');
    },
    'game:state_sync': (p: GameStateSync) => {
      applyStateSync(p);
      if (p.selfId) useLobbyStore.getState().setMyPlayerId(p.selfId);
      if (p.hostId) useLobbyStore.getState().setHostId(p.hostId);
    },
    'game:role_assigned': (p: GameRoleAssignedPayload) => {
      setRole(p);
    },
    'election:vote_cast': (p: ElectionVoteCastPayload) => {
      setElectionVoteCast(p);
    },
    'election:result': (p: ElectionResultPayload) => {
      setElectionResult(p);
    },
    'legislative:president_cards': (p: LegislativePresidentCardsPayload) => {
      setPresidentialCards(p.cards);
    },
    'legislative:chancellor_cards': (p: LegislativeChancellorCardsPayload) => {
      setChancellorCards(p.cards, p.vetoAvailable);
    },
    'legislative:policy_enacted': (p: LegislativePolicyEnactedPayload) => {
      setLastPolicyEnacted(p.policy);
      setTimeout(() => setLastPolicyEnacted(null), 3000);
    },
    'legislative:veto_requested': () => {
      const state = useGameStore.getState();
      const chancellor = state.players.find((pl) => pl.id === state.chancellorId);
      setVetoPending(true);
      setVetoRequestedAnnouncement(chancellor?.nickname ?? null);
      setTimeout(() => setVetoRequestedAnnouncement(null), 4000);
    },
    'legislative:veto_resolved': (p: LegislativeVetoResolvedPayload) => {
      const state = useGameStore.getState();
      const pres = state.players.find((pl) => pl.id === state.presidentId);
      setVetoPending(false);
      setLastVetoResult({ accepted: p.accepted, presidentNickname: pres?.nickname ?? '' });
      setTimeout(() => setLastVetoResult(null), 4000);
    },
    'executive:action_required': (p: ExecutiveActionRequiredPayload) => {
      setExecutiveAction(p.action);
    },
    'executive:peek_result': (p: ExecutivePeekResultPayload) => {
      setPeekCards(p.cards);
    },
    'executive:inspect_result': (p: ExecutiveInspectResultPayload) => {
      setInspectResult(p);
    },
    'executive:special_election': (p: ExecutiveSpecialElectionPayload) => {
      const state = useGameStore.getState();
      const newPres = state.players.find((pl) => pl.id === p.newPresidentId);
      const choosingPres = state.players.find((pl) => pl.id === state.presidentId);
      setSpecialElectionAnnouncement({
        newNickname: newPres?.nickname ?? p.newPresidentId,
        choosingNickname: choosingPres?.nickname ?? state.presidentId ?? '',
      });
      setTimeout(() => setSpecialElectionAnnouncement(null), 4000);
    },
    'executive:inspect_confirmed': (p: ExecutiveInspectConfirmedPayload) => {
      const state = useGameStore.getState();
      const inspected = state.players.find((pl) => pl.id === p.inspectedPlayerId);
      const pres = state.players.find((pl) => pl.id === p.presidentId);
      setInspectAnnouncement({
        presidentNickname: pres?.nickname ?? p.presidentId,
        targetNickname: inspected?.nickname ?? p.inspectedPlayerId,
      });
      setTimeout(() => setInspectAnnouncement(null), 5000);
    },
    'executive:player_executed': (p: ExecutivePlayerExecutedPayload) => {
      const killed = useGameStore.getState().players.find((pl) => pl.id === p.playerId);
      setPlayerDead(p.playerId);
      if (p.playerId === myPlayerId) {
        setWasExecuted(true);
      } else {
        setExecutionAnnouncement({ nickname: killed?.nickname ?? p.playerId, wasHitler: p.wasHitler });
        setTimeout(() => setExecutionAnnouncement(null), 5000);
      }
    },
    'game:over': (p: GameOverPayload) => {
      setGameOver(p);
    },
    'game:aborted': (p: GameAbortedPayload) => {
      useGameStore.getState().reset();
      useLobbyStore.getState().setLobby({ lobbyId: p.lobbyId, code: p.code, players: p.players, hostId: p.hostId });
      navigate('/lobby');
    },
  });

  function renderPhase() {
    switch (phase) {
      case 'nomination':
        return <NominationView />;
      case 'election':
        return <ElectionView />;
      case 'legislative_president':
        return <PresidentCardsView />;
      case 'legislative_chancellor':
        return vetoPending && myPlayerId === presidentId
          ? <VetoResponseView />
          : <ChancellorCardsView />;
      case 'executive_action':
        return executiveAction
          ? <ExecutiveView action={executiveAction as any} />
          : <p className="text-center text-gray-400">{t('game.executive.waiting')}</p>;
      case 'game_over':
        return <GameOverView />;
      default:
        return <p className="text-center text-gray-400">{t('common.loading')}</p>;
    }
  }

  const displayPlayers = gamePlayers.length > 0 ? gamePlayers : lobbyPlayers;

  const rotationPositions =
    phase && phase !== 'lobby' && phase !== 'game_over' && presidentId
      ? computeRotation(gamePlayers, presidentId, isSpecialElection, specialElectionReturnId)
      : undefined;

  const sortedDisplayPlayers = rotationPositions
    ? [...displayPlayers].sort((a, b) => {
        const posA = rotationPositions.get(a.id);
        const posB = rotationPositions.get(b.id);
        if (posA === 'S' && posB !== 'S') return -1;
        if (posB === 'S' && posA !== 'S') return 1;
        const numA = typeof posA === 'number' ? posA : Infinity;
        const numB = typeof posB === 'number' ? posB : Infinity;
        return numA - numB;
      })
    : displayPlayers;

  const amIDead = myPlayerId !== null && gamePlayers.some((p) => p.id === myPlayerId && !p.isAlive);

  return (
    <div className="min-h-screen bg-gray-950 p-4">

      {/* Vollbild-Overlay beim Tod */}
      {wasExecuted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="mx-4 max-w-sm space-y-4 rounded-2xl border border-gray-700 bg-gray-900 p-8 text-center shadow-2xl">
            <p className="text-2xl font-bold text-red-400">{t('game.executed.title')}</p>
            <p className="text-gray-300">{t('game.executed.description')}</p>
            <button
              onClick={() => setWasExecuted(false)}
              className="mt-2 rounded-lg bg-gray-700 px-6 py-2 text-sm font-medium text-white hover:bg-gray-600"
            >
              {t('game.executed.dismiss')}
            </button>
          </div>
        </div>
      )}

      {showAbortConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="mx-4 max-w-sm space-y-4 rounded-2xl border border-red-800 bg-gray-900 p-8 text-center shadow-2xl">
            <p className="text-xl font-bold text-red-400">{t('game.abort.confirmTitle')}</p>
            <p className="text-gray-300">{t('game.abort.confirmDescription')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAbortConfirm(false)}
                className="flex-1 rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600"
              >
                {t('game.abort.cancelButton')}
              </button>
              <button
                onClick={() => { emitGameAbort(); setShowAbortConfirm(false); }}
                className="flex-1 rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
              >
                {t('game.abort.confirmButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-5xl">

        {/* Dauerhafter Banner für tote Spieler */}
        {amIDead && (
          <div className="mb-4 rounded-lg border border-gray-700/60 border-l-4 border-l-gray-500 bg-gray-800/90 px-4 py-3 text-center text-sm font-medium text-gray-300 shadow-sm">
            {t('game.executed.spectating')}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

          {/* Linke Spalte: PolicyBoard + aktive Phase */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Card>
              <PolicyBoard
                liberalPolicies={liberalPolicies}
                fascistPolicies={fascistPolicies}
                electionTracker={electionTracker}
              />
            </Card>

            <Card>
              {renderPhase()}
            </Card>

            {lastPolicyEnacted && (
              <div className={`rounded-lg border-l-4 px-4 py-3.5 text-center text-sm font-semibold shadow-md ${
                lastPolicyEnacted === 'liberal'
                  ? 'border-blue-500 bg-blue-950/90 text-blue-200 shadow-blue-950/50'
                  : 'border-red-600 bg-red-950/90 text-red-200 shadow-red-950/50'
              }`}>
                {lastPolicyEnacted === 'liberal'
                  ? t('game.legislative.liberalPolicyEnacted')
                  : t('game.legislative.fascistPolicyEnacted')}
              </div>
            )}

            {lastVetoResult !== null && (
              <div className={`rounded-lg border-l-4 px-4 py-3.5 text-center text-sm font-semibold shadow-md ${
                lastVetoResult.accepted
                  ? 'border-yellow-500 bg-yellow-950/90 text-yellow-200'
                  : 'border-gray-500 bg-gray-800/90 text-gray-300'
              }`}>
                {lastVetoResult.accepted
                  ? t('game.legislative.vetoAccepted', { nickname: lastVetoResult.presidentNickname })
                  : t('game.legislative.vetoDenied', { nickname: lastVetoResult.presidentNickname })}
              </div>
            )}

            {specialElectionAnnouncement && (
              <div className="rounded-lg border-l-4 border-yellow-500 bg-yellow-950/90 px-4 py-3.5 text-center text-sm font-semibold text-yellow-200 shadow-md">
                {t('game.executive.specialElectionAnnounced', specialElectionAnnouncement)}
              </div>
            )}

            {executionAnnouncement && (
              <div className="rounded-lg border-l-4 border-red-600 bg-red-950/90 px-4 py-3.5 text-center text-sm font-semibold text-red-200 shadow-md shadow-red-950/50">
                {executionAnnouncement.wasHitler
                  ? t('game.executive.playerExecutedHitler', { nickname: executionAnnouncement.nickname })
                  : t('game.executive.playerExecuted', { nickname: executionAnnouncement.nickname })}
              </div>
            )}

            {inspectAnnouncement && (
              <div className="rounded-lg border-l-4 border-purple-500 bg-purple-950/90 px-4 py-3.5 text-center text-sm font-semibold text-purple-200 shadow-md">
                {t('game.executive.inspectAnnounced', inspectAnnouncement)}
              </div>
            )}

            {vetoRequestedAnnouncement && (
              <div className="rounded-lg border-l-4 border-orange-500 bg-orange-950/90 px-4 py-3.5 text-center text-sm font-semibold text-orange-200 shadow-md">
                {t('game.legislative.vetoRequested', { nickname: vetoRequestedAnnouncement })}
              </div>
            )}
          </div>

          {/* Rechte Spalte: Rolle + Spielerliste */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
            <RoleCard />

            <Card title={`${t('lobby.players')} (${displayPlayers.length})`}>
              <div className="overflow-y-auto lg:max-h-[calc(100vh-16rem)]">
                <PlayerList
                  players={sortedDisplayPlayers}
                  hostId={hostId}
                  myPlayerId={myPlayerId}
                  presidentId={presidentId}
                  chancellorId={chancellorId}
                  lastPresidentId={lastPresidentId}
                  lastChancellorId={lastChancellorId}
                  rotationPositions={rotationPositions}
                />
              </div>
              {vetoUnlocked && (
                <p className="mt-2 text-center text-xs text-yellow-400">
                  {t('game.vetoUnlocked')}
                </p>
              )}
            </Card>

            {isHost && phase !== 'game_over' && (
              <button
                onClick={() => setShowAbortConfirm(true)}
                className="w-full rounded-lg border border-red-800 bg-red-950/50 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/50 hover:text-red-300"
              >
                {t('game.abort.button')}
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

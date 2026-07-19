import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GAME_CONSTANTS } from "@secret-hitler/shared";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { PlayerList } from "../components/game/PlayerList";
import { connectAndReconnect, emitLobbyLeave, emitLobbyStart, emitLobbyUpdateSettings } from "../lib/socket";
import { useSocketEvents } from "../hooks/useSocketEvents";
import { useLobbyStore } from "../stores/lobbyStore";
import { useGameStore } from "../stores/gameStore";
import type {
  LobbyUpdatedPayload,
  GameRoleAssignedPayload,
  GameStateSync,
} from "@secret-hitler/shared";

export default function LobbyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { players, code, hostId, myPlayerId, maxPlayers, isPublic, setLobby } = useLobbyStore();
  const setMyPlayerId = useLobbyStore((s) => s.setMyPlayerId);
  const { applyStateSync, setRole, reset: resetGame } = useGameStore();
  const resetLobby = useLobbyStore((s) => s.reset);

  const isHost = myPlayerId !== null && myPlayerId === hostId;

  type Tab = 'players' | 'settings';
  const [tab, setTab] = useState<Tab>('players');
  const [copied, setCopied] = useState(false);

  function handleCopyCode() {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleLeave() {
    emitLobbyLeave();
    resetLobby();
    resetGame();
    navigate("/");
  }
  const canStart = players.length >= GAME_CONSTANTS.MIN_PLAYERS;

  // Reconnect beim Mounten (Page-Reload)
  useEffect(() => {
    connectAndReconnect();
  }, []);

  useSocketEvents({
    "lobby:updated": (payload: LobbyUpdatedPayload) => {
      setLobby({
        lobbyId: payload.lobbyId,
        code: payload.code,
        players: payload.players,
        hostId: payload.hostId,
        maxPlayers: payload.maxPlayers,
        isPublic: payload.isPublic,
      });

      if (payload.selfId) {
        setMyPlayerId(payload.selfId);
      }
    },
    "game:role_assigned": (payload: GameRoleAssignedPayload) => {
      setRole(payload);
    },
    "game:state_sync": (payload: GameStateSync) => {
      applyStateSync(payload);
      navigate("/game");
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">{t("lobby.title")}</h1>
        </div>

        {/* Lobby-Code */}
        <div className="rounded-md bg-gray-800 p-3">
          <p className="text-center text-xs text-gray-400">{t("lobby.code")}</p>
          <div className="mt-0.5 flex items-center justify-center gap-3">
            <p className="text-2xl font-bold tracking-widest text-white">
              {code ?? "——"}
            </p>
            <button
              type="button"
              onClick={handleCopyCode}
              disabled={!code}
              title={t("lobby.copyCode")}
              className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white disabled:opacity-40"
            >
              {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Tab-Switcher */}
        <div className="flex rounded-lg border border-gray-700 p-1">
          {(["players", "settings"] as Tab[]).map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                tab === key
                  ? "bg-red-700 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {key === "players" ? t("lobby.tabPlayers") : t("lobby.tabSettings")}
            </button>
          ))}
        </div>

        <Card>
          <div className="space-y-4">
            {tab === "players" && (
              <>
                {/* Spielerliste */}
                <div>
                  <p className="mb-2 text-sm font-medium text-gray-400">
                    {t("lobby.players")} ({players.length}/{maxPlayers})
                  </p>
                  <PlayerList players={players} hostId={hostId} myPlayerId={myPlayerId} />
                </div>

                {/* Aktionsbereich */}
                {isHost ? (
                  <div className="space-y-2">
                    <Button
                      onClick={emitLobbyStart}
                      disabled={!canStart}
                      className="w-full"
                      size="lg"
                    >
                      {t("lobby.startButton")}
                    </Button>
                    {!canStart && (
                      <p className="text-center text-xs text-gray-500">
                        {t("lobby.notEnoughPlayers", { min: GAME_CONSTANTS.MIN_PLAYERS })}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-center text-sm text-gray-400">
                    {t("lobby.waitingForHost")}
                  </p>
                )}
              </>
            )}

            {tab === "settings" && (
              <>
                {/* Max Spieler */}
                <div className="flex items-center justify-between gap-4">
                  <label className="text-sm text-gray-300">
                    {t("lobby.maxPlayers")}
                  </label>
                  <select
                    value={maxPlayers}
                    disabled={!isHost}
                    onChange={(e) =>
                      emitLobbyUpdateSettings({ isPublic, maxPlayers: Number(e.target.value) })
                    }
                    className="rounded bg-gray-800 px-2 py-1 text-sm text-white disabled:opacity-50"
                  >
                    {Array.from(
                      { length: GAME_CONSTANTS.MAX_PLAYERS - GAME_CONSTANTS.MIN_PLAYERS + 1 },
                      (_, i) => GAME_CONSTANTS.MIN_PLAYERS + i,
                    ).map((n) => (
                      <option key={n} value={n} disabled={n < players.length}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Öffentlich / Privat */}
                <div className="flex items-center justify-between gap-4">
                  <label className="text-sm text-gray-300">
                    {t("lobby.public")}
                  </label>
                  <button
                    type="button"
                    disabled={!isHost}
                    onClick={() =>
                      emitLobbyUpdateSettings({ isPublic: !isPublic, maxPlayers })
                    }
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 ${
                      isHost ? "cursor-pointer" : "cursor-default"
                    } ${isPublic ? "bg-red-700" : "bg-gray-600"}`}
                    role="switch"
                    aria-checked={isPublic}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        isPublic ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </>
            )}

            <Button onClick={handleLeave} className="w-full" variant="secondary">
              {t("lobby.leaveButton")}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

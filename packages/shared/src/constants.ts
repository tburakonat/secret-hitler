export const GAME_CONSTANTS = {
  MIN_PLAYERS: 5,
  MAX_PLAYERS: 10,
  TOTAL_CARDS: 17,
  FASCIST_CARDS: 11,
  LIBERAL_CARDS: 6,
  LIBERAL_POLICIES_TO_WIN: 5,
  FASCIST_POLICIES_TO_WIN: 6,
  MAX_ELECTION_TRACKER: 3,
  MIN_DRAW_PILE: 3,
  LOBBY_CODE_LENGTH: 6,
  SESSION_TTL_HOURS: 24,
} as const;

export const ROLE_DISTRIBUTION: Record<number, { liberals: number; fascists: number }> = {
  5: { liberals: 3, fascists: 1 },
  6: { liberals: 4, fascists: 1 },
  7: { liberals: 4, fascists: 2 },
  8: { liberals: 5, fascists: 2 },
  9: { liberals: 5, fascists: 3 },
  10: { liberals: 6, fascists: 3 },
};

/** Import from here instead of hardcoding strings to catch typos at compile time. */
export const SOCKET_EVENTS = {
  // Lobby — C → S
  LOBBY_CREATE: 'lobby:create',
  LOBBY_JOIN: 'lobby:join',
  LOBBY_RECONNECT: 'lobby:reconnect',
  LOBBY_START: 'lobby:start',
  // Lobby — S → C
  LOBBY_UPDATED: 'lobby:updated',

  // Game start — S → C
  GAME_ROLE_ASSIGNED: 'game:role_assigned',
  GAME_STARTED: 'game:started',
  GAME_STATE_SYNC: 'game:state_sync',
  GAME_OVER: 'game:over',

  // Nomination — C → S
  NOMINATION_CHANCELLOR: 'nomination:chancellor',
  // Nomination — S → C
  NOMINATION_MADE: 'nomination:made',

  // Election — C → S
  ELECTION_VOTE: 'election:vote',
  // Election — S → C
  ELECTION_RESULT: 'election:result',

  // Legislative — C → S
  LEGISLATIVE_PRESIDENT_DISCARD: 'legislative:president_discard',
  LEGISLATIVE_CHANCELLOR_ENACT: 'legislative:chancellor_enact',
  LEGISLATIVE_VETO_REQUEST: 'legislative:veto_request',
  LEGISLATIVE_VETO_RESPONSE: 'legislative:veto_response',
  // Legislative — S → C
  LEGISLATIVE_PRESIDENT_CARDS: 'legislative:president_cards',
  LEGISLATIVE_CHANCELLOR_CARDS: 'legislative:chancellor_cards',
  LEGISLATIVE_POLICY_ENACTED: 'legislative:policy_enacted',

  // Executive — C → S
  EXECUTIVE_CHOOSE_PLAYER: 'executive:choose_player',
  // Executive — S → C
  EXECUTIVE_ACTION_REQUIRED: 'executive:action_required',
  EXECUTIVE_INSPECT_RESULT: 'executive:inspect_result',
  EXECUTIVE_PEEK_RESULT: 'executive:peek_result',
  EXECUTIVE_PLAYER_EXECUTED: 'executive:player_executed',

  // Error — S → C (private)
  ERROR: 'error',
} as const;

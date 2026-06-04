import type { Timestamp } from 'firebase/firestore';

export type SeatRule = 'winner-stays' | 'loser-stays' | 'both-leave';

export interface HostProfile {
  displayName: string;
  updatedAt: Timestamp;
}

export type BestOf = 1 | 3 | 5;

export interface Tournament {
  id: string;
  hostUid: string;
  hostName: string;
  name: string;
  cardGame: string;           // card game id from cardGames.ts
  cardGameOther?: string;     // free-text name when cardGame === 'other'
  description: string;
  tableCount: number;
  timerMinutes: number;
  bestOf: BestOf;             // BO1 / BO3 / BO5
  matchingDeadline: Timestamp | null;
  afterBattleBuffer: number;
  matchingTimeout: number;
  entryOpen: boolean;
  status: 'waiting' | 'active' | 'finished';
  isTest: boolean;
  seatRule: SeatRule;
  streakLimit: number; // 0 = no limit, 2-10 = forced leave after N consecutive stays
  playerCount?: number;
  createdAt: Timestamp;
}

export interface Preset {
  id: string;
  name: string;
  cardGame: string;
  cardGameOther?: string;
  description: string;
  tableCount: number;
  timerMinutes: number;
  bestOf: BestOf;
  afterBattleBuffer: number;
  matchingTimeout: number;
  matchingDeadline: string | null; // "HH:MM" string, date resolved at creation time
  seatRule: SeatRule;
  streakLimit: number;
  createdAt: Timestamp;
}

export interface Player {
  id: string;
  entryNumber: number;
  displayName: string;
  xId: string | null;
  googleUid: string | null;
  authUid?: string | null;
  wins: number;
  losses: number;
  currentStreak: number;
  maxStreak: number;
  isProxy: boolean;
  dropped: boolean;
  createdAt: Timestamp;
}

export interface GameResult {
  winnerId: string;
}

export interface Match {
  id: string;
  player1Id: string;
  player2Id: string;
  player1Name?: string;
  player2Name?: string;
  tableNumber: number;
  bestOf: BestOf;
  games: GameResult[];            // per-game results for BO3/BO5
  status: 'ongoing' | 'finished';
  winnerId: string | null;
  startedAt: Timestamp;
  finishedAt: Timestamp | null;
  bufferUntil: Timestamp | null;
  seatKeeperId: string | null;   // who keeps the table (null = both leave)
  retainTable: number | null;     // table number being retained
  createdByUid?: string | null;
}

export interface WaitingEntry {
  playerId: string;
  playerName?: string;
  queuedByUid?: string | null;
  joinedAt: Timestamp;
  retainTable?: number | null; // if set, this player keeps this table number
}

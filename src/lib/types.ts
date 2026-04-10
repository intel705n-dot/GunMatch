import type { Timestamp } from 'firebase/firestore';

export interface HostProfile {
  displayName: string;
  updatedAt: Timestamp;
}

export interface Tournament {
  id: string;
  hostUid: string;
  hostName: string;
  name: string;
  description: string;
  tableCount: number;
  timerMinutes: number;
  matchingDeadline: Timestamp | null;
  afterBattleBuffer: number;
  matchingTimeout: number;
  entryOpen: boolean;
  status: 'waiting' | 'active' | 'finished';
  isTest: boolean;
  createdAt: Timestamp;
}

export interface Player {
  id: string;
  entryNumber: number;
  displayName: string;
  xId: string | null;
  googleUid: string | null;
  wins: number;
  losses: number;
  isProxy: boolean;
  dropped: boolean;
  createdAt: Timestamp;
}

export interface Match {
  id: string;
  player1Id: string;
  player2Id: string;
  tableNumber: number;
  status: 'ongoing' | 'finished';
  winnerId: string | null;
  startedAt: Timestamp;
  finishedAt: Timestamp | null;
  bufferUntil: Timestamp | null;
}

export interface WaitingEntry {
  playerId: string;
  joinedAt: Timestamp;
}

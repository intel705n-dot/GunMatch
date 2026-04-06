import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  onSnapshot,
  increment,
  runTransaction,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Tournament, Match } from './types';

// Simple lock to prevent concurrent matching attempts on the same client
let matchingInProgress = false;

export async function joinMatchingQueue(tournamentId: string, playerId: string) {
  // Check if player is dropped
  const playerDoc = await getDoc(doc(db, 'tournaments', tournamentId, 'players', playerId));
  if (playerDoc.exists() && playerDoc.data().dropped) return;

  const queueRef = collection(db, 'tournaments', tournamentId, 'queue');
  const existing = query(queueRef, where('playerId', '==', playerId));
  const snap = await getDocs(existing);
  if (!snap.empty) return;

  await addDoc(queueRef, {
    playerId,
    joinedAt: Timestamp.now(),
  });

  // Player-side matching trigger: try matching immediately after joining queue
  // This ensures matching works even if the host's device is asleep
  try {
    await tryMatchAllPlayers(tournamentId);
  } catch (_e) { /* ignore - host polling is the fallback */ }
}

export async function leaveMatchingQueue(tournamentId: string, playerId: string) {
  const queueRef = collection(db, 'tournaments', tournamentId, 'queue');
  const q = query(queueRef, where('playerId', '==', playerId));
  const snap = await getDocs(q);
  for (const d of snap.docs) {
    await deleteDoc(d.ref);
  }
}

// Get cooldown window based on player count
// 10+: avoid last 2 opponents, 5-9: avoid last 1, <5: no restriction
function getCooldownWindow(playerCount: number): number {
  if (playerCount >= 10) return 2;
  if (playerCount >= 5) return 1;
  return 0;
}

// Get recent opponents for a player within the cooldown window
function getRecentOpponents(
  playerId: string,
  matches: Match[],
  cooldown: number,
): Set<string> {
  if (cooldown === 0) return new Set();
  const playerMatches = matches
    .filter((m) => m.player1Id === playerId || m.player2Id === playerId)
    .sort((a, b) => b.startedAt.toMillis() - a.startedAt.toMillis())
    .slice(0, cooldown);
  return new Set(
    playerMatches.map((m) => (m.player1Id === playerId ? m.player2Id : m.player1Id)),
  );
}

/**
 * Match ALL available pairs in a single call.
 * - Reads Firestore data once, then loops to create matches until no more pairs/tables.
 * - Uses a client-side lock to prevent concurrent calls from duplicating matches.
 * - Called from both host polling AND player-side queue join.
 */
export async function tryMatchAllPlayers(tournamentId: string): Promise<Match[]> {
  // Prevent concurrent matching on the same client
  if (matchingInProgress) return [];
  matchingInProgress = true;

  try {
    // --- Read all data ONCE ---
    const [tournDoc, queueSnap, matchesSnap, playersSnap] = await Promise.all([
      getDoc(doc(db, 'tournaments', tournamentId)),
      getDocs(query(collection(db, 'tournaments', tournamentId, 'queue'), orderBy('joinedAt', 'asc'))),
      getDocs(collection(db, 'tournaments', tournamentId, 'matches')),
      getDocs(collection(db, 'tournaments', tournamentId, 'players')),
    ]);

    if (!tournDoc.exists()) return [];
    const tourn = tournDoc.data() as Tournament;

    // Check matching deadline
    if (tourn.matchingDeadline && tourn.matchingDeadline.toMillis() < Date.now()) {
      return [];
    }

    if (queueSnap.size < 2) return [];

    // Build used tables set (ongoing + buffer)
    const now = Date.now();
    const usedTables = new Set<number>();
    const allMatches: Match[] = [];

    for (const d of matchesSnap.docs) {
      const data = d.data();
      allMatches.push({ id: d.id, ...data } as Match);
      if (data.status === 'ongoing') {
        usedTables.add(data.tableNumber);
      } else if (data.status === 'finished' && data.bufferUntil && data.bufferUntil.toMillis() > now) {
        usedTables.add(data.tableNumber);
      }
    }

    // Available tables
    const availableTables: number[] = [];
    for (let i = 1; i <= tourn.tableCount; i++) {
      if (!usedTables.has(i)) availableTables.push(i);
    }
    if (availableTables.length === 0) return [];

    // Cooldown calculation
    const playerCount = playersSnap.size;
    const cooldown = getCooldownWindow(playerCount);

    // Queue entries (mutable - we'll remove matched ones)
    const remainingEntries = [...queueSnap.docs];
    const createdMatches: Match[] = [];
    let tableIdx = 0;

    // Timer calculation
    const timerMinutes = tourn.isTest ? tourn.timerMinutes / 60 : tourn.timerMinutes;

    // Track matches created in this batch for cooldown accuracy
    const batchMatches = [...allMatches];

    // --- Loop: match as many pairs as possible ---
    while (remainingEntries.length >= 2 && tableIdx < availableTables.length) {
      let matched: [number, number] | null = null;

      // Try to find a valid pair with cooldown
      for (let i = 0; i < remainingEntries.length && !matched; i++) {
        const p1 = remainingEntries[i].data().playerId;
        const recentOpps = getRecentOpponents(p1, batchMatches, cooldown);
        for (let j = i + 1; j < remainingEntries.length; j++) {
          const p2 = remainingEntries[j].data().playerId;
          const recentOpps2 = getRecentOpponents(p2, batchMatches, cooldown);
          if (!recentOpps.has(p2) && !recentOpps2.has(p1)) {
            matched = [i, j];
            break;
          }
        }
      }

      // Fallback: if no valid pair found, take first two (release restriction)
      if (!matched) {
        matched = [0, 1];
      }

      const entry1 = remainingEntries[matched[0]];
      const entry2 = remainingEntries[matched[1]];
      const p1 = entry1.data().playerId;
      const p2 = entry2.data().playerId;
      const tableNumber = availableTables[tableIdx];

      // Create match
      const matchRef = await addDoc(collection(db, 'tournaments', tournamentId, 'matches'), {
        player1Id: p1,
        player2Id: p2,
        tableNumber,
        status: 'ongoing',
        winnerId: null,
        startedAt: Timestamp.now(),
        finishedAt: null,
        bufferUntil: null,
        timerSeconds: timerMinutes * 60,
      });

      // Remove from queue
      await Promise.all([
        deleteDoc(entry1.ref),
        deleteDoc(entry2.ref),
      ]);

      const newMatch = {
        id: matchRef.id,
        player1Id: p1,
        player2Id: p2,
        tableNumber,
        status: 'ongoing' as const,
        winnerId: null,
        startedAt: Timestamp.now(),
        finishedAt: null,
        bufferUntil: null,
      } as Match;

      createdMatches.push(newMatch);
      batchMatches.push(newMatch);

      // Remove matched entries from remaining (higher index first to preserve indices)
      const [lo, hi] = matched[0] < matched[1] ? [matched[0], matched[1]] : [matched[1], matched[0]];
      remainingEntries.splice(hi, 1);
      remainingEntries.splice(lo, 1);

      tableIdx++;
    }

    return createdMatches;
  } finally {
    matchingInProgress = false;
  }
}

// Legacy single-match function (kept for backwards compatibility, now calls tryMatchAllPlayers)
export async function tryMatchPlayers(tournamentId: string): Promise<Match | null> {
  const results = await tryMatchAllPlayers(tournamentId);
  return results.length > 0 ? results[0] : null;
}

export async function reportResult(
  tournamentId: string,
  matchId: string,
  winnerId: string,
) {
  const matchRef = doc(db, 'tournaments', tournamentId, 'matches', matchId);
  const matchSnap = await getDoc(matchRef);
  if (!matchSnap.exists()) return;
  const matchData = matchSnap.data();

  const tournDoc = await getDoc(doc(db, 'tournaments', tournamentId));
  const tourn = tournDoc.data() as Tournament;
  const bufferSeconds = tourn.isTest ? tourn.afterBattleBuffer : tourn.afterBattleBuffer * 60;

  const loserId = matchData.player1Id === winnerId ? matchData.player2Id : matchData.player1Id;

  const bufferUntil = Timestamp.fromMillis(Date.now() + bufferSeconds * 1000);

  await updateDoc(matchRef, {
    status: 'finished',
    winnerId,
    finishedAt: Timestamp.now(),
    bufferUntil,
  });

  const winnerRef = doc(db, 'tournaments', tournamentId, 'players', winnerId);
  const loserRef = doc(db, 'tournaments', tournamentId, 'players', loserId);
  await updateDoc(winnerRef, { wins: increment(1) });
  await updateDoc(loserRef, { losses: increment(1) });
}

export function subscribeToQueue(
  tournamentId: string,
  callback: (count: number) => void,
): Unsubscribe {
  const queueRef = collection(db, 'tournaments', tournamentId, 'queue');
  return onSnapshot(queueRef, (snap) => {
    callback(snap.size);
  });
}

export function subscribeToPlayerMatch(
  tournamentId: string,
  playerId: string,
  callback: (match: Match | null) => void,
): Unsubscribe {
  const matchesRef = collection(db, 'tournaments', tournamentId, 'matches');
  const q1 = query(matchesRef, where('player1Id', '==', playerId), where('status', '==', 'ongoing'));
  const q2 = query(matchesRef, where('player2Id', '==', playerId), where('status', '==', 'ongoing'));

  let currentMatch: Match | null = null;

  const unsub1 = onSnapshot(q1, (snap) => {
    if (!snap.empty) {
      const d = snap.docs[0];
      currentMatch = { id: d.id, ...d.data() } as Match;
      callback(currentMatch);
    } else if (currentMatch?.player1Id === playerId) {
      currentMatch = null;
      callback(null);
    }
  });

  const unsub2 = onSnapshot(q2, (snap) => {
    if (!snap.empty) {
      const d = snap.docs[0];
      currentMatch = { id: d.id, ...d.data() } as Match;
      callback(currentMatch);
    } else if (currentMatch?.player2Id === playerId) {
      currentMatch = null;
      callback(null);
    }
  });

  return () => {
    unsub1();
    unsub2();
  };
}

export function subscribeToPlayerInQueue(
  tournamentId: string,
  playerId: string,
  callback: (inQueue: boolean) => void,
): Unsubscribe {
  const queueRef = collection(db, 'tournaments', tournamentId, 'queue');
  const q = query(queueRef, where('playerId', '==', playerId));
  return onSnapshot(q, (snap) => {
    callback(!snap.empty);
  });
}

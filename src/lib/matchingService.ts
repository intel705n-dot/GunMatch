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
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Tournament, Match, BestOf } from './types';

// Simple lock to prevent concurrent matching attempts on the same client
let matchingInProgress = false;

export async function joinMatchingQueue(
  tournamentId: string,
  playerId: string,
  retainTable?: number | null,
) {
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
    retainTable: retainTable ?? null,
  });

  // Player-side matching trigger: try matching immediately after joining queue
  try {
    await tryMatchAllPlayers(tournamentId);
  } catch (_e) { /* ignore */ }
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
 */
export async function tryMatchAllPlayers(tournamentId: string): Promise<Match[]> {
  if (matchingInProgress) return [];
  matchingInProgress = true;

  try {
    const [tournDoc, queueSnap, matchesSnap, playersSnap] = await Promise.all([
      getDoc(doc(db, 'tournaments', tournamentId)),
      getDocs(query(collection(db, 'tournaments', tournamentId, 'queue'), orderBy('joinedAt', 'asc'))),
      getDocs(collection(db, 'tournaments', tournamentId, 'matches')),
      getDocs(collection(db, 'tournaments', tournamentId, 'players')),
    ]);

    if (!tournDoc.exists()) return [];
    const tourn = tournDoc.data() as Tournament;

    if (tourn.matchingDeadline && tourn.matchingDeadline.toMillis() < Date.now()) {
      return [];
    }

    if (queueSnap.size < 2) return [];

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

    const availableTables: number[] = [];
    for (let i = 1; i <= tourn.tableCount; i++) {
      if (!usedTables.has(i)) availableTables.push(i);
    }
    if (availableTables.length === 0) return [];

    const playerCount = playersSnap.size;
    const cooldown = getCooldownWindow(playerCount);

    const remainingEntries = [...queueSnap.docs];
    const createdMatches: Match[] = [];
    let tableIdx = 0;

    const timerMinutes = tourn.isTest ? tourn.timerMinutes / 60 : tourn.timerMinutes;
    const bestOf: BestOf = tourn.bestOf ?? 1;
    const batchMatches = [...allMatches];

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

      if (!matched) {
        matched = [0, 1];
      }

      const entry1 = remainingEntries[matched[0]];
      const entry2 = remainingEntries[matched[1]];
      const p1 = entry1.data().playerId;
      const p2 = entry2.data().playerId;

      // Determine table number: if either player retains a table, use that
      const retain1 = entry1.data().retainTable;
      const retain2 = entry2.data().retainTable;
      let tableNumber: number;
      if (retain1 && !usedTables.has(retain1)) {
        tableNumber = retain1;
      } else if (retain2 && !usedTables.has(retain2)) {
        tableNumber = retain2;
      } else {
        tableNumber = availableTables[tableIdx];
        tableIdx++;
      }
      usedTables.add(tableNumber);

      const matchRef = await addDoc(collection(db, 'tournaments', tournamentId, 'matches'), {
        player1Id: p1,
        player2Id: p2,
        tableNumber,
        bestOf,
        games: [],
        status: 'ongoing',
        winnerId: null,
        startedAt: Timestamp.now(),
        finishedAt: null,
        bufferUntil: null,
        seatKeeperId: null,
        retainTable: null,
        timerSeconds: timerMinutes * 60,
      });

      await Promise.all([
        deleteDoc(entry1.ref),
        deleteDoc(entry2.ref),
      ]);

      const newMatch = {
        id: matchRef.id,
        player1Id: p1,
        player2Id: p2,
        tableNumber,
        bestOf,
        games: [],
        status: 'ongoing' as const,
        winnerId: null,
        startedAt: Timestamp.now(),
        finishedAt: null,
        bufferUntil: null,
        seatKeeperId: null,
        retainTable: null,
      } as Match;

      createdMatches.push(newMatch);
      batchMatches.push(newMatch);

      const [lo, hi] = matched[0] < matched[1] ? [matched[0], matched[1]] : [matched[1], matched[0]];
      remainingEntries.splice(hi, 1);
      remainingEntries.splice(lo, 1);
    }

    return createdMatches;
  } finally {
    matchingInProgress = false;
  }
}

export async function tryMatchPlayers(tournamentId: string): Promise<Match | null> {
  const results = await tryMatchAllPlayers(tournamentId);
  return results.length > 0 ? results[0] : null;
}

/**
 * Report a single game result within a BO match.
 * For BO1, this also finalizes the match.
 * Returns whether the match is now finished.
 */
export async function reportGameResult(
  tournamentId: string,
  matchId: string,
  gameWinnerId: string,
): Promise<{ finished: boolean; matchWinnerId: string | null }> {
  const matchRef = doc(db, 'tournaments', tournamentId, 'matches', matchId);
  const matchSnap = await getDoc(matchRef);
  if (!matchSnap.exists()) return { finished: false, matchWinnerId: null };
  const matchData = matchSnap.data();

  const bestOf: BestOf = matchData.bestOf ?? 1;
  const games = [...(matchData.games || []), { winnerId: gameWinnerId }];
  const winsNeeded = Math.ceil(bestOf / 2);

  // Count wins
  const p1Wins = games.filter((g: { winnerId: string }) => g.winnerId === matchData.player1Id).length;
  const p2Wins = games.filter((g: { winnerId: string }) => g.winnerId === matchData.player2Id).length;

  const matchWinnerId = p1Wins >= winsNeeded ? matchData.player1Id :
                        p2Wins >= winsNeeded ? matchData.player2Id : null;

  if (matchWinnerId) {
    // Match finished — finalize
    await reportResult(tournamentId, matchId, matchWinnerId, games);
    return { finished: true, matchWinnerId };
  } else {
    // Match continues — just update games array
    await updateDoc(matchRef, { games });
    return { finished: false, matchWinnerId: null };
  }
}

/**
 * Correct a game result within a BO match.
 * Swaps the winner of a specific game index.
 * Returns whether the match should now be finished (if correction causes someone to reach winsNeeded).
 */
export async function correctGameResult(
  tournamentId: string,
  matchId: string,
  gameIndex: number,
): Promise<{ finished: boolean; matchWinnerId: string | null }> {
  const matchRef = doc(db, 'tournaments', tournamentId, 'matches', matchId);
  const matchSnap = await getDoc(matchRef);
  if (!matchSnap.exists()) return { finished: false, matchWinnerId: null };
  const matchData = matchSnap.data();

  const games = [...(matchData.games || [])];
  if (gameIndex < 0 || gameIndex >= games.length) return { finished: false, matchWinnerId: null };

  // Swap winner
  const currentWinner = games[gameIndex].winnerId;
  const newWinner = currentWinner === matchData.player1Id ? matchData.player2Id : matchData.player1Id;
  games[gameIndex] = { winnerId: newWinner };

  const bestOf: BestOf = matchData.bestOf ?? 1;
  const winsNeeded = Math.ceil(bestOf / 2);
  const p1Wins = games.filter((g: { winnerId: string }) => g.winnerId === matchData.player1Id).length;
  const p2Wins = games.filter((g: { winnerId: string }) => g.winnerId === matchData.player2Id).length;

  const matchWinnerId = p1Wins >= winsNeeded ? matchData.player1Id :
                        p2Wins >= winsNeeded ? matchData.player2Id : null;

  if (matchWinnerId) {
    await reportResult(tournamentId, matchId, matchWinnerId, games);
    return { finished: true, matchWinnerId };
  } else {
    await updateDoc(matchRef, { games });
    return { finished: false, matchWinnerId: null };
  }
}

/**
 * Finalize a match with a winner. Updates stats, streaks, buffer.
 */
export async function reportResult(
  tournamentId: string,
  matchId: string,
  winnerId: string,
  games?: { winnerId: string }[],
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

  const updateData: Record<string, unknown> = {
    status: 'finished',
    winnerId,
    finishedAt: Timestamp.now(),
    bufferUntil,
  };
  if (games) {
    updateData.games = games;
  }
  await updateDoc(matchRef, updateData);

  // Update wins/losses
  const winnerRef = doc(db, 'tournaments', tournamentId, 'players', winnerId);
  const loserRef = doc(db, 'tournaments', tournamentId, 'players', loserId);

  // Update streaks
  const winnerSnap = await getDoc(winnerRef);
  const loserSnap = await getDoc(loserRef);
  const winnerData = winnerSnap.data();
  const loserData = loserSnap.data();

  const newWinnerStreak = (winnerData?.currentStreak ?? 0) + 1;
  const winnerMaxStreak = Math.max(winnerData?.maxStreak ?? 0, newWinnerStreak);

  await updateDoc(winnerRef, {
    wins: increment(1),
    currentStreak: newWinnerStreak,
    maxStreak: winnerMaxStreak,
  });
  await updateDoc(loserRef, {
    losses: increment(1),
    currentStreak: 0,
  });
}

/**
 * Handle seat keeping after match result.
 */
export async function handleSeatKeep(
  tournamentId: string,
  matchId: string,
  playerId: string,
  keepSeat: boolean,
) {
  if (!keepSeat) return;

  const matchRef = doc(db, 'tournaments', tournamentId, 'matches', matchId);
  const matchSnap = await getDoc(matchRef);
  if (!matchSnap.exists()) return;
  const matchData = matchSnap.data();

  await updateDoc(matchRef, {
    seatKeeperId: playerId,
    retainTable: matchData.tableNumber,
  });

  await joinMatchingQueue(tournamentId, playerId, matchData.tableNumber);
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

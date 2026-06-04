import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  onSnapshot,
  increment,
  runTransaction,
  type DocumentData,
  type DocumentReference,
  type Transaction,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import type { Tournament, Match, BestOf, WaitingEntry } from './types';

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
  const playerName = playerDoc.exists() ? playerDoc.data().displayName : null;

  const queueDocRef = doc(db, 'tournaments', tournamentId, 'queue', playerId);
  const existing = await getDoc(queueDocRef);
  if (existing.exists()) return;

  await setDoc(queueDocRef, {
    playerId,
    playerName,
    queuedByUid: auth.currentUser?.uid ?? null,
    joinedAt: Timestamp.now(),
    retainTable: retainTable ?? null,
  });

  // Player-side matching trigger: try matching immediately after joining queue
  try {
    await tryMatchAllPlayers(tournamentId);
  } catch { /* ignore */ }
}

export async function leaveMatchingQueue(tournamentId: string, playerId: string) {
  await deleteDoc(doc(db, 'tournaments', tournamentId, 'queue', playerId));
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
    const [tournDoc, counterSnap, queueSnap] = await Promise.all([
      getDoc(doc(db, 'tournaments', tournamentId)),
      getDoc(doc(db, 'tournaments', tournamentId, 'meta', 'counters')),
      getDocs(query(collection(db, 'tournaments', tournamentId, 'queue'), orderBy('joinedAt', 'asc'))),
    ]);

    if (!tournDoc.exists()) return [];
    const tourn = tournDoc.data() as Tournament;

    if (tourn.matchingDeadline && tourn.matchingDeadline.toMillis() < Date.now()) {
      return [];
    }

    if (queueSnap.size < 2) return [];

    const now = Date.now();
    const nowTs = Timestamp.fromMillis(now);
    const matchesRef = collection(db, 'tournaments', tournamentId, 'matches');
    const [ongoingSnap, bufferedSnap, recentSnap] = await Promise.all([
      getDocs(query(matchesRef, where('status', '==', 'ongoing'))),
      getDocs(query(matchesRef, where('status', '==', 'finished'), where('bufferUntil', '>', nowTs))),
      getDocs(query(matchesRef, orderBy('startedAt', 'desc'), limit(200))),
    ]);

    const usedTables = new Set<number>();
    const recentMatchesById = new Map<string, Match>();

    for (const d of ongoingSnap.docs) {
      const data = d.data();
      usedTables.add(data.tableNumber);
      recentMatchesById.set(d.id, { id: d.id, ...data } as Match);
    }
    for (const d of bufferedSnap.docs) {
      const data = d.data();
      usedTables.add(data.tableNumber);
      recentMatchesById.set(d.id, { id: d.id, ...data } as Match);
    }
    for (const d of recentSnap.docs) {
      recentMatchesById.set(d.id, { id: d.id, ...d.data() } as Match);
    }

    const availableTables: number[] = [];
    for (let i = 1; i <= tourn.tableCount; i++) {
      if (!usedTables.has(i)) availableTables.push(i);
    }
    if (availableTables.length === 0) return [];

    const counterPlayerCount = counterSnap.exists() ? counterSnap.data().playerCount : undefined;
    const playerCount = Math.max(
      typeof counterPlayerCount === 'number' ? counterPlayerCount : 0,
      tourn.playerCount ?? 0,
      queueSnap.size,
    );
    const cooldown = getCooldownWindow(playerCount);

    const remainingEntries = queueSnap.docs.map((d) => ({
      ref: d.ref,
      data: d.data() as WaitingEntry,
    }));
    const createdMatches: Match[] = [];
    let tableIdx = 0;

    const timerMinutes = tourn.isTest ? tourn.timerMinutes / 60 : tourn.timerMinutes;
    const bestOf: BestOf = tourn.bestOf ?? 1;
    const batchMatches = [...recentMatchesById.values()];

    while (remainingEntries.length >= 2 && tableIdx < availableTables.length) {
      let matched: [number, number] | null = null;

      // Try to find a valid pair with cooldown
      for (let i = 0; i < remainingEntries.length && !matched; i++) {
        const p1 = remainingEntries[i].data.playerId;
        const recentOpps = getRecentOpponents(p1, batchMatches, cooldown);
        for (let j = i + 1; j < remainingEntries.length; j++) {
          const p2 = remainingEntries[j].data.playerId;
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
      const p1 = entry1.data.playerId;
      const p2 = entry2.data.playerId;
      const p1Name = entry1.data.playerName ?? null;
      const p2Name = entry2.data.playerName ?? null;

      // Determine table number: if either player retains a table, use that
      const retain1 = entry1.data.retainTable;
      const retain2 = entry2.data.retainTable;
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
        player1Name: p1Name,
        player2Name: p2Name,
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
        createdByUid: auth.currentUser?.uid ?? null,
      });

      await Promise.all([
        deleteDoc(entry1.ref),
        deleteDoc(entry2.ref),
      ]);

      const newMatch = {
        id: matchRef.id,
        player1Id: p1,
        player2Id: p2,
        player1Name: p1Name ?? undefined,
        player2Name: p2Name ?? undefined,
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
 * Private helper — performs the writes that finalize a match (mark finished,
 * increment wins/losses, update streak). Must be called from inside a
 * Firestore transaction, and BEFORE any other writes have been queued in the
 * transaction (Firestore requires all reads to precede all writes).
 *
 * The transaction wrapper around the caller is what makes wins/losses safe
 * from double-count: if two clients race to finalize the same match, only the
 * first commits; the second retries, observes status === 'finished', and
 * bails out without re-incrementing.
 */
async function finalizeMatchInTx(
  tx: Transaction,
  tournamentId: string,
  matchRef: DocumentReference,
  tournRef: DocumentReference,
  matchData: DocumentData,
  winnerId: string,
  games?: { winnerId: string }[],
): Promise<void> {
  const tournSnap = await tx.get(tournRef);
  if (!tournSnap.exists()) return;
  const tourn = tournSnap.data() as Tournament;
  const bufferSeconds = tourn.isTest ? tourn.afterBattleBuffer : tourn.afterBattleBuffer * 60;

  const loserId = matchData.player1Id === winnerId ? matchData.player2Id : matchData.player1Id;
  const winnerRef = doc(db, 'tournaments', tournamentId, 'players', winnerId);
  const loserRef = doc(db, 'tournaments', tournamentId, 'players', loserId);

  const winnerSnap = await tx.get(winnerRef);
  const loserSnap = await tx.get(loserRef);
  if (!winnerSnap.exists() || !loserSnap.exists()) return;
  const winnerData = winnerSnap.data();

  const newWinnerStreak = (winnerData?.currentStreak ?? 0) + 1;
  const winnerMaxStreak = Math.max(winnerData?.maxStreak ?? 0, newWinnerStreak);
  const bufferUntil = Timestamp.fromMillis(Date.now() + bufferSeconds * 1000);

  const matchUpdate: Record<string, unknown> = {
    status: 'finished',
    winnerId,
    finishedAt: Timestamp.now(),
    bufferUntil,
  };
  if (games) matchUpdate.games = games;

  tx.update(matchRef, matchUpdate);
  tx.update(winnerRef, {
    wins: increment(1),
    currentStreak: newWinnerStreak,
    maxStreak: winnerMaxStreak,
  });
  tx.update(loserRef, {
    losses: increment(1),
    currentStreak: 0,
  });
}

/**
 * Report a single game result within a BO match.
 * For BO1, this also finalizes the match.
 * Returns whether the match is now finished.
 *
 * Wrapped in a Firestore transaction so that the read-then-write of the
 * games array (and any subsequent finalize) is atomic. Concurrent reports
 * cannot both observe the same pre-state.
 */
export async function reportGameResult(
  tournamentId: string,
  matchId: string,
  gameWinnerId: string,
): Promise<{ finished: boolean; matchWinnerId: string | null }> {
  const matchRef = doc(db, 'tournaments', tournamentId, 'matches', matchId);
  const tournRef = doc(db, 'tournaments', tournamentId);

  return await runTransaction(db, async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists()) return { finished: false, matchWinnerId: null };
    const matchData = matchSnap.data();

    // Idempotency: already-finished matches must not accept new games.
    if (matchData.status === 'finished') {
      return { finished: true, matchWinnerId: matchData.winnerId ?? null };
    }

    const bestOf: BestOf = matchData.bestOf ?? 1;
    const games = [...(matchData.games || []), { winnerId: gameWinnerId }];
    const winsNeeded = Math.ceil(bestOf / 2);

    const p1Wins = games.filter((g: { winnerId: string }) => g.winnerId === matchData.player1Id).length;
    const p2Wins = games.filter((g: { winnerId: string }) => g.winnerId === matchData.player2Id).length;

    const matchWinnerId = p1Wins >= winsNeeded ? matchData.player1Id :
                          p2Wins >= winsNeeded ? matchData.player2Id : null;

    if (matchWinnerId) {
      await finalizeMatchInTx(tx, tournamentId, matchRef, tournRef, matchData, matchWinnerId, games);
      return { finished: true, matchWinnerId };
    } else {
      tx.update(matchRef, { games });
      return { finished: false, matchWinnerId: null };
    }
  });
}

/**
 * Correct a game result within an ongoing BO match.
 * Swaps the winner of a specific game index.
 * If the correction causes someone to reach winsNeeded, the match finalizes
 * within the same transaction.
 *
 * Note: PlayerMain only exposes correction during ongoing matches. Correction
 * of already-finished matches goes through HostManage.updateMatchWinner.
 */
export async function correctGameResult(
  tournamentId: string,
  matchId: string,
  gameIndex: number,
): Promise<{ finished: boolean; matchWinnerId: string | null }> {
  const matchRef = doc(db, 'tournaments', tournamentId, 'matches', matchId);
  const tournRef = doc(db, 'tournaments', tournamentId);

  return await runTransaction(db, async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists()) return { finished: false, matchWinnerId: null };
    const matchData = matchSnap.data();

    if (matchData.status === 'finished') {
      // Defensive: PlayerMain UI prevents this, but if it ever happens, no-op.
      return { finished: true, matchWinnerId: matchData.winnerId ?? null };
    }

    const games = [...(matchData.games || [])];
    if (gameIndex < 0 || gameIndex >= games.length) {
      return { finished: false, matchWinnerId: null };
    }

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
      await finalizeMatchInTx(tx, tournamentId, matchRef, tournRef, matchData, matchWinnerId, games);
      return { finished: true, matchWinnerId };
    } else {
      tx.update(matchRef, { games });
      return { finished: false, matchWinnerId: null };
    }
  });
}

/**
 * Finalize a match with a winner. Updates stats, streaks, buffer.
 *
 * Wrapped in a Firestore transaction — concurrent reports of the same match
 * (same client double-tap, two clients reporting simultaneously, network
 * retries) cannot double-increment wins/losses. The first transaction commits;
 * any concurrent transaction retries, sees status === 'finished', and bails.
 *
 * Match correction for already-finished matches goes through
 * HostManage.updateMatchWinner directly (which does its own stat reversal).
 */
export async function reportResult(
  tournamentId: string,
  matchId: string,
  winnerId: string,
  games?: { winnerId: string }[],
) {
  const matchRef = doc(db, 'tournaments', tournamentId, 'matches', matchId);
  const tournRef = doc(db, 'tournaments', tournamentId);

  await runTransaction(db, async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists()) return;
    const matchData = matchSnap.data();

    // Atomic idempotency — concurrent reports cannot both pass this check
    // because the transaction's snapshot isolation forces a retry on the
    // client whose read became stale.
    if (matchData.status === 'finished') return;

    await finalizeMatchInTx(tx, tournamentId, matchRef, tournRef, matchData, winnerId, games);
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
  const queueRef = doc(db, 'tournaments', tournamentId, 'queue', playerId);
  return onSnapshot(queueRef, (snap) => {
    callback(snap.exists());
  });
}

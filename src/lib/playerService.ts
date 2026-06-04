import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  runTransaction,
  Timestamp,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Player } from './types';

type NewPlayerData = Omit<Player, 'id' | 'entryNumber' | 'createdAt'> & {
  createdAt?: Timestamp;
};

async function getFallbackEntryNumber(tournamentId: string): Promise<number> {
  const playersSnap = await getDocs(collection(db, 'tournaments', tournamentId, 'players'));
  let maxEntryNumber = 0;
  for (const d of playersSnap.docs) {
    const entryNumber = d.data().entryNumber;
    if (typeof entryNumber === 'number') {
      maxEntryNumber = Math.max(maxEntryNumber, entryNumber);
    }
  }
  return maxEntryNumber + 1;
}

export async function createTournamentPlayer(
  tournamentId: string,
  playerData: NewPlayerData,
): Promise<DocumentReference> {
  const counterRef = doc(db, 'tournaments', tournamentId, 'meta', 'counters');
  const playerRef = doc(collection(db, 'tournaments', tournamentId, 'players'));

  const counterSnap = await getDoc(counterRef);
  const fallbackEntryNumber = counterSnap.exists()
    ? 1
    : await getFallbackEntryNumber(tournamentId);

  await runTransaction(db, async (tx) => {
    const txCounterSnap = await tx.get(counterRef);
    const currentNext = txCounterSnap.exists()
      ? txCounterSnap.data().nextEntryNumber
      : fallbackEntryNumber;
    const entryNumber = typeof currentNext === 'number' && currentNext > 0
      ? currentNext
      : fallbackEntryNumber;

    tx.set(playerRef, {
      ...playerData,
      entryNumber,
      createdAt: playerData.createdAt ?? Timestamp.now(),
    });

    tx.set(counterRef, {
      nextEntryNumber: entryNumber + 1,
      playerCount: increment(1),
      updatedAt: Timestamp.now(),
    }, { merge: true });
  });

  return playerRef;
}

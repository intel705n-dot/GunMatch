import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc, collection, onSnapshot, query, orderBy, where, getDocs,
  collectionGroup, updateDoc, getDoc,
} from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { db, auth } from '../../lib/firebase';
import type { Tournament, Player, Match } from '../../lib/types';
import {
  joinMatchingQueue,
  leaveMatchingQueue,
  reportResult,
  reportGameResult,
  correctGameResult,
  handleSeatKeep,
  tryMatchAllPlayers,
  subscribeToPlayerMatch,
  subscribeToPlayerInQueue,
} from '../../lib/matchingService';
import Layout from '../../components/Layout';
import Timer from '../../components/Timer';
import Ranking from '../../components/Ranking';
import CardGameBadge from '../../components/CardGameBadge';

// SVG Icons
const SwordsIcon = ({ className = '' }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="M13 19l6-6" /><path d="M16 16l4 4" /><path d="M19 21l2-2" />
    <path d="M9.5 6.5 21 18v3h-3L6.5 9.5" /><path d="M11 5l-6 6" /><path d="M8 8 4 4" /><path d="M5 3 3 5" />
  </svg>
);

const TrophyIcon = ({ className = '' }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
);

const ShieldIcon = ({ className = '' }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  </svg>
);

const LogOutIcon = ({ className = '' }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const SearchIcon = ({ className = '' }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
  </svg>
);

const ChartIcon = ({ className = '' }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="m7 11 4-4 4 4 6-6" />
  </svg>
);

const ClockIcon = ({ className = '' }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

const XCircleIcon = ({ className = '' }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
  </svg>
);

const CheckCircleIcon = ({ className = '' }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" />
  </svg>
);

export default function PlayerMain() {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [inQueue, setInQueue] = useState(false);
  const [matchHistory, setMatchHistory] = useState<Match[]>([]);
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [showRanking, setShowRanking] = useState(false);
  const [reporting, setReporting] = useState(false);
  // selectedWinner removed — replaced by selectedGameWinner for BO support
  const [showHistory, setShowHistory] = useState(false);
  const [pastRecords, setPastRecords] = useState<{ tournamentName: string; wins: number; losses: number; date: string }[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [dropping, setDropping] = useState(false);
  // BO game-by-game state
  const [selectedGameWinner, setSelectedGameWinner] = useState<string | null>(null);
  const [correctionMode, setCorrectionMode] = useState(false);
  // Post-match seat keep state
  const [postMatchInfo, setPostMatchInfo] = useState<{ matchId: string; tableNumber: number; isStayer: boolean; winnerId: string } | null>(null);
  const [seatCountdown, setSeatCountdown] = useState(0);
  const [seatDecided, setSeatDecided] = useState(false);

  // Get player ID from localStorage
  useEffect(() => {
    if (!tournamentId) return;
    const saved = localStorage.getItem(`gunmatch_player_${tournamentId}`);
    if (!saved) {
      navigate(`/entry/${tournamentId}`, { replace: true });
      return;
    }
    setPlayerId(saved);
  }, [tournamentId, navigate]);

  // Subscribe to tournament
  useEffect(() => {
    if (!tournamentId) return;
    const unsub = onSnapshot(doc(db, 'tournaments', tournamentId), (snap) => {
      if (snap.exists()) setTournament({ id: snap.id, ...snap.data() } as Tournament);
    });
    return unsub;
  }, [tournamentId]);

  // Subscribe to player data
  useEffect(() => {
    if (!tournamentId || !playerId) return;
    const unsub = onSnapshot(doc(db, 'tournaments', tournamentId, 'players', playerId), (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as Player;
        setPlayer(data);
        // Auto-link googleUid if user is already Google-authenticated but player has no googleUid
        if (!data.googleUid) {
          const currentUser = auth.currentUser;
          if (currentUser && !currentUser.isAnonymous) {
            updateDoc(doc(db, 'tournaments', tournamentId, 'players', playerId), {
              googleUid: currentUser.uid,
            }).catch(() => {});
          }
        }
      }
    });
    return unsub;
  }, [tournamentId, playerId]);

  // Subscribe to all players (for ranking & names)
  useEffect(() => {
    if (!tournamentId) return;
    const q = query(collection(db, 'tournaments', tournamentId, 'players'), orderBy('entryNumber', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Player)));
    });
    return unsub;
  }, [tournamentId]);

  // Track previous match to detect finish (for non-reporter post-match UI)
  const [lastMatchRef, setLastMatchRef] = useState<{ id: string; tableNumber: number; player1Id: string; player2Id: string } | null>(null);

  // Subscribe to current match
  useEffect(() => {
    if (!tournamentId || !playerId) return;
    const unsub = subscribeToPlayerMatch(tournamentId, playerId, (match) => {
      if (match) {
        // Store reference to ongoing match
        setLastMatchRef({ id: match.id, tableNumber: match.tableNumber, player1Id: match.player1Id, player2Id: match.player2Id });
      }
      setCurrentMatch(match);
      if (match) {
        try { navigator.vibrate?.(200); } catch (_e) { /* silent */ }
      }
    });
    return unsub;
  }, [tournamentId, playerId]);

  // Subscribe to queue status
  useEffect(() => {
    if (!tournamentId || !playerId) return;
    const unsub = subscribeToPlayerInQueue(tournamentId, playerId, setInQueue);
    return unsub;
  }, [tournamentId, playerId]);

  // Load match history
  useEffect(() => {
    if (!tournamentId || !playerId) return;
    const matchesRef = collection(db, 'tournaments', tournamentId, 'matches');
    const unsub = onSnapshot(query(matchesRef, orderBy('startedAt', 'desc')), (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Match));
      setAllMatches(all);
      setMatchHistory(all.filter((m) => m.player1Id === playerId || m.player2Id === playerId));
    });
    return unsub;
  }, [tournamentId, playerId]);

  // Player-side matching: poll while in queue so matching works even if host is offline
  useEffect(() => {
    if (!inQueue || !tournamentId) return;
    const interval = setInterval(async () => {
      try {
        await tryMatchAllPlayers(tournamentId);
      } catch (_e) { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [inQueue, tournamentId]);

  // Auto-leave queue on timeout
  useEffect(() => {
    if (!inQueue || !tournament || !tournamentId || !playerId) return;
    const timeoutMs = tournament.isTest
      ? tournament.matchingTimeout * 1000
      : tournament.matchingTimeout * 60 * 1000;
    if (timeoutMs <= 0) return;
    const timer = setTimeout(() => {
      leaveMatchingQueue(tournamentId, playerId);
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [inQueue, tournament, tournamentId, playerId]);

  const handleStartMatching = useCallback(async () => {
    if (!tournamentId || !playerId) return;
    await joinMatchingQueue(tournamentId, playerId);
  }, [tournamentId, playerId]);

  const handleCancelMatching = useCallback(async () => {
    if (!tournamentId || !playerId) return;
    await leaveMatchingQueue(tournamentId, playerId);
  }, [tournamentId, playerId]);

  // Trigger post-match seat keep flow after match is decided
  const triggerPostMatch = useCallback((matchId: string, tableNumber: number, matchWinnerId: string) => {
    if (!tournament || !playerId || !player) return;

    const seatRule = tournament.seatRule ?? 'both-leave';
    const loserId = currentMatch
      ? (currentMatch.player1Id === matchWinnerId ? currentMatch.player2Id : currentMatch.player1Id)
      : matchWinnerId; // fallback

    if (seatRule === 'both-leave') return; // no seat keeping

    const stayerId = seatRule === 'winner-stays' ? matchWinnerId : loserId;
    const isStayer = stayerId === playerId;

    // Check streak limit
    const streakLimit = tournament.streakLimit ?? 0;
    if (isStayer && streakLimit > 0 && seatRule === 'winner-stays' && (player.currentStreak + 1) >= streakLimit) {
      setPostMatchInfo({ matchId, tableNumber, isStayer: false, winnerId: matchWinnerId });
      setSeatDecided(true);
      return;
    }

    if (isStayer) {
      if (seatRule === 'loser-stays') {
        setPostMatchInfo({ matchId, tableNumber, isStayer: true, winnerId: matchWinnerId });
        setSeatCountdown(25);
        setSeatDecided(false);
      } else {
        setPostMatchInfo({ matchId, tableNumber, isStayer: true, winnerId: matchWinnerId });
        setSeatCountdown(0);
        setSeatDecided(false);
      }
    } else {
      setPostMatchInfo({ matchId, tableNumber, isStayer: false, winnerId: matchWinnerId });
      setSeatDecided(true);
    }
  }, [tournament, playerId, player, currentMatch]);

  // Report a single game result (works for BO1 and BO3/BO5)
  const handleReportGame = useCallback(async (gameWinnerId: string) => {
    if (!tournamentId || !currentMatch || reporting) return;
    setReporting(true);
    try {
      const bestOf = currentMatch.bestOf ?? 1;

      if (bestOf === 1) {
        // BO1: direct finish
        await reportResult(tournamentId, currentMatch.id, gameWinnerId);
        triggerPostMatch(currentMatch.id, currentMatch.tableNumber, gameWinnerId);
      } else {
        // BO3/BO5: report game
        const result = await reportGameResult(tournamentId, currentMatch.id, gameWinnerId);
        if (result.finished && result.matchWinnerId) {
          triggerPostMatch(currentMatch.id, currentMatch.tableNumber, result.matchWinnerId);
        }
      }
    } finally {
      setReporting(false);
      setSelectedGameWinner(null);
    }
  }, [tournamentId, currentMatch, reporting, triggerPostMatch]);

  // Correct a game result (swap winner of specific game)
  const handleCorrectGame = useCallback(async (gameIndex: number) => {
    if (!tournamentId || !currentMatch) return;
    const result = await correctGameResult(tournamentId, currentMatch.id, gameIndex);
    if (result.finished && result.matchWinnerId) {
      setCorrectionMode(false);
      triggerPostMatch(currentMatch.id, currentMatch.tableNumber, result.matchWinnerId);
    }
  }, [tournamentId, currentMatch, triggerPostMatch]);

  const handleLinkGoogle = useCallback(async () => {
    if (!tournamentId || !playerId || linkingGoogle) return;
    setLinkingGoogle(true);
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      const googleUid = result.user.uid;
      await updateDoc(doc(db, 'tournaments', tournamentId, 'players', playerId), {
        googleUid,
      });
    } catch (e: any) {
      if (e.code !== 'auth/popup-closed-by-user') console.error(e);
    } finally {
      setLinkingGoogle(false);
    }
  }, [tournamentId, playerId, linkingGoogle]);

  const loadPastRecords = useCallback(async () => {
    if (!player?.googleUid || loadingHistory) return;
    setLoadingHistory(true);
    try {
      const q = query(
        collectionGroup(db, 'players'),
        where('googleUid', '==', player.googleUid),
      );
      const snap = await getDocs(q);
      const records: typeof pastRecords = [];
      for (const d of snap.docs) {
        const data = d.data();
        // Get parent tournament info
        const tournRef = d.ref.parent.parent;
        if (!tournRef) continue;
        const tournSnap = await getDoc(tournRef);
        if (!tournSnap.exists()) continue;
        const tourn = tournSnap.data();
        // Skip current tournament
        if (tournRef.id === tournamentId) continue;
        records.push({
          tournamentName: tourn.name,
          wins: data.wins || 0,
          losses: data.losses || 0,
          date: tourn.createdAt?.toDate?.()?.toLocaleDateString('ja-JP') ?? '',
        });
      }
      records.sort((a, b) => b.date.localeCompare(a.date));
      setPastRecords(records);
      setShowHistory(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  }, [player?.googleUid, tournamentId, loadingHistory]);

  // Countdown timer for loser-stays seat keep decision
  useEffect(() => {
    if (!postMatchInfo || seatDecided || seatCountdown <= 0) return;
    const timer = setInterval(() => {
      setSeatCountdown((prev) => {
        if (prev <= 1) {
          // Auto-continue (stay at table)
          clearInterval(timer);
          if (postMatchInfo && tournamentId) {
            handleSeatKeep(tournamentId, postMatchInfo.matchId, playerId!, true);
            setSeatDecided(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [postMatchInfo, seatDecided, seatCountdown, tournamentId, playerId]);

  const handleSeatChoice = useCallback(async (keepSeat: boolean) => {
    if (!tournamentId || !postMatchInfo || !playerId) return;
    setSeatDecided(true);
    setSeatCountdown(0);
    if (keepSeat) {
      await handleSeatKeep(tournamentId, postMatchInfo.matchId, playerId, true);
    }
    // If not keeping seat, player just goes back to normal state (can manually match again)
  }, [tournamentId, postMatchInfo, playerId]);

  // Detect match finish for non-reporter: when currentMatch goes null but we had a lastMatchRef
  // and postMatchInfo is not already set (reporter already set it)
  useEffect(() => {
    if (currentMatch) {
      // New match started — clear post-match state
      setPostMatchInfo(null);
      setSeatDecided(false);
      setSeatCountdown(0);
      setCorrectionMode(false);
      setSelectedGameWinner(null);
      return;
    }

    // currentMatch is null — check if a match just finished
    if (!lastMatchRef || postMatchInfo || !tournamentId || !playerId || !tournament) return;

    // Fetch the finished match to get winnerId
    const matchRef = doc(db, 'tournaments', tournamentId, 'matches', lastMatchRef.id);
    const unsub = onSnapshot(matchRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.status !== 'finished' || !data.winnerId) return;

      // Only set post-match info if not already set (reporter sets it in handleReportGame)
      setPostMatchInfo((prev) => {
        if (prev) return prev; // Already set by reporter flow

        const seatRule = tournament.seatRule ?? 'both-leave';
        if (seatRule === 'both-leave') return null;

        const winnerId = data.winnerId as string;
        const loserId = lastMatchRef.player1Id === winnerId ? lastMatchRef.player2Id : lastMatchRef.player1Id;
        const stayerId = seatRule === 'winner-stays' ? winnerId : loserId;
        const isStayer = stayerId === playerId;

        if (isStayer) {
          if (seatRule === 'loser-stays') {
            setSeatCountdown(25);
            setSeatDecided(false);
          } else {
            setSeatCountdown(0);
            setSeatDecided(false);
          }
        } else {
          setSeatDecided(true);
        }

        return { matchId: lastMatchRef.id, tableNumber: lastMatchRef.tableNumber, isStayer, winnerId };
      });

      // Clear lastMatchRef after processing
      setLastMatchRef(null);
      unsub(); // Only need this once
    });

    return () => unsub();
  }, [currentMatch, lastMatchRef, postMatchInfo, tournamentId, playerId, tournament]);

  const handleDrop = useCallback(async () => {
    if (!tournamentId || !playerId || dropping) return;
    if (!confirm('本当にドロップ（棄権）しますか？\nこの操作はホストに復帰を依頼しない限り元に戻せません。')) return;
    setDropping(true);
    try {
      // Leave queue if in queue
      await leaveMatchingQueue(tournamentId, playerId);
      // Set dropped flag
      await updateDoc(doc(db, 'tournaments', tournamentId, 'players', playerId), { dropped: true });
    } catch (e) {
      console.error(e);
    } finally {
      setDropping(false);
    }
  }, [tournamentId, playerId, dropping]);

  const getPlayerName = (id: string) => players.find((p) => p.id === id)?.displayName ?? '???';
  const getOpponentId = (match: Match) =>
    match.player1Id === playerId ? match.player2Id : match.player1Id;

  if (!tournament || !player) {
    return <Layout><p className="text-center py-16 text-stone-500">...</p></Layout>;
  }

  const isFinished = tournament.status === 'finished';
  const totalGames = player.wins + player.losses;
  const winRate = totalGames > 0 ? Math.round((player.wins / totalGames) * 100) : 0;

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight">{tournament.name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            {tournament.cardGame && (
              <CardGameBadge cardGameId={tournament.cardGame} cardGameOther={tournament.cardGameOther} />
            )}
            {tournament.hostName && (
              <span className="text-xs text-stone-400">{tournament.hostName}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {auth.currentUser && !auth.currentUser.isAnonymous && (
            <button
              onClick={() => navigate('/host')}
              className="p-2 bg-white shadow-sm hover:bg-stone-100 rounded-lg transition-colors shrink-0"
              title="マイページ"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-stone-500">
                <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
            </button>
          )}
          <button
            onClick={() => {
              localStorage.removeItem(`gunmatch_player_${tournamentId}`);
              navigate(`/entry/${tournamentId}`, { replace: true });
            }}
            className="p-2 bg-white shadow-sm hover:bg-stone-100 rounded-lg transition-colors shrink-0"
            title="退室"
          >
            <LogOutIcon className="w-4 h-4 text-stone-500" />
          </button>
        </div>
      </div>

      {/* Main Stats Card - Hero Section */}
      <div className="relative bg-gradient-to-br from-white to-stone-50 rounded-2xl border border-stone-200 shadow-sm mb-5 overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-orange-500/5 rounded-full blur-2xl" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl" />
        </div>

        <div className="relative p-5">
          {/* Player name + badge */}
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-orange-100 border border-orange-200 flex items-center justify-center">
              <ShieldIcon className="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <p className="font-bold text-base leading-tight">{player.displayName}</p>
              {tournament.description && (
                <p className="text-xs text-stone-400 mt-0.5 line-clamp-1">{tournament.description}</p>
              )}
            </div>
          </div>

          {/* Win - Loss big display */}
          <div className="text-center py-3">
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-2 font-medium">Current Record</p>
            <div className="flex items-center justify-center gap-3">
              <div className="text-right">
                <p className="text-5xl font-black tabular-nums text-emerald-500 leading-none drop-shadow-[0_0_12px_rgba(16,185,129,0.2)]">
                  {player.wins}
                </p>
                <p className="text-xs text-emerald-500/70 font-bold mt-1.5 uppercase tracking-wider">Win</p>
              </div>
              <div className="flex flex-col items-center px-2">
                <span className="text-3xl font-thin text-stone-300 leading-none">-</span>
              </div>
              <div className="text-left">
                <p className="text-5xl font-black tabular-nums text-red-500 leading-none drop-shadow-[0_0_12px_rgba(239,68,68,0.2)]">
                  {player.losses}
                </p>
                <p className="text-xs text-red-500/70 font-bold mt-1.5 uppercase tracking-wider">Lose</p>
              </div>
            </div>
          </div>

          {/* Sub stats bar */}
          {totalGames > 0 && (
            <div className="flex items-center justify-center gap-6 mt-3 pt-3 border-t border-stone-200">
              <div className="flex items-center gap-1.5 text-xs text-stone-500">
                <SwordsIcon className="w-3.5 h-3.5" />
                <span>{totalGames} Games</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-stone-500">
                <ChartIcon className="w-3.5 h-3.5" />
                <span>{winRate}% Win Rate</span>
              </div>
            </div>
          )}

          {/* Current streak */}
          {(player.currentStreak ?? 0) >= 2 && (
            <div className="text-center mt-3 pt-3 border-t border-stone-200">
              <p className="text-amber-500 font-black text-lg animate-pulse">
                ★ {player.currentStreak}連勝中!
              </p>
            </div>
          )}

          {/* Max streak (show when tournament finished or no current streak) */}
          {isFinished && (player.maxStreak ?? 0) >= 2 && (
            <div className="text-center mt-2">
              <p className="text-xs text-stone-500">
                最大連勝: <span className="text-amber-500 font-bold">{player.maxStreak}</span>
              </p>
            </div>
          )}

          {/* Google link / history */}
          <div className="mt-3 pt-3 border-t border-stone-200 flex items-center justify-center gap-3">
            {!player.googleUid ? (
              <button
                onClick={handleLinkGoogle}
                disabled={linkingGoogle}
                className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-900 transition-colors disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {linkingGoogle ? '連携中...' : 'Google連携'}
              </button>
            ) : (
              <button
                onClick={loadPastRecords}
                disabled={loadingHistory}
                className="flex items-center gap-1.5 text-xs text-emerald-500/80 hover:text-emerald-400 transition-colors disabled:opacity-50"
              >
                <ChartIcon className="w-3.5 h-3.5" />
                {loadingHistory ? '読み込み中...' : '過去の大会戦績'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dropped banner */}
      {player.dropped && !isFinished && (
        <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-2xl shadow-sm text-center">
          <XCircleIcon className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-lg font-bold text-red-500">ドロップ済み</p>
          <p className="text-sm text-red-500/70 mt-1">大会から棄権しました。復帰するにはホストに依頼してください。</p>
        </div>
      )}

      {/* Post-match seat keep decision */}
      {postMatchInfo && !currentMatch && !isFinished && (
        <div className="mb-5">
          {postMatchInfo.isStayer && !seatDecided ? (
            // Stayer gets to choose: stay or leave
            <div className="bg-gradient-to-b from-amber-50 to-amber-50/50 border border-amber-300 rounded-2xl shadow-sm p-5 text-center">
              <CheckCircleIcon className="w-8 h-8 text-amber-500 mx-auto mb-2" />
              <p className="text-lg font-bold mb-1">
                {postMatchInfo.winnerId === playerId ? '勝利！' : '対戦終了'}
              </p>
              <p className="text-sm text-stone-600 mb-4">
                この卓で次の対戦を待ちますか？
              </p>

              {/* Countdown for loser-stays */}
              {seatCountdown > 0 && (
                <div className="mb-4">
                  <div className="w-full bg-stone-200 rounded-full h-2 mb-1.5">
                    <div
                      className="bg-amber-500 h-2 rounded-full transition-all duration-1000"
                      style={{ width: `${(seatCountdown / 25) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-stone-500">
                    残り{seatCountdown}秒 — 何もしなければ自動で続行します
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleSeatChoice(true)}
                  className="py-3 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold transition-colors text-sm"
                >
                  続ける
                </button>
                <button
                  onClick={() => handleSeatChoice(false)}
                  className="py-3 bg-stone-200 hover:bg-stone-200 rounded-xl font-bold transition-colors text-sm"
                >
                  離席する
                </button>
              </div>
            </div>
          ) : seatDecided && !postMatchInfo.isStayer ? (
            // Non-stayer: forced to leave
            <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-5 text-center">
              <p className="text-sm text-stone-600 mb-3">
                {postMatchInfo.winnerId === playerId ? '勝利！' : '対戦結果が登録されました'}
              </p>
              <button
                onClick={() => { setPostMatchInfo(null); }}
                className="w-full py-3 bg-orange-500 hover:bg-orange-400 rounded-xl font-bold transition-colors text-sm"
              >
                マッチングに戻る
              </button>
            </div>
          ) : seatDecided && postMatchInfo.isStayer ? (
            // Stayer decided to stay - waiting for next opponent
            <div className="bg-gradient-to-b from-amber-50 to-white border border-amber-200 rounded-2xl shadow-sm p-5 text-center">
              <div className="mb-3">
                <div className="relative w-16 h-16 mx-auto">
                  <div className="absolute inset-0 rounded-full bg-amber-100 animate-ping" />
                  <div className="absolute inset-2 rounded-full bg-amber-200 animate-pulse" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <SearchIcon className="w-7 h-7 text-amber-500" />
                  </div>
                </div>
              </div>
              <p className="text-lg font-bold text-amber-600">卓キープ中</p>
              <p className="text-sm text-stone-500 mt-1">Table {postMatchInfo.tableNumber} で次の相手を待っています...</p>
              <button
                onClick={async () => {
                  if (tournamentId && playerId) {
                    await leaveMatchingQueue(tournamentId, playerId);
                  }
                  setPostMatchInfo(null);
                }}
                className="mt-4 w-full py-2 bg-stone-200 hover:bg-stone-200 rounded-xl text-sm font-bold transition-colors text-stone-600"
              >
                離席する
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Matching / Battle area */}
      {!isFinished && !player.dropped && !postMatchInfo && (
        <div className="mb-6">
          {currentMatch ? (() => {
            const bestOf = currentMatch.bestOf ?? 1;
            const games = currentMatch.games ?? [];
            const opponentId = getOpponentId(currentMatch);
            const opponentName = getPlayerName(opponentId);
            const myWins = games.filter((g) => g.winnerId === playerId).length;
            const oppWins = games.filter((g) => g.winnerId === opponentId).length;
            const gameNum = games.length + 1;
            const isBo = bestOf > 1;
            const timerSeconds = (currentMatch as Match & { timerSeconds?: number }).timerSeconds ?? tournament.timerMinutes * 60;

            return (
            /* In battle */
            <div className="bg-gradient-to-b from-orange-50 to-orange-50/50 border border-orange-300 rounded-2xl shadow-sm p-5">
              {/* Header: Table + BO info */}
              <div className="flex items-center justify-center gap-2 mb-4">
                <SwordsIcon className="w-4 h-4 text-orange-500" />
                <span className="text-xs font-bold bg-orange-500 px-3 py-1 rounded-full uppercase tracking-wider text-white">
                  Table {currentMatch.tableNumber}
                  {isBo && ` – BO${bestOf}`}
                </span>
                {isBo && (
                  <span className="text-xs font-bold bg-stone-200 px-2 py-0.5 rounded-full text-stone-600">
                    Game {gameNum}
                  </span>
                )}
              </div>

              {/* Player names + score (visible for timer display on table) */}
              <div className="text-center mb-3">
                {isBo ? (
                  <div className="flex items-center justify-center gap-4 mb-2">
                    <div className="text-center">
                      <p className="text-sm font-bold">{player.displayName}</p>
                      <p className="text-3xl font-black tabular-nums text-emerald-500">{myWins}</p>
                    </div>
                    <span className="text-2xl font-thin text-stone-300">-</span>
                    <div className="text-center">
                      <p className="text-sm font-bold">{opponentName}</p>
                      <p className="text-3xl font-black tabular-nums text-red-500">{oppWins}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-stone-500 mb-1">VS</p>
                    <p className="text-xl font-bold">{opponentName}</p>
                  </>
                )}
              </div>

              {/* Timer */}
              <div className="text-center mb-3">
                {correctionMode ? (
                  <p className="text-lg font-bold text-amber-500">タイマー停止中</p>
                ) : (
                  <Timer endTime={currentMatch.startedAt.toMillis() + timerSeconds * 1000} />
                )}
                <p className="text-xs text-stone-400 mt-1">
                  {correctionMode ? '修正が完了するとタイマーが再開します' : '※ 対戦準備時間を含めた時間です'}
                </p>
              </div>

              {/* Correction mode */}
              {correctionMode ? (
                <div className="mt-5 pt-4 border-t border-amber-200">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <span className="text-amber-500 font-bold text-sm">修正中</span>
                  </div>
                  <div className="space-y-2 mb-4">
                    {games.map((g, i) => {
                      const isMyWin = g.winnerId === playerId;
                      return (
                        <div key={i} className="flex items-center justify-between bg-white rounded-xl p-3 border border-stone-200 shadow-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-stone-400 font-bold">Game {i + 1}</span>
                            <TrophyIcon className="w-4 h-4 text-amber-500" />
                            <span className="text-sm font-bold">
                              {isMyWin ? player.displayName : opponentName}
                            </span>
                          </div>
                          <button
                            onClick={() => handleCorrectGame(i)}
                            className="px-3 py-1 bg-amber-500 hover:bg-amber-400 rounded-lg text-xs font-bold transition-colors"
                          >
                            変更
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setCorrectionMode(false)}
                    className="w-full py-3 bg-stone-200 hover:bg-stone-200 rounded-xl font-bold text-sm transition-colors"
                  >
                    修正完了
                  </button>
                </div>
              ) : (
                /* Normal game reporting */
                <div className="mt-5 pt-4 border-t border-orange-200">
                  <p className="text-center text-sm text-stone-600 mb-3 font-bold flex items-center justify-center gap-1.5">
                    <TrophyIcon className="w-4 h-4 text-amber-500" />
                    {isBo ? `Game ${gameNum} の勝者を選択` : '勝者を選択'}
                  </p>

                  {!selectedGameWinner ? (
                    <div className="space-y-2.5">
                      <button
                        onClick={() => setSelectedGameWinner(playerId!)}
                        className="w-full py-4 bg-white hover:bg-emerald-50 rounded-xl font-bold text-base transition-all border border-stone-200 hover:border-emerald-300 shadow-sm group"
                      >
                        <span className="flex items-center justify-center gap-2">
                          <TrophyIcon className="w-5 h-5 text-stone-400 group-hover:text-amber-500 transition-colors" />
                          {player.displayName}
                        </span>
                        <span className="block text-xs text-stone-400 font-normal mt-0.5">自分</span>
                      </button>
                      <button
                        onClick={() => setSelectedGameWinner(opponentId)}
                        className="w-full py-4 bg-white hover:bg-emerald-50 rounded-xl font-bold text-base transition-all border border-stone-200 hover:border-emerald-300 shadow-sm group"
                      >
                        <span className="flex items-center justify-center gap-2">
                          <TrophyIcon className="w-5 h-5 text-stone-400 group-hover:text-amber-500 transition-colors" />
                          {opponentName}
                        </span>
                        <span className="block text-xs text-stone-400 font-normal mt-0.5">対戦相手</span>
                      </button>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl p-4 border border-stone-200 shadow-sm">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <TrophyIcon className="w-5 h-5 text-amber-500" />
                        <p className="text-lg font-bold">
                          {selectedGameWinner === playerId ? player.displayName : opponentName}
                        </p>
                      </div>
                      <p className="text-center text-sm text-emerald-500 mb-4">
                        {isBo ? `Game ${gameNum} の勝利でよろしいですか？` : 'の勝利でよろしいですか？'}
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setSelectedGameWinner(null)}
                          disabled={reporting}
                          className="py-3 bg-stone-200 hover:bg-stone-200 disabled:opacity-50 rounded-xl font-bold transition-colors text-sm"
                        >
                          戻る
                        </button>
                        <button
                          onClick={() => handleReportGame(selectedGameWinner)}
                          disabled={reporting}
                          className="py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl font-bold transition-colors text-sm flex items-center justify-center gap-1.5"
                        >
                          <CheckCircleIcon className="w-4 h-4" />
                          {reporting ? '送信中...' : '確定'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Correction button (only when BO > 1 and at least 1 game recorded) */}
                  {isBo && games.length > 0 && !selectedGameWinner && (
                    <button
                      onClick={() => setCorrectionMode(true)}
                      className="w-full mt-3 py-2 text-xs text-stone-400 hover:text-amber-500 transition-colors"
                    >
                      結果を修正する
                    </button>
                  )}
                </div>
              )}
            </div>
            );
          })() : inQueue ? (
            /* Waiting in queue */
            <div className="text-center">
              <div className="bg-white rounded-2xl p-8 border border-stone-200 shadow-sm mb-3">
                <div className="mb-4">
                  <div className="relative w-20 h-20 mx-auto">
                    <div className="absolute inset-0 rounded-full bg-orange-500/20 animate-ping" />
                    <div className="absolute inset-2 rounded-full bg-orange-500/30 animate-pulse" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <SearchIcon className="w-8 h-8 text-orange-500" />
                    </div>
                  </div>
                </div>
                <p className="text-lg font-bold">マッチング中</p>
                <p className="text-sm text-stone-500 mt-1">対戦相手を探しています...</p>
              </div>
              <button
                onClick={handleCancelMatching}
                className="w-full py-3 bg-white hover:bg-stone-100 rounded-xl font-bold transition-colors border border-stone-200 shadow-sm flex items-center justify-center gap-2 text-stone-600"
              >
                <XCircleIcon className="w-4 h-4" />
                キャンセル
              </button>
            </div>
          ) : tournament.matchingDeadline && tournament.matchingDeadline.toMillis() < Date.now() ? (
            /* Deadline passed */
            <div className="text-center py-6 bg-white rounded-2xl border border-stone-200 shadow-sm">
              <ClockIcon className="w-8 h-8 text-stone-400 mx-auto mb-2" />
              <p className="text-lg font-bold text-stone-500">マッチング受付終了</p>
              <p className="text-sm text-stone-400 mt-1">最終マッチング時間を過ぎました</p>
            </div>
          ) : (
            /* Ready to match */
            <button
              onClick={handleStartMatching}
              className="w-full py-5 bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-400 hover:to-orange-300 rounded-2xl font-bold text-xl transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <SwordsIcon className="w-6 h-6" />
              マッチング開始
            </button>
          )}
        </div>
      )}

      {/* Ranking tab (after tournament ends) */}
      {isFinished && (
        <div className="mb-6">
          <div className="flex mb-4 bg-stone-100 rounded-xl p-1 shadow-sm">
            <button
              onClick={() => setShowRanking(false)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
                !showRanking ? 'bg-orange-500 text-white' : 'text-stone-500'
              }`}
            >
              <SwordsIcon className="w-4 h-4" />
              戦績
            </button>
            <button
              onClick={() => setShowRanking(true)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
                showRanking ? 'bg-orange-500 text-white' : 'text-stone-500'
              }`}
            >
              <ChartIcon className="w-4 h-4" />
              ランキング
            </button>
          </div>

          {showRanking && (
            <Ranking
              players={players}
              matches={allMatches}
              tournamentName={tournament.name}
              currentPlayerId={playerId}
            />
          )}
        </div>
      )}

      {/* Match history */}
      {(!isFinished || !showRanking) && matchHistory.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <ClockIcon className="w-3.5 h-3.5" />
            Match History
          </h3>
          <div className="space-y-2">
            {matchHistory.map((m, i) => {
              const opponentId = getOpponentId(m);
              const isWin = m.winnerId === playerId;
              const isOngoing = m.status === 'ongoing';
              return (
                <div key={m.id} className="bg-white rounded-xl p-3.5 border border-stone-200 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      isOngoing ? 'bg-blue-50 text-blue-500 border border-blue-200' :
                      isWin ? 'bg-emerald-50 text-emerald-500 border border-emerald-200' :
                      'bg-red-50 text-red-500 border border-red-200'
                    }`}>
                      {matchHistory.length - i}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{getPlayerName(opponentId)}</p>
                      <p className="text-xs text-stone-400">
                        Table {m.tableNumber}
                      </p>
                    </div>
                  </div>
                  {isOngoing ? (
                    <span className="text-xs font-bold bg-blue-50 text-blue-500 px-3 py-1 rounded-full border border-blue-200 flex items-center gap-1">
                      <SwordsIcon className="w-3 h-3" />
                      LIVE
                    </span>
                  ) : (
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                      isWin
                        ? 'bg-emerald-50 text-emerald-500 border border-emerald-200'
                        : 'bg-red-50 text-red-500 border border-red-200'
                    }`}>
                      {isWin ? 'WIN' : 'LOSE'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Past tournament records */}
      {showHistory && pastRecords.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
              <ChartIcon className="w-3.5 h-3.5" />
              Past Tournaments
            </h3>
            <button
              onClick={() => setShowHistory(false)}
              className="text-xs text-stone-400 hover:text-stone-600"
            >
              閉じる
            </button>
          </div>
          <div className="space-y-2">
            {pastRecords.map((r, i) => (
              <div key={i} className="bg-white rounded-xl p-3.5 border border-stone-200 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold">{r.tournamentName}</p>
                  <p className="text-xs text-stone-400">{r.date}</p>
                </div>
                <div className="flex items-center gap-1 text-sm font-bold">
                  <span className="text-emerald-500">{r.wins}</span>
                  <span className="text-stone-300">-</span>
                  <span className="text-red-500">{r.losses}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {showHistory && pastRecords.length === 0 && !loadingHistory && (
        <div className="mt-6 text-center py-4 bg-white rounded-xl border border-stone-200 shadow-sm">
          <p className="text-sm text-stone-500">過去の大会戦績はありません</p>
        </div>
      )}

      {/* Drop button */}
      {!isFinished && !player.dropped && !currentMatch && (
        <div className="mt-8 pt-4 border-t border-stone-200">
          <button
            onClick={handleDrop}
            disabled={dropping}
            className="w-full py-3 text-sm font-bold text-red-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <XCircleIcon className="w-4 h-4" />
            {dropping ? 'ドロップ中...' : 'ドロップ（棄権）する'}
          </button>
        </div>
      )}
    </Layout>
  );
}

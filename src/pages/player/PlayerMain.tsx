import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc, collection, onSnapshot, query, orderBy, where, getDocs,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Tournament, Player, Match } from '../../lib/types';
import {
  joinMatchingQueue,
  leaveMatchingQueue,
  reportResult,
  tryMatchAllPlayers,
  subscribeToPlayerMatch,
  subscribeToPlayerInQueue,
} from '../../lib/matchingService';
import Layout from '../../components/Layout';
import Timer from '../../components/Timer';
import Ranking from '../../components/Ranking';

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
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);

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
      if (snap.exists()) setPlayer({ id: snap.id, ...snap.data() } as Player);
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

  // Subscribe to current match
  useEffect(() => {
    if (!tournamentId || !playerId) return;
    const unsub = subscribeToPlayerMatch(tournamentId, playerId, (match) => {
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

  const handleReport = useCallback(async (winnerId: string) => {
    if (!tournamentId || !currentMatch || reporting) return;
    setReporting(true);
    try {
      await reportResult(tournamentId, currentMatch.id, winnerId);
    } finally {
      setReporting(false);
      setSelectedWinner(null);
    }
  }, [tournamentId, currentMatch, reporting]);

  const getPlayerName = (id: string) => players.find((p) => p.id === id)?.displayName ?? '???';
  const getOpponentId = (match: Match) =>
    match.player1Id === playerId ? match.player2Id : match.player1Id;

  if (!tournament || !player) {
    return <Layout><p className="text-center py-16 text-slate-400">...</p></Layout>;
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
          {tournament.hostName && (
            <p className="text-xs text-slate-500 mt-0.5">hosted by {tournament.hostName}</p>
          )}
        </div>
        <button
          onClick={() => {
            localStorage.removeItem(`gunmatch_player_${tournamentId}`);
            navigate(`/entry/${tournamentId}`, { replace: true });
          }}
          className="ml-2 p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors shrink-0"
          title="退室"
        >
          <LogOutIcon className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Main Stats Card - Hero Section */}
      <div className="relative bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 rounded-2xl border border-slate-700/80 mb-5 overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-indigo-600/10 rounded-full blur-2xl" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-emerald-600/10 rounded-full blur-2xl" />
        </div>

        <div className="relative p-5">
          {/* Player name + badge */}
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center">
              <ShieldIcon className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <p className="font-bold text-base leading-tight">{player.displayName}</p>
              {tournament.description && (
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{tournament.description}</p>
              )}
            </div>
          </div>

          {/* Win - Loss big display */}
          <div className="text-center py-3">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-2 font-medium">Current Record</p>
            <div className="flex items-center justify-center gap-3">
              <div className="text-right">
                <p className="text-5xl font-black tabular-nums text-emerald-400 leading-none drop-shadow-[0_0_12px_rgba(52,211,153,0.3)]">
                  {player.wins}
                </p>
                <p className="text-xs text-emerald-400/70 font-bold mt-1.5 uppercase tracking-wider">Win</p>
              </div>
              <div className="flex flex-col items-center px-2">
                <span className="text-3xl font-thin text-slate-600 leading-none">-</span>
              </div>
              <div className="text-left">
                <p className="text-5xl font-black tabular-nums text-red-400 leading-none drop-shadow-[0_0_12px_rgba(248,113,113,0.3)]">
                  {player.losses}
                </p>
                <p className="text-xs text-red-400/70 font-bold mt-1.5 uppercase tracking-wider">Lose</p>
              </div>
            </div>
          </div>

          {/* Sub stats bar */}
          {totalGames > 0 && (
            <div className="flex items-center justify-center gap-6 mt-3 pt-3 border-t border-slate-700/60">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <SwordsIcon className="w-3.5 h-3.5" />
                <span>{totalGames} Games</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <ChartIcon className="w-3.5 h-3.5" />
                <span>{winRate}% Win Rate</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Matching / Battle area */}
      {!isFinished && (
        <div className="mb-6">
          {currentMatch ? (
            /* In battle */
            <div className="bg-gradient-to-b from-indigo-900/50 to-indigo-950/30 border border-indigo-500/40 rounded-2xl p-5">
              <div className="flex items-center justify-center gap-2 mb-4">
                <SwordsIcon className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold bg-indigo-600/80 px-3 py-1 rounded-full uppercase tracking-wider">
                  Table {currentMatch.tableNumber}
                </span>
              </div>
              <div className="text-center mb-3">
                <p className="text-xs text-slate-400 mb-1">VS</p>
                <p className="text-xl font-bold">{getPlayerName(getOpponentId(currentMatch))}</p>
              </div>
              <div className="text-center mb-3">
                <Timer
                  endTime={currentMatch.startedAt.toMillis() + ((currentMatch as Match & { timerSeconds?: number }).timerSeconds ?? tournament.timerMinutes * 60) * 1000}
                />
                <p className="text-xs text-slate-500 mt-1">※ 対戦準備時間を含めた時間です</p>
              </div>

              {/* Result reporting */}
              <div className="mt-5 pt-4 border-t border-indigo-500/20">
                <p className="text-center text-sm text-slate-300 mb-3 font-bold flex items-center justify-center gap-1.5">
                  <TrophyIcon className="w-4 h-4 text-amber-400" />
                  勝者を選択
                </p>

                {!selectedWinner ? (
                  <div className="space-y-2.5">
                    <button
                      onClick={() => setSelectedWinner(playerId!)}
                      className="w-full py-4 bg-slate-800/80 hover:bg-emerald-900/60 rounded-xl font-bold text-base transition-all border border-slate-700 hover:border-emerald-500/60 group"
                    >
                      <span className="flex items-center justify-center gap-2">
                        <TrophyIcon className="w-5 h-5 text-slate-500 group-hover:text-amber-400 transition-colors" />
                        {player.displayName}
                      </span>
                      <span className="block text-xs text-slate-500 font-normal mt-0.5">自分</span>
                    </button>
                    <button
                      onClick={() => setSelectedWinner(getOpponentId(currentMatch))}
                      className="w-full py-4 bg-slate-800/80 hover:bg-emerald-900/60 rounded-xl font-bold text-base transition-all border border-slate-700 hover:border-emerald-500/60 group"
                    >
                      <span className="flex items-center justify-center gap-2">
                        <TrophyIcon className="w-5 h-5 text-slate-500 group-hover:text-amber-400 transition-colors" />
                        {getPlayerName(getOpponentId(currentMatch))}
                      </span>
                      <span className="block text-xs text-slate-500 font-normal mt-0.5">対戦相手</span>
                    </button>
                  </div>
                ) : (
                  <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-600/50">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <TrophyIcon className="w-5 h-5 text-amber-400" />
                      <p className="text-lg font-bold">
                        {selectedWinner === playerId
                          ? player.displayName
                          : getPlayerName(getOpponentId(currentMatch))}
                      </p>
                    </div>
                    <p className="text-center text-sm text-emerald-400 mb-4">の勝利でよろしいですか？</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setSelectedWinner(null)}
                        disabled={reporting}
                        className="py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-xl font-bold transition-colors text-sm"
                      >
                        戻る
                      </button>
                      <button
                        onClick={() => handleReport(selectedWinner)}
                        disabled={reporting}
                        className="py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl font-bold transition-colors text-sm flex items-center justify-center gap-1.5"
                      >
                        <CheckCircleIcon className="w-4 h-4" />
                        {reporting ? '送信中...' : '確定'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : inQueue ? (
            /* Waiting in queue */
            <div className="text-center">
              <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700 mb-3">
                <div className="mb-4">
                  <div className="relative w-20 h-20 mx-auto">
                    <div className="absolute inset-0 rounded-full bg-indigo-600/20 animate-ping" />
                    <div className="absolute inset-2 rounded-full bg-indigo-600/30 animate-pulse" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <SearchIcon className="w-8 h-8 text-indigo-400" />
                    </div>
                  </div>
                </div>
                <p className="text-lg font-bold">マッチング中</p>
                <p className="text-sm text-slate-400 mt-1">対戦相手を探しています...</p>
              </div>
              <button
                onClick={handleCancelMatching}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold transition-colors border border-slate-700 flex items-center justify-center gap-2 text-slate-300"
              >
                <XCircleIcon className="w-4 h-4" />
                キャンセル
              </button>
            </div>
          ) : tournament.matchingDeadline && tournament.matchingDeadline.toMillis() < Date.now() ? (
            /* Deadline passed */
            <div className="text-center py-6 bg-slate-800 rounded-2xl border border-slate-700">
              <ClockIcon className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-lg font-bold text-slate-400">マッチング受付終了</p>
              <p className="text-sm text-slate-500 mt-1">最終マッチング時間を過ぎました</p>
            </div>
          ) : (
            /* Ready to match */
            <button
              onClick={handleStartMatching}
              className="w-full py-5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 rounded-2xl font-bold text-xl transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 active:scale-[0.98]"
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
          <div className="flex mb-4 bg-slate-800 rounded-xl p-1">
            <button
              onClick={() => setShowRanking(false)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
                !showRanking ? 'bg-indigo-600 text-white' : 'text-slate-400'
              }`}
            >
              <SwordsIcon className="w-4 h-4" />
              戦績
            </button>
            <button
              onClick={() => setShowRanking(true)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
                showRanking ? 'bg-indigo-600 text-white' : 'text-slate-400'
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
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <ClockIcon className="w-3.5 h-3.5" />
            Match History
          </h3>
          <div className="space-y-2">
            {matchHistory.map((m, i) => {
              const opponentId = getOpponentId(m);
              const isWin = m.winnerId === playerId;
              const isOngoing = m.status === 'ongoing';
              return (
                <div key={m.id} className="bg-slate-800/80 rounded-xl p-3.5 border border-slate-700/60 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      isOngoing ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' :
                      isWin ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' :
                      'bg-red-600/20 text-red-400 border border-red-500/30'
                    }`}>
                      {matchHistory.length - i}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{getPlayerName(opponentId)}</p>
                      <p className="text-xs text-slate-500">
                        Table {m.tableNumber}
                      </p>
                    </div>
                  </div>
                  {isOngoing ? (
                    <span className="text-xs font-bold bg-blue-600/20 text-blue-400 px-3 py-1 rounded-full border border-blue-500/30 flex items-center gap-1">
                      <SwordsIcon className="w-3 h-3" />
                      LIVE
                    </span>
                  ) : (
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                      isWin
                        ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-red-600/20 text-red-400 border border-red-500/30'
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
    </Layout>
  );
}

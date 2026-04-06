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
  subscribeToPlayerMatch,
  subscribeToPlayerInQueue,
} from '../../lib/matchingService';
import Layout from '../../components/Layout';
import Timer from '../../components/Timer';
import Ranking from '../../components/Ranking';

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
        // Vibrate on match found
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
    return <Layout><p className="text-center py-16 text-slate-400">読み込み中...</p></Layout>;
  }

  const isFinished = tournament.status === 'finished';

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h1 className="text-xl font-bold">{tournament.name}</h1>
          {tournament.hostName && (
            <p className="text-xs text-slate-500 mt-0.5">主催: {tournament.hostName}</p>
          )}
          {tournament.description && (
            <p className="text-xs text-slate-400 mt-1 whitespace-pre-wrap">{tournament.description}</p>
          )}
        </div>
        <button
          onClick={() => {
            localStorage.removeItem(`gunmatch_player_${tournamentId}`);
            navigate(`/entry/${tournamentId}`, { replace: true });
          }}
          className="ml-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs transition-colors shrink-0"
        >
          退室
        </button>
      </div>

      {/* My stats */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">プレイヤー</p>
            <p className="text-lg font-bold">{player.displayName}</p>
          </div>
          <div className="flex gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-emerald-400">{player.wins}</p>
              <p className="text-xs text-slate-400">WIN</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-400">{player.losses}</p>
              <p className="text-xs text-slate-400">LOSE</p>
            </div>
          </div>
        </div>
      </div>

      {/* Matching / Battle area */}
      {!isFinished && (
        <div className="mb-6">
          {currentMatch ? (
            /* In battle */
            <div className="bg-indigo-900/40 border border-indigo-600 rounded-xl p-5">
              <div className="text-center mb-3">
                <span className="text-xs bg-indigo-600 px-3 py-1 rounded-full">
                  卓 {currentMatch.tableNumber}
                </span>
              </div>
              <div className="text-center mb-2">
                <p className="text-sm text-slate-400 mb-1">対戦相手</p>
                <p className="text-xl font-bold">{getPlayerName(getOpponentId(currentMatch))}</p>
              </div>
              <div className="text-center mb-2">
                <Timer
                  endTime={currentMatch.startedAt.toMillis() + ((currentMatch as Match & { timerSeconds?: number }).timerSeconds ?? tournament.timerMinutes * 60) * 1000}
                />
                <p className="text-xs text-slate-500 mt-1">※ 対戦準備時間を含めた時間です</p>
              </div>

              {/* Result reporting: select winner by name */}
              <div className="mt-4">
                <p className="text-center text-sm text-slate-300 mb-3 font-bold">勝者を選択してください</p>

                {!selectedWinner ? (
                  /* Step 1: Select winner */
                  <div className="space-y-3">
                    <button
                      onClick={() => setSelectedWinner(playerId!)}
                      className="w-full py-4 bg-slate-700 hover:bg-emerald-700 rounded-xl font-bold text-lg transition-colors border-2 border-transparent hover:border-emerald-500"
                    >
                      🏆 {player.displayName}
                      <span className="block text-xs text-slate-400 font-normal mt-0.5">自分</span>
                    </button>
                    <button
                      onClick={() => setSelectedWinner(getOpponentId(currentMatch))}
                      className="w-full py-4 bg-slate-700 hover:bg-emerald-700 rounded-xl font-bold text-lg transition-colors border-2 border-transparent hover:border-emerald-500"
                    >
                      🏆 {getPlayerName(getOpponentId(currentMatch))}
                      <span className="block text-xs text-slate-400 font-normal mt-0.5">対戦相手</span>
                    </button>
                  </div>
                ) : (
                  /* Step 2: Confirm */
                  <div className="bg-slate-800 rounded-xl p-4 border border-slate-600">
                    <p className="text-center text-lg font-bold mb-1">
                      {selectedWinner === playerId
                        ? player.displayName
                        : getPlayerName(getOpponentId(currentMatch))}
                    </p>
                    <p className="text-center text-sm text-emerald-400 mb-4">の勝利でよろしいですか？</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setSelectedWinner(null)}
                        disabled={reporting}
                        className="py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-xl font-bold transition-colors"
                      >
                        戻る
                      </button>
                      <button
                        onClick={() => handleReport(selectedWinner)}
                        disabled={reporting}
                        className="py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl font-bold transition-colors"
                      >
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
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-3">
                <div className="animate-pulse mb-3">
                  <div className="w-16 h-16 mx-auto rounded-full bg-indigo-600/30 flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/50 animate-ping" />
                  </div>
                </div>
                <p className="text-lg font-bold">マッチング待機中...</p>
                <p className="text-sm text-slate-400 mt-1">対戦相手を探しています</p>
              </div>
              <button
                onClick={handleCancelMatching}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold transition-colors"
              >
                キャンセル
              </button>
            </div>
          ) : tournament.matchingDeadline && tournament.matchingDeadline.toMillis() < Date.now() ? (
            /* Deadline passed */
            <div className="text-center py-5 bg-slate-800 rounded-xl border border-slate-700">
              <p className="text-lg font-bold text-slate-400">マッチング受付終了</p>
              <p className="text-sm text-slate-500 mt-1">最終マッチング時間を過ぎました</p>
            </div>
          ) : (
            /* Ready to match */
            <button
              onClick={handleStartMatching}
              className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-xl transition-colors shadow-lg shadow-indigo-600/30"
            >
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
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                !showRanking ? 'bg-indigo-600' : 'text-slate-400'
              }`}
            >
              戦績
            </button>
            <button
              onClick={() => setShowRanking(true)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                showRanking ? 'bg-indigo-600' : 'text-slate-400'
              }`}
            >
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
          <h3 className="text-sm font-bold text-slate-300 mb-2">戦績履歴</h3>
          <div className="space-y-2">
            {matchHistory.map((m, i) => {
              const opponentId = getOpponentId(m);
              const isWin = m.winnerId === playerId;
              const isOngoing = m.status === 'ongoing';
              return (
                <div key={m.id} className="bg-slate-800 rounded-xl p-3 border border-slate-700 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500">第{matchHistory.length - i}戦</span>
                    <p className="text-sm font-bold">{getPlayerName(opponentId)}</p>
                  </div>
                  {isOngoing ? (
                    <span className="text-xs bg-blue-600 px-2 py-0.5 rounded-full">対戦中</span>
                  ) : (
                    <span className={`text-sm font-bold ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
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

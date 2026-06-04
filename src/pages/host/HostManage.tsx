import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc, collection, onSnapshot, updateDoc, setDoc, query, orderBy,
  Timestamp, getDocs, where, deleteDoc, runTransaction,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Tournament, Player, Match } from '../../lib/types';
import { tryMatchAllPlayers, joinMatchingQueue, reportResult } from '../../lib/matchingService';
import { createTournamentPlayer } from '../../lib/playerService';
import Layout from '../../components/Layout';
import Timer from '../../components/Timer';
import Ranking from '../../components/Ranking';
import QRCodeDisplay from '../../components/QRCodeDisplay';
import { DUMMY_NAMES } from '../../lib/dummyNames';
import CardGameBadge from '../../components/CardGameBadge';

export default function HostManage() {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [showQR, setShowQR] = useState(false);
  const [proxyName, setProxyName] = useState('');
  const [dummyCount, setDummyCount] = useState(10);
  const [editingMatch, setEditingMatch] = useState<string | null>(null);
  const [showRanking, setShowRanking] = useState(false);
  const [queuePlayerIds, setQueuePlayerIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!tournamentId) return;
    const unsub = onSnapshot(doc(db, 'tournaments', tournamentId), (snap) => {
      if (snap.exists()) setTournament({ id: snap.id, ...snap.data() } as Tournament);
    });
    return unsub;
  }, [tournamentId]);

  useEffect(() => {
    if (!tournamentId) return;
    const q = query(collection(db, 'tournaments', tournamentId, 'players'), orderBy('entryNumber', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Player)));
    });
    return unsub;
  }, [tournamentId]);

  useEffect(() => {
    if (!tournamentId) return;
    const q = query(collection(db, 'tournaments', tournamentId, 'matches'), orderBy('startedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Match)));
    });
    return unsub;
  }, [tournamentId]);

  // Subscribe to queue to know which players are waiting
  useEffect(() => {
    if (!tournamentId) return;
    const unsub = onSnapshot(collection(db, 'tournaments', tournamentId, 'queue'), (snap) => {
      setQueuePlayerIds(new Set(snap.docs.map((d) => d.data().playerId)));
    });
    return unsub;
  }, [tournamentId]);

  const ongoingPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of matches) {
      if (m.status === 'ongoing') {
        ids.add(m.player1Id);
        ids.add(m.player2Id);
      }
    }
    return ids;
  }, [matches]);

  // Auto-matching: run on queue/table availability changes instead of polling.
  useEffect(() => {
    if (!tournamentId || !tournament || tournament.status !== 'active' || queuePlayerIds.size < 2) return;

    const now = Date.now();
    let usedTables = 0;
    let earliestBufferEnd = Number.POSITIVE_INFINITY;
    for (const m of matches) {
      if (m.status === 'ongoing') {
        usedTables++;
      } else if (m.status === 'finished' && m.bufferUntil && m.bufferUntil.toMillis() > now) {
        usedTables++;
        earliestBufferEnd = Math.min(earliestBufferEnd, m.bufferUntil.toMillis());
      }
    }

    const delayMs = usedTables < tournament.tableCount
      ? 100
      : Number.isFinite(earliestBufferEnd)
        ? Math.max(500, earliestBufferEnd - now + 200)
        : 5000;

    const timer = window.setTimeout(async () => {
      try {
        await tryMatchAllPlayers(tournamentId);
      } catch { /* ignore */ }
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [tournamentId, tournament, queuePlayerIds, matches]);

  const toggleEntry = async () => {
    if (!tournamentId || !tournament) return;
    const newStatus = tournament.entryOpen ? false : true;
    await updateDoc(doc(db, 'tournaments', tournamentId), {
      entryOpen: newStatus,
      status: newStatus ? 'active' : tournament.status,
    });
  };

  const addProxyPlayer = async () => {
    if (!tournamentId || !proxyName.trim()) return;
    await createTournamentPlayer(tournamentId, {
      displayName: proxyName.trim(),
      xId: null,
      googleUid: null,
      authUid: null,
      wins: 0,
      losses: 0,
      currentStreak: 0,
      maxStreak: 0,
      isProxy: true,
      dropped: false,
    });
    setProxyName('');
  };

  const addDummyPlayers = async () => {
    if (!tournamentId) return;
    const shuffled = [...DUMMY_NAMES].sort(() => Math.random() - 0.5);
    const names = shuffled.slice(0, dummyCount);
    for (const name of names) {
      await createTournamentPlayer(tournamentId, {
        displayName: name,
        xId: null,
        googleUid: null,
        authUid: null,
        wins: 0,
        losses: 0,
        currentStreak: 0,
        maxStreak: 0,
        isProxy: true,
        dropped: false,
      });
    }
  };

  const startDummyAutoPlay = useCallback(async () => {
    if (!tournamentId || !tournament?.isTest) return;
    // Add all non-dropped dummy players to queue, then auto-report results
    const activePlayers = players.filter((p) => p.isProxy && !p.dropped);

    for (const p of activePlayers) {
      const queueDocRef = doc(db, 'tournaments', tournamentId, 'queue', p.id);
      // Check if player is in an ongoing match
      const matchesRef = collection(db, 'tournaments', tournamentId, 'matches');
      const m1 = await getDocs(query(matchesRef, where('player1Id', '==', p.id), where('status', '==', 'ongoing')));
      const m2 = await getDocs(query(matchesRef, where('player2Id', '==', p.id), where('status', '==', 'ongoing')));
      if (m1.empty && m2.empty) {
        await setDoc(queueDocRef, {
          playerId: p.id,
          playerName: p.displayName,
          queuedByUid: null,
          joinedAt: Timestamp.now(),
          retainTable: null,
        });
      }
    }
    await tryMatchAllPlayers(tournamentId);
  }, [tournamentId, tournament?.isTest, players]);

  const autoReportResults = useCallback(async () => {
    if (!tournamentId || !tournament?.isTest) return;
    const ongoingMatches = matches.filter((m) => m.status === 'ongoing');
    for (const m of ongoingMatches) {
      const winnerId = Math.random() > 0.5 ? m.player1Id : m.player2Id;
      await reportResult(tournamentId, m.id, winnerId);
    }
  }, [tournamentId, tournament, matches]);

  const finishTournament = async () => {
    if (!tournamentId) return;
    // Clear queue
    const queueSnap = await getDocs(collection(db, 'tournaments', tournamentId, 'queue'));
    for (const d of queueSnap.docs) await deleteDoc(d.ref);
    await updateDoc(doc(db, 'tournaments', tournamentId), {
      status: 'finished',
      entryOpen: false,
    });
  };

  const updateMatchWinner = async (matchId: string, winnerId: string) => {
    if (!tournamentId) return;
    const matchRef = doc(db, 'tournaments', tournamentId, 'matches', matchId);

    // Wrapped in a transaction so the reverse-old + apply-new + match update
    // is atomic. Two hosts (or host + auto-correction) can no longer race and
    // leave wins/losses in an inconsistent state.
    try {
      await runTransaction(db, async (tx) => {
        const matchSnap = await tx.get(matchRef);
        if (!matchSnap.exists()) return;
        const matchData = matchSnap.data();

        const oldWinner = matchData.winnerId;
        if (oldWinner === winnerId) return; // No-op — same winner

        const newLoserId = matchData.player1Id === winnerId ? matchData.player2Id : matchData.player1Id;

        // Pre-read every player doc this transaction needs (Firestore requires
        // all reads before any writes). Dedupe via a map since old & new pairs
        // share the same two player docs when correcting a result.
        const oldLoserId: string | null = oldWinner
          ? (matchData.player1Id === oldWinner ? matchData.player2Id : matchData.player1Id)
          : null;
        const idsToRead = new Set<string>([winnerId, newLoserId]);
        if (oldWinner && oldLoserId) {
          idsToRead.add(oldWinner);
          idsToRead.add(oldLoserId);
        }

        const playerSnaps: Record<string, { ref: ReturnType<typeof doc>; data: Record<string, unknown> | null }> = {};
        for (const id of idsToRead) {
          const ref = doc(db, 'tournaments', tournamentId, 'players', id);
          const snap = await tx.get(ref);
          playerSnaps[id] = { ref, data: snap.exists() ? (snap.data() as Record<string, unknown>) : null };
        }

        // Compute net wins/losses delta per player
        const winsDelta: Record<string, number> = {};
        const lossesDelta: Record<string, number> = {};
        if (oldWinner && oldLoserId) {
          winsDelta[oldWinner] = (winsDelta[oldWinner] ?? 0) - 1;
          lossesDelta[oldLoserId] = (lossesDelta[oldLoserId] ?? 0) - 1;
        }
        winsDelta[winnerId] = (winsDelta[winnerId] ?? 0) + 1;
        lossesDelta[newLoserId] = (lossesDelta[newLoserId] ?? 0) + 1;

        tx.update(matchRef, { winnerId });

        for (const id of idsToRead) {
          const entry = playerSnaps[id];
          if (!entry.data) continue;
          const updates: Record<string, unknown> = {};
          const wDelta = winsDelta[id] ?? 0;
          const lDelta = lossesDelta[id] ?? 0;
          if (wDelta !== 0) {
            updates.wins = Math.max(0, ((entry.data.wins as number) ?? 0) + wDelta);
          }
          if (lDelta !== 0) {
            updates.losses = Math.max(0, ((entry.data.losses as number) ?? 0) + lDelta);
          }
          if (Object.keys(updates).length > 0) {
            tx.update(entry.ref, updates);
          }
        }
      });
    } catch (e) {
      console.error('updateMatchWinner failed:', e);
    }
    setEditingMatch(null);
  };

  const updateSettings = async (field: string, value: unknown) => {
    if (!tournamentId) return;
    await updateDoc(doc(db, 'tournaments', tournamentId), { [field]: value });
  };

  // Drop (棄権) a player
  const dropPlayer = async (playerId: string) => {
    if (!tournamentId) return;
    if (!confirm('このプレイヤーをドロップ（棄権）しますか？')) return;
    // Remove from queue if in queue
    await deleteDoc(doc(db, 'tournaments', tournamentId, 'queue', playerId));
    // Set dropped flag
    await updateDoc(doc(db, 'tournaments', tournamentId, 'players', playerId), { dropped: true });
  };

  // Undrop a player
  const undropPlayer = async (playerId: string) => {
    if (!tournamentId) return;
    await updateDoc(doc(db, 'tournaments', tournamentId, 'players', playerId), { dropped: false });
  };

  // Proxy: add player to matching queue (for proxy/代理 players)
  const proxyJoinQueue = async (playerId: string) => {
    if (!tournamentId) return;
    await joinMatchingQueue(tournamentId, playerId);
  };

  const getPlayerName = (id: string) => players.find((p) => p.id === id)?.displayName ?? '???';
  const ongoingMatches = matches.filter((m) => m.status === 'ongoing');
  const finishedMatches = matches.filter((m) => m.status === 'finished');
  const entryUrl = `${window.location.origin}/entry/${tournamentId}`;

  if (!tournament) {
    return <Layout><p className="text-center py-16 text-stone-500">読み込み中...</p></Layout>;
  }

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/host')} className="text-stone-500 hover:text-stone-900 text-2xl">←</button>
        <h1 className="text-xl font-bold flex-1 text-stone-900">{tournament.name}</h1>
        {tournament.isTest && (
          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-bold">TEST</span>
        )}
        <button
          onClick={() => navigate('/host/profile')}
          className="w-8 h-8 bg-stone-200 hover:bg-stone-200 rounded-lg flex items-center justify-center transition-colors text-stone-600"
          title="マイページ"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </button>
      </div>

      {/* Tournament info badges */}
      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        {tournament.cardGame && (
          <CardGameBadge cardGameId={tournament.cardGame} cardGameOther={tournament.cardGameOther} />
        )}
        <span className="px-2 py-1 bg-white border border-stone-200 rounded-lg text-stone-600 shadow-sm">
          {tournament.seatRule === 'winner-stays' ? '勝ち残り' : tournament.seatRule === 'loser-stays' ? '負け残り' : '都度解散'}
        </span>
        {tournament.seatRule !== 'both-leave' && tournament.streakLimit > 0 && (
          <span className="px-2 py-1 bg-white border border-stone-200 rounded-lg text-amber-500 shadow-sm">
            {tournament.streakLimit}{tournament.seatRule === 'winner-stays' ? '連勝' : '連敗'}制限
          </span>
        )}
        {(tournament.bestOf ?? 1) > 1 && (
          <span className="px-2 py-1 bg-white border border-orange-400/50 rounded-lg text-orange-500 shadow-sm">
            BO{tournament.bestOf}
          </span>
        )}
        <span className="px-2 py-1 bg-white border border-stone-200 rounded-lg text-stone-600 shadow-sm">
          {tournament.timerMinutes}分
        </span>
        <span className="px-2 py-1 bg-white border border-stone-200 rounded-lg text-stone-600 shadow-sm">
          {players.length}人
        </span>
      </div>

      {/* Controls */}
      <div className="space-y-3 mb-6">
        <div className="flex gap-3">
          <button
            onClick={toggleEntry}
            className={`flex-1 py-3 rounded-xl font-bold transition-colors text-white ${
              tournament.entryOpen
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-emerald-500 hover:bg-emerald-400'
            }`}
          >
            {tournament.entryOpen ? 'エントリー締め切り' : 'エントリー開始'}
          </button>
          <button
            onClick={() => setShowQR(!showQR)}
            className="px-4 py-3 bg-stone-200 hover:bg-stone-200 rounded-xl transition-colors text-stone-900"
          >
            QR
          </button>
        </div>

        {showQR && (
          <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-sm">
            <QRCodeDisplay url={entryUrl} tournamentName={tournament.name} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-3 border border-stone-200 shadow-sm">
            <label className="text-xs text-stone-500">感想戦バッファ</label>
            <select
              value={tournament.afterBattleBuffer}
              onChange={(e) => updateSettings('afterBattleBuffer', Number(e.target.value))}
              className="w-full mt-1 px-2 py-1 bg-stone-100 rounded-lg text-sm text-stone-900"
            >
              {[0,1,2,3,4,5].map((v) => <option key={v} value={v}>{v}分</option>)}
            </select>
          </div>
          <div className="bg-white rounded-2xl p-3 border border-stone-200 shadow-sm">
            <label className="text-xs text-stone-500">マッチングタイムアウト</label>
            <select
              value={tournament.matchingTimeout}
              onChange={(e) => updateSettings('matchingTimeout', Number(e.target.value))}
              className="w-full mt-1 px-2 py-1 bg-stone-100 rounded-lg text-sm text-stone-900"
            >
              {[0,1,2,3,4,5].map((v) => <option key={v} value={v}>{v}分</option>)}
            </select>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3 border border-stone-200 shadow-sm">
          <label className="text-xs text-stone-500">最終マッチング時間</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="time"
              value={tournament.matchingDeadline
                ? (() => { const d = tournament.matchingDeadline.toDate(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })()
                : ''}
              onChange={(e) => {
                if (!e.target.value) {
                  updateSettings('matchingDeadline', null);
                } else {
                  const [h, m] = e.target.value.split(':').map(Number);
                  const d = new Date(); d.setHours(h, m, 0, 0);
                  updateSettings('matchingDeadline', Timestamp.fromDate(d));
                }
              }}
              className="flex-1 px-2 py-1 bg-stone-100 rounded-lg text-sm text-stone-900"
            />
            {tournament.matchingDeadline && (
              <button
                onClick={() => updateSettings('matchingDeadline', null)}
                className="text-xs text-stone-500 hover:text-red-500"
              >
                解除
              </button>
            )}
          </div>
          <p className="text-xs text-stone-400 mt-1">この時刻以降は新規マッチング不可</p>
        </div>

        {tournament.status !== 'finished' && (
          <button
            onClick={finishTournament}
            className="w-full py-3 bg-stone-200 hover:bg-red-100 hover:text-red-600 rounded-xl font-bold text-red-500 transition-colors"
          >
            大会終了
          </button>
        )}
      </div>

      {/* Test mode controls */}
      {tournament.isTest && tournament.status !== 'finished' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 space-y-3 shadow-sm">
          <h3 className="text-sm font-bold text-amber-600">テストモード</h3>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={50}
              value={dummyCount}
              onChange={(e) => setDummyCount(Number(e.target.value))}
              className="w-20 px-2 py-1 bg-stone-100 rounded-lg text-sm text-stone-900"
            />
            <button
              onClick={addDummyPlayers}
              className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg text-sm font-bold transition-colors text-white"
            >
              ダミー追加
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={startDummyAutoPlay}
              className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg text-sm font-bold transition-colors text-white"
            >
              全員キュー投入
            </button>
            <button
              onClick={autoReportResults}
              className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg text-sm font-bold transition-colors text-white"
            >
              勝敗自動登録
            </button>
          </div>
          <a
            href={`/play/${tournamentId}?preview=true`}
            target="_blank"
            className="block text-center py-2 bg-stone-200 hover:bg-stone-200 rounded-lg text-sm transition-colors text-stone-900"
          >
            プレイヤー画面プレビュー
          </a>
        </div>
      )}

      {/* Proxy entry */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200 mb-6 shadow-sm">
        <h3 className="text-sm font-bold text-stone-600 mb-2">代理エントリー</h3>
        <div className="flex gap-2">
          <input
            value={proxyName}
            onChange={(e) => setProxyName(e.target.value)}
            placeholder="ハンドルネーム"
            className="flex-1 px-3 py-2 bg-stone-100 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-400 text-stone-900"
          />
          <button
            onClick={addProxyPlayer}
            disabled={!proxyName.trim()}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:bg-stone-200 rounded-lg text-sm font-bold transition-colors text-white"
          >
            追加
          </button>
        </div>
      </div>

      {/* Ongoing matches */}
      {ongoingMatches.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-stone-600 mb-2">進行中マッチ ({ongoingMatches.length})</h3>
          <div className="space-y-2">
            {ongoingMatches.map((m) => {
              const timerSeconds = (m as Match & { timerSeconds?: number }).timerSeconds ?? tournament.timerMinutes * 60;
              const endTime = m.startedAt.toMillis() + timerSeconds * 1000;
              const p1IsProxy = players.find((p) => p.id === m.player1Id)?.isProxy;
              const p2IsProxy = players.find((p) => p.id === m.player2Id)?.isProxy;
              const needsProxyReport = p1IsProxy || p2IsProxy;
              return (
                <div key={m.id} className="bg-white rounded-2xl p-3 border border-stone-200 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full">卓 {m.tableNumber}</span>
                      {(m.bestOf ?? 1) > 1 && (() => {
                        const games = m.games ?? [];
                        const p1w = games.filter((g) => g.winnerId === m.player1Id).length;
                        const p2w = games.filter((g) => g.winnerId === m.player2Id).length;
                        return (
                          <span className="text-xs bg-stone-100 px-2 py-0.5 rounded-full text-orange-500 font-bold">
                            BO{m.bestOf} {p1w}-{p2w}
                          </span>
                        );
                      })()}
                    </div>
                    <Timer endTime={endTime} className="text-lg" />
                  </div>
                  <div className="text-sm font-bold text-stone-900">
                    {getPlayerName(m.player1Id)} vs {getPlayerName(m.player2Id)}
                  </div>
                  {(() => {
                    const p1 = players.find((p) => p.id === m.player1Id);
                    const p2 = players.find((p) => p.id === m.player2Id);
                    const streak1 = p1?.currentStreak ?? 0;
                    const streak2 = p2?.currentStreak ?? 0;
                    if (streak1 < 2 && streak2 < 2) return null;
                    return (
                      <div className="text-xs text-amber-500 mt-0.5">
                        {streak1 >= 2 && <span>{'🔥'}{p1?.displayName} {streak1}連勝中</span>}
                        {streak1 >= 2 && streak2 >= 2 && <span> / </span>}
                        {streak2 >= 2 && <span>{'🔥'}{p2?.displayName} {streak2}連勝中</span>}
                      </div>
                    );
                  })()}
                  {/* Proxy result reporting for host */}
                  {needsProxyReport && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => reportResult(tournamentId!, m.id, m.player1Id)}
                        className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-400 rounded-lg text-xs font-bold transition-colors text-white"
                      >
                        {getPlayerName(m.player1Id)} 勝利
                      </button>
                      <button
                        onClick={() => reportResult(tournamentId!, m.id, m.player2Id)}
                        className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-400 rounded-lg text-xs font-bold transition-colors text-white"
                      >
                        {getPlayerName(m.player2Id)} 勝利
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ranking / Players toggle */}
      <div className="flex mb-3 bg-stone-100 rounded-xl p-1">
        <button
          onClick={() => setShowRanking(false)}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${!showRanking ? 'bg-orange-500 text-white' : 'text-stone-500'}`}
        >
          参加者 ({players.length})
        </button>
        <button
          onClick={() => setShowRanking(true)}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${showRanking ? 'bg-orange-500 text-white' : 'text-stone-500'}`}
        >
          ランキング
        </button>
      </div>

      {showRanking ? (
        <div className="mb-6">
          <Ranking players={players} matches={matches} tournamentName={tournament.name} currentPlayerId={null} />
        </div>
      ) : (
      <div className="mb-6">
        <h3 className="text-sm font-bold text-stone-600 mb-2">参加者 ({players.length})</h3>
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500">
                <th className="py-2 px-2 text-left">No.</th>
                <th className="py-2 px-2 text-left">名前</th>
                <th className="py-2 px-2 text-right">W</th>
                <th className="py-2 px-2 text-right">L</th>
                <th className="py-2 px-2 text-right">連勝</th>
                <th className="py-2 px-2 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="text-stone-900">
              {players.map((p) => {
                const isInQueue = queuePlayerIds.has(p.id);
                const isInMatch = ongoingPlayerIds.has(p.id);
                const canQueue = !p.dropped && !isInQueue && !isInMatch && tournament.status === 'active';
                return (
                  <tr key={p.id} className={`border-b border-stone-200/50 ${p.dropped ? 'opacity-40' : ''}`}>
                    <td className="py-2 px-2">{p.entryNumber}</td>
                    <td className="py-2 px-2 font-bold">
                      <span className="block">{p.displayName}</span>
                      <span className="flex gap-1 mt-0.5">
                        {p.isProxy && <span className="text-xs text-yellow-500">(代理)</span>}
                        {p.dropped && <span className="text-xs text-red-500">(DROP)</span>}
                        {isInQueue && <span className="text-xs text-blue-500">(待機中)</span>}
                        {isInMatch && <span className="text-xs text-orange-500">(対戦中)</span>}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right text-emerald-500">{p.wins}</td>
                    <td className="py-2 px-2 text-right text-red-500">{p.losses}</td>
                    <td className="py-2 px-2 text-right">
                      {(p.currentStreak ?? 0) >= 2 && (
                        <span className="text-amber-500 font-bold text-xs">{'🔥'}{p.currentStreak}</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <div className="flex flex-col gap-1 items-center">
                        {canQueue && (
                          <button
                            onClick={() => proxyJoinQueue(p.id)}
                            className="text-xs px-2 py-1 bg-blue-500 hover:bg-blue-400 rounded transition-colors whitespace-nowrap text-white"
                          >
                            キュー
                          </button>
                        )}
                        {!p.dropped && !isInMatch ? (
                          <button
                            onClick={() => dropPlayer(p.id)}
                            className="text-xs px-2 py-1 bg-stone-200 hover:bg-red-100 hover:text-red-600 text-stone-500 rounded transition-colors whitespace-nowrap"
                          >
                            DROP
                          </button>
                        ) : p.dropped ? (
                          <button
                            onClick={() => undropPlayer(p.id)}
                            className="text-xs px-2 py-1 bg-stone-200 hover:bg-emerald-100 hover:text-emerald-600 text-stone-500 rounded transition-colors whitespace-nowrap"
                          >
                            復帰
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Finished matches with edit */}
      {finishedMatches.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-stone-600 mb-2">完了マッチ ({finishedMatches.length})</h3>
          <div className="space-y-2">
            {finishedMatches.map((m) => (
              <div key={m.id} className="bg-white rounded-2xl p-3 border border-stone-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-stone-400">卓 {m.tableNumber}</span>
                  <button
                    onClick={() => setEditingMatch(editingMatch === m.id ? null : m.id)}
                    className="text-xs text-orange-500 hover:text-orange-500"
                  >
                    修正
                  </button>
                </div>
                <div className="text-sm">
                  <span className={m.winnerId === m.player1Id ? 'font-bold text-emerald-500' : 'text-stone-500'}>
                    {getPlayerName(m.player1Id)}
                  </span>
                  {' vs '}
                  <span className={m.winnerId === m.player2Id ? 'font-bold text-emerald-500' : 'text-stone-500'}>
                    {getPlayerName(m.player2Id)}
                  </span>
                </div>
                {editingMatch === m.id && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => updateMatchWinner(m.id, m.player1Id)}
                      className="flex-1 py-1 bg-emerald-500 hover:bg-emerald-400 rounded-lg text-xs font-bold text-white"
                    >
                      {getPlayerName(m.player1Id)} 勝利
                    </button>
                    <button
                      onClick={() => updateMatchWinner(m.id, m.player2Id)}
                      className="flex-1 py-1 bg-emerald-500 hover:bg-emerald-400 rounded-lg text-xs font-bold text-white"
                    >
                      {getPlayerName(m.player2Id)} 勝利
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}

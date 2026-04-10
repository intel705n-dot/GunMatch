import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc, collection, onSnapshot, updateDoc, addDoc, query, orderBy,
  Timestamp, getDocs, where, getDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Tournament, Player, Match } from '../../lib/types';
import { tryMatchAllPlayers, joinMatchingQueue, reportResult } from '../../lib/matchingService';
import Layout from '../../components/Layout';
import Timer from '../../components/Timer';
import Ranking from '../../components/Ranking';
import QRCodeDisplay from '../../components/QRCodeDisplay';
import { DUMMY_NAMES } from '../../lib/dummyNames';

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
  const [ongoingPlayerIds, setOngoingPlayerIds] = useState<Set<string>>(new Set());

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

  // Track which players are in ongoing matches
  useEffect(() => {
    const ids = new Set<string>();
    for (const m of matches) {
      if (m.status === 'ongoing') {
        ids.add(m.player1Id);
        ids.add(m.player2Id);
      }
    }
    setOngoingPlayerIds(ids);
  }, [matches]);

  // Auto-matching: poll queue and try to match all available pairs
  useEffect(() => {
    if (!tournamentId || !tournament || tournament.status !== 'active') return;
    const interval = setInterval(async () => {
      try {
        await tryMatchAllPlayers(tournamentId);
      } catch (_e) { /* ignore */ }
    }, 1500);
    return () => clearInterval(interval);
  }, [tournamentId, tournament?.status]);

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
    const nextNumber = players.length + 1;
    await addDoc(collection(db, 'tournaments', tournamentId, 'players'), {
      entryNumber: nextNumber,
      displayName: proxyName.trim(),
      xId: null,
      googleUid: null,
      wins: 0,
      losses: 0,
      isProxy: true,
      dropped: false,
      createdAt: Timestamp.now(),
    });
    setProxyName('');
  };

  const addDummyPlayers = async () => {
    if (!tournamentId) return;
    const shuffled = [...DUMMY_NAMES].sort(() => Math.random() - 0.5);
    const names = shuffled.slice(0, dummyCount);
    const startNum = players.length + 1;
    for (let i = 0; i < names.length; i++) {
      await addDoc(collection(db, 'tournaments', tournamentId, 'players'), {
        entryNumber: startNum + i,
        displayName: names[i],
        xId: null,
        wins: 0,
        losses: 0,
        isProxy: true,
        dropped: false,
        createdAt: Timestamp.now(),
      });
    }
  };

  const startDummyAutoPlay = useCallback(async () => {
    if (!tournamentId || !tournament?.isTest) return;
    // Add all non-dropped dummy players to queue, then auto-report results
    const activePlayers = players.filter((p) => p.isProxy && !p.dropped);
    const queueRef = collection(db, 'tournaments', tournamentId, 'queue');

    for (const p of activePlayers) {
      const existing = await getDocs(query(queueRef, where('playerId', '==', p.id)));
      // Check if player is in an ongoing match
      const matchesRef = collection(db, 'tournaments', tournamentId, 'matches');
      const m1 = await getDocs(query(matchesRef, where('player1Id', '==', p.id), where('status', '==', 'ongoing')));
      const m2 = await getDocs(query(matchesRef, where('player2Id', '==', p.id), where('status', '==', 'ongoing')));
      if (existing.empty && m1.empty && m2.empty) {
        await addDoc(queueRef, { playerId: p.id, joinedAt: Timestamp.now() });
      }
    }
  }, [tournamentId, tournament?.isTest, players]);

  const autoReportResults = useCallback(async () => {
    if (!tournamentId || !tournament?.isTest) return;
    const ongoingMatches = matches.filter((m) => m.status === 'ongoing');
    for (const m of ongoingMatches) {
      const winnerId = Math.random() > 0.5 ? m.player1Id : m.player2Id;
      const loserId = winnerId === m.player1Id ? m.player2Id : m.player1Id;
      const bufferSeconds = tournament.afterBattleBuffer;
      await updateDoc(doc(db, 'tournaments', tournamentId, 'matches', m.id), {
        status: 'finished',
        winnerId,
        finishedAt: Timestamp.now(),
        bufferUntil: Timestamp.fromMillis(Date.now() + bufferSeconds * 1000),
      });
      await updateDoc(doc(db, 'tournaments', tournamentId, 'players', winnerId), {
        wins: (players.find((p) => p.id === winnerId)?.wins ?? 0) + 1,
      });
      await updateDoc(doc(db, 'tournaments', tournamentId, 'players', loserId), {
        losses: (players.find((p) => p.id === loserId)?.losses ?? 0) + 1,
      });
    }
  }, [tournamentId, tournament, matches, players]);

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
    const matchSnap = await getDoc(matchRef);
    if (!matchSnap.exists()) return;
    const matchData = matchSnap.data();
    const oldWinner = matchData.winnerId;
    const loserId = matchData.player1Id === winnerId ? matchData.player2Id : matchData.player1Id;

    if (oldWinner) {
      const oldLoser = matchData.player1Id === oldWinner ? matchData.player2Id : matchData.player1Id;
      // Revert old result
      const owSnap = await getDoc(doc(db, 'tournaments', tournamentId, 'players', oldWinner));
      const olSnap = await getDoc(doc(db, 'tournaments', tournamentId, 'players', oldLoser));
      if (owSnap.exists()) {
        await updateDoc(owSnap.ref, { wins: Math.max(0, (owSnap.data().wins || 0) - 1) });
      }
      if (olSnap.exists()) {
        await updateDoc(olSnap.ref, { losses: Math.max(0, (olSnap.data().losses || 0) - 1) });
      }
    }

    await updateDoc(matchRef, { winnerId });
    // Apply new result
    const wSnap = await getDoc(doc(db, 'tournaments', tournamentId, 'players', winnerId));
    const lSnap = await getDoc(doc(db, 'tournaments', tournamentId, 'players', loserId));
    if (wSnap.exists()) {
      await updateDoc(wSnap.ref, { wins: (wSnap.data().wins || 0) + 1 });
    }
    if (lSnap.exists()) {
      await updateDoc(lSnap.ref, { losses: (lSnap.data().losses || 0) + 1 });
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
    const queueRef = collection(db, 'tournaments', tournamentId, 'queue');
    const qSnap = await getDocs(query(queueRef, where('playerId', '==', playerId)));
    for (const d of qSnap.docs) await deleteDoc(d.ref);
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
    return <Layout><p className="text-center py-16 text-slate-400">読み込み中...</p></Layout>;
  }

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/host')} className="text-slate-400 hover:text-white text-2xl">←</button>
        <h1 className="text-xl font-bold flex-1">{tournament.name}</h1>
        {tournament.isTest && (
          <span className="px-2 py-0.5 bg-yellow-600 text-yellow-100 text-xs rounded-full font-bold">TEST</span>
        )}
        <button
          onClick={() => navigate('/host/profile')}
          className="w-8 h-8 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center transition-colors"
          title="マイページ"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </button>
      </div>

      {/* Controls */}
      <div className="space-y-3 mb-6">
        <div className="flex gap-3">
          <button
            onClick={toggleEntry}
            className={`flex-1 py-3 rounded-xl font-bold transition-colors ${
              tournament.entryOpen
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {tournament.entryOpen ? 'エントリー締め切り' : 'エントリー開始'}
          </button>
          <button
            onClick={() => setShowQR(!showQR)}
            className="px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors"
          >
            QR
          </button>
        </div>

        {showQR && (
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <QRCodeDisplay url={entryUrl} tournamentName={tournament.name} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
            <label className="text-xs text-slate-400">感想戦バッファ</label>
            <select
              value={tournament.afterBattleBuffer}
              onChange={(e) => updateSettings('afterBattleBuffer', Number(e.target.value))}
              className="w-full mt-1 px-2 py-1 bg-slate-700 rounded-lg text-sm"
            >
              {[0,1,2,3,4,5].map((v) => <option key={v} value={v}>{v}分</option>)}
            </select>
          </div>
          <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
            <label className="text-xs text-slate-400">マッチングタイムアウト</label>
            <select
              value={tournament.matchingTimeout}
              onChange={(e) => updateSettings('matchingTimeout', Number(e.target.value))}
              className="w-full mt-1 px-2 py-1 bg-slate-700 rounded-lg text-sm"
            >
              {[0,1,2,3,4,5].map((v) => <option key={v} value={v}>{v}分</option>)}
            </select>
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
          <label className="text-xs text-slate-400">最終マッチング時間</label>
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
              className="flex-1 px-2 py-1 bg-slate-700 rounded-lg text-sm"
            />
            {tournament.matchingDeadline && (
              <button
                onClick={() => updateSettings('matchingDeadline', null)}
                className="text-xs text-slate-400 hover:text-red-400"
              >
                解除
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">この時刻以降は新規マッチング不可</p>
        </div>

        {tournament.status !== 'finished' && (
          <button
            onClick={finishTournament}
            className="w-full py-3 bg-slate-700 hover:bg-red-700 rounded-xl font-bold text-red-300 transition-colors"
          >
            大会終了
          </button>
        )}
      </div>

      {/* Test mode controls */}
      {tournament.isTest && tournament.status !== 'finished' && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-4 mb-6 space-y-3">
          <h3 className="text-sm font-bold text-yellow-400">テストモード</h3>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={50}
              value={dummyCount}
              onChange={(e) => setDummyCount(Number(e.target.value))}
              className="w-20 px-2 py-1 bg-slate-800 rounded-lg text-sm"
            />
            <button
              onClick={addDummyPlayers}
              className="flex-1 py-2 bg-yellow-700 hover:bg-yellow-600 rounded-lg text-sm font-bold transition-colors"
            >
              ダミー追加
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={startDummyAutoPlay}
              className="flex-1 py-2 bg-yellow-700 hover:bg-yellow-600 rounded-lg text-sm font-bold transition-colors"
            >
              全員キュー投入
            </button>
            <button
              onClick={autoReportResults}
              className="flex-1 py-2 bg-yellow-700 hover:bg-yellow-600 rounded-lg text-sm font-bold transition-colors"
            >
              勝敗自動登録
            </button>
          </div>
          <a
            href={`/play/${tournamentId}?preview=true`}
            target="_blank"
            className="block text-center py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
          >
            プレイヤー画面プレビュー
          </a>
        </div>
      )}

      {/* Proxy entry */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-6">
        <h3 className="text-sm font-bold text-slate-300 mb-2">代理エントリー</h3>
        <div className="flex gap-2">
          <input
            value={proxyName}
            onChange={(e) => setProxyName(e.target.value)}
            placeholder="ハンドルネーム"
            className="flex-1 px-3 py-2 bg-slate-700 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            onClick={addProxyPlayer}
            disabled={!proxyName.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 rounded-lg text-sm font-bold transition-colors"
          >
            追加
          </button>
        </div>
      </div>

      {/* Ongoing matches */}
      {ongoingMatches.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-slate-300 mb-2">進行中マッチ ({ongoingMatches.length})</h3>
          <div className="space-y-2">
            {ongoingMatches.map((m) => {
              const timerSeconds = (m as Match & { timerSeconds?: number }).timerSeconds ?? tournament.timerMinutes * 60;
              const endTime = m.startedAt.toMillis() + timerSeconds * 1000;
              const p1IsProxy = players.find((p) => p.id === m.player1Id)?.isProxy;
              const p2IsProxy = players.find((p) => p.id === m.player2Id)?.isProxy;
              const needsProxyReport = p1IsProxy || p2IsProxy;
              return (
                <div key={m.id} className="bg-slate-800 rounded-xl p-3 border border-slate-700">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs bg-indigo-600 px-2 py-0.5 rounded-full">卓 {m.tableNumber}</span>
                    <Timer endTime={endTime} className="text-lg" />
                  </div>
                  <div className="text-sm font-bold">
                    {getPlayerName(m.player1Id)} vs {getPlayerName(m.player2Id)}
                  </div>
                  {/* Proxy result reporting for host */}
                  {needsProxyReport && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => reportResult(tournamentId!, m.id, m.player1Id)}
                        className="flex-1 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-xs font-bold transition-colors"
                      >
                        {getPlayerName(m.player1Id)} 勝利
                      </button>
                      <button
                        onClick={() => reportResult(tournamentId!, m.id, m.player2Id)}
                        className="flex-1 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-xs font-bold transition-colors"
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
      <div className="flex mb-3 bg-slate-800 rounded-xl p-1">
        <button
          onClick={() => setShowRanking(false)}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${!showRanking ? 'bg-indigo-600' : 'text-slate-400'}`}
        >
          参加者 ({players.length})
        </button>
        <button
          onClick={() => setShowRanking(true)}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${showRanking ? 'bg-indigo-600' : 'text-slate-400'}`}
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
        <h3 className="text-sm font-bold text-slate-300 mb-2">参加者 ({players.length})</h3>
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="py-2 px-2 text-left">No.</th>
                <th className="py-2 px-2 text-left">名前</th>
                <th className="py-2 px-2 text-right">W</th>
                <th className="py-2 px-2 text-right">L</th>
                <th className="py-2 px-2 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const isInQueue = queuePlayerIds.has(p.id);
                const isInMatch = ongoingPlayerIds.has(p.id);
                const canQueue = !p.dropped && !isInQueue && !isInMatch && tournament.status === 'active';
                return (
                  <tr key={p.id} className={`border-b border-slate-700/50 ${p.dropped ? 'opacity-40' : ''}`}>
                    <td className="py-2 px-2">{p.entryNumber}</td>
                    <td className="py-2 px-2 font-bold">
                      <span className="block">{p.displayName}</span>
                      <span className="flex gap-1 mt-0.5">
                        {p.isProxy && <span className="text-xs text-yellow-500">(代理)</span>}
                        {p.dropped && <span className="text-xs text-red-400">(DROP)</span>}
                        {isInQueue && <span className="text-xs text-blue-400">(待機中)</span>}
                        {isInMatch && <span className="text-xs text-indigo-400">(対戦中)</span>}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right text-emerald-400">{p.wins}</td>
                    <td className="py-2 px-2 text-right text-red-400">{p.losses}</td>
                    <td className="py-2 px-2 text-center">
                      <div className="flex flex-col gap-1 items-center">
                        {canQueue && (
                          <button
                            onClick={() => proxyJoinQueue(p.id)}
                            className="text-xs px-2 py-1 bg-blue-700 hover:bg-blue-600 rounded transition-colors whitespace-nowrap"
                          >
                            キュー
                          </button>
                        )}
                        {!p.dropped && !isInMatch ? (
                          <button
                            onClick={() => dropPlayer(p.id)}
                            className="text-xs px-2 py-1 bg-slate-700 hover:bg-red-700 text-slate-400 hover:text-red-300 rounded transition-colors whitespace-nowrap"
                          >
                            DROP
                          </button>
                        ) : p.dropped ? (
                          <button
                            onClick={() => undropPlayer(p.id)}
                            className="text-xs px-2 py-1 bg-slate-700 hover:bg-emerald-700 text-slate-400 hover:text-emerald-300 rounded transition-colors whitespace-nowrap"
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
          <h3 className="text-sm font-bold text-slate-300 mb-2">完了マッチ ({finishedMatches.length})</h3>
          <div className="space-y-2">
            {finishedMatches.map((m) => (
              <div key={m.id} className="bg-slate-800 rounded-xl p-3 border border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">卓 {m.tableNumber}</span>
                  <button
                    onClick={() => setEditingMatch(editingMatch === m.id ? null : m.id)}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    修正
                  </button>
                </div>
                <div className="text-sm">
                  <span className={m.winnerId === m.player1Id ? 'font-bold text-emerald-400' : 'text-slate-400'}>
                    {getPlayerName(m.player1Id)}
                  </span>
                  {' vs '}
                  <span className={m.winnerId === m.player2Id ? 'font-bold text-emerald-400' : 'text-slate-400'}>
                    {getPlayerName(m.player2Id)}
                  </span>
                </div>
                {editingMatch === m.id && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => updateMatchWinner(m.id, m.player1Id)}
                      className="flex-1 py-1 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-xs font-bold"
                    >
                      {getPlayerName(m.player1Id)} 勝利
                    </button>
                    <button
                      onClick={() => updateMatchWinner(m.id, m.player2Id)}
                      className="flex-1 py-1 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-xs font-bold"
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

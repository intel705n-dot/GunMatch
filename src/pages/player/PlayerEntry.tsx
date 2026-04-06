import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc, collection, onSnapshot, addDoc, getDocs, query, where, Timestamp,
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth } from '../../lib/firebase';
import type { Tournament } from '../../lib/types';
import Layout from '../../components/Layout';

export default function PlayerEntry() {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [xId, setXId] = useState('');
  const [reLoginXId, setReLoginXId] = useState('');
  const [mode, setMode] = useState<'entry' | 'relogin'>('entry');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!tournamentId) return;
    const unsub = onSnapshot(doc(db, 'tournaments', tournamentId), (snap) => {
      if (snap.exists()) setTournament({ id: snap.id, ...snap.data() } as Tournament);
    });
    return unsub;
  }, [tournamentId]);

  // Check if already entered (via localStorage)
  useEffect(() => {
    if (!tournamentId) return;
    const savedPlayerId = localStorage.getItem(`gunmatch_player_${tournamentId}`);
    if (savedPlayerId) {
      navigate(`/play/${tournamentId}`, { replace: true });
    }
  }, [tournamentId, navigate]);

  const handleEntry = async () => {
    if (!tournamentId || !displayName.trim()) return;
    setError('');
    setSubmitting(true);
    try {
      await signInAnonymously(auth);

      // Get next entry number
      const playersSnap = await getDocs(collection(db, 'tournaments', tournamentId, 'players'));
      const nextNumber = playersSnap.size + 1;

      const playerRef = await addDoc(collection(db, 'tournaments', tournamentId, 'players'), {
        entryNumber: nextNumber,
        displayName: displayName.trim(),
        xId: xId.trim() || null,
        wins: 0,
        losses: 0,
        isProxy: false,
        dropped: false,
        createdAt: Timestamp.now(),
      });

      localStorage.setItem(`gunmatch_player_${tournamentId}`, playerRef.id);
      navigate(`/play/${tournamentId}`, { replace: true });
    } catch (e) {
      setError('エントリーに失敗しました');
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReLogin = async () => {
    if (!tournamentId || !reLoginXId.trim()) return;
    setError('');
    setSubmitting(true);
    try {
      await signInAnonymously(auth);
      const q = query(
        collection(db, 'tournaments', tournamentId, 'players'),
        where('xId', '==', reLoginXId.trim()),
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setError('X IDが見つかりません');
        return;
      }
      const playerId = snap.docs[0].id;
      localStorage.setItem(`gunmatch_player_${tournamentId}`, playerId);
      navigate(`/play/${tournamentId}`, { replace: true });
    } catch (e) {
      setError('再ログインに失敗しました');
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  if (!tournament) {
    return <Layout><p className="text-center py-16 text-slate-400">読み込み中...</p></Layout>;
  }

  if (!tournament.entryOpen && tournament.status === 'waiting') {
    return (
      <Layout>
        <div className="text-center py-16">
          <h1 className="text-2xl font-bold mb-4">{tournament.name}</h1>
          <p className="text-slate-400">エントリーはまだ開始されていません</p>
          <p className="text-sm text-slate-500 mt-2">ホストがエントリーを開始するまでお待ちください</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold mb-2">{tournament.name}</h1>
        {tournament.hostName && (
          <p className="text-xs text-slate-500 mb-2">主催: {tournament.hostName}</p>
        )}
        {tournament.description && (
          <p className="text-sm text-slate-400 whitespace-pre-wrap">{tournament.description}</p>
        )}
      </div>

      {/* Tab switch */}
      <div className="flex mb-6 bg-slate-800 rounded-xl p-1">
        <button
          onClick={() => { setMode('entry'); setError(''); }}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
            mode === 'entry' ? 'bg-indigo-600' : 'text-slate-400'
          }`}
        >
          新規エントリー
        </button>
        <button
          onClick={() => { setMode('relogin'); setError(''); }}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
            mode === 'relogin' ? 'bg-indigo-600' : 'text-slate-400'
          }`}
        >
          再ログイン
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-xl text-sm text-red-300">
          {error}
        </div>
      )}

      {mode === 'entry' ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">ハンドルネーム *</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:border-indigo-500 text-lg"
              placeholder="表示名を入力"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">X ID（任意）</label>
            <div className="flex items-center">
              <span className="text-slate-500 mr-1">@</span>
              <input
                value={xId}
                onChange={(e) => setXId(e.target.value)}
                className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:border-indigo-500"
                placeholder="x_id"
              />
            </div>
          </div>
          <button
            onClick={handleEntry}
            disabled={!displayName.trim() || submitting || !tournament.entryOpen}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-xl font-bold text-lg transition-colors"
          >
            {submitting ? 'エントリー中...' : !tournament.entryOpen ? 'エントリー締め切り' : 'エントリーする'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">X ID *</label>
            <div className="flex items-center">
              <span className="text-slate-500 mr-1">@</span>
              <input
                value={reLoginXId}
                onChange={(e) => setReLoginXId(e.target.value)}
                className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:border-indigo-500"
                placeholder="x_id"
              />
            </div>
          </div>
          <button
            onClick={handleReLogin}
            disabled={!reLoginXId.trim() || submitting}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-xl font-bold text-lg transition-colors"
          >
            {submitting ? '復元中...' : '再ログイン'}
          </button>
        </div>
      )}
    </Layout>
  );
}

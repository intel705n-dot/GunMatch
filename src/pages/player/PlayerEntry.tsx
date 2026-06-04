import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc, collection, onSnapshot, addDoc, getDocs, query, where, Timestamp,
  collectionGroup, updateDoc,
} from 'firebase/firestore';
import { signInAnonymously, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { db, auth } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import type { Tournament } from '../../lib/types';
import Layout from '../../components/Layout';
import CardGameBadge from '../../components/CardGameBadge';

const googleProvider = new GoogleAuthProvider();

export default function PlayerEntry() {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const navigate = useNavigate();
  const { user: authUser, loading: authLoading } = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [xId, setXId] = useState('');
  const [reLoginXId, setReLoginXId] = useState('');
  const [mode, setMode] = useState<'entry' | 'relogin'>('entry');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleUid, setGoogleUid] = useState<string | null>(null);
  // While we're still checking whether this user can auto-recover (localStorage
  // or Google-authed re-entry), don't flash the entry form. Otherwise QR-scan
  // recovery shows a brief blank/empty form before redirecting.
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const isGoogleAuthed = authUser && !authUser.isAnonymous;

  useEffect(() => {
    if (!tournamentId) return;
    const unsub = onSnapshot(doc(db, 'tournaments', tournamentId), (snap) => {
      if (snap.exists()) setTournament({ id: snap.id, ...snap.data() } as Tournament);
    });
    return unsub;
  }, [tournamentId]);

  // Check if already entered. Wait for Firebase auth to finish loading,
  // otherwise auth.currentUser is null on initial mount and Google-authed
  // users miss the recovery redirect (which is the QR-scan-then-blank-screen
  // bug — they had to reload to trigger this check after auth had loaded).
  useEffect(() => {
    if (!tournamentId) return;
    if (authLoading) return;

    const savedPlayerId = localStorage.getItem(`gunmatch_player_${tournamentId}`);
    if (savedPlayerId) {
      navigate(`/play/${tournamentId}`, { replace: true });
      return;
    }

    // If user is already Google-authenticated, check if they're in this tournament
    if (authUser && !authUser.isAnonymous) {
      const q = query(
        collection(db, 'tournaments', tournamentId, 'players'),
        where('googleUid', '==', authUser.uid),
      );
      getDocs(q).then((snap) => {
        if (!snap.empty) {
          const playerId = snap.docs[0].id;
          localStorage.setItem(`gunmatch_player_${tournamentId}`, playerId);
          navigate(`/play/${tournamentId}`, { replace: true });
        } else {
          setRecoveryChecked(true);
        }
      }).catch(() => {
        setRecoveryChecked(true);
      });
    } else {
      setRecoveryChecked(true);
    }
  }, [tournamentId, navigate, authUser, authLoading]);

  const handleEntry = async () => {
    if (!tournamentId || !displayName.trim()) return;
    setError('');
    setSubmitting(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser || currentUser.isAnonymous) {
        await signInAnonymously(auth);
      }
      const resolvedGoogleUid = googleUid || (auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser.uid : null);

      const playersSnap = await getDocs(collection(db, 'tournaments', tournamentId, 'players'));
      const nextNumber = playersSnap.size + 1;

      const playerRef = await addDoc(collection(db, 'tournaments', tournamentId, 'players'), {
        entryNumber: nextNumber,
        displayName: displayName.trim(),
        xId: xId.trim() || null,
        googleUid: resolvedGoogleUid,
        wins: 0,
        losses: 0,
        currentStreak: 0,
        maxStreak: 0,
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
      const currentUser = auth.currentUser;
      if (!currentUser || currentUser.isAnonymous) {
        await signInAnonymously(auth);
      }
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

  // Google login
  const handleGoogleLogin = async () => {
    if (!tournamentId) return;
    setError('');
    setSubmitting(true);
    try {
      let googleUid: string;
      let googleDisplayName: string;
      const currentUser = auth.currentUser;
      if (currentUser && !currentUser.isAnonymous) {
        googleUid = currentUser.uid;
        googleDisplayName = currentUser.displayName || 'Player';
      } else {
        const result = await signInWithPopup(auth, googleProvider);
        googleUid = result.user.uid;
        googleDisplayName = result.user.displayName || 'Player';
      }

      const q = query(
        collection(db, 'tournaments', tournamentId, 'players'),
        where('googleUid', '==', googleUid),
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        const playerId = snap.docs[0].id;
        localStorage.setItem(`gunmatch_player_${tournamentId}`, playerId);
        navigate(`/play/${tournamentId}`, { replace: true });
      } else if (tournament?.entryOpen) {
        setGoogleUid(googleUid);
        setDisplayName(googleDisplayName !== 'Player' ? googleDisplayName : '');
        setMode('entry');
      } else {
        setError('このGoogleアカウントはこの大会に登録されていません');
      }
    } catch (e: any) {
      if (e.code !== 'auth/popup-closed-by-user') {
        setError('Googleログインに失敗しました');
        console.error(e);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Show loading until tournament data is ready AND we've checked whether
  // this user can be auto-redirected (so we don't flash the entry form first).
  if (!tournament || authLoading || !recoveryChecked) {
    return (
      <Layout>
        <div className="text-center py-16">
          <div className="inline-block w-8 h-8 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin mb-3" />
          <p className="text-stone-400">読み込み中...</p>
        </div>
      </Layout>
    );
  }

  if (!tournament.entryOpen && tournament.status === 'waiting') {
    return (
      <Layout>
        <div className="text-center py-16">
          <h1 className="text-2xl font-bold mb-4">{tournament.name}</h1>
          <p className="text-stone-500">エントリーはまだ開始されていません</p>
          <p className="text-sm text-stone-400 mt-2">ホストがエントリーを開始するまでお待ちください</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold mb-2">{tournament.name}</h1>
        {tournament.cardGame && (
          <div className="mb-2">
            <CardGameBadge cardGameId={tournament.cardGame} cardGameOther={tournament.cardGameOther} size="md" />
          </div>
        )}
        {tournament.hostName && (
          <p className="text-xs text-stone-400 mb-2">主催: {tournament.hostName}</p>
        )}
        {tournament.description && (
          <p className="text-sm text-stone-500 whitespace-pre-wrap">{tournament.description}</p>
        )}
      </div>

      {/* Google Login / Linked indicator */}
      {googleUid ? (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
          <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <div className="text-sm">
            <p className="text-emerald-600 font-bold">Google連携済み</p>
            <p className="text-emerald-500/80 text-xs">ハンドルネームを入力してエントリーしてください</p>
          </div>
        </div>
      ) : (
        <>
          <button
            onClick={handleGoogleLogin}
            disabled={submitting}
            className="w-full py-3.5 mb-4 bg-white hover:bg-stone-50 disabled:opacity-50 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-3 text-stone-700 border border-stone-200 shadow-sm"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {isGoogleAuthed
              ? (tournament.entryOpen ? `${auth.currentUser?.displayName || 'Google'}でエントリー` : `${auth.currentUser?.displayName || 'Google'}で再ログイン`)
              : (tournament.entryOpen ? 'Googleでログイン / エントリー' : 'Googleで再ログイン')}
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-stone-200" />
            <span className="text-xs text-stone-400">または</span>
            <div className="flex-1 h-px bg-stone-200" />
          </div>
        </>
      )}

      {/* Tab switch */}
      {!googleUid && (
        <div className="flex mb-6 bg-stone-100 rounded-xl p-1">
          <button
            onClick={() => { setMode('entry'); setError(''); }}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
              mode === 'entry' ? 'bg-orange-500 text-white' : 'text-stone-400'
            }`}
          >
            新規エントリー
          </button>
          <button
            onClick={() => { setMode('relogin'); setError(''); }}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
              mode === 'relogin' ? 'bg-orange-500 text-white' : 'text-stone-400'
            }`}
          >
            再ログイン
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          {error}
        </div>
      )}

      {(mode === 'entry' || googleUid) ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-stone-500 mb-1">ハンドルネーム *</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 text-lg"
              placeholder="表示名を入力"
            />
          </div>
          <div>
            <label className="block text-sm text-stone-500 mb-1">X ID（任意）</label>
            <div className="flex items-center">
              <span className="text-stone-400 mr-1">@</span>
              <input
                value={xId}
                onChange={(e) => setXId(e.target.value)}
                className="flex-1 px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:border-orange-400"
                placeholder="x_id"
              />
            </div>
          </div>
          <button
            onClick={handleEntry}
            disabled={!displayName.trim() || submitting || !tournament.entryOpen}
            className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-stone-200 disabled:text-stone-400 rounded-xl font-bold text-lg transition-colors text-white"
          >
            {submitting ? 'エントリー中...' : !tournament.entryOpen ? 'エントリー締め切り' : 'エントリーする'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-stone-500 mb-1">X ID *</label>
            <div className="flex items-center">
              <span className="text-stone-400 mr-1">@</span>
              <input
                value={reLoginXId}
                onChange={(e) => setReLoginXId(e.target.value)}
                className="flex-1 px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:border-orange-400"
                placeholder="x_id"
              />
            </div>
          </div>
          <button
            onClick={handleReLogin}
            disabled={!reLoginXId.trim() || submitting}
            className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-stone-200 disabled:text-stone-400 rounded-xl font-bold text-lg transition-colors text-white"
          >
            {submitting ? '復元中...' : '再ログイン'}
          </button>
        </div>
      )}
    </Layout>
  );
}

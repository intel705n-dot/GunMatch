import { useState, useEffect, useRef } from 'react';
import { collection, doc, getDoc, setDoc, deleteDoc, onSnapshot, query, orderBy, where, getDocs, collectionGroup } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import type { Tournament } from '../../lib/types';
import Layout from '../../components/Layout';
import SwipeToDelete from '../../components/SwipeToDelete';
import CardGameBadge from '../../components/CardGameBadge';

type Section = 'host' | 'player';
type HostTab = 'active' | 'upcoming' | 'finished' | 'test';

export default function HostList() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [joinedTournaments, setJoinedTournaments] = useState<Tournament[]>([]);
  const [section, setSection] = useState<Section>('host');
  const [hostTab, setHostTab] = useState<HostTab>('active');
  const [hostName, setHostName] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupName, setSetupName] = useState('');
  const [setupLoading, setSetupLoading] = useState(true);
  const [setupSubmitting, setSetupSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scanError, setScanError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const handleDelete = async (tournamentId: string) => {
    setDeleting(tournamentId);
    try {
      for (const sub of ['players', 'matches', 'queue']) {
        const snap = await getDocs(collection(db, 'tournaments', tournamentId, sub));
        for (const d of snap.docs) await deleteDoc(d.ref);
      }
      await deleteDoc(doc(db, 'tournaments', tournamentId));
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'hosts', user.uid)).then((snap) => {
      if (snap.exists() && snap.data().displayName) {
        setHostName(snap.data().displayName);
        setNeedsSetup(false);
      } else {
        // First-time user — needs handle name setup
        setNeedsSetup(true);
        // Pre-fill with Google display name or email prefix as suggestion
        setSetupName(user.displayName || user.email?.split('@')[0] || '');
      }
      setSetupLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'tournaments'),
      where('hostUid', '==', user.uid),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setTournaments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Tournament)));
    }, (err) => {
      console.error('Tournament query failed, falling back:', err);
      const fallbackQ = query(
        collection(db, 'tournaments'),
        where('hostUid', '==', user.uid),
      );
      onSnapshot(fallbackQ, (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Tournament));
        docs.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
        setTournaments(docs);
      });
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const loadJoined = async () => {
      try {
        const q = query(
          collectionGroup(db, 'players'),
          where('googleUid', '==', user.uid),
        );
        const snap = await getDocs(q);
        const tournamentIds = new Set<string>();
        const tournDocs: Tournament[] = [];
        for (const d of snap.docs) {
          const tournRef = d.ref.parent.parent;
          if (!tournRef || tournamentIds.has(tournRef.id)) continue;
          tournamentIds.add(tournRef.id);
          const tournSnap = await getDoc(tournRef);
          if (!tournSnap.exists()) continue;
          const tourn = { id: tournSnap.id, ...tournSnap.data() } as Tournament;
          if (tourn.hostUid !== user.uid) {
            tournDocs.push(tourn);
          }
        }
        tournDocs.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
        setJoinedTournaments(tournDocs);
      } catch (e) {
        console.error('Failed to load joined tournaments:', e);
      }
    };
    loadJoined();
  }, [user]);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/host/login', { replace: true });
    }
  }, [loading, user, navigate]);

  // QR scanner lifecycle
  useEffect(() => {
    if (!showScanner) return;
    const html5QrCode = new Html5Qrcode('qr-reader');
    scannerRef.current = html5QrCode;
    html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        const match = decodedText.match(/\/entry\/([a-zA-Z0-9]+)/);
        const tid = match ? match[1] : decodedText.trim();
        html5QrCode.stop().catch(() => {});
        scannerRef.current = null;
        setShowScanner(false);
        navigate(`/entry/${tid}`);
      },
      () => {},
    ).catch((err) => {
      setScanError('カメラを起動できませんでした');
      console.error(err);
    });
    return () => {
      html5QrCode.stop().catch(() => {});
      scannerRef.current = null;
    };
  }, [showScanner, navigate]);

  const handleManualJoin = () => {
    const input = prompt('大会URLまたはIDを入力してください');
    if (!input) return;
    const match = input.match(/\/entry\/([a-zA-Z0-9]+)/);
    const tid = match ? match[1] : input.trim();
    if (tid) navigate(`/entry/${tid}`);
  };

  const handleSetupName = async () => {
    if (!user || !setupName.trim()) return;
    setSetupSubmitting(true);
    try {
      await setDoc(doc(db, 'hosts', user.uid), {
        displayName: setupName.trim(),
        createdAt: new Date(),
      }, { merge: true });
      setHostName(setupName.trim());
      setNeedsSetup(false);
    } finally {
      setSetupSubmitting(false);
    }
  };

  if (loading || setupLoading) {
    return <Layout><p className="text-center py-16 text-slate-400">読み込み中...</p></Layout>;
  }

  if (!user) return null;

  // First-time setup screen
  if (needsSetup) {
    return (
      <Layout>
        <div className="pt-8 pb-4">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">GunMatch</h1>
            <p className="text-slate-400">ようこそ！</p>
          </div>

          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-indigo-600/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-500/30">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <h2 className="text-xl font-bold mb-1">ハンドルネームを設定</h2>
              <p className="text-sm text-slate-400">大会での表示名を決めてください</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">ハンドルネーム</label>
                <input
                  value={setupName}
                  onChange={(e) => setSetupName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-xl focus:outline-none focus:border-indigo-500 text-lg"
                  placeholder="表示名を入力"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSetupName()}
                />
                <p className="text-xs text-slate-500 mt-1.5">あとから変更できます</p>
              </div>
              <button
                onClick={handleSetupName}
                disabled={!setupName.trim() || setupSubmitting}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-xl font-bold text-lg transition-colors"
              >
                {setupSubmitting ? '設定中...' : 'はじめる'}
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const hostTabCount = (key: HostTab) => tournaments.filter((t) => matchHostTab(t, key)).length;
  const filteredHost = tournaments.filter((t) => matchHostTab(t, hostTab));

  const hostTabs: { key: HostTab; label: string }[] = [
    { key: 'active', label: '開催中' },
    { key: 'upcoming', label: '開催前' },
    { key: 'finished', label: '終了' },
    { key: 'test', label: 'テスト' },
  ];

  const isHost = section === 'host';
  const activeJoinedCount = joinedTournaments.filter((t) => t.status === 'active').length;
  const activeHostCount = tournaments.filter((t) => t.status === 'active' && !t.isTest).length;

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-baseline gap-1.5">
            <h1 className="text-2xl font-bold">GunMatch</h1>
            <span className="text-[10px] text-slate-500 font-medium">(ベータ版)</span>
          </div>
          {hostName && <p className="text-xs text-slate-400">{hostName}</p>}
        </div>
        <button
          onClick={() => navigate('/host/profile')}
          className="w-10 h-10 bg-slate-700 hover:bg-slate-600 rounded-xl flex items-center justify-center transition-colors shrink-0"
          title="マイページ"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </button>
      </div>

      {/* Main Section Tabs */}
      <div className="flex mb-4 bg-slate-800/80 rounded-2xl p-1.5 gap-1.5">
        <button
          onClick={() => setSection('host')}
          className={`relative flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            isHost
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>
          主催
          {activeHostCount > 0 && !isHost && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
              {activeHostCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setSection('player')}
          className={`relative flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            !isHost
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/><path d="M9.5 6.5 21 18v3h-3L6.5 9.5"/><path d="M11 5l-6 6"/><path d="M8 8 4 4"/><path d="M5 3 3 5"/></svg>
          参加
          {activeJoinedCount > 0 && isHost && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
              {activeJoinedCount}
            </span>
          )}
        </button>
      </div>

      {/* ===== HOST SECTION ===== */}
      {isHost && (
        <>
          {/* Host sub-tabs */}
          <div className="flex mb-3 bg-slate-800/60 rounded-xl p-1">
            {hostTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setHostTab(t.key)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  hostTab === t.key ? 'bg-indigo-500/30 text-indigo-300' : 'text-slate-500'
                }`}
              >
                {t.label}
                <span className="ml-0.5 opacity-60">({hostTabCount(t.key)})</span>
              </button>
            ))}
          </div>

          {/* New tournament button */}
          <button
            onClick={() => navigate('/host/create')}
            className="w-full mb-4 py-3 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 rounded-xl font-bold text-sm transition-colors text-indigo-300 flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
            新しい大会を作成
          </button>

          {/* Host tournament list */}
          {filteredHost.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 text-slate-600"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>
              <p>大会がありません</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredHost.map((t) => (
                <SwipeToDelete
                  key={t.id}
                  onDelete={() => handleDelete(t.id)}
                  disabled={deleting === t.id}
                >
                  <div
                    onClick={() => navigate(`/host/${t.id}`)}
                    className={`w-full text-left p-4 rounded-xl transition-colors cursor-pointer ${
                      t.status === 'active'
                        ? 'bg-red-950/40 border-2 border-red-500/60 hover:bg-red-950/60 hover:border-red-500/80 shadow-lg shadow-red-500/10'
                        : 'bg-slate-800 border border-indigo-500/20 hover:bg-slate-700 hover:border-indigo-500/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {t.status === 'active' && (
                        <span className="relative flex h-3 w-3 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                        </span>
                      )}
                      <span className="font-bold text-lg">{t.name}</span>
                      {t.isTest && (
                        <span className="px-2 py-0.5 bg-yellow-600 text-yellow-100 text-xs rounded-full font-bold">
                          TEST
                        </span>
                      )}
                      <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-bold ${
                        t.status === 'active' ? 'bg-red-500 text-white animate-pulse' :
                        t.status === 'finished' ? 'bg-slate-600 text-slate-300' :
                        'bg-blue-600/80 text-blue-100'
                      }`}>
                        {t.status === 'active' ? 'LIVE' : t.status === 'finished' ? '終了' : '待機中'}
                      </span>
                    </div>
                    {t.cardGame && (
                      <div className="mt-1">
                        <CardGameBadge cardGameId={t.cardGame} cardGameOther={t.cardGameOther} />
                      </div>
                    )}
                    <p className="text-sm text-slate-400 line-clamp-1">{t.description}</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!confirm('この大会を削除しますか？この操作は元に戻せません。')) return;
                        handleDelete(t.id);
                      }}
                      disabled={deleting === t.id}
                      className="hidden md:inline-block mt-2 px-3 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {deleting === t.id ? '削除中...' : '削除'}
                    </button>
                  </div>
                </SwipeToDelete>
              ))}
            </div>
          )}
        </>
      )}

      {/* ===== PLAYER SECTION ===== */}
      {!isHost && (
        <>
          {/* Join actions */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <button
              onClick={() => setShowScanner(true)}
              className="py-4 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 rounded-xl font-bold text-sm transition-colors text-emerald-300 flex flex-col items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>
              QRコードで参加
            </button>
            <button
              onClick={handleManualJoin}
              className="py-4 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 rounded-xl font-bold text-sm transition-colors text-emerald-400/80 flex flex-col items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/><path d="m21 3-9 9"/><path d="M15 3h6v6"/></svg>
              URLで参加
            </button>
          </div>

          {/* Joined tournament list */}
          {joinedTournaments.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 text-slate-600"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/><path d="M9.5 6.5 21 18v3h-3L6.5 9.5"/><path d="M11 5l-6 6"/><path d="M8 8 4 4"/><path d="M5 3 3 5"/></svg>
              <p>参加した大会はまだありません</p>
              <p className="text-xs text-slate-600 mt-1">QRコードまたはURLから大会に参加しよう</p>
            </div>
          ) : (
            <>
              <h3 className="text-xs font-bold text-emerald-400/70 uppercase tracking-wider mb-3">参加した大会</h3>
              <div className="space-y-3">
                {joinedTournaments.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => navigate(`/play/${t.id}`)}
                    className={`w-full text-left p-4 rounded-xl transition-colors cursor-pointer ${
                      t.status === 'active'
                        ? 'bg-red-950/40 border-2 border-red-500/60 hover:bg-red-950/60 hover:border-red-500/80 shadow-lg shadow-red-500/10'
                        : 'bg-slate-800 border border-emerald-500/20 hover:bg-slate-700 hover:border-emerald-500/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {t.status === 'active' && (
                        <span className="relative flex h-3 w-3 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                        </span>
                      )}
                      <span className="font-bold text-lg">{t.name}</span>
                      <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-bold ${
                        t.status === 'active' ? 'bg-red-500 text-white animate-pulse' :
                        t.status === 'finished' ? 'bg-slate-600 text-slate-300' :
                        'bg-teal-600/80 text-teal-100'
                      }`}>
                        {t.status === 'active' ? 'LIVE' : t.status === 'finished' ? '終了' : '待機中'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {t.cardGame && <CardGameBadge cardGameId={t.cardGame} cardGameOther={t.cardGameOther} />}
                      {t.hostName && <span className={`text-xs ${t.status === 'active' ? 'text-red-300/60' : 'text-slate-500'}`}>主催: {t.hostName}</span>}
                    </div>
                    {t.description && <p className={`text-sm line-clamp-1 mt-0.5 ${t.status === 'active' ? 'text-red-200/50' : 'text-slate-400'}`}>{t.description}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* QR Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 rounded-2xl overflow-hidden border border-emerald-500/30">
            <div className="p-4 flex items-center justify-between border-b border-slate-700">
              <h2 className="font-bold text-lg text-emerald-300">QRコードで参加</h2>
              <button
                onClick={() => { setShowScanner(false); setScanError(''); }}
                className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 6-12 12"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <div id="qr-reader" className="w-full" />
            {scanError && (
              <p className="text-sm text-red-400 text-center p-3">{scanError}</p>
            )}
            <div className="p-4 border-t border-slate-700">
              <button
                onClick={() => { setShowScanner(false); setScanError(''); handleManualJoin(); }}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-bold transition-colors border border-emerald-500/20 text-emerald-300/80"
              >
                URLまたはIDを手入力で参加
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function matchHostTab(t: Tournament, key: HostTab): boolean {
  if (key === 'test') return t.isTest;
  if (t.isTest) return false;
  if (key === 'active') return t.status === 'active';
  if (key === 'upcoming') return t.status === 'waiting';
  return t.status === 'finished';
}

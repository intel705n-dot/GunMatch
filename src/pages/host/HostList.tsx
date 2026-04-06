import { useState, useEffect } from 'react';
import { collection, doc, getDoc, deleteDoc, onSnapshot, query, orderBy, where, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import type { Tournament } from '../../lib/types';
import Layout from '../../components/Layout';
import SwipeToDelete from '../../components/SwipeToDelete';

type TabKey = 'active' | 'upcoming' | 'finished' | 'test';

export default function HostList() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tab, setTab] = useState<TabKey>('active');
  const [hostName, setHostName] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (tournamentId: string) => {
    setDeleting(tournamentId);
    try {
      // Delete subcollections
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
      if (snap.exists()) setHostName(snap.data().displayName || '');
      else setHostName(user.displayName || user.email?.split('@')[0] || '');
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
      // Fallback: query without orderBy (no composite index needed)
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
    if (!loading && !user) {
      navigate('/host/login', { replace: true });
    }
  }, [loading, user, navigate]);

  if (loading) {
    return <Layout><p className="text-center py-16 text-slate-400">読み込み中...</p></Layout>;
  }

  if (!user) return null;

  const countFor = (key: TabKey) => tournaments.filter((t) => matchTab(t, key)).length;

  const filtered = tournaments.filter((t) => matchTab(t, tab));

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'active', label: '開催中' },
    { key: 'upcoming', label: '開催前' },
    { key: 'finished', label: '終了' },
    { key: 'test', label: 'テスト' },
  ];

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-baseline gap-1.5">
            <h1 className="text-2xl font-bold">GunMatch</h1>
            <span className="text-[10px] text-slate-500 font-medium">(ベータ版)</span>
          </div>
          {hostName && <p className="text-xs text-slate-400">{hostName}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/host/create')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-sm transition-colors"
          >
            + 新規作成
          </button>
          <button
            onClick={() => navigate('/host/profile')}
            className="w-10 h-10 bg-slate-700 hover:bg-slate-600 rounded-xl flex items-center justify-center transition-colors"
            title="マイページ"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex mb-4 bg-slate-800 rounded-xl p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
              tab === t.key ? 'bg-indigo-600' : 'text-slate-400'
            }`}
          >
            {t.label}
            <span className="ml-0.5 opacity-70">({countFor(t.key)})</span>
          </button>
        ))}
      </div>

      {/* Tournament list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p>大会がありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <SwipeToDelete
              key={t.id}
              onDelete={() => handleDelete(t.id)}
              disabled={deleting === t.id}
            >
              <div
                onClick={() => navigate(`/host/${t.id}`)}
                className="w-full text-left p-4 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-lg">{t.name}</span>
                  {t.isTest && (
                    <span className="px-2 py-0.5 bg-yellow-600 text-yellow-100 text-xs rounded-full font-bold">
                      TEST
                    </span>
                  )}
                  <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-bold ${
                    t.status === 'active' ? 'bg-emerald-600 text-emerald-100' :
                    t.status === 'finished' ? 'bg-slate-600 text-slate-300' :
                    'bg-blue-600 text-blue-100'
                  }`}>
                    {t.status === 'active' ? '開催中' : t.status === 'finished' ? '終了' : '待機中'}
                  </span>
                </div>
                <p className="text-sm text-slate-400 line-clamp-1">{t.description}</p>
                {/* PC only delete button */}
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
    </Layout>
  );
}

function matchTab(t: Tournament, key: TabKey): boolean {
  if (key === 'test') return t.isTest;
  if (t.isTest) return false; // テスト大会は通常タブに表示しない
  if (key === 'active') return t.status === 'active';
  if (key === 'upcoming') return t.status === 'waiting';
  return t.status === 'finished';
}

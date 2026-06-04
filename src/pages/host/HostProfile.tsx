import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import type { HostProfile as HostProfileType } from '../../lib/types';
import Layout from '../../components/Layout';

export default function HostProfile() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<HostProfileType | null>(null);
  const [editName, setEditName] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate('/host/login', { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const snap = await getDoc(doc(db, 'hosts', user.uid));
      if (snap.exists()) {
        const data = snap.data() as HostProfileType;
        setProfile(data);
        setEditName(data.displayName);
      } else {
        const fallback = user.displayName || user.email?.split('@')[0] || 'ホスト';
        setEditName(fallback);
        setProfile({ displayName: fallback, updatedAt: Timestamp.now() });
        // Auto-create profile
        await setDoc(doc(db, 'hosts', user.uid), {
          displayName: fallback,
          updatedAt: Timestamp.now(),
        });
      }
    };
    load();
  }, [user]);

  const handleSave = async () => {
    if (!user || !editName.trim()) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'hosts', user.uid), {
        displayName: editName.trim(),
        updatedAt: Timestamp.now(),
      });
      setProfile({ displayName: editName.trim(), updatedAt: Timestamp.now() });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/host/login', { replace: true });
  };

  if (loading || !user) return <Layout><p className="text-center py-16 text-stone-400">読み込み中...</p></Layout>;

  const providerIds = user.providerData.map((p) => p.providerId);
  const isGoogle = providerIds.includes('google.com');
  const isEmail = providerIds.includes('password');

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/host')} className="text-stone-400 hover:text-stone-700 text-2xl">←</button>
        <h1 className="text-2xl font-bold">マイページ</h1>
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200 mb-4 shadow-sm">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-full bg-orange-500 flex items-center justify-center text-2xl font-bold shrink-0 text-white">
            {(profile?.displayName || '?')[0]}
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex gap-2">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 px-3 py-2 bg-stone-100 border border-stone-200 rounded-lg focus:outline-none focus:border-orange-400 text-sm"
                  autoFocus
                />
                <button
                  onClick={handleSave}
                  disabled={!editName.trim() || saving}
                  className="px-3 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 rounded-lg text-xs font-bold text-white"
                >
                  {saving ? '...' : '保存'}
                </button>
                <button
                  onClick={() => { setEditing(false); setEditName(profile?.displayName || ''); }}
                  className="px-3 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-xs"
                >
                  取消
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold truncate">{profile?.displayName}</p>
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs text-orange-500 hover:text-orange-600 shrink-0"
                >
                  編集
                </button>
              </div>
            )}
            <p className="text-xs text-stone-400 mt-0.5">ホスト</p>
          </div>
        </div>
      </div>

      {/* Login info */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200 mb-4 shadow-sm">
        <h3 className="text-sm font-bold text-stone-600 mb-3">ログイン情報</h3>
        <div className="space-y-3 text-sm">
          {user.email && (
            <div className="flex justify-between">
              <span className="text-stone-400">メールアドレス</span>
              <span className="text-stone-700">{user.email}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-stone-400">認証方法</span>
            <div className="flex gap-2">
              {isGoogle && (
                <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs font-bold">Google</span>
              )}
              {isEmail && (
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold">メール/パスワード</span>
              )}
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-400">UID</span>
            <span className="text-stone-400 text-xs font-mono truncate max-w-[180px]">{user.uid}</span>
          </div>
        </div>
      </div>

      {/* Help */}
      <button
        onClick={() => navigate('/host/help')}
        className="w-full py-3 bg-white hover:bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-600 transition-colors mb-3 shadow-sm"
      >
        ヘルプ・操作マニュアル
      </button>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full py-3 bg-stone-100 hover:bg-red-50 rounded-xl font-bold text-red-500 transition-colors border border-stone-200"
      >
        ログアウト
      </button>
    </Layout>
  );
}

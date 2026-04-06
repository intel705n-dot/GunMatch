import { useState, useEffect } from 'react';
import { collection, addDoc, doc, getDoc, Timestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import Layout from '../../components/Layout';
import QRCodeDisplay from '../../components/QRCodeDisplay';

export default function HostCreate() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) navigate('/host/login', { replace: true });
  }, [loading, user, navigate]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tableCount, setTableCount] = useState(5);
  const [timerMinutes, setTimerMinutes] = useState(35);
  const [afterBattleBuffer, setAfterBattleBuffer] = useState(3);
  const [matchingTimeout, setMatchingTimeout] = useState(3);
  const [matchingDeadline, setMatchingDeadline] = useState('');
  const [isTest, setIsTest] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !user) return;
    setCreating(true);
    try {
      // Get host display name
      let hostName = user.displayName || user.email?.split('@')[0] || 'ホスト';
      const hostSnap = await getDoc(doc(db, 'hosts', user.uid));
      if (hostSnap.exists()) hostName = hostSnap.data().displayName || hostName;

      const docRef = await addDoc(collection(db, 'tournaments'), {
        hostUid: user.uid,
        hostName,
        name: name.trim(),
        description: description.trim(),
        tableCount,
        timerMinutes,
        matchingDeadline: matchingDeadline ? (() => {
          const [h, m] = matchingDeadline.split(':').map(Number);
          const d = new Date(); d.setHours(h, m, 0, 0);
          return Timestamp.fromDate(d);
        })() : null,
        afterBattleBuffer,
        matchingTimeout,
        entryOpen: false,
        status: 'waiting',
        isTest,
        createdAt: Timestamp.now(),
      });
      setCreatedId(docRef.id);
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  const entryUrl = createdId
    ? `${window.location.origin}/entry/${createdId}`
    : '';

  if (createdId) {
    return (
      <Layout>
        <h1 className="text-2xl font-bold mb-6">大会作成完了</h1>
        <div className="bg-slate-800 rounded-xl p-6 mb-6 border border-slate-700">
          <h2 className="text-xl font-bold mb-4">{name}</h2>
          <QRCodeDisplay url={entryUrl} tournamentName={name} />
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/host/${createdId}`)}
            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold transition-colors"
          >
            管理画面へ
          </button>
          <button
            onClick={() => navigate('/host')}
            className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold transition-colors"
          >
            一覧に戻る
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/host')} className="text-slate-400 hover:text-white text-2xl">←</button>
        <h1 className="text-2xl font-bold">新規大会作成</h1>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">大会名 *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:border-indigo-500"
            placeholder="例：第1回ガンスリンガー大会"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">ルール・告知文</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:border-indigo-500 resize-none"
            placeholder="ルールや注意事項を入力"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">卓数</label>
            <input
              type="number"
              min={1}
              value={tableCount}
              onChange={(e) => setTableCount(Number(e.target.value))}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">対戦タイマー（分）</label>
            <input
              type="number"
              min={1}
              value={timerMinutes}
              onChange={(e) => setTimerMinutes(Number(e.target.value))}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">感想戦バッファ（分）</label>
            <select
              value={afterBattleBuffer}
              onChange={(e) => setAfterBattleBuffer(Number(e.target.value))}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:border-indigo-500"
            >
              {[0,1,2,3,4,5].map((v) => (
                <option key={v} value={v}>{v}分</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">マッチングタイムアウト（分）</label>
            <select
              value={matchingTimeout}
              onChange={(e) => setMatchingTimeout(Number(e.target.value))}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:border-indigo-500"
            >
              {[0,1,2,3,4,5].map((v) => (
                <option key={v} value={v}>{v}分</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">最終マッチング時間（任意）</label>
          <input
            type="time"
            value={matchingDeadline}
            onChange={(e) => setMatchingDeadline(e.target.value)}
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:border-indigo-500"
          />
          <p className="text-xs text-slate-500 mt-1">この時刻以降は新規マッチングを受け付けません。未設定なら制限なし。</p>
        </div>

        <label className="flex items-center gap-3 p-4 bg-slate-800 border border-slate-700 rounded-xl cursor-pointer">
          <input
            type="checkbox"
            checked={isTest}
            onChange={(e) => setIsTest(e.target.checked)}
            className="w-5 h-5 accent-yellow-500"
          />
          <div>
            <span className="font-bold">テストモード</span>
            <p className="text-sm text-slate-400">ダミープレイヤー・短縮タイマーで動作確認</p>
          </div>
        </label>

        <button
          onClick={handleCreate}
          disabled={!name.trim() || creating}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-xl font-bold text-lg transition-colors"
        >
          {creating ? '作成中...' : '大会を作成する'}
        </button>
      </div>
    </Layout>
  );
}

import { useState, useEffect } from 'react';
import {
  collection, addDoc, doc, getDoc, getDocs, deleteDoc, setDoc, Timestamp, query, orderBy,
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/useAuth';
import type { SeatRule, BestOf, Preset } from '../../lib/types';
import { CARD_GAME_GROUPS, getCardGame } from '../../lib/cardGames';
import Layout from '../../components/Layout';
import QRCodeDisplay from '../../components/QRCodeDisplay';
import CardGameBadge from '../../components/CardGameBadge';

const MAX_PRESETS = 5;

export default function HostCreate() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) navigate('/host/login', { replace: true });
  }, [loading, user, navigate]);

  // ── Form state ──
  const [name, setName] = useState('');
  const [cardGame, setCardGame] = useState('');
  const [cardGameOther, setCardGameOther] = useState('');
  const [description, setDescription] = useState('');
  const [tableCount, setTableCount] = useState(5);
  const [timerMinutes, setTimerMinutes] = useState(35);
  const [bestOf, setBestOf] = useState<BestOf>(1);
  const [afterBattleBuffer, setAfterBattleBuffer] = useState(1);
  const [matchingTimeout, setMatchingTimeout] = useState(1);
  const [matchingDeadline, setMatchingDeadline] = useState('');
  const [seatRule, setSeatRule] = useState<SeatRule>('winner-stays');
  const [streakLimit, setStreakLimit] = useState(0);
  const [isTest, setIsTest] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // ── Preset state ──
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [presetName, setPresetName] = useState('');
  const [showPresetSave, setShowPresetSave] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetSaved, setPresetSaved] = useState(false);
  const [showPostSaveSuggestion, setShowPostSaveSuggestion] = useState(true);
  const [postPresetName, setPostPresetName] = useState('');
  const [postSaving, setPostSaving] = useState(false);
  const [postSaved, setPostSaved] = useState(false);

  // ── Load presets ──
  useEffect(() => {
    if (!user) return;
    const presetsRef = collection(db, 'hosts', user.uid, 'presets');
    getDocs(query(presetsRef, orderBy('createdAt', 'desc'))).then((snap) => {
      setPresets(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Preset)));
    });
  }, [user]);

  // ── Apply preset ──
  const applyPreset = (presetId: string) => {
    setSelectedPreset(presetId);
    if (presetId === '' || presetId === '__default__') {
      setCardGame('');
      setCardGameOther('');
      setDescription('');
      setTableCount(5);
      setTimerMinutes(35);
      setBestOf(1);
      setAfterBattleBuffer(1);
      setMatchingTimeout(1);
      setMatchingDeadline('');
      setSeatRule('winner-stays');
      setStreakLimit(0);
      return;
    }
    const p = presets.find((pr) => pr.id === presetId);
    if (!p) return;
    setCardGame(p.cardGame);
    setCardGameOther(p.cardGameOther ?? '');
    setDescription(p.description);
    setTableCount(p.tableCount);
    setTimerMinutes(p.timerMinutes);
    setBestOf(p.bestOf ?? 1);
    setAfterBattleBuffer(p.afterBattleBuffer);
    setMatchingTimeout(p.matchingTimeout);
    setMatchingDeadline(p.matchingDeadline ?? '');
    setSeatRule(p.seatRule);
    setStreakLimit(p.streakLimit);
  };

  // ── Delete preset ──
  const deletePreset = async (presetId: string) => {
    if (!user) return;
    if (!confirm('このプリセットを削除しますか？')) return;
    await deleteDoc(doc(db, 'hosts', user.uid, 'presets', presetId));
    setPresets((prev) => prev.filter((p) => p.id !== presetId));
    if (selectedPreset === presetId) setSelectedPreset('');
  };

  // ── Build preset data from current form ──
  const buildPresetData = () => ({
    cardGame,
    cardGameOther: cardGame === 'other' ? cardGameOther : '',
    description,
    tableCount,
    timerMinutes,
    bestOf,
    afterBattleBuffer,
    matchingTimeout,
    matchingDeadline: matchingDeadline || null,
    seatRule,
    streakLimit: seatRule === 'both-leave' ? 0 : streakLimit,
    createdAt: Timestamp.now(),
  });

  // ── Save preset (from form) ──
  const savePreset = async () => {
    if (!user || !presetName.trim()) return;
    setSavingPreset(true);
    try {
      const existing = presets.find((p) => p.name === presetName.trim());
      if (existing) {
        if (!confirm(`"${presetName.trim()}" は既に存在します。上書きしますか？`)) {
          setSavingPreset(false);
          return;
        }
        await deleteDoc(doc(db, 'hosts', user.uid, 'presets', existing.id));
        setPresets((prev) => prev.filter((p) => p.id !== existing.id));
      } else if (presets.length >= MAX_PRESETS) {
        alert(`プリセットは最大${MAX_PRESETS}件までです。不要なプリセットを削除してください。`);
        setSavingPreset(false);
        return;
      }
      const ref = await addDoc(collection(db, 'hosts', user.uid, 'presets'), {
        name: presetName.trim(),
        ...buildPresetData(),
      });
      setPresets((prev) => [{ id: ref.id, name: presetName.trim(), ...buildPresetData() } as Preset, ...prev]);
      setPresetSaved(true);
      setTimeout(() => { setPresetSaved(false); setShowPresetSave(false); setPresetName(''); }, 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingPreset(false);
    }
  };

  // ── Save preset (post-creation) ──
  const savePostPreset = async () => {
    if (!user || !postPresetName.trim()) return;
    setPostSaving(true);
    try {
      const existing = presets.find((p) => p.name === postPresetName.trim());
      if (existing) {
        if (!confirm(`"${postPresetName.trim()}" は既に存在します。上書きしますか？`)) {
          setPostSaving(false);
          return;
        }
        await deleteDoc(doc(db, 'hosts', user.uid, 'presets', existing.id));
        setPresets((prev) => prev.filter((p) => p.id !== existing.id));
      } else if (presets.length >= MAX_PRESETS) {
        alert(`プリセットは最大${MAX_PRESETS}件までです。`);
        setPostSaving(false);
        return;
      }
      const ref = await addDoc(collection(db, 'hosts', user.uid, 'presets'), {
        name: postPresetName.trim(),
        ...buildPresetData(),
      });
      setPresets((prev) => [{ id: ref.id, name: postPresetName.trim(), ...buildPresetData() } as Preset, ...prev]);
      setPostSaved(true);
    } catch (e) {
      console.error(e);
    } finally {
      setPostSaving(false);
    }
  };

  // ── Create tournament ──
  const canCreate = name.trim() && cardGame && (cardGame !== 'other' || cardGameOther.trim());

  const handleCreate = async () => {
    if (!canCreate || !user) return;
    setCreating(true);
    try {
      let hostName = user.displayName || user.email?.split('@')[0] || 'ホスト';
      const hostSnap = await getDoc(doc(db, 'hosts', user.uid));
      if (hostSnap.exists()) hostName = hostSnap.data().displayName || hostName;

      const docRef = await addDoc(collection(db, 'tournaments'), {
        hostUid: user.uid,
        hostName,
        name: name.trim(),
        cardGame,
        cardGameOther: cardGame === 'other' ? cardGameOther.trim() : null,
        description: description.trim(),
        tableCount,
        timerMinutes,
        bestOf,
        matchingDeadline: matchingDeadline ? (() => {
          const [h, m] = matchingDeadline.split(':').map(Number);
          const d = new Date(); d.setHours(h, m, 0, 0);
          return Timestamp.fromDate(d);
        })() : null,
        afterBattleBuffer,
        matchingTimeout,
        seatRule,
        streakLimit: seatRule === 'both-leave' ? 0 : streakLimit,
        entryOpen: false,
        status: 'waiting',
        isTest,
        playerCount: 0,
        createdAt: Timestamp.now(),
      });
      await setDoc(doc(db, 'tournaments', docRef.id, 'meta', 'counters'), {
        nextEntryNumber: 1,
        playerCount: 0,
        updatedAt: Timestamp.now(),
      });
      setCreatedId(docRef.id);
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  const entryUrl = createdId ? `${window.location.origin}/entry/${createdId}` : '';

  // ── Post-creation screen ──
  if (createdId) {
    return (
      <Layout>
        <h1 className="text-2xl font-bold mb-6">大会作成完了</h1>
        <div className="bg-white rounded-2xl p-6 mb-6 border border-stone-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xl font-bold">{name}</h2>
            {cardGame && <CardGameBadge cardGameId={cardGame} cardGameOther={cardGameOther} />}
          </div>
          <QRCodeDisplay url={entryUrl} tournamentName={name} />
        </div>

        {showPostSaveSuggestion && !postSaved && (
          <div className="bg-white rounded-2xl p-4 mb-6 border border-stone-200 shadow-sm">
            <p className="text-sm text-stone-600 mb-3">この設定をプリセットとして保存しますか？</p>
            <div className="flex gap-2">
              <input
                value={postPresetName}
                onChange={(e) => setPostPresetName(e.target.value)}
                placeholder="プリセット名"
                className="flex-1 px-3 py-2 bg-stone-100 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
              <button
                onClick={savePostPreset}
                disabled={!postPresetName.trim() || postSaving}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-stone-200 disabled:text-stone-400 rounded-lg text-sm font-bold transition-colors text-white"
              >
                {postSaving ? '...' : '保存'}
              </button>
              <button
                onClick={() => setShowPostSaveSuggestion(false)}
                className="px-3 py-2 text-stone-400 hover:text-stone-600 text-sm"
              >
                不要
              </button>
            </div>
            <p className="text-xs text-stone-400 mt-2">次回の大会作成時にワンタップで呼び出せます（{presets.length}/{MAX_PRESETS}件）</p>
          </div>
        )}
        {postSaved && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-6 text-center">
            <p className="text-sm text-emerald-600 font-bold">プリセットを保存しました</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/host/${createdId}`)}
            className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 rounded-xl font-bold transition-colors text-white"
          >
            管理画面へ
          </button>
          <button
            onClick={() => navigate('/host')}
            className="flex-1 py-3 bg-stone-100 hover:bg-stone-200 rounded-xl font-bold transition-colors border border-stone-200"
          >
            一覧に戻る
          </button>
        </div>
      </Layout>
    );
  }

  // ── Form screen ──
  const selectedGame = cardGame ? getCardGame(cardGame) : null;

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/host')} className="text-stone-400 hover:text-stone-700 text-2xl">{'←'}</button>
        <h1 className="text-2xl font-bold">新規大会作成</h1>
      </div>

      <div className="space-y-4">
        {/* ── Preset loader ── */}
        {presets.length > 0 && (
          <div className="bg-stone-50 rounded-xl p-4 border border-stone-200">
            <label className="block text-sm text-stone-500 mb-2">プリセットから読み込み</label>
            <div className="flex gap-2">
              <select
                value={selectedPreset}
                onChange={(e) => applyPreset(e.target.value)}
                className="flex-1 px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-orange-400"
              >
                <option value="">-- 選択してください --</option>
                <option value="__default__">デフォルト設定に戻す</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {selectedPreset && selectedPreset !== '__default__' && (
                <button
                  onClick={() => deletePreset(selectedPreset)}
                  className="px-3 py-2 bg-white hover:bg-red-50 text-stone-400 hover:text-red-500 rounded-lg text-sm transition-colors border border-stone-200"
                  title="プリセット削除"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── 大会名 ── */}
        <div>
          <label className="block text-sm text-stone-500 mb-1">大会名 *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
            placeholder="例：第1回ガンスリンガー大会"
          />
        </div>

        {/* ── カードゲーム種別 ── */}
        <div>
          <label className="block text-sm text-stone-500 mb-1">カードゲーム *</label>
          <select
            value={cardGame}
            onChange={(e) => setCardGame(e.target.value)}
            className="w-full px-4 py-3 bg-stone-100 border rounded-xl focus:outline-none focus:border-orange-400"
            style={{ borderColor: selectedGame ? selectedGame.colors.border : undefined }}
          >
            <option value="" disabled>カードゲームを選択してください</option>
            {CARD_GAME_GROUPS.map((group, gi) => (
              <optgroup key={gi} label=" ">
                {group.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {cardGame && (
            <div className="mt-2">
              <CardGameBadge cardGameId={cardGame} cardGameOther={cardGameOther} size="md" />
            </div>
          )}
          {cardGame === 'other' && (
            <input
              value={cardGameOther}
              onChange={(e) => setCardGameOther(e.target.value)}
              className="w-full mt-2 px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:border-orange-400"
              placeholder="カードゲーム名を入力"
            />
          )}
        </div>

        {/* ── ルール・告知文 ── */}
        <div>
          <label className="block text-sm text-stone-500 mb-1">ルール・告知文</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:border-orange-400 resize-none"
            placeholder="ルールや注意事項を入力"
          />
        </div>

        {/* ── 卓数 / タイマー ── */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-stone-500 mb-1">卓数</label>
            <input
              type="number"
              min={1}
              value={tableCount}
              onChange={(e) => setTableCount(Number(e.target.value))}
              className="w-full px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:border-orange-400"
            />
            <p className="text-xs text-stone-400 mt-1">同時に対戦できる卓の数</p>
          </div>
          <div>
            <label className="block text-sm text-stone-500 mb-1">対戦タイマー（分）</label>
            <input
              type="number"
              min={1}
              value={timerMinutes}
              onChange={(e) => setTimerMinutes(Number(e.target.value))}
              className="w-full px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:border-orange-400"
            />
            <p className="text-xs text-stone-400 mt-1">1対戦あたりの制限時間</p>
          </div>
        </div>

        {/* ── BO設定 ── */}
        <div>
          <label className="block text-sm text-stone-500 mb-2">対戦形式</label>
          <div className="grid grid-cols-3 gap-2">
            {([1, 3, 5] as BestOf[]).map((bo) => (
              <button
                key={bo}
                type="button"
                onClick={() => setBestOf(bo)}
                className={`py-3 rounded-xl font-bold text-sm transition-colors border ${
                  bestOf === bo
                    ? 'bg-orange-50 border-orange-300 text-orange-600'
                    : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'
                }`}
              >
                BO{bo}
                <span className="block text-xs font-normal mt-0.5 text-stone-400">
                  {bo === 1 ? '1本勝負' : `${Math.ceil(bo / 2)}本先取`}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-stone-400 mt-1">BO3=2本先取、BO5=3本先取。タイマーはマッチ全体に適用されます。</p>
        </div>

        {/* ── バッファ / タイムアウト ── */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-stone-500 mb-1">感想戦バッファ（分）</label>
            <select
              value={afterBattleBuffer}
              onChange={(e) => setAfterBattleBuffer(Number(e.target.value))}
              className="w-full px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:border-orange-400"
            >
              {[0,1,2,3,4,5].map((v) => (
                <option key={v} value={v}>{v}分</option>
              ))}
            </select>
            <p className="text-xs text-stone-400 mt-1">対戦終了後、卓を確保する時間</p>
          </div>
          <div>
            <label className="block text-sm text-stone-500 mb-1">マッチングタイムアウト（分）</label>
            <select
              value={matchingTimeout}
              onChange={(e) => setMatchingTimeout(Number(e.target.value))}
              className="w-full px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:border-orange-400"
            >
              {[0,1,2,3,4,5].map((v) => (
                <option key={v} value={v}>{v}分</option>
              ))}
            </select>
            <p className="text-xs text-stone-400 mt-1">相手が見つからない場合の自動キャンセル時間</p>
          </div>
        </div>

        {/* ── 最終マッチング時間 ── */}
        <div>
          <label className="block text-sm text-stone-500 mb-1">最終マッチング時間（任意）</label>
          <input
            type="time"
            value={matchingDeadline}
            onChange={(e) => setMatchingDeadline(e.target.value)}
            className="w-full px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:border-orange-400"
          />
          <p className="text-xs text-stone-400 mt-1">この時刻以降は新規マッチングを受け付けません。未設定なら制限なし。</p>
        </div>

        {/* ── 席移動ルール ── */}
        <div>
          <label className="block text-sm text-stone-500 mb-2">席移動ルール</label>
          <div className="space-y-2">
            {([
              { value: 'winner-stays' as SeatRule, label: '勝ち残り', desc: '勝者がその卓に残り、敗者が移動します' },
              { value: 'loser-stays' as SeatRule, label: '負け残り', desc: '敗者がその卓に残り、勝者が移動します' },
              { value: 'both-leave' as SeatRule, label: '都度解散', desc: '毎回両者が移動します' },
            ]).map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${
                  seatRule === opt.value
                    ? 'bg-orange-50 border-orange-300'
                    : 'bg-white border-stone-200 hover:border-stone-300'
                }`}
              >
                <input
                  type="radio"
                  name="seatRule"
                  value={opt.value}
                  checked={seatRule === opt.value}
                  onChange={() => setSeatRule(opt.value)}
                  className="mt-0.5 accent-orange-500"
                />
                <div>
                  <span className="font-bold text-sm">{opt.label}</span>
                  <p className="text-xs text-stone-400 mt-0.5">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* ── 連勝制限 ── */}
        {seatRule !== 'both-leave' && (
          <div>
            <label className="block text-sm text-stone-500 mb-1">
              連勝制限
              <span className="text-xs text-stone-400 ml-1">
                ({seatRule === 'winner-stays' ? '連勝' : '連敗'}で強制離席)
              </span>
            </label>
            <select
              value={streakLimit}
              onChange={(e) => setStreakLimit(Number(e.target.value))}
              className="w-full px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:border-orange-400"
            >
              <option value={0}>なし（無制限）</option>
              {[2,3,4,5,6,7,8,9,10].map((v) => (
                <option key={v} value={v}>{v}{seatRule === 'winner-stays' ? '連勝' : '連敗'}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── テストモード ── */}
        <label className="flex items-center gap-3 p-4 bg-white border border-stone-200 rounded-xl cursor-pointer shadow-sm">
          <input
            type="checkbox"
            checked={isTest}
            onChange={(e) => setIsTest(e.target.checked)}
            className="w-5 h-5 accent-amber-500"
          />
          <div>
            <span className="font-bold">テストモード</span>
            <p className="text-sm text-stone-500">ダミープレイヤー・短縮タイマーで動作確認</p>
          </div>
        </label>

        {/* ── プリセット保存 ── */}
        <div className="border-t border-stone-200 pt-4">
          {!showPresetSave ? (
            <button
              onClick={() => setShowPresetSave(true)}
              className="w-full py-2.5 text-sm text-stone-500 hover:text-stone-700 bg-white hover:bg-stone-50 border border-stone-200 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
              この設定をプリセットとして保存
            </button>
          ) : presetSaved ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
              <p className="text-sm text-emerald-600 font-bold">保存しました</p>
            </div>
          ) : (
            <div className="bg-white border border-stone-200 rounded-xl p-3 shadow-sm">
              <div className="flex gap-2">
                <input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="プリセット名"
                  className="flex-1 px-3 py-2 bg-stone-100 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                />
                <button
                  onClick={savePreset}
                  disabled={!presetName.trim() || savingPreset}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-stone-200 disabled:text-stone-400 rounded-lg text-sm font-bold transition-colors text-white"
                >
                  {savingPreset ? '...' : '保存'}
                </button>
                <button
                  onClick={() => { setShowPresetSave(false); setPresetName(''); }}
                  className="px-3 py-2 text-stone-400 hover:text-stone-600 text-sm"
                >
                  取消
                </button>
              </div>
              <p className="text-xs text-stone-400 mt-2">大会名・テストモードを除く全設定が保存されます（{presets.length}/{MAX_PRESETS}件）</p>
            </div>
          )}
        </div>

        {/* ── 作成ボタン ── */}
        <button
          onClick={handleCreate}
          disabled={!canCreate || creating}
          className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-stone-200 disabled:text-stone-400 rounded-xl font-bold text-lg transition-colors text-white shadow-md shadow-orange-500/20"
        >
          {creating ? '作成中...' : '大会を作成する'}
        </button>
      </div>
    </Layout>
  );
}

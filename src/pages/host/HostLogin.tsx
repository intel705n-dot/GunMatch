import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../lib/useAuth';
import Layout from '../../components/Layout';

export default function HostLogin() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already logged in -> redirect
  useEffect(() => {
    if (!loading && user) {
      navigate('/host', { replace: true });
    }
  }, [loading, user, navigate]);

  if (!loading && user) return null;

  const handleGoogle = async () => {
    setError('');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      navigate('/host', { replace: true });
    } catch (e: unknown) {
      const code = typeof e === 'object' && e && 'code' in e ? String(e.code) : '';
      if (code !== 'auth/popup-closed-by-user') {
        setError('Googleログインに失敗しました');
      }
    }
  };

  const handleEmailSubmit = async () => {
    if (!email.trim() || !password.trim()) return;
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      }
      navigate('/host', { replace: true });
    } catch (e: unknown) {
      const code = typeof e === 'object' && e && 'code' in e ? String(e.code) : 'unknown';
      const messages: Record<string, string> = {
        'auth/invalid-email': 'メールアドレスの形式が正しくありません',
        'auth/user-not-found': 'アカウントが見つかりません',
        'auth/wrong-password': 'パスワードが正しくありません',
        'auth/invalid-credential': 'メールアドレスまたはパスワードが正しくありません',
        'auth/email-already-in-use': 'このメールアドレスは既に登録されています',
        'auth/weak-password': 'パスワードは6文字以上にしてください',
      };
      setError(messages[code] || `エラーが発生しました (${code})`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="text-center mb-8 pt-8">
        <h1 className="text-4xl font-black mb-2 tracking-tight">
          <span className="text-orange-500">vs</span>
          <span className="text-stone-900"> navi</span>
        </h1>
        <p className="text-stone-500">ログイン</p>
        <p className="text-xs text-stone-400 mt-1">大会の主催・参加ができます</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Google login */}
      <button
        onClick={handleGoogle}
        className="w-full py-3 bg-white text-stone-800 rounded-xl font-bold text-base flex items-center justify-center gap-3 hover:bg-stone-50 transition-colors mb-4 border border-stone-200 shadow-sm"
      >
        <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Googleでログイン
      </button>

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-stone-200" />
        <span className="text-sm text-stone-400">または</span>
        <div className="flex-1 h-px bg-stone-200" />
      </div>

      {/* Email/Password tabs */}
      <div className="flex mb-4 bg-stone-100 rounded-xl p-1">
        <button
          onClick={() => { setMode('login'); setError(''); }}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
            mode === 'login' ? 'bg-orange-500 text-white' : 'text-stone-400'
          }`}
        >
          ログイン
        </button>
        <button
          onClick={() => { setMode('register'); setError(''); }}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
            mode === 'register' ? 'bg-orange-500 text-white' : 'text-stone-400'
          }`}
        >
          新規登録
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm text-stone-500 mb-1">メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
            placeholder="host@example.com"
          />
        </div>
        <div>
          <label className="block text-sm text-stone-500 mb-1">パスワード</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
            placeholder="6文字以上"
            onKeyDown={(e) => e.key === 'Enter' && handleEmailSubmit()}
          />
        </div>
        <button
          onClick={handleEmailSubmit}
          disabled={!email.trim() || !password.trim() || submitting}
          className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-stone-200 disabled:text-stone-400 rounded-xl font-bold text-lg transition-colors text-white"
        >
          {submitting ? '処理中...' : mode === 'login' ? 'ログイン' : 'アカウント作成'}
        </button>
      </div>
    </Layout>
  );
}

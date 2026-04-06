import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';

interface Section {
  title: string;
  content: string[];
}

const hostSections: Section[] = [
  {
    title: 'アカウント作成・ログイン',
    content: [
      '「Googleでログイン」ボタンからGoogleアカウントでワンクリックログインできます。',
      'またはメールアドレスとパスワード（6文字以上）で新規登録・ログインも可能です。',
      'ログイン後は自動的に大会一覧画面に遷移します。',
    ],
  },
  {
    title: 'マイページ',
    content: [
      '画面右上の人型アイコンからマイページを開けます。',
      'ハンドルネームの設定・変更ができます。ここで設定した名前が大会の「主催者名」として表示されます。',
      'ログイン情報（メールアドレス・認証方法）の確認やログアウトもここから行えます。',
    ],
  },
  {
    title: '大会の作成',
    content: [
      '大会一覧画面の「+ 新規作成」ボタンから大会を作成します。',
      '【大会名】大会のタイトルを入力します（必須）。',
      '【ルール・告知文】ルールや注意事項を入力します。プレイヤーのエントリー画面に表示されます。',
      '【卓数】同時に対戦できるテーブルの数です。会場のスペースに合わせて設定してください。',
      '【対戦タイマー】1試合の制限時間（分）です。ポケカ公式の25分や35分が一般的です。',
      '【感想戦バッファ】対戦終了後、次のマッチングまでの猶予時間（分）です。感想戦や片付けの時間として使えます。',
      '【マッチングタイムアウト】マッチング待機の自動キャンセル時間（分）です。0分で無制限になります。',
      '【テストモード】ダミープレイヤーと短縮タイマーで動作確認ができます。本番前のテストにお使いください。',
      '作成完了後、プレイヤー用のQRコードが表示されます。PNGでダウンロードも可能です。',
    ],
  },
  {
    title: '大会当日の運営フロー',
    content: [
      '1. 大会一覧から対象の大会をタップして管理画面を開きます。',
      '2.「エントリー開始」ボタンを押すとプレイヤーがエントリーできるようになります。',
      '3. QRコードを会場で掲示し、プレイヤーにスキャンしてもらいます。',
      '4. プレイヤーがマッチング開始すると自動的にペアリングされ、空き卓に割り当てられます。',
      '5. 進行中マッチは管理画面でリアルタイム確認できます（卓番号・対戦者名・残り時間）。',
      '6. 勝敗はプレイヤーが自分で登録します。誤りがあれば完了マッチの「修正」ボタンで変更可能です。',
      '7. イベント終了時に「大会終了」ボタンを押すと、ランキングが確定します。',
    ],
  },
  {
    title: 'テストモードの使い方',
    content: [
      '大会作成時に「テストモード」にチェックを入れると有効になります。',
      '管理画面に専用パネルが表示され、以下の操作ができます：',
      '・ダミープレイヤー追加：指定人数のダミーを一括追加します。',
      '・全員キュー投入：全ダミープレイヤーをマッチング待ちにします。',
      '・勝敗自動登録：進行中の全マッチにランダムな勝敗を付けます。',
      'タイマーは通常の1/60に短縮されるため、素早く全体の流れを確認できます。',
      'テスト大会は大会一覧の「テスト」タブにまとめて表示されます。',
    ],
  },
  {
    title: '大会の削除',
    content: [
      '【スマートフォン】大会一覧で大会カードを左にスワイプ →「削除する」→ 確認ダイアログでOK。',
      '【PC】大会カード内のステータス下にある「削除」ボタンをクリック → 確認ダイアログでOK。',
      '※削除すると参加者データ・対戦履歴も全て消去されます。この操作は元に戻せません。',
    ],
  },
];

const playerSections: Section[] = [
  {
    title: 'エントリー方法',
    content: [
      '1. 主催者が掲示したQRコードをスマートフォンでスキャンします。',
      '2. エントリー画面でハンドルネーム（必須）を入力します。',
      '3. X（旧Twitter）IDは任意ですが、入力しておくと端末を変えても再ログインできます。',
      '4.「エントリーする」ボタンをタップして完了です。',
    ],
  },
  {
    title: 'マッチングと対戦',
    content: [
      '1.「マッチング開始」ボタンをタップすると対戦相手の検索が始まります。',
      '2. 相手が見つかると通知（バイブレーション）とともに対戦画面に切り替わります。',
      '3. 指定された卓番号のテーブルで対戦してください。',
      '4. 画面にカウントダウンタイマーが表示されます（残り60秒で赤く点滅）。',
      '5. 対戦が終わったら「自分が勝った」または「相手が勝った」ボタンで結果を登録します。',
      '6. 結果登録後、再び「マッチング開始」で次の対戦に進めます。',
      '※同じ相手との連続マッチングは自動で回避されます（参加人数に応じて調整）。',
    ],
  },
  {
    title: '再ログイン',
    content: [
      'ブラウザを閉じてしまった場合や端末を変更した場合は、エントリー画面の「再ログイン」タブを使います。',
      'エントリー時に登録したX IDを入力すると、戦績を引き継いで復帰できます。',
      '※X IDを登録していない場合は再ログインできません。',
    ],
  },
  {
    title: 'ランキングの見方',
    content: [
      '大会終了後、「ランキング」タブで順位を確認できます。',
      '【順位の決定方法（優先順）】',
      '1. 勝利数（多い方が上位）',
      '2. 勝率（勝利数 ÷ 総対戦数）',
      '3. OMW%（オポネント・マッチ・ウィン率）',
      '【OMW%とは？】',
      '自分が対戦した相手全員の勝率の平均値です。強い相手と多く戦った人ほど高くなります。',
      '同じ勝敗数でも、より強い相手に勝っていた人が上位になる仕組みです。',
      '（各相手の勝率の下限は25%で計算 - ポケモンカードゲーム公式準拠）',
    ],
  },
  {
    title: '退室',
    content: [
      '画面右上の「退室」ボタンをタップするとエントリー画面に戻ります。',
      '※戦績データは保持されるため、X IDで再ログインすれば復帰可能です。',
    ],
  },
];

const faqSections: Section[] = [
  {
    title: '感想戦バッファとは？',
    content: [
      '対戦終了後、その卓が次のマッチングに使われるまでの猶予時間です。',
      '対戦後の振り返りやデッキの片付け時間を確保するために設定します。',
      '0分に設定すると、勝敗登録後すぐに卓が解放されます。',
    ],
  },
  {
    title: 'マッチングタイムアウトとは？',
    content: [
      'マッチング待機が指定時間を超えた場合に自動でキャンセルされる機能です。',
      '対戦相手が見つからないまま長時間待つのを防ぎます。',
      '0分に設定すると無制限（手動キャンセルのみ）になります。',
    ],
  },
  {
    title: '同じ相手と何回も当たりますか？',
    content: [
      '参加者数に応じて自動的に重複回避が働きます。',
      '・10人以上：直近2戦の相手を回避',
      '・5〜9人：直近1戦の相手を回避（連続再戦防止）',
      '・4人以下：制限なし',
      '対象の相手しかキューにいない場合は制限が解除されます。',
    ],
  },
  {
    title: '代理エントリーとは？',
    content: [
      'スマートフォンを持っていないプレイヤーの代わりに、ホストがエントリーする機能です。',
      '管理画面の「代理エントリー」欄にハンドルネームを入力して追加します。',
      '代理エントリーのプレイヤーの勝敗はホストが管理画面から登録します。',
    ],
  },
  {
    title: '勝敗を間違えて登録してしまった',
    content: [
      'ホストの管理画面 →「完了マッチ」一覧の「修正」ボタンから勝敗を変更できます。',
      '修正すると勝敗数とランキングが自動的に再計算されます。',
    ],
  },
];

function Accordion({ sections }: { sections: Section[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      {sections.map((s, i) => (
        <div key={i} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-slate-750 transition-colors"
          >
            <span className="font-bold text-sm">{s.title}</span>
            <span className="text-slate-400 text-lg">{openIndex === i ? '−' : '+'}</span>
          </button>
          {openIndex === i && (
            <div className="px-4 pb-4 space-y-2">
              {s.content.map((line, j) => (
                <p key={j} className="text-sm text-slate-300 leading-relaxed">{line}</p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function HostHelp() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'host' | 'player' | 'faq'>('host');

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white text-2xl">←</button>
        <h1 className="text-2xl font-bold">ヘルプ</h1>
      </div>

      {/* Tabs */}
      <div className="flex mb-4 bg-slate-800 rounded-xl p-1">
        <button
          onClick={() => setTab('host')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${tab === 'host' ? 'bg-indigo-600' : 'text-slate-400'}`}
        >
          ホスト向け
        </button>
        <button
          onClick={() => setTab('player')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${tab === 'player' ? 'bg-indigo-600' : 'text-slate-400'}`}
        >
          プレイヤー向け
        </button>
        <button
          onClick={() => setTab('faq')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${tab === 'faq' ? 'bg-indigo-600' : 'text-slate-400'}`}
        >
          よくある質問
        </button>
      </div>

      {tab === 'host' && <Accordion sections={hostSections} />}
      {tab === 'player' && <Accordion sections={playerSections} />}
      {tab === 'faq' && <Accordion sections={faqSections} />}
    </Layout>
  );
}

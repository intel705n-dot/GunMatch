# CLAUDE.md — vs navi (旧 GunMatch / TCG Match Navi)

このファイルはこのリポジトリで作業する Claude / Codex 向けのプロジェクトメモ。
作業前に必ず読むこと。

---

## 1. プロジェクト概要

TCG(トレーディングカードゲーム)の **ガンスリンガー形式大会** をリアルタイムで運営・参加できるスマホ向けWebアプリ。

- **正式名称**: vs navi(バーサスナビ)
- **過去名**: GunMatch → TCG Match Navi(マチナビ / TMN) → **vs navi**
- **本番URL**: https://gunmatch-app.web.app
- **ターゲット**: TCGプレイヤー(ポケカ・遊戯王・MTG等)、大会主催者。10代後半〜30代

> ⚠️ **Firebase プロジェクトID と GitHub リポ名は古いまま** (`gunmatch-app` / `GunMatch`)。コードベースだけリネーム済み。データ移行を伴うので変更未実施。issue として残してOK。

### ガンスリンガー形式とは
固定対戦表ではなく、空いてる人同士を都度マッチングしてくスタイル。卓数が会場制約。卓ルール(勝ち残り / 負け残り / 都度解散)が選べる。

---

## 2. 開発者情報

- **開発者ハンドル**: めし
- **対人関係表記**: TCG関連は「めし」、レジャラース社内では「中谷 健」(本プロジェクトは「めし」)
- **メールアドレス**: intel705n@gmail.com
- **Firebase / GitHub**: 同メールでログイン

---

## 3. 技術スタック

| 領域 | 採用 |
|---|---|
| フレームワーク | React 19 + TypeScript + Vite |
| スタイリング | Tailwind CSS v4 |
| ルーター | react-router-dom |
| バックエンド | Firebase Firestore + Auth(Google/Email/Anonymous) + Hosting |
| Firestoreプラン | **Spark(無料)** — Blaze には上げてない |
| QRコード | qrcode.react + html5-qrcode |
| デプロイ | Firebase Hosting(`npx firebase deploy --only hosting`) |

### 重要な制約: 無料枠死守
- Cloud Functions は使ってない(Blaze必要)
- すべてのロジックがクライアントサイド
- Firestore の read/write 量を意識する。リスナ貼りっぱなし・全件取得のループは避ける

---

## 4. ディレクトリ構造

```
gunmatch/
├── src/
│   ├── components/
│   │   ├── Layout.tsx               # ベース背景 (#FAF9F7)
│   │   ├── Timer.tsx                # オレンジ→残り60秒で赤パルス
│   │   ├── QRCodeDisplay.tsx
│   │   ├── Ranking.tsx              # OMW% 計算入り
│   │   ├── CardGameBadge.tsx        # TCGタイトル別バッジ
│   │   └── SwipeToDelete.tsx        # スマホでの大会削除
│   ├── lib/
│   │   ├── firebase.ts              # Firebase初期化
│   │   ├── AuthContext.tsx          # useAuth() フック
│   │   ├── matchingService.ts       # ★ コアロジック ★
│   │   ├── types.ts                 # ドメインモデル
│   │   ├── cardGames.ts             # 24TCGタイトル定義
│   │   └── dummyNames.ts            # テストモード用
│   ├── pages/
│   │   ├── host/
│   │   │   ├── HostLogin.tsx
│   │   │   ├── HostList.tsx         # 大会一覧 + 参加大会復帰バナー
│   │   │   ├── HostCreate.tsx       # プリセット機能あり
│   │   │   ├── HostManage.tsx       # 主催者の運営画面
│   │   │   ├── HostProfile.tsx
│   │   │   └── HostHelp.tsx
│   │   └── player/
│   │       ├── PlayerEntry.tsx      # QRからのエントリー
│   │       └── PlayerMain.tsx       # ★ 最重要 ★ 対戦・戦績画面
│   ├── index.css                    # Tailwind import のみ
│   └── main.tsx                     # ルーター定義
├── public/
│   └── favicon.svg                  # オレンジ背景に白「vs」
├── docs/
│   ├── design-brief.md              # デザイン仕様(claude.ai用に書いたが未使用)
│   └── logo-design-brief.md         # ロゴ仕様(旧)
├── firestore.rules                  # ★ 重要 ★ セキュリティルール
├── firestore.indexes.json
├── firebase.json
├── index.html                       # title="vs navi"
└── .env                             # gitignored、Firebase設定
```

---

## 5. ブランドカラー

ダークテーマ(slate-900 + indigo)から **ライト + オレンジ** に全面移行済み。

| 用途 | 値 |
|---|---|
| 背景メイン | `#FAF9F7` (ウォームホワイト) |
| 背景カード | `bg-white` + `shadow-sm` |
| 背景サブ | `bg-stone-100` |
| プライマリ | `bg-orange-500` (#F97316) / hover: `bg-orange-600` |
| プライマリLight | `bg-orange-50` |
| 成功・勝利 | `text-emerald-500` |
| エラー・敗北 | `text-red-500` |
| 警告・連勝 | `text-amber-500` |
| LIVE・対戦中 | `bg-red-500` 赤パルス |
| テキスト | `text-stone-900` (メイン) / `text-stone-500` (サブ) / `text-stone-400` (薄) |
| ボーダー | `border-stone-200` |

**ロゴ表記**: `<span className="text-orange-500">vs</span><span className="text-stone-900"> navi</span>`

---

## 6. ドメインモデル(Firestore)

```
hosts/{uid}                       # 主催者プロフィール
  presets/{id}                    # 大会設定プリセット(最大5)

tournaments/{tid}                 # 大会本体
  players/{pid}                   # 参加者(prox/anon/Google混在)
  matches/{mid}                   # マッチ(games[]でBO対応)
  queue/{qid}                     # マッチング待ち
```

詳細は `src/lib/types.ts` を見る。

### 重要なフィールド
- `Player.googleUid`: nullの場合は匿名参加。あるとマイページから大会復帰可能
- `Player.isProxy`: 代理エントリー(スマホなし参加者をホストが入力)
- `Match.bestOf`: 1/3/5、`games[]` 配列に各ゲーム結果
- `Match.status`: 'ongoing' | 'finished'(これでマッチング対象/UI判定)
- `Match.bufferUntil`: 感想戦バッファ。これが切れるまで卓占有
- `Match.retainTable`: 卓キープ時のテーブル番号

---

## 7. 主要ドメインロジック

### マッチング(`tryMatchAllPlayers`)
1. キューを古い順に取得
2. 卓の空き状況計算
3. クールダウン考慮で再戦回避
   - 10人以上: 直近2戦回避
   - 5〜9人: 直近1戦回避
   - 4人以下: 制限なし
4. 卓キープ中なら同じ卓に
5. マッチ作成 + キュー削除

### 結果報告(`reportResult` / `reportGameResult`)
**全部 Firestore Transaction でアトミック化済み**。冪等性ガード(status === 'finished' なら no-op)も組み込み。詳細は `matchingService.ts` の `finalizeMatchInTx` ヘルパー。

### 席ルール(`handleSeatKeep`)
- `winner-stays`: 勝者が卓キープ、敗者離席
- `loser-stays`: 敗者が卓キープ(25秒カウントダウン)、勝者離席
- `both-leave`: 両者離席、新しい卓へ

連勝制限あり(`streakLimit`)。N連勝/連敗で強制離席。

### 順位(`Ranking.tsx` の `calcOmw`)
ポケカ公式準拠の OMW% 計算。下限25%。

---

## 8. セキュリティ(`firestore.rules`)

直近で強化済み。要点:
- `tournaments` の update/delete は **hostUid == auth.uid のみ**
- `hostUid` は **immutable**(乗っ取り防止)
- `players/matches` は識別フィールド(`entryNumber`, `player1Id`, etc)が immutable
- 初期stats(wins=0等)を作成時に強制
- 文字列長検証あり(name 100文字 / displayName 50文字)
- `hosts/{uid}/presets/*` は本人のみ読み書き

**残る制約**: クライアント側完結のため、参加プレイヤー間での結果改竄は完全には防げない。Cloud Functions 入れない限り。

---

## 9. 既知の挙動・gotchas

### 認証
- プレイヤーは Google or 匿名で sign-in
- 匿名は端末バウンド(localStorage)、別端末では復帰不可
- Google認証ユーザーは Player.googleUid に保存、別端末からマイページ経由で復帰可
- `auth.currentUser` は初期マウント時 null の可能性 → `useAuth()` の `loading` を待つ(PlayerEntryで実装済み)

### マッチング
- ホスト+プレイヤーが両方ポーリング(1.5秒/3秒間隔)
- ホストオフラインでもプレイヤー側でマッチ成立する
- `matchingInProgress` のローカルロックで同時実行防止

### BOマッチ
- ゲームごとに `reportGameResult` 呼ぶ
- 勝利数足りたら自動 finalize
- 進行中のみ修正可能(完了後は HostManage の `updateMatchWinner` 経由)

### タイマー
- 通常は分単位、テストモードは 1/60(秒)に短縮
- マッチ開始時に `Timer.endTime` 固定(クライアント時刻ベース)

### Firestore Transaction の制約
- すべての read が write より先
- 1トランザクション500ドキュメント上限
- queries(`getDocs`)は使えない、`get(docRef)` のみ
- 再試行時に `Date.now()` が新しい値を返す = OK

---

## 10. デプロイ手順

```bash
npm run build              # tsc -b && vite build
npx firebase deploy --only hosting           # 通常
npx firebase deploy --only firestore:rules   # ルール変更時
```

CIなし、手動デプロイ。本番=Firebase Hosting(`gunmatch-app`プロジェクト)。

---

## 11. 最近の主要変更履歴(commit前のドラフト含む)

- vs navi にリブランド + ロゴ(favicon)変更
- ライトテーマに全面移行(slate→stone/orange)
- 参加大会復帰バナー追加(HostList)
- PlayerEntry の認証ロード待ち修正(QR復帰の白画面問題)
- Firestore ルール強化(主催者乗っ取り防止等)
- マッチ結果報告を Transaction 化(無限勝利数バグ修正)
- 連勝(`currentStreak`/`maxStreak`)対応
- カードゲーム別バッジ(24タイトル + その他)
- BO1/BO3/BO5 対応
- プリセット機能
- 卓ルール3種類
- Google認証連携(後付けリンクも対応)

詳細は `git log`。

---

## 12. 未完タスク / 検討中

| 優先 | タスク | 備考 |
|---|---|---|
| 中 | Firebase プロジェクト名を `vs-navi` 系に変更 | データ移行必須、影響大 |
| 中 | GitHub リポ名を `vs-navi` に変更 | コラボなければリスク低い |
| 低 | 正式ロゴ(claude.ai経由で作る予定) | 今は文字ロゴ |
| 低 | OGP画像 | SNSシェア時に重要 |
| 低 | Firebase App Check 導入 | ボット保護 |
| 低 | Cloud Functions 化 | Blazeプラン化が前提、結果改竄を完全防止 |
| 低 | Code splitting | ビルドサイズ警告対応 |
| 低 | 大会名長すぎ時のUI調整 | truncate 入れてあるが確認したい |

### 既知の細かい改善ポイント
- `correctGameResult` で完了済みマッチを修正しようとした場合の処理(現状 no-op、UIで防いでる)
- Match correction時の streak 再計算(現状やってない、本質的に難しい)
- 大会作成時のテストモードフラグはプリセットに含まれない仕様

---

## 13. オーケストレーション方針(中谷さん指示)

- メインの会話・設計は監督役、実装は係(サブエージェント)に振る
- 係への手渡し情報は監督がまとめる(係は前会話を引き継がない)
- 「調査(explorer) → 実装(night-implementer) → レビュー(code-reviewer)」を必要に応じて

詳細は `~/.claude/CLAUDE.md` (グローバル設定)を参照。

---

## 14. 連絡先・参照

- Firebase Console: https://console.firebase.google.com/project/gunmatch-app
- 本番URL: https://gunmatch-app.web.app
- 開発者: めし(intel705n@gmail.com)

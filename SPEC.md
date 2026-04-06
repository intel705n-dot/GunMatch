# GunMatch 仕様書

## 概要

GunMatch は、ポケモンカードゲームのガンスリンガー形式イベント向けリアルタイムマッチング＆対戦管理Webアプリケーション。ホスト（主催者）が大会を作成し、プレイヤーがQRコードでエントリー、リアルタイムでマッチングと勝敗管理を行う。

- **本番URL**: https://gunmatch-app.web.app
- **Firebase Project**: gunmatch-app
- **Firestore Region**: asia-northeast1 (Tokyo)

---

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フロントエンド | React 19 + TypeScript + Vite |
| スタイリング | Tailwind CSS v4 |
| バックエンド | Firebase (Firestore, Authentication, Hosting) |
| QRコード | qrcode.react |
| ルーティング | react-router-dom v7 |

---

## ディレクトリ構成

```
gunmatch/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── Layout.tsx          # 共通レイアウト（ダークネイビー基調）
│   │   ├── Timer.tsx           # カウントダウンタイマー
│   │   ├── QRCodeDisplay.tsx   # QRコード表示・PNGダウンロード
│   │   └── Ranking.tsx         # ランキング表示（OMW%対応）
│   ├── lib/
│   │   ├── firebase.ts         # Firebase初期化
│   │   ├── types.ts            # 型定義
│   │   ├── AuthContext.tsx      # 認証コンテキスト
│   │   ├── matchingService.ts   # マッチングロジック
│   │   └── dummyNames.ts       # テスト用ダミーネーム（232種）
│   ├── pages/
│   │   ├── host/
│   │   │   ├── HostLogin.tsx    # ホストログイン
│   │   │   ├── HostList.tsx     # 大会一覧（マイページ）
│   │   │   ├── HostProfile.tsx  # ホストプロフィール
│   │   │   ├── HostCreate.tsx   # 大会作成
│   │   │   └── HostManage.tsx   # 大会管理
│   │   └── player/
│   │       ├── PlayerEntry.tsx  # プレイヤーエントリー
│   │       └── PlayerMain.tsx   # プレイヤーメイン画面
│   ├── main.tsx
│   └── index.css
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── .env
└── .env.example
```

---

## ルーティング

| パス | 画面 | 説明 |
|------|------|------|
| `/` | HostLogin | ホストログイン（トップページ） |
| `/host/login` | HostLogin | ホストログイン |
| `/host` | HostList | 大会一覧 |
| `/host/profile` | HostProfile | ホストマイページ |
| `/host/create` | HostCreate | 大会作成 |
| `/host/:tournamentId` | HostManage | 大会管理 |
| `/entry/:tournamentId` | PlayerEntry | プレイヤーエントリー |
| `/play/:tournamentId` | PlayerMain | プレイヤーメイン画面 |

---

## Firestoreデータモデル

### `hosts/{uid}`
| フィールド | 型 | 説明 |
|-----------|-----|------|
| displayName | string | ホストのハンドルネーム |
| updatedAt | Timestamp | 更新日時 |

### `tournaments/{tournamentId}`
| フィールド | 型 | 説明 |
|-----------|-----|------|
| hostUid | string | ホストのFirebase UID |
| hostName | string | ホストのハンドルネーム（作成時スナップショット） |
| name | string | 大会名 |
| description | string | ルール・告知文 |
| tableCount | number | 卓数 |
| timerMinutes | number | 対戦タイマー（分） |
| matchingDeadline | Timestamp \| null | マッチング締切（未使用） |
| afterBattleBuffer | number | 感想戦バッファ（分） |
| matchingTimeout | number | マッチングタイムアウト（分） |
| entryOpen | boolean | エントリー受付中か |
| status | 'waiting' \| 'active' \| 'finished' | 大会ステータス |
| isTest | boolean | テストモードか |
| createdAt | Timestamp | 作成日時 |

### `tournaments/{tournamentId}/players/{playerId}`
| フィールド | 型 | 説明 |
|-----------|-----|------|
| entryNumber | number | エントリー番号 |
| displayName | string | ハンドルネーム |
| xId | string \| null | X（Twitter）ID |
| wins | number | 勝利数 |
| losses | number | 敗北数 |
| isProxy | boolean | 代理エントリーか |
| dropped | boolean | ドロップ（棄権）したか |
| createdAt | Timestamp | エントリー日時 |

### `tournaments/{tournamentId}/matches/{matchId}`
| フィールド | 型 | 説明 |
|-----------|-----|------|
| player1Id | string | プレイヤー1のID |
| player2Id | string | プレイヤー2のID |
| tableNumber | number | 対戦卓番号 |
| status | 'ongoing' \| 'finished' | マッチステータス |
| winnerId | string \| null | 勝者のプレイヤーID |
| timerSeconds | number | タイマー秒数 |
| startedAt | Timestamp | 開始日時 |
| finishedAt | Timestamp \| null | 終了日時 |
| bufferUntil | Timestamp \| null | 感想戦バッファ終了時刻 |

### `tournaments/{tournamentId}/queue/{queueId}`
| フィールド | 型 | 説明 |
|-----------|-----|------|
| playerId | string | 待機中プレイヤーのID |
| joinedAt | Timestamp | キュー参加日時 |

---

## 認証

### ホスト認証
- **Googleアカウント連携**: `signInWithPopup` でワンクリックログイン
- **メール/パスワード**: 新規登録 & ログインの2モード
- 認証状態は `AuthContext` でアプリ全体に提供
- 未認証時は `/host/login` にリダイレクト

### プレイヤー認証
- **匿名認証**: エントリー時に `signInAnonymously` で自動認証
- **セッション管理**: `localStorage` にプレイヤーIDを保存
- **再ログイン**: X IDで既存プレイヤーを検索して復元

---

## 機能詳細

### ホスト側

#### ログイン (`/host/login`)
- Googleアカウント連携ボタン
- メール/パスワードによるログイン・新規登録タブ切替
- ログイン済みの場合は `/host` にリダイレクト

#### マイページ (`/host/profile`)
- ハンドルネームの表示・編集（Firestoreの `hosts` コレクションに保存）
- ログイン情報表示（メールアドレス、認証方法、UID）
- ログアウトボタン

#### 大会一覧 (`/host`)
- ヘッダー: 「GunMatch (ベータ版)」タイトル + ホスト名 + 新規作成ボタン + マイページアイコン
- タブ切替: **開催中** / **開催前** / **終了** / **テスト**
  - テスト大会はテストタブにのみ表示（通常タブには非表示）
- 各大会カードに「編集」「削除」ボタン
  - 削除: 確認ダイアログ → サブコレクション全削除 → 大会ドキュメント削除
- 自分が作成した大会のみ表示（`hostUid` でフィルタ）

#### 大会作成 (`/host/create`)
- 入力項目: 大会名、ルール・告知文、卓数、対戦タイマー、感想戦バッファ、マッチングタイムアウト、テストモード
- 作成完了後にQRコード表示（PNGダウンロード可能）
- 大会に `hostUid` と `hostName` を自動保存

#### 大会管理 (`/host/:tournamentId`)
- **エントリー開閉**: エントリー開始/締め切りボタン
- **QRコード表示**: エントリーURL用QRコード
- **設定変更**: 感想戦バッファ・マッチングタイムアウトをリアルタイム変更
- **代理エントリー**: ハンドルネーム入力で追加
- **進行中マッチ一覧**: 卓番号・対戦者名・カウントダウンタイマー表示
- **参加者/ランキング切替タブ**:
  - 参加者: エントリー番号順の一覧（名前、X ID、W/L）
  - ランキング: 勝利数→勝率→OMW%順
- **完了マッチ一覧**: 勝敗修正ボタン付き
- **大会終了ボタン**: キュー全消去 + ステータス変更

#### テストモード
- テストモード有効時のみ表示される操作パネル
- ダミープレイヤー一括追加（232種類のニックネームからランダム選択）
- 全ダミープレイヤーをキュー投入
- 勝敗自動登録（ランダム勝敗）
- プレイヤー画面プレビューリンク
- タイマー短縮（分→秒に自動変換）

### プレイヤー側

#### エントリー (`/entry/:tournamentId`)
- 大会名・主催者名・ルール表示
- **新規エントリー**: ハンドルネーム（必須）+ X ID（任意）
- **再ログイン**: X IDで既存プレイヤーを検索
- エントリー未開始時は待機画面表示
- エントリー済みの場合は `/play` にリダイレクト

#### メイン画面 (`/play/:tournamentId`)
- **ヘッダー**: 大会名・主催者名・ルール + 退室ボタン
- **戦績表示**: WIN / LOSE カウント
- **マッチング**:
  - 「マッチング開始」ボタン → キュー投入
  - 待機中アニメーション + キャンセルボタン
  - マッチングタイムアウト時は自動キャンセル
  - マッチ成立時にバイブレーション通知
- **対戦中画面**:
  - 卓番号表示
  - 対戦相手名
  - カウントダウンタイマー（残60秒で赤く点滅）
  - 「自分が勝った」「相手が勝った」ボタン
- **大会終了後**: 戦績/ランキング タブ切替
- **戦績履歴**: 全対戦の一覧（対戦相手名、WIN/LOSE表示）

---

## ランキングシステム

### 順位決定ロジック（優先度順）
1. **勝利数**（多い順）
2. **勝率**（勝利数 / 総対戦数）
3. **OMW%**（Opponent Match Win %: 対戦相手の平均勝率、下限25%）

### OMW%計算
- 各プレイヤーの対戦相手全員の勝率を収集
- 各相手の勝率に25%の下限を適用（ポケカ公式準拠）
- 全相手の勝率の平均値がそのプレイヤーのOMW%

### 表示
- ランキングテーブル: 順位、プレイヤー名、W、L、勝率、OMW%
- 上位3名にメダルアイコン（🥇🥈🥉）
- SNS共有向けヘッダー（大会名・日付・順位）

---

## マッチングロジック

1. プレイヤーが「マッチング開始」→ `queue` コレクションに追加
2. ホスト管理画面が2秒間隔でポーリング
3. キューに2人以上 & 空き卓があればマッチ成立
4. キューから先着順（`joinedAt`）で2人を取り出し
5. 空き卓を自動割り当て（進行中マッチ + バッファ中の卓を除外）
6. `matches` コレクションにマッチを作成、`queue` から削除

---

## Firestoreセキュリティルール

- **hosts**: 本人のみ書き込み可、誰でも読み取り可
- **tournaments**: 認証済みユーザーが作成（`hostUid == auth.uid` 検証）、本人のみ削除可
- **players/matches**: 認証済みユーザーが作成・更新・削除可、誰でも読み取り可
- **queue**: 認証済みユーザーが読み書き・削除可

---

## Firestoreインデックス

| コレクション | フィールド | 順序 |
|------------|-----------|------|
| tournaments | hostUid (ASC) + createdAt (DESC) | 複合インデックス |

---

## 環境変数

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

---

## デプロイ

```bash
npm run build
firebase deploy
```

- **Hosting**: `dist/` ディレクトリを配信、SPA rewrite対応
- **キャッシュ**: `index.html` はno-cache、`/assets/**` は長期キャッシュ（immutable）
- **Firestore Rules & Indexes**: `firebase deploy` で同時デプロイ

---

## 画面フロー

```
[ホスト]
ログイン → 大会一覧 → 新規作成 → QRコード表示
                    → 大会管理 → エントリー開始 → マッチング監視 → 大会終了
                    → マイページ → ハンドルネーム編集 / ログアウト

[プレイヤー]
QRスキャン → エントリー → マッチング開始 → 対戦 → 勝敗登録 → (繰り返し)
                                                      → 大会終了 → ランキング確認
```

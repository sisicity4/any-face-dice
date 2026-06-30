# 🎲 AnyFaceDice

> 集合写真から「次やる人」をランダムに1人選ぶ、ブラウザだけで動く顔ルーレット。
> **画像は端末内だけで処理され、サーバーには一切送信されません。**

**🔗 ライブデモ: https://any-face-dice.vercel.app/😃🎲/**

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![MediaPipe](https://img.shields.io/badge/MediaPipe-Tasks%20Vision-0097A7)
![On-device](https://img.shields.io/badge/Privacy-On--device%20only-2EAD33)

<!-- TODO: ここに操作のGIF（写真選択→顔検出→ダイスで1人選出）を貼る。docs/assets/demo.gif -->

---

## これは何？

飲み会・パーティ・教室などで「じゃあ次は誰がやる？」を決めるための、軽いブラウザゲームです。

1. カメラで撮るか、手元の集合写真を選ぶ
2. 写真の中の顔を自動で検出する
3. ダイスを振るように、検出された顔から**ランダムに1人**を選ぶ

選ばれた顔は中央に大きくクロップ表示され、誰が当たったか一目で分かります。

## なぜ作ったか / こだわり

- **プライバシーを最優先**: 顔という最もセンシティブな画像を扱うので、**画像は端末から外に出さない**設計にしました。顔検出（MediaPipe）も推論モデルもブラウザ内（WASM）で完結し、アップロード用のサーバーを持ちません。
- **インストール不要**: URLを開くだけ。アプリストアもアカウント登録もなしで、その場の全員がすぐ使えます。
- **"公平にランダム"を体験として見せる**: ただ番号を出すのではなく、ダイス演出と顔クロップで「選ばれた感」を出しています。

## 技術構成

| 領域 | 使用技術 | 役割 |
| --- | --- | --- |
| UI | React 19 / TypeScript | 状態管理・画面構成 |
| ビルド | Vite 7 | 開発サーバー・本番ビルド |
| 顔検出 | `@mediapipe/tasks-vision`（BlazeFace short-range, WASM） | 画像内の顔バウンディングボックス検出 |
| 画像処理 | Canvas API | 顔を中心に正方形クロップ |
| 配信 | Vercel / GitHub Pages | 静的ホスティング |

### 処理の流れ

1. ユーザーが写真を選ぶ／撮る（`File` → `HTMLImageElement`）
2. MediaPipe FaceDetector が顔を検出（スコア・サイズで信頼度の低い顔を除外）
3. ダイスを振ると、検出済みの顔候補から1つを抽選
4. `cropFaceToCanvas` が当選した顔を正方形にクロップして表示

すべて `fetch` で外部に画像を送らず、ブラウザのメモリ上だけで処理が完結します。

## ローカルで動かす

```bash
npm install
npm run dev      # 開発サーバー
npm run build    # 本番ビルド
npm run preview  # ビルド結果をローカル確認
```

## デプロイ

| 配信先 | コマンド | 公開URL |
| --- | --- | --- |
| Vercel | `vercel deploy --prod` | `https://any-face-dice.vercel.app/😃🎲/` |
| GitHub Pages | `npm run deploy`（`dist` を `gh-pages` ブランチへ） | `/😃🎲/` |

## 補足: リポジトリ名と公開パスが違う理由

GitHub のリポジトリ名は `any-face-dice`、公開アドレスの base path は `/😃🎲/` です。これは意図的な設計です。

- リポジトリ名は npm / Vite / CLI / shell でトラブルが起きない ASCII に保つ
- 公開アドレスにはアプリの identity（emoji）を残す

Vite の `base` は既定で `/😃🎲/`。ユーザーが明示的に変更を求めない限り、この base は変更しません（詳細は [AGENTS.md](./AGENTS.md)）。

```ts
base: process.env.VITE_BASE_PATH ?? "/😃🎲/",
```

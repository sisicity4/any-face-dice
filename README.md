# AnyFaceDice

顔を撮影、または写真を選択して、検出された顔からランダムに1人を選ぶブラウザゲームです。

画像は端末内だけで処理され、サーバーには送信されません。

## Repository Name and Public Address

GitHub repository name:

```text
any-face-dice
```

Published GitHub Pages base path:

```text
/😃🎲/
```

この違いは意図的です。

理由:

- npm / Vite / CLI / shellでトラブルが少ない
- アプリ名 `AnyFaceDice` と対応が分かりやすい
- 公開アドレスにはemoji identityを残せる

このルールは [AGENTS.md](./AGENTS.md) にも記録しています。

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Preview Built Site

```bash
npm run build
npm run preview
```

## GitHub Pages

Vite baseは既定で `/😃🎲/` です。

```ts
base: process.env.VITE_BASE_PATH ?? "/😃🎲/",
```

リポジトリ名が `any-face-dice` でも、公開アドレスのbase pathは `/😃🎲/` のままです。ユーザーが明示的に公開アドレス変更を求めない限り、このbaseを変更しないでください。

デプロイ直前の確認:

```bash
npm run build
```

実際に公開する時:

```bash
npm run deploy
```

`npm run deploy` は `dist` を `gh-pages` ブランチへ送ります。公開先のPages設定はGitHub側で `gh-pages` ブランチを参照するように設定してください。

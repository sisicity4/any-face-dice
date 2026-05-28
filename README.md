# AnyFaceDice

顔を撮影、または写真を選択して、検出された顔からランダムに1人を選ぶブラウザゲームです。

画像は端末内だけで処理され、サーバーには送信されません。

## Recommended Repository Name

おすすめは `any-face-dice` です。

理由:

- GitHub PagesのURLが扱いやすい
- npm / Vite / CLI / shellでトラブルが少ない
- アプリ名 `AnyFaceDice` と対応が分かりやすい

emojiの雰囲気は、リポジトリ説明やREADME、ページ内タイトルで出すのがおすすめです。

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## GitHub Pages

現在のVite baseは既定で `/😃🎲/` です。

`any-face-dice` というリポジトリで公開する場合は、`vite.config.ts` のbaseを次のように変更してください。

```ts
base: process.env.VITE_BASE_PATH ?? "/any-face-dice/",
```

またはビルド時に環境変数で指定できます。

```bash
VITE_BASE_PATH=/any-face-dice/ npm run build
```

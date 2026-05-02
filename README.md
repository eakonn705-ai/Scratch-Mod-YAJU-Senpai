# ScratchMod JP

Scratch-HTMLをベースにしたカスタムModです。  
sb3ファイルを読み込み、**編集・実行**が可能です。

## 機能

- 📂 **sb3読み込み** — ドラッグ＆ドロップ or ボタンから読み込み
- ▶ **実行** — 緑フラグと同等の実行
- ✏️ **ブロック表示・編集** — スプライトごとのブロック一覧
- 💾 **sb3保存** — 編集後にsb3として書き出し
- 🌐 **独自拡張ブロック** — インターネット取得（時刻・天気・為替・APIなど）

## 独自ブロック一覧（🌐 ネット取得）

| ブロック | 説明 |
|---------|------|
| `現在の[時刻/日付/...]を取得` | 現在時刻・日付・曜日など |
| `[都市名]の[天気/気温/...]を取得` | Open-Meteo API（無料・APIキー不要） |
| `[FROM]→[TO]の為替レート` | open.er-api.com（無料） |
| `[URL]をGETして取得` | 任意URLのHTMLテキストを取得 |
| `[URL]のJSONから[KEY]を取得` | JSONのフィールドをドット記法で取得 |

## GitHub Pages で公開する方法

1. このフォルダをGitHubリポジトリにpush
2. Settings → Pages → Source: `main` branch / `/(root)`
3. 公開URLにアクセスすれば完成

```bash
git init
git add .
git commit -m "ScratchMod JP 初回コミット"
git remote add origin https://github.com/yourname/scratch-mod-jp.git
git push -u origin main
```

## ファイル構成

```
scratch-mod/
├── index.html       # メインHTML
├── style.css        # スタイル
├── js/
│   └── mod.js       # メインJS（VM統合・拡張ブロック）
└── README.md
```

## 技術仕様

- **scratch-vm** `3.19.5`（CDN経由）
- **JSZip** `3.10.1`（CDN経由、sb3解析用）
- **Open-Meteo API**（天気、APIキー不要）
- **Open Exchange Rates API**（為替、APIキー不要）

## ライセンス

Scratch VMは [Apache 2.0](https://github.com/scratchfoundation/scratch-vm/blob/develop/LICENSE)  
このModのコード部分は MIT License

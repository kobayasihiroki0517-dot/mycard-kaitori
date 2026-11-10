# MyCard シングル買取表

管理シート（Googleスプレッドシート）の「買取表」シートで掲載「○」にしたカードから、次の3つを自動で作成します。

- X用の縦長画像（`x_1.png` …、Xへの自動投稿も可）
- A4縦の印刷用PDF（`kaitori.pdf`）
- お客様向けのWebページ（`index.html`、GitHub Pagesで公開）

## 動かし方
- スプレッドシート上部の「買取表ツール」→「買取表を更新」
- GitHubの「Actions」→「買取表を作成」→「Run workflow」
- 定時実行は `.github/workflows/kaitori.yml` の `schedule` の # を外して時刻を設定

## 必要なSecrets（Settings → Secrets and variables → Actions）
| 名前 | 内容 |
|---|---|
| SHEET_CSV_URL | 「買取表」シートをウェブに公開したCSVのURL |
| X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET | MyCardのXアカウントのAPIキー（投稿する場合のみ） |

## ファイル
- `build.py` 作成処理 / `render.py` 画像・PDFのデザイン / `web.py` Webページのデザイン / `post_x.py` X投稿
- `config.yml` X投稿の本文 / `logo_h.png` 支給ロゴ（無加工） / `fonts/` 英数字フォント（Lato）
- `gas/買取表ツール.gs` スプレッドシートに組み込むスクリプト
